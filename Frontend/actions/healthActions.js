"use server";

import connectDB from "@/lib/db";
import Patient from "@/models/Patient";
import Groq from 'groq-sdk';
import { requireUser } from "@/lib/auth";

const groq = new Groq({
    apiKey: process.env.GROQ_API_KEY,
});

// Function to calculate combined health score
function calculateCombinedHealthScore(questionnaireScore, aiScore) {
    // Convert to numbers and handle null/undefined
    const qScore = questionnaireScore ? Number(questionnaireScore) : 0;
    const aScore = aiScore ? Number(aiScore) : 0;

    if (qScore > 0 && aScore > 0) {
        // Both scores available: return average
        return Math.round((qScore + aScore) / 2);
    } else if (aScore > 0) {
        // Only AI score available
        return Math.round(aScore);
    } else if (qScore > 0) {
        // Only questionnaire score available  
        return Math.round(qScore);
    } else {
        // No scores available
        return 0;
    }
}

// Function to call your AI model with questionnaire score and lab summary
async function getHealthScoreFromAI({ questionnaire_score, lab_summary }) {
    try {
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
            model: "openai/gpt-oss-20b",
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

        return Math.max(0, Math.min(100, Math.round(data.health_score)));

    } catch (error) {
        console.error('Error calling AI model:', error);
        // Return null if AI fails so we know it's not available
        return null; // Return null if AI fails
    }
}

function calculateQuestionnaireScore(responses) {
    let totalScore = 20; // Reduced from 60

    const categoryScores = {
        diet: 0,
        exercise: 0,
        sleep: 0,
        mental_health: 0,
        lifestyle: 0
    };

    const MAX_QUESTION_IMPACT = 8;
    const MIN_QUESTION_IMPACT = -8;

    // Process each response
    Object.entries(responses).forEach(([questionId, answer]) => {
        const question = findQuestionById(questionId);
        if (question) {
            const option = question.options.find(opt => opt.value === answer);
            if (option) {
                let questionScore = Math.max(MIN_QUESTION_IMPACT, Math.min(MAX_QUESTION_IMPACT, option.score));

                totalScore += questionScore;

                if (categoryScores[question.category] !== undefined) {
                    categoryScores[question.category] += questionScore;
                }
            }
        }
    });

    Object.keys(categoryScores).forEach(category => {
        // Convert category scores to 0-100 scale
        // Assuming each category can have 2-4 questions, adjust base accordingly
        let normalizedScore = categoryScores[category] + 40; // Add base offset
        normalizedScore = Math.max(0, Math.min(100, normalizedScore));
        categoryScores[category] = Math.round(normalizedScore);
    });

    totalScore = Math.max(0, Math.min(100, totalScore));

    return {
        overall: Math.round(totalScore),
        categories: categoryScores
    };
}


export async function getHealthData() {
    try {
        const user = await requireUser();
        if (user.role !== "patient") throw new Error("Patient access required");
        const userId = user._id.toString();

        await connectDB();

        const patient = await Patient.findOne({ userId });
        if (!patient) {
            throw new Error("Patient not found");
        }

        // Parse patient description JSON
        let healthData = {
            questionnaire_score: 0,
            ai_score: 0,
            combined_health_score: 0,
            lab_summary: "",
            current_score: []
        };

        if (patient.patientDescription) {
            try {
                const parsed = JSON.parse(patient.patientDescription);
                healthData = { ...healthData, ...parsed };
            } catch (error) {
                console.error("Error parsing patient description:", error);
            }
        }

        // Return in UI format
        return {
            current_score: healthData.combined_health_score || 0,
            questionnaire: healthData.questionnaire_data,
            trend: healthData.trend || 'stable',
            lab_data: healthData.lab_summary || "",
            questionnaire_score: healthData.questionnaire_score || 0,
            ai_score: healthData.ai_score || 0,
            combined_score: healthData.combined_health_score || 0
        };

    } catch (error) {
        console.error("Error getting health data:", error);
        throw error;
    }
}

export async function updateHealthScore(questionnaireResponses) {
    try {
        const user = await requireUser();
        if (user.role !== "patient") throw new Error("Patient access required");
        const userId = user._id.toString();

        await connectDB();

        const patient = await Patient.findOne({ userId });
        if (!patient) {
            throw new Error("Patient not found");
        }

        // Calculate questionnaire score
        const questionnaireResult = calculateQuestionnaireScore(questionnaireResponses);

        // Get existing health data
        let existingData = {
            questionnaire_score: 0,
            ai_score: 0,
            combined_health_score: 0,
            lab_summary: "",
            current_score: []
        };

        if (patient.patientDescription) {
            try {
                existingData = JSON.parse(patient.patientDescription);
            } catch (error) {
                console.error("Error parsing existing data:", error);
            }
        }

        // Call AI model with questionnaire score and lab summary
        const aiHealthScore = await getHealthScoreFromAI({
            questionnaire_score: questionnaireResult.overall,
            lab_summary: existingData.lab_summary || ""
        });

        const combinedHealthScore = calculateCombinedHealthScore(
            questionnaireResult.overall,
            aiHealthScore
        );

        // Determine trend
        let trend = 'stable';
        if (existingData.current_score && existingData.current_score.length > 0) {
            const lastScore = existingData.current_score[existingData.current_score.length - 1].combined_score;
            if (combinedHealthScore > lastScore + 5) trend = 'improving';
            else if (combinedHealthScore < lastScore - 5) trend = 'declining';
        }

        // Update current_score array with new combined score
        const newScoreEntry = {
            combined_score: combinedHealthScore,
            questionnaire_score: questionnaireResult.overall,
            ai_score: aiHealthScore || 0,
            date: new Date().toISOString(),
            type: "combined"
        };

        const currentScoreArray = Array.isArray(existingData.current_score)
            ? existingData.current_score
            : [];

        const updatedScoreHistory = [
            ...currentScoreArray,
            newScoreEntry
        ].slice(-10); // Keep only last 10 scores

        // Create updated health data structure
        const updatedHealthData = {
            questionnaire_score: questionnaireResult.overall,
            ai_score: aiHealthScore || 0,
            combined_health_score: combinedHealthScore, // This is the main score for display
            lab_summary: existingData.lab_summary || "",
            current_score: updatedScoreHistory,
            questionnaire_data: {
                responses: questionnaireResponses,
                categories: questionnaireResult.categories,
                last_taken: new Date().toISOString()
            },
            trend: trend,
            last_updated: new Date().toISOString()
        };

        // Save updated JSON to database
        await Patient.findByIdAndUpdate(patient._id, {
            patientDescription: JSON.stringify(updatedHealthData)
        });

        // Return data in UI format
        return {
            current_score: combinedHealthScore, // Use combined score for display
            questionnaire: updatedHealthData.questionnaire_data,
            trend: updatedHealthData.trend,
            lab_data: updatedHealthData.lab_summary,
            questionnaire_score: questionnaireResult.overall,
            ai_score: aiHealthScore || 0,
            combined_score: combinedHealthScore
        };

    } catch (error) {
        console.error("Error updating health score:", error);
        throw error;
    }
}

// Helper function to find question by ID
function findQuestionById(questionId) {
    const allQuestions = [
        ...QUESTION_BANK.basics,
        ...QUESTION_BANK.diet,
        ...QUESTION_BANK.mental_health,
        ...QUESTION_BANK.lifestyle,
        ...QUESTION_BANK.followup
    ];
    return allQuestions.find(q => q.id === questionId);
}

// REPLACE your QUESTION_BANK with this improved version:
const QUESTION_BANK = {
    basics: [
        {
            id: "age_group",
            category: "demographics",
            options: [
                { value: "18-25", score: 0 },
                { value: "26-35", score: 2 },
                { value: "36-45", score: 0 },
                { value: "46-55", score: -2 },
                { value: "56-65", score: -4 },
                { value: "65+", score: -6 }
            ]
        },
        {
            id: "exercise_frequency",
            category: "exercise",
            options: [
                { value: "none", score: -8 },
                { value: "1-2", score: 2 },
                { value: "3-4", score: 6 },
                { value: "5-6", score: 8 },
                { value: "daily", score: 8 }
            ]
        },
        {
            id: "sleep_hours",
            category: "sleep",
            options: [
                { value: "less-5", score: -6 },
                { value: "5-6", score: -2 },
                { value: "7-8", score: 8 },
                { value: "8-9", score: 6 },
                { value: "more-9", score: 2 }
            ]
        }
    ],
    diet: [
        {
            id: "fruit_veggie_intake",
            category: "diet",
            options: [
                { value: "none", score: -6 },
                { value: "1-2", score: 0 },
                { value: "3-4", score: 4 },
                { value: "5-6", score: 6 },
                { value: "7+", score: 8 }
            ]
        },
        {
            id: "water_intake",
            category: "diet",
            options: [
                { value: "less-2", score: -4 },
                { value: "2-4", score: 0 },
                { value: "5-7", score: 4 },
                { value: "8+", score: 6 }
            ]
        },
        {
            id: "processed_food",
            category: "diet",
            options: [
                { value: "daily", score: -8 },
                { value: "few-times-week", score: -4 },
                { value: "weekly", score: -1 },
                { value: "monthly", score: 3 },
                { value: "rarely", score: 6 }
            ]
        },
        {
            id: "diet_quality",
            category: "diet",
            options: [
                { value: "poor", score: -8 },
                { value: "fair", score: 2 },
                { value: "good", score: 6 },
                { value: "excellent", score: 8 }
            ]
        }
    ],
    mental_health: [
        {
            id: "stress_level",
            category: "mental_health",
            options: [
                { value: "very-low", score: 8 },
                { value: "low", score: 6 },
                { value: "moderate", score: 2 },
                { value: "high", score: -3 },
                { value: "very-high", score: -6 }
            ]
        },
        {
            id: "mental_wellness",
            category: "mental_health",
            options: [
                { value: "rarely", score: -6 },
                { value: "sometimes", score: 0 },
                { value: "often", score: 4 },
                { value: "very-often", score: 6 },
                { value: "always", score: 8 }
            ]
        },
        {
            id: "social_connections",
            category: "mental_health",
            options: [
                { value: "very-unsatisfied", score: -8 },
                { value: "unsatisfied", score: -3 },
                { value: "neutral", score: 0 },
                { value: "satisfied", score: 5 },
                { value: "very-satisfied", score: 8 }
            ]
        }
    ],
    lifestyle: [
        {
            id: "smoking_status",
            category: "lifestyle",
            options: [
                { value: "never", score: 8 },
                { value: "former", score: 4 },
                { value: "recent-quit", score: 2 },
                { value: "occasional", score: -6 },
                { value: "regular", score: -8 }
            ]
        },
        {
            id: "alcohol_consumption",
            category: "lifestyle",
            options: [
                { value: "never", score: 4 },
                { value: "rarely", score: 3 },
                { value: "weekly", score: 1 },
                { value: "several-weekly", score: -2 },
                { value: "daily", score: -6 }
            ]
        },
        {
            id: "work_life_balance",
            category: "lifestyle",
            options: [
                { value: "very-poor", score: -8 },
                { value: "poor", score: -4 },
                { value: "fair", score: 0 },
                { value: "good", score: 5 },
                { value: "excellent", score: 8 }
            ]
        }
    ],
    followup: [
        {
            id: "exercise_type",
            category: "exercise",
            options: [
                { value: "cardio", score: 3 },
                { value: "strength", score: 3 },
                { value: "mixed", score: 5 },
                { value: "sports", score: 4 },
                { value: "yoga", score: 3 }
            ]
        },
        {
            id: "stress_management",
            category: "mental_health",
            options: [
                { value: "none", score: -2 },
                { value: "meditation", score: 6 },
                { value: "exercise", score: 4 },
                { value: "hobbies", score: 3 },
                { value: "social", score: 2 }
            ]
        },
        {
            id: "sleep_quality",
            category: "sleep",
            options: [
                { value: "poor", score: -4 },
                { value: "fair", score: 1 },
                { value: "good", score: 4 },
                { value: "excellent", score: 6 }
            ]
        }
    ]
};
