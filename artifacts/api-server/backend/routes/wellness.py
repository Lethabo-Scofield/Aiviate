"""Pre-drive fatigue check-in.

Drivers answer a few questions about what could make them tired before they
start a route. The server scores the answers (clients only render them) and
raises a `fatigue` alert for dispatch when the risk is medium or high.
"""
import uuid
import traceback

from flask import request, jsonify, g

from routes import wellness_bp
from middleware import require_auth, require_admin
from models import Alert, Driver, User, WellnessCheckin
from utils import get_db_session

# Each option carries a weight; weight >= 3 on its own means "do not drive yet".
QUESTIONS = [
    {
        "id": "sleep",
        "prompt": "How much sleep did you get last night?",
        "multi": False,
        "options": [
            {"id": "under_5", "label": "Less than 5 hours", "weight": 2, "reason": "Less than 5 hours of sleep"},
            {"id": "5_to_6", "label": "5 to 6 hours", "weight": 1, "reason": "Only 5 to 6 hours of sleep"},
            {"id": "7_plus", "label": "7 hours or more", "weight": 0},
        ],
    },
    {
        "id": "alertness",
        "prompt": "How alert do you feel right now?",
        "multi": False,
        "options": [
            {"id": "awake", "label": "Wide awake", "weight": 0},
            {"id": "bit_tired", "label": "A little tired", "weight": 1, "reason": "Feeling a little tired"},
            {"id": "very_tired", "label": "Struggling to keep my eyes open", "weight": 3, "reason": "Struggling to stay awake"},
        ],
    },
    {
        "id": "awake_hours",
        "prompt": "How long have you been awake today?",
        "multi": False,
        "options": [
            {"id": "under_12", "label": "Less than 12 hours", "weight": 0},
            {"id": "12_to_16", "label": "12 to 16 hours", "weight": 1, "reason": "Awake 12 to 16 hours"},
            {"id": "over_16", "label": "More than 16 hours", "weight": 2, "reason": "Awake more than 16 hours"},
        ],
    },
    {
        "id": "factors",
        "prompt": "Is anything else making you tired or affecting your driving today?",
        "multi": True,
        "options": [
            {"id": "medication", "label": "Medication that can cause drowsiness", "weight": 2, "reason": "Drowsy medication"},
            {"id": "ill", "label": "Feeling ill or in pain", "weight": 1, "reason": "Feeling ill or in pain"},
            {"id": "hungry", "label": "Skipped meals or not enough water", "weight": 1, "reason": "Hungry or dehydrated"},
            {"id": "stress", "label": "Stress or worries on my mind", "weight": 1, "reason": "Stress or worries"},
            {"id": "long_shift", "label": "Long or late shift yesterday", "weight": 1, "reason": "Long or late shift yesterday"},
            {"id": "alcohol", "label": "Alcohol in the last 12 hours", "weight": 3, "reason": "Alcohol in the last 12 hours"},
            {"id": "none", "label": "None of these", "weight": 0},
        ],
    },
]

ADVICE = {
    "low": "You're good to go. Take a short break every 2 hours, drink water, and pull over if you start to feel drowsy.",
    "medium": "Drive with care today. Plan a break every 90 minutes, eat something, and tell dispatch if you start to feel worse. Your dispatcher has been notified.",
    "high": "Please don't start driving yet. Your dispatcher has been notified and will contact you about rest or a handover. Coffee and loud music do not fix tiredness — only rest does.",
}

_BY_ID = {q["id"]: {o["id"]: o for o in q["options"]} for q in QUESTIONS}
_MULTI = {q["id"] for q in QUESTIONS if q["multi"]}


def score_answers(answers):
    """Return (risk_level, reasons, clean_answers) or raise ValueError."""
    if not isinstance(answers, dict):
        raise ValueError("answers must be an object")
    clean, total, critical, reasons = {}, 0, False, []
    for question in QUESTIONS:
        qid = question["id"]
        raw = answers.get(qid)
        picked = raw if isinstance(raw, list) else [raw] if raw else []
        if not picked:
            raise ValueError(f"Please answer: {question['prompt']}")
        if qid not in _MULTI and len(picked) > 1:
            raise ValueError(f"Pick one answer for: {question['prompt']}")
        if any(p not in _BY_ID[qid] for p in picked):
            raise ValueError(f"Unknown answer for: {question['prompt']}")
        if "none" in picked and len(picked) > 1:
            picked = [p for p in picked if p != "none"]
        for option_id in picked:
            option = _BY_ID[qid][option_id]
            total += option["weight"]
            critical = critical or option["weight"] >= 3
            if option.get("reason"):
                reasons.append(option["reason"])
        clean[qid] = picked if qid in _MULTI else picked[0]

    if critical or total >= 4:
        risk = "high"
    elif total >= 2:
        risk = "medium"
    else:
        risk = "low"
    return risk, reasons, clean


@wellness_bp.route("/api/wellness/questions", methods=["GET"])
@require_auth
def get_questions():
    public = [
        {**q, "options": [{"id": o["id"], "label": o["label"]} for o in q["options"]]}
        for q in QUESTIONS
    ]
    return jsonify({"questions": public})


@wellness_bp.route("/api/wellness/checkins", methods=["POST"])
@require_auth
def create_checkin():
    data = request.get_json(silent=True) or {}
    try:
        risk, reasons, answers = score_answers(data.get("answers"))
    except ValueError as e:
        return jsonify({"error": str(e)}), 400

    db = get_db_session()
    try:
        user = db.query(User).filter(User.id == g.user_id).first()
        driver = None
        if g.driver_id:
            driver = db.query(Driver).filter(
                Driver.id == g.driver_id, Driver.company_id == g.company_id,
            ).first()
        name = (driver.name if driver else None) or (user.name if user else None) or "Driver"

        checkin = WellnessCheckin(
            id=f"WELL-{uuid.uuid4().hex[:10].upper()}",
            company_id=g.company_id,
            user_id=g.user_id,
            driver_id=driver.id if driver else None,
            driver_name=name,
            answers=answers,
            risk_level=risk,
            reasons=reasons,
        )
        db.add(checkin)

        if risk in ("medium", "high"):
            db.add(Alert(
                id=f"ALT-{uuid.uuid4().hex[:8].upper()}",
                type="fatigue",
                severity="critical" if risk == "high" else "warning",
                title=f"{name} reported {'high' if risk == 'high' else 'some'} fatigue risk before driving",
                message="Check-in: " + "; ".join(reasons),
                driver_id=driver.id if driver else None,
                driver_name=name,
                company_id=g.company_id,
            ))

        db.commit()
        db.refresh(checkin)
        return jsonify({
            "success": True,
            "checkin": checkin.to_dict(),
            "risk_level": risk,
            "advice": ADVICE[risk],
            "dispatcher_notified": risk != "low",
        }), 201
    except Exception:
        db.rollback()
        traceback.print_exc()
        return jsonify({"error": "Could not save your check-in"}), 500
    finally:
        db.close()


@wellness_bp.route("/api/wellness/checkins/latest", methods=["GET"])
@require_auth
def latest_checkin():
    db = get_db_session()
    try:
        checkin = db.query(WellnessCheckin).filter(
            WellnessCheckin.company_id == g.company_id,
            WellnessCheckin.user_id == g.user_id,
        ).order_by(WellnessCheckin.created_at.desc()).first()
        if not checkin:
            return jsonify({"checkin": None})
        return jsonify({"checkin": checkin.to_dict(), "advice": ADVICE[checkin.risk_level]})
    finally:
        db.close()


@wellness_bp.route("/api/wellness/checkins", methods=["GET"])
@require_auth
@require_admin
def list_checkins():
    db = get_db_session()
    try:
        limit = min(max(int(request.args.get("limit", 50)), 1), 200)
        rows = db.query(WellnessCheckin).filter(
            WellnessCheckin.company_id == g.company_id,
        ).order_by(WellnessCheckin.created_at.desc()).limit(limit).all()
        return jsonify({"checkins": [r.to_dict() for r in rows]})
    finally:
        db.close()
