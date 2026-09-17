import os
import uuid
import time
import logging
from flask import Blueprint, request, jsonify, current_app
from werkzeug.utils import secure_filename
from backend.database import get_db_connection, log_activity
from backend.services.extractor import extract_document, validate_file_integrity
from backend.services.chunker import chunk_and_store_document, get_document_chunks

logger = logging.getLogger(__name__)
materials_bp = Blueprint("materials", __name__)

ALLOWED_EXTENSIONS = {"pdf", "docx", "doc", "txt", "md"}

def allowed_file(filename):
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS

@materials_bp.route("/api/materials/upload", methods=["POST"])
@materials_bp.route("/upload", methods=["POST"])
def upload_materials():
    if "files" not in request.files and "file" not in request.files:
        return jsonify({"error": "No file attached to the request"}), 400

    uploaded_files = request.files.getlist("files")
    if not uploaded_files or (len(uploaded_files) == 1 and uploaded_files[0].filename == ""):
        single_file = request.files.get("file")
        if single_file and single_file.filename != "":
            uploaded_files = [single_file]
        else:
            return jsonify({"error": "No file selected for upload"}), 400

    upload_dir = current_app.config.get(
        "UPLOAD_FOLDER", 
        os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "uploads")
    )
    os.makedirs(upload_dir, exist_ok=True)

    results = []
    errors = []
    conn = get_db_connection()

    for file_obj in uploaded_files:
        if not file_obj or file_obj.filename == "":
            continue

        raw_filename = file_obj.filename
        orig_filename = secure_filename(raw_filename)
        if not orig_filename:
            orig_filename = f"document_{int(time.time())}.txt"

        if not allowed_file(orig_filename):
            errors.append(f"'{raw_filename}': This file type is not currently supported. Supported formats: PDF, DOCX, TXT, MD.")
            continue

        ext = orig_filename.rsplit(".", 1)[1].lower() if "." in orig_filename else "txt"
        
        # Collision-proof unique filename
        timestamp = int(time.time())
        unique_id = uuid.uuid4().hex[:8]
        stored_filename = f"{timestamp}_{unique_id}_{orig_filename}"
        save_path = os.path.join(upload_dir, stored_filename)

        try:
            file_obj.save(save_path)
            file_size = os.path.getsize(save_path)
        except Exception as se:
            logger.error(f"Failed to save upload {orig_filename}: {se}")
            errors.append(f"'{raw_filename}': Server could not persist upload.")
            continue

        # Step: File integrity validation and extraction
        try:
            extracted = extract_document(save_path)
            extracted_text = extracted.get("text", "")
            page_count = extracted.get("page_count", 1)
            char_count = extracted.get("char_count", len(extracted_text))
            status = extracted.get("status", "ready")
            is_scanned = 1 if extracted.get("is_scanned") else 0
            warning = extracted.get("warning")
            error_msg = warning if warning else None
        except ValueError as ve:
            logger.warning(f"Extraction failed for {orig_filename}: {ve}")
            clean_err = str(ve)
            if "Stream has ended unexpectedly" in clean_err or "signature" in clean_err or "corrupted" in clean_err:
                user_msg = "This PDF appears to be incomplete or corrupted. Please upload the original file again."
            elif "exceeds the maximum" in clean_err:
                user_msg = clean_err
            elif "empty" in clean_err:
                user_msg = "The uploaded file is empty (0 bytes)."
            else:
                user_msg = clean_err

            if os.path.exists(save_path):
                try: os.remove(save_path)
                except Exception: pass
                
            errors.append(f"'{raw_filename}': {user_msg}")
            continue
        except Exception as e:
            logger.error(f"Unexpected error parsing {orig_filename}: {e}", exc_info=True)
            if os.path.exists(save_path):
                try: os.remove(save_path)
                except Exception: pass
            errors.append(f"'{raw_filename}': We couldn't process this document right now. Please try again.")
            continue

        title = os.path.splitext(orig_filename)[0].replace("_", " ").replace("-", " ").title()

        cursor = conn.cursor()
        cursor.execute(
            """INSERT INTO materials 
            (title, original_filename, stored_filename, file_type, file_size, extracted_text, char_count, status, page_count, chunk_count, error_message, is_scanned) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                title, 
                orig_filename, 
                stored_filename, 
                ext, 
                file_size, 
                extracted_text, 
                char_count, 
                status, 
                page_count, 
                0, 
                error_msg, 
                is_scanned
            )
        )
        material_id = cursor.lastrowid
        conn.commit()

        # Step: Chunk and store content for RAG & large document support
        try:
            chunks = chunk_and_store_document(material_id, extracted.get("pages_data", []), full_text=extracted_text)
            chunk_count = len(chunks)
        except Exception as ce:
            logger.error(f"Chunking failed for material {material_id}: {ce}")
            chunk_count = 0

        log_activity("upload", f"Uploaded document: {orig_filename} ({page_count} pages, {chunk_count} chunks)", {"material_id": material_id, "size": file_size})

        results.append({
            "id": material_id,
            "title": title,
            "original_filename": orig_filename,
            "stored_filename": stored_filename,
            "file_type": ext,
            "file_size": file_size,
            "extracted_text": extracted_text,
            "char_count": char_count,
            "page_count": page_count,
            "chunk_count": chunk_count,
            "status": status,
            "is_scanned": bool(is_scanned),
            "warning": warning
        })

    conn.close()

    if not results:
        err_detail = " ".join(errors) if errors else "No valid files were processed."
        return jsonify({"error": err_detail, "details": errors}), 400

    response_payload = {
        "message": f"Successfully processed {len(results)} material(s)",
        "materials": results,
        "material": results[0],
        "warnings": [r["warning"] for r in results if r.get("warning")]
    }
    if errors:
        response_payload["partial_errors"] = errors

    return jsonify(response_payload), 201

@materials_bp.route("/api/materials", methods=["GET"])
def get_all_materials():
    conn = get_db_connection()
    rows = conn.execute(
        """SELECT id, title, original_filename, stored_filename, file_type, file_size, 
                  char_count, page_count, chunk_count, status, is_scanned, error_message, created_at 
           FROM materials ORDER BY created_at DESC"""
    ).fetchall()
    conn.close()
    
    materials = [dict(row) for row in rows]
    return jsonify({"materials": materials, "total": len(materials)}), 200

@materials_bp.route("/api/materials/<int:material_id>", methods=["GET"])
def get_material(material_id):
    conn = get_db_connection()
    row = conn.execute("SELECT * FROM materials WHERE id = ?", (material_id,)).fetchone()
    conn.close()
    
    if not row:
        return jsonify({"error": "Material not found"}), 404
        
    return jsonify({"material": dict(row)}), 200

@materials_bp.route("/api/materials/<int:material_id>/chunks", methods=["GET"])
def get_material_chunks(material_id):
    conn = get_db_connection()
    row = conn.execute("SELECT id, title FROM materials WHERE id = ?", (material_id,)).fetchone()
    conn.close()
    if not row:
        return jsonify({"error": "Material not found"}), 404
        
    chunks = get_document_chunks(material_id)
    return jsonify({"material_id": material_id, "total_chunks": len(chunks), "chunks": chunks}), 200

@materials_bp.route("/api/materials/<int:material_id>", methods=["DELETE"])
def delete_material(material_id):
    conn = get_db_connection()
    row = conn.execute("SELECT * FROM materials WHERE id = ?", (material_id,)).fetchone()
    
    if not row:
        conn.close()
        return jsonify({"error": "Material not found"}), 404
        
    stored_filename = row["stored_filename"]
    upload_dir = current_app.config.get(
        "UPLOAD_FOLDER", 
        os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "uploads")
    )
    file_path = os.path.join(upload_dir, stored_filename)
    
    if os.path.exists(file_path):
        try:
            os.remove(file_path)
        except Exception as e:
            logger.warning(f"Could not remove file {file_path}: {e}")

    conn.execute("DELETE FROM materials WHERE id = ?", (material_id,))
    conn.commit()
    conn.close()

    log_activity("delete", f"Deleted material {row['title']} (ID: {material_id})")

    return jsonify({"message": "Material deleted successfully", "id": material_id}), 200

@materials_bp.route("/api/materials/reset-all", methods=["POST", "DELETE"])
def reset_all_materials():
    """Wipes all documents, chunks, and generated study notes for a clean fresh slate."""
    conn = get_db_connection()
    tables = [
        "materials", "document_chunks", "summaries", "questions", 
        "quizzes", "quiz_questions", "quiz_results", "flashcards", 
        "tutor_conversations", "tutor_messages", "study_plans", "activity_logs"
    ]
    for table in tables:
        conn.execute(f"DELETE FROM {table};")
    conn.commit()
    conn.close()

    upload_dir = current_app.config.get(
        "UPLOAD_FOLDER", 
        os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "uploads")
    )
    if os.path.exists(upload_dir):
        for f in os.listdir(upload_dir):
            if f != ".gitkeep":
                p = os.path.join(upload_dir, f)
                try:
                    if os.path.isfile(p): os.remove(p)
                except Exception as e:
                    logger.warning(f"Could not remove upload file {p}: {e}")

    log_activity("reset", "Cleaned library and reset all study materials.")

    return jsonify({"success": True, "message": "All materials and study notes have been completely cleared. Fresh start ready!"}), 200
