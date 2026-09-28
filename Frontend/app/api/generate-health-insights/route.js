import { NextResponse } from "next/server";
import Groq from "groq-sdk";
import { getSessionUser } from "@/lib/auth";

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

function extractJson(text) {
  const raw = String(text || "").trim();
  if (!raw) throw new Error("Empty AI response");

  const unfenced = raw
    .replace(/^\`\`\`(?:json)?\s*/i, "")
    .replace(/\s*\`\`\`$/i, "")
    .trim();

  try {
    return JSON.parse(unfenced);
  } catch {}

  const start = unfenced.indexOf("{");
  const end = unfenced.lastIndexOf("}");
  if (start >= 0 && end > start) {
    return JSON.parse(unfenced.slice(start, end + 1));
  }

  throw new Error("AI response did not contain valid JSON");
}

function normalizeInsights(value, healthScore) {
  const source = value && typeof value === "object" ? value : {};
  const recommendations = Array.isArray(source.recommendations)
    ? source.recommendations
        .slice(0, 5)
        .map((item, index) => ({
          title: String(item?.title || `Health action ${index + 1}`).slice(0, 120),
          description: String(item?.description || "Choose one practical habit to improve consistently.").slice(0, 600),
          priority: ["High", "Medium", "Low"].includes(item?.priority)
            ? item.priority
            : "Medium",
          expected_impact: String(item?.expected_impact || "Supports general wellness over time.").slice(0, 240),
        }))
    : [];

  return {
    overall_assessment: String(
      source.overall_assessment ||
        `Your current wellness score is ${healthScore}/100. Use it as a progress indicator rather than a diagnosis, and focus on sustainable improvements.`
    ).slice(0, 800),
    recommendations:
      recommendations.length > 0
        ? recommendations
        : [
            {
              title: "Build one consistent routine",
              description:
                "Choose one manageable improvement in sleep, movement, nutrition, hydration, or stress management and practice it consistently.",
              priority: "Medium",
              expected_impact: "Can improve day-to-day wellbeing and make future progress easier to measure.",
            },
          ],
    focus_areas: Array.isArray(source.focus_areas)
      ? source.focus_areas.slice(0, 5).map((item) => String(item).slice(0, 80))
      : ["Daily routine", "Preventive care", "Progress tracking"],
    motivational_message: String(
      source.motivational_message ||
        "Small, repeatable changes usually matter more than trying to change everything at once."
    ).slice(0, 400),
  };
}

async function generateJsonInsights(prompt) {
  const completion = await groq.chat.completions.create({
    messages: [
      {
        role: "system",
        content:
          "You are a health and wellness assistant. Return ONLY one valid JSON object matching the requested schema. Do not use markdown fences. Do not diagnose or prescribe.",
      },
      { role: "user", content: prompt },
    ],
    model: "openai/gpt-oss-20b",
    temperature: 0.2,
    max_tokens: 1200,
  });

  return extractJson(completion.choices[0]?.message?.content);
}

export async function POST(request) {
  try {
    const user = await getSessionUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (user.role !== "patient") {
      return NextResponse.json({ error: "Patient access required" }, { status: 403 });
    }

    const { health_score, questionnaire_data } = await request.json();

    if (
      typeof health_score !== "number" ||
      !Number.isFinite(health_score) ||
      health_score < 0 ||
      health_score > 100 ||
      !questionnaire_data
    ) {
      return NextResponse.json(
        { error: "Valid health score and questionnaire data are required" },
        { status: 400 }
      );
    }

    const prompt = createHealthInsightsPrompt(health_score, questionnaire_data);

    let insights;
    try {
      insights = normalizeInsights(await generateJsonInsights(prompt), health_score);
    } catch (firstError) {
      console.warn("Health insights first AI parse failed; retrying:", firstError?.message);

      try {
        const repairPrompt = `${prompt}

IMPORTANT RETRY:
Return exactly one compact JSON object. No markdown. No commentary before or after JSON. Ensure every string is properly quoted and all arrays/objects are closed.`;
        insights = normalizeInsights(
          await generateJsonInsights(repairPrompt),
          health_score
        );
      } catch (retryError) {
        console.warn("Health insights retry failed; using structured fallback:", retryError?.message);
        insights = normalizeInsights({}, health_score);
      }
    }

    return NextResponse.json({ insights });
  } catch (error) {
    console.error("Error generating health insights:", error);
    return NextResponse.json(
      { error: "Failed to generate health insights" },
      { status: 500 }
    );
  }
}

function createHealthInsightsPrompt(healthScore, questionnaireData) {
  const responses =
    questionnaireData?.responses && typeof questionnaireData.responses === "object"
      ? questionnaireData.responses
      : {};
  const categories =
    questionnaireData?.categories && typeof questionnaireData.categories === "object"
      ? questionnaireData.categories
      : {};

  return `
Based on the following wellness assessment, provide personalized, non-diagnostic health guidance.

HEALTH SCORE: ${healthScore}/100

QUESTIONNAIRE RESPONSES:
${Object.entries(responses)
  .map(([key, value]) => `${key}: ${value}`)
  .join("\n")}

CATEGORY SCORES:
${Object.entries(categories)
  .map(([key, value]) => `${key}: ${value}/100`)
  .join("\n")}

Return exactly this JSON shape:
{
  "overall_assessment": "2-3 sentence wellness assessment",
  "recommendations": [
    {
      "title": "Specific actionable recommendation",
      "description": "What to do and why",
      "priority": "High",
      "expected_impact": "Expected wellness benefit"
    }
  ],
  "focus_areas": ["Area 1", "Area 2", "Area 3"],
  "motivational_message": "Encouraging closing message"
}

Requirements:
- 3 to 5 practical recommendations.
- Prioritize lower-scoring categories.
- No diagnosis.
- No prescription medication advice.
- Encourage professional medical care when symptoms or concerns warrant it.
`;
}
