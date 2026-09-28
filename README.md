# ArkCare

A telehealth + CareQuest platform: patients book appointments, meet their doctor
over realtime video, and follow a clinician-approved care plan. Clinicians file a
consultation report that AI structures, that is anchored on the MST public
blockchain testnet for non-repudiation, and that automatically generates daily
missions, a knowledge check, and a gamified "Capsule" reward loop — all audited
in a hospital-admin console.

> **Demo data only.** All seeded records are synthetic. This is not a medical
> device and produces no clinical advice.

---

## ⚠️ First: you need the environment files (from the admin)

This repo does **not** include credentials. To run it you must obtain these
files from the repo owner / admin:

| File | Used by | What it holds |
| --- | --- | --- |
| `frontend.env` | copy → `Frontend/.env.local` | Groq, Pusher, Razorpay, Cloudinary, Agora, Pinecone, QStash, `AUTH_SECRET`, MongoDB URI |
| `backend.env` | copy → `Backend/.env` | Groq, Pinecone, internal AI token |
| `arkcare.env` | root fallback (optional) | same keys, loaded as a fallback by the Next config — **also holds `BRIDGEKEY_PRIVATE_KEY`, which the blockchain bridge needs** |

**Ask the admin for these three files.** Do not commit them — they are already
git-ignored. Once you have them, place them like this:

```bash
cp frontend.env  Frontend/.env.local   # frontend config
cp backend.env   Backend/.env          # backend config
cp arkcare.env   arkcare.env           # optional root fallback
```

`Frontend/.env.local.example` documents every variable and its purpose if you
need to build your own.

---

## Run it (one command)

Requirements: **Node.js 18+**, **Python 3.11 or 3.12**, and internet access
(for the external AI/Agora/Pusher/Cloudinary providers). MongoDB is downloaded
automatically if you don't have a local server.

```bash
# after placing the env files as above
./scripts/start-local-all.sh
```

This starts everything and is safe to re-run (idempotent):

| Service | Address | Notes |
| --- | --- | --- |
| MongoDB | `127.0.0.1:27017` | downloaded to `.runtime/mongodb` if absent; db `arkcare` |
| FastAPI backend | `http://127.0.0.1:8000` | AI chat + report parsing + prescription OCR |
| Next.js frontend | `http://localhost:3000` | the app |
| CareQuest bridge | `http://127.0.0.1:8546` | the only process holding a chain signing key |
| MST public testnet | `https://testnetrpc.mstblockchain.com` | the chain (no local EVM is started) |

There is no local blockchain. The launcher refuses to start without
`BRIDGEKEY_PRIVATE_KEY` in `arkcare.env` and without
`Blockchain/runtime/deployment.json`, because the bridge cannot sign and has
nowhere to read the contract addresses from.

On Windows, start the bridge with `scripts\start-mst-bridge.cmd` before
`npm run dev`.

Check health any time:

```bash
./scripts/status-local-all.sh
```

Stop it:

```bash
./scripts/stop-local-all.sh
```

The first run sets everything up automatically (MongoDB download, `npm ci`,
Python virtualenv, contract deploy). Give it a few minutes.

### Seed the demo data

```bash
cd Frontend && npm run seed:demo        # users, appointments, care programs
cd Frontend && npm run seed:hospitals   # multi-hospital network (admins, doctor assignment)
```

`seed:demo` creates synthetic demo users, appointments, and a CareQuest care
program. `seed:hospitals` creates the hospital network: a **platform (master)
admin**, one **hospital admin per hospital**, and distributes the demo doctors
across the hospitals.

### Open the app

Go to `http://localhost:3000` and sign in with a demo account (password for all:
`DemoOnly!123`):

| Role | Email |
| --- | --- |
| Patient | `demo.patient@arkcare.local` |
| Doctor | `demo.doctor@arkcare.local` |
| Hospital admin (demo) | `demo.hospital_admin@arkcare.local` |
| Hospital admin (Sunrise) | `admin@sunrise-care-hospital.local` |
| **Platform / master admin** | `demo.platform_admin@arkcare.local` |

## Multi-hospital network

ArkCare runs as a network of **independent hospitals**. Each hospital has its own
Capsule program, doctors, patients, and its own **separate audit chain** — data
and provenance are isolated per hospital.

- **Patient → Hospitals** (`/patient/hospitals`): browse every hospital, its
  **reputation**, and confirm its audit chain is valid.
- **Hospital admin → My hospital** (`/admin/hospital`): your hospital's
  reputation, per-patient engagement leaderboard, and your own audit head.
- **Platform (master) admin → Network** (`/admin/platform`): a master console
  over **every** hospital — reputation, where every audit went, and each
  hospital's independent chain head / integrity.

> **Reputation, not revenue.** A hospital's reputation is simply the
> participation its own patients have generated. It is a **quality signal, not a
> claimable balance** — Capsules are hospital-specific, non-transferable
> participation units that are never cashed out. The blockchain is a
> non-clinical proof rail and holds no monetary value.

---

## Try it on your phone (video calls)

Video calls need **HTTPS** (browsers block the camera on plain `http://IP`).
The helper exposes the app over a temporary HTTPS tunnel:

```bash
./scripts/serve-phone.sh            # prints a public https://… URL
./scripts/serve-phone.sh --status   # show the current URL
./scripts/serve-phone.sh --stop     # stop the tunnel
```

Open that URL on your phone, sign in as the **patient**, and on your computer
sign in as the **doctor** to start a call. (The URL is random and changes on
each start.)

---

## Demo over ngrok

`serve-phone.sh` uses a Cloudflare quick tunnel. To use ngrok instead — a
reserved domain, a paid account, or an authtoken — use `start-ngrok`:

```bat
scripts\start-ngrok.cmd            REM start the tunnel, print + record the URL
scripts\start-ngrok.cmd --status   REM show the current URL
scripts\start-ngrok.cmd --stop     REM stop the tunnel
```

```bash
./scripts/start-ngrok.sh            # same three flags on Linux / macOS
```

First-time setup:

```bash
ngrok config add-authtoken <YOUR_TOKEN>   # winget install ngrok.ngrok on Windows
```

The script starts `ngrok http 3000`, reads the public URL from the ngrok agent
API on `127.0.0.1:4040`, writes it into `Frontend/.env.local` as
`NEXT_PUBLIC_APP_URL`, and prints the demo logins.

**Restart the frontend afterwards.** `NEXT_PUBLIC_*` values are inlined at
build time, so `npm run dev` / `npm run build` has to run again for the tunnel
URL to take effect. That matters because three things read it:

- Agora video calls, which require a secure (HTTPS) origin
- the socket.io server, for chat and call signalling
- the Razorpay and QStash callback URLs

What is **not** exposed: only port 3000 is tunnelled. The CareQuest bridge stays
bound to `127.0.0.1:8546`, so the chain signing key never leaves the machine.
Anyone can use the public site, but nobody can reach the bridge or the database
through the tunnel.

Reserve a fixed domain so the URL survives restarts:

```bash
ngrok http 3000 --domain=your-name.ngrok-free.app
```

---

## Deploy on Render

`render.yaml` at the repo root is a Render Blueprint with three services:

| Service | What it is | Plan |
| --- | --- | --- |
| `arkcare-frontend` | Next.js 15 app | free |
| `arkcare-backend` | FastAPI AI service | free |
| `arkcare-bridge` | blockchain bridge (holds the chain key) | starter |

Deploy: **New → Blueprint → point at the repo → Apply.** Render reads
`render.yaml` and prompts for every value marked `sync: false`.

### Order of operations

1. **Create a MongoDB Atlas cluster** (free M0). Render does not host MongoDB.
   Add Render's egress to the IP allowlist, or `0.0.0.0/0` for a demo.
2. **Apply the blueprint.** Fill in the prompts:
   - `MONGODB_URI` — the same Atlas SRV string on **frontend and backend**
   - `GROQ_API_KEY`, `PINECONE_API_KEY` — same on both
   - `PUSHER_*`, `AGORA_*`, `CLOUDINARY_*`, `RAZORPAY_*` — frontend
   - `BRIDGEKEY_PRIVATE_KEY` — **bridge only**, the MST signing key
   - `CAREQUEST_BLOCKCHAIN_BRIDGE_TOKEN` — one value, set on **both** frontend
     and bridge. It is the shared secret that lets the app call the signer.
3. **Make the bridge private.** Go to the `arkcare-bridge` service → Settings →
   Network → Access → **Private**. It holds a key that can sign; do not skip
   this. The frontend reaches it at `http://arkcare-bridge:10000`.
4. **Set `NEXT_PUBLIC_APP_URL`** to the frontend's real URL
   (`https://arkcare-frontend.onrender.com`) and redeploy. `NEXT_PUBLIC_*` is
   inlined at build time, so changing it at runtime alone does nothing.
5. **Seed the demo data** into Atlas:
   ```bash
   cd Frontend && npm run seed:demo && npm run seed:hospitals
   ```

### What is and isn't in the repo

Committed: `arkcare.env.example` (empty placeholders) and
`Blockchain/runtime/deployment.json` (public contract addresses and ABIs — no
keys). Both are required for the app to boot.

Never committed: `arkcare.env`, `Frontend/.env.local`, `Backend/.env`, and
`node_modules` / `.venv` / `.next`. Every secret lives only in Render's
encrypted env vars.

### Is it just `.env`?

No — `.env` is the local equivalent. On Render, secrets are set in the
dashboard (or in the Blueprint as `sync: false` / `generateValue: true`).
Everything you would put in `arkcare.env` maps to a Render env var; the full
list with which service needs what is in `arkcare.env.example` and
`render.yaml`. Two things are easy to miss:

- `NEXT_PUBLIC_APP_URL` must be a **build-time** variable, and must be the
  public HTTPS URL, or Agora video calls and payment callbacks break.
- `BRIDGEKEY_PRIVATE_KEY` must be the same key that deployed the contracts. If
  it is a different wallet, that wallet has no `ANCHOR_ROLE` and `/anchor`
  reverts — the bridge prints that warning on startup.

### Free-tier limits

Free services spin down after inactivity, so the first request after a pause is
slow. The bridge is set to `starter` because it must stay warm; a sleeping
bridge is not fatal (the app treats the chain as non-clinical) but it will look
offline. Render gives every service an ephemeral filesystem, so
`runtime/bridge-state.json` resets on restart — that can only cause a re-send,
never a double mint, because each write is keyed by its own reference.

---

## How the pieces fit

- **Frontend** — `Frontend/` (Next.js App Router). Patient, doctor, staff and
  hospital-admin views; CareQuest dashboards; chat with realtime video/audio.
- **Backend** — `Backend/` (FastAPI). AI chat, medical-report parsing, and
  `POST /ocr_prescription` (tesseract) to read prescription images.
- **Blockchain** — `Blockchain/` (Solidity + ethers). The CareQuest contracts are
  deployed to the **MST public testnet**, holding non-transferable Capsule
  tokens and a Merkle audit-anchor contract. It is a **non-clinical proof rail**:
  everything keeps working if it's offline, and no patient identifiers ever go
  on-chain (only token balances and Merkle roots).
- **CareQuest runbook** — see `CAREQUEST.md`.
- **Local dev details** — see `scripts/LOCAL-DEV.md`.
- **Blockchain setup** — see `Blockchain/README.md`.

### The blockchain trust loop

The app never holds a chain key. Next.js server actions POST to a local bridge
process, which is the only component that signs:

```
patient mission completed
   └─> CapsuleAward written to MongoDB            (authoritative ledger)
        └─> bridge /hospital-mint  ──> CareQuestHospitalCapsules (tokenId per hospital)
doctor files a report / handoff is resolved
   └─> AuditEvent appended (hash-chained, per hospital)
        └─> bridge /anchor        ──> CareQuestAuditAnchor (Merkle root)
```

- The database ledger stays the source of truth. The bridge reconciles the delta
  and marks each award `synced`; a hospital admin's **Audit & integrity** page
  recomputes the hash chain and links each anchor batch to its block explorer tx.
- Each hospital gets its own Capsule token ID (`1001` CITY, `1002` LOTUS,
  `1003` SUNRISE, `1004` METRO) and its own audit chain, so one hospital can
  verify its patients' participation without seeing another's.
- See the audit console at `/admin/carequest/audit` as a hospital admin.

### The doctor report → care plan → quiz loop

1. A doctor files a consultation **Report** (remarks, activity advice, and a
   prescription that can be a photo).
2. **AI** OCRs any attached image and structures the doctor's own text into
   reviewed JSON. It never invents a medication or dose, and flags low-confidence
   OCR.
3. On submit, the content is **hashed and anchored on-chain** (so a filed
   prescription can't be later denied), audited, and an **approved care plan** is
   auto-published with daily missions and a **4-question knowledge check**
   (retrieved from `carequest_quiz_bank.json` by relevance to the report).
4. The patient takes the quiz on their CareQuest page, earning **Capsules** as
   they complete missions — tracked on the animated gauge and in the hospital
   admin **audit log**.

---

## Security notes

- Env files with live secrets are git-ignored and must come from the admin.
- Reports are append-only; a correction is a new anchored revision, never an
  edit or delete.
- The AI assists documentation only; it cannot prescribe or approve anything.
- Capsule tokens are non-transferable participation credits — not
  cryptocurrency, no cash value.

## Stack

Next.js · React · FastAPI · MongoDB/Mongoose · Groq · Pusher · Agora ·
Cloudinary · Pinecone · ethers · Solidity · tesseract
