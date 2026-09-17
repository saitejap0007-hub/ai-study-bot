import json
from datetime import datetime, date
from flask import Blueprint, request, jsonify
from backend.database import get_db_connection, log_activity
from backend.services import ai_service

planner_bp = Blueprint("planner", __name__)

@planner_bp.route("/api/planner/generate", methods=["POST"])
def generate_plan():
    req_data = request.get_json(silent=True) or {}
    material_id = req_data.get("material_id")
    exam_date_str = req_data.get("exam_date")
    daily_minutes = int(req_data.get("daily_minutes", 120))

    if not exam_date_str:
        return jsonify({"error": "exam_date is required (format: YYYY-MM-DD)"}), 400

    try:
        exam_date_obj = datetime.strptime(exam_date_str, "%Y-%m-%d").date()
    except ValueError:
        return jsonify({"error": "Invalid date format. Use YYYY-MM-DD"}), 400

    today = date.today()
    days_remaining = (exam_date_obj - today).days
    if days_remaining <= 0:
        days_remaining = 1 # Minimum 1 day calculation

    material_title = "General Study Schedule"
    conn = get_db_connection()
    if material_id:
        mat = conn.execute("SELECT * FROM materials WHERE id = ?", (material_id,)).fetchone()
        if mat:
            material_title = mat["title"]

    plan_result = ai_service.generate_study_plan(material_title, days_remaining, daily_minutes)

    cursor = conn.cursor()
    cursor.execute(
        """INSERT INTO study_plans 
        (material_id, exam_date, days_remaining, daily_minutes, breakdown_json, schedule_json)
        VALUES (?, ?, ?, ?, ?, ?)""",
        (
            material_id,
            exam_date_str,
            days_remaining,
            daily_minutes,
            json.dumps(plan_result.get("breakdown", {})),
            json.dumps(plan_result.get("schedule", []))
        )
    )
    plan_id = cursor.lastrowid
    conn.commit()
    conn.close()

    log_activity("study_plan", f"Generated study plan for {material_title} ({days_remaining} days)")

    plan_result["plan_id"] = plan_id
    plan_result["material_id"] = material_id
    plan_result["exam_date"] = exam_date_str
    return jsonify(plan_result), 201

@planner_bp.route("/api/planner/<int:material_id>", methods=["GET"])
def get_plan(material_id):
    conn = get_db_connection()
    row = conn.execute(
        "SELECT * FROM study_plans WHERE material_id = ? ORDER BY created_at DESC LIMIT 1",
        (material_id,)
    ).fetchone()
    conn.close()

    if not row:
        return jsonify({"error": "No study plan found for this material"}), 404

    data = dict(row)
    return jsonify({
        "plan_id": data["id"],
        "material_id": data["material_id"],
        "exam_date": data["exam_date"],
        "days_remaining": data["days_remaining"],
        "daily_minutes": data["daily_minutes"],
        "breakdown": json.loads(data["breakdown_json"] or "{}"),
        "schedule": json.loads(data["schedule_json"] or "[]"),
        "created_at": data["created_at"]
    }), 200

@planner_bp.route("/api/exam/generate", methods=["POST"])
def generate_exam_mode():
    req_data = request.get_json(silent=True) or {}
    material_id = req_data.get("material_id")
    hours_remaining = float(req_data.get("hours_remaining", 2.0))

    conn = get_db_connection()
    text = "Core revision notes and key exam principles."
    material_title = "Quick Crash Review"
    
    if material_id:
        mat = conn.execute("SELECT * FROM materials WHERE id = ?", (material_id,)).fetchone()
        if mat:
            text = mat["extracted_text"]
            material_title = mat["title"]
    conn.close()

    crash_plan = ai_service.generate_exam_crash_plan(text, hours_remaining=hours_remaining)
    crash_plan["material_id"] = material_id
    crash_plan["material_title"] = material_title

    log_activity("exam_crash", f"Generated {hours_remaining}h crash plan for {material_title}")

    return jsonify(crash_plan), 200
