import sqlite3
import os
import json
from datetime import datetime

DB_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "database")
DB_PATH = os.path.join(DB_DIR, "study_buddy.db")

def get_db_connection():
    os.makedirs(DB_DIR, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON;")
    return conn

def init_db():
    conn = get_db_connection()
    cursor = conn.cursor()

    # 1. Materials
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS materials (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        original_filename TEXT NOT NULL,
        stored_filename TEXT NOT NULL,
        file_type TEXT NOT NULL,
        file_size INTEGER NOT NULL,
        extracted_text TEXT NOT NULL,
        char_count INTEGER NOT NULL,
        status TEXT DEFAULT 'ready',
        page_count INTEGER DEFAULT 1,
        chunk_count INTEGER DEFAULT 0,
        error_message TEXT,
        is_scanned INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );""")

    # Check and migrate columns in case materials already existed
    columns_to_add = [
        ("status", "TEXT DEFAULT 'ready'"),
        ("page_count", "INTEGER DEFAULT 1"),
        ("chunk_count", "INTEGER DEFAULT 0"),
        ("error_message", "TEXT"),
        ("is_scanned", "INTEGER DEFAULT 0")
    ]
    for col_name, col_def in columns_to_add:
        try:
            cursor.execute(f"ALTER TABLE materials ADD COLUMN {col_name} {col_def};")
        except sqlite3.OperationalError:
            pass # Column already exists

    # 2. Document Chunks for large academic documents & RAG
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS document_chunks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        material_id INTEGER NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
        chunk_index INTEGER NOT NULL,
        page_number INTEGER DEFAULT 1,
        content TEXT NOT NULL,
        char_count INTEGER NOT NULL,
        token_count_approx INTEGER NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );""")

    # 3. Summaries
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS summaries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        material_id INTEGER NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
        summary_type TEXT NOT NULL,
        content TEXT NOT NULL,
        key_concepts_json TEXT,
        definitions_json TEXT,
        formulas_json TEXT,
        exam_points_json TEXT,
        examples_json TEXT,
        important_points_json TEXT,
        revision_notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );""")

    for col_name, col_def in [
        ("examples_json", "TEXT"),
        ("important_points_json", "TEXT"),
        ("revision_notes", "TEXT")
    ]:
        try:
            cursor.execute(f"ALTER TABLE summaries ADD COLUMN {col_name} {col_def};")
        except sqlite3.OperationalError:
            pass

    # 4. Questions
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS questions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        material_id INTEGER NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
        mark_category INTEGER NOT NULL,
        question_text TEXT NOT NULL,
        marking_guide TEXT NOT NULL,
        answer TEXT NOT NULL,
        difficulty TEXT DEFAULT 'Medium',
        topic TEXT,
        key_points_json TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );""")

    for col_name, col_def in [
        ("topic", "TEXT"),
        ("key_points_json", "TEXT")
    ]:
        try:
            cursor.execute(f"ALTER TABLE questions ADD COLUMN {col_name} {col_def};")
        except sqlite3.OperationalError:
            pass

    # 5. Quizzes
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS quizzes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        material_id INTEGER NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        total_questions INTEGER NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );""")

    # 6. Quiz Questions
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS quiz_questions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        quiz_id INTEGER NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
        question TEXT NOT NULL,
        option_a TEXT NOT NULL,
        option_b TEXT NOT NULL,
        option_c TEXT NOT NULL,
        option_d TEXT NOT NULL,
        correct_option TEXT NOT NULL,
        explanation TEXT NOT NULL,
        topic TEXT,
        difficulty TEXT DEFAULT 'Medium'
    );""")

    try:
        cursor.execute("ALTER TABLE quiz_questions ADD COLUMN difficulty TEXT DEFAULT 'Medium';")
    except sqlite3.OperationalError:
        pass

    try:
        cursor.execute("ALTER TABLE quiz_questions ADD COLUMN question_type TEXT DEFAULT 'Scenario';")
    except sqlite3.OperationalError:
        pass

    try:
        cursor.execute("ALTER TABLE quiz_questions ADD COLUMN hint TEXT DEFAULT '';")
    except sqlite3.OperationalError:
        pass

    # 7. Quiz Results
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS quiz_results (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        quiz_id INTEGER REFERENCES quizzes(id) ON DELETE SET NULL,
        material_id INTEGER REFERENCES materials(id) ON DELETE SET NULL,
        score INTEGER NOT NULL,
        total INTEGER NOT NULL,
        percentage REAL NOT NULL,
        weak_topics_json TEXT,
        strong_topics_json TEXT,
        completed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );""")

    # 8. Flashcards
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS flashcards (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        material_id INTEGER NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
        front TEXT NOT NULL,
        back TEXT NOT NULL,
        category TEXT,
        status TEXT DEFAULT 'unreviewed',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );""")

    # 9. Tutor Conversations
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS tutor_conversations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        material_id INTEGER NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );""")

    # 10. Tutor Messages
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS tutor_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        conversation_id INTEGER NOT NULL REFERENCES tutor_conversations(id) ON DELETE CASCADE,
        sender TEXT NOT NULL,
        message TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );""")

    # 11. Study Plans
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS study_plans (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        material_id INTEGER REFERENCES materials(id) ON DELETE CASCADE,
        exam_date TEXT NOT NULL,
        days_remaining INTEGER NOT NULL,
        daily_minutes INTEGER NOT NULL,
        breakdown_json TEXT NOT NULL,
        schedule_json TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );""")

    # 12. Activity Logs
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS activity_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        activity_type TEXT NOT NULL,
        description TEXT NOT NULL,
        metadata_json TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );""")

    # Performance Indices
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_materials_created ON materials(created_at);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_materials_status ON materials(status);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_chunks_mat ON document_chunks(material_id);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_chunks_mat_page ON document_chunks(material_id, page_number);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_questions_mat_mark ON questions(material_id, mark_category);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_flashcards_mat ON flashcards(material_id);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_quiz_questions_quiz ON quiz_questions(quiz_id);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_tutor_msg_conv ON tutor_messages(conversation_id);")

    conn.commit()
    conn.close()

def log_activity(activity_type, description, metadata=None):
    try:
        conn = get_db_connection()
        conn.execute(
            "INSERT INTO activity_logs (activity_type, description, metadata_json) VALUES (?, ?, ?)",
            (activity_type, description, json.dumps(metadata) if metadata else None)
        )
        conn.commit()
        conn.close()
    except Exception as e:
        print(f"Warning: Could not log activity: {e}")

if __name__ == "__main__":
    init_db()
    print("Database initialized and migrated successfully.")
