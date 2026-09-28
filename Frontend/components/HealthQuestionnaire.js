"use client";

import { useState } from "react";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { CheckCircle, Loader2, ChevronLeft, ChevronRight } from "lucide-react";

const HEALTH_QUESTIONS = [
    // Your HEALTH_QUESTIONS array remains unchanged...
    { id: "exercise_frequency", question: "How often do you exercise per week?", options: [{ value: "none", label: "Never or rarely" }, { value: "1-2", label: "1-2 times" }, { value: "3-4", label: "3-4 times" }, { value: "5-6", label: "5-6 times" }, { value: "daily", label: "Daily" }] },
    { id: "sleep_hours", question: "How many hours do you sleep on average per night?", options: [{ value: "less-5", label: "Less than 5 hours" }, { value: "5-6", label: "5-6 hours" }, { value: "7-8", label: "7-8 hours" }, { value: "8-9", label: "8-9 hours" }, { value: "more-9", label: "More than 9 hours" }] },
    { id: "diet_quality", question: "How would you rate your overall diet quality?", options: [{ value: "poor", label: "Poor (mostly processed foods)" }, { value: "fair", label: "Fair (mixed diet)" }, { value: "good", label: "Good (balanced with some healthy foods)" }, { value: "excellent", label: "Excellent (mostly whole foods)" }] },
    { id: "stress_level", question: "How would you rate your average stress level?", options: [{ value: "very-low", label: "Very low" }, { value: "low", label: "Low" }, { value: "moderate", label: "Moderate" }, { value: "high", label: "High" }, { value: "very-high", label: "Very high" }] },
    { id: "water_intake", question: "How much water do you drink per day?", options: [{ value: "less-2", label: "Less than 2 glasses" }, { value: "2-4", label: "2-4 glasses" }, { value: "5-7", label: "5-7 glasses" }, { value: "8+", label: "8+ glasses" }] },
    { id: "smoking_status", question: "Do you smoke or use tobacco products?", options: [{ value: "never", label: "Never smoked" }, { value: "former", label: "Former smoker (quit over 1 year ago)" }, { value: "recent-quit", label: "Recently quit (less than 1 year)" }, { value: "occasional", label: "Occasional smoker" }, { value: "regular", label: "Regular smoker" }] },
    { id: "alcohol_consumption", question: "How often do you consume alcohol?", options: [{ value: "never", label: "Never" }, { value: "rarely", label: "Rarely (special occasions)" }, { value: "weekly", label: "1-2 times per week" }, { value: "several-weekly", label: "3-4 times per week" }, { value: "daily", label: "Daily" }] },
    { id: "mental_wellness", question: "How often do you feel happy and content?", options: [{ value: "rarely", label: "Rarely" }, { value: "sometimes", label: "Sometimes" }, { value: "often", label: "Often" }, { value: "very-often", label: "Very often" }, { value: "always", label: "Almost always" }] },
    { id: "social_connections", question: "How satisfied are you with your social connections?", options: [{ value: "very-unsatisfied", label: "Very unsatisfied" }, { value: "unsatisfied", label: "Unsatisfied" }, { value: "neutral", label: "Neutral" }, { value: "satisfied", label: "Satisfied" }, { value: "very-satisfied", label: "Very satisfied" }] },
    { id: "work_life_balance", question: "How would you rate your work-life balance?", options: [{ value: "very-poor", label: "Very poor" }, { value: "poor", label: "Poor" }, { value: "fair", label: "Fair" }, { value: "good", label: "Good" }, { value: "excellent", label: "Excellent" }] }
];

export default function HealthQuestionnaire({ isOpen, onClose, onComplete, previousResponses = {} }) {
    const [responses, setResponses] = useState(previousResponses);
    const [loading, setLoading] = useState(false);
    const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);

    const currentQuestion = HEALTH_QUESTIONS[currentQuestionIndex];
    const isLastQuestion = currentQuestionIndex === HEALTH_QUESTIONS.length - 1;

    const handleAnswerChange = (questionId, value) => {
        setResponses(prev => ({ ...prev, [questionId]: value }));
        // Automatically move to the next question for a smoother flow
        setTimeout(() => {
            if (!isLastQuestion) handleNext();
        }, 200);
    };

    const handleNext = () => {
        if (!isLastQuestion) setCurrentQuestionIndex(prev => prev + 1);
    };

    const handleBack = () => {
        if (currentQuestionIndex > 0) setCurrentQuestionIndex(prev => prev - 1);
    };

    const handleSubmit = async () => {
        const unansweredQuestions = HEALTH_QUESTIONS.filter(q => !responses[q.id]);
        if (unansweredQuestions.length > 0) {
            alert(`Please answer all ${unansweredQuestions.length} remaining questions.`);
            return;
        }
        setLoading(true);
        try {
            await onComplete(responses);
        } catch (error) {
            console.error("Error submitting questionnaire:", error);
        } finally {
            setLoading(false);
        }
    };

    const progress = (Object.keys(responses).length / HEALTH_QUESTIONS.length) * 100;

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            {/* 🎨 REFINED: Dialog now uses the glassmorphism theme */}
            <DialogContent className="h-[650px] w-full max-w-md flex flex-col p-0 bg-card border border-border text-white ">

                <DialogHeader className="p-4 sm:p-6 border-b border-border flex-shrink-0">
                    <DialogTitle className="text-xl text-white">Health Assessment</DialogTitle>
                    <DialogDescription className="text-muted-foreground">
                        Answer all {HEALTH_QUESTIONS.length} questions for your health score.
                    </DialogDescription>
                    <div className="mt-3">
                        <div className="flex justify-between text-sm text-muted-foreground mb-2">
                            <span>{Object.keys(responses).length} of {HEALTH_QUESTIONS.length} answered</span>
                            <span>{Math.round(progress)}%</span>
                        </div>
                        <div className="w-full bg-muted rounded-full h-2">
                            <div
                                className="bg-green-500 h-2 rounded-full transition-all duration-300"
                                style={{ width: `${progress}%` }}
                            />
                        </div>
                    </div>
                </DialogHeader>

                <div className="flex-1 p-4 sm:p-6 overflow-y-auto">
                    <Card key={currentQuestion.id} className="border-none shadow-none bg-transparent">
                        <CardContent className="p-1">
                            <div className="flex items-start space-x-4">
                                <div className="flex-shrink-0 w-8 h-8 bg-muted border border-border rounded-full flex items-center justify-center text-sm font-medium text-zinc-200">
                                    {currentQuestionIndex + 1}
                                </div>
                                <div className="flex-1">
                                    <h3 className="text-lg font-medium text-zinc-100 mb-4">
                                        {currentQuestion.question}
                                    </h3>
                                    <RadioGroup
                                        value={responses[currentQuestion.id] || ""}
                                        onValueChange={(value) => handleAnswerChange(currentQuestion.id, value)}
                                        className="space-y-3"
                                    >
                                        {currentQuestion.options.map((option) => (
                                            // 🎨 REFINED: Radio button options with glassmorphism style
                                            <Label
                                                key={option.value}
                                                htmlFor={`${currentQuestion.id}-${option.value}`}
                                                className={`flex items-center space-x-3 p-4 rounded-lg border cursor-pointer transition-all duration-200 ${responses[currentQuestion.id] === option.value
                                                        ? 'bg-green-500/10 border-green-500/50 ring-2 ring-green-500/50'
                                                        : 'bg-muted border-border hover:bg-muted'
                                                    }`}
                                            >
                                                <RadioGroupItem
                                                    value={option.value}
                                                    id={`${currentQuestion.id}-${option.value}`}
                                                    className="border-border text-green-500"
                                                />
                                                <span className="flex-1 text-sm font-normal text-zinc-200">{option.label}</span>
                                            </Label>
                                        ))}
                                    </RadioGroup>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                <div className="border-t border-border p-4 sm:p-6 flex-shrink-0">
                    <div className="flex justify-between items-center">
                        <Button
                            variant="ghost"
                            onClick={handleBack}
                            disabled={loading || currentQuestionIndex === 0}
                            className="text-muted-foreground hover:bg-muted hover:text-white"
                        >
                            <ChevronLeft className="h-4 w-4 mr-1" />
                            Back
                        </Button>

                        {isLastQuestion ? (
                            <Button
                                onClick={handleSubmit}
                                disabled={loading || Object.keys(responses).length < HEALTH_QUESTIONS.length}
                                className="min-w-[150px] bg-green-600 hover:bg-green-500 text-white"
                            >
                                {loading ? (
                                    <>
                                        <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Processing...
                                    </>
                                ) : (
                                    <>
                                        <CheckCircle className="h-4 w-4 mr-2" /> Get My Score
                                    </>
                                )}
                            </Button>
                        ) : (
                            <Button
                                onClick={handleNext}
                                disabled={loading || !responses[currentQuestion.id]}
                                className="bg-muted hover:bg-muted border border-border text-white"
                            >
                                Next <ChevronRight className="h-4 w-4 ml-1" />
                            </Button>
                        )}
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}