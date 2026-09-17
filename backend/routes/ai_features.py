import json
from flask import Blueprint, request, jsonify
from backend.database import get_db_connection, log_activity
from backend.services import ai_service, gemini_service

ai_features_bp = Blueprint("ai_features", __name__)

# ----------------- SUMMARY -----------------

@ai_features_bp.route("/api/materials/<int:material_id>/summary", methods=["POST", "GET"])
def handle_summary(material_id):
    conn = get_db_connection()
    mat = conn.execute("SELECT * FROM materials WHERE id = ?", (material_id,)).fetchone()
    if not mat:
        conn.close()
        return jsonify({"error": "Material not found"}), 404

    req_data = request.get_json(silent=True) or {}
    summary_type = (req_data.get("summary_type") or request.args.get("summary_type") or "medium").strip().lower()
    if summary_type not in ["quick", "medium", "detailed"]:
        summary_type = "medium"
    force_regenerate = req_data.get("force_regenerate", False)

    if request.method == "GET":
        summary_row = conn.execute(
            "SELECT * FROM summaries WHERE material_id = ? AND summary_type = ? ORDER BY created_at DESC LIMIT 1",
            (material_id, summary_type)
        ).fetchone()
        if not summary_row:
            # Fallback to most recent if requested type has not been generated yet
            summary_row = conn.execute(
                "SELECT * FROM summaries WHERE material_id = ? ORDER BY created_at DESC LIMIT 1",
                (material_id,)
            ).fetchone()

        if summary_row:
            data = dict(summary_row)
            conn.close()
            return jsonify({
                "title": mat["title"],
                "summary": data["content"],
                "summary_type": data["summary_type"],
                "key_concepts": json.loads(data["key_concepts_json"] or "[]"),
                "definitions": json.loads(data["definitions_json"] or "[]"),
                "important_points": json.loads(data.get("important_points_json") or "[]"),
                "formulas": json.loads(data["formulas_json"] or "[]"),
                "examples": json.loads(data.get("examples_json") or "[]"),
                "exam_points": json.loads(data["exam_points_json"] or "[]"),
                "revision_notes": data.get("revision_notes") or ""
            }), 200
        else:
            conn.close()
            return jsonify({"error": "No summary found for this material"}), 404

    if not force_regenerate and request.method == "POST":
        summary_row = conn.execute(
            "SELECT * FROM summaries WHERE material_id = ? AND summary_type = ? ORDER BY created_at DESC LIMIT 1",
            (material_id, summary_type)
        ).fetchone()
        if summary_row:
            data = dict(summary_row)
            conn.close()
            return jsonify({
                "title": mat["title"],
                "summary": data["content"],
                "summary_type": data["summary_type"],
                "key_concepts": json.loads(data["key_concepts_json"] or "[]"),
                "definitions": json.loads(data["definitions_json"] or "[]"),
                "important_points": json.loads(data.get("important_points_json") or "[]"),
                "formulas": json.loads(data["formulas_json"] or "[]"),
                "examples": json.loads(data.get("examples_json") or "[]"),
                "exam_points": json.loads(data["exam_points_json"] or "[]"),
                "revision_notes": data.get("revision_notes") or ""
            }), 200

    extracted_text = mat["extracted_text"]
    title = mat["title"]
    conn.close()

    # Generate new summary via Gemini (hierarchical / chunk-based)
    summary_result = gemini_service.generate_summary(
        material_id, 
        extracted_text, 
        title=title, 
        summary_type=summary_type
    )

    write_conn = get_db_connection()
    write_conn.execute(
        """INSERT INTO summaries 
        (material_id, summary_type, content, key_concepts_json, definitions_json, formulas_json, exam_points_json, examples_json, important_points_json, revision_notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (
            material_id,
            summary_type,
            summary_result.get("summary", ""),
            json.dumps(summary_result.get("key_concepts", [])),
            json.dumps(summary_result.get("definitions", [])),
            json.dumps(summary_result.get("formulas", [])),
            json.dumps(summary_result.get("exam_points", [])),
            json.dumps(summary_result.get("examples", [])),
            json.dumps(summary_result.get("important_points", [])),
            summary_result.get("revision_notes", "")
        )
    )
    write_conn.commit()
    write_conn.close()

    log_activity("summary", f"Generated {summary_type} summary for {title}", {"material_id": material_id})

    return jsonify(summary_result), 200

# ----------------- QUESTIONS ENGINE -----------------

@ai_features_bp.route("/api/materials/<int:material_id>/questions", methods=["POST", "GET"])
def handle_questions(material_id):
    conn = get_db_connection()
    mat = conn.execute("SELECT * FROM materials WHERE id = ?", (material_id,)).fetchone()
    if not mat:
        conn.close()
        return jsonify({"error": "Material not found"}), 404

    req_data = request.get_json(silent=True) or {}
    force_regenerate = req_data.get("force_regenerate", False)

    if request.method == "GET":
        q_rows = conn.execute(
            "SELECT * FROM questions WHERE material_id = ? ORDER BY mark_category ASC, id ASC",
            (material_id,)
        ).fetchall()
        if q_rows:
            questions = []
            for r in q_rows:
                q_dict = dict(r)
                q_dict["key_points"] = json.loads(q_dict.get("key_points_json") or "[]")
                questions.append(q_dict)
            conn.close()
            return jsonify({"questions": questions}), 200
        else:
            conn.close()
            return jsonify({"questions": []}), 200

    if not force_regenerate and request.method == "POST":
        q_rows = conn.execute(
            "SELECT * FROM questions WHERE material_id = ? ORDER BY mark_category ASC, id ASC",
            (material_id,)
        ).fetchall()
        if q_rows:
            questions = []
            for r in q_rows:
                q_dict = dict(r)
                q_dict["key_points"] = json.loads(q_dict.get("key_points_json") or "[]")
                questions.append(q_dict)
            conn.close()
            return jsonify({"questions": questions}), 200

    extracted_text = mat["extracted_text"]
    title = mat["title"]
    conn.close()

    # Generate new exam questions via Gemini
    q_result = gemini_service.generate_exam_questions(material_id, extracted_text, title=title)
    questions_list = q_result.get("questions", [])

    write_conn = get_db_connection()
    # Clear old questions for this material to avoid duplicate build-up
    write_conn.execute("DELETE FROM questions WHERE material_id = ?", (material_id,))
    
    saved_questions = []
    for q in questions_list:
        cursor = write_conn.cursor()
        key_pts = q.get("key_points", [])
        cursor.execute(
            """INSERT INTO questions 
            (material_id, mark_category, question_text, marking_guide, answer, difficulty, topic, key_points_json)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                material_id,
                q.get("mark_category", 2),
                q.get("question_text", ""),
                q.get("marking_guide", ""),
                q.get("answer", ""),
                q.get("difficulty", "Medium"),
                q.get("topic", "Core Syllabus"),
                json.dumps(key_pts)
            )
        )
        q_id = cursor.lastrowid
        q_copy = dict(q)
        q_copy["id"] = q_id
        q_copy["material_id"] = material_id
        q_copy["key_points"] = key_pts
        saved_questions.append(q_copy)

    write_conn.commit()
    write_conn.close()

    log_activity("questions", f"Generated questions for {title}", {"count": len(saved_questions)})

    return jsonify({"questions": saved_questions}), 200

# ----------------- QUIZ ENGINE -----------------

@ai_features_bp.route("/api/materials/<int:material_id>/quiz", methods=["POST"])
def generate_quiz_endpoint(material_id):
    conn = get_db_connection()
    mat = conn.execute("SELECT * FROM materials WHERE id = ?", (material_id,)).fetchone()
    if not mat:
        conn.close()
        return jsonify({"error": "Material not found"}), 404

    req_data = request.get_json(silent=True) or {}
    num_questions = int(req_data.get("num_questions", 10))
    difficulty = req_data.get("difficulty", "Medium")
    topic = req_data.get("topic")
    quiz_style = req_data.get("quiz_style", "creative")
    extracted_text = mat["extracted_text"]
    title = mat["title"]
    conn.close()

    quiz_data = gemini_service.generate_quiz(
        material_id,
        extracted_text,
        title=title,
        num_questions=num_questions,
        difficulty=difficulty,
        topic=topic,
        quiz_style=quiz_style
    )
    
    write_conn = get_db_connection()
    cursor = write_conn.cursor()
    cursor.execute(
        "INSERT INTO quizzes (material_id, title, total_questions) VALUES (?, ?, ?)",
        (material_id, quiz_data.get("title", f"Dynamic Quiz on {title}"), len(quiz_data.get("questions", [])))
    )
    quiz_id = cursor.lastrowid

    saved_items = []
    for item in quiz_data.get("questions", []):
        q_type = item.get("question_type", "Scenario Application")
        hint_text = item.get("hint", "")
        cursor.execute(
            """INSERT INTO quiz_questions 
            (quiz_id, question, option_a, option_b, option_c, option_d, correct_option, explanation, topic, difficulty, question_type, hint)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                quiz_id,
                item.get("question"),
                item.get("option_a"),
                item.get("option_b"),
                item.get("option_c"),
                item.get("option_d"),
                item.get("correct_option"),
                item.get("explanation"),
                item.get("topic", "General"),
                item.get("difficulty", difficulty),
                q_type,
                hint_text
            )
        )
        q_item_id = cursor.lastrowid
        item_copy = dict(item)
        item_copy["id"] = q_item_id
        item_copy["question_type"] = q_type
        item_copy["hint"] = hint_text
        saved_items.append(item_copy)

    write_conn.commit()
    write_conn.close()

    log_activity("quiz_create", f"Generated dynamic quiz ({quiz_style}) with {len(saved_items)} questions for {title}")

    return jsonify({
        "quiz_id": quiz_id,
        "material_id": material_id,
        "title": quiz_data.get("title"),
        "engine": quiz_data.get("engine", "Google Gemini"),
        "quiz_style": quiz_style,
        "total_questions": len(saved_items),
        "questions": saved_items
    }), 201

@ai_features_bp.route("/api/quiz/submit", methods=["POST"])
def submit_quiz():
    req_data = request.get_json(silent=True) or {}
    quiz_id = req_data.get("quiz_id")
    user_answers = req_data.get("answers", {})

    if not quiz_id:
        return jsonify({"error": "quiz_id is required"}), 400

    conn = get_db_connection()
    quiz = conn.execute("SELECT * FROM quizzes WHERE id = ?", (quiz_id,)).fetchone()
    if not quiz:
        conn.close()
        return jsonify({"error": "Quiz not found"}), 404

    q_rows = conn.execute("SELECT * FROM quiz_questions WHERE quiz_id = ?", (quiz_id,)).fetchall()
    
    total = len(q_rows)
    score = 0
    breakdown = []
    weak_topics = set()
    strong_topics = set()

    for q in q_rows:
        q_id = str(q["id"])
        submitted_opt = user_answers.get(q_id, "").upper().strip()
        correct_opt = q["correct_option"].upper().strip()
        is_correct = (submitted_opt == correct_opt)
        topic = q["topic"] or "Core Topic"

        if is_correct:
            score += 1
            strong_topics.add(topic)
        else:
            weak_topics.add(topic)

        breakdown.append({
            "question_id": q["id"],
            "question": q["question"],
            "question_type": q["question_type"] if "question_type" in q.keys() else "Scenario Application",
            "hint": q["hint"] if "hint" in q.keys() else "",
            "submitted_option": submitted_opt,
            "correct_option": correct_opt,
            "is_correct": is_correct,
            "explanation": q["explanation"],
            "topic": topic
        })

    final_weak = list(weak_topics)
    final_strong = [t for t in strong_topics if t not in weak_topics]
    percentage = round((score / total * 100), 1) if total > 0 else 0.0

    cursor = conn.cursor()
    cursor.execute(
        """INSERT INTO quiz_results 
        (quiz_id, material_id, score, total, percentage, weak_topics_json, strong_topics_json)
        VALUES (?, ?, ?, ?, ?, ?, ?)""",
        (
            quiz_id,
            quiz["material_id"],
            score,
            total,
            percentage,
            json.dumps(final_weak),
            json.dumps(final_strong)
        )
    )
    result_id = cursor.lastrowid
    conn.commit()
    conn.close()

    log_activity("quiz_complete", f"Completed quiz {quiz_id}: scored {score}/{total} ({percentage}%)")

    return jsonify({
        "result_id": result_id,
        "quiz_id": quiz_id,
        "score": score,
        "total": total,
        "correct": score,
        "incorrect": total - score,
        "percentage": percentage,
        "weak_topics": final_weak,
        "strong_topics": final_strong,
        "breakdown": breakdown
    }), 200

# ----------------- FLASHCARDS -----------------

@ai_features_bp.route("/api/materials/<int:material_id>/flashcards", methods=["POST", "GET"])
def handle_flashcards(material_id):
    conn = get_db_connection()
    mat = conn.execute("SELECT * FROM materials WHERE id = ?", (material_id,)).fetchone()
    if not mat:
        conn.close()
        return jsonify({"error": "Material not found"}), 404

    if request.method == "GET":
        cards = conn.execute(
            "SELECT * FROM flashcards WHERE material_id = ? ORDER BY id ASC",
            (material_id,)
        ).fetchall()
        if cards:
            result = [dict(c) for c in cards]
            conn.close()
            return jsonify({"flashcards": result, "total": len(result)}), 200

    req_data = request.get_json(silent=True) or {}
    count = int(req_data.get("count", 8))
    
    cards_data = ai_service.generate_flashcards(mat["extracted_text"], material_id=material_id, count=count)
    
    conn.execute("DELETE FROM flashcards WHERE material_id = ?", (material_id,))
    
    saved_cards = []
    for c in cards_data:
        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO flashcards (material_id, front, back, category, status) VALUES (?, ?, ?, ?, ?)",
            (material_id, c.get("front"), c.get("back"), c.get("category", "General"), "unreviewed")
        )
        card_id = cursor.lastrowid
        c_copy = dict(c)
        c_copy["id"] = card_id
        c_copy["status"] = "unreviewed"
        saved_cards.append(c_copy)

    conn.commit()
    conn.close()

    log_activity("flashcards", f"Generated {len(saved_cards)} flashcards for {mat['title']}")

    return jsonify({"flashcards": saved_cards, "total": len(saved_cards)}), 200

@ai_features_bp.route("/api/flashcards/<int:card_id>/status", methods=["PUT", "PATCH"])
def update_flashcard_status(card_id):
    req_data = request.get_json(silent=True) or {}
    new_status = req_data.get("status", "unreviewed")
    
    conn = get_db_connection()
    card = conn.execute("SELECT * FROM flashcards WHERE id = ?", (card_id,)).fetchone()
    if not card:
        conn.close()
        return jsonify({"error": "Flashcard not found"}), 404

    conn.execute("UPDATE flashcards SET status = ? WHERE id = ?", (new_status, card_id))
    conn.commit()
    conn.close()

    return jsonify({"message": "Status updated", "id": card_id, "status": new_status}), 200

# ----------------- TUTOR CHAT (RAG ENABLED) -----------------

@ai_features_bp.route("/api/materials/<int:material_id>/tutor", methods=["POST"])
def tutor_chat(material_id):
    req_data = request.get_json(silent=True) or {}
    user_msg = req_data.get("message", "").strip()
    conv_id = req_data.get("conversation_id")

    if not user_msg:
        return jsonify({"error": "Message cannot be empty"}), 400

    conn = get_db_connection()
    mat = conn.execute("SELECT * FROM materials WHERE id = ?", (material_id,)).fetchone()
    if not mat:
        conn.close()
        return jsonify({"error": "Material not found"}), 404

    if not conv_id:
        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO tutor_conversations (material_id, title) VALUES (?, ?)",
            (material_id, f"Session on {mat['title']}")
        )
        conv_id = cursor.lastrowid
        conn.commit()

    history_rows = conn.execute(
        "SELECT sender, message FROM tutor_messages WHERE conversation_id = ? ORDER BY created_at ASC LIMIT 10",
        (conv_id,)
    ).fetchall()
    history = [{"sender": r["sender"], "message": r["message"]} for r in history_rows]

    conn.execute(
        "INSERT INTO tutor_messages (conversation_id, sender, message) VALUES (?, ?, ?)",
        (conv_id, "user", user_msg)
    )
    conn.commit()

    # RAG enabled grounded reply via Gemini
    reply = gemini_service.ask_tutor(
        material_id,
        mat["extracted_text"],
        mat["title"],
        user_msg,
        history=history
    )

    conn.execute(
        "INSERT INTO tutor_messages (conversation_id, sender, message) VALUES (?, ?, ?)",
        (conv_id, "assistant", reply)
    )
    conn.commit()
    conn.close()

    log_activity("tutor", f"AI Tutor answered question for {mat['title']}")

    return jsonify({
        "conversation_id": conv_id,
        "material_id": material_id,
        "user_message": user_msg,
        "response": reply
    }), 200

@ai_features_bp.route("/api/materials/<int:material_id>/tutor/messages", methods=["GET"])
def get_tutor_messages(material_id):
    conn = get_db_connection()
    conv = conn.execute(
        "SELECT * FROM tutor_conversations WHERE material_id = ? ORDER BY created_at DESC LIMIT 1",
        (material_id,)
    ).fetchone()
    
    if not conv:
        conn.close()
        return jsonify({"conversation_id": None, "messages": []}), 200

    rows = conn.execute(
        "SELECT id, sender, message, created_at FROM tutor_messages WHERE conversation_id = ? ORDER BY created_at ASC",
        (conv["id"],)
    ).fetchall()
    conn.close()

    messages = [dict(r) for r in rows]
    return jsonify({"conversation_id": conv["id"], "messages": messages}), 200
