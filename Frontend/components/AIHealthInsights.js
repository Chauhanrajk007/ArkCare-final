"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Lightbulb, Target, TrendingUp, RefreshCw } from "lucide-react";

export default function AIHealthInsights({ healthData, onRefresh }) {
    const [insights, setInsights] = useState(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        // Automatically generate insights when the component loads with data
        if (
            typeof healthData?.current_score === "number" &&
            healthData?.questionnaire
        ) {
            generateInsights();
        }
    }, [healthData]);

    const generateInsights = async () => {
        setLoading(true);
        try {
            const response = await fetch('/api/generate-health-insights', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    health_score: healthData.current_score,
                    questionnaire_data: healthData.questionnaire
                })
            });

            if (!response.ok) throw new Error('Failed to generate insights');
            
            const data = await response.json();
            setInsights(data.insights);
        } catch (error) {
            console.error('Error generating insights:', error);
            // Optionally set an error state here to show a message to the user
        } finally {
            setLoading(false);
        }
    };

    if (!healthData?.questionnaire) {
        return null;
    }

    // ✨ NEW: Helper for priority badge styling
    const getPriorityBadgeClass = (priority) => {
        switch (priority) {
            case 'High':
                return 'bg-green-500/10 text-green-400 border-green-500/20';
            case 'Medium':
                return 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20';
            default:
                return 'bg-zinc-500/10 text-muted-foreground border-zinc-500/20';
        }
    };

    return (
        // 🎨 REFINED: Applied glassmorphism style to the main card
        <Card className="bg-card border border-border rounded-lg  overflow-hidden">
            <CardHeader>
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                         <div className="w-10 h-10 bg-card border border-border rounded-lg flex items-center justify-center">
                            <Lightbulb className="h-6 w-6 text-zinc-300" />
                        </div>
                        <div>
                            <CardTitle className="text-base font-medium text-white">AI Health Insights</CardTitle>
                            <CardDescription className="text-muted-foreground text-sm">Personalized analysis and recommendations.</CardDescription>
                        </div>
                    </div>
                    <button
                        onClick={generateInsights}
                        disabled={loading}
                        className="p-2 rounded-full text-muted-foreground hover:text-white hover:bg-muted transition-colors"
                        aria-label="Refresh insights"
                    >
                        <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                    </button>
                </div>
            </CardHeader>
            <CardContent>
                {loading ? (
                    // 🎨 REFINED: Loading state with consistent UI
                    <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
                        <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground mb-4" />
                        <p className="font-semibold text-zinc-300">Analyzing your health data...</p>
                        <p className="text-sm">Our AI is generating your personalized insights.</p>
                    </div>
                ) : insights ? (
                    <div className="space-y-6">
                        {/* Overall Assessment */}
                        {insights.overall_assessment && (
                            <div className="p-4 bg-muted rounded-lg border border-border">
                                <h3 className="font-semibold text-white mb-2 flex items-center gap-2">
                                    <Target className="h-4 w-4 text-zinc-300" />
                                    Overall Assessment
                                </h3>
                                <p className="text-zinc-300 text-sm leading-relaxed">
                                    {insights.overall_assessment}
                                </p>
                            </div>
                        )}

                        {/* Recommendations */}
                        {insights.recommendations?.length > 0 && (
                            <div className="space-y-4">
                                <h3 className="font-semibold text-white flex items-center gap-2">
                                    <TrendingUp className="h-4 w-4 text-zinc-300" />
                                    Action Recommendations
                                </h3>
                                {insights.recommendations.map((rec, index) => (
                                    <div key={index} className="p-4 bg-card border border-border rounded-lg">
                                        <div className="flex items-start justify-between mb-2 gap-2">
                                            <h4 className="font-medium text-zinc-100">{rec.title}</h4>
                                            {rec.priority && (
                                                <Badge className={`text-xs flex-shrink-0 ${getPriorityBadgeClass(rec.priority)}`}>
                                                    {rec.priority} Priority
                                                </Badge>
                                            )}
                                        </div>
                                        <p className="text-sm text-muted-foreground leading-relaxed">{rec.description}</p>
                                        {rec.expected_impact && (
                                            <p className="text-xs text-green-400/80 mt-2 opacity-80">
                                                Expected impact: {rec.expected_impact}
                                            </p>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Key Focus Areas */}
                        {insights.focus_areas?.length > 0 && (
                            <div>
                                <h3 className="font-semibold text-white mb-3">Key Focus Areas</h3>
                                <div className="flex flex-wrap gap-2">
                                    {insights.focus_areas.map((area, index) => (
                                        <Badge key={index} className="text-xs bg-zinc-500/10 text-zinc-300 border-zinc-500/20">
                                            {area}
                                        </Badge>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                ) : (
                    // 🎨 REFINED: Initial state with consistent UI
                    <div className="text-center py-12 text-muted-foreground">
                        <Lightbulb className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                        <p className="font-semibold text-muted-foreground">Ready for your insights?</p>
                        <p className="text-sm">Click the refresh button to have our AI analyze your health data.</p>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}