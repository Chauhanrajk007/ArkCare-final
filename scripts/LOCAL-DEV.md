# ArkCare local development environment (Linux)

One-command launcher for the complete local ArkCare stack, including the
CareQuest clinical workflow and the CareQuest bridge to the MST public testnet.

## Usage

```bash
./scripts/start-local-all.sh    # start everything (idempotent)
./scripts/status-local-all.sh   # real health checks per service
./scripts/stop-local-all.sh     # stop only launcher-started processes
```

## Services

| Service | Address | Notes |
| --- | --- | --- |
| MongoDB | `127.0.0.1:27017` | database `arkcare`, data in `.runtime/mongodb/data` |
| FastAPI backend | `http://127.0.0.1:8000` | venv at `Backend/.venv`, Python 3.12 |
| Next.js frontend | `http://localhost:3000` | dev server (turbopack) |
| CareQuest bridge | `http://127.0.0.1:8546` | `/health` returns contract addresses |
| MST public testnet | `https://testnetrpc.mstblockchain.com` | the chain; no local EVM exists |

External providers (Groq, Pinecone, Pusher, Agora, Cloudinary, Razorpay and
optional QStash) need no local servers. The local CareQuest demo uses the
synthetic demo clock and MongoDB occurrences, so QStash is not required.

## Layout

```
.runtime/
  pids/        one PID file per service started by the launcher
  logs/        service logs (backend.log, bridge.log, frontend.log)
  mongodb/     local mongod binary + database files
```

## Safety behaviour

- `start-local-all.sh` refuses to kill an unrelated process holding a port; it
  reports the owner and exits with an error instead.
- `stop-local-all.sh` only signals PIDs recorded in `.runtime/pids/`, and
  re-checks each process's command line before signalling. It never touches
  arbitrary Node, Python or system MongoDB processes.
- MongoDB is left running by default. Set `ARKCARE_STOP_MONGO=1` to stop the
  `.runtime` mongod; a system-installed mongod is never stopped.
- Contracts are deployed only when the running chain has no code at the
  recorded CAP address, so restarting does not redeploy needlessly.
- No patient identifiers or clinical content is ever written to the chain. The
  MongoDB CapsuleAward ledger stays authoritative, and clinical workflows keep
  working when the blockchain is unavailable.
- CAP remains a non-transferable participation token; it is not a
  cryptocurrency and has no market value.

## Sharing this folder with someone else

```bash
./scripts/make-share-zip.sh            # writes ../ArkCare-share.zip
```

This packages the repo without the machine-specific, regenerable parts
(`Backend/.venv`, both `node_modules`, `Frontend/.next`, `.runtime/` and the
bundled mongod), which cut the archive from 1.7 GB to about 5 MB. The
recipient's first `./scripts/start-local-all.sh` then rebuilds everything: it
downloads MongoDB if no local server exists, runs `npm ci` / `npm install`,
and recreates the Python 3.12 virtualenv if the copied one is unusable.

The launcher detects a venv built on another machine or at another path and
rebuilds it automatically, so no manual cleanup is needed.

**The archive includes real credentials** (`Frontend/.env.local` and
`Backend/.env`) so the demo runs without setup. Share it only with someone you
trust, and rotate those keys if it passes through a public channel. To ship
without secrets, delete those two files from the archive and have the
recipient create them from `Frontend/.env.local.example`.

## Note on `npm run build`

`npm run build` and `npm run dev` share the `.next` directory. A production
build replaces `.next/static/development` underneath a running dev server, which
makes the dev server return HTTP 500 until it is restarted. Run the build with
the frontend stopped, or just restart afterwards:

```bash
./scripts/stop-local-all.sh && ./scripts/start-local-all.sh
```

## Demo data

```bash
cd Frontend && npm run seed:demo
```

Seeds synthetic demo users, care programs and reports for the CareQuest
walkthrough in `CAREQUEST.md`. The seeder reads `Frontend/.env.local` first, so
it targets the local MongoDB rather than the Atlas URI in the repository-root
`arkcare.env`.

Sign in from the landing page with the synthetic demo accounts (patient,
doctor, nurse, hospital admin) when `DEMO_LOGIN_ENABLED=true`.

## Phone access for video calls

Browsers block the microphone/camera on plain `http://<LAN-IP>`, and ArkCare
itself refuses to start a call from an insecure context. To try the realtime
patient↔doctor call (Agora video/audio, image sharing) from a phone, expose the
frontend over a real HTTPS URL with a one-time tunnel:

```bash
./scripts/serve-phone.sh            # prints the https://…trycloudflare.com URL
./scripts/serve-phone.sh --stop     # stop the tunnel
./scripts/serve-phone.sh --status   # show current URL
```

Then:

1. Phone: open the printed HTTPS URL, sign in as
   `demo.patient@arkcare.local` / `DemoOnly!123`.
2. This PC (or any second device): open `http://localhost:3000`, sign in as
   `demo.doctor@arkcare.local` / `DemoOnly!123`.
3. Both sides: **My Appointments → open the “SYNTHETIC DEMO - … follow-up”
   appointment → Chat → video/phone button** (`createOrGetChat` keys the shared
   chat off that appointment). Pusher relays the ring, Agora carries the media,
   and images upload via Cloudinary — all through the tunnel.

The tunnel URL changes on every restart (quick tunnels are random and free; no
Cloudflare account needed). The tunnel talks to `localhost:3000`, so it works
whether the phone is on the same Wi-Fi or another network, while the desktop
client still uses `localhost`.

Two code-level details make remote use work without weakening anything:

- `lib/socket-client.js` connects socket.io to the *page's own origin* when it
  is not loopback, so a phone's chat traffic reaches your server through the
  tunnel instead of pointing at the phone itself.
- `lib/socket-server.js` accepts cross-origin socket.io handshakes via an
  origin function, but the session-token middleware still rejects any connect
  that lacks a valid `sc_session` token, so authorization is unchanged.

This network blocks QUIC/UDP, so the tunnel runs with `--protocol http2`
(HTTP/2 over TCP). If a URL stops resolving, `--stop` then start again for a
fresh one.

## Doctor report → care plan → quiz → Capsules

The doctor files a consultation report (remarks, activity advice, and a
prescription that may be a **photo**). The FastAPI backend OCRs attached
images with tesseract (`POST /ocr_prescription`), and Groq structures the
doctor's own text into a reviewed JSON payload (conditions, medications with
their source `verbatim` line, activities, follow-up window, keywords). The AI
never invents a medication or dose and flags low-confidence OCR.

On submit the server re-parses from the raw text, then:

- content-hashes the clinician-authored content and **anchors that hash
  on-chain** (bridge `/anchor`, `merkleRoot = 0x<contentHash>`), so a filed
  prescription cannot be later denied;
- appends `report.recorded` + `report.anchored` audit events;
- auto-publishes an **approved** care-plan version (lesson, daily medication
  check-in, doctor-advised activities, follow-up, and a knowledge check) and
  generates the missions;
- builds a **4-question RAG quiz** by scoring all 149 questions in
  `carequest_quiz_bank.json` against the report and returning the top 4 across
  several categories.

The patient takes the quiz on `/patient/carequest` (correct answers never leave
the server), earns `1 + correct` CAP, and the ledger syncs to the chain. The
**animated capsule gauge** in the top-right of the CareQuest shell fills slowly
toward 2000 as the patient completes work. Doctors see their patients, filed
reports and each patient's activity dashboard under `/doctor/care-plans`, and
the hospital admin sees every step in `/admin/carequest/audit`.

Reports are append-only: a correction is a new revision (new anchored hash),
never an edit or delete.
