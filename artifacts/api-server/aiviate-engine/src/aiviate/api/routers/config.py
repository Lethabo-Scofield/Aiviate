"""Runtime configuration endpoints for the co-located backend.

Lets the trusted backend point the organisation's single depot at the centroid
of the current batch before planning, so routes anchor near the stops being
optimised rather than at a fixed location.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified

from aiviate.api import deps
from aiviate.db import tables as t

router = APIRouter(prefix="/api/v1/config", tags=["config"])


class DepotIn(BaseModel):
    latitude: float = Field(ge=-90.0, le=90.0)
    longitude: float = Field(ge=-180.0, le=180.0)


@router.put("/depot")
def set_depot(
    body: DepotIn,
    principal: deps.Principal = Depends(deps.require_admin),
    session: Session = Depends(deps.get_session),
):
    org = session.get(t.OrganisationRow, principal.organisation_id)
    if org is None:
        raise HTTPException(status_code=404, detail="Organisation not found.")
    rules = dict(org.operating_rules or {})
    rules["depots"] = [{"latitude": body.latitude, "longitude": body.longitude}]
    org.operating_rules = rules
    flag_modified(org, "operating_rules")
    return {"depots": rules["depots"]}
