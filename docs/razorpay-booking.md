# Razorpay booking flow

ArkCare's normal appointment flow uses Razorpay Standard Checkout and the Razorpay
Orders/Payments APIs. The `Demo Book — Skip Payment` path is a separate synthetic
test mechanism and must remain disabled outside the explicit demo/E2E environment.

## Runtime flow

1. Patient selects an approved MongoDB doctor, date and live availability slot.
2. ArkCare re-checks the slot on the server.
3. ArkCare creates a 15-minute pending appointment hold.
4. ArkCare creates a Razorpay order on the server using the doctor's current
   consultation fee from MongoDB.
5. The browser opens Razorpay Standard Checkout using the server-returned order id.
6. On success, ArkCare verifies the Checkout HMAC using the server-stored order id.
7. ArkCare fetches the payment and order from Razorpay and verifies:
   - payment belongs to the stored order;
   - amount and currency match the booking;
   - order notes match the authenticated patient, doctor and appointment;
   - payment is captured (or is captured server-side when still authorized);
   - order reaches the paid state.
8. Only after those checks does ArkCare confirm the appointment and create
   `PaymentEvidence`.
9. The patient appointment history shows the provider, amount, payment/order ids
   and refund state.
10. CareQuest booking rewards are projected only after the booking transition is
    successfully committed.

Closing Checkout releases the pending hold. A failed attempt is recorded while the
hold remains retryable until its expiry.

## Webhook recovery

Configure:

```
https://<your-public-app-host>/api/razorpay/webhook
```

Subscribe to:

- `payment.authorized`
- `payment.captured`
- `payment.failed`
- `refund.processed`

Set a separate `RAZORPAY_WEBHOOK_SECRET` in ArkCare and in the Razorpay Dashboard.
The route verifies the raw request-body HMAC before processing an event.

The webhook path allows ArkCare to recover when a patient closes the browser or the
client success callback is interrupted.

## Cancellation/refund

When a doctor cancels a confirmed Razorpay-paid appointment, ArkCare requests the
full refund through Razorpay before committing the appointment cancellation.
Synthetic/demo bookings contain no gateway payment and therefore never fabricate a
refund.

## Required environment

```env
RAZORPAY_KEY_ID=
RAZORPAY_KEY_SECRET=
RAZORPAY_WEBHOOK_SECRET=

# Synthetic E2E only:
CAREQUEST_TEST_BOOKING_BYPASS=false
NEXT_PUBLIC_CAREQUEST_TEST_BOOKING_BYPASS=false
```

Use Test Mode keys during local/judge testing. Test Mode exercises the real Razorpay
integration and mock payment page but does not deduct real money. Switch to Live Mode
keys only when the merchant account is activated and real charges are intended.

Never expose `RAZORPAY_KEY_SECRET` or `RAZORPAY_WEBHOOK_SECRET` to the browser.

## Doctor data boundary

Bookable doctors are resolved exclusively from the live MongoDB `doctors` collection:

- `status = approved`
- consultation fee is greater than zero
- at least one availability entry contains slots

The AI backend performs triage/specialty intent only. It does not supply doctor
identity. The authenticated Next.js chat route resolves clinician cards from MongoDB
at request time. If a recommended doctor id becomes stale or unbookable, booking is
rejected and the user must refresh the live directory; ArkCare does not silently
substitute another clinician.

Synthetic doctor fixtures are allowed only in the demo seed and automated tests.
