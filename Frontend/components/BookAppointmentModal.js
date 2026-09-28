"use client";

import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  CalendarDays,
  CheckCircle2,
  Clock3,
  CreditCard,
  Loader2,
  LockKeyhole,
  ShieldCheck,
  X,
  XCircle,
} from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import {
  checkSlotAvailability,
  getLiveDoctorDayAvailability,
} from "@/actions/availabilityActions";
import { createAppointment } from "@/actions/appointmentActions";
import {
  createPaymentOrder,
  getPaymentConfigurationStatus,
  releasePaymentOrder,
  reportPaymentFailure,
  verifyPayment,
} from "@/actions/paymentActions";
import { useAuth } from "@/hooks/useAuth";

function localDateKey(date) {
  if (!date) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function BookAppointmentModal({
  doctor,
  isOpen,
  onClose,
  onViewAppointments,
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { user } = useAuth();

  const [selectedDate, setSelectedDate] = useState(null);
  const [selectedSlot, setSelectedSlot] = useState("");
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [paymentStep, setPaymentStep] = useState("booking");
  const [error, setError] = useState("");
  const [checkoutReady, setCheckoutReady] = useState(
    typeof window !== "undefined" && Boolean(window.Razorpay)
  );
  const [activeOrderId, setActiveOrderId] = useState(null);
  const [paymentResult, setPaymentResult] = useState(null);
  const [checkoutMode, setCheckoutMode] = useState(null);
  const [liveAvailability, setLiveAvailability] = useState(null);
  const [availabilityLoading, setAvailabilityLoading] = useState(false);
  const [gatewayStatus, setGatewayStatus] = useState(null);

  const testBookingBypass =
    process.env.NEXT_PUBLIC_CAREQUEST_TEST_BOOKING_BYPASS === "true";

  const today = useMemo(() => {
    const value = new Date();
    value.setHours(0, 0, 0, 0);
    return value;
  }, []);

  const reset = useCallback(() => {
    setSelectedDate(null);
    setSelectedSlot("");
    setReason("");
    setLoading(false);
    setPaymentStep("booking");
    setError("");
    setActiveOrderId(null);
    setPaymentResult(null);
    setCheckoutMode(null);
    setLiveAvailability(null);
    setAvailabilityLoading(false);
    setGatewayStatus(null);
  }, []);

  const releaseActiveHold = useCallback(
    async (reasonCode = "checkout_closed") => {
      if (!activeOrderId) return;
      const orderId = activeOrderId;
      setActiveOrderId(null);
      try {
        await releasePaymentOrder(orderId, reasonCode);
      } catch (releaseError) {
        console.error("Could not release booking hold:", releaseError);
      }
    },
    [activeOrderId]
  );

  const handleClose = useCallback(async () => {
    await releaseActiveHold("modal_closed");
    reset();
    onClose();
  }, [onClose, releaseActiveHold, reset]);

  const handleViewAppointment = useCallback(() => {
    if (pathname === "/chatbot") {
      router.push("/patient?tab=my-appointments");
    } else if (onViewAppointments) {
      onViewAppointments();
    } else {
      router.push("/patient?tab=my-appointments");
    }
  }, [pathname, router, onViewAppointments]);

  const isDateAvailable = useCallback(
    (date) => {
      const dayName = date.toLocaleDateString("en-US", { weekday: "long" });
      return (doctor.availability || []).some(
        (entry) => entry.day === dayName && (entry.slots || []).length > 0
      );
    },
    [doctor.availability]
  );

  const isDateDisabled = useCallback(
    (date) => date < today || !isDateAvailable(date),
    [today, isDateAvailable]
  );

  const appointmentDay = useMemo(
    () => localDateKey(selectedDate),
    [selectedDate]
  );

  const slotRows = useMemo(() => {
    if (!selectedDate) return [];

    if (
      liveAvailability?.appointmentDay === appointmentDay &&
      Array.isArray(liveAvailability?.slots)
    ) {
      return liveAvailability.slots;
    }

    const dayName = selectedDate.toLocaleDateString("en-US", {
      weekday: "long",
    });
    return (
      (doctor.availability || []).find((entry) => entry.day === dayName)?.slots ||
      []
    ).map((time) => ({
      time,
      available: true,
      reason: null,
      provisional: true,
    }));
  }, [selectedDate, appointmentDay, liveAvailability, doctor.availability]);

  const selectedSlotRow = useMemo(
    () => slotRows.find((row) => row.time === selectedSlot) || null,
    [slotRows, selectedSlot]
  );

  useEffect(() => {
    if (!isOpen) return;

    let cancelled = false;
    getPaymentConfigurationStatus()
      .then((status) => {
        if (!cancelled) setGatewayStatus(status);
      })
      .catch((statusError) => {
        if (!cancelled) {
          setGatewayStatus({
            configured: false,
            mode: "unconfigured",
            ready: false,
          });
          setError(
            statusError.message || "Secure payment is not configured"
          );
        }
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || window.Razorpay) {
      if (window.Razorpay) setCheckoutReady(true);
      return;
    }

    const existing = document.querySelector(
      'script[src="https://checkout.razorpay.com/v1/checkout.js"]'
    );

    if (existing) {
      const timer = window.setInterval(() => {
        if (window.Razorpay) {
          setCheckoutReady(true);
          window.clearInterval(timer);
        }
      }, 100);
      return () => window.clearInterval(timer);
    }

    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onload = () => setCheckoutReady(true);
    script.onerror = () => {
      setCheckoutReady(false);
      setError("Secure checkout could not load. Check your connection and try again.");
    };
    document.head.appendChild(script);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) reset();
  }, [isOpen, reset]);

  useEffect(() => {
    if (!isOpen || !selectedDate || !appointmentDay) {
      setLiveAvailability(null);
      return;
    }

    let cancelled = false;
    setAvailabilityLoading(true);

    getLiveDoctorDayAvailability(doctor._id, appointmentDay)
      .then((result) => {
        if (cancelled) return;
        setLiveAvailability(result);
        setSelectedSlot((current) => {
          if (!current) return current;
          return result?.slots?.some(
            (row) => row.time === current && row.available
          )
            ? current
            : "";
        });
        if (result?.error) setError(result.error);
      })
      .catch((availabilityError) => {
        if (!cancelled) {
          setError(
            availabilityError.message || "Could not refresh live availability"
          );
        }
      })
      .finally(() => {
        if (!cancelled) setAvailabilityLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, selectedDate, appointmentDay, doctor._id]);



  const validateSelectedSlot = useCallback(async () => {
    if (!appointmentDay || !selectedSlot) {
      throw new Error("Select a date and time before continuing");
    }

    const result = await checkSlotAvailability({
      doctorId: doctor._id,
      appointmentDay,
      appointmentTime: selectedSlot,
    });

    if (!result.available) {
      throw new Error(result.error || "That slot is no longer available");
    }

    return result;
  }, [appointmentDay, selectedSlot, doctor._id]);

  const handlePayment = useCallback(async () => {
    if (!appointmentDay || !selectedSlot) {
      setError("Select a date and time before continuing.");
      return;
    }

    if (!checkoutReady || !window.Razorpay) {
      setError("Secure Razorpay checkout is still loading. Try again in a moment.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      await validateSelectedSlot();

      const orderData = await createPaymentOrder({
        doctorId: doctor._id,
        appointmentDay,
        appointmentTime: selectedSlot,
        reason,
      });

      setActiveOrderId(orderData.orderId);
      setCheckoutMode(orderData.checkoutMode || null);

      const options = {
        key: orderData.keyId,
        amount: orderData.amount,
        currency: orderData.currency,
        name: "ArkCare",
        description: `Consultation with ${doctor.name}`,
        order_id: orderData.orderId,
        prefill: {
          name: user?.name || user?.fullName || undefined,
          email:
            user?.email ||
            user?.primaryEmailAddress?.emailAddress ||
            undefined,
        },
        notes: {
          appointment: orderData.appointmentId,
        },
        theme: {
          color: "#55786b",
        },
        modal: {
          confirm_close: true,
          escape: true,
          ondismiss: async () => {
            await releasePaymentOrder(orderData.orderId, "checkout_dismissed").catch(
              () => null
            );
            setActiveOrderId(null);
            setLoading(false);
          },
        },
        handler: async (response) => {
          try {
            setPaymentStep("confirming");
            const result = await verifyPayment({
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
            });

            if (!result?.success) {
              throw new Error("Payment could not be confirmed");
            }

            setActiveOrderId(null);
            setPaymentResult(result);
            setPaymentStep("success");
            setError("");
          } catch (verificationError) {
            console.error("Payment verification error:", verificationError);
            setError(
              verificationError.message ||
                "Payment was received but confirmation is still pending. Check My Appointments before retrying."
            );
            setPaymentStep("booking");
          } finally {
            setLoading(false);
          }
        },
      };

      const checkout = new window.Razorpay(options);

      checkout.on("payment.failed", (response) => {
        const description =
          response?.error?.description ||
          "That payment attempt failed. Your slot is still held while Checkout remains open; you can retry or close Checkout to release it.";

        void reportPaymentFailure({
          orderId: orderData.orderId,
          paymentId: response?.error?.metadata?.payment_id || null,
          reason: description,
        }).catch((failureError) => {
          console.error("Could not persist Razorpay failure state:", failureError);
        });

        setPaymentStep("booking");
        setLoading(false);
        setError(description);
      });

      checkout.open();
    } catch (paymentError) {
      console.error("Payment initiation failed:", paymentError);
      setError(paymentError.message || "Could not start secure checkout");
      setLoading(false);
      setPaymentStep("booking");
    }
  }, [
    appointmentDay,
    selectedSlot,
    checkoutReady,
    doctor._id,
    doctor.name,
    reason,
    user,
    validateSelectedSlot,
  ]);

  const handleTestBooking = useCallback(async () => {
    if (!testBookingBypass || !appointmentDay || !selectedSlot) return;
    setLoading(true);
    setError("");
    try {
      const availability = await validateSelectedSlot();
      const result = await createAppointment({
        doctorId: doctor._id,
        appointmentDate: availability.appointmentDate,
        reason,
        demoBooking: true,
      });
      setPaymentResult(result);
      setCheckoutMode("demo");
      setPaymentStep("success");
    } catch (bookingError) {
      setError(bookingError.message || "Could not create test booking");
    } finally {
      setLoading(false);
    }
  }, [
    testBookingBypass,
    appointmentDay,
    selectedSlot,
    validateSelectedSlot,
    doctor._id,
    reason,
  ]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Dismiss booking backdrop"
        onClick={handleClose}
        className="absolute inset-0 bg-slate-900/25 backdrop-blur-[1px]"
      />

      <section className="relative z-10 max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-border bg-[#fbfcfa] shadow-2xl">
        <header className="relative border-b border-border bg-white p-5 pr-14 md:p-6 md:pr-16">
          <button
            type="button"
            aria-label="Close booking"
            onClick={handleClose}
            className="absolute right-4 top-4 grid h-9 w-9 place-items-center rounded-lg border border-border bg-white text-muted-foreground transition hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
            <div>
              <div className="flex flex-wrap gap-2">
                <span className="cq-pixel-label cq-real-label">
                  <ShieldCheck className="h-3 w-3" />
                  REAL BOOKING FLOW
                </span>
                <span className="cq-pixel-label">
                  <LockKeyhole className="h-3 w-3" />
                  RAZORPAY
                </span>
              </div>
              <h2 className="mt-3 text-2xl font-black tracking-tight text-foreground">
                Book Appointment
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {doctor.name} · {doctor.specialization}
              </p>
            </div>
            <div className="rounded-xl border border-border bg-[#f4f7f4] px-4 py-3 text-right">
              <div className="text-xs font-semibold text-muted-foreground">
                Consultation fee
              </div>
              <div className="mt-1 text-xl font-black text-foreground">
                ₹{Number(doctor.consultationFee || 0).toLocaleString("en-IN")}
              </div>
            </div>
          </div>
        </header>

        {paymentStep === "success" ? (
          <div className="p-8 text-center">
            <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-primary-soft">
              <CheckCircle2 className="h-8 w-8 text-primary" />
            </div>
            <h3 className="mt-5 text-2xl font-black text-foreground">
              Appointment Booked!
            </h3>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">
              {paymentResult?.demoBooking
                ? `Synthetic demo booking confirmed with ${doctor.name}. No payment was charged.`
                : `Razorpay payment was verified on the server and your appointment with ${doctor.name} is confirmed.`}
            </p>

            {paymentResult && !paymentResult.demoBooking ? (
              <div className="mx-auto mt-5 max-w-md rounded-xl border border-border bg-white p-4 text-left text-xs">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-bold text-foreground">Payment verified</span>
                  <span className="cq-pixel-label cq-real-label">
                    {checkoutMode === "live" ? "RAZORPAY LIVE" : "RAZORPAY TEST"}
                  </span>
                </div>
                <div className="mt-3 grid gap-2 text-muted-foreground">
                  <div>
                    Amount:{" "}
                    <strong className="text-foreground">
                      ₹{Number(paymentResult.amount || doctor.consultationFee || 0).toLocaleString("en-IN")}
                    </strong>
                  </div>
                  {paymentResult.paymentId ? (
                    <div className="break-all font-mono">
                      Payment {paymentResult.paymentId}
                    </div>
                  ) : null}
                  {paymentResult.orderId ? (
                    <div className="break-all font-mono">
                      Order {paymentResult.orderId}
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}

            <button
              type="button"
              onClick={handleViewAppointment}
              className="mt-6 w-full rounded-xl bg-primary px-4 py-3 font-bold text-primary-foreground"
            >
              View My Appointments
            </button>
          </div>
        ) : paymentStep === "confirming" ? (
          <div className="p-10 text-center">
            <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
            <h3 className="mt-4 text-lg font-black">Confirming payment</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              ArkCare is verifying the gateway signature, captured amount and booking
              order before confirming the appointment.
            </p>
          </div>
        ) : (
          <div className="space-y-6 p-5 md:p-6">
            {error ? (
              <div className="flex items-start gap-3 rounded-xl border border-[#ead4d0] bg-[#fbefed] p-4 text-sm text-[#8a4a40]">
                <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            ) : null}

            <div>
              <label className="mb-3 flex items-center gap-2 text-sm font-bold text-foreground">
                <CalendarDays className="h-4 w-4 text-primary" />
                Choose a date
              </label>
              <div className="rounded-xl border border-border bg-white p-3">
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={(date) => {
                    setSelectedDate(date);
                    setSelectedSlot("");
                    setError("");
                  }}
                  disabled={isDateDisabled}
                  className="w-full"
                />
              </div>
            </div>

            {selectedDate ? (
              <div>
                <label className="mb-3 flex items-center gap-2 text-sm font-bold text-foreground">
                  <Clock3 className="h-4 w-4 text-primary" />
                  Available times
                </label>
                <div className="mb-2 flex items-center justify-between gap-3 text-xs text-muted-foreground">
                  <span>
                    {availabilityLoading
                      ? "Refreshing live availability..."
                      : liveAvailability?.timezone
                        ? `Live · ${liveAvailability.timezone}`
                        : "Checking live availability"}
                  </span>
                  {liveAvailability?.refreshedAt ? (
                    <span>
                      refreshed{" "}
                      {new Date(liveAvailability.refreshedAt).toLocaleTimeString(
                        "en-IN",
                        { hour: "2-digit", minute: "2-digit" }
                      )}
                    </span>
                  ) : null}
                </div>
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {slotRows.map((row) => (
                    <button
                      key={row.time}
                      type="button"
                      disabled={!row.available || availabilityLoading}
                      onClick={() => {
                        setSelectedSlot(row.time);
                        setError("");
                      }}
                      className={
                        "rounded-lg border px-3 py-2 text-sm font-bold transition " +
                        (selectedSlot === row.time
                          ? "border-primary bg-primary text-primary-foreground"
                          : row.available
                            ? "border-border bg-white text-foreground hover:border-primary/50"
                            : "cursor-not-allowed border-border bg-muted text-muted-foreground line-through opacity-60")
                      }
                    >
                      {row.time}
                      {!row.available && row.reason === "taken" ? (
                        <span className="ml-1 text-[9px] no-underline">taken</span>
                      ) : null}
                    </button>
                  ))}
                </div>
                {!availabilityLoading && selectedDate && !slotRows.length ? (
                  <p className="mt-2 text-xs text-muted-foreground">
                    No bookable slots remain for this date.
                  </p>
                ) : null}
              </div>
            ) : null}

            <div>
              <label
                htmlFor="reason"
                className="mb-2 block text-sm font-bold text-foreground"
              >
                Reason for visit <span className="font-normal text-muted-foreground">(optional)</span>
              </label>
              <textarea
                id="reason"
                value={reason}
                maxLength={1000}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Briefly describe what you want to discuss with the doctor."
                rows={3}
                className="w-full rounded-xl border border-border bg-white p-3 text-sm text-foreground outline-none focus:border-primary"
              />
            </div>

            {appointmentDay && selectedSlot ? (
              <div className="rounded-xl border border-[#d6e2db] bg-primary-soft p-4">
                <div className="text-xs font-black uppercase tracking-wide text-primary">
                  Booking summary
                </div>
                <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                  <div>
                    <span className="text-muted-foreground">Date</span>
                    <div className="font-bold">
                      {selectedDate.toLocaleDateString("en-IN", {
                        weekday: "short",
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </div>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Time</span>
                    <div className="font-bold">{selectedSlot}</div>
                  </div>
                </div>
              </div>
            ) : null}

            <div className="rounded-xl border border-border bg-white p-4 text-xs leading-5 text-muted-foreground">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 font-bold text-foreground">
                  <CreditCard className="h-4 w-4 text-primary" />
                  Secure payment
                </div>
                {gatewayStatus ? (
                  <span
                    className={
                      "cq-pixel-label " +
                      (gatewayStatus.ready ? "cq-real-label" : "")
                    }
                  >
                    {gatewayStatus.ready
                      ? `RAZORPAY ${String(
                          gatewayStatus.mode || ""
                        ).toUpperCase()} READY`
                      : "GATEWAY NOT READY"}
                  </span>
                ) : null}
              </div>
              <p className="mt-2">
                ArkCare holds the selected slot while Razorpay Checkout is open.
                The appointment is confirmed only after server-side signature, amount
                and capture verification.
              </p>
              {gatewayStatus?.mode === "live" &&
              !gatewayStatus?.webhookConfigured ? (
                <p className="mt-2 font-semibold text-[#8a4a40]">
                  Live checkout is disabled until the signed Razorpay webhook is configured.
                </p>
              ) : null}
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                onClick={handleClose}
                disabled={loading}
                className="w-full rounded-xl border border-border bg-white px-4 py-3 font-bold text-foreground"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handlePayment}
                disabled={
                  loading ||
                  !appointmentDay ||
                  !selectedSlot ||
                  selectedSlotRow?.available === false ||
                  !checkoutReady ||
                  gatewayStatus?.ready !== true ||
                  Number(doctor.consultationFee || 0) <= 0
                }
                className="inline-flex w-full items-center justify-center rounded-xl bg-primary px-4 py-3 font-bold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <LockKeyhole className="mr-2 h-4 w-4" />
                )}
                {loading
                  ? "Preparing secure checkout..."
                  : `Pay ₹${Number(doctor.consultationFee || 0).toLocaleString(
                      "en-IN"
                    )} & Book`}
              </button>
            </div>

            {testBookingBypass ? (
              <button
                type="button"
                onClick={handleTestBooking}
                disabled={loading || !appointmentDay || !selectedSlot}
                className="w-full rounded-lg border border-dashed border-border px-3 py-2 text-xs font-semibold text-muted-foreground"
              >
                Demo Book — Skip Payment
              </button>
            ) : null}
          </div>
        )}
      </section>
    </div>
  );
}

export default memo(BookAppointmentModal);
