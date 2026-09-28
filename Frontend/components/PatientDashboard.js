"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
    Calendar,
    Star,
    Clock,
    User,
    CreditCard,
    MessageCircle,
    Activity,
    Heart,
    Brain,
    Shield,
    Eye,
    Zap,
    Sparkles,
} from "lucide-react";
import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import BookAppointmentModal from "./BookAppointmentModal";
import ChatModal from "./ChatModal";
import {
    cancelPatientAppointment,
    getPatientAppointments,
} from "@/actions/appointmentActions";

const DashboardHeader = () => (
    <div className="surface-frame mb-8 rounded-[1.5rem]">
        <div className="surface-panel rounded-[1.5rem] border p-5 md:p-6">
            <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
                <div className="flex items-start gap-4">
                    <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl border border-cyan-300/20 bg-cyan-300/10">
                        <Zap className="h-6 w-6 text-cyan-200" />
                    </div>
                    <div>
                        <div className="mb-2 flex flex-wrap gap-2">
                            <span className="status-chip">Patient journey</span>
                            <span className="status-chip">Care missions ready</span>
                        </div>
                        <h1 className="text-2xl font-black tracking-tight text-white md:text-3xl">
                            Your care command center
                        </h1>
                        <p className="mt-1 max-w-xl text-sm leading-6 text-muted-foreground md:text-base">
                            Find doctors, complete consultations, understand reports, and build a continuous health journey.
                        </p>
                    </div>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                    <Link
                        href="/health"
                        className="inline-flex items-center justify-center rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-semibold text-zinc-200 transition hover:bg-white/10"
                    >
                        <Heart className="mr-2 h-4 w-4 text-cyan-200" />
                        Health Journey
                    </Link>
                    <Link
                        href="/chatbot"
                        className="inline-flex items-center justify-center rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-semibold text-zinc-200 transition hover:bg-white/10"
                    >
                        <Sparkles className="mr-2 h-4 w-4 text-violet-200" />
                        AI Guide
                    </Link>
                    
                </div>
            </div>
        </div>
    </div>
);

const CategoryFilters = ({ categories, selectedCategory, setSelectedCategory }) => {
    const getCategoryIcon = (category) => {
        switch (category.toLowerCase()) {
            case "cardiology": return <Heart className="h-4 w-4" />;
            case "neurology": return <Brain className="h-4 w-4" />;
            case "dermatology": return <Shield className="h-4 w-4" />;
            case "ophthalmology": return <Eye className="h-4 w-4" />;
            case "general":
            default: return <Activity className="h-4 w-4" />;
        }
    };

    return (
        <div className="bg-card border border-border rounded-2xl p-6">
            <h2 className="text-white flex items-center space-x-2 text-xl font-semibold mb-4">
                <Shield className="h-5 w-5 text-green-400" />
                <span>Filter by Specialization</span>
            </h2>
            <div className="flex flex-wrap gap-3">
                {categories.map((category) => (
                    <button
                        key={category}
                        onClick={() => setSelectedCategory(category)}
                        className={`capitalize transition-all duration-150 rounded-lg px-4 py-2 md:px-5 md:py-2 font-medium border text-sm md:text-base flex items-center space-x-2 ${selectedCategory === category
                            ? "bg-green-500 text-white border-green-500"
                            : "bg-muted hover:bg-muted text-zinc-300 hover:text-white border-border hover:border-green-500/30"
                            }`}
                    >
                        {category !== "all" && getCategoryIcon(category)}
                        <span>{category === "all" ? "All Doctors" : category}</span>
                    </button>
                ))}
            </div>
        </div>
    );
};

const DoctorCard = ({ doctor, onBookAppointment }) => (
    <div className="group rounded-2xl border border-border bg-card hover:border-green-500/30 transition-all duration-150 flex flex-col">
        <div className="p-6">
            <h2 className="text-xl font-semibold text-white group-hover:text-green-300 transition-colors">
                {doctor.name}
            </h2>
            <p className="font-medium text-green-400">{doctor.specialization}</p>
        </div>
        <div className="px-6 pb-6 space-y-4 flex-grow flex flex-col">
            <div className="flex items-center text-sm text-muted-foreground space-x-4">
                <span className="flex items-center"><Star className="h-4 w-4 mr-1.5 text-green-400" /> {doctor.experience} years exp</span>
                <span className="flex items-center">₹{doctor.consultationFee}</span>
            </div>
            {doctor.qualifications?.length > 0 && (
                <div className="flex flex-wrap gap-2">
                    {doctor.qualifications.slice(0, 2).map((qual, index) => (
                        <span key={index} className="text-xs bg-muted text-zinc-300 border border-border font-semibold px-2.5 py-1 rounded-full">
                            {qual}
                        </span>
                    ))}
                    {doctor.qualifications.length > 2 && (
                        <span className="text-xs bg-muted text-zinc-300 border border-border font-semibold px-2.5 py-1 rounded-full">
                            +{doctor.qualifications.length - 2} more
                        </span>
                    )}
                </div>
            )}
            <button
                className="w-full bg-green-500 hover:bg-green-600 text-white font-medium rounded-lg py-3 mt-auto inline-flex items-center justify-center transition-all transform hover:-translate-y-0.5"
                onClick={() => onBookAppointment(doctor)}
            >
                <Calendar className="h-5 w-5 mr-2" />
                Book Appointment
            </button>
        </div>
    </div>
);

const AppointmentCard = ({
    appointment,
    onOpenChat,
    onCancel,
    cancelling,
}) => {
    const getStatusColor = (status) => {
        switch (status) {
            case "pending": return "bg-yellow-500/10 text-yellow-400 border-yellow-400/20";
            case "confirmed": return "bg-green-500/10 text-green-400 border-green-400/20";
            case "completed": return "bg-blue-500/10 text-blue-400 border-blue-400/20";
            case "cancelled": return "bg-red-500/10 text-red-300 border-red-400/20";
            default: return "bg-muted/20 text-muted-foreground border-zinc-500/40";
        }
    };

    return (
        <div className="rounded-2xl border border-border bg-card p-6 space-y-4 hover:border-green-500/30 transition-all duration-150">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                <div>
                    <h2 className="text-lg font-semibold text-white">{appointment.doctor?.name || "N/A"}</h2>
                    <p className="text-green-400 text-sm">{appointment.doctor?.specialization || "N/A"}</p>
                </div>
                <span className={`${getStatusColor(appointment.status)} border font-medium text-xs px-2.5 py-1 rounded-full self-start`}>
                    {appointment.status}
                </span>
            </div>

            <div className="border-t border-border pt-4 space-y-3 text-sm text-muted-foreground">
                <div className="flex items-center"><Calendar className="h-4 w-4 mr-3 text-green-400" />{new Date(appointment.appointmentDate).toLocaleString('en-US', { dateStyle: 'full', timeStyle: 'short' })}</div>
                {appointment.payment ? (
                    <div className="rounded-lg border border-border bg-white/5 p-3">
                        <div className="flex flex-wrap items-center gap-2">
                            <CreditCard className="h-4 w-4 text-green-400" />
                            <span className="font-semibold text-zinc-200">
                                {appointment.payment.provider === "razorpay"
                                    ? "Razorpay"
                                    : "Demo payment"}
                            </span>
                            <span className="cq-pixel-label">
                                {String(appointment.payment.status || "unknown").toUpperCase()}
                            </span>
                        </div>
                        <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                            {appointment.payment.provider === "razorpay" ? (
                                <>
                                    <div>
                                        Paid: ₹{Number(appointment.payment.grossAmount || 0).toLocaleString("en-IN")}
                                        {appointment.payment.paymentMethod
                                            ? ` · ${String(appointment.payment.paymentMethod).toUpperCase()}`
                                            : ""}
                                        {Number(appointment.payment.refundAmount || 0) > 0
                                            ? ` · Refunded ₹${Number(appointment.payment.refundAmount).toLocaleString("en-IN")}`
                                            : ""}
                                    </div>
                                    {appointment.payment.paymentId ? (
                                        <div className="break-all font-mono">
                                            Payment {appointment.payment.paymentId}
                                        </div>
                                    ) : null}
                                    {appointment.payment.orderId ? (
                                        <div className="break-all font-mono">
                                            Order {appointment.payment.orderId}
                                        </div>
                                    ) : null}
                                </>
                            ) : (
                                <div>Synthetic demo booking · no money charged</div>
                            )}
                        </div>
                    </div>
                ) : appointment.paymentId ? (
                    <div className="flex items-center">
                        <CreditCard className="h-4 w-4 mr-3 text-green-400" />
                        Paid: ₹{appointment.amount}
                    </div>
                ) : null}
            </div>

            {appointment.reason && <p className="text-sm bg-muted rounded-lg p-3"><span className="font-medium text-zinc-300">Reason: </span><span className="text-muted-foreground">{appointment.reason}</span></p>}
            {appointment.notes && <p className="text-sm bg-muted rounded-lg p-3"><span className="font-medium text-zinc-300">Doctor's Notes: </span><span className="text-muted-foreground">{appointment.notes}</span></p>}

            {appointment.status === "confirmed" && (
                <div className="grid gap-2 sm:grid-cols-2">
                    <button
                        onClick={() => onOpenChat(appointment)}
                        className="w-full bg-muted hover:bg-muted text-zinc-300 hover:text-white border border-border hover:border-green-500/30 transition-all rounded-lg h-10 px-3 inline-flex items-center justify-center text-sm mt-2"
                    >
                        <MessageCircle className="h-4 w-4 mr-2" />
                        Chat with Doctor
                    </button>
                    {new Date(appointment.appointmentDate) > new Date() ? (
                        <button
                            onClick={() => onCancel(appointment)}
                            disabled={cancelling}
                            className="w-full rounded-lg border border-red-300/20 bg-red-500/5 px-3 py-2 text-sm font-semibold text-red-300 transition hover:bg-red-500/10 disabled:opacity-50 sm:mt-2"
                        >
                            {cancelling
                                ? "Cancelling..."
                                : appointment.payment?.provider === "razorpay"
                                    ? "Cancel & Refund"
                                    : "Cancel Appointment"}
                        </button>
                    ) : null}
                </div>
            )}

            {appointment.status === "cancelled" && appointment.cancellationReason ? (
                <p className="rounded-lg border border-red-300/10 bg-red-500/5 p-3 text-xs text-red-200/80">
                    Cancelled: {appointment.cancellationReason}
                </p>
            ) : null}
        </div>
    );
};

export default function PatientDashboard({ doctors }) {
    const searchParams = useSearchParams();
    const [selectedCategory, setSelectedCategory] = useState("all");
    const [selectedDoctor, setSelectedDoctor] = useState(null);
    const [isBookingModalOpen, setIsBookingModalOpen] = useState(false);
    const [appointments, setAppointments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedAppointmentForChat, setSelectedAppointmentForChat] = useState(null);
    const [isChatModalOpen, setIsChatModalOpen] = useState(false);
    const [activeTab, setActiveTab] = useState("find-doctors");
    const [cancellingId, setCancellingId] = useState("");
    const [appointmentMessage, setAppointmentMessage] = useState("");

    useEffect(() => {
        fetchAppointments();
        const tabParam = searchParams.get("tab");
        if (tabParam === "my-appointments") {
            setActiveTab("my-appointments");
        }
    }, [searchParams]);

    const fetchAppointments = async () => {
        setLoading(true);
        try {
            const data = await getPatientAppointments();
            setAppointments(data);
        } catch (error) {
            console.error("Error fetching appointments:", error);
        } finally {
            setLoading(false);
        }
    };

    const handleBookAppointment = (doctor) => {
        setSelectedDoctor({ ...doctor, _id: doctor._id?.toString() });
        setIsBookingModalOpen(true);
    };

    const handleOpenChat = (appointment) => {
        setSelectedAppointmentForChat(appointment);
        setIsChatModalOpen(true);
    };

    const handleCancelAppointment = async (appointment) => {
        const isPaid = appointment.payment?.provider === "razorpay";
        const confirmed = window.confirm(
            isPaid
                ? "Cancel this appointment and start the Razorpay refund?"
                : "Cancel this appointment?"
        );
        if (!confirmed) return;

        setCancellingId(appointment._id);
        setAppointmentMessage("");

        try {
            const result = await cancelPatientAppointment(
                appointment._id,
                "Cancelled by patient from My Appointments"
            );

            setAppointmentMessage(
                result?.refund?.refunded
                    ? "Appointment cancelled. Razorpay refund was initiated to the original payment method."
                    : "Appointment cancelled."
            );
            await fetchAppointments();
        } catch (error) {
            setAppointmentMessage(
                error.message || "Could not cancel this appointment"
            );
        } finally {
            setCancellingId("");
        }
    };

    const doctorsByCategory = doctors.reduce((acc, doctor) => {
        acc[doctor.category] = acc[doctor.category] || [];
        acc[doctor.category].push(doctor);
        return acc;
    }, {});

    const categories = ["all", ...Object.keys(doctorsByCategory)];
    const filteredDoctors = selectedCategory === "all" ? doctors : doctorsByCategory[selectedCategory] || [];

    return (
        <div className="ark-page min-h-screen p-4 md:p-8">
            <main className="max-w-7xl mx-auto">
                <DashboardHeader />

                <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-8">
                    <div className="bg-card border border-border rounded-lg p-2 md:p-3">
                        <TabsList className="grid w-full grid-cols-2 bg-transparent gap-2 md:gap-3 h-auto">
                            <TabsTrigger value="find-doctors" className="data-[state=active]:bg-green-500 data-[state=active]:text-primary-foreground text-muted-foreground hover:text-white rounded-lg py-3 px-2 md:py-4 md:px-6 font-medium text-sm md:text-base">
                                <Calendar className="h-5 w-5 mr-2" /> Find Doctors
                            </TabsTrigger>
                            <TabsTrigger value="my-appointments" className="data-[state=active]:bg-green-500 data-[state=active]:text-primary-foreground text-muted-foreground hover:text-white rounded-lg py-3 px-2 md:py-4 md:px-6 font-medium text-sm md:text-base">
                                <User className="h-5 w-5 mr-2" /> My Appointments
                            </TabsTrigger>
                        </TabsList>
                    </div>

                    <TabsContent value="find-doctors" className="space-y-8">
                        <CategoryFilters categories={categories} selectedCategory={selectedCategory} setSelectedCategory={setSelectedCategory} />
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {filteredDoctors.length > 0 ? (
                                filteredDoctors.map((doctor) => (
                                    <DoctorCard key={doctor._id} doctor={doctor} onBookAppointment={handleBookAppointment} />
                                ))
                            ) : (
                                <p className="col-span-full text-center text-muted-foreground py-12">No doctors found for this category.</p>
                            )}
                        </div>
                    </TabsContent>

                    <TabsContent value="my-appointments" className="space-y-8">
                        {appointmentMessage ? (
                            <div className="rounded-xl border border-border bg-white/5 px-4 py-3 text-sm text-zinc-300">
                                {appointmentMessage}
                            </div>
                        ) : null}
                        {loading ? (
                            <p className="text-center text-muted-foreground py-12">Loading appointments...</p>
                        ) : appointments.length > 0 ? (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                {appointments.map((appointment) => (
                                    <AppointmentCard
                                        key={appointment._id}
                                        appointment={appointment}
                                        onOpenChat={handleOpenChat}
                                        onCancel={handleCancelAppointment}
                                        cancelling={cancellingId === appointment._id}
                                    />
                                ))}
                            </div>
                        ) : (
                            <div className="text-center py-16">
                                <User className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
                                <h3 className="text-xl font-semibold text-white">No Appointments Yet</h3>
                                <p className="text-muted-foreground mb-6">Book your first appointment to see it here.</p>
                                <button onClick={() => setActiveTab("find-doctors")} className="bg-green-500 hover:bg-green-600 text-white font-medium rounded-lg px-6 py-2.5">Find Doctors</button>
                            </div>
                        )}
                    </TabsContent>
                </Tabs>

                {selectedDoctor && (
                    <BookAppointmentModal
                        doctor={selectedDoctor}
                        isOpen={isBookingModalOpen}
                        onClose={() => {
                            setIsBookingModalOpen(false);
                            setSelectedDoctor(null);
                            fetchAppointments();
                        }}
                        onViewAppointments={() => {
                            setActiveTab("my-appointments");
                            setIsBookingModalOpen(false);
                            setSelectedDoctor(null);
                            void fetchAppointments();
                        }}
                    />
                )}
                {selectedAppointmentForChat && (
                    <ChatModal
                        appointment={selectedAppointmentForChat}
                        isOpen={isChatModalOpen}
                        onClose={() => setIsChatModalOpen(false)}
                    />
                )}
            </main>
        </div>
    );
}
