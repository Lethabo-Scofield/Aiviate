import uuid
import traceback

from flask import request, jsonify, g

from routes import devices_bp
from middleware import require_auth, require_admin
from models import Device, Driver
from utils import get_db_session


@devices_bp.route("/api/devices", methods=["GET"])
@require_auth
@require_admin
def list_devices():
    db = get_db_session()
    try:
        devices = db.query(Device).filter(Device.company_id == g.company_id).all()
        driver_map = {d.id: d.name for d in db.query(Driver).filter(Driver.company_id == g.company_id).all()}
        return jsonify({
            "devices": [
                {**d.to_dict(), "driver_name": driver_map.get(d.driver_id)}
                for d in devices
            ]
        })
    finally:
        db.close()


@devices_bp.route("/api/devices", methods=["POST"])
@require_auth
@require_admin
def add_device():
    data = request.get_json() or {}
    name = (data.get("name") or "").strip()
    model = (data.get("model") or "Aiviate Mobile").strip()
    if not name:
        return jsonify({"error": "Device name is required"}), 400

    db = get_db_session()
    try:
        device = Device(
            id=f"DEV-{uuid.uuid4().hex[:6].upper()}",
            name=name,
            model=model,
            company_id=g.company_id,
        )
        db.add(device)
        db.commit()
        return jsonify({"success": True, "device": device.to_dict()}), 201
    except Exception:
        db.rollback()
        traceback.print_exc()
        return jsonify({"error": "Failed to add device"}), 500
    finally:
        db.close()


@devices_bp.route("/api/devices/<device_id>/assign", methods=["POST"])
@require_auth
@require_admin
def assign_device(device_id):
    data = request.get_json() or {}
    driver_id = data.get("driver_id")
    db = get_db_session()
    try:
        device = db.query(Device).filter(Device.id == device_id, Device.company_id == g.company_id).first()
        if not device:
            return jsonify({"error": "Device not found"}), 404
        if driver_id:
            driver = db.query(Driver).filter(Driver.id == driver_id, Driver.company_id == g.company_id).first()
            if not driver:
                return jsonify({"error": "Driver not found"}), 404
        device.driver_id = driver_id or None
        db.commit()
        return jsonify({"success": True, "device": device.to_dict()})
    except Exception:
        db.rollback()
        return jsonify({"error": "Failed to assign device"}), 500
    finally:
        db.close()


@devices_bp.route("/api/devices/<device_id>/ota", methods=["POST"])
@require_auth
@require_admin
def trigger_ota(device_id):
    db = get_db_session()
    try:
        device = db.query(Device).filter(Device.id == device_id, Device.company_id == g.company_id).first()
        if not device:
            return jsonify({"error": "Device not found"}), 404
        if device.ota_status == "up_to_date":
            return jsonify({"success": True, "device": device.to_dict(), "message": "Already up to date"})
        device.ota_status = "updating"
        db.commit()
        # Simulate completion
        device.ota_status = "up_to_date"
        device.firmware_version = "1.1.0"
        db.commit()
        return jsonify({"success": True, "device": device.to_dict()})
    except Exception:
        db.rollback()
        return jsonify({"error": "Failed to trigger OTA"}), 500
    finally:
        db.close()


@devices_bp.route("/api/devices/<device_id>", methods=["DELETE"])
@require_auth
@require_admin
def remove_device(device_id):
    db = get_db_session()
    try:
        device = db.query(Device).filter(Device.id == device_id, Device.company_id == g.company_id).first()
        if not device:
            return jsonify({"error": "Device not found"}), 404
        db.delete(device)
        db.commit()
        return jsonify({"success": True})
    except Exception:
        db.rollback()
        return jsonify({"error": "Failed to remove device"}), 500
    finally:
        db.close()
