import os
import csv
import uuid
import traceback
import time as time_module

import openpyxl
import requests as http_requests
from flask import request, jsonify, g
from geopy.geocoders import Nominatim

from routes import optimization_bp
from middleware import require_auth, require_admin
from models import Stop, Job
from optimize_route import geocode_address, build_distance_matrix, solve_tsp, DEPOT
from utils import cluster_stops, determine_area_name, load_test_stops, get_db_session
from config import UPLOAD_FOLDER


def _read_csv(filepath):
    rows = []
    with open(filepath, "r", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        for row in reader:
            rows.append(dict(row))
    return rows


def _read_excel(filepath):
    wb = openpyxl.load_workbook(filepath, read_only=True, data_only=True)
    ws = wb.active
    rows_iter = ws.iter_rows(values_only=True)
    headers = [str(h).strip() if h else f"col_{i}" for i, h in enumerate(next(rows_iter))]
    rows = []
    for row_vals in rows_iter:
        row_dict = {}
        for i, val in enumerate(row_vals):
            if i < len(headers):
                row_dict[headers[i]] = val if val is not None else ""
        rows.append(row_dict)
    wb.close()
    return rows


def _normalize_rows(rows):
    if not rows:
        raise ValueError("File is empty")

    first_row_keys = list(rows[0].keys())
    has_full_address = "Full_Address" in first_row_keys
    has_address = any(k.lower() == "address" for k in first_row_keys)

    if not has_full_address and not has_address:
        raise ValueError(f"File must contain a 'Full_Address' or 'address' column. Found: {first_row_keys}")

    if not has_full_address and has_address:
        addr_col = next(k for k in first_row_keys if k.lower() == "address")
        for row in rows:
            row["Full_Address"] = row.pop(addr_col, "")

    for i, row in enumerate(rows):
        row.setdefault("Order_ID", f"ORD-{i+1:03d}")
        row.setdefault("Customer_Name", f"Customer {i+1}")
        row.setdefault("Demand", 1)
        row.setdefault("Service_Time", 15)
        row.setdefault("Phone", "")
        row.setdefault("Notes", "")
        row.setdefault("Time_Window_Start", "")
        row.setdefault("Time_Window_End", "")

    return rows


def _safe_int(val, default):
    if val is None or val == "":
        return default
    try:
        return int(float(val))
    except (ValueError, TypeError):
        return default


def _safe_str(val):
    if val is None:
        return ""
    s = str(val).strip()
    return "" if s.lower() == "nan" else s


def _geocode_rows(rows):
    geolocator = Nominatim(user_agent="aiviate-dispatch-mvp", timeout=10)
    stops_data = []
    failed = []

    for idx, row in enumerate(rows):
        addr = _safe_str(row.get("Full_Address", ""))
        if not addr:
            failed.append({"row": idx + 2, "address": addr, "reason": "Empty address"})
            continue

        lat, lng = geocode_address(addr, geolocator)

        if lat == DEPOT["lat"] and lng == DEPOT["lng"]:
            failed.append({"row": idx + 2, "address": addr, "reason": "Could not geocode"})
            continue

        stop_dict = {
            "id": str(uuid.uuid4().hex[:8]),
            "order_id": _safe_str(row.get("Order_ID", f"ORD-{idx+1:03d}")),
            "customer_name": _safe_str(row.get("Customer_Name", f"Customer {idx+1}")),
            "address": addr,
            "lat": lat,
            "lng": lng,
            "demand": _safe_int(row.get("Demand"), 1),
            "time_window_start": _safe_str(row.get("Time_Window_Start", "")),
            "time_window_end": _safe_str(row.get("Time_Window_End", "")),
            "service_time": _safe_int(row.get("Service_Time"), 15),
            "phone": _safe_str(row.get("Phone", "")),
            "notes": _safe_str(row.get("Notes", "")),
        }
        stops_data.append(stop_dict)
        time_module.sleep(1.1)

    return stops_data, failed


@optimization_bp.route("/api/upload", methods=["POST"])
@require_auth
@require_admin
def upload_excel():
    if "file" not in request.files:
        return jsonify({"error": "No file provided"}), 400

    file = request.files["file"]
    if not file.filename:
        return jsonify({"error": "No file selected"}), 400

    ext = file.filename.rsplit(".", 1)[-1].lower()
    if ext not in ("xlsx", "xls", "csv"):
        return jsonify({"error": "Unsupported file type. Upload .xlsx, .xls, or .csv"}), 400

    filepath = os.path.join(UPLOAD_FOLDER, f"upload_{uuid.uuid4().hex[:8]}.{ext}")
    file.save(filepath)

    try:
        if ext == "csv":
            rows = _read_csv(filepath)
        else:
            rows = _read_excel(filepath)

        rows = _normalize_rows(rows)
        stops_data, failed = _geocode_rows(rows)

        company_id = g.company_id
        db = get_db_session()
        try:
            db.query(Stop).filter(Stop.job_id.is_(None), Stop.company_id == company_id).delete()
            for s in stops_data:
                db.add(Stop(
                    id=s["id"], order_id=s["order_id"], customer_name=s["customer_name"],
                    address=s["address"], lat=s["lat"], lng=s["lng"], demand=s["demand"],
                    service_time=s["service_time"], phone=s["phone"], notes=s["notes"],
                    time_window_start=s["time_window_start"], time_window_end=s["time_window_end"],
                    company_id=company_id,
                ))
            db.commit()
        except Exception:
            db.rollback()
            traceback.print_exc()
            return jsonify({"error": "Failed to save stops"}), 500
        finally:
            db.close()

        return jsonify({
            "success": True,
            "total_rows": len(rows),
            "geocoded": len(stops_data),
            "failed": len(failed),
            "failed_details": failed,
            "stops": stops_data,
        })

    except Exception:
        traceback.print_exc()
        return jsonify({"error": "Failed to process upload"}), 500
    finally:
        try:
            os.remove(filepath)
        except OSError:
            pass


@optimization_bp.route("/api/test-data", methods=["POST"])
@require_auth
@require_admin
def load_test_data():
    test_stops = load_test_stops()
    company_id = g.company_id
    unique_prefix = uuid.uuid4().hex[:4]

    db = get_db_session()
    try:
        db.query(Stop).filter(Stop.job_id.is_(None), Stop.company_id == company_id).delete()
        db.query(Stop).filter(Stop.id.like("test%"), Stop.company_id == company_id).delete()
        db.flush()

        for s in test_stops:
            stop_id = f"{s['id']}_{unique_prefix}"
            db.add(Stop(
                id=stop_id, order_id=s["order_id"], customer_name=s["customer_name"],
                address=s["address"], lat=s["lat"], lng=s["lng"], demand=s["demand"],
                service_time=s["service_time"], phone=s["phone"], notes=s["notes"],
                time_window_start=s["time_window_start"], time_window_end=s["time_window_end"],
                company_id=company_id,
            ))
        db.commit()
    except Exception:
        db.rollback()
        traceback.print_exc()
        return jsonify({"error": "Failed to load test data"}), 500
    finally:
        db.close()

    return jsonify({
        "success": True,
        "total_rows": len(test_stops),
        "geocoded": len(test_stops),
        "failed": 0,
        "failed_details": [],
        "stops": test_stops,
    })


@optimization_bp.route("/api/demo", methods=["POST"])
@require_auth
@require_admin
def load_demo():
    """One-click: create pre-geocoded demo stops → optimise into 1 job → assign to first driver.
    This makes the live dashboard testable immediately without uploading a spreadsheet."""
    from models import Driver
    from datetime import datetime, timezone

    company_id = g.company_id
    db = get_db_session()
    try:
        # Pre-geocoded demo stops (Sandton area, Johannesburg)
        demo_stops_raw = [
            {"address": "Sandton City Mall", "lat": -26.1073, "lng": 28.0566, "customer_name": "Sandton Hub", "order_id": "DEMO-001"},
            {"address": "Rosebank Mall",      "lat": -26.1465, "lng": 28.0436, "customer_name": "Lerato Dlamini",  "order_id": "DEMO-002"},
            {"address": "Hyde Park Corner",   "lat": -26.1303, "lng": 28.0345, "customer_name": "Thabo Mokoena",   "order_id": "DEMO-003"},
            {"address": "Melrose Arch",       "lat": -26.1351, "lng": 28.0668, "customer_name": "Nomsa Khumalo",   "order_id": "DEMO-004"},
            {"address": "Illovo Boulevard",   "lat": -26.1276, "lng": 28.0521, "customer_name": "Acme Legal",      "order_id": "DEMO-005"},
            {"address": "Nelson Mandela Sq",  "lat": -26.1078, "lng": 28.0573, "customer_name": "Pick n Pay",      "order_id": "DEMO-006"},
        ]

        # Remove previous demo data
        db.query(Stop).filter(Stop.order_id.like("DEMO-%"), Stop.company_id == company_id).delete(synchronize_session=False)
        demo_jobs = db.query(Job).filter(Job.area == "Demo Route", Job.company_id == company_id).all()
        for dj in demo_jobs:
            db.delete(dj)
        db.flush()

        # Create stops
        stop_ids = []
        for s in demo_stops_raw:
            sid = f"DEMO-{uuid.uuid4().hex[:8]}"
            stop_ids.append(sid)
            db.add(Stop(
                id=sid, order_id=s["order_id"], customer_name=s["customer_name"],
                address=s["address"], lat=s["lat"], lng=s["lng"],
                demand=1, service_time=10, phone="", notes="",
                time_window_start="", time_window_end="",
                company_id=company_id, status="pending", completed=False,
            ))
        db.flush()

        # Create job
        job_id = f"JOB-DEMO-{uuid.uuid4().hex[:4].upper()}"
        now = datetime.now(timezone.utc)
        job = Job(
            id=job_id, area="Demo Route",
            total_stops=len(demo_stops_raw),
            total_distance_km=12.5,
            estimated_time_min=45,
            estimated_cost=200.0,
            center_lat=-26.133, center_lng=28.050,
            status="unassigned",
            company_id=company_id,
            created_at=now,
        )
        db.add(job)
        db.flush()

        # Link stops to job in order
        for i, sid in enumerate(stop_ids):
            stop = db.query(Stop).filter(Stop.id == sid).first()
            if stop:
                stop.job_id = job_id
                stop.stop_number = i + 1

        # Auto-assign to first available driver
        driver = db.query(Driver).filter(
            Driver.company_id == company_id,
            Driver.blocked == False,
        ).first()
        assigned_driver = None
        if driver:
            job.status = "assigned"
            job.driver_id = driver.id
            job.driver_name = driver.name
            job.assigned_at = now
            assigned_driver = driver.to_dict()

        db.commit()
        return jsonify({
            "success": True,
            "job_id": job_id,
            "total_stops": len(demo_stops_raw),
            "assigned_to": assigned_driver,
            "message": "Demo route created" + (f" and assigned to {driver.name}" if driver else " (no drivers found — add a driver and assign manually)"),
        })
    except Exception:
        db.rollback()
        traceback.print_exc()
        return jsonify({"error": "Failed to create demo data"}), 500
    finally:
        db.close()
@require_auth
@require_admin
def optimize():
    data = request.get_json() or {}
    cluster_radius = float(data.get("cluster_radius", 8))
    company_id = g.company_id

    db = get_db_session()
    try:
        _clear_existing_jobs(db, company_id)

        stops_data = _get_stops_for_optimization(db, company_id, data)
        if not stops_data or len(stops_data) < 2:
            db.rollback()
            return jsonify({"error": "Need at least 2 stops to optimize"}), 400

        clusters = cluster_stops(stops_data, radius_km=cluster_radius)
        jobs_created = _create_jobs_from_clusters(db, clusters, company_id)

        db.commit()

        _fetch_route_geometries(jobs_created)
        db.commit()

        jobs_created.sort(key=lambda j: j.total_stops, reverse=True)
        jobs_out = [j.to_dict() for j in jobs_created]

        return jsonify({
            "success": True,
            "total_stops": len(stops_data),
            "total_jobs": len(jobs_out),
            "jobs": jobs_out,
        })

    except Exception:
        db.rollback()
        traceback.print_exc()
        return jsonify({"error": "Route optimization failed"}), 500
    finally:
        db.close()


@optimization_bp.route("/api/route", methods=["POST"])
@require_auth
@require_admin
def get_road_route():
    data = request.get_json() or {}
    waypoints = data.get("waypoints", [])

    if len(waypoints) < 2:
        return jsonify({"error": "Need at least 2 waypoints"}), 400

    coords = ";".join(f"{p[1]},{p[0]}" for p in waypoints)
    url = f"https://router.project-osrm.org/route/v1/driving/{coords}?overview=full&geometries=polyline"

    try:
        resp = http_requests.get(url, timeout=15)
        osrm_data = resp.json()
        if osrm_data.get("code") == "Ok" and osrm_data.get("routes"):
            return jsonify({
                "success": True,
                "geometry": osrm_data["routes"][0]["geometry"],
                "distance": osrm_data["routes"][0].get("distance", 0),
                "duration": osrm_data["routes"][0].get("duration", 0),
            })
        return jsonify({"success": False, "error": "No route found"}), 404
    except Exception:
        traceback.print_exc()
        return jsonify({"success": False, "error": "Failed to fetch route"}), 500


def _clear_existing_jobs(db, company_id):
    old_jobs = db.query(Job).filter(Job.company_id == company_id).all()
    for oj in old_jobs:
        for s in oj.stops:
            s.job_id = None
            s.stop_number = 0
        db.delete(oj)
    db.flush()


def _get_stops_for_optimization(db, company_id, data):
    unassigned_stops = db.query(Stop).filter(Stop.company_id == company_id).all()
    stops_data = [s.to_dict() for s in unassigned_stops]

    incoming_stops = data.get("stops")
    if incoming_stops and len(incoming_stops) >= 2:
        stops_data = incoming_stops

    return stops_data


def _create_jobs_from_clusters(db, clusters, company_id):
    jobs_created = []

    for cluster in clusters:
        if len(cluster) == 0:
            continue

        center_lat = sum(s["lat"] for s in cluster) / len(cluster)
        center_lng = sum(s["lng"] for s in cluster) / len(cluster)

        locations = [(DEPOT["lat"], DEPOT["lng"])] + [(s["lat"], s["lng"]) for s in cluster]
        dist_matrix = build_distance_matrix(locations)

        ordered_stops, total_dist = _solve_tsp_local(cluster, locations, dist_matrix)

        area_name = determine_area_name(center_lat, center_lng)
        est_time = int(total_dist / 35 * 60) + sum(s.get("service_time", 15) for s in ordered_stops)

        job_id = f"JOB-{uuid.uuid4().hex[:6].upper()}"
        job = Job(
            id=job_id,
            area=area_name,
            total_stops=int(len(ordered_stops)),
            total_distance_km=float(round(total_dist, 1)),
            estimated_time_min=int(est_time),
            estimated_cost=float(round(total_dist * 12 + est_time * 2.5, 2)),
            center_lat=float(center_lat),
            center_lng=float(center_lng),
            status="unassigned",
            company_id=company_id,
        )
        db.add(job)
        db.flush()  # persist job row before linking stops (avoids FK ordering issues)

        for i, stop_data in enumerate(ordered_stops):
            stop = db.query(Stop).filter(Stop.id == stop_data["id"], Stop.company_id == company_id).first()
            if stop:
                stop.job_id = job_id
                stop.stop_number = i + 1
            else:
                db.add(Stop(
                    id=stop_data["id"], order_id=stop_data.get("order_id", ""),
                    customer_name=stop_data.get("customer_name", ""),
                    address=stop_data.get("address", ""),
                    lat=stop_data["lat"], lng=stop_data["lng"],
                    demand=stop_data.get("demand", 1),
                    service_time=stop_data.get("service_time", 15),
                    phone=stop_data.get("phone", ""),
                    notes=stop_data.get("notes", ""),
                    time_window_start=stop_data.get("time_window_start", ""),
                    time_window_end=stop_data.get("time_window_end", ""),
                    job_id=job_id, stop_number=i + 1,
                    company_id=company_id,
                ))

        jobs_created.append(job)

    return jobs_created


def _solve_tsp_local(cluster, locations, dist_matrix):
    route, total_dist = solve_tsp(dist_matrix, start=0)

    ordered_stops = []
    for node in route:
        if node > 0:
            ordered_stops.append(cluster[node - 1])

    return ordered_stops, total_dist


def _fetch_route_geometries(jobs_created):
    for job in jobs_created:
        try:
            sorted_stops = sorted(job.stops, key=lambda s: s.stop_number or 0)
            valid_stops = [s for s in sorted_stops if s.lat and s.lng]
            if not valid_stops:
                continue
            waypoints = [[DEPOT["lat"], DEPOT["lng"]]]
            waypoints += [[float(s.lat), float(s.lng)] for s in valid_stops]
            waypoints.append([DEPOT["lat"], DEPOT["lng"]])
            coords = ";".join(f"{p[1]},{p[0]}" for p in waypoints)
            url = f"https://router.project-osrm.org/route/v1/driving/{coords}?overview=full&geometries=polyline"
            resp = http_requests.get(url, timeout=15)
            osrm_data = resp.json()
            if osrm_data.get("code") == "Ok" and osrm_data.get("routes"):
                job.route_geometry = osrm_data["routes"][0]["geometry"]
        except Exception as route_err:
            print(f"Route geometry fetch failed for {job.id}: {route_err}")
