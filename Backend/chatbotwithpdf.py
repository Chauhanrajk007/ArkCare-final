"""
Medical AI Platform - Main Application (Single-File Deployment)
Combined Medical AI Chatbot (LangGraph) and PDF Report Parser API.
All code consolidated for Render deployment.
"""

# ==================== IMPORTS ====================

from typing import TypedDict, Optional, List, Annotated
import json
import re
import os
import asyncio
import tempfile
import time
import secrets
from uuid import uuid4
from pathlib import Path
from io import BytesIO
from datetime import datetime
import subprocess

import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
import pdfplumber
from dotenv import load_dotenv
from groq import Groq
from pydantic import BaseModel
from fpdf import FPDF, XPos, YPos
from PIL import Image as PI


from fastapi import FastAPI, HTTPException, UploadFile, File, Request
from fastapi.responses import FileResponse, JSONResponse
from langgraph.graph import StateGraph, START, END
from langgraph.checkpoint.memory import MemorySaver
from langgraph.graph.message import add_messages

import uvicorn

# ==================== ENV CONFIG ====================

BACKEND_DIR = Path(__file__).resolve().parent
ROOT_ENV_PATH = BACKEND_DIR.parent / "arkcare.env"

# Deployment environment variables win. The committed hackathon env is a local
# fallback so Frontend + Backend use one source during judging.
load_dotenv(ROOT_ENV_PATH, override=False)
load_dotenv(BACKEND_DIR / ".env", override=False)

GROQ_API_KEY = os.getenv("GROQ_API_KEY", "").strip()
AI_SERVER_URL = os.getenv("AI_SERVER_URL", "http://localhost:8000").rstrip("/")
AI_INTERNAL_TOKEN = os.getenv("AI_INTERNAL_TOKEN", "").strip()
MAX_PDF_BYTES = 15 * 1024 * 1024
MAX_PDF_FILES = 5

plt.rcParams.update({"font.family": "DejaVu Sans", "font.size": 10})

# ==================== FASTAPI APP ====================

app = FastAPI(
    title="Medical AI Platform",
    description="Combined Medical AI Chatbot (LangGraph) and Report Parser API",
    version="3.0.0"
)


@app.middleware("http")
async def optional_internal_auth(request: Request, call_next):
    """Protect non-health endpoints when AI_INTERNAL_TOKEN is configured.

    Hackathon/local mode stays zero-config: leaving AI_INTERNAL_TOKEN empty keeps
    the existing demo flow. For deployment, set the same token in Next.js and
    this FastAPI service so only the authenticated Next.js proxy can call it.
    """
    if AI_INTERNAL_TOKEN and request.url.path not in {"/", "/health"}:
        supplied = request.headers.get("x-arkcare-internal", "")
        if not supplied or not secrets.compare_digest(supplied, AI_INTERNAL_TOKEN):
            return JSONResponse({"detail": "Unauthorized"}, status_code=401)

    return await call_next(request)


# ==================== CHATBOT PYDANTIC MODELS ====================

class Specialist(BaseModel):
    doctor_id: str
    name: str
    specialization: str
    category: str
    phone: str
    experience: int


class Analysis(BaseModel):
    detected_conditions: List[str]
    is_serious: bool
    recommended_specialty: str
    explanation: str


class ModelResponse(BaseModel):
    response: str
    analysis: Analysis
    specialists: Optional[List[Specialist]] = None
    is_serious: bool


class PromptRequest(BaseModel):
    prompt: str
    thread_id: Optional[str] = "default"


# ==================== CHATBOT STATE ====================

class ChatState(TypedDict):
    """State for the chatbot graph"""
    user_message: str
    thread_id: str
    messages: Annotated[list, add_messages]
    illness: Optional[str]
    specialties: List[str]
    is_serious: bool
    censored_message: str
    specialists: Optional[List[dict]]
    bot_response: str
    final_response: str
    detected_conditions: List[str]
    recommended_specialty: str
    explanation: str


# ==================== DOCTOR DISCOVERY BOUNDARY ====================

# The Python service performs triage and response generation only.
# Bookable doctor identities are resolved live from MongoDB by the authenticated
# Next.js /api/chat route. No static doctor file or vector snapshot is used at runtime.

# ==================== MESSAGE CENSOR ====================

class MessageCensor:
    """Preserve the user's meaning for triage instead of rewriting safety-sensitive text.

    The previous implementation attempted to paraphrase crisis language before
    sending it to the response model. ArkCare should never disguise self-harm
    or emergency intent; the medical analysis node needs the original signal.
    """

    def __init__(self, groq_client: Groq):
        self.groq_client = groq_client

    def censor_message(self, message: str) -> str:
        return str(message or "").strip()[:4000]


# ==================== LANGGRAPH CHATBOT ====================

class ChatbotGraph:
    def __init__(self, groq_api_key):
        self.groq_client = Groq(api_key=groq_api_key)
        self.censor = MessageCensor(self.groq_client)
        self.checkpointer = MemorySaver()
        self.graph = self._build_graph()

    def _build_graph(self) -> StateGraph:
        graph = StateGraph(ChatState)
        graph.add_node("analyze_medical_query", self._analyze_medical_query_node)
        graph.add_node("censor_message", self._censor_message_node)
        graph.add_node("generate_response", self._generate_response_node)
        graph.add_edge(START, "analyze_medical_query")
        graph.add_edge("analyze_medical_query", "censor_message")
        graph.add_edge("censor_message", "generate_response")
        graph.add_edge("generate_response", END)
        return graph.compile(checkpointer=self.checkpointer)

    async def _analyze_medical_query_node(self, state: ChatState) -> dict:
        english_message = state["user_message"]
        prompt = f"""You are a medical triage assistant. Analyze this patient message and determine:
1. The main illness/symptoms described
2. The single BEST-fitting medical specialty (from the fixed list below)
3. Whether this is a SERIOUS/URGENT condition requiring immediate medical attention

IMPORTANT: Only flag as SERIOUS if there is genuine medical urgency. Common/mild conditions should NOT be flagged as serious.

SERIOUS (is_serious: true) — requires immediate medical attention:
- Chest pain, heart attack symptoms, irregular heartbeat
- Difficulty breathing, choking, respiratory distress
- Stroke symptoms (facial drooping, slurred speech, sudden weakness on one side)
- Severe uncontrolled bleeding or major trauma
- Severe allergic reactions (swelling of throat with breathing difficulty, anaphylaxis)
- Loss of consciousness or seizure
- Severe abdominal pain with fever/vomiting
- High fever (>103°F/39.5°C) with confusion or stiff neck
- Suicidal thoughts or self-harm
- Suspected poisoning or overdose
- Severe burns

NOT SERIOUS (is_serious: false) — home care and self-care appropriate:
- Common cold, mild flu, sore throat
- Mild headache, mild body ache
- Small cuts, minor bruises
- Mild stomach upset, indigestion, mild diarrhea
- Mild allergies (sneezing, runny nose, mild rash)
- Mild fever (<101°F/38.3°C)
- Cough, mild congestion
- Minor sprains, back pain
- General tiredness, fatigue
- Mild skin irritation

Choose the specialty from EXACTLY this fixed list (use these exact strings):
ENT, Cardiology, Dermatology, Endocrinology, Gastroenterology, General Medicine,
Gynecology, Neurology, Orthopedics, Pediatrics, Psychiatry, Pulmonology

Symptom -> specialty guidance (pick the single best match):
- Throat pain, sore throat, difficulty swallowing, tonsils, ear pain, nosebleed, sinus, hoarse voice -> ENT
- Chest pain, palpitations, high blood pressure, cholesterol, heart -> Cardiology
- Rash, acne, eczema, skin lesion, itching, mole -> Dermatology
- Diabetes, thyroid, hormone, weight swing -> Endocrinology
- Stomach pain, acidity, reflux, liver, bowel, diarrhea, indigestion -> Gastroenterology
- Fever, cough, cold, general weakness, unspecified mild illness -> General Medicine
- Period/menstrual, pelvic, pregnancy, women's health -> Gynecology
- Headache, dizziness, numbness, stroke signs, tremor, memory -> Neurology
- Bone/joint pain, fracture, back pain, sports injury, arthritis -> Orthopedics
- Child health, vaccination, child fever, growth -> Pediatrics
- Anxiety, depression, stress, sleep, mood -> Psychiatry
- Asthma, chronic cough, breathlessness, COPD, wheezing -> Pulmonology

Rules for "specialties":
- Return the ONE best specialty as the first element. If genuinely unsure between two, put the second as the only additional element.
- Never invent a specialty outside the fixed list. If nothing fits, use "General Medicine".

Patient message: "{english_message}"

Respond in JSON format ONLY:
{{
    "illness": "main condition/symptoms identified",
    "specialties": ["the single best specialty from the fixed list"],
    "is_serious": true/false,
    "explanation": "brief explanation of why serious or not serious"
}}"""
        try:
            response = self.groq_client.chat.completions.create(
                model="openai/gpt-oss-120b",
                messages=[{"role": "user", "content": prompt}],
                temperature=0.0, max_tokens=300,
            )
            content = response.choices[0].message.content.strip()
            # Strip <think>...</think> tags from Qwen model
            content = re.sub(r"<think>.*?</think>", "", content, flags=re.DOTALL).strip()
            if "```json" in content:
                content = content.split("```json")[1].split("```")[0].strip()
            elif "```" in content:
                content = content.split("```")[1].split("```")[0].strip()
            data = json.loads(content)
            illness = data.get("illness", "Non-specific symptoms")
            specialties = data.get("specialties", [])
            is_serious = data.get("is_serious", False)
            explanation = data.get("explanation", "")
            detected_conditions = [illness] if illness else ["Non-specific symptoms"]
            recommended_specialty = specialties[0] if specialties else "General Medicine"
            return {
                "illness": illness, "specialties": specialties, "is_serious": is_serious,
                "detected_conditions": detected_conditions,
                "recommended_specialty": recommended_specialty, "explanation": explanation
            }
        except Exception as e:
            print(f"Error in medical analysis: {e}")
            return {
                "illness": None, "specialties": [], "is_serious": False,
                "detected_conditions": ["Non-specific symptoms"],
                "recommended_specialty": "General Medicine",
                "explanation": "Unable to analyze symptoms"
            }

    async def _censor_message_node(self, state: ChatState) -> dict:
        censored = self.censor.censor_message(state["user_message"])
        return {"censored_message": censored}

    async def _generate_response_node(self, state: ChatState) -> dict:
        censored = state.get("censored_message", state["user_message"])
        illness = state.get("illness", "")
        specialties = state.get("specialties", [])
        is_serious = state.get("is_serious", False)
        specialty_str = ", ".join(specialties[:3]) if specialties else "General Medicine"

        if is_serious:
            prompt = f"""You are ArkCare HealthBot, a caring AI medical assistant. The patient's symptoms have been flagged as potentially serious.

Detected condition: {illness}
Recommended specialties: {specialty_str}
Patient says: "{censored}"

RULES:
- You are NOT a doctor. Never diagnose or prescribe medication.
- Never invent or name a clinician, hospital, consultation fee, phone number, appointment slot, or availability. ArkCare resolves real clinicians separately from its live database.
- You may recommend an appropriate medical specialty, but not a specific doctor identity.
- Be empathetic but direct. This seems serious.
- Strongly recommend seeing a doctor or visiting an emergency room.
- Give 1-2 immediate things they can do right now (e.g., rest, stay hydrated, call emergency services if severe).
- Do NOT downplay or suggest home remedies for serious symptoms.
- Keep it to 2-3 short paragraphs.
- If they mention chest pain, difficulty breathing, stroke symptoms, severe bleeding, or loss of consciousness, tell them to call emergency services immediately."""
        else:
            prompt = f"""You are ArkCare HealthBot, a friendly and helpful AI medical assistant. The patient's symptoms are NOT serious.

Detected condition: {illness}
Patient says: "{censored}"

RULES:
- You are NOT a doctor. Never diagnose or prescribe medication.
- Never invent or name a clinician, hospital, consultation fee, phone number, appointment slot, or availability. ArkCare resolves real clinicians separately from its live database.
- You may recommend an appropriate medical specialty, but not a specific doctor identity.
- Be warm, friendly, and helpful.
- For minor issues (cold, mild headache, small cuts, mild stomach ache, allergies, etc.):
  * Suggest practical home remedies and self-care tips
  * Recommend over-the-counter options if appropriate (e.g., "you could try paracetamol for the fever")
  * Give helpful guidelines (rest, fluids, when to monitor symptoms)
- Only mention seeing a doctor if symptoms persist for more than a few days or worsen.
- Do NOT over-medicalize minor issues. A common cold doesn't need a doctor visit.
- Keep it concise and conversational (2-3 short paragraphs).
- End with something reassuring unless the situation truly warrants medical attention."""

        try:
            response = self.groq_client.chat.completions.create(
                model="openai/gpt-oss-120b",
                messages=[{"role": "user", "content": prompt}],
                temperature=0.7, max_tokens=500,
            )
            raw = response.choices[0].message.content.strip()
            # Strip <think>...</think> tags from Qwen model
            full_response = re.sub(r"<think>.*?</think>", "", raw, flags=re.DOTALL).strip()
        except Exception as e:
            print(f"Error getting chat response: {e}")
            full_response = "I'm having trouble processing your request right now. Please try again or consult a healthcare professional for immediate assistance."

        return {
            "bot_response": full_response,
            "final_response": full_response,
            "messages": [("assistant", full_response)]
        }

    async def chat_response(self, user_message: str, thread_id: str = "default") -> ModelResponse:
        initial_state: ChatState = {
            "user_message": user_message, "thread_id": thread_id,
            "messages": [("user", user_message)],
            "illness": None, "specialties": [], "is_serious": False,
            "censored_message": "", "specialists": None,
            "bot_response": "", "final_response": "",
            "detected_conditions": [], "recommended_specialty": "None",
            "explanation": ""
        }
        config = {"configurable": {"thread_id": thread_id}}
        final_state = await self.graph.ainvoke(initial_state, config=config)
        specialists_list = None
        analysis = Analysis(
            detected_conditions=final_state["detected_conditions"],
            is_serious=final_state["is_serious"],
            recommended_specialty=final_state["recommended_specialty"],
            explanation=final_state["explanation"]
        )
        return ModelResponse(
            response=final_state["final_response"], analysis=analysis,
            specialists=specialists_list, is_serious=final_state["is_serious"]
        )


def create_chatbot_graph(groq_api_key):
    return ChatbotGraph(groq_api_key)


# ==================== PDF PROCESSOR V2 HELPERS ====================

def extract_text(pdf_bytes: bytes, max_chars: int = 3000) -> str:
    text = ""
    with pdfplumber.open(BytesIO(pdf_bytes)) as pdf:
        for page in pdf.pages:
            t = page.extract_text()
            if t:
                text += t + "\n"
    return text[:max_chars]


def _first_float(s):
    m = re.search(r"(\d+(\.\d+)?)", str(s or "").replace(",", ""))
    return float(m.group(1)) if m else None


def _parse_range(ref):
    rs = str(ref or "").strip()
    rs = rs.replace("\u2013", "-").replace("\u2014", "-").replace(" - ", "-")
    rs = rs.replace("&lt;", "<").replace("&gt;", ">")
    if rs.startswith("<"):
        v = _first_float(rs[1:])
        return 0.0, v
    if rs.startswith(">"):
        v = _first_float(rs[1:])
        return v, (v * 2 if v else None)
    if "-" in rs:
        p = rs.split("-", 1)
        return _first_float(p[0]), _first_float(p[1])
    return None, None


def classify_test(value_str, ref_str) -> str:
    v = _first_float(value_str)
    mn, mx = _parse_range(ref_str)
    if v is None or mn is None or mx is None:
        low = str(value_str or "").lower()
        if any(x in low for x in ["negative", "normal", "nil", "none", "absent", "clear", "not seen"]):
            return "Normal"
        if any(x in low for x in ["positive", "abnormal", "trace", "present", "high", "elevated"]):
            return "Abnormal"
        return "Unknown"
    if v < mn:
        return "Low"
    if v > mx:
        return "High"
    return "Normal"


PDF_SYSTEM_PROMPT = """
You are a medical report parser. Output VALID JSON only (no markdown, no extra text).
Return exactly:
{
  "patient_info": {"name":"string","age":"string","sex":"string"},
  "report_type": "blood|urine|other",
  "test_results": [
    {"test_name":"string","value":"string","unit":"string","reference_range":"string"}
  ],
  "summary": "2-4 sentences plain English summary",
  "doctor_notes": "string or N/A"
}
Rules: Always valid JSON. Use "N/A" for missing. Extract every test found.
""".strip()


def parse_with_llm(text: str) -> dict:
    client = Groq(api_key=GROQ_API_KEY)
    last = None
    for model in ["openai/gpt-oss-120b", "openai/gpt-oss-20b"]:
        try:
            resp = client.chat.completions.create(
                model=model,
                messages=[
                    {"role": "system", "content": PDF_SYSTEM_PROMPT},
                    {"role": "user", "content": f"Parse this lab report:\n\n{text}"},
                ],
                temperature=0.0, max_tokens=2000,
            )
            raw = resp.choices[0].message.content.strip()
            raw = re.sub(r"^```[a-zA-Z]*\n?", "", raw)
            raw = re.sub(r"\n?```$", "", raw)
            raw = re.sub(r",\s*}", "}", raw)
            raw = re.sub(r",\s*]", "]", raw)
            return json.loads(raw)
        except Exception as e:
            last = e
    raise RuntimeError(f"LLM failed: {last}")


# ==================== CHART CONSTANTS & HELPERS ====================

C_NORMAL  = "#27ae60"
C_HIGH    = "#c0392b"
C_LOW     = "#d35400"
C_UNKNOWN = "#7f8c8d"
C_BG      = "#ffffff"
C_GRID    = "#f1f3f4"
C_TEXT    = "#1a1a2e"
C_BORDER  = "#dde1e7"
C_SOFT    = "#5c636e"
STATUS_COLOR = {
    "Normal": C_NORMAL, "High": C_HIGH,
    "Low": C_LOW, "Abnormal": C_HIGH, "Unknown": C_UNKNOWN,
}


def _save(fig) -> bytes:
    buf = BytesIO()
    fig.savefig(buf, format="png", dpi=160, bbox_inches="tight",
                facecolor=C_BG, edgecolor="none")
    plt.close(fig)
    buf.seek(0)
    return buf.read()


def _ax_clean(ax):
    ax.set_facecolor(C_BG)
    ax.spines["top"].set_visible(False)
    ax.spines["right"].set_visible(False)
    ax.spines["left"].set_color(C_BORDER)
    ax.spines["bottom"].set_color(C_BORDER)
    ax.tick_params(colors=C_SOFT, labelsize=8.5, length=3)


# ==================== CHART FUNCTIONS ====================

def chart_bullet(tests: list):
    rows = []
    for t in tests:
        v = _first_float(t.get("value", ""))
        mn, mx = _parse_range(t.get("reference_range", ""))
        if v is None or mn is None or mx is None:
            continue
        s = classify_test(t.get("value", ""), t.get("reference_range", ""))
        rows.append({"name": t.get("test_name", "")[:22].strip(), "v": v,
                     "mn": mn, "mx": mx, "unit": t.get("unit", ""), "status": s})
    if not rows:
        return None
    rows = rows[:14]
    n = len(rows)
    fig, axes = plt.subplots(n, 1, figsize=(11, n * 0.72 + 0.6), facecolor=C_BG)
    if n == 1:
        axes = [axes]
    fig.subplots_adjust(hspace=0.15, left=0.22, right=0.93, top=0.93, bottom=0.04)
    fig.text(0.5, 0.97, "Bullet Chart  -  Measured Values vs Reference Range",
             ha="center", fontsize=12, fontweight="bold", color=C_TEXT)
    for ax, r in zip(axes, rows):
        mn, mx, v = r["mn"], r["mx"], r["v"]
        span = max(mx * 1.3, v * 1.15, 0.01)
        ax.set_facecolor(C_BG); ax.set_xlim(0, span); ax.set_ylim(0, 1)
        ax.axvspan(0, mn, facecolor="#fde8e8", zorder=1)
        ax.axvspan(mn, mx, facecolor="#e8f5e9", zorder=1)
        ax.axvspan(mx, span, facecolor="#fff3e0", zorder=1)
        ax.barh(0.5, span, height=0.30, color="#e9ecef", zorder=2, align="center")
        c = STATUS_COLOR.get(r["status"], C_UNKNOWN)
        ax.barh(0.5, v, height=0.18, color=c, zorder=3, align="center", alpha=0.92)
        ax.axvline(mn, color=C_NORMAL, lw=1.5, ls="--", zorder=4, alpha=0.6)
        ax.axvline(mx, color=C_NORMAL, lw=1.5, ls="--", zorder=4, alpha=0.6)
        ax.plot(v, 0.5, "o", color=c, ms=9, mec="white", mew=1.8, zorder=5)
        ax.text(-0.012 * span, 0.5, r["name"], ha="right", va="center",
                fontsize=8.5, color=C_TEXT, fontweight="600")
        ax.text(span * 1.008, 0.5, f"{v:.1f} {r['unit']}",
                ha="left", va="center", fontsize=8, color=c, fontweight="bold")
        ax.set_xticks([]); ax.set_yticks([])
        for sp in ax.spines.values():
            sp.set_visible(False)
    return _save(fig)


def chart_donut(tests: list) -> bytes:
    counts = {"Normal": 0, "Abnormal": 0, "Unknown": 0}
    for t in tests:
        s = classify_test(t.get("value", ""), t.get("reference_range", ""))
        if s in ("High", "Low", "Abnormal"):
            counts["Abnormal"] += 1
        elif s == "Unknown":
            counts["Unknown"] += 1
        else:
            counts["Normal"] += 1
    labels = [k for k, v in counts.items() if v > 0]
    sizes  = [counts[k] for k in labels]
    CLRS   = {"Normal": C_NORMAL, "Abnormal": C_HIGH, "Unknown": C_UNKNOWN}
    colors = [CLRS[l] for l in labels]
    fig, ax = plt.subplots(figsize=(5, 4.6), facecolor=C_BG)
    wedges, _ = ax.pie(sizes, colors=colors, startangle=90,
                       wedgeprops=dict(width=0.56, edgecolor="white", linewidth=3.5))
    total = sum(sizes)
    ax.text(0, 0.12, str(total), ha="center", va="center",
            fontsize=28, fontweight="bold", color=C_TEXT)
    ax.text(0, -0.20, "Total Tests", ha="center", va="center",
            fontsize=9, color=C_SOFT)
    ax.legend(wedges, [f"{l}  ({counts[l]})" for l in labels],
              loc="lower center", ncol=len(labels), fontsize=9,
              frameon=False, bbox_to_anchor=(0.5, -0.04))
    ax.set_title("Test Status Overview", fontsize=12, fontweight="bold",
                 color=C_TEXT, pad=10)
    return _save(fig)


def chart_bar(tests: list):
    rows = []
    for t in tests:
        v = _first_float(t.get("value", ""))
        mn, mx = _parse_range(t.get("reference_range", ""))
        if v is None or mn is None or mx is None:
            continue
        s = classify_test(t.get("value", ""), t.get("reference_range", ""))
        rows.append((t.get("test_name", "")[:18].strip(), v, mn, mx, s))
    if not rows:
        return None
    rows = rows[:10]
    names  = [r[0] for r in rows]
    vals   = [r[1] for r in rows]
    mins_  = [r[2] for r in rows]
    maxs_  = [r[3] for r in rows]
    colors = [STATUS_COLOR.get(r[4], C_UNKNOWN) for r in rows]
    x = np.arange(len(names))
    fig, ax = plt.subplots(figsize=(11, 5.5), facecolor=C_BG)
    ax.set_facecolor(C_BG)
    bars = ax.bar(x, vals, color=colors, alpha=0.85,
                  edgecolor="white", linewidth=1.5, width=0.5, zorder=3)
    for i, (lo, hi, v) in enumerate(zip(mins_, maxs_, vals)):
        ax.plot([i, i], [lo, hi], color="#555", lw=1.5, zorder=4)
        ax.plot([i - 0.12, i + 0.12], [lo, lo], color="#555", lw=1.5, zorder=4)
        ax.plot([i - 0.12, i + 0.12], [hi, hi], color="#555", lw=1.5, zorder=4)
        mid = (lo + hi) / 2
        ax.plot(i, mid, "D", color="white", markeredgecolor="#555", markersize=6, zorder=5)
    max_v = max(vals) if vals else 1
    for b, v in zip(bars, vals):
        ax.text(b.get_x() + b.get_width() / 2, b.get_height() + max_v * 0.025,
                f"{v:.1f}", ha="center", va="bottom", fontsize=8, fontweight="bold", color=C_TEXT)
    _ax_clean(ax)
    ax.set_xticks(x)
    ax.set_xticklabels(names, rotation=35, ha="right", fontsize=8.5, color=C_TEXT)
    ax.set_ylabel("Test Values", color=C_SOFT, fontsize=9.5)
    ax.set_title("Test Results Analysis", fontsize=12, fontweight="bold",
                 color=C_TEXT, pad=14, loc="center")
    ax.grid(True, axis="y", color=C_GRID, lw=0.8, zorder=0)
    legend_elems = [
        mpatches.Patch(color=C_NORMAL, label="Normal"),
        mpatches.Patch(color=C_LOW, label="Below Normal"),
        mpatches.Patch(color=C_HIGH, label="Above Normal"),
    ]
    ax.legend(handles=legend_elems, fontsize=8.5, frameon=True,
              edgecolor=C_BORDER, loc="upper right", facecolor="white", framealpha=0.95)
    plt.tight_layout(pad=1.2)
    return _save(fig)


def chart_lollipop(tests: list):
    rows = []
    for t in tests:
        v = _first_float(t.get("value", ""))
        mn, mx = _parse_range(t.get("reference_range", ""))
        if v is None or mn is None or mx is None or (mn + mx) == 0:
            continue
        mid = (mn + mx) / 2
        pct = (v - mid) / (mid + 1e-9) * 100
        s = classify_test(t.get("value", ""), t.get("reference_range", ""))
        rows.append((t.get("test_name", "")[:22].strip(), pct, s))
    if not rows:
        return None
    rows = sorted(rows, key=lambda x: x[1])[:14]
    names  = [r[0] for r in rows]
    devs   = [r[1] for r in rows]
    colors = [STATUS_COLOR.get(r[2], C_UNKNOWN) for r in rows]
    fig, ax = plt.subplots(figsize=(10, max(4.5, len(rows) * 0.52)), facecolor=C_BG)
    ax.set_facecolor(C_BG)
    y = range(len(names))
    ax.axvspan(-25, 25, color="#e8f5e9", alpha=0.7, zorder=1)
    ax.axvline(0, color="#adb5bd", lw=1.2, ls="--", zorder=2)
    for yi, d, c in zip(y, devs, colors):
        ax.plot([0, d], [yi, yi], color=c, lw=1.8, alpha=0.65, zorder=3)
    ax.scatter(devs, list(y), color=colors, s=95, zorder=4,
               edgecolors="white", linewidths=1.8)
    for yi, d in zip(y, devs):
        ha = "left" if d >= 0 else "right"
        ax.text(d + (1.2 if d >= 0 else -1.2), yi, f"{d:+.1f}%",
                va="center", ha=ha, fontsize=8, color=C_TEXT)
    ax.set_yticks(list(y))
    ax.set_yticklabels(names, fontsize=9, color=C_TEXT)
    ax.invert_yaxis()
    ax.set_xlabel("% Deviation from Reference Midpoint", color=C_SOFT, fontsize=9.5)
    ax.set_title("Deviation from Normal Range", fontsize=12, fontweight="bold",
                 color=C_TEXT, pad=12, loc="left")
    _ax_clean(ax)
    ax.grid(True, axis="x", color=C_GRID, lw=0.8, zorder=0)
    patches = [mpatches.Patch(color=c, label=l)
               for l, c in STATUS_COLOR.items() if any(r[2] == l for r in rows)]
    patches.append(mpatches.Patch(color="#e8f5e9", label="Normal zone (+-25%)"))
    ax.legend(handles=patches, fontsize=8, frameon=True, edgecolor=C_BORDER,
              loc="lower right", facecolor="white", framealpha=0.9)
    plt.tight_layout(pad=1.2)
    return _save(fig)


def chart_strip(tests: list):
    rows = []
    for t in tests:
        name = (t.get("test_name") or "").strip()
        if not name:
            continue
        s = classify_test(t.get("value", ""), t.get("reference_range", ""))
        rows.append((name[:28], str(t.get("value", "")), s))
    if not rows:
        return None
    BG = {"Normal": "#e8f5e9", "High": "#fde8e8", "Low": "#fff3e0",
          "Abnormal": "#fde8e8", "Unknown": "#f5f5f5"}
    fig, ax = plt.subplots(figsize=(9, max(3, len(rows) * 0.56)), facecolor=C_BG)
    ax.set_facecolor(C_BG)
    for i, (name, val, s) in enumerate(rows):
        ec = STATUS_COLOR.get(s, C_UNKNOWN)
        ax.barh(i, 1, height=0.82, color=BG.get(s, "#f5f5f5"),
                edgecolor=ec, lw=1.3, zorder=2)
        ax.barh(i, 0.022, height=0.82, color=ec, zorder=3)
        ax.text(0.04, i, name, va="center", ha="left", fontsize=9.5,
                fontweight="600", color=C_TEXT, zorder=4)
        ax.text(0.62, i, val, va="center", ha="center",
                fontsize=9.5, color=C_SOFT, zorder=4)
        ax.text(0.97, i, s.upper(), va="center", ha="right",
                fontsize=8.5, fontweight="bold", color=ec, zorder=4)
    ax.set_xlim(0, 1); ax.set_ylim(-0.7, len(rows) - 0.3)
    ax.invert_yaxis(); ax.set_yticks([]); ax.set_xticks([]); ax.axis("off")
    ax.text(0.04, -0.52, "TEST NAME", fontsize=7.5, color=C_SOFT, fontweight="bold")
    ax.text(0.62, -0.52, "RESULT", fontsize=7.5, color=C_SOFT,
            fontweight="bold", ha="center")
    ax.text(0.97, -0.52, "STATUS", fontsize=7.5, color=C_SOFT,
            fontweight="bold", ha="right")
    ax.axhline(-0.28, color=C_BORDER, lw=0.8)
    ax.set_title("Test Results Overview", fontsize=12, fontweight="bold",
                 color=C_TEXT, pad=10, loc="left")
    plt.tight_layout(pad=1)
    return _save(fig)


def chart_boxplot(tests: list):
    rows = []
    for t in tests:
        v = _first_float(t.get("value", ""))
        mn, mx = _parse_range(t.get("reference_range", ""))
        if v is None or mn is None or mx is None:
            continue
        s = classify_test(t.get("value", ""), t.get("reference_range", ""))
        rows.append({"name": t.get("test_name", "")[:18].strip(),
                     "v": v, "mn": mn, "mx": mx, "s": s,
                     "unit": t.get("unit", "")})
    if not rows:
        return None
    rows = rows[:14]
    n = len(rows)

    def pct(r):
        span = r["mx"] - r["mn"]
        return 50.0 if span == 0 else (r["v"] - r["mn"]) / span * 100

    fig, ax = plt.subplots(figsize=(10, max(4.5, n * 0.62)), facecolor=C_BG)
    ax.set_facecolor(C_BG)
    y = list(range(n))
    ax.axvspan(0, 100, color="#e8f5e9", alpha=0.55, zorder=1)
    ax.axvline(0, color=C_NORMAL, lw=1.2, ls="--", alpha=0.5, zorder=2)
    ax.axvline(100, color=C_NORMAL, lw=1.2, ls="--", alpha=0.5, zorder=2)
    ax.axvline(50, color="#adb5bd", lw=0.9, ls=":", alpha=0.6, zorder=2)
    for i, r in enumerate(rows):
        p = pct(r)
        c = STATUS_COLOR.get(r["s"], C_UNKNOWN)
        ax.barh(i, 100, height=0.35, left=0, color="#e0e0e0",
                alpha=0.5, zorder=3, align="center")
        ax.scatter(p, i, color=c, s=110, zorder=5,
                   edgecolors="white", linewidths=1.8)
        ax.plot([p, p], [i - 0.18, i + 0.18], color=c, lw=2, zorder=4)
        ha = "left" if p < 85 else "right"
        offset = 2 if p < 85 else -2
        ax.text(p + offset, i, f"{r['v']:.1f} {r['unit']}",
                va="center", ha=ha, fontsize=7.5, color=c, fontweight="bold")
    ax.set_yticks(y)
    ax.set_yticklabels([r["name"] for r in rows], fontsize=9, color=C_TEXT)
    ax.invert_yaxis()
    ax.set_xlim(-18, 122)
    ax.set_xlabel("Position within Reference Range  (0% = lower limit, 100% = upper limit)",
                  color=C_SOFT, fontsize=9)
    ax.set_title("Value Position within Reference Range",
                 fontsize=12, fontweight="bold", color=C_TEXT, pad=12, loc="left")
    _ax_clean(ax)
    ax.grid(True, axis="x", color=C_GRID, lw=0.8, zorder=0)
    patches = [mpatches.Patch(color=c, label=l)
               for l, c in STATUS_COLOR.items() if any(r["s"] == l for r in rows)]
    patches.append(mpatches.Patch(color="#e8f5e9", label="Normal zone"))
    ax.legend(handles=patches, fontsize=8, frameon=True, edgecolor=C_BORDER,
              loc="lower right", facecolor="white", framealpha=0.95)
    plt.tight_layout(pad=1.2)
    return _save(fig)


# ==================== PDF BUILDER ====================

P_TEXT    = (25, 25, 30)
P_HDRBG   = (30, 30, 35)
P_SECBG   = (247, 247, 249)
P_SECTL   = (180, 180, 190)
P_ROW_S1  = (255, 255, 255)
P_ROW_S2  = (240, 252, 245)
P_GRN     = (39, 174, 96)
P_RED     = (192, 57, 43)
P_ORG     = (211, 84, 0)
P_GRY     = (110, 110, 120)
P_TEAL    = (39, 174, 96)
P_THEAD_T = (255, 255, 255)
ML, MR    = 15, 15
UW        = 210 - ML - MR
NX, NY    = XPos.LMARGIN, YPos.NEXT


def _safe(text: str) -> str:
    tr = {
        "\u2014": "-", "\u2013": "-", "\u2018": "'", "\u2019": "'",
        "\u201c": '"', "\u201d": '"', "\u2026": "...", "\u00b0": "deg",
        "\u00b5": "u", "\u03bc": "u", "\u2264": "<=", "\u2265": ">=",
        "\u00b1": "+/-", "\u00d7": "x", "\u00f7": "/",
    }
    for ch, rep in tr.items():
        text = str(text).replace(ch, rep)
    return text.encode("latin-1", errors="replace").decode("latin-1")


class LabPDF(FPDF):
    def __init__(self):
        super().__init__()
        self.set_auto_page_break(auto=True, margin=16)
        self.set_margins(ML, 16, MR)

    def hline(self, color=P_SECTL, lw=0.25):
        self.set_draw_color(*color)
        self.set_line_width(lw)
        self.line(ML, self.get_y(), 210 - MR, self.get_y())

    def sec(self, title: str):
        self.ln(5)
        self.set_fill_color(*P_SECTL)
        self.rect(ML, self.get_y(), 2.5, 8, "F")
        self.set_fill_color(*P_SECBG)
        self.set_text_color(*P_TEXT)
        self.set_font("Helvetica", "B", 10)
        self.set_x(ML + 4)
        self.cell(UW - 4, 8, _safe(f"  {title}"), fill=True, new_x=NX, new_y=NY)
        self.ln(2)
        self.set_text_color(*P_TEXT)

    def kv(self, label: str, value: str, lw=48):
        self.set_font("Helvetica", "B", 8)
        self.set_text_color(*P_GRY)
        self.set_x(ML + 5)
        self.cell(lw, 6.5, _safe(label.upper()))
        self.set_font("Helvetica", "", 10)
        self.set_text_color(*P_TEXT)
        self.multi_cell(0, 6.5, _safe(str(value or "N/A")))

    def embed(self, png_bytes: bytes, w: int = None):
        if not png_bytes:
            return
        w = w or UW
        with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as f:
            f.write(png_bytes)
            path = f.name
        with PI.open(path) as im:
            iw, ih = im.size
        h_est = (ih / iw) * w
        if self.get_y() + h_est + 10 > 297 - 16:
            self.add_page()
        self.set_x(ML)
        self.image(path, x=ML, w=w)
        os.unlink(path)
        self.ln(5)

    def page_stripe(self, title: str):
        self.set_fill_color(*P_HDRBG)
        self.rect(0, 0, 210, 16, "F")
        self.set_text_color(240, 240, 245)
        self.set_font("Helvetica", "B", 11)
        self.set_xy(ML, 3)
        self.cell(0, 10, _safe(title), new_x=NX, new_y=NY)
        self.set_text_color(*P_TEXT)
        self.ln(4)


def make_pdf(all_parsed: list, source_names: list) -> bytes:
    all_tests, urine_t, num_t = [], [], []
    for parsed, fname in zip(all_parsed, source_names):
        rt = parsed.get("report_type", "other")
        for t in parsed.get("test_results", []):
            t2 = dict(t); t2["_src"] = fname; t2["_rt"] = rt
            all_tests.append(t2)
            if rt == "urine":
                urine_t.append(t2)
            if (_first_float(t2.get("value", "")) is not None
                    and _parse_range(t2.get("reference_range", ""))[0] is not None):
                num_t.append(t2)

    abn_cnt = sum(
        1 for t in all_tests
        if classify_test(t.get("value", ""), t.get("reference_range", ""))
        not in ["Normal", "Unknown"]
    )

    src = num_t or all_tests
    c_donut    = chart_donut(all_tests)
    c_bar      = chart_bar(src)
    c_bullet   = chart_bullet(src)
    c_boxplot  = chart_boxplot(src)
    c_lollipop = chart_lollipop(src)
    c_strip    = chart_strip(urine_t or all_tests)

    patient = {"name": "N/A", "age": "N/A", "sex": "N/A"}
    for p in all_parsed:
        pi = p.get("patient_info", {})
        if any(pi.get(k) not in [None, "", "N/A"] for k in ["name", "age", "sex"]):
            patient = {k: pi.get(k, "N/A") for k in ["name", "age", "sex"]}
            break

    pdf = LabPDF()
    pdf.add_page()

    # Header band
    pdf.set_fill_color(*P_HDRBG); pdf.rect(0, 0, 210, 28, "F")
    pdf.set_text_color(255, 255, 255); pdf.set_font("Helvetica", "B", 18)
    pdf.set_xy(ML, 5); pdf.cell(UW, 10, "Medical Laboratory Report", new_x=NX, new_y=NY)
    pdf.set_font("Helvetica", "", 8.5); pdf.set_text_color(180, 180, 190); pdf.set_x(ML)
    pdf.cell(UW, 6, _safe(
        f"Generated: {datetime.now().strftime('%d %b %Y, %H:%M')}"
        f"   |   Reports: {len(all_parsed)}"
        f"   |   Tests: {len(all_tests)}"
        f"   |   Abnormal: {abn_cnt}"
    ), new_x=NX, new_y=NY)
    pdf.ln(7)

    # Patient Info
    pdf.sec("Patient Information")
    pdf.kv("Full Name", patient["name"])
    pdf.kv("Age", patient["age"])
    pdf.kv("Sex", patient["sex"])

    # AI Insights
    has_summary = any(p.get("summary", "") not in ["", "N/A"] for p in all_parsed)
    if has_summary:
        pdf.sec("AI Insights")
        for parsed, fname in zip(all_parsed, source_names):
            s  = parsed.get("summary", "")
            rt = parsed.get("report_type", "other").upper()
            dn = parsed.get("doctor_notes", "")
            if not s or s == "N/A":
                continue
            pdf.set_font("Helvetica", "B", 8.5); pdf.set_text_color(*P_GRY)
            pdf.set_x(ML + 5)
            pdf.cell(UW, 6, _safe(f"[{rt}]  {fname}"), new_x=NX, new_y=NY)
            pdf.set_font("Helvetica", "", 9.5); pdf.set_text_color(*P_TEXT)
            pdf.set_x(ML + 5); pdf.multi_cell(UW, 5.8, _safe(str(s)))
            if dn and dn not in ["", "N/A"]:
                pdf.set_font("Helvetica", "I", 8.5); pdf.set_text_color(*P_GRY)
                pdf.set_x(ML + 5)
                pdf.multi_cell(UW, 5.8, _safe(f"Doctor notes: {dn}"))
            pdf.ln(3)

    # Results tables
    CW5 = [54, 28, 38, 24, 26]
    H5  = ["Test Name", "Your Value", "Normal Range", "Status", "Deviation"]

    def _deviation_label(v_str, ref_str):
        v = _first_float(v_str); mn, mx = _parse_range(ref_str)
        if v is None or mn is None or mx is None: return "N/A"
        if v < mn: return "Below range"
        if v > mx: return "Above range"
        return "Within range"

    for parsed, fname in zip(all_parsed, source_names):
        rt     = parsed.get("report_type", "other").upper()
        tests_ = parsed.get("test_results", [])
        if not tests_:
            continue
        abn_r  = sum(1 for t in tests_
                     if classify_test(t.get("value", ""), t.get("reference_range", ""))
                     not in ["Normal", "Unknown"])
        norm_r = len(tests_) - abn_r

        pdf.ln(4)
        pdf.set_font("Helvetica", "B", 11); pdf.set_text_color(*P_TEXT); pdf.set_x(ML)
        pdf.cell(0, 8, _safe(f"Report Type: {rt} ({fname})"), new_x=NX, new_y=NY)
        pdf.set_font("Helvetica", "", 8); pdf.set_text_color(*P_GRY); pdf.set_x(ML)
        pdf.cell(0, 5, _safe(f"Total: {len(tests_)} tests  |  Abnormal: {abn_r}  |  Normal: {norm_r}"),
                 new_x=NX, new_y=NY)
        pdf.ln(3)

        pdf.set_font("Helvetica", "BI", 9.5); pdf.set_text_color(*P_TEXT)
        pdf.set_x(ML); pdf.cell(0, 7, "Detailed Results:", new_x=NX, new_y=NY)
        pdf.ln(1)

        # Header row
        pdf.set_fill_color(*P_TEAL); pdf.set_text_color(*P_THEAD_T)
        pdf.set_font("Helvetica", "B", 8.5); pdf.set_x(ML)
        for w, h in zip(CW5, H5):
            pdf.cell(w, 8, h, fill=True, align="C")
        pdf.ln()

        # Data rows
        for i, t in enumerate(tests_):
            status  = classify_test(t.get("value", ""), t.get("reference_range", ""))
            dev_lbl = _deviation_label(t.get("value", ""), t.get("reference_range", ""))
            bg = P_ROW_S1 if i % 2 == 0 else P_ROW_S2
            sc = {"High": P_RED, "Low": P_ORG, "Normal": P_GRN,
                  "Abnormal": P_RED}.get(status, P_GRY)
            pdf.set_fill_color(*bg); pdf.set_text_color(*P_TEXT)
            pdf.set_font("Helvetica", "", 8.5); pdf.set_x(ML)
            for w, v in zip(CW5[:3], [
                _safe(str(t.get("test_name", "")))[:28],
                _safe(str(t.get("value", "")) + " " + str(t.get("unit", "")))[:16],
                _safe(str(t.get("reference_range", "")))[:20],
            ]):
                pdf.cell(w, 6.5, v, fill=True, align="C")
            pdf.set_font("Helvetica", "B", 8.5)
            pdf.set_fill_color(*bg); pdf.set_text_color(*sc)
            pdf.cell(CW5[3], 6.5, status, fill=True, align="C")
            dev_col = P_RED if "Above" in dev_lbl else (P_ORG if "Below" in dev_lbl else P_GRN)
            pdf.set_text_color(*dev_col); pdf.set_font("Helvetica", "", 8)
            pdf.cell(CW5[4], 6.5, dev_lbl, fill=True, align="C")
            pdf.ln()
        pdf.ln(8)

    # Visual analysis
    pdf.add_page(); pdf.page_stripe("Visual Analysis")

    def block(title, png, w=None):
        if not png: return
        pdf.sec(title); pdf.embed(png, w=w)

    block("Test Status Overview", c_donut, w=110)
    block("Test Results Analysis (Bar Chart)", c_bar)
    block("Bullet Chart \u2014 Values vs Reference", c_bullet)
    block("Value Position within Reference Range", c_boxplot)
    block("Deviation from Normal Range", c_lollipop)
    block("Test Results Overview", c_strip, w=160)

    return bytes(pdf.output())


# ==================== GLOBAL STATE ====================

bot_instance: Optional[ChatbotGraph] = None


# ==================== STARTUP EVENT ====================

@app.on_event("startup")
async def startup_event():
    global bot_instance

    if not GROQ_API_KEY:
        raise RuntimeError("ERROR: Please set GROQ_API_KEY in the runtime environment.")

    bot_instance = create_chatbot_graph(groq_api_key=GROQ_API_KEY)

    await asyncio.sleep(0.01)
    print("Medical AI Platform started successfully!")
    print("   - LangGraph Chatbot: Ready")
    print("   - Doctor Retrieval: delegated to authenticated Next.js MongoDB directory")
    print("   - PDF Processor V2: Ready")


# ==================== GENERAL ENDPOINTS ====================

@app.get("/")
async def root():
    return {
        "message": "Medical AI Platform API is running!",
        "endpoints": {
            "chatbot": ["/chat", "/analyze", "/clear_chat", "/sessions"],
            "pdf": ["/parse_report", "/download_report/{filename}"],
            "system": ["/health"]
        },
        "version": "3.0.0"
    }


@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "chatbot_status": bot_instance is not None,
        "chatbot_type": "LangGraph triage + response generation",
        "doctor_retrieval_backend": "nextjs_mongodb_live",
        "pdf_processor_type": "PDF Processor V2 (stateless)"
    }


# ==================== CHATBOT ENDPOINTS ====================

@app.post("/chat", response_model=ModelResponse)
async def chat_endpoint(prompt_request: PromptRequest):
    """Main chat endpoint using LangGraph workflow"""
    global bot_instance
    if bot_instance is None:
        raise HTTPException(status_code=500, detail="Chatbot not initialized.")
    try:
        return await bot_instance.chat_response(prompt_request.prompt, prompt_request.thread_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/clear_chat")
async def clear_chat(thread_id: str = "default"):
    """Clear chat history for a specific thread"""
    return {"message": f"Chat history cleared for thread: {thread_id}"}


@app.get("/sessions")
async def get_active_sessions():
    return {"active_sessions": [], "note": "LangGraph uses stateless invocations with checkpointing"}


@app.post("/analyze", response_model=Analysis)
async def analyze_medical_query_endpoint(prompt_request: PromptRequest):
    """Analyze a medical query without generating a chat response (Triage-only)"""
    global bot_instance
    if bot_instance is None:
        raise HTTPException(status_code=500, detail="Chatbot not initialized.")
    try:
        initial_state = {
            "user_message": prompt_request.prompt,
            "thread_id": prompt_request.thread_id or "default",
            "messages": [("user", prompt_request.prompt)],
            "illness": None, "specialties": [], "is_serious": False,
            "censored_message": "", "specialists": None,
            "bot_response": "", "final_response": "",
            "detected_conditions": [], "recommended_specialty": "None",
            "explanation": ""
        }
        result = await bot_instance._analyze_medical_query_node(initial_state)
        return Analysis(
            detected_conditions=result.get("detected_conditions", ["Non-specific symptoms"]),
            is_serious=result.get("is_serious", False),
            recommended_specialty=result.get("recommended_specialty", "None"),
            explanation=result.get("explanation", "")
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error analyzing query: {str(e)}")


# ==================== PDF PARSER ENDPOINTS ====================

@app.post("/parse_report")
async def parse_report(files: List[UploadFile] = File(...)):
    """Upload one or more PDF lab reports. Returns structured JSON + download URL."""
    if not files or len(files) > MAX_PDF_FILES:
        raise HTTPException(
            status_code=400,
            detail=f"Upload between 1 and {MAX_PDF_FILES} PDF files at a time."
        )

    for file in files:
        if file.content_type != "application/pdf":
            raise HTTPException(status_code=400, detail=f"File '{file.filename}' must be a PDF.")

    all_parsed: list = []
    source_names: list = []
    temp_files: list = []

    try:
        for file in files:
            pdf_bytes = await file.read()
            if len(pdf_bytes) > MAX_PDF_BYTES:
                raise HTTPException(
                    status_code=413,
                    detail=f"File '{file.filename}' exceeds the 15MB limit."
                )

            with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
                tmp.write(pdf_bytes)
                tmp_path = tmp.name
            temp_files.append(tmp_path)

            text = extract_text(pdf_bytes, max_chars=3000)
            if not text.strip():
                raise HTTPException(
                    status_code=422,
                    detail=f"No extractable text in '{file.filename}'. "
                           "Scanned / image-only PDFs are not supported."
                )
            parsed = parse_with_llm(text)
            all_parsed.append(parsed)
            source_names.append(file.filename)

        pdf_bytes_out = make_pdf(all_parsed, source_names)

        # Randomized server-side filename prevents one user's predictable report
        # path from colliding with or revealing another user's generated report.
        out_name = f"arkcare_report_{uuid4().hex}.pdf"

        out_path = os.path.join(tempfile.gettempdir(), out_name)
        with open(out_path, "wb") as f:
            f.write(pdf_bytes_out)

        all_tests_flat = [t for p in all_parsed for t in p.get("test_results", [])]
        abn_count = sum(
            1 for t in all_tests_flat
            if classify_test(t.get("value", ""), t.get("reference_range", ""))
            not in ["Normal", "Unknown"]
        )
        combined_json = [
            {"source": fname, "data": parsed}
            for fname, parsed in zip(source_names, all_parsed)
        ]

        return {
            "parsed_json": all_parsed,
            "combined_json": combined_json,
            "test_results_json": {
                t.get("test_name", ""): t.get("value", "")
                for p in all_parsed for t in p.get("test_results", [])
            },
            "pdf_download_url": f"/download_report/{out_name}",
            "total_files_processed": len(files),
            "total_reports_merged": len(all_parsed),
            "unique_tests_found": len(all_tests_flat),
            "abnormal_count": abn_count,
            "pdf_file_size": os.path.getsize(out_path),
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Parsing error: {e}")
    finally:
        for p in temp_files:
            if os.path.exists(p):
                os.unlink(p)


# ==================== PRESCRIPTION IMAGE OCR ====================

OCR_MAX_BYTES = 8 * 1024 * 1024
OCR_MAX_CHARS = 4000
TESSERACT_BIN = os.getenv("TESSERACT_BIN", "tesseract")


def _preprocess_for_ocr(data: bytes):
    """Grayscale + 2x upscale makes small printed drug names far more legible
    to tesseract than the raw image."""
    try:
        img = PI.open(BytesIO(data)).convert("L")
        w, h = img.size
        img = img.resize((w * 2, h * 2), PI.LANCZOS)
        buf = BytesIO()
        img.save(buf, format="PNG")
        return buf.getvalue()
    except Exception:
        return data


def _tesseract_run(png_path: str, psm: str):
    text_proc = subprocess.run(
        [TESSERACT_BIN, png_path, "stdout", "-l", "eng", "--psm", psm],
        capture_output=True, timeout=60,
    )
    if text_proc.returncode != 0:
        return "", 0.0
    text = text_proc.stdout.decode("utf-8", "ignore")

    confidence = 0.0
    tsv_proc = subprocess.run(
        [TESSERACT_BIN, png_path, "stdout", "-l", "eng", "--psm", psm, "tsv"],
        capture_output=True, timeout=60,
    )
    if tsv_proc.returncode == 0:
        values = []
        for line in tsv_proc.stdout.decode("utf-8", "ignore").splitlines()[1:]:
            parts = line.split("\t")
            if len(parts) < 12:
                continue
            try:
                conf = float(parts[10])
            except ValueError:
                continue
            if conf >= 0:
                values.append(conf)
        if values:
            confidence = round(sum(values) / len(values), 2)
    return text.strip(), confidence


def _ocr_image_bytes(data: bytes) -> tuple[str, float]:
    """Run tesseract on an upscaled image, trying several page-segmentation
    modes and keeping the most confident result. Returns (text, mean_conf)."""
    import subprocess
    import shutil

    if shutil.which(TESSERACT_BIN) is None:
        raise RuntimeError(
            "tesseract OCR binary is not available on this host. "
            "Ask the doctor to type the prescription text instead."
        )

    processed = _preprocess_for_ocr(data)
    with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp:
        tmp.write(processed)
        tmp_path = tmp.name

    try:
        best_text, best_conf = "", -1.0
        for psm in ("6", "3", "4", "11"):
            try:
                text, conf = _tesseract_run(tmp_path, psm)
            except Exception:
                continue
            if conf > best_conf and text:
                best_text, best_conf = text, conf
        if not best_text:
            with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as raw:
                raw.write(data)
                raw_path = raw.name
            try:
                best_text, best_conf = _tesseract_run(raw_path, "3")
            finally:
                if os.path.exists(raw_path):
                    os.unlink(raw_path)
        return best_text[:OCR_MAX_CHARS], max(best_conf, 0.0)
    finally:
        if os.path.exists(tmp_path):
            os.unlink(tmp_path)


@app.post("/ocr_prescription")
async def ocr_prescription(file: UploadFile = File(...)):
    """Extract machine-readable text from a photographed/scan prescription.

    This is OCR only. It performs no clinical interpretation - the Next.js
    report parser turns this text into structured JSON and a clinician reviews
    the result before it becomes part of the record.
    """
    if not file or not file.filename:
        raise HTTPException(status_code=400, detail="An image file is required.")

    content_type = (file.content_type or "").lower()
    allowed = {"image/png", "image/jpeg", "image/jpg", "image/webp", "image/bmp", "image/tiff"}
    if content_type and content_type not in allowed:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported image type '{content_type}'. Use PNG, JPEG or WEBP.",
        )

    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Uploaded image was empty.")
    if len(data) > OCR_MAX_BYTES:
        raise HTTPException(status_code=413, detail="Image exceeds the 8MB limit.")

    try:
        text, confidence = _ocr_image_bytes(data)
    except RuntimeError as exc:
        # 503 = "this capability is unavailable", which the caller can present as
        # a fallback to manual entry rather than a hard failure.
        raise HTTPException(status_code=503, detail=str(exc))

    return {
        "text": text,
        "confidence": confidence,
        "char_count": len(text),
        "low_confidence": confidence < 70 or len(text) < 12,
        "engine": "tesseract",
    }


@app.get("/download_report/{filename}")
def download_report(filename: str):
    """Download a previously generated PDF report by opaque generated filename."""
    safe_name = os.path.basename(filename)
    if safe_name != filename or not safe_name.startswith("arkcare_report_") or not safe_name.endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Invalid filename.")

    file_path = os.path.join(tempfile.gettempdir(), safe_name)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File not found.")
    return FileResponse(file_path, filename=filename, media_type="application/pdf")


# ==================== RUN ====================

if __name__ == "__main__":
    uvicorn.run("chatbotwithpdf:app", host="0.0.0.0", port=8000, reload=True)