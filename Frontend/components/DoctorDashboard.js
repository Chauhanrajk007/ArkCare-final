"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Activity, Calendar, Clock, User, MessageCircle, Sparkles } from "lucide-react";
import { useState, useEffect } from "react";
import {
  getDoctorAppointments,
  updateAppointmentStatus,
} from "@/actions/appointmentActions";
import ChatModal from "./ChatModal";
import { AlertCircle } from "lucide-react";
export default function DoctorDashboard({ doctor }) {
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [updatingAppointment, setUpdatingAppointment] = useState(null);

  // Chat states
  const [selectedAppointmentForChat, setSelectedAppointmentForChat] =
    useState(null);
  const [isChatModalOpen, setIsChatModalOpen] = useState(false);

  useEffect(() => {
    if (doctor.status === "approved") {
      fetchAppointments();
    }
  }, [doctor.status]);

  const fetchAppointments = async () => {
    try {
      const data = await getDoctorAppointments();
      // Store original notes to compare onBlur
      setAppointments(
        data.map((apt) => ({ ...apt, originalNotes: apt.notes || "" }))
      );
    } catch (error) {
      console.error("Error fetching appointments:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleStatusUpdate = async (appointmentId, status, notes = "") => {
    setUpdatingAppointment(appointmentId);
    try {
      await updateAppointmentStatus(appointmentId, status, notes);
      await fetchAppointments();
    } catch (error) {
      console.error("Error updating appointment:", error);
    } finally {
      setUpdatingAppointment(null);
    }
  };

  const handleOpenChat = (appointment) => {
    setSelectedAppointmentForChat(appointment);
    setIsChatModalOpen(true);
  };

  const getAppointmentStatusColor = (status) => {
    switch (status) {
      case "pending":
        return "bg-yellow-500/10 text-yellow-400 border-yellow-400/20";
      case "confirmed":
        return "bg-green-500/10 text-green-400 border-green-400/20";
      case "completed":
        return "bg-blue-500/10 text-blue-400 border-blue-400/20";
      case "cancelled":
        return "bg-green-500/10 text-green-400 border-green-400/20";
      default:
        return "bg-muted/20 text-muted-foreground border-border/40";
    }
  };

  const todayAppointments = appointments.filter((apt) => {
    const today = new Date().toDateString();
    return new Date(apt.appointmentDate).toDateString() === today;
  });

  return (
    <div className="relative space-y-6 pb-24 lg:pb-4">
      <div className="space-y-6">
        <div className="surface-frame mb-8 rounded-[1.5rem]">
          <div className="surface-panel rounded-[1.5rem] border p-5 md:p-6">
            <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-violet-300/20 bg-violet-300/10">
                  <Activity className="h-6 w-6 text-violet-200" />
                </div>
                <div>
                  <div className="mb-2 flex flex-wrap gap-2">
                    <span className="status-chip">Doctor workspace</span>
                    <span className="status-chip">{doctor.status === "approved" ? "Profile verified" : "Review pending"}</span>
                  </div>
                  <h1 className="text-2xl font-black tracking-tight text-white md:text-3xl">
                    Care operations
                  </h1>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground md:text-base">
                    Welcome back, {doctor.name}. Manage consultations, notes, conversations, and your care schedule.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="hidden rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-xs font-semibold text-zinc-300 sm:inline-flex sm:items-center sm:gap-2">
                  <Sparkles className="h-4 w-4 text-cyan-200" />
                  Milestone layer ready
                </span>
                
              </div>
            </div>
          </div>
        </div>

        {doctor.status === "approved" ? (
          <Tabs defaultValue="appointments" className="space-y-8">
            <div className="bg-card border border-border rounded-2xl p-3 ">
              <TabsList className="grid w-full grid-cols-2 bg-transparent gap-3 h-auto">
                <TabsTrigger
                  value="appointments"
                  className="data-[state=active]:bg-green-600 data-[state=active]:text-primary-foreground data-[state=active]:border-green-500 data-[state=active]: data-[state=active]:shadow-green-500/20 text-zinc-300 hover:text-white hover:bg-muted/80 transition-all duration-150 border border-border rounded-2xl py-4 px-6 font-medium bg-muted text-lg"
                >
                  Appointments
                </TabsTrigger>
                <TabsTrigger
                  value="profile"
                  className="data-[state=active]:bg-green-600 data-[state=active]:text-primary-foreground data-[state=active]:border-green-500 data-[state=active]: data-[state=active]:shadow-green-500/20 text-zinc-300 hover:text-white hover:bg-muted/80 transition-all duration-150 border border-border rounded-2xl py-4 px-6 font-medium bg-muted text-lg"
                >
                  Profile
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="appointments" className="space-y-8">
              {/* Stats Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card className="bg-card border border-border  rounded-2xl">
                  <CardHeader className="pb-4">
                    <CardTitle className="text-white flex items-center space-x-3">
                      <Calendar className="h-6 w-6 text-green-400" />
                      <span>Today's Appointments</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-4xl font-bold text-green-300">
                      {todayAppointments.length}
                    </div>
                    <p className="text-md text-muted-foreground">
                      {todayAppointments.length === 0
                        ? "No appointments today"
                        : "scheduled for today"}
                    </p>
                  </CardContent>
                </Card>
                <Card className="bg-card border border-border  rounded-2xl">
                  <CardHeader className="pb-4">
                    <CardTitle className="text-white flex items-center space-x-3">
                      <User className="h-6 w-6 text-green-400" />
                      <span>Total Appointments</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-4xl font-bold text-green-300">
                      {appointments.length}
                    </div>
                    <p className="text-md text-muted-foreground">All time</p>
                  </CardContent>
                </Card>
                <Card className="bg-card border border-border  rounded-2xl">
                  <CardHeader className="pb-4">
                    <CardTitle className="text-white flex items-center space-x-3">
                      <Clock className="h-6 w-6 text-green-400" />
                      <span>Confirmed Consults</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-4xl font-bold text-green-300">
                      {
                        appointments.filter((apt) => apt.status === "confirmed")
                          .length
                      }
                    </div>
                    <p className="text-md text-muted-foreground">
                      Ready for consultation
                    </p>
                  </CardContent>
                </Card>
              </div>

              {/* Appointments List */}
              <Card className="bg-card border border-border  rounded-2xl">
                <CardHeader>
                  <CardTitle className="text-white">All Appointments</CardTitle>
                  <CardDescription className="text-muted-foreground">
                    Manage your patient appointments
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {loading ? (
                    <div className="text-center py-12 text-muted-foreground">
                      Loading appointments...
                    </div>
                  ) : appointments.length > 0 ? (
                    <div className="space-y-6">
                      {appointments.map((appointment) => (
                        <div
                          key={appointment._id}
                          className="bg-card border border-border rounded-2xl p-6 space-y-6"
                        >
                          <div className="flex items-start justify-between">
                            <div className="space-y-3">
                              <div className="flex items-center space-x-3">
                                <User className="h-5 w-5 text-muted-foreground" />
                                <span className="font-medium text-white">
                                  {appointment.patient?.name ||
                                    "Patient not available"}
                                </span>
                                <Badge
                                  className={`${getAppointmentStatusColor(
                                    appointment.status
                                  )} border`}
                                >
                                  {appointment.status}
                                </Badge>
                              </div>
                              <div className="flex items-center space-x-4 text-md text-muted-foreground">
                                <div className="flex items-center">
                                  <Calendar className="h-5 w-5 mr-2 text-green-400" />
                                  <span>
                                    {new Date(
                                      appointment.appointmentDate
                                    ).toLocaleDateString()}
                                  </span>
                                </div>
                                <div className="flex items-center">
                                  <Clock className="h-5 w-5 mr-2 text-green-400" />
                                  <span>
                                    {new Date(
                                      appointment.appointmentDate
                                    ).toLocaleTimeString("en-US", {
                                      hour: "2-digit",
                                      minute: "2-digit",
                                    })}
                                  </span>
                                </div>
                              </div>
                              {appointment.reason && (
                                <p className="text-md text-zinc-300">
                                  <span className="font-medium">Reason: </span>
                                  {appointment.reason}
                                </p>
                              )}
                            </div>
                          </div>
                          <div className="flex flex-col md:flex-row items-start md:items-center gap-4">
                            <Select
                              value={appointment.status}
                              onValueChange={(value) =>
                                handleStatusUpdate(
                                  appointment._id,
                                  value,
                                  appointment.notes
                                )
                              }
                              disabled={updatingAppointment === appointment._id}
                            >
                              <SelectTrigger className="w-full md:w-48 bg-muted border-border text-white hover:bg-muted">
                                <SelectValue className="text-white" />
                              </SelectTrigger>
                              <SelectContent className="bg-card border-border text-white">
                                {appointment.status === "pending" && (
                                  <SelectItem value="pending" disabled>
                                    Pending
                                  </SelectItem>
                                )}
                                <SelectItem
                                  value="confirmed"
                                  className="hover:bg-muted focus:bg-muted"
                                >
                                  Confirmed
                                </SelectItem>
                                <SelectItem
                                  value="completed"
                                  className="hover:bg-muted focus:bg-muted"
                                >
                                  Completed
                                </SelectItem>
                                <SelectItem
                                  value="cancelled"
                                  className="hover:bg-muted focus:bg-muted"
                                >
                                  Cancelled
                                </SelectItem>
                              </SelectContent>
                            </Select>
                            {appointment.status === "confirmed" && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleOpenChat(appointment)}
                                className="bg-muted hover:bg-muted text-white border-border hover:border-green-500 h-10 px-4"
                              >
                                <MessageCircle className="h-5 w-5 mr-2" />
                                Chat
                              </Button>
                            )}
                            <div className="flex-1 w-full">
                              <Textarea
                                placeholder="Add notes for this appointment..."
                                value={appointment.notes || ""}
                                onChange={(e) => {
                                  setAppointments((prev) =>
                                    prev.map((apt) =>
                                      apt._id === appointment._id
                                        ? { ...apt, notes: e.target.value }
                                        : apt
                                    )
                                  );
                                }}
                                onBlur={(e) => {
                                  if (
                                    e.target.value !== appointment.originalNotes
                                  ) {
                                    handleStatusUpdate(
                                      appointment._id,
                                      appointment.status,
                                      e.target.value
                                    );
                                  }
                                }}
                                rows={3}
                                className="bg-muted/80 border-border text-white focus:border-green-500/50 focus:ring-green-500/20 placeholder-zinc-500 text-md h-24"
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-12">
                      <Calendar className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
                      <h3 className="text-xl font-semibold text-muted-foreground mb-2">
                        No Appointments Yet
                      </h3>
                      <p className="text-muted-foreground">
                        Patients will be able to book appointments with you once
                        your profile is approved.
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="profile" className="space-y-8">
              <Card className="bg-card border border-border  rounded-2xl">
                <CardHeader>
                  <CardTitle className="text-white flex items-center space-x-3">
                    <User className="h-6 w-6 text-green-400" />
                    <span>Profile Information</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="text-md font-medium text-muted-foreground">
                        Specialization
                      </label>
                      <p className="text-xl text-white mt-1">
                        {doctor.specialization}
                      </p>
                    </div>
                    <div>
                      <label className="text-md font-medium text-muted-foreground">
                        Category
                      </label>
                      <p className="text-xl text-white mt-1">
                        {doctor.category}
                      </p>
                    </div>
                    <div>
                      <label className="text-md font-medium text-muted-foreground">
                        Experience
                      </label>
                      <p className="text-xl text-white mt-1">
                        {doctor.experience} years
                      </p>
                    </div>
                    <div>
                      <label className="text-md font-medium text-muted-foreground">
                        Consultation Fee
                      </label>
                      <p className="text-xl text-white mt-1 flex items-center">
                        ₹{doctor.consultationFee}
                      </p>
                    </div>
                  </div>
                  <div>
                    <label className="text-md font-medium text-muted-foreground">
                      Qualifications
                    </label>
                    <div className="flex flex-wrap gap-2 mt-3">
                      {doctor.qualifications?.map((qual, index) => (
                        <Badge
                          key={index}
                          className="bg-muted text-white border-border text-md"
                        >
                          {qual}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="text-md font-medium text-muted-foreground">
                      Availability
                    </label>
                    <div className="mt-3 space-y-4">
                      {doctor.availability?.map((avail, index) => (
                        <div key={index} className="flex items-start space-x-4">
                          <Calendar className="h-6 w-6 text-green-400 mt-1" />
                          <div>
                            <span className="font-medium text-white text-lg">
                              {avail.day}:
                            </span>
                            <div className="flex flex-wrap gap-2 mt-2">
                              {avail.slots?.map((slot, slotIndex) => (
                                <Badge
                                  key={slotIndex}
                                  className="bg-muted text-white border-border text-sm"
                                >
                                  {slot}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        ) : (
          <Card className="bg-card border border-border  rounded-2xl">
            <CardContent className="text-center py-12">
              <div className="mx-auto p-4 bg-yellow-500/10 rounded-full w-fit border border-yellow-400/20 mb-4">
                <AlertCircle className="h-12 w-12 text-yellow-400" />
              </div>
              <h3 className="text-2xl font-semibold text-white mb-3">
                Profile Under Review
              </h3>
              <p className="text-zinc-300 text-lg mb-6">
                Thank you for submitting your profile. Our team is reviewing
                your application and will notify you once it's approved.
              </p>
              <Button
                variant="outline"
                className="bg-muted hover:bg-muted text-white border-border hover:border-green-500 px-8 py-3 text-md"
              >
                Contact Support
              </Button>
            </CardContent>
          </Card>
        )}

        {selectedAppointmentForChat && (
          <ChatModal
            appointment={selectedAppointmentForChat}
            isOpen={isChatModalOpen}
            onClose={() => {
              setIsChatModalOpen(false);
              setSelectedAppointmentForChat(null);
            }}
          />
        )}
      </div>
    </div>
  );
}