import os
from flask import Flask, jsonify, send_from_directory
from flask_cors import CORS
from dotenv import load_dotenv

from backend.database import init_db
from backend.routes.materials import materials_bp
from backend.routes.ai_features import ai_features_bp
from backend.routes.planner import planner_bp
from backend.routes.progress import progress_bp
from backend.routes.settings import settings_bp

# Load environment variables
load_dotenv()

def create_app():
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    frontend_dir = os.path.join(base_dir, "frontend")
    upload_dir = os.path.join(base_dir, "uploads")
    os.makedirs(upload_dir, exist_ok=True)

    app = Flask(__name__, static_folder=frontend_dir, static_url_path="")
    CORS(app)

    max_mb = int(os.environ.get("MAX_UPLOAD_SIZE_MB", 50))
    app.config["UPLOAD_FOLDER"] = upload_dir
    app.config["MAX_CONTENT_LENGTH"] = max_mb * 1024 * 1024

    # Initialize Database tables and migrations
    init_db()

    # Health & Status endpoints
    @app.route("/health", methods=["GET"])
    def health():
        return jsonify({"status": "ok"}), 200

    @app.route("/api/status", methods=["GET"])
    def api_status():
        gemini_key = os.environ.get("GEMINI_API_KEY", "").strip() or os.environ.get("AI_API_KEY", "").strip()
        openai_key = os.environ.get("OPENAI_API_KEY", "").strip()
        current_engine = "Gemini" if gemini_key else ("OpenAI" if openai_key else "Local NLP Fallback")

        return jsonify({
            "status": "online",
            "app": "AI Study Buddy",
            "version": "1.2.0",
            "nlp_engine": current_engine,
            "pipeline": "Robust (PyMuPDF + Chunking + RAG)"
        }), 200

    # Serve Frontend SPA
    @app.route("/", methods=["GET"])
    def index():
        return send_from_directory(frontend_dir, "index.html")

    @app.route("/css/<path:filename>", methods=["GET"])
    def serve_css(filename):
        return send_from_directory(os.path.join(frontend_dir, "css"), filename)

    @app.route("/js/<path:filename>", methods=["GET"])
    def serve_js(filename):
        return send_from_directory(os.path.join(frontend_dir, "js"), filename)

    # Register Blueprints
    app.register_blueprint(materials_bp)
    app.register_blueprint(ai_features_bp)
    app.register_blueprint(planner_bp)
    app.register_blueprint(progress_bp)
    app.register_blueprint(settings_bp)

    @app.errorhandler(413)
    def request_too_large(e):
        return jsonify({"error": f"File size exceeds the server limit of {max_mb} MB."}), 413

    @app.errorhandler(404)
    def not_found(e):
        return jsonify({"error": "Resource not found"}), 404

    @app.errorhandler(500)
    def internal_error(e):
        return jsonify({"error": "Internal server error"}), 500

    return app

if __name__ == "__main__":
    app = create_app()
    port = int(os.environ.get("PORT", 5000))
    print(f"AI Study Buddy starting on http://127.0.0.1:{port}")
    app.run(host="0.0.0.0", port=port, debug=False)
