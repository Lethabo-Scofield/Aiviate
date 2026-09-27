"""DB-backed job queue with a local executor.

Long-running work (bulk geocoding, matrix generation, optimisation,
re-optimisation, imports, notifications, escalation) runs through here so HTTP
requests never block on it. Jobs expose queued/running/completed/failed/
cancelled with progress, error details and retry counts.

The local executor is deterministic in eager mode (used by tests and the
simulation) and thread-based otherwise. A Celery/Redis adapter can implement
the same ``enqueue`` contract without touching callers — see README.
"""

from __future__ import annotations

import threading
import traceback
from collections.abc import Callable
from typing import Any

from sqlalchemy.orm import Session, sessionmaker

from aiviate.db import tables as t
from aiviate.domain.enums import JobStatus
from aiviate.domain.models import utc_now
from aiviate.observability import get_correlation_id, get_logger, log_ctx, metrics

logger = get_logger(__name__)

JobHandler = Callable[[Session, dict[str, Any]], dict[str, Any]]


class JobQueue:
    def __init__(self, session_factory: sessionmaker[Session], eager: bool = True) -> None:
        self._session_factory = session_factory
        self._eager = eager
        self._handlers: dict[str, JobHandler] = {}

    def register(self, job_type: str, handler: JobHandler) -> None:
        self._handlers[job_type] = handler

    def enqueue(
        self,
        job_type: str,
        payload: dict[str, Any],
        organisation_id: str | None = None,
        max_retries: int = 2,
    ) -> str:
        if job_type not in self._handlers:
            raise ValueError(f"no handler registered for job type '{job_type}'")
        session = self._session_factory()
        try:
            row = t.JobRow(
                organisation_id=organisation_id,
                job_type=job_type,
                payload=payload,
                max_retries=max_retries,
                correlation_id=get_correlation_id(),
            )
            session.add(row)
            session.commit()
            job_id = row.id
        finally:
            session.close()
        metrics.increment(f"jobs.enqueued.{job_type}")

        if self._eager:
            self._execute(job_id)
        else:
            threading.Thread(target=self._execute, args=(job_id,), daemon=True).start()
        return job_id

    def status(self, job_id: str) -> dict[str, Any] | None:
        session = self._session_factory()
        try:
            row = session.get(t.JobRow, job_id)
            if row is None:
                return None
            return {
                "job_id": row.id,
                "organisation_id": row.organisation_id,
                "job_type": row.job_type,
                "status": row.status,
                "progress": row.progress,
                "result": row.result,
                "error": row.error,
                "retry_count": row.retry_count,
                "created_at": row.created_at.isoformat(),
                "started_at": row.started_at.isoformat() if row.started_at else None,
                "finished_at": row.finished_at.isoformat() if row.finished_at else None,
            }
        finally:
            session.close()

    def cancel(self, job_id: str) -> bool:
        session = self._session_factory()
        try:
            row = session.get(t.JobRow, job_id)
            if row is None or row.status != JobStatus.QUEUED:
                return False
            row.status = JobStatus.CANCELLED
            row.finished_at = utc_now()
            session.commit()
            return True
        finally:
            session.close()

    def _execute(self, job_id: str) -> None:
        while True:
            session = self._session_factory()
            try:
                row = session.get(t.JobRow, job_id)
                if row is None or row.status not in (JobStatus.QUEUED, JobStatus.RUNNING):
                    return
                row.status = JobStatus.RUNNING
                row.started_at = row.started_at or utc_now()
                session.commit()
                handler = self._handlers[row.job_type]
                try:
                    result = handler(session, dict(row.payload))
                    session.commit()  # handler-side writes
                    row.status = JobStatus.COMPLETED
                    row.result = result
                    row.progress = 1.0
                    row.finished_at = utc_now()
                    session.commit()
                    metrics.increment(f"jobs.completed.{row.job_type}")
                    return
                except Exception as exc:
                    session.rollback()
                    row = session.get(t.JobRow, job_id)
                    assert row is not None
                    row.error = f"{exc}\n{traceback.format_exc(limit=5)}"
                    row.retry_count += 1
                    if row.retry_count > row.max_retries:
                        row.status = JobStatus.FAILED
                        row.finished_at = utc_now()
                        metrics.increment(f"jobs.failed.{row.job_type}")
                        logger.error("job failed",
                                     extra=log_ctx(job_id=job_id, job_type=row.job_type,
                                                   error=str(exc)))
                        session.commit()
                        return
                    row.status = JobStatus.QUEUED  # retry
                    session.commit()
                    logger.warning("job retry",
                                   extra=log_ctx(job_id=job_id, attempt=row.retry_count))
            finally:
                session.close()
