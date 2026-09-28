# CareQuest demo runbook

CareQuest extends ArkCare with a clinician-approved care-continuity workflow.

## Safety model

- AI may draft educational wording, but cannot publish or activate a plan.
- A doctor must explicitly approve each patient-facing plan version.
- `done`, `not_done`, and `need_help` are patient self-reports unless another
  authorized source verifies the underlying action.
- Capsules represent participation, not health, adherence, or quality.
- Clinical workflows never depend on blockchain availability.
- Hospital admin views are aggregate; nurse/coordinator and the owning doctor
  handle identifiable handoff cases.
- Demo financial values are marked SIMULATED and do not alter billing.

## Demo roles

With `DEMO_LOGIN_ENABLED=true`, the landing page exposes synthetic demo logins:

- Patient
- Doctor
- Nurse
- Hospital Admin

The demo auth action also seeds a coordinator membership for workflow testing.

## End-to-end flow

1. Patient books a consultation and may process a synthetic PDF report.
2. Doctor completes the consultation.
3. Doctor opens `/doctor/care-plans`, creates or AI-drafts a plan, then approves it.
4. Plan approval creates version-bound mission occurrences.
5. Patient opens `/patient/carequest`.
6. Patient completes the lesson comprehension check and earns 2 CAP.
7. Use the synthetic demo clock to make the next reminder due.
8. Patient chooses Done, Not Done, or Need Help. Each substantive scheduled
   response receives the same 1 CAP participation credit; Snooze receives none.
9. Need Help creates one deduplicated handoff.
10. Nurse opens `/staff`, owns the case, documents contact, and may escalate.
11. Doctor opens `/doctor/escalations`. Clinical questions remain doctor-owned.
12. A revised plan changes future occurrences while old versions/events remain.
13. A real ArkCare follow-up booking/completion grants follow-up Capsules once.
14. Hospital Admin opens `/admin/carequest` for aggregate service metrics and
    explicitly simulated pilot economics.
15. Hospital Admin opens `/admin/carequest/audit` for the append-only provenance
    trail and its MST testnet anchor.

## Doctor consultation report → care plan (AI-assisted)

A second path turns a post-visit report into an automatically generated care
plan, quiz and gamification. It is reachable from the doctor's chat/report
dialog (the `Report` button appears for doctors in the appointment chat) or
programmatically via `actions/reportActions.js`.

How it works:

1. **Doctor files a report** — type consultation remarks, patient-activity
   advice, and a prescription. A prescription may also be attached as a photo
   (stored in Cloudinary via `/api/carequest/upload-report-image`).
2. **"Parse with AI"** — the FastAPI backend OCRs any attached image
   (`POST /ocr_prescription`, tesseract), then Groq structures remarks +
   prescription into a reviewed JSON payload: conditions, medications (each with
   the source `verbatim` line), activities, follow-up window and keywords. The
   AI is instructed to never invent a medication/dose and to flag low OCR
   confidence. Nothing is saved until the doctor submits.
3. **"Submit report"** — the doctor publishes. The server re-parses from the
   submitted raw text (never trusting a client payload), then:
   - computes a `contentHash` (sha256 of the clinician-authored content only),
   - **anchors that hash on-chain** through the existing bridge `/anchor`
     (`batchId = report:<id>:r<revision>`, `merkleRoot = 0x<hash>`) so a filed
     prescription/remark cannot be later denied,
   - appends `report.recorded` + `report.anchored` audit events,
   - auto-publishes an **approved** care-plan version built from the parsed
     report (lesson, daily medication check-in, doctor-advised activities,
     follow-up, and a knowledge check) and generates the missions,
   - builds a **4-question RAG quiz** by scoring all 149 questions in
     `carequest_quiz_bank.json` against the report (conditions/remarks/meds) and
     returning the top 4 across several categories.
4. **Patient takes the quiz** on `/patient/carequest` — the 4 questions render;
   correct answers never leave the server. Submitting grades server-side and
   awards `1 + correct` CAP (`quiz_completed`), marks the quiz mission complete,
   appends `quiz.completed`, and syncs the capsule ledger to the chain.
5. **The animated capsule gauge** in the top-right of the CareQuest shell fills
   slowly toward 2000 as the patient completes quizzes, missions and activity
   goals.

Reports are **append-only**: a correction is a new revision (a new anchored
hash); a filed revision is never edited or deleted.

Safety boundaries preserved: the AI only structures what the clinician wrote and
marks uncertainty; only a doctor publishes; the blockchain is a non-clinical
proof rail (everything still works if it is offline); CAP remains a
non-transferable, non-cash participation token.

## Scheduler

The app works locally without an external scheduler by keeping all mission
occurrences in MongoDB and exposing the synthetic demo clock.

For durable deployment scheduling, configure:

```env
CAREQUEST_JOB_SECRET=<random server secret>
QSTASH_TOKEN=<optional QStash token>
NEXT_PUBLIC_APP_URL=https://your-arkcare-host
```

The sweep endpoint is:

```
POST /api/carequest/jobs/sweep
X-CareQuest-Job-Secret: <CAREQUEST_JOB_SECRET>
```

The scheduler never silently changes a clinician-approved time to avoid quiet
hours. CareQuest currently implements in-app reminders only.

## Blockchain on the MST public testnet

No MetaMask or wallet connection is required. One wallet holds a key in
`arkcare.env` and the local bridge signs with it.

On Windows from the repository root:

```bat
scripts\start-mst-bridge.cmd
```

On Linux / macOS:

```bash
cd Blockchain && npm install && npm run bridge
```

The bridge is then reachable at `http://127.0.0.1:8546`, which is what the
frontend posts to:

```env
CAREQUEST_BLOCKCHAIN_ENABLED=true
CAREQUEST_BLOCKCHAIN_BRIDGE_URL=http://127.0.0.1:8546
```

The deployed contracts are:

- `CareQuestCapsule.sol`: zero-decimal, non-transferable CAP token.
- `CareQuestHospitalCapsules.sol`: one Capsule token ID per hospital program.
- `CareQuestAuditAnchor.sol`: separate Merkle-root audit anchor.

Each transaction is viewable on <https://testnet.mstscan.com>; the hospital
admin's **Audit & integrity** page links every anchor batch directly. ArkCare's
MongoDB `CapsuleAward` ledger remains authoritative, and no PHI ever reaches the
chain. See `Blockchain/README.md`.

## Failure demonstrations

The synthetic patient screen supports:

- accelerated due time;
- notification failure while keeping the mission visible;
- duplicate patient actions (idempotent server records);
- opt-out/pause;
- honest non-completion;
- help request;
- blockchain unavailable without clinical workflow failure.

The staff queue supports unsuccessful contact and shift reassignment.

## Data boundaries

Do not intentionally put patient names, patient IDs, diagnosis text, medicine
names, report contents, or health-event descriptions on the blockchain.
