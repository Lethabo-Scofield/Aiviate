"""Shared operational-context builder.

Lives outside the route layer so any caller (HTTP routes, background
workers, tests) can assemble the dict the orchestrator + agents expect.
"""
from models import Alert, Device, Driver, Job, SafetyEvent, Stop


def build_context(db, company_id):
    return {
        "company_id": company_id,
        "drivers": [
            {
                "id": d.id, "name": d.name, "blocked": bool(d.blocked),
                "status": d.status, "vehicle_type": d.vehicle_type,
                "current_lat": d.current_lat, "current_lng": d.current_lng,
            }
            for d in db.query(Driver).filter(Driver.company_id == company_id).all()
        ],
        "jobs": [
            {
                "id": j.id, "area": j.area, "status": j.status,
                "driver_id": j.driver_id, "driver_name": j.driver_name,
                "total_stops": j.total_stops, "total_distance_km": j.total_distance_km,
            }
            for j in db.query(Job).filter(Job.company_id == company_id).all()
        ],
        "stops": [s.to_dict() for s in db.query(Stop).join(Job)
                  .filter(Job.company_id == company_id).all()],
        "devices": [d.to_dict() for d in db.query(Device)
                    .filter(Device.company_id == company_id).all()],
        "safety_events": [e.to_dict() for e in db.query(SafetyEvent)
                          .filter(SafetyEvent.company_id == company_id).all()],
        "alerts": [a.to_dict() for a in db.query(Alert)
                   .filter(Alert.company_id == company_id).all()],
    }
