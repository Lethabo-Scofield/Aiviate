"""Persistence roundtrips and tenant scoping at the repository layer."""

from aiviate.db import tables as t
from aiviate.db.repo import DriverRepo, OrderRepo, VehicleRepo
from aiviate.domain import models as m
from tests.conftest import make_driver, make_order, make_vehicle


def test_order_roundtrip(session, organisation):
    order = make_order(organisation.id, "ORD-100", -26.2, 28.0)
    OrderRepo.save(session, order)
    session.commit()

    loaded = OrderRepo.get(session, organisation.id, order.id)
    assert loaded is not None
    assert loaded.external_order_id == "ORD-100"
    assert loaded.coordinate is not None
    assert loaded.delivery_window_start == order.delivery_window_start


def test_order_not_visible_to_other_org(session, organisation):
    other = m.Organisation(name="Other Org")
    session.add(t.OrganisationRow(**other.model_dump()))
    order = make_order(organisation.id, "ORD-101", -26.2, 28.0)
    OrderRepo.save(session, order)
    session.commit()

    assert OrderRepo.get(session, other.id, order.id) is None
    assert OrderRepo.list(session, other.id) == []


def test_external_id_lookup_scoped(session, organisation):
    OrderRepo.save(session, make_order(organisation.id, "ORD-102", -26.2, 28.0))
    session.commit()
    assert OrderRepo.by_external_ids(session, organisation.id, ["ORD-102", "ORD-999"]) == {"ORD-102"}
    assert OrderRepo.by_external_ids(session, "someone-else", ["ORD-102"]) == set()


def test_driver_and_vehicle_roundtrip(session, organisation):
    driver = make_driver(organisation.id, "Sipho D", -26.14, 28.04)
    vehicle = make_vehicle(organisation.id, "JHB-001-GP")
    DriverRepo.save(session, driver)
    VehicleRepo.save(session, vehicle)
    session.commit()

    assert DriverRepo.get(session, organisation.id, driver.id).name == "Sipho D"
    assert VehicleRepo.get(session, organisation.id, vehicle.id).maximum_weight == 800.0
    assert DriverRepo.get(session, "other", driver.id) is None
