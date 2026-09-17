import json
from flask import Blueprint, request, jsonify
from backend.database import get_db_connection

progress_bp = Blueprint("progress", __name__)

@progress_bp.route("/api/progress/stats", methods=["GET"])
def get_stats():
    conn = get_db_connection()
    
    mat_count = conn.execute("SELECT COUNT(*) as cnt FROM materials").fetchone()["cnt"]
    
    quiz_stats = conn.execute(
        "SELECT COUNT(*) as cnt, AVG(percentage) as avg_pct FROM quiz_results"
    ).fetchone()
    quizzes_taken = quiz_stats["cnt"] or 0
    avg_score = round(quiz_stats["avg_pct"] or 0.0, 1)

    fc_total = conn.execute("SELECT COUNT(*) as cnt FROM flashcards").fetchone()["cnt"] or 0
    fc_known = conn.execute("SELECT COUNT(*) as cnt FROM flashcards WHERE status = 'known'").fetchone()["cnt"] or 0

    questions_count = conn.execute("SELECT COUNT(*) as cnt FROM questions").fetchone()["cnt"] or 0
    chunks_count = conn.execute("SELECT COUNT(*) as cnt FROM document_chunks").fetchone()["cnt"] or 0

    logs_count = conn.execute("SELECT COUNT(*) as cnt FROM activity_logs").fetchone()["cnt"] or 0
    total_study_minutes = (mat_count * 20) + (quizzes_taken * 15) + (fc_known * 5) + (logs_count * 10)

    recent_logs = conn.execute(
        "SELECT activity_type, description, created_at FROM activity_logs ORDER BY created_at DESC LIMIT 6"
    ).fetchall()

    conn.close()

    return jsonify({
        "materials_count": mat_count,
        "chunks_count": chunks_count,
        "quizzes_taken": quizzes_taken,
        "average_quiz_score": avg_score,
        "flashcards_total": fc_total,
        "flashcards_mastered": fc_known,
        "questions_generated": questions_count,
        "total_study_minutes": total_study_minutes,
        "recent_activities": [dict(r) for r in recent_logs]
    }), 200

@progress_bp.route("/api/progress/topics", methods=["GET"])
def get_topics():
    conn = get_db_connection()
    results = conn.execute("SELECT weak_topics_json, strong_topics_json FROM quiz_results").fetchall()
    conn.close()

    weak_counter = {}
    strong_counter = {}

    for r in results:
        w_list = json.loads(r["weak_topics_json"] or "[]")
        s_list = json.loads(r["strong_topics_json"] or "[]")
        for t in w_list:
            weak_counter[t] = weak_counter.get(t, 0) + 1
        for t in s_list:
            strong_counter[t] = strong_counter.get(t, 0) + 1

    weak_sorted = sorted(weak_counter.items(), key=lambda x: x[1], reverse=True)
    strong_sorted = sorted(strong_counter.items(), key=lambda x: x[1], reverse=True)

    weak_topics = [w[0] for w in weak_sorted]
    strong_topics = [s[0] for s in strong_sorted if s[0] not in weak_topics]

    if not weak_topics and not strong_topics:
        weak_topics = ["Take your first quiz to identify weak areas!"]
        strong_topics = ["Core Document Reading"]

    return jsonify({
        "weak_topics": weak_topics,
        "strong_topics": strong_topics
    }), 200

@progress_bp.route("/api/search", methods=["GET"])
def global_search():
    query = request.args.get("q", "").strip()
    if not query:
        return jsonify({"results": [], "query": ""}), 200

    conn = get_db_connection()
    q_param = f"%{query}%"

    # Search materials
    mat_rows = conn.execute(
        "SELECT id, title, original_filename, file_type, page_count, substr(extracted_text, 1, 200) as snippet FROM materials WHERE title LIKE ? OR extracted_text LIKE ? LIMIT 4",
        (q_param, q_param)
    ).fetchall()

    # Search document chunks (RAG index)
    chunk_rows = conn.execute(
        """SELECT dc.id, dc.material_id, dc.page_number, substr(dc.content, 1, 200) as snippet, m.title as material_title
           FROM document_chunks dc
           JOIN materials m ON dc.material_id = m.id
           WHERE dc.content LIKE ? LIMIT 5""",
        (q_param,)
    ).fetchall()

    # Search questions
    question_rows = conn.execute(
        "SELECT id, material_id, mark_category, question_text, answer FROM questions WHERE question_text LIKE ? OR answer LIKE ? LIMIT 4",
        (q_param, q_param)
    ).fetchall()

    # Search summaries
    summary_rows = conn.execute(
        "SELECT id, material_id, summary_type, substr(content, 1, 200) as snippet FROM summaries WHERE content LIKE ? LIMIT 4",
        (q_param,)
    ).fetchall()

    conn.close()

    results = []
    for m in mat_rows:
        results.append({
            "type": "material",
            "id": m["id"],
            "title": m["title"],
            "description": f"File: {m['original_filename']} ({m['file_type'].upper()}, {m['page_count']} pages)",
            "snippet": m["snippet"] + "..."
        })

    for c in chunk_rows:
        results.append({
            "type": "chunk",
            "id": c["id"],
            "material_id": c["material_id"],
            "title": f"Page {c['page_number']} in {c['material_title']}",
            "description": "Extracted academic text section",
            "snippet": c["snippet"] + "..."
        })

    for q in question_rows:
        results.append({
            "type": "question",
            "id": q["id"],
            "material_id": q["material_id"],
            "title": f"{q['mark_category']}-Mark Question",
            "description": q["question_text"],
            "snippet": q["answer"][:150] + "..."
        })

    for s in summary_rows:
        results.append({
            "type": "summary",
            "id": s["id"],
            "material_id": s["material_id"],
            "title": f"{s['summary_type'].capitalize()} Summary",
            "description": "Study note extract",
            "snippet": s["snippet"] + "..."
        })

    return jsonify({
        "query": query,
        "count": len(results),
        "results": results
    }), 200

@progress_bp.route("/api/progress/clear-history", methods=["POST", "DELETE"])
def clear_history():
    """Wipes all activity logs and assessment history."""
    conn = get_db_connection()
    conn.execute("DELETE FROM activity_logs;")
    conn.execute("DELETE FROM quiz_results;")
    conn.commit()
    conn.close()
    return jsonify({
        "success": True,
        "message": "Activity and quiz history have been cleared successfully."
    }), 200

