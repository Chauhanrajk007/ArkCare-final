import { NextResponse } from 'next/server';
import Groq from 'groq-sdk';
import { getSessionUser } from '@/lib/auth';

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

export async function POST(request) {
  try {
    const user = await getSessionUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (user.role !== "patient") {
      return NextResponse.json({ error: "Patient access required" }, { status: 403 });
    }

    const { questionnaire_score, lab_summary } = await request.json();

    const prompt = `Based on the following health data, generate a realistic overall AI health score from 0 to 100 as an integer. Return ONLY a JSON object with a single key "health_score".
        
Base Assessment Score: ${questionnaire_score}/100
Lab Summary: ${lab_summary || 'None available'}

Consider that the base score might be adjusted up or down depending on the severity of the lab summary if provided. If no lab summary is provided, the score should remain close to the base score.`;

    const completion = await groq.chat.completions.create({
      messages: [
        {
          role: "system",
          content: "You are a professional health scoring AI. You analyze health metrics and return a single health score as an integer in JSON format."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      model: "llama-3.1-8b-instant",
      temperature: 0.2,
      max_tokens: 100,
      response_format: { type: "json_object" }
    });

    const responseContent = completion.choices[0]?.message?.content;

    if (!responseContent) {
      throw new Error('No response from AI model');
    }

    const data = JSON.parse(responseContent);

    if (typeof data.health_score !== 'number') {
      throw new Error('Invalid response format from AI model');
    }

    return NextResponse.json({
      health_score: Math.max(0, Math.min(100, Math.round(data.health_score))),
      model_version: "llama-3.1-8b-instant",
      processed_at: new Date().toISOString()
    });

  } catch (error) {
    console.error('AI Model API Error:', error);

    return NextResponse.json(
      {
        error: 'AI model processing failed',
        health_score: 50, // Fallback score
        fallback: true
      },
      { status: 500 }
    );
  }
}
