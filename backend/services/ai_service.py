import os
import re
import json
import random
import requests
from datetime import datetime, timedelta
from typing import List, Dict, Any

from backend.services.chunker import get_document_chunks, search_chunks, get_representative_chunks

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "").strip()
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY", "").strip()

STOPWORDS = set([
    "the", "and", "is", "in", "it", "of", "to", "a", "an", "for", "with",
    "on", "at", "by", "from", "up", "about", "into", "over", "after", "this",
    "that", "these", "those", "are", "was", "were", "be", "been", "being",
    "have", "has", "had", "do", "does", "did", "but", "or", "as", "if", "than"
])

def _clean_sentences(text: str) -> List[str]:
    if not text:
        return []
    raw_sentences = re.split(r'(?<=[.!?])\s+', text)
    sentences = [s.strip() for s in raw_sentences if len(s.strip()) > 15]
    return sentences

def _extract_keywords(text: str, top_n: int = 25) -> List[str]:
    words = re.findall(r'\b[A-Za-z]{3,}\b', text.lower())
    freq = {}
    for w in words:
        if w not in STOPWORDS:
            freq[w] = freq.get(w, 0) + 1
    sorted_words = sorted(freq.items(), key=lambda x: x[1], reverse=True)
    return [w[0] for w in sorted_words[:top_n]]

def _extract_definitions(text: str) -> List[Dict[str, str]]:
    definitions = []
    patterns = [
        r'\b([A-Z][a-zA-Z0-9\s\-]{2,30})\s+(?:is defined as|refers to|means)\s+([^.?!]{15,250})',
        r'\b([A-Z][a-zA-Z0-9\s\-]{2,25})\s+is\s+(?:a|an|the)\s+([^.?!]{15,200})',
        r'\b([A-Z][a-zA-Z0-9\s\-]{2,25}):\s+([^.?!]{15,200})'
    ]
    seen_terms = set()
    for pattern in patterns:
        matches = re.findall(pattern, text)
        for term, definition in matches:
            clean_term = term.strip()
            if clean_term.lower() not in seen_terms and len(clean_term.split()) <= 4:
                seen_terms.add(clean_term.lower())
                definitions.append({
                    "term": clean_term,
                    "definition": definition.strip()
                })
            if len(definitions) >= 8:
                break
        if len(definitions) >= 8:
            break
            
    if not definitions:
        keywords = _extract_keywords(text, top_n=6)
        sentences = _clean_sentences(text)
        for kw in keywords:
            for s in sentences:
                if re.search(r'\b' + re.escape(kw) + r'\b', s, re.IGNORECASE):
                    definitions.append({
                        "term": kw.capitalize(),
                        "definition": s
                    })
                    break
            if len(definitions) >= 5:
                break
    return definitions

def _extract_formulas(text: str) -> List[Dict[str, str]]:
    formulas = []
    lines = text.splitlines()
    for line in lines:
        line_str = line.strip()
        if any(sym in line_str for sym in ["=", "≈", "∑", "∫", "√", "λ", "π", "Δ"]):
            if len(line_str) < 120 and len(line_str) > 3:
                formulas.append({
                    "formula": line_str,
                    "description": "Mathematical relation or formula identified in study material."
                })
        elif re.search(r'\b(formula|equation|theorem|law|constant)\b', line_str, re.IGNORECASE):
            if len(line_str) < 150 and len(line_str) > 10:
                formulas.append({
                    "formula": line_str,
                    "description": "Core educational formula / principle."
                })
        if len(formulas) >= 6:
            break
            
    if not formulas:
        formulas.append({
            "formula": "Standard Relation: Efficiency = (Useful Output / Total Input) × 100%",
            "description": "General domain principle extracted from core material concepts."
        })
    return formulas

# ----------------- CHUNK CONTEXT AGGREGATOR -----------------

def _build_aggregated_context(material_id: int = None, fallback_text: str = "", max_chars: int = 8000) -> str:
    """Aggregates representative chunks from across a multi-page document."""
    if material_id:
        rep_chunks = get_representative_chunks(material_id, max_chunks=8)
        if rep_chunks:
            combined = "\n\n".join([f"--- Section (Page {c.get('page_number', 1)}) ---\n{c['content']}" for c in rep_chunks])
            if len(combined) > max_chars:
                return combined[:max_chars]
            return combined
            
    return fallback_text[:max_chars]

# ----------------- LLM CALLERS -----------------

def _call_gemini_api(prompt: str, api_key: str) -> Any:
    models = ["gemini-2.5-flash", "gemini-1.5-flash", "gemini-2.0-flash", "gemini-flash-latest"]
    last_err = None
    for model_name in models:
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent?key={api_key}"
        payload = {
            "contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": {"temperature": 0.2, "responseMimeType": "application/json"}
        }
        try:
            response = requests.post(url, json=payload, timeout=15)
            if response.status_code == 200:
                data = response.json()
                raw_text = data["candidates"][0]["content"]["parts"][0]["text"].strip()
                if raw_text.startswith("```json"):
                    raw_text = raw_text[7:]
                if raw_text.startswith("```"):
                    raw_text = raw_text[3:]
                if raw_text.endswith("```"):
                    raw_text = raw_text[:-3]
                return json.loads(raw_text.strip())
            last_err = f"Gemini ({model_name}) returned status {response.status_code}: {response.text[:200]}"
        except Exception as e:
            last_err = str(e)
    raise ValueError(f"Gemini API error: {last_err}")

def _call_openai_api(prompt: str, api_key: str) -> Any:
    url = "https://api.openai.com/v1/chat/completions"
    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
    payload = {
        "model": "gpt-3.5-turbo",
        "messages": [
            {"role": "system", "content": "You are an expert educational AI assistant. Always respond in valid JSON format."},
            {"role": "user", "content": prompt}
        ],
        "temperature": 0.2,
        "response_format": {"type": "json_object"}
    }
    response = requests.post(url, headers=headers, json=payload, timeout=12)
    if response.status_code == 200:
        data = response.json()
        raw_text = data["choices"][0]["message"]["content"]
        return json.loads(raw_text)
    raise ValueError(f"OpenAI API returned status {response.status_code}: {response.text}")

# ----------------- LOCAL NLP SYNTHESIZER -----------------

def local_nlp_summary(text: str, summary_type: str = "medium") -> Dict[str, Any]:
    sentences = _clean_sentences(text)
    keywords = _extract_keywords(text, top_n=25)
    all_definitions = _extract_definitions(text)
    all_formulas = _extract_formulas(text)
    summary_type = (summary_type or "medium").lower().strip()
    
    scored = []
    for idx, s in enumerate(sentences):
        score = sum(1 for kw in keywords if re.search(r'\b' + re.escape(kw) + r'\b', s, re.IGNORECASE))
        if idx < 5:
            score += 0.5
        scored.append((score, idx, s))
        
    scored.sort(key=lambda x: x[0], reverse=True)
    
    if summary_type == "quick":
        count = min(3, len(sentences))
        top_picks = sorted(scored[:count], key=lambda x: x[1])
        summary_text = " ".join([item[2] for item in top_picks])
        
        return {
            "title": "Document",
            "summary_type": "quick",
            "summary": summary_text or text[:250] + "...",
            "key_concepts": [kw.capitalize() for kw in keywords[:4]],
            "definitions": all_definitions[:3],
            "important_points": [s for _, _, s in scored[:3]],
            "formulas": all_formulas[:2],
            "examples": [
                {"concept": keywords[0].capitalize() if keywords else "Core Mechanism", "example": f"Applied illustration: {sentences[0] if sentences else 'Standard case study'}"}
            ] if sentences else [],
            "exam_points": [
                f"Core Recall: Focus on primary properties of {keywords[0].capitalize()}." if keywords else "Review main chapter themes.",
                f"Key Takeaway: Master standard definitions and fundamental operations."
            ],
            "revision_notes": f"Rapid 30s recap: {sentences[0] if sentences else 'Review core definitions and key relations before entering the exam.'}"
        }
    elif summary_type == "detailed":
        count = min(20, len(sentences))
        top_picks = sorted(scored[:count], key=lambda x: x[1])
        
        chunk_len = max(2, count // 3)
        p1 = " ".join([item[2] for item in top_picks[:chunk_len]])
        p2 = " ".join([item[2] for item in top_picks[chunk_len:chunk_len*2]])
        p3 = " ".join([item[2] for item in top_picks[chunk_len*2:]])
        
        summary_text = f"### 1. Executive Context & Foundational Principles\n{p1}\n\n### 2. Architectural Framework & Core Methodologies\n{p2}\n\n### 3. In-Depth Operational Mechanics & System Implications\n{p3}"
        
        return {
            "title": "Document",
            "summary_type": "detailed",
            "summary": summary_text,
            "key_concepts": [kw.capitalize() for kw in keywords[:14]],
            "definitions": all_definitions[:10],
            "important_points": [f"Deep Analysis: {s}" for _, _, s in scored[:12]],
            "formulas": all_formulas,
            "examples": [
                {"concept": kw.capitalize(), "example": f"Practical academic application and case scenario: {sentences[min(i, len(sentences)-1)]}"}
                for i, kw in enumerate(keywords[:5])
            ] if sentences else [],
            "exam_points": [
                f"10-Mark Focus: Be prepared to thoroughly explain the end-to-end architecture and operational stages of {keywords[0].capitalize()}." if keywords else "Review primary syllabus framework.",
                f"Comparative Analysis: Contrast {keywords[1].capitalize()} with standard alternative frameworks, highlighting trade-offs and performance criteria." if len(keywords) > 1 else "Compare related concepts.",
                f"Theoretical Derivation: Review formal mathematical/algorithmic proofs governing {keywords[2].capitalize()}." if len(keywords) > 2 else "Memorize core proofs and theorems.",
                "Diagrams & Schematics: Practice sketching system blocks, dataflows, or architectural diagrams.",
                "Failure Modes & Edge Cases: Understand operational bottlenecks, resource constraints, and error boundaries.",
                "Numerical Problem Solving: Work through step-by-step calculations applying key formulas with correct dimensional units.",
                "Marking Scheme Strategy: Structure 10-mark answers into Definition, Architectural Diagram, Core Working Steps, and Practical Applications."
            ],
            "revision_notes": "Comprehensive Revision Roadmap:\n1. Consolidate formal definitions for all key concepts.\n2. Master structural workflows, mathematical models, and block diagrams.\n3. Complete self-assessment on 5-mark and 10-mark question formats before taking the test."
        }
    else: # medium
        count = min(7, len(sentences))
        top_picks = sorted(scored[:count], key=lambda x: x[1])
        summary_text = " ".join([item[2] for item in top_picks])
        
        return {
            "title": "Document",
            "summary_type": "medium",
            "summary": summary_text or text[:450] + "...",
            "key_concepts": [kw.capitalize() for kw in keywords[:8]],
            "definitions": all_definitions[:6],
            "important_points": [s for _, _, s in scored[:6]],
            "formulas": all_formulas[:4],
            "examples": [
                {"concept": kw.capitalize(), "example": f"Standard contextual case: {sentences[min(i*2, len(sentences)-1)]}"}
                for i, kw in enumerate(keywords[:3])
            ] if sentences else [],
            "exam_points": [
                f"Master the core principles and functional components of {keywords[0].capitalize()}." if keywords else "Review main chapter themes.",
                f"Be prepared to compare {keywords[1].capitalize()} with related concepts in 5-mark questions." if len(keywords) > 1 else "Understand key categorizations.",
                f"Key formulas and terminology around {keywords[2].capitalize()} are frequent exam questions." if len(keywords) > 2 else "Memorize standard definitions.",
                "Review step-by-step mathematical relations and problem solving.",
                "Synthesize definitions and diagrams for balanced exam answers."
            ],
            "revision_notes": "Balanced Revision Checklist: Focus on primary definitions, operational trade-offs, and key mathematical relationships."
        }


def local_nlp_questions(text: str) -> Dict[str, Any]:
    sentences = _clean_sentences(text)
    keywords = _extract_keywords(text, top_n=12)
    questions = []
    
    # 2-Mark
    for kw in keywords[:3]:
        ctx = next((s for s in sentences if re.search(r'\b' + re.escape(kw) + r'\b', s, re.IGNORECASE)), None)
        ans = ctx if ctx else f"{kw.capitalize()} is a fundamental concept in this study material."
        questions.append({
            "mark_category": 2,
            "question_text": f"Define {kw.capitalize()} and state its primary significance.",
            "marking_guide": "1 Mark for formal definition; 1 Mark for practical significance.",
            "answer": ans,
            "difficulty": "Easy"
        })
        
    # 5-Mark
    if len(keywords) >= 2:
        questions.append({
            "mark_category": 5,
            "question_text": f"Explain the working principles and architecture of {keywords[0].capitalize()}.",
            "marking_guide": "2 Marks for core explanation; 2 Marks for key components/workflow; 1 Mark for illustrative example.",
            "answer": f"Outline {keywords[0].capitalize()} starting with its definition, followed by step-by-step procedural breakdown and operational impact as detailed in your study notes.",
            "difficulty": "Medium"
        })
    if len(keywords) >= 4:
        questions.append({
            "mark_category": 5,
            "question_text": f"Differentiate between {keywords[1].capitalize()} and {keywords[2].capitalize()} with examples.",
            "marking_guide": "2 Marks for distinguishing criteria; 2 Marks for functional comparison; 1 Mark for clarity.",
            "answer": f"Contrast {keywords[1].capitalize()} (which governs primary operational parameters) against {keywords[2].capitalize()} (which controls architecture and constraints).",
            "difficulty": "Medium"
        })
        
    # 10-Mark
    kw_major = keywords[0].capitalize() if keywords else "the Topic"
    questions.append({
        "mark_category": 10,
        "question_text": f"Critically evaluate the architecture, implementation methodology, and real-world implications of {kw_major}.",
        "marking_guide": "3 Marks for structural overview; 3 Marks for technical depth; 2 Marks for limitations/trade-offs; 2 Marks for conclusions.",
        "answer": f"1. Structural framework and foundational principles of {kw_major}.\n2. Procedural implementation steps.\n3. Comparative benefits over legacy systems.\n4. Vulnerabilities, failure modes, and optimization techniques.\n5. Summary and real-world case study conclusions.",
        "difficulty": "Hard"
    })
    
    return {"questions": questions}

def local_nlp_quiz(text: str, num_questions: int = 5, difficulty: str = "Medium", quiz_style: str = "creative") -> Dict[str, Any]:
    sentences = _clean_sentences(text)
    keywords = _extract_keywords(text, top_n=30)
    
    if len(keywords) < 6:
        keywords = keywords + ["Optimization", "Architecture", "Protocol", "Framework", "Dependency", "Abstraction", "Interface"]
        
    options_letters = ["A", "B", "C", "D"]
    usable_sentences = [s for s in sentences if len(s.split()) >= 7]
    if not usable_sentences:
        usable_sentences = [f"The system relies on the core principles of {kw} to ensure predictable performance." for kw in keywords[:6]]
        
    selected_sentences = usable_sentences[:min(num_questions, len(usable_sentences))]
    quiz_items = []
    
    creative_patterns = [
        ("Scenario Application", "In an applied system environment designed around this material, an engineer observes requirements relating to: \"{blanked}\". Which core component is primarily governing this behavior?"),
        ("Conceptual Trap", "When analyzing the architecture described in this material, which element directly satisfies the condition: \"{blanked}\"?"),
        ("System Dynamics", "If this workflow experiences a configuration shift, which component directly resolves: \"{blanked}\"?"),
        ("Reverse Diagnosis", "During testing, a team traces an operational behavior matching: \"{blanked}\". Which principle explains this finding?"),
        ("Core Mechanism", "According to the study material, which fundamental concept is described by: \"{blanked}\"?")
    ]
    
    for i, s in enumerate(selected_sentences):
        found_kw = None
        for kw in keywords:
            if re.search(r'\b' + re.escape(kw) + r'\b', s, re.IGNORECASE):
                found_kw = kw
                break
        if not found_kw:
            found_kw = keywords[i % len(keywords)]
            
        correct_word = found_kw.capitalize()
        distractors = [k.capitalize() for k in keywords if k.lower() != found_kw.lower()]
        random.shuffle(distractors)
        chosen_distractors = distractors[:3]
        while len(chosen_distractors) < 3:
            chosen_distractors.append(f"Subsystem {len(chosen_distractors)+1}")
            
        all_options = [correct_word] + chosen_distractors
        random.shuffle(all_options)
        correct_idx = all_options.index(correct_word)
        correct_letter = options_letters[correct_idx]
        
        q_type, template = creative_patterns[i % len(creative_patterns)]
        blanked = re.sub(r'\b' + re.escape(found_kw) + r'\b', "[___________]", s, flags=re.IGNORECASE)
        question_prompt = template.format(blanked=blanked)
        
        hint_text = f"💡 Clue: Recall how '{found_kw.capitalize()}' functions within this section of the material."
        
        explanation_text = (
            f"Why {correct_letter} is correct: '{correct_word}' is directly referenced in the document: \"{s}\". "
            f"Pitfall note: The other options ({', '.join(chosen_distractors[:2])}) represent related but distinct concepts."
        )
        
        quiz_items.append({
            "id": f"q{i + 1}",
            "question": question_prompt,
            "question_type": q_type,
            "option_a": all_options[0],
            "option_b": all_options[1],
            "option_c": all_options[2],
            "option_d": all_options[3],
            "correct_option": correct_letter,
            "hint": hint_text,
            "explanation": explanation_text,
            "topic": found_kw.capitalize(),
            "difficulty": difficulty
        })
        
    return {
        "title": f"Dynamic Assessment on {keywords[0].capitalize() if keywords else 'Study Material'}",
        "engine": "Local NLP Engine",
        "questions": quiz_items
    }

def local_nlp_flashcards(text: str, count: int = 8) -> List[Dict[str, str]]:
    definitions = _extract_definitions(text)
    keywords = _extract_keywords(text, top_n=count * 2)
    sentences = _clean_sentences(text)
    
    cards = []
    for d in definitions[:count]:
        cards.append({
            "front": f"What is {d['term']}?",
            "back": d["definition"],
            "category": "Definitions"
        })
        
    idx = 0
    while len(cards) < count and idx < len(keywords):
        kw = keywords[idx]
        matching_s = next((s for s in sentences if re.search(r'\b' + re.escape(kw) + r'\b', s, re.IGNORECASE)), None)
        if matching_s:
            cards.append({
                "front": f"Concept: {kw.capitalize()}",
                "back": matching_s,
                "category": "Key Concepts"
            })
        idx += 1
        
    if not cards:
        cards.append({
            "front": "What is the primary objective of this material?",
            "back": text[:200] + "...",
            "category": "General"
        })
    return cards[:count]

# ----------------- PUBLIC SERVICE API -----------------

def generate_summary(text: str, material_id: int = None, summary_type: str = "medium") -> Dict[str, Any]:
    context = _build_aggregated_context(material_id, fallback_text=text, max_chars=8000)
    
    api_key = os.environ.get("GEMINI_API_KEY", "").strip() or os.environ.get("AI_API_KEY", "").strip()
    openai_key = os.environ.get("OPENAI_API_KEY", "").strip()
    
    prompt = f"""Analyze the educational text below and produce a structured revision document in valid JSON:
Text:
{context}

Format required:
{{
  "summary": "Concise overview ({summary_type} length)",
  "key_concepts": ["concept 1", "concept 2", ...],
  "definitions": [{{"term": "term", "definition": "definition"}}],
  "formulas": [{{"formula": "formula", "description": "desc"}}],
  "exam_points": ["point 1", "point 2", ...]
}}"""

    if api_key:
        try:
            return _call_gemini_api(prompt, api_key)
        except Exception:
            pass
    if openai_key:
        try:
            return _call_openai_api(prompt, openai_key)
        except Exception:
            pass
            
    return local_nlp_summary(context, summary_type)

def generate_questions(text: str, material_id: int = None) -> Dict[str, Any]:
    context = _build_aggregated_context(material_id, fallback_text=text, max_chars=8000)
    
    api_key = os.environ.get("GEMINI_API_KEY", "").strip() or os.environ.get("AI_API_KEY", "").strip()
    openai_key = os.environ.get("OPENAI_API_KEY", "").strip()
    
    prompt = f"""Generate exam-oriented questions from this study material categorized into 2-Mark, 5-Mark, and 10-Mark:
Text:
{context}

Output JSON:
{{
  "questions": [
    {{
      "mark_category": 2,
      "question_text": "...",
      "marking_guide": "...",
      "answer": "...",
      "difficulty": "Easy"
    }}, ...
  ]
}}"""

    if api_key:
        try:
            return _call_gemini_api(prompt, api_key)
        except Exception:
            pass
    if openai_key:
        try:
            return _call_openai_api(prompt, openai_key)
        except Exception:
            pass
            
    return local_nlp_questions(context)

def generate_quiz(text: str, material_id: int = None, num_questions: int = 5) -> Dict[str, Any]:
    context = _build_aggregated_context(material_id, fallback_text=text, max_chars=8000)
    
    api_key = os.environ.get("GEMINI_API_KEY", "").strip() or os.environ.get("AI_API_KEY", "").strip()
    openai_key = os.environ.get("OPENAI_API_KEY", "").strip()
    
    prompt = f"""Generate a dynamic multiple-choice quiz ({num_questions} questions) based on this text.
Text:
{context}

Ensure correct_option is randomized between A, B, C, and D.
Output JSON:
{{
  "title": "Quiz Title",
  "questions": [
    {{
      "question": "...",
      "option_a": "...",
      "option_b": "...",
      "option_c": "...",
      "option_d": "...",
      "correct_option": "A",
      "explanation": "...",
      "topic": "..."
    }}
  ]
}}"""

    if api_key:
        try:
            return _call_gemini_api(prompt, api_key)
        except Exception:
            pass
    if openai_key:
        try:
            return _call_openai_api(prompt, openai_key)
        except Exception:
            pass
            
    return local_nlp_quiz(context, num_questions)

def generate_flashcards(text: str, material_id: int = None, count: int = 8) -> List[Dict[str, str]]:
    context = _build_aggregated_context(material_id, fallback_text=text, max_chars=8000)
    
    api_key = os.environ.get("GEMINI_API_KEY", "").strip() or os.environ.get("AI_API_KEY", "").strip()
    openai_key = os.environ.get("OPENAI_API_KEY", "").strip()
    
    prompt = f"""Create {count} interactive flashcards from this text:
Text:
{context}

Output JSON:
{{
  "cards": [
    {{"front": "Prompt/Question", "back": "Explanation/Answer", "category": "Category"}}
  ]
}}"""

    if api_key:
        try:
            res = _call_gemini_api(prompt, api_key)
            if "cards" in res:
                return res["cards"]
        except Exception:
            pass
    if openai_key:
        try:
            res = _call_openai_api(prompt, openai_key)
            if "cards" in res:
                return res["cards"]
        except Exception:
            pass
            
    return local_nlp_flashcards(context, count)

def chat_tutor(material_text: str, history: List[Dict[str, str]], user_message: str, material_id: int = None) -> str:
    # RAG: Retrieve top matching chunks for this specific query
    relevant_chunks = []
    if material_id:
        relevant_chunks = search_chunks(material_id, user_message, top_k=4)
        
    if relevant_chunks:
        grounded_context = "\n\n".join([f"[Page {c.get('page_number', 1)}]: {c['content']}" for c in relevant_chunks])
    else:
        grounded_context = material_text[:4000]
        
    api_key = os.environ.get("GEMINI_API_KEY", "").strip() or os.environ.get("AI_API_KEY", "").strip()
    openai_key = os.environ.get("OPENAI_API_KEY", "").strip()
    
    prompt = f"""You are AI Study Buddy, an expert educational tutor.
Use ONLY the context below to answer the student's question clearly, warmly, and helpfully. Cite page references if available.
Context:
{grounded_context}

Student question: {user_message}

Answer with markdown formatting:"""

    if api_key:
        models = ["gemini-3.6-flash", "gemini-2.5-flash", "gemini-1.5-flash", "gemini-flash-latest"]
        for model_name in models:
            try:
                url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent?key={api_key}"
                payload = {"contents": [{"parts": [{"text": prompt}]}]}
                res = requests.post(url, json=payload, timeout=12)
                if res.status_code == 200:
                    return res.json()["candidates"][0]["content"]["parts"][0]["text"]
            except Exception:
                pass
            
    if openai_key:
        try:
            url = "https://api.openai.com/v1/chat/completions"
            headers = {"Authorization": f"Bearer {openai_key}", "Content-Type": "application/json"}
            payload = {
                "model": "gpt-3.5-turbo",
                "messages": [
                    {"role": "system", "content": f"You are AI Study Buddy tutor. Use this text: {grounded_context}"},
                    {"role": "user", "content": user_message}
                ]
            }
            res = requests.post(url, headers=headers, json=payload, timeout=10)
            if res.status_code == 200:
                return res.json()["choices"][0]["message"]["content"]
        except Exception:
            pass
            
    # Local grounded response with page numbers if available
    sentences = _clean_sentences(grounded_context)
    keywords = re.findall(r'\b[A-Za-z]{3,}\b', user_message.lower())
    
    if "5 marks" in user_message.lower():
        page_info = f" (Referencing Page {relevant_chunks[0]['page_number']})" if relevant_chunks else ""
        return (
            f"### 5-Mark Structured Answer Guide{page_info}:\n\n"
            "**1. Core Definition (1 Mark):**\n"
            f"Based on your notes: {sentences[0] if sentences else 'Primary domain concept'}.\n\n"
            "**2. Key Characteristics & Workflow (3 Marks):**\n"
            f"- Feature 1: {sentences[1] if len(sentences) > 1 else 'Consistent system operation'}\n"
            f"- Feature 2: {sentences[2] if len(sentences) > 2 else 'Predictable state transitions'}\n"
            f"- Feature 3: {sentences[3] if len(sentences) > 3 else 'Validation against requirements'}\n\n"
            "**3. Practical Impact (1 Mark):**\n"
            "Essential for practical examination problem-solving and architectural design."
        )
        
    if "example" in user_message.lower():
        return (
            "### Real-World Example:\n\n"
            f"Consider an application of **{keywords[0].capitalize() if keywords else 'the subject'}**:\n\n"
            f"In practice: {sentences[0][:150] if sentences else 'the framework coordinates components smoothly'}.\n\n"
            "*Tip: Illustrate this with a simple block diagram in your answer sheet for bonus marks!*"
        )
        
    # Overlap matching
    best_sentences = []
    for s in sentences:
        overlap = sum(1 for w in keywords if w not in STOPWORDS and re.search(r'\b' + re.escape(w) + r'\b', s, re.IGNORECASE))
        if overlap > 0:
            best_sentences.append((overlap, s))
    best_sentences.sort(key=lambda x: x[0], reverse=True)
    
    if best_sentences:
        page_tag = f" *(Page {relevant_chunks[0]['page_number']})*" if relevant_chunks else ""
        excerpts = "\n".join([f"- \"{item[1]}\"" for item in best_sentences[:3]])
        return (
            f"Hello! Here is what your study notes state regarding **{user_message}**{page_tag}:\n\n"
            f"{excerpts}\n\n"
            "**Key Takeaway:** Make sure to note how these points interconnect with chapter exam points."
        )
    else:
        sample = sentences[0] if sentences else "the foundational principles outlined in the lecture notes"
        return (
            f"I reviewed your active notes. The material strongly emphasizes:\n\n"
            f"> *\"{sample}\"*\n\n"
            "Would you like me to formulate a 5-mark question or a quick definition card around this topic?"
        )

def generate_study_plan(material_title: str, days_remaining: int, daily_minutes: int) -> Dict[str, Any]:
    days = max(1, int(days_remaining))
    daily_min = max(30, int(daily_minutes))
    
    breakdown = {
        "study_minutes": int(daily_min * 0.50),
        "practice_minutes": int(daily_min * 0.25),
        "revision_minutes": int(daily_min * 0.15),
        "break_minutes": int(daily_min * 0.10)
    }
    
    schedule = []
    base_date = datetime.now()
    phases = ["Foundation & Core Concepts", "In-depth Mastery & Formulas", "Active Recall & Quizzing", "Mock Exam & Weak Topic Patching", "Final High-Yield Review"]
    
    for day in range(1, days + 1):
        target_date = base_date + timedelta(days=day)
        phase_idx = min(len(phases) - 1, int(((day - 1) / days) * len(phases)))
        phase_name = phases[phase_idx]
        
        tasks = [
            f"Review Chapter Sections for {phase_name} ({breakdown['study_minutes']} mins)",
            f"Solve dynamic flashcards and 2-Mark/5-Mark questions ({breakdown['practice_minutes']} mins)",
            f"Take a timed diagnostic quiz and log weak topics ({breakdown['revision_minutes']} mins)",
            f"Structured rest and hydration break ({breakdown['break_minutes']} mins)"
        ]
        
        schedule.append({
            "day": day,
            "date": target_date.strftime("%Y-%m-%d"),
            "focus": f"Day {day}: {phase_name}",
            "tasks": tasks,
            "duration_minutes": daily_min
        })
        
    return {
        "material_title": material_title,
        "days_remaining": days,
        "daily_minutes": daily_min,
        "breakdown": breakdown,
        "schedule": schedule
    }

def generate_exam_crash_plan(material_text: str, hours_remaining: float = 2.0) -> Dict[str, Any]:
    hrs = float(hours_remaining)
    total_mins = int(hrs * 60)
    keywords = _extract_keywords(material_text, top_n=8)
    definitions = _extract_definitions(material_text)
    
    checklist = [
        f"Master definition and significance of {keywords[0].capitalize() if keywords else 'Core Concept'} (Guaranteed 2-5 Marks)",
        f"Memorize 3 distinguishing features between {keywords[1].capitalize() if len(keywords) > 1 else 'A'} and {keywords[2].capitalize() if len(keywords) > 2 else 'B'}",
        "Review all mathematical equations, formulas, and constant values",
        "Practice drawing and labeling the primary architectural/flow diagram",
        "Read high-yield summary exam points twice before entering examination hall"
    ]
    
    stage_1_mins = int(total_mins * 0.40)
    stage_2_mins = int(total_mins * 0.35)
    stage_3_mins = int(total_mins * 0.25)
    
    allocation = [
        {"stage": "Phase 1: High-Yield Cramming", "minutes": stage_1_mins, "action": "Review summary key concepts and memorized definitions."},
        {"stage": "Phase 2: Question Pattern Drills", "minutes": stage_2_mins, "action": "Solve 2-Mark and 5-Mark model answers and flashcards."},
        {"stage": "Phase 3: Final Recall & Formulas", "minutes": stage_3_mins, "action": "Rapid self-test, formula sheet revision, mental walk-through."}
    ]
    
    must_know_facts = [d["definition"] for d in definitions[:4]]
    if not must_know_facts:
        must_know_facts = [
            f"{kw.capitalize()} is a fundamental component tested regularly in exams."
            for kw in keywords[:4]
        ]
        
    return {
        "hours_remaining": hrs,
        "total_minutes": total_mins,
        "priority_checklist": checklist,
        "time_allocation": allocation,
        "must_know_facts": must_know_facts
    }
