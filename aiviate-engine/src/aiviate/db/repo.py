"""Repositories: org-scoped persistence access and ORM↔domain mapping.

Every read helper takes an ``organisation_id`` and filters by it — tenant
isolation is enforced at the query layer, not left to callers.
"""

from __future__ import annotations

from collections.abc import Sequence
from typing import TypeVar

from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from aiviate.db import tables as t
from aiviate.domain import models as m

M = TypeVar("M", bound=BaseModel)


def to_domain(row: object, model: type[M]) -> M:
    return model.model_validate(row)


class OrderRepo:
    @staticmethod
    def save(session: Session, order: m.Order) -> t.OrderRow:
        row = session.get(t.OrderRow, order.id)
        data = order.model_dump()
        if row is None:
            row = t.OrderRow(**data)
            session.add(row)
        else:
            for key, value in data.items():
                setattr(row, key, value)
        return row

    @staticmethod
    def get(session: Session, organisation_id: str, order_id: str) -> m.Order | None:
        row = session.get(t.OrderRow, order_id)
        if row is None or row.organisation_id != organisation_id:
            return None
        return to_domain(row, m.Order)

    @staticmethod
    def by_external_ids(
        session: Session, organisation_id: str, external_ids: Sequence[str]
    ) -> set[str]:
        rows = session.execute(
            select(t.OrderRow.external_order_id).where(
                t.OrderRow.organisation_id == organisation_id,
                t.OrderRow.external_order_id.in_(list(external_ids)),
            )
        )
        return {r[0] for r in rows}

    @staticmethod
    def list(
        session: Session,
        organisation_id: str,
        statuses: Sequence[str] | None = None,
        ids: Sequence[str] | None = None,
    ) -> list[m.Order]:
        stmt = select(t.OrderRow).where(t.OrderRow.organisation_id == organisation_id)
        if statuses:
            stmt = stmt.where(t.OrderRow.status.in_(list(statuses)))
        if ids:
            stmt = stmt.where(t.OrderRow.id.in_(list(ids)))
        return [to_domain(r, m.Order) for r in session.scalars(stmt)]


class DriverRepo:
    @staticmethod
    def save(session: Session, driver: m.Driver) -> t.DriverRow:
        row = session.get(t.DriverRow, driver.id)
        data = driver.model_dump()
        if row is None:
            row = t.DriverRow(**data)
            session.add(row)
        else:
            for key, value in data.items():
                setattr(row, key, value)
        return row

    @staticmethod
    def get(session: Session, organisation_id: str, driver_id: str) -> m.Driver | None:
        row = session.get(t.DriverRow, driver_id)
        if row is None or row.organisation_id != organisation_id:
            return None
        return to_domain(row, m.Driver)

    @staticmethod
    def list(session: Session, organisation_id: str) -> list[m.Driver]:
        stmt = select(t.DriverRow).where(t.DriverRow.organisation_id == organisation_id)
        return [to_domain(r, m.Driver) for r in session.scalars(stmt)]


class VehicleRepo:
    @staticmethod
    def save(session: Session, vehicle: m.Vehicle) -> t.VehicleRow:
        row = session.get(t.VehicleRow, vehicle.id)
        data = vehicle.model_dump()
        if row is None:
            row = t.VehicleRow(**data)
            session.add(row)
        else:
            for key, value in data.items():
                setattr(row, key, value)
        return row

    @staticmethod
    def get(session: Session, organisation_id: str, vehicle_id: str) -> m.Vehicle | None:
        row = session.get(t.VehicleRow, vehicle_id)
        if row is None or row.organisation_id != organisation_id:
            return None
        return to_domain(row, m.Vehicle)

    @staticmethod
    def list(session: Session, organisation_id: str) -> list[m.Vehicle]:
        stmt = select(t.VehicleRow).where(t.VehicleRow.organisation_id == organisation_id)
        return [to_domain(r, m.Vehicle) for r in session.scalars(stmt)]


class OrganisationRepo:
    @staticmethod
    def get(session: Session, organisation_id: str) -> m.Organisation | None:
        row = session.get(t.OrganisationRow, organisation_id)
        return to_domain(row, m.Organisation) if row else None


class PlanRepo:
    @staticmethod
    def save(session: Session, plan: m.DispatchPlan) -> t.DispatchPlanRow:
        row = session.get(t.DispatchPlanRow, plan.id)
        data = plan.model_dump()
        if row is None:
            row = t.DispatchPlanRow(**data)
            session.add(row)
        else:
            for key, value in data.items():
                setattr(row, key, value)
        return row

    @staticmethod
    def get(session: Session, organisation_id: str, plan_id: str) -> m.DispatchPlan | None:
        row = session.get(t.DispatchPlanRow, plan_id)
        if row is None or row.organisation_id != organisation_id:
            return None
        return to_domain(row, m.DispatchPlan)

    @staticmethod
    def routes(session: Session, plan_id: str) -> list[m.Route]:
        stmt = select(t.RouteRow).where(t.RouteRow.plan_id == plan_id)
        return [to_domain(r, m.Route) for r in session.scalars(stmt)]

    @staticmethod
    def stops(session: Session, route_id: str) -> list[m.RouteStop]:
        stmt = (
            select(t.RouteStopRow)
            .where(t.RouteStopRow.route_id == route_id)
            .order_by(t.RouteStopRow.sequence_number)
        )
        return [to_domain(r, m.RouteStop) for r in session.scalars(stmt)]

    @staticmethod
    def save_route(session: Session, route: m.Route) -> t.RouteRow:
        data = route.model_dump()
        data["start_location"] = route.start_location.model_dump()
        data["end_location"] = route.end_location.model_dump()
        row = session.get(t.RouteRow, route.id)
        if row is None:
            row = t.RouteRow(**data)
            session.add(row)
        else:
            for key, value in data.items():
                setattr(row, key, value)
        return row

    @staticmethod
    def save_stop(session: Session, stop: m.RouteStop) -> t.RouteStopRow:
        row = session.get(t.RouteStopRow, stop.id)
        data = stop.model_dump()
        if row is None:
            row = t.RouteStopRow(**data)
            session.add(row)
        else:
            for key, value in data.items():
                setattr(row, key, value)
        return row
