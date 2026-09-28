import crypto from "node:crypto";
import { NextResponse } from "next/server";
import connectDB from "@/lib/db";
import {
  finalizeCapturedBooking,
  getRazorpayClient,
  markPaymentAttemptFailed,
  markRefundFromWebhook,
} from "@/lib/razorpayBooking";

function validSignature(body, signature, secret) {
  const expected = crypto
    .createHmac("sha256", secret)
    .update(body)
    .digest("hex");

  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(String(signature || ""), "utf8");

  return a.length === b.length && a.length > 0 && crypto.timingSafeEqual(a, b);
}

export async function POST(request) {
  const secret = String(process.env.RAZORPAY_WEBHOOK_SECRET || "").trim();
  if (!secret) {
    return NextResponse.json(
      { error: "Razorpay webhook secret is not configured" },
      { status: 503 }
    );
  }

  const rawBody = await request.text();
  const signature = request.headers.get("x-razorpay-signature");

  if (!validSignature(rawBody, signature, secret)) {
    return NextResponse.json({ error: "Invalid webhook signature" }, { status: 401 });
  }

  let event;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  await connectDB();

  try {
    if (
      event.event === "payment.authorized" ||
      event.event === "payment.captured"
    ) {
      const payment = event.payload?.payment?.entity;
      if (payment?.order_id && payment?.id) {
        await finalizeCapturedBooking({
          orderId: payment.order_id,
          paymentId: payment.id,
          allowCapture: event.event === "payment.authorized",
        });
      }
    } else if (event.event === "payment.failed") {
      const payment = event.payload?.payment?.entity;
      if (payment?.order_id) {
        await markPaymentAttemptFailed({
          orderId: payment.order_id,
          paymentId: payment.id || null,
          reason:
            payment?.error_description ||
            payment?.error_reason ||
            "razorpay_payment_failed",
        });
      }
    } else if (event.event === "refund.processed") {
      const refund = event.payload?.refund?.entity;
      if (refund?.payment_id) {
        const payment = await getRazorpayClient().payments.fetch(refund.payment_id);
        if (payment?.order_id) {
          await markRefundFromWebhook({
            orderId: payment.order_id,
            paymentId: refund.payment_id,
            refundAmountPaise:
              Number(payment.amount_refunded || 0) || Number(refund.amount || 0),
            refundStatus: refund.status,
          });
        }
      }
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("Razorpay webhook processing failed:", error);
    return NextResponse.json(
      { error: "Webhook processing failed" },
      { status: 500 }
    );
  }
}
