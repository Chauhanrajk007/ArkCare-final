# CareQuest: Integration and Research Brief

> Drop this file into the existing application repository and give the accompanying editor prompt to your code editor/agent. This is a product and implementation brief, **not** permission to edit files blindly. The agent must inspect the repository, propose a mapping, then implement only the feasible, approved scope.

## 1. Product context and objective

We already have an application with role-based dashboards and features including a medical-document summarizer and doctor video calls. Inspect the repository to identify the actual stack, authentication, database, notifications, real-time transport, dashboards, appointment/video-call flow, and current audit or blockchain implementation. Do not assume these exist beyond what the code confirms. If Next.js and MongoDB are present, build on their existing conventions rather than introducing a parallel stack.

Build **CareQuest**: a connected, opt-in care-continuity experience in which a clinician-approved plan becomes time-based patient missions, useful patient responses become human-owned staff handoffs, and the hospital measures service bottlenecks. Preserve human clinical judgment. The purpose of gamification is to make safe participation and coordination visible and engaging, not to score illness, replace staff, increase prescriptions, or make treatment conditional on points.

Core loop:

1. Doctor consults patient (video or in person), reviews any document summary, and explicitly approves a versioned care plan and schedule.
2. Patient receives consented, accessible, discreet scheduled reminders for plan activities. Patient completes learning, books follow-up, or reports `done`, `not_done`, `snooze`, or `need_help`. Clinical activities marked done are **self-reported** unless a separate authorized source verifies them.
3. `need_help` or a clinically configured exception creates **one** owned, prioritized staff handoff. Nurse/coordinator responds within their permitted scope; doctor approves clinical changes.
4. A plan revision updates future reminders, not the historical record. Patient, clinician, and admin views update from the same authorized event stream.
5. Patient receives **Capsules**, not XP, for safe engagement. Staff receive non-monetary contribution recognition for resolved, documented handoffs. Hospital sees aggregated service milestones, not a fabricated medical-quality score.
6. Important verified actions have an auditable provenance trail; patient identifiers and health content stay off any public blockchain.

## 2. Scope: only three product modules

### A. Patient Care Missions

Implement the smallest clinically supervised pathway the app can support:

- Doctor-authored or AI-drafted care plan; AI draft **cannot publish** before clinician approval. Use explicit plan version, owner, valid-from/to, activity instructions, recurrence/time zone, and safety/help text. Start with one demo pathway and clinician-reviewed sample content; do not autonomously prescribe or modify treatment.
- Mission timeline/calendar: short educational lesson plus comprehension check; follow-up booking through existing appointment flow; clinician-configured medicine reminder and/or clinician-approved activity if the codebase can support it safely. A reminder response is **not proof** of ingestion or exercise.
- Notification preferences, opt-in, locale, time zone, accessibility settings, quiet/criticality policy, snooze, pause/opt-out, and delivery log. No gamified sound for sensitive health reminders by default; optionally play a user-enabled celebration on nonclinical achievement screens. Do not rely on a push notification as the only way to see a due task. Never alter clinical schedules merely to avoid quiet hours: flag conflicting schedules for clinician/patient review.
- Patient may report `done`, `not_done`, `need_help`, or `snooze`. For any concerning response, show appropriate clinician-approved advice or route to staff; never manufacture diagnosis, triage, or emergency assurance. No lost progress for illness, inability, disability, or honest non-completion.
- Link existing document summarizer to a *draft* patient-friendly lesson or question list subject to clinician review. Link existing video-call/appointment to the follow-up mission via actual appointment event, not a fake click.

### B. Staff Handoff Queue

- Create a deduplicated case from `need_help` or a configured event; include source plan/activity, priority as configured by clinicians, assigned role/team, due window, owner, current status, timestamps, and a concise authorized summary.
- Define states such as `open -> assigned -> contacted -> escalated/resolved`, with reassignment on shift change, exception handling, and an immutable event history. Staff must be able to mark unsuccessful contact and document what actually happened.
- Nurse/coordinator handles permitted follow-up and escalates clinical decisions; only an authorized doctor can approve revised clinical instructions. Acknowledging/closing a case must not be possible without an outcome or reason.
- Batch nonurgent alerts, respect existing clinical workflows, show relevant tasks only to authorized roles, and avoid adding a second manual entry process if a hospital system is integrated. No per-click leaderboard, speed race, or penalty for escalation.

### C. Service Improvement Dashboard

- Hospital users see aggregated counts and trends: missions delivered vs. responded to, follow-ups booked/completed, unowned/overdue handoffs, median time to resolution, opt-outs, alert volume, and staff-reported duplicate entry/workload. Use definitions and denominators; label demo data as simulated.
- Small team milestones may celebrate an audited process improvement, but must not claim that Capsule totals prove patient health, clinical accuracy, hospital quality, or public reputation. No public ranking of clinicians, nurses, patients, or hospitals.
- Avoid exposing identifiable patient events in aggregate dashboard views; allow case drill-down only with separately authorized role-based access and audit.

**Not in initial scope:** stock/QR inventory, 3D hospital, equipment quests, insurer data sales, automated triage, a broad AI Ops Radar, public token marketplace, real-money rewards, public reputation scoring, or claims of improved clinical outcomes. Add later only after a demonstrated workflow need and owner.

## 3. Capsule mechanics: what is actually gamified

Call the patient-visible unit a **Capsule**. It is a non-transferable, non-cash, nonclinical in-app participation point. Use a friendly capsule-shaped icon/progress vessel and a chapter map; avoid an arcade interface over symptoms or medicine. Define specific, capped rules in configurable data rather than burying values in UI code. Suggested *demo-only* rules, adjustable with clinical and product review:

| Event | Example Capsules | Evidence | Safety rule |
| --- | ---: | --- | --- |
| Clinician-approved lesson plus short check completed | 2 | App-confirmed interaction | Rewards learning, not claimed medical expertise. |
| Respond to one scheduled reminder | 1 | App-confirmed response; underlying action self-reported | `done`, `not_done`, and `need_help` get equal participation credit; max once per scheduled occurrence. Snooze alone does not award. |
| Book planned follow-up | 2 | Appointment-system confirmation | No points for unnecessary or duplicate bookings. |
| Attend scheduled follow-up | 2 | Authorized appointment status | No points if attendance cannot be confirmed. |

The Capsule balance must never rise for more doses, more exercise than prescribed, more referrals, more tests, or a clinician clicking approvals. No patient penalty for missing care, disability, hospitalization, not having a phone, or choosing not to participate. Let patient pause or opt out without losing access to care. Optionally award chapter visuals or an extra reviewed educational item on reaching a threshold; **do not promise vouchers, treatment discounts, insured benefits, tokens, or cash**. If a future sponsor wants material rewards, require separate ethics, legal, accessibility, budget, and fraud review.

Staff recognition is distinct from patient Capsules: use private contribution acknowledgments and shared team milestones after a documented, reviewed handoff. No redeemable doctor/nurse points for care decisions, referrals, prescriptions, task volume, or speed. Hospital milestones come from measured service workflows, not sums of employee or patient points.

Capsule issuance needs a server-side rule engine, immutable award ledger, idempotency key (e.g. `user_id + occurrence_id + rule_version`), reversal/correction event rather than silent mutation, abuse caps, and role-authorized source verification. Do not issue on client clicks alone. Keep the verification level (`self_report`, `system_confirmed`, `staff_documented`, `clinician_approved`) separate from Capsule balance.

## 4. Real-life demo script

Use synthetic data, two browsers or multiple role logins, and an accelerated demo clock. Never accelerate real patient medication notifications or reuse the demo scheduler in production.

1. Doctor completes a synthetic consultation, reviews AI-drafted lesson from the existing summarizer, edits it, then approves plan version 1 containing a learning mission, a timed reminder, and a follow-up. Show an approval audit event.
2. Patient view shows the approved plan and upcoming schedule. Simulated reminder appears on in-app timeline (and a push/email only if a real delivery channel is integrated). Patient finishes lesson and gains 2 Capsules.
3. At the scheduled occurrence, patient taps `need_help` and gains 1 participation Capsule. UI says `patient reported a problem`; it does **not** claim the medicine was taken. Deduplicate repeats.
4. Assigned nurse sees one new case in their queue and the patient has an `awaiting response` state. Nurse records contact and escalates a clinical question; doctor approves version 2. Future reminders reflect version 2; original events remain auditable.
5. Patient books existing video follow-up; appointment confirmation grants Capsules once. Hospital aggregate panel updates open cases, resolved handoffs, and bookings in near real time. Display source/event timestamps and any delayed sync explicitly.
6. Demonstrate rejected AI draft, duplicate button press, staff shift reassignment, notification failure, and opt-out. Show the system failing safely, not awarding fake Capsules or losing work.

## 5. Architecture: inspect first, map second

Expected conceptual components (adapt names and technologies to the actual repository):

- Existing authenticated users/roles and patient-to-care-team authorization. Reuse existing consent and appointment/video-call records.
- `CarePlan` and `PlanVersion`; `MissionTemplate`; `ScheduledOccurrence`; `ReminderDelivery`; `PatientResponse`; `HandoffCase`; `CaseEvent`; `CapsuleAward`; `AuditEvent`; `UserPreference`. A hospital-integrated implementation can map plan and workflow concepts to FHIR CarePlan and Task as appropriate, but do not claim FHIR interoperability unless implemented and tested.
- A durable scheduler/queue for due reminders, time-zone-aware recurrence, retry/backoff and dead-letter handling. A web request or open browser tab must not be the scheduler. Deliver through existing channels if available; otherwise implement in-app notifications and explicitly label external push as future work.
- Backend-only authoritative mutations with role checks, validation, idempotent event processing, transactions or outbox for state + event consistency, rate limits, and append-only audit records. Publish approved, minimal updates to relevant subscribed dashboards using the app's existing real-time mechanism (WebSocket/SSE/polling) and role-authorized room/topic routing. Show reconnection and eventual consistency honestly.
- AI is limited to drafting approved content or suggesting which *configured* handoff rule matched. No autonomous diagnosis, dosing advice, or plan activation.
- Persist clinical data in the existing access-controlled datastore with encryption and retention/erasure processes. Do not put names, patient IDs, clinical text, hashes of low-entropy health data, or identifiers that can be linked back to a patient on a public chain. If using blockchain, design a threat-reviewed minimal anchoring strategy for batched commitments with opaque/randomized references; use a separately stored private mapping and verifier, and explain limitations. A local SHA-256 linked list is a demo integrity check, **not** a distributed blockchain or proof that a real-world action happened.

Example event pipeline:

`doctor_approves_plan -> persist version -> enqueue occurrences -> patient response -> rules engine issues Capsule (idempotent) -> need_help creates one case -> authorized staff resolution -> dashboard projection -> selected verified audit commitment`.

Plan changes cancel/recompute *future* unsent occurrences and preserve past schedule history. Keep patient response, case status, Capsule award, and dashboard projections consistent with transaction/outbox or equivalent pattern. All real-time clients must tolerate duplicated/out-of-order events.

## 6. Safety, privacy, and governance gates

- Obtain hospital clinical owner approval for content, escalation rules, response windows, emergency disclaimers, and responsibilities before any real-patient deployment. Never suggest a patient wait for a gamified queue during an emergency.
- Review relevant jurisdictional privacy, medical-device/software, telemedicine, marketing/reward, professional ethics, and consent obligations with qualified advisers. Avoid assuming a global rule is satisfied by code alone.
- Accessibility: low-bandwidth fallback, readable contrast, screen-reader labels, optional audio/language support where feasible, caregiver access only through verified consent/authorization, and an offline-equivalent workflow for patients without smartphones. Display no adverse ranking due to inability to use the app.
- Notification privacy: default messages should not reveal a diagnosis/medicine on a locked screen unless a patient explicitly opts in. Respect scheduling and clinical instructions; no silent schedule shift.
- Staff well-being: choose manageable alert thresholds, review alert burden, prevent per-worker speed scoring, and keep a route for manual escalation even if AI is unavailable.
- Operational honesty: permissioned audit trails and hash anchors prove record provenance/integrity only within their trust model. They cannot prove a self-reported health action occurred. Any correction must preserve an audit trail, while respecting privacy rights and lawful retention.

## 7. What the editor agent must research and report before implementation

Research and inspect rather than guessing. Use current official documentation for the project's actual stack and target jurisdiction; if web access is unavailable, mark external validation as pending. Produce a short evidence/decision table with source links or local file references:

1. What do existing routes, screens, models, auth roles, schedulers, notification providers, video appointments, summarizer, analytics, and real-time systems actually support? Include repository paths.
2. Is there already a care-plan or task model? Is there an EHR/HIS integration? Which data are authoritative, which are simulated?
3. What medical-safety review is needed for timed medicine/activity instructions and escalation? Who owns each exception? What actions must remain with clinicians?
4. What privacy, consent, retention, notification, and software-regulatory requirements apply to the target deployment locations? Identify questions for counsel/hospital staff, not unsupported legal assertions.
5. Which parts of the concept should be cut, improved, or postponed based on actual infrastructure and clinical workflow? Propose a narrower pilot if needed and explain why.
6. What verified event or business value, if any, merits blockchain anchoring versus conventional signed/append-only logging? Explicitly distinguish a real chain transaction from local hash chaining.
7. What existing data or partner access is required to measure follow-up completion, staff time, alert fatigue, and patient comprehension honestly?

Return a proposed file-by-file change plan and a 1-page event/role/data-flow diagram **before editing**. If no hospital stakeholder exists, use synthetic fixtures, mock roles, and a clearly labeled demonstration rather than claiming clinical validation.

## 8. Acceptance and pilot tests

**Automated behavior tests:**

- An unapproved AI draft never creates patient-facing missions or sends reminders.
- Correct due time across time zones and daylight-saving changes, retry after delivery failure, no duplicate delivery/award/case on repeated jobs or taps, and cancellation/recalculation after plan version change.
- `not_done` and `need_help` earn equal scheduled-response Capsules to `done`; snooze alone earns none; no extra reward from rapid repeated taps.
- Staff cannot edit a doctor's clinical plan; patients cannot view other patients; administrators cannot access identifiable case details solely because they see aggregate dashboards.
- Clinician rejects draft; event is logged; no mission is published. Plan revision keeps history and alters only future occurrences.
- A staff shift changes owner safely; a case cannot close without documented outcome/reason. Alert batching does not suppress required clinical escalation.
- Dashboard reconnection and duplicate/out-of-order events converge to server state. Audit checks detect unauthorized mutation but do not label self-reports as clinically verified.
- Opt-out stops gamified notifications/rewards and does not block ordinary access to care or required non-gamified communications.

**Human pilot, not just a code test:** One hospital service, one clinician-approved pathway, voluntary patients, baseline and intervention periods. Predefine success measures with hospital staff: plan comprehension, follow-up booking/completion, handoff resolution time, duplicate entry minutes, alert volume/override burden, accessibility/opt-outs, and safety incidents. Record denominators and missing data. Avoid claiming improved health outcomes, hospital reputation, or revenue until measured. Stop/revise if workload, inequity, or safety worsens.

## 9. Delivery order

1. Repository analysis and stakeholder/clinical safety questions.
2. Doctor-approved versioned care plan + patient timeline, one lesson, one follow-up booking integration.
3. Reliable scheduling and in-app reminders with delivery logs, preferences, opt-out, and truthful self-report labels.
4. Single deduplicated nurse/coordinator handoff queue with doctor escalation and plan revision.
5. Capsule rule engine, private patient progress visuals, and aggregate team milestones.
6. Hospital operational metrics and real-time projections.
7. Audit/provenance hardening and, only if justified, actual minimal blockchain anchoring.
8. End-to-end synthetic demo, adversarial tests, and a scoped real-world pilot plan.

## 10. Commercial pitch without overclaiming

Sell the product as **care-continuity workflow plus patient engagement**, not a blockchain game. Potential hospital value is less fragmented follow-up and measurable service bottlenecks; patient value is accessible, timely support; doctor value is an exceptions view and approved plan distribution; nurse value is an owned, prioritized queue. These are testable hypotheses, not guaranteed clinical, workload, or revenue outcomes. Any subscription, setup fee, or outcome-based pricing must be grounded in a pilot and procurement/legal review.

One-sentence pitch: **CareQuest converts clinician-approved care plans into timed, accessible patient missions; routes honest requests for help to human care teams; and makes service handoffs measurable and auditable—without scoring illness or replacing clinical judgment.**
