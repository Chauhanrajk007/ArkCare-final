/**
 * AI-assisted structuring of a doctor-authored consultation report.
 *
 * Safety model (mirrors the rest of CareQuest):
 *  - The AI may organise and summarise what the clinician already wrote or
 *    dictated, and may read text off an attached prescription image.
 *  - The AI may NOT invent a medication, dose, diagnosis, or clinical
 *    instruction, and may not approve anything. Every structured row keeps a
 *    `verbatim` fragment so a reviewer can see the source wording, and
 *    anything the model is unsure about is flagged `needsReview`.
 *  - Nothing here persists. The doctor reviews the result before it becomes a
 *    report, and only a doctor action can publish it.
 */

const AI_MODELS = ["openai/gpt-oss-120b", "openai/gpt-oss-20b"];
const AI_SERVER_URL =
  process.env.AI_SERVER_URL || "http://127.0.0.1:8000";
const OCR_TIMEOUT_MS = 45000;
const AI_TIMEOUT_MS = 60000;

function clean(value, max = 4000) {
  return String(value ?? "").trim().slice(0, max);
}

function stripCodeFence(raw) {
  return String(raw || "")
    .replace(/^```[a-zA-Z]*\s*/, "")
    .replace(/\s*```$/, "")
    .trim();
}

async function groqJson(system, user, { temperature = 0.0, maxTokens = 2200 } = {}) {
  const apiKey = clean(process.env.GROQ_API_KEY);
  if (!apiKey) throw new Error("GROQ_API_KEY is not configured");

  const { default: Groq } = await import("groq-sdk");
  const groq = new Groq({ apiKey });

  let lastError = null;
  for (const model of AI_MODELS) {
    try {
      const completion = await groq.chat.completions.create({
        model,
        temperature,
        max_tokens: maxTokens,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      });
      const raw = completion.choices?.[0]?.message?.content;
      if (!raw) throw new Error("AI returned no content");
      return { data: JSON.parse(stripCodeFence(raw)), model };
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error("AI structuring failed: " + (lastError?.message || "unknown"));
}

/**
 * Read a stored prescription image with the backend OCR endpoint.
 * Never throws for an OCR miss: an unreadable image becomes an empty string
 * plus a warning so the doctor can still submit typed text.
 */
async function ocrImage(url) {
  try {
    const response = await fetch(`${AI_SERVER_URL}/ocr_prescription`, {
      method: "POST",
      headers: {
        "X-Internal-Token": clean(process.env.AI_INTERNAL_TOKEN),
      },
      body: await buildOcrFormData(url),
      signal: AbortSignal.timeout(OCR_TIMEOUT_MS),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      return { text: "", warning: `Image OCR unavailable (${response.status}). Type the prescription instead.` };
    }
    return {
      text: clean(data.text, 4000),
      confidence: Number(data.confidence || 0),
      lowConfidence: Boolean(data.low_confidence),
    };
  } catch {
    return { text: "", warning: "Could not read the prescription image. Type the prescription instead." };
  }
}

async function buildOcrFormData(url) {
  const imageResponse = await fetch(url, { signal: AbortSignal.timeout(20000) });
  if (!imageResponse.ok) throw new Error("Could not download the attached image");
  const contentType = imageResponse.headers.get("content-type") || "image/png";
  const blob = await imageResponse.blob();
  const form = new FormData();
  form.append("file", new Blob([blob], { type: contentType }), "prescription.png");
  return form;
}

const PARSE_SYSTEM = `You are a clinical documentation assistant working for a doctor.
You convert the doctor's OWN consultation text (and any machine-read prescription text) into structured JSON for a care plan.

The prescription may come from OCR of a photo. OCR corrupts small printed words, so it often turns drug names into near-misses (e.g. "Metoproll" -> "Metoprolol", "Aorvastain"/"Atorvostain" -> "Atorvastatin", "Wetformin"/"Hetformin" -> "Metformin", "Amoxilin" -> "Amoxicillin").

STRICT RULES:
- Extract and organise ONLY what is present in the supplied text. NEVER invent a medication, dose, duration, diagnosis, test result, or instruction that is not written there.
- CORRECT obvious OCR misspellings of a medication name to its correct, standard spelling WHEN you are confident it is that same drug (use your knowledge of common medicines). Put the corrected name in "name" and keep the exact machine-read line in "verbatim". If you are not confident it is a real medicine, keep the raw OCR text as-is and set needsReview true.
- Never add a medication that does not appear in the text, and never change a dose number that is clearly legible.
- Every medication/condition row MUST include a "verbatim" field containing the exact source line you used.
- If a dose/frequency is not written or is unreadable, leave it as an empty string. Never guess a number.
- If something cannot be confidently structured, add it to "warnings" and set needsReview true.
- Do not write any approval language, and do not advise the patient to start/stop/change any medicine. Summarise; do not prescribe.
- Patient-facing activity instructions must restate only what the doctor already wrote (e.g. "Walk 30 minutes daily" only if the doctor wrote it).

Return ONLY a JSON object with exactly these keys:
{
  "remarkSummary": string,           // <=2 sentences summarising the doctor's remarks
  "patientActivitySummary": string,  // <=2 sentences of the doctor-advised activity/advice
  "followUpWindow": string,          // e.g. "2 weeks", or ""
  "conditions": [{ "label": string, "verbatim": string, "confidence": number }],
  "medications": [{ "name": string, "dose": string, "frequency": string, "duration": string, "instructions": string, "verbatim": string, "confidence": number, "needsReview": boolean }],
  "activities": [{ "title": string, "type": "lesson"|"reminder"|"follow_up"|"activity", "instructions": string, "recurrenceKind": "once"|"daily"|"weekly", "timeLocal": "HH:MM", "goalValue": number|null, "safetyText": string }],
  "keywords": [string],              // <=8 health topic keywords for quiz retrieval
  "warnings": [string],
  "needsReview": boolean
}`;

/** Extract medication-ish lines without the LLM (used as a safety net). */
function ruleBasedMedicationHints(text) {
  const out = [];
  const lines = String(text || "").split(/\r?\n/);
  const rxLine = /\b(tab|cap|tablet|capsule|inj|syr|oint|cream|drop)s?\.?\b|\bmg\b|\bmcg\b/i;
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length < 3 || trimmed.length > 200) continue;
    if (!rxLine.test(trimmed)) continue;
    const nameMatch = trimmed.match(
      /^(?:tab|cap|tablet|capsule|injection|syrup|ointment|cream|drops?)\.?\s+(.+?)(?=\s+\d+\s*(?:mg|mcg|g|ml|%)|\s+(?:once|twice|thrice|daily|bd|tds|od|hs|before|after|night|morning|evening)\b|\s+\d+\s*(?:days?|weeks?|months?)\b)/i
    );
    const fallbackName = trimmed.replace(/^(?:tab|cap|tablet|capsule)\.?\s+/i, "");
    const name = clean(nameMatch ? nameMatch[1] : fallbackName, 120);
    if (!name || name.length < 2) continue;
    const doseMatch = trimmed.match(/(\d+(?:\.\d+)?)\s*(mg|mcg|g|ml|%)/i);
    const freqMatch = trimmed.match(/\b(once daily|twice daily|three times daily|od|bd|tds|hs|once|twice|daily|night|bedtime|before food|after food|morning|evening)\b/i);
    out.push({
      name,
      dose: doseMatch ? `${doseMatch[1]} ${doseMatch[2]}` : "",
      frequency: freqMatch ? freqMatch[1] : "",
      duration: "",
      instructions: "",
      verbatim: trimmed,
      confidence: 0.4,
      needsReview: true,
    });
    if (out.length >= 10) break;
  }
  return out;
}

function coerceConfidence(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0.5;
  return n > 1 ? Math.min(1, n / 100) : Math.max(0, Math.min(1, n));
}

function sanitizeParsed(data) {
  const asArray = (v) => (Array.isArray(v) ? v : []);
  const conditions = asArray(data.conditions)
    .map((c) => ({
      label: clean(c?.label, 160),
      verbatim: clean(c?.verbatim, 500),
      confidence: coerceConfidence(c?.confidence),
    }))
    .filter((c) => c.label);

  const medications = asArray(data.medications)
    .map((m) => ({
      name: clean(m?.name, 160),
      dose: clean(m?.dose, 80),
      frequency: clean(m?.frequency, 120),
      duration: clean(m?.duration, 120),
      instructions: clean(m?.instructions, 1000),
      verbatim: clean(m?.verbatim, 1000),
      confidence: coerceConfidence(m?.confidence),
      needsReview: Boolean(m?.needsReview) || coerceConfidence(m?.confidence) < 0.6,
    }))
    .filter((m) => m.name);

  const validTypes = new Set(["lesson", "reminder", "follow_up", "activity"]);
  const validRecurrence = new Set(["once", "daily", "weekly"]);
  const activities = asArray(data.activities)
    .map((a) => {
      const title = clean(a?.title, 160);
      const instructions = clean(a?.instructions, 4000);
      if (!title || !instructions) return null;
      let goalValue = Number(a?.goalValue);
      if (!Number.isFinite(goalValue) || goalValue < 250 || goalValue > 50000) goalValue = null;
      return {
        title,
        instructions,
        type: validTypes.has(a?.type) ? a.type : "reminder",
        recurrenceKind: validRecurrence.has(a?.recurrenceKind) ? a.recurrenceKind : "once",
        timeLocal: /^\d{2}:\d{2}$/.test(a?.timeLocal || "") ? a.timeLocal : "",
        goalValue,
        safetyText: clean(a?.safetyText, 2000),
      };
    })
    .filter(Boolean);

  const keywords = asArray(data.keywords)
    .map((k) => clean(k, 80))
    .filter(Boolean)
    .slice(0, 8);

  const warnings = asArray(data.warnings).map((w) => clean(w, 400)).filter(Boolean);
  const needsReview =
    Boolean(data.needsReview) ||
    medications.some((m) => m.needsReview) ||
    warnings.length > 0;

  return {
    remarkSummary: clean(data.remarkSummary, 4000),
    patientActivitySummary: clean(data.patientActivitySummary, 4000),
    followUpWindow: clean(data.followUpWindow, 200),
    conditions,
    medications,
    activities,
    keywords,
    warnings,
    needsReview,
  };
}

/**
 * @param {object} input
 * @param {string} input.clinicalSummary doctor's remarks
 * @param {string} input.patientActivity doctor-advised activity
 * @param {string} input.prescriptionText typed prescription
 * @param {Array<{url:string,kind:string}>} input.images stored prescription images
 * @returns {Promise<{parsed:object, model:string, parseMode:string, ocr:Array, warnings:string[]}>}
 */
export async function parseConsultationReport(input) {
  const clinicalSummary = clean(input?.clinicalSummary, 8000);
  const patientActivity = clean(input?.patientActivity, 4000);
  const prescriptionText = clean(input?.prescriptionText, 8000);
  const images = Array.isArray(input?.images) ? input.images.slice(0, 4) : [];

  const warnings = [];
  const ocrResults = [];

  for (const image of images) {
    const result = await ocrImage(image.url);
    ocrResults.push({ url: image.url, ...result });
    if (result.warning) warnings.push(result.warning);
    if (result.lowConfidence && result.text) {
      warnings.push(
        "A prescription image was machine-read with low confidence. Verify the text before submitting."
      );
    }
  }

  const ocrText = ocrResults.map((r) => r.text).filter(Boolean).join("\n");
  const hasOcr = Boolean(ocrText);
  const parseMode = hasOcr && (prescriptionText || clinicalSummary) ? "hybrid" : hasOcr ? "ocr" : "text";

  const sections = [
    clinicalSummary ? `DOCTOR REMARKS:\n${clinicalSummary}` : "",
    patientActivity ? `DOCTOR-ADVISED PATIENT ACTIVITY:\n${patientActivity}` : "",
    prescriptionText ? `PRESCRIPTION (typed by doctor):\n${prescriptionText}` : "",
    hasOcr ? `PRESCRIPTION (machine-read from image, may contain OCR errors):\n${ocrText}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  if (!sections) {
    throw new Error("Add consultation remarks, an activity note, or a prescription before parsing");
  }

  try {
    const { data, model } = await groqJson(
      PARSE_SYSTEM,
      `Structure this consultation into the JSON schema. Use only the text below.\n\n${sections}`,
      { temperature: 0.0, maxTokens: 2200 }
    );
    const parsed = sanitizeParsed(data);
    // If the LLM returned no medication rows but typed/OCR text clearly has
    // drug lines, fall back to the rule-based hints so a prescription is never
    // silently dropped.
    if (!parsed.medications.length) {
      const hints = ruleBasedMedicationHints(
        [prescriptionText, ocrText].filter(Boolean).join("\n")
      );
      if (hints.length) {
        parsed.medications = hints;
        parsed.warnings.push(
          "Medication rows were extracted by the rule-based fallback. Review each one carefully."
        );
        parsed.needsReview = true;
      }
    }
    return {
      parsed,
      model,
      parseMode,
      ocr: ocrResults,
      warnings: [...warnings, ...parsed.warnings],
    };
  } catch (error) {
    // Never let a transient AI failure block the doctor from documenting the
    // visit. Fall back to a minimal deterministic structure they can review.
    const hints = ruleBasedMedicationHints([prescriptionText, ocrText].filter(Boolean).join("\n"));
    return {
      parsed: {
        remarkSummary: clinicalSummary,
        patientActivitySummary: patientActivity,
        followUpWindow: "",
        conditions: [],
        medications: hints,
        activities: patientActivity
          ? [
              {
                title: "Doctor-advised activity",
                instructions: patientActivity,
                type: "reminder",
                recurrenceKind: "daily",
                timeLocal: "09:00",
                goalValue: null,
                safetyText:
                  "Follow your doctor's advice. Do not change any medicine or activity without speaking to your clinician.",
              },
            ]
          : [],
        keywords: [],
        warnings: [
          "AI structuring was unavailable, so this was captured without AI assistance. Edit the fields before submitting.",
        ],
        needsReview: true,
      },
      model: "rules_only",
      parseMode: "rules_only",
      ocr: ocrResults,
      warnings: [...warnings, "AI structuring was unavailable; captured without AI assistance."],
    };
  }
}
