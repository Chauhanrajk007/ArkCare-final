import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const quizBank = require("./quiz-bank.json");

/**
 * RAG-style retrieval over the CareQuest public-health quiz bank.
 *
 * A report (and the doctor's remarks) is scored against every question in the
 * bank. The top matches are returned, capped to exactly QUIZ_LENGTH questions
 * and spread across more than one category so the set is not all one topic.
 *
 * Correct answers never leave the server: `selectQuizQuestions` is only called
 * from server code and the caller is responsible for stripping `correctAnswer`
 * before anything is sent to a patient browser.
 */

export const QUIZ_LENGTH = 4;

const STOP_WORDS = new Set([
  "the", "and", "for", "with", "that", "this", "from", "have", "has", "was",
  "are", "but", "not", "you", "your", "his", "her", "its", "their", "they",
  "patient", "doctor", "please", "after", "before", "daily", "take", "taken",
  "tablet", "tab", "capsule", "mg", "ml", "once", "twice", "day", "days",
  "week", "weeks", "month", "months", "should", "would", "about", "into",
  "report", "reports", "activity", "activities",
]);

function tokenize(value) {
  return String(value || "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 2 && !STOP_WORDS.has(token));
}

function termFrequency(tokens) {
  const counts = new Map();
  for (const token of tokens) {
    counts.set(token, (counts.get(token) || 0) + 1);
  }
  return counts;
}

/**
 * Split a report into labelled segments so a term mentioned in the diagnosis
 * ("bp") is allowed to outrank the same term buried in boilerplate.
 */
export function buildQuerySegments(report) {
  return [
    { weight: 1.35, tokens: tokenize(report?.remarkSummary).join(" ") },
    { weight: 1.2, tokens: tokenize(report?.clinicalSummary).join(" ") },
    { weight: 1.15, tokens: tokenize(report?.patientActivity).join(" ") },
    { weight: 1.1, tokens: tokenize(report?.prescriptionText).join(" ") },
    { weight: 1.25, tokens: tokenize((report?.keywords || []).join(" ")).join(" ") },
    {
      weight: 1.3,
      tokens: tokenize(
        (report?.conditions || []).map((item) => item.label).join(" ")
      ).join(" "),
    },
    {
      weight: 1.15,
      tokens: tokenize(
        (report?.medications || []).map((item) => item.name).join(" ")
      ).join(" "),
    },
  ].filter((segment) => segment.tokens);
}

function scoreQuestion(question, category, segments, hints) {
  let score = 0;
  const seen = new Set();

  for (const segment of segments) {
    const counts = termFrequency(segment.tokens.split(" "));
    for (const [term, count] of counts) {
      if (seen.has(term)) continue;
      seen.add(term);

      // Weighted term frequency over the question text and its options: a term
      // the report mentions *and* the question asks about is the strongest hit.
      if (question.question.toLowerCase().includes(term)) {
        score += segment.weight * 3 * (1 + Math.log(count));
      }
      for (const option of question.options) {
        if (String(option).toLowerCase().includes(term)) {
          score += segment.weight * 1.2 * (1 + Math.log(count));
        }
      }
    }
  }

  // A condition the AI mapped onto this category is a strong topical signal.
  for (const hint of hints) {
    if (hint.categoryId === category.id) score += 2.5;
  }

  return score;
}

/**
 * Flatten AI condition->category mappings into hint rows. Passed explicitly
 * (rather than held in module state) so concurrent requests cannot read each
 * other's hints.
 */
export function buildRetrievalHints(conditions = []) {
  const hints = [];
  for (const condition of conditions) {
    for (const categoryId of condition.categoryIds || []) {
      hints.push({ label: condition.label, categoryId });
    }
  }
  return hints;
}

function normalizeCategoryId(id) {
  return String(id || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

const CATEGORY_ALIASES = {
  heart: "heart_cardiovascular",
  cardiovascular: "heart_cardiovascular",
  cardiac: "heart_cardiovascular",
  blood_pressure: "heart_cardiovascular",
  hypertension: "heart_cardiovascular",
  cholesterol: "heart_cardiovascular",
  diabetes: "diabetes_metabolic",
  metabolic: "diabetes_metabolic",
  sugar: "diabetes_metabolic",
  liver: "liver_hepatitis",
  hepatitis: "liver_hepatitis",
  kidney: "kidney_health",
  renal: "kidney_health",
  skin: "skin_uv_protection",
  obesity: "obesity_nutrition",
  weight: "obesity_nutrition",
  nutrition: "obesity_nutrition",
  diet: "obesity_nutrition",
  anxiety: "mental_health",
  depression: "mental_health",
  stress: "mental_health",
  sleep: "sleep_health",
  insomnia: "sleep_health",
  exercise: "physical_activity_sports",
  activity: "physical_activity_sports",
  walking: "physical_activity_sports",
  rehabilitation: "physical_activity_sports",
  smoking: "tobacco_respiratory",
  tobacco: "tobacco_respiratory",
  asthma: "tobacco_respiratory",
  copd: "tobacco_respiratory",
  breathing: "tobacco_respiratory",
  antibiotic: "antimicrobial_resistance_medication_safety",
  medication_adherence: "antimicrobial_resistance_medication_safety",
  stroke: "stroke_awareness",
  anemia: "anemia_blood_health",
  iron: "anemia_blood_health",
  blood: "anemia_blood_health",
  vaccination: "vaccination_immunization",
  vaccine: "vaccination_immunization",
  immunity: "vaccination_immunization",
  dental: "oral_dental_health",
  teeth: "oral_dental_health",
  eye: "eye_vision_health",
  vision: "eye_vision_health",
  hydration: "hydration_general_wellness",
  water: "hydration_general_wellness",
  wellness: "hydration_general_wellness",
  infection: "hand_hygiene_infection_prevention",
  hygiene: "hand_hygiene_infection_prevention",
  cancer: "cancer_prevention",
  screening: "cancer_prevention",
  food_safety: "food_safety",
  food: "food_safety",
};

const CATEGORY_INDEX = new Map();
for (const [key, category] of Object.entries(quizBank.categories)) {
  CATEGORY_INDEX.set(key, { id: key, ...category });
}

function addCategoryScore(scores, alias, weight) {
  const key = CATEGORY_ALIASES[normalizeCategoryId(alias)];
  if (!key) return;
  scores.set(key, (scores.get(key) || 0) + weight);
}

function rankCategories(segments, hints) {
  const scores = new Map();
  for (const segment of segments) {
    for (const term of segment.tokens.split(" ")) {
      addCategoryScore(scores, term, segment.weight);
    }
  }
  for (const hint of hints) {
    addCategoryScore(scores, hint.categoryId, 3);
    addCategoryScore(scores, hint.label, 2);
  }

  return [...scores.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([id, score]) => ({ id, score }));
}

/**
 * @param {object} report parsed report payload
 * @param {number} count how many questions to return
 * @returns {Array<{questionId,question,options,correctAnswer,explanation,categoryId,categoryTitle,source,score}>}
 */
export function selectQuizQuestions(report, count = QUIZ_LENGTH) {
  const segments = buildQuerySegments(report);
  const hints = buildRetrievalHints(report?.conditions || []);

  const rankedCategories = rankCategories(segments, hints);

  // With no usable signal (e.g. an empty report) fall back to a broad,
  // deterministic slice rather than a clinically arbitrary single category.
  const candidateCategoryIds = rankedCategories
    .filter((entry) => CATEGORY_INDEX.has(entry.id))
    .map((entry) => entry.id);
  if (!candidateCategoryIds.length) {
    candidateCategoryIds.push(...CATEGORY_INDEX.keys());
  }

  const scored = [];
  for (const categoryId of candidateCategoryIds) {
    const category = CATEGORY_INDEX.get(categoryId);
    if (!category) continue;
    for (const question of category.questions) {
      scored.push({
        questionId: question.id,
        question: question.question,
        options: question.options,
        correctAnswer: question.correct_answer,
        explanation: question.explanation || "",
        categoryId,
        categoryTitle: category.title,
        source: category.source || "",
        score:
          scoreQuestion(
            { question: question.question, options: question.options },
            { id: categoryId },
            segments,
            hints
          ) + 0.01,
      });
    }
  }

  scored.sort((a, b) => b.score - a.score);

  // Take the strongest question per category first, so the 4 questions come
  // from as few repeats of one topic as possible, then relax to global order.
  const picked = [];
  const usedCategories = new Set();
  const usedIds = new Set();

  for (const item of scored) {
    if (picked.length >= count) break;
    if (usedCategories.has(item.categoryId)) continue;
    picked.push(item);
    usedCategories.add(item.categoryId);
    usedIds.add(item.questionId);
  }
  for (const item of scored) {
    if (picked.length >= count) break;
    if (usedIds.has(item.questionId)) continue;
    picked.push(item);
    usedIds.add(item.questionId);
  }

  return picked.slice(0, count).map((item, index) => ({ ...item, rank: index }));
}

export const QUIZ_BANK_SIZE = totalQuestionCount();

function totalQuestionCount() {
  return Object.values(quizBank.categories).reduce(
    (sum, category) => sum + category.questions.length,
    0
  );
}

/** Strip grading data before anything is sent to a patient browser. */
export function toPatientSafeQuiz(items = []) {
  return items.map((item) => ({
    questionId: item.questionId,
    question: item.question,
    options: item.options,
    categoryTitle: item.categoryTitle,
    source: item.source,
  }));
}
