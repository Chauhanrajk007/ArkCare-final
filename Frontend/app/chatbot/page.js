"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { v4 as uuidv4 } from "uuid";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import PDFUploaderModal from './PDFUploaderModal';
import {
    MessageCircle,
    Send,
    Bot,
    User,
    Stethoscope,
    Phone,
    Calendar,
    ArrowLeft,
    FileText
} from "lucide-react";
import BookAppointmentModal from "@/components/BookAppointmentModal";
import { getDoctorForBooking } from "@/actions/doctorActions";

export default function ChatbotPage() {
    const router = useRouter();

    // Generate a permanent discussion thread ID for this session when component mounts
    const threadId = useMemo(() => uuidv4(), []);

    const [input, setInput] = useState("");
    const [messages, setMessages] = useState([]);
    const [loading, setLoading] = useState(false);
    const [selectedDoctor, setSelectedDoctor] = useState(null);
    const [isBookingModalOpen, setIsBookingModalOpen] = useState(false);
    const messagesEndRef = useRef(null);
    const scrollAreaRef = useRef(null);
    const [isUploaderOpen, setIsUploaderOpen] = useState(false);


    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!input.trim() || loading) return;

        const userMessage = { text: input, isUser: true, timestamp: new Date() };
        setMessages(prev => [...prev, userMessage]);
        setInput("");
        setLoading(true);

        try {
            const myHeaders = new Headers();
            myHeaders.append("Content-Type", "application/json");

            const raw = JSON.stringify({
                "prompt": input,
                "thread_id": threadId // Send the thread ID generated on component load
            });

            const requestOptions = {
                method: "POST",
                headers: myHeaders,
                body: raw,
                redirect: "follow"
            };

            const response = await fetch("/api/chat", requestOptions);

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || `HTTP ${response.status}`);
            }

            const data = await response.json();
            const aiMessage = {
                text: data.response,
                isUser: false,
                timestamp: new Date(),
                analysis: data.analysis || null,
                specialists: data.specialists || [],
                doctorSource: data.doctor_source || null,
                isSerious: data.is_serious || false,
            };
            setMessages(prev => [...prev, aiMessage]);
        } catch (error) {
            console.error("Chat error:", error);
            const errorMsg = {
                text: `Sorry, I'm having trouble connecting to the AI service. ${error.message}`,
                isUser: false,
                timestamp: new Date(),
                isError: true,
            };
            setMessages(prev => [...prev, errorMsg]);
        } finally {
            setLoading(false);
        }
    };

    const handleBookAppointment = async (doctor) => {
        try {
            const doctorData = await getDoctorForBooking({
                doctorId: doctor.doctor_id,
            });
            setSelectedDoctor(doctorData);
            setIsBookingModalOpen(true);
        } catch (error) {
            console.error("Could not load doctor booking details:", error);
            alert(error.message || "This doctor is not available for booking");
        }
    };

    const formatTime = (timestamp) => {
        return new Date(timestamp).toLocaleTimeString("en-US", {
            hour: "2-digit",
            minute: "2-digit",
        });
    };

    useEffect(() => {
        if (scrollAreaRef.current) {
            scrollAreaRef.current.scrollTop = scrollAreaRef.current.scrollHeight;
        }
    }, [messages, loading]);

    const handleScrollToBottom = () => {
        if (scrollAreaRef.current) {
            scrollAreaRef.current.scrollTop = scrollAreaRef.current.scrollHeight;
        }
    };

    return (
        <div className="fixed inset-0 z-40 flex flex-col bg-transparent">
            <div className="absolute top-20 left-10 w-2 h-2 bg-green-400 rounded-full animate-pulse opacity-40"></div>
            <div className="absolute top-40 right-20 w-1 h-1 bg-green-300 rounded-full animate-pulse opacity-30"></div>
            <div className="absolute bottom-32 left-1/4 w-1.5 h-1.5 bg-green-200 rounded-full animate-pulse opacity-35"></div>

            {/* Top Header with Navigation */}
            <div className="surface-panel relative z-10 m-3 flex items-center justify-between rounded-2xl border p-3 md:m-4 md:p-4">
                <div className="flex items-center space-x-3">
                    <button
                        onClick={() => router.push('/patient')}
                        className="p-2 rounded-2xl bg-card hover:bg-muted/90 text-zinc-300 hover:text-white transition-all duration-200"
                        aria-label="Go back"
                    >
                        <ArrowLeft className="h-5 w-5" />
                    </button>
                    <div className="flex items-center space-x-2">
                        <div className="p-2 bg-green-500/15 border border-green-400/20 rounded-2xl">
                            <Bot className="h-6 w-6 text-green-400" />
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <h1 className="text-lg font-bold text-white">ArkCare AI Guide</h1>
                                <span className="status-chip hidden sm:inline-flex">Care quest</span>
                            </div>
                            <p className="text-xs text-muted-foreground">Private session • triage + specialist discovery</p>
                        </div>
                    </div>
                </div>
                <Button onClick={() => setIsUploaderOpen(true)} variant="outline"
                    className="bg-muted/70 text-zinc-200 border-border hover:bg-muted hover:text-white"
                >Upload Reports</Button>
                <PDFUploaderModal isOpen={isUploaderOpen} onClose={() => setIsUploaderOpen(false)} />

            </div>

            {/* Enhanced Chat Container */}
            <div className="relative z-10 flex-1 flex flex-col bg-transparent max-h-full overflow-hidden">
                <div className="flex-1 flex flex-col overflow-hidden relative min-h-0">
                    {/* Messages Area with better styling */}
                    <div
                        ref={scrollAreaRef}
                        className="flex-1 p-6 overflow-y-scroll"
                        style={{
                            scrollbarWidth: 'thin',
                            scrollbarColor: 'rgba(255,255,255,0.3) transparent'
                        }}
                    >
                        {messages.length === 0 ? (
                            <div className="flex items-center justify-center h-full">
                                <div className="text-center py-12 max-w-md">
                                    <div className="p-6 bg-green-500/10 rounded-full w-fit mx-auto mb-6 border border-green-500/15">
                                        <Bot className="h-16 w-16 text-green-400" />
                                    </div>
                                    <h3 className="text-xl font-bold text-white mb-3">
                                        Start a care conversation
                                    </h3>
                                    <p className="text-muted-foreground mb-6 leading-relaxed">
                                        Describe what you are experiencing. ArkCare can organize the concern, suggest an appropriate specialty, and surface bookable doctors when relevant.
                                    </p>
                                    <div className="grid grid-cols-1 gap-2 text-sm">
                                        <div className="p-3 bg-muted rounded-2xl border border-border">
                                            <span className="text-green-400">💡 Example: </span>
                                            <span className="text-zinc-300">"I have a persistent headache and feel dizzy"</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-6 max-w-4xl mx-auto w-full">
                                {messages.map((message, index) => (
                                    <div
                                        key={index}
                                        className={`flex ${message.isUser ? "justify-end" : "justify-start"} group`}
                                    >
                                        <div
                                            className={`max-w-[85%] rounded-2xl px-6 py-4  ${message.isUser
                                                ? "bg-green-500/90 text-white border border-green-400/40 backdrop-blur-sm"
                                                : message.isError
                                                    ? "bg-green-900/40 text-green-300 border border-green-500/40 backdrop-blur-sm"
                                                    : "bg-card text-zinc-100 border border-border"
                                                } transition-all duration-200 group-hover:shadow-xl ${message.isUser
                                                    ? "group-hover:shadow-green-500/20"
                                                    : "group-hover:shadow-gray-500/10"
                                                }`}
                                        >
                                            {/* Enhanced Message Header */}
                                            <div className="flex items-center justify-between mb-3">
                                                <div className="flex items-center space-x-2">
                                                    <div className={`p-1 rounded-full ${message.isUser
                                                        ? "bg-white/20"
                                                        : "bg-green-500/20"
                                                        }`}>
                                                        {message.isUser ?
                                                            <User className="h-3 w-3" /> :
                                                            <Bot className="h-3 w-3 text-green-400" />
                                                        }
                                                    </div>
                                                    <span className="text-xs font-medium opacity-80">
                                                        {message.isUser ? "You" : "AI Assistant"}
                                                    </span>
                                                </div>
                                                <span className="text-xs opacity-60">
                                                    {formatTime(message.timestamp)}
                                                </span>
                                            </div>

                                            {/* Enhanced Message Text */}
                                            <div className="leading-relaxed whitespace-pre-wrap text-sm">
                                                {message.text}
                                            </div>

                                            {/* Enhanced Specialists Section */}
                                            {message.specialists && message.specialists.length > 0 && (
                                                <div className="mt-6 p-4 bg-card rounded-2xl border border-border">
                                                    <div className="flex items-center space-x-2 mb-4">
                                                        <div className="p-1 bg-green-500/15 rounded border border-green-400/20">
                                                            <Stethoscope className="h-4 w-4 text-green-400" />
                                                        </div>
                                                        <span className="font-semibold text-sm text-white">Recommended Specialists</span>
                                                        {message.doctorSource === "mongodb_live" && (
                                                            <span className="cq-pixel-label cq-real-label ml-auto">
                                                                LIVE DATABASE
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div className="grid gap-3">
                                                        {message.specialists.map((specialist, specIndex) => (
                                                            <div
                                                                key={specialist.doctor_id || specIndex}
                                                                data-doctor-id={specialist.doctor_id || ""}
                                                                className="bg-muted rounded-2xl p-4 border border-border hover:bg-muted/80 transition-colors"
                                                            >
                                                                <div className="flex items-start justify-between">
                                                                    <div className="flex-1">
                                                                        <h4 className="font-semibold text-white">{specialist.name}</h4>
                                                                        <p className="text-sm text-green-400 mb-2">{specialist.specialization}</p>
                                                                        <div className="flex items-center space-x-4 text-xs text-muted-foreground">
                                                                            <span className="flex items-center space-x-1">
                                                                                <div className="w-1.5 h-1.5 bg-green-400 rounded-full"></div>
                                                                                <span>{specialist.experience} years exp</span>
                                                                            </span>
                                                                            {Number.isFinite(Number(specialist.consultationFee)) && (
                                                                                <span>₹{Number(specialist.consultationFee).toLocaleString("en-IN")}</span>
                                                                            )}
                                                                            {specialist.phone && (
                                                                                <div className="flex items-center space-x-1">
                                                                                    <Phone className="h-3 w-3" />
                                                                                    <span>{specialist.phone}</span>
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                    <Button
                                                                        size="sm"
                                                                        onClick={() => handleBookAppointment(specialist)}
                                                                        className="ml-3 bg-green-500/90 hover:bg-green-400/90 text-white border border-green-400/40  hover:shadow-green-500/20 transition-all"
                                                                    >
                                                                        <Calendar className="h-3 w-3 mr-1" />
                                                                        Book Now
                                                                    </Button>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ))}

                                {/* Enhanced Loading Message */}
                                {loading && (
                                    <div className="flex justify-start group">
                                        <div className="bg-card border border-border rounded-2xl px-6 py-4 max-w-[85%] ">
                                            <div className="flex items-center space-x-3">
                                                <div className="p-1 bg-green-500/15 rounded-full border border-green-400/20">
                                                    <Bot className="h-3 w-3 text-green-400" />
                                                </div>
                                                <div className="flex space-x-1">
                                                    <div className="w-2 h-2 bg-green-400 rounded-full animate-bounce"></div>
                                                    <div className="w-2 h-2 bg-green-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                                                    <div className="w-2 h-2 bg-green-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                                                </div>
                                                <span className="text-sm text-zinc-300">AI is analyzing your symptoms...</span>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Enhanced Scroll to Bottom Button */}
                    {messages.length > 0 && (
                        <button
                            type="button"
                            onClick={handleScrollToBottom}
                            className="absolute right-6 bottom-32 z-20 bg-green-500/90 hover:bg-green-400/90 text-white rounded-full  p-3 transition-all duration-200 border border-green-400/30 hover:scale-105"
                            aria-label="Scroll to bottom"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                            </svg>
                        </button>
                    )}

                    {/* Enhanced Input Area */}
                    <div className="surface-panel m-3 mt-0 rounded-2xl border p-4 md:m-4 md:mt-0 md:p-5">
                        <div className="max-w-4xl mx-auto">
                            <form onSubmit={handleSubmit} className="flex space-x-4">
                                <div className="flex-1 relative">
                                    <Input
                                        value={input}
                                        onChange={(e) => setInput(e.target.value)}
                                        placeholder="Describe your symptoms or ask a health question..."
                                        disabled={loading}
                                        className="w-full bg-muted border-border text-zinc-100 placeholder:text-muted-foreground focus-visible:ring-green-400 focus-visible:border-green-400/60 h-14 text-base px-6 rounded-2xl  transition-all duration-200"
                                    />
                                </div>
                                <Button
                                    type="submit"
                                    disabled={loading || !input.trim()}
                                    className="h-14 w-14 bg-green-500/90 hover:bg-green-400/90 rounded-2xl  hover:shadow-green-500/20 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed border border-green-400/40"
                                >
                                    <Send className="h-5 w-5" />
                                </Button>
                            </form>
                            <div className="flex items-center justify-between mt-4">
                                <p className="text-xs text-muted-foreground">
                                    💡 Try: "I have chest pain and shortness of breath" or "What are the symptoms of diabetes?"
                                </p>
                                <div className="flex items-center space-x-2 text-xs text-muted-foreground">
                                    <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                                    <span>AI Assistant Online</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Booking Modal */}
            {selectedDoctor && (
                <BookAppointmentModal
                    doctor={selectedDoctor}
                    isOpen={isBookingModalOpen}
                    onClose={() => {
                        setIsBookingModalOpen(false);
                        setSelectedDoctor(null);
                    }}
                />
            )}

        </div>
    );
}
