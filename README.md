# AI Study Buddy – Personalized AI Learning Assistant

AI Study Buddy is an AI-powered educational web application that turns raw study materials (PDFs, DOCX, TXT) into structured revision notes, exam-oriented questions, dynamic quizzes, 3D interactive flashcards, date-aware timetables, and context-grounded AI tutoring.

---

## 🚀 Key Features & Modules

1. **Multi-Document Upload & Collision Immunity**:
   - Supports selecting and uploading multiple PDFs/DOCX/TXT files sequentially with live progress indicators.
   - Generates collision-proof filenames (`{timestamp}_{uuid}_{filename}`) so files never overwrite each other.
   - Material library management with preview drawer and deletion.

2. **AI Summary & Revision Notes**:
   - Generates Quick Overview, Key Concepts, Formal Definitions, Mathematical Formulas, and High-Yield Exam Points.
   - Selectable Quick (30s), Medium, and Detailed lengths with instant Copy and Markdown file export.

3. **Important Questions Engine**:
   - Categorized into 2-Mark (Definitions), 5-Mark (Explanations/Diagrams), and 10-Mark (In-depth essays).
   - Includes detailed marking schemes and model answer guides.

4. **Dynamic AI Quiz Engine**:
   - Generates 4-option MCQs with randomized correct indices (no hardcoded answers).
   - Real-time countdown timer, instant green/red feedback, explanations, and automatic diagnostic of **Weak Topics** vs. **Strong Topics**.

5. **Interactive 3D Flashcards**:
   - 3D card flip with concept prompts on the front and explanations on the back.
   - Tracks "Got It" (known) and "Needs Practice" (difficult) with persistent mastery metrics.

6. **Context-Aware AI Tutor**:
   - Chat strictly grounded in the selected material with starter chips (*"Explain for 5 marks"*, *"Give an example"*, *"Common mistakes"*).

7. **Date-Aware Study Planner**:
   - Computes real calendar day difference from today to the target exam date.
   - Balances daily time across 50% Core Study, 25% Practice, 15% Revision, and 10% Breaks.

8. **Adaptive Last-Minute Exam Mode**:
   - Emergency crash planner adapting to entered hours remaining (0.5h panic, 2h standard, 6h deep review) with prioritized checklists.

9. **Learning Progress & Analytics**:
   - Live KPI cards (Average Score %, Flashcards Mastered, Study Time, Materials Count).
   - Diagnostic Weak Topic and Strong Topic badges, with automatic revision alerts.

10. **Dual-Engine AI Architecture & Security**:
    - Real-time LLM support for Google Gemini API (`GEMINI_API_KEY`) and OpenAI API (`OPENAI_API_KEY`).
    - Built-in Educational NLP rule-based synthesizer ensuring 100% functionality offline or without API keys (zero broken buttons).

---

## 🛠️ Tech Stack & Architecture

- **Frontend**: Vanilla ES6+ JavaScript, Semantic HTML5, Modern CSS3 with CSS Custom Properties, Responsive Flexbox & Grid, 3D CSS transforms (no build steps or bundlers required).
- **Backend**: Python 3 / Flask REST API with Blueprints, CORS enabled, Gunicorn WSGI production server.
- **Database**: SQLite3 (`database/study_buddy.db`) with 11 relational schemas and indexed queries.
- **Document Processing**: `pypdf` (multi-page PDF parser), `python-docx` (Word documents and tables), multi-encoding text reader (`utf-8`, `latin-1`).
- **Zero Hardcoded Localhost**: `frontend/js/api.js` uses dynamic `window.location.origin`, running identically on `http://127.0.0.1:5000` and `https://<your-app>.onrender.com`.

---

## 📁 File Structure

```
ai-study-buddy/
├── wsgi.py                    # Production WSGI entrypoint for Gunicorn (app = create_app())
├── render.yaml                # Render Blueprint configuration
├── requirements.txt           # Dependencies: flask, flask-cors, python-dotenv, pypdf, python-docx, requests, gunicorn
├── .env.example               # Template for environment variables (PORT, GEMINI_API_KEY, OPENAI_API_KEY)
├── .env                       # Local environment variables
├── .gitignore                 # Excludes .env, venv/, uploads/, database/*.db, __pycache__/
├── README.md                  # Complete documentation
├── backend/
│   ├── app.py                 # Flask application factory, CORS, static server, /health & /api/status endpoints
│   ├── database.py            # SQLite schema manager, connection factory, activity logger (11 schemas)
│   ├── routes/
│   │   ├── materials.py       # POST /api/materials/upload, GET /api/materials, GET/DELETE /api/materials/<id>
│   │   ├── ai_features.py     # Summary, questions, quiz, flashcards, tutor endpoints
│   │   ├── planner.py         # Date-aware study planner and exam ready mode endpoints
│   │   └── progress.py        # Analytics aggregator, weak/strong topics, global search
│   └── services/
│       ├── extractor.py       # Multi-format text extraction (PDF, DOCX, TXT)
│       └── ai_service.py      # Resilient dual-engine AI (Gemini, OpenAI, and Local NLP fallback)
├── frontend/
│   ├── index.html             # Accessible dashboard, 10 core sections, modals, toast container
│   ├── css/
│   │   ├── style.css          # Core brand styles (#4f46e5, #7c3aed, #f4f7fb), 3D flip card, quiz states
│   │   └── responsive.css     # Mobile drawer navigation, responsive cards, tablet layout
│   └── js/
│       ├── api.js             # Dynamic origin API client (works locally and on Render HTTPS)
│       ├── app.js             # Global state, navigation routing, active material synchronization
│       ├── dashboard.js       # Stat cards, quick actions, weak topic recommendation alerts
│       ├── materials.js       # Drag & drop, sequential multi-file upload progress, material cards
│       ├── summary.js         # Short/Medium/Detailed summaries, definitions, formulas, export
│       ├── questions.js       # 2-Mark, 5-Mark, 10-Mark tabs, difficulty badges, marking guides
│       ├── quiz.js            # Dynamic MCQs, 4 options, explanations, timer, weak topic breakdown
│       ├── flashcards.js      # 3D interactive flip cards, "Got It" vs "Needs Practice" tracking
│       ├── tutor.js           # Context-aware chat grounded in active notes, prompt suggestions
│       ├── planner.js         # Date-difference calendar calculations, study/practice/break breakdown
│       ├── exam.js            # Time-adaptive crash plan (0.5h, 2h, 6h) with prioritized checklists
│       └── progress.js        # Analytics bars, weak/strong topic badges, performance history
├── database/
│   └── study_buddy.db         # Persistent SQLite database
├── uploads/
│   └── .gitkeep               # Preserves folder in Git while ignoring uploaded user documents
└── tests/
    └── test_system.py         # 15 automated test cases covering every feature and endpoint
```

---

## ⚡ Quickstart Commands

### 1. Install Dependencies
```bash
pip install -r requirements.txt
```

### 2. Run Locally
Development Server:
```bash
python backend/app.py
```
Or via WSGI:
```bash
python wsgi.py
```
App URL: **http://127.0.0.1:5000**

### 3. Run Automated Test Suite
```bash
python tests/test_system.py
```

---

## 🌐 Render Cloud Deployment

- **Build Command**: `pip install -r requirements.txt`
- **Start Command**: `gunicorn wsgi:app`
- **Health Check Path**: `/health`
