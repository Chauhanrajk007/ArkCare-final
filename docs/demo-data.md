# ArkCare synthetic demo dataset

The repository includes an idempotent seed for the hackathon/demo environment.

## Seed the demo

From the repository root on Linux:

```bash
bash scripts/seed-demo-data.sh
```

Or:

```bash
cd Frontend
npm run seed:demo
```

The command reads the existing local ArkCare environment and requires `MONGODB_URI`.
It does not print database credentials.

## What is seeded

The seed creates or refreshes only synthetic demo identities and showcase records:

- Demo Patient
- 13 approved synthetic doctors across multiple specialties
- Dr. Aisha Rahman remains the one-click clinician demo identity
- Nurse Meera Singh
- Care Coordinator Arjun
- Hospital Admin
- ArkCare City Hospital / CareQuest City / CITY Capsules
- Lotus Heart Institute / Lotus Path / LOTUS Capsules
- patient memberships and staff memberships
- reward budgets and benefit catalog entries
- synthetic patient demographics and medical-record JSON
- five synthetic report summaries matching the downloadable test PDF pack
- bookable multi-specialty doctor directory with deterministic availability and fees
- one completed consultation
- one confirmed planned follow-up
- one active clinician-approved CareQuest plan
- completed education mission
- Need Help response with one open staff handoff
- one due simulated activity mission
- one scheduled follow-up mission
- five seeded CITY Capsules from legitimate participation events
- Capsule balance projections and daily cap state
- demo-only payment evidence with INR 0
- workflow feedback
- hospital-scoped audit provenance

## Demo boundaries

Everything created by this seed is synthetic. It must not be used as a real patient
record, clinical recommendation, financial claim, real blockchain value, or measured
hospital outcome.

The PDF test pack is designed to be uploaded through the patient Reports screen.
The UI accepts up to five PDFs per batch, maximum 15 MB each.
