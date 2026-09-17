import os
import re
import requests
from flask import Blueprint, request, jsonify

settings_bp = Blueprint("settings", __name__)

ENV_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), ".env")

def mask_key(key: str) -> str:
    if not key or len(key) < 8:
        return ""
    return f"{key[:6]}...{key[-4:]}"

def save_env_var(key_name: str, key_val: str):
    """Persists an environment variable to the .env file and updates os.environ."""
    cleaned_val = key_val.strip().strip("'\"") if key_val else ""
    os.environ[key_name] = cleaned_val
    
    lines = []
    if os.path.exists(ENV_PATH):
        with open(ENV_PATH, "r", encoding="utf-8") as f:
            lines = f.readlines()
            
    found = False
    new_lines = []
    for line in lines:
        if line.startswith(f"{key_name}="):
            new_lines.append(f"{key_name}={cleaned_val}\n")
            found = True
        else:
            new_lines.append(line)
            
    if not found:
        new_lines.append(f"{key_name}={cleaned_val}\n")
        
    with open(ENV_PATH, "w", encoding="utf-8") as f:
        f.writelines(new_lines)

AI_STATUS = {
    "is_online": False,
    "mode": "offline",
    "verified_engine": None,
    "verified_model": None,
    "last_error": None,
    "checked": False
}

def _verify_key(engine: str, key: str):
    import time
    start_time = time.time()
    key = (key or "").strip().strip("'\"")

    if engine == "gemini":
        if not key:
            return {"success": False, "error": "No Gemini API key provided to test."}

        models_to_try = [
            "gemini-2.5-flash",
            "gemini-1.5-flash",
            "gemini-2.0-flash",
            "gemini-1.5-flash-8b",
            "gemini-1.5-pro",
            "gemini-flash-latest"
        ]
        payload = {"contents": [{"parts": [{"text": "Reply with 'OK'."}]}]}
        last_error = "Unknown error"

        for model_name in models_to_try:
            url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent?key={key}"
            try:
                res = requests.post(url, json=payload, timeout=8)
                latency_ms = int((time.time() - start_time) * 1000)
                if res.status_code == 200:
                    return {
                        "success": True,
                        "model": model_name,
                        "latency_ms": latency_ms,
                        "message": f"Google Gemini ({model_name}) connection successful! Model is online & ready."
                    }
                err_data = res.json().get("error", {}) if res.headers.get("content-type", "").startswith("application/json") else {}
                last_error = err_data.get("message") or f"HTTP {res.status_code}: {res.text[:120]}"
            except Exception as e:
                last_error = str(e)

        if "quota" in last_error.lower() or "429" in last_error or "rate" in last_error.lower():
            return {
                "success": False,
                "error": f"Quota/Rate Limit Exceeded: Google's free tier for this API key reached its temporary request limit. Please wait 30-60 seconds, or create an API key under a fresh project in Google AI Studio, or switch to OpenAI."
            }

        if "invalid authentication credentials" in last_error.lower() or "401" in last_error:
            if not key.startswith("AIzaSy"):
                prefix = key[:7] if len(key) >= 7 else key
                return {
                    "success": False,
                    "error": f"Invalid Key Format ('{prefix}...'): Google Gemini API requires a free API key from Google AI Studio starting with 'AIzaSy...'. (OAuth or bearer tokens are not accepted by the public Gemini API). Get a free key at https://aistudio.google.com/app/apikey"
                }
            return {
                "success": False,
                "error": "Google Gemini rejected this key (401 Unauthorized). Please check your key at https://aistudio.google.com/app/apikey"
            }

        return {"success": False, "error": f"Gemini rejected key: {last_error}"}

    elif engine == "openai":
        if not key:
            return {"success": False, "error": "No OpenAI API key provided to test."}

        url = "https://api.openai.com/v1/models"
        headers = {"Authorization": f"Bearer {key}"}
        try:
            res = requests.get(url, headers=headers, timeout=8)
            latency_ms = int((time.time() - start_time) * 1000)
            if res.status_code == 200:
                return {
                    "success": True,
                    "model": "gpt-4o-mini",
                    "latency_ms": latency_ms,
                    "message": "OpenAI API connection successful! Models verified."
                }
            return {"success": False, "error": f"OpenAI rejected key: {res.text[:120]}"}
        except Exception as e:
            return {"success": False, "error": f"Connection failed: {str(e)}"}

    return {"success": False, "error": "Unknown engine selected."}

@settings_bp.route("/api/settings", methods=["GET"])
def get_settings():
    gemini_key = os.environ.get("GEMINI_API_KEY", "").strip() or os.environ.get("AI_API_KEY", "").strip()
    openai_key = os.environ.get("OPENAI_API_KEY", "").strip()
    preferred_engine = os.environ.get("PREFERRED_AI_ENGINE", "gemini").strip().lower()

    # If first check and we have a key, check if it's already verified online
    if not AI_STATUS["checked"]:
        AI_STATUS["checked"] = True
        candidate_key = gemini_key if preferred_engine == "gemini" else openai_key
        cand_engine = preferred_engine if preferred_engine in ["gemini", "openai"] else ("gemini" if gemini_key else "openai")
        if candidate_key and len(candidate_key) >= 15:
            res = _verify_key(cand_engine, candidate_key)
            if res.get("success"):
                AI_STATUS["is_online"] = True
                AI_STATUS["mode"] = "online"
                AI_STATUS["verified_engine"] = cand_engine
                AI_STATUS["verified_model"] = res.get("model")
                AI_STATUS["last_error"] = None
            else:
                AI_STATUS["is_online"] = False
                AI_STATUS["mode"] = "offline"
                AI_STATUS["last_error"] = res.get("error")

    is_online = AI_STATUS["is_online"]
    if is_online:
        engine_name = "Google Gemini" if AI_STATUS["verified_engine"] == "gemini" else "OpenAI"
        model_name = AI_STATUS.get("verified_model") or "Online"
        active_engine = f"{engine_name} ({model_name}) (Active - Online)"
        engine_display = f"{engine_name} ({model_name})"
    else:
        active_engine = "Local Educational NLP (Active - Offline Safe)"
        engine_display = "Offline Heuristics (Local NLP)"

    gem_masked = mask_key(gemini_key)
    oai_masked = mask_key(openai_key)

    return jsonify({
        "success": True,
        "is_online": is_online,
        "mode": "online" if is_online else "offline",
        "engine_display": engine_display,
        "verified_model": AI_STATUS.get("verified_model"),
        "has_gemini": bool(gemini_key),
        "has_gemini_key": bool(gemini_key),
        "gemini_masked": gem_masked,
        "gemini_key_masked": gem_masked,
        "has_openai": bool(openai_key),
        "has_openai_key": bool(openai_key),
        "openai_masked": oai_masked,
        "openai_key_masked": oai_masked,
        "preferred_engine": preferred_engine,
        "active_engine": active_engine,
        "last_error": AI_STATUS.get("last_error")
    }), 200

@settings_bp.route("/api/settings", methods=["POST"])
def save_settings():
    data = request.get_json(silent=True) or {}
    
    gemini_key = data.get("gemini_api_key")
    openai_key = data.get("openai_api_key")
    preferred_engine = data.get("preferred_engine")

    if gemini_key is not None:
        save_env_var("GEMINI_API_KEY", gemini_key.strip())
    if openai_key is not None:
        save_env_var("OPENAI_API_KEY", openai_key.strip())
    if preferred_engine is not None:
        save_env_var("PREFERRED_AI_ENGINE", preferred_engine.strip().lower())

    g_key = os.environ.get("GEMINI_API_KEY", "").strip() or os.environ.get("AI_API_KEY", "").strip()
    o_key = os.environ.get("OPENAI_API_KEY", "").strip()
    pref = os.environ.get("PREFERRED_AI_ENGINE", "gemini").strip().lower()

    # Test key if one was explicitly supplied
    target_engine = pref if pref in ["gemini", "openai"] else ("gemini" if g_key else "openai")
    target_key = g_key if target_engine == "gemini" else o_key

    if target_key:
        test_res = _verify_key(target_engine, target_key)
        if test_res.get("success"):
            AI_STATUS["is_online"] = True
            AI_STATUS["mode"] = "online"
            AI_STATUS["verified_engine"] = target_engine
            AI_STATUS["verified_model"] = test_res.get("model")
            AI_STATUS["last_error"] = None
        else:
            AI_STATUS["is_online"] = False
            AI_STATUS["mode"] = "offline"
            AI_STATUS["last_error"] = test_res.get("error")
    else:
        AI_STATUS["is_online"] = False
        AI_STATUS["mode"] = "offline"
        AI_STATUS["last_error"] = "No API key configured"

    return jsonify({
        "success": True,
        "message": "AI configuration saved successfully!",
        "is_online": AI_STATUS["is_online"],
        "mode": AI_STATUS["mode"],
        "has_gemini": bool(g_key),
        "has_openai": bool(o_key),
        "active_engine": target_engine if AI_STATUS["is_online"] else "offline"
    }), 200

@settings_bp.route("/api/settings/test", methods=["POST"])
def test_connection():
    data = request.get_json(silent=True) or {}
    engine = data.get("engine", "gemini").lower()
    test_key = data.get("api_key") or data.get("gemini_api_key") or data.get("openai_api_key") or ""
    test_key = test_key.strip()
    if not test_key:
        test_key = os.environ.get("GEMINI_API_KEY", "").strip() if engine == "gemini" else os.environ.get("OPENAI_API_KEY", "").strip()

    res = _verify_key(engine, test_key)
    if res.get("success"):
        AI_STATUS["is_online"] = True
        AI_STATUS["mode"] = "online"
        AI_STATUS["verified_engine"] = engine
        AI_STATUS["verified_model"] = res.get("model")
        AI_STATUS["last_error"] = None
        return jsonify({
            "success": True,
            "status": "success",
            "is_online": True,
            "model": res.get("model"),
            "latency_ms": res.get("latency_ms"),
            "message": res.get("message")
        }), 200
    else:
        AI_STATUS["is_online"] = False
        AI_STATUS["mode"] = "offline"
        AI_STATUS["last_error"] = res.get("error")
        return jsonify({
            "success": False,
            "status": "error",
            "is_online": False,
            "error": res.get("error"),
            "message": res.get("error")
        }), 200

@settings_bp.route("/api/settings/connect-online", methods=["POST"])
def connect_online():
    """1-Click endpoint to validate and connect an API key to bring the app online immediately."""
    data = request.get_json(silent=True) or {}
    engine = data.get("engine", "gemini").lower().strip()
    api_key = data.get("api_key", "").strip()

    if not api_key:
        if engine == "gemini":
            api_key = os.environ.get("GEMINI_API_KEY", "").strip() or os.environ.get("AI_API_KEY", "").strip()
        else:
            api_key = os.environ.get("OPENAI_API_KEY", "").strip()

    if not api_key:
        return jsonify({
            "success": False,
            "is_online": False,
            "mode": "offline",
            "error": "Please enter an API key to connect online."
        }), 200

    test_res = _verify_key(engine, api_key)
    if test_res.get("success"):
        if engine == "gemini":
            save_env_var("GEMINI_API_KEY", api_key)
            save_env_var("PREFERRED_AI_ENGINE", "gemini")
        else:
            save_env_var("OPENAI_API_KEY", api_key)
            save_env_var("PREFERRED_AI_ENGINE", "openai")

        AI_STATUS["is_online"] = True
        AI_STATUS["mode"] = "online"
        AI_STATUS["verified_engine"] = engine
        AI_STATUS["verified_model"] = test_res.get("model")
        AI_STATUS["last_error"] = None

        engine_title = "Google Gemini" if engine == "gemini" else "OpenAI"
        return jsonify({
            "success": True,
            "is_online": True,
            "mode": "online",
            "engine": engine,
            "model": test_res.get("model"),
            "latency_ms": test_res.get("latency_ms"),
            "message": f"Successfully connected to {engine_title} ({test_res.get('model')})! AI Study Buddy is now ONLINE."
        }), 200
    else:
        AI_STATUS["is_online"] = False
        AI_STATUS["mode"] = "offline"
        AI_STATUS["last_error"] = test_res.get("error")
        return jsonify({
            "success": False,
            "is_online": False,
            "mode": "offline",
            "error": test_res.get("error"),
            "message": test_res.get("error")
        }), 200

@settings_bp.route("/api/settings/toggle-offline", methods=["POST"])
def toggle_offline():
    AI_STATUS["is_online"] = False
    AI_STATUS["mode"] = "offline"
    return jsonify({
        "success": True,
        "is_online": False,
        "mode": "offline",
        "message": "Switched to Offline Heuristics mode (Local NLP)."
    }), 200

