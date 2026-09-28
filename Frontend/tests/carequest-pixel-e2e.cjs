const fs = require("fs");
const path = require("path");
const assert = require("assert");
const crypto = require("crypto");
const { spawn } = require("child_process");
const mongoose = require("mongoose");
const { chromium } = require("playwright");

const ROOT = path.resolve(__dirname, "../..");
const FRONTEND = path.join(ROOT, "Frontend");
const BLOCKCHAIN = path.join(ROOT, "Blockchain");
const BASE =
  process.env.CAREQUEST_UI_E2E_BASE_URL || "http://127.0.0.1:13002";
// The chain is the MST public testnet. There is no local EVM to boot: the
// bridge reads the already-deployed contract addresses from
// Blockchain/runtime/deployment.json, so the test exercises the real chain.
const MST_RPC =
  process.env.CAREQUEST_UI_E2E_MST_RPC || "https://testnetrpc.mstblockchain.com";
const BRIDGE_BASE =
  process.env.CAREQUEST_UI_E2E_BRIDGE_URL || "http://127.0.0.1:18546";
// The chain is MST testnet, which needs a funded key and a deployment record -
// both git-ignored, so they are absent on a plain CI checkout. Set this to 0 to
// run the UI assertions only and skip every on-chain check.
const CHAIN_ENABLED = process.env.CAREQUEST_UI_E2E_CHAIN !== "0";

function readEnv(file) {
  const env = {};
  if (!fs.existsSync(file)) return env;
  const source = fs.readFileSync(file, "utf8");
  for (const raw of source.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const i = line.indexOf("=");
    if (i < 1) continue;
    const key = line.slice(0, i).trim();
    let value = line.slice(i + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

const rootEnv = readEnv(path.join(ROOT, "arkcare.env"));
for (const [key, value] of Object.entries(rootEnv)) {
  if (process.env[key] === undefined) process.env[key] = value;
}

async function db() {
  if (mongoose.connection.readyState !== 1) {
    assert(process.env.MONGODB_URI, "MONGODB_URI missing for CareQuest UI E2E");
    await mongoose.connect(process.env.MONGODB_URI);
  }
  return mongoose.connection.db;
}

async function getUser(email) {
  return (await db()).collection("users").findOne({ email });
}

async function getProfile(email, collection) {
  const user = await getUser(email);
  if (!user) return {};
  const profile = await (await db())
    .collection(collection)
    .findOne({ userId: user._id.toString() });
  return { user, profile };
}

async function waitHttp(url, attempts = 90) {
  for (let i = 0; i < attempts; i++) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("Timed out waiting for " + url);
}

async function waitRpc(attempts = 30) {
  for (let i = 0; i < attempts; i++) {
    try {
      const response = await fetch(MST_RPC, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "eth_chainId",
          params: [],
        }),
        signal: AbortSignal.timeout(8000),
      });
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error("Timed out waiting for the MST testnet RPC at " + MST_RPC);
}

async function signInDemo(page, role) {
  const labels = {
    patient: "Demo Patient",
    doctor: "Demo Doctor",
    nurse: "Demo Nurse",
    hospital_admin: "Demo Hospital Admin",
  };
  const homes = {
    patient: /\/patient/,
    doctor: /\/doctor/,
    nurse: /\/staff/,
    hospital_admin: /\/admin\/carequest/,
  };

  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: labels[role], exact: true }).click();
  await page.waitForURL(homes[role], {
    timeout: 60000,
    waitUntil: "domcontentloaded",
  });
}

async function getPrimaryProgram() {
  const database = await db();
  const organization = await database
    .collection("organizations")
    .findOne({ slug: "arkcare-demo-hospital" });
  assert(organization, "primary demo organization missing");
  const program = await database
    .collection("hospitalprograms")
    .findOne({ organization: organization._id, slug: "carequest-city" });
  assert(program, "primary demo hospital program missing");
  return { organization, program };
}

async function clearPatientCareQuest(patient, doctor) {
  const database = await db();
  const plans = patient
    ? await database.collection("careplans").find({ patient: patient._id }).toArray()
    : [];
  const planIds = plans.map((x) => x._id);
  const occurrences = planIds.length
    ? await database
        .collection("scheduledoccurrences")
        .find({ carePlan: { $in: planIds } })
        .toArray()
    : [];
  const occurrenceIds = occurrences.map((x) => x._id);
  const cases = occurrenceIds.length
    ? await database
        .collection("handoffcases")
        .find({ occurrence: { $in: occurrenceIds } })
        .toArray()
    : [];
  const caseIds = cases.map((x) => x._id);

  const appointments = patient
    ? await database
        .collection("appointments")
        .find({
          $or: [
            { patient: patient._id },
            ...(doctor?._id ? [{ doctor: doctor._id }] : []),
          ],
        })
        .toArray()
    : [];
  const appointmentIds = appointments.map((x) => x._id);

  if (caseIds.length) {
    await database.collection("caseevents").deleteMany({ caseId: { $in: caseIds } });
    await database.collection("handoffcases").deleteMany({ _id: { $in: caseIds } });
  }
  if (occurrenceIds.length) {
    await database
      .collection("reminderdeliveries")
      .deleteMany({ occurrence: { $in: occurrenceIds } });
    await database
      .collection("patientresponses")
      .deleteMany({ occurrence: { $in: occurrenceIds } });
    await database
      .collection("scheduledoccurrences")
      .deleteMany({ _id: { $in: occurrenceIds } });
  }
  if (planIds.length) {
    await database.collection("planversions").deleteMany({ carePlan: { $in: planIds } });
    await database.collection("careplans").deleteMany({ _id: { $in: planIds } });
  }
  if (appointmentIds.length) {
    await Promise.all([
      database
        .collection("paymentevidences")
        .deleteMany({ appointment: { $in: appointmentIds } }),
      database
        .collection("bookingpayments")
        .deleteMany({ appointment: { $in: appointmentIds } }),
    ]);
    await database
      .collection("appointments")
      .deleteMany({ _id: { $in: appointmentIds } });
  }

  if (patient?._id) {
    const sessions = await database
      .collection("activitysessions")
      .find({ patient: patient._id })
      .toArray();
    const sessionIds = sessions.map((x) => x._id);
    if (sessionIds.length) {
      await database
        .collection("deviceevidences")
        .deleteMany({ activitySession: { $in: sessionIds } });
      await database
        .collection("miningsimulations")
        .deleteMany({ activitySession: { $in: sessionIds } });
    }
    await database.collection("activitysessions").deleteMany({ patient: patient._id });
    await database.collection("redemptions").deleteMany({ patient: patient._id });
    await database.collection("capsuleawards").deleteMany({ patient: patient._id });
    await database
      .collection("capsulebalanceprojections")
      .deleteMany({ patient: patient._id });
    await database
      .collection("capsuledailycounters")
      .deleteMany({ patient: patient._id });
    await database.collection("blockchainaccounts").deleteMany({ patient: patient._id });
    await database.collection("patientmemberships").deleteMany({ patient: patient._id });
    if (patient.userId) {
      await database.collection("userpreferences").deleteMany({ userId: patient.userId });
    }
  }

  await database
    .collection("rewardbudgets")
    .updateMany({}, { $set: { spentAmount: 0, reservedAmount: 0, status: "active" } });
  await database
    .collection("rewardcatalogitems")
    .updateMany({}, { $set: { redeemedCount: 0 } });
}

async function capsuleBalance(patientId, programId) {
  const rows = await (await db())
    .collection("capsuleawards")
    .find({ patient: patientId, program: programId })
    .toArray();
  return rows.reduce((sum, row) => sum + Number(row.amount || 0), 0);
}
async function waitForCapsuleBalance(patientId, programId, expected, timeoutMs = 15000) {
  const started = Date.now();
  let last = null;
  while (Date.now() - started < timeoutMs) {
    last = await capsuleBalance(patientId, programId);
    if (last === expected) return last;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  assert.strictEqual(last, expected);
}
async function waitForHandoffCount(patientId, organizationId, expected, timeoutMs = 15000) {
  const started = Date.now();
  let rows = [];
  while (Date.now() - started < timeoutMs) {
    rows = await (await db())
      .collection("handoffcases")
      .find({ patient: patientId, organization: organizationId })
      .toArray();
    if (rows.length === expected) return rows;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  assert.strictEqual(rows.length, expected);
  return rows;
}
async function hospitalChainBalance(walletAddress, tokenId) {
  if (!CHAIN_ENABLED) return 0;
  const response = await fetch(
    BRIDGE_BASE +
      "/hospital-balance?walletAddress=" +
      encodeURIComponent(walletAddress) +
      "&tokenId=" +
      encodeURIComponent(String(tokenId))
  );
  const payload = await response.json();
  assert.strictEqual(
    response.status,
    200,
    "hospital-balance bridge error: " + JSON.stringify(payload)
  );
  const balance = Number(payload.balance);
  assert(Number.isFinite(balance), "hospital-balance response is not numeric");
  return balance;
}
async function waitForHospitalChainBalance(
  walletAddress,
  tokenId,
  expected,
  timeoutMs = 20000
) {
  if (!CHAIN_ENABLED) return expected;
  const started = Date.now();
  let last = null;
  while (Date.now() - started < timeoutMs) {
    last = await hospitalChainBalance(walletAddress, tokenId);
    if (last === expected) return last;
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  assert.strictEqual(
    last,
    expected,
    "hospital-chain balance did not converge"
  );
  return last;
}
async function syncBlockchainProof(page) {
  if (!CHAIN_ENABLED) return;
  let lastMessage = "";
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await page.goto(BASE + "/patient/carequest", {
      waitUntil: "domcontentloaded",
    });
    await page
      .getByText("Your care missions", { exact: true })
      .waitFor({ timeout: 15000 });

    const button = page.getByRole("button", { name: "Sync proof" });
    await button.waitFor({ state: "visible", timeout: 15000 });
    await button.click();

    try {
      await page
        .getByText("Blockchain proof synchronized.", { exact: true })
        .waitFor({ timeout: 10000 });
      return;
    } catch {
      const achievements = page.locator(".cq-achievement");
      if (await achievements.count()) {
        lastMessage =
          (await achievements.last().textContent().catch(() => "")) || "";
      }
    }
  }

  throw new Error(
    "Blockchain sync UI did not confirm completion" +
      (lastMessage ? ": " + lastMessage.trim() : "")
  );
}

function stableAuditValue(value) {
  if (Array.isArray(value)) return value.map(stableAuditValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, stableAuditValue(value[key])])
    );
  }
  return value;
}

async function insertValidTenantAuditEvent({
  organizationId,
  programId,
  eventType,
}) {
  const database = await db();
  const previous = await database
    .collection("auditevents")
    .find({ organization: organizationId, schemaVersion: 2 })
    .sort({ createdAt: -1, _id: -1 })
    .limit(1)
    .next();

  const event = {
    schemaVersion: 2,
    organization: organizationId,
    program: programId,
    eventId: crypto.randomUUID(),
    eventType,
    actorUserId: "synthetic-cross-tenant-check",
    actorRole: "hospital_admin",
    resourceType: "SyntheticTenantCheck",
    resourceId: crypto.randomUUID(),
    verificationLevel: "system_confirmed",
    metadata: { synthetic: true },
    previousHash: previous?.eventHash || "",
  };

  const canonical = JSON.stringify(
    stableAuditValue({
      schemaVersion: 2,
      organizationId: String(event.organization || ""),
      programId: String(event.program || ""),
      eventId: event.eventId,
      eventType: event.eventType,
      actorUserId: String(event.actorUserId),
      actorRole: String(event.actorRole),
      resourceType: event.resourceType,
      resourceId: String(event.resourceId),
      verificationLevel: event.verificationLevel,
      metadata: event.metadata,
      previousHash: event.previousHash,
    })
  );

  event.eventHash = crypto
    .createHash("sha256")
    .update(canonical)
    .digest("hex");
  event.createdAt = new Date();

  await database.collection("auditevents").insertOne(event);
  return event;
}

async function chooseFutureAvailableDate(page) {
  const days = page.locator('[data-slot="calendar"] [data-day]:not([disabled])');
  await days.first().waitFor({ state: "visible", timeout: 10000 });
  const count = await days.count();
  const threshold = Date.now() + 36 * 60 * 60 * 1000;
  for (let i = 0; i < count; i++) {
    const el = days.nth(i);
    const raw = await el.getAttribute("data-day");
    const date = new Date(raw);
    if (!Number.isNaN(date.getTime()) && date.getTime() > threshold) {
      await el.click();
      return;
    }
  }
  throw new Error("No future appointment date found");
}

async function main() {
  // The deployment record holds the live MST contract addresses. It is
  // git-ignored, so a plain CI checkout does not have it - hence CHAIN_ENABLED.
  const deploymentPath = path.join(BLOCKCHAIN, "runtime", "deployment.json");
  const rootEnv = readEnv(path.join(ROOT, "arkcare.env"));

  if (CHAIN_ENABLED) {
    if (!fs.existsSync(deploymentPath)) {
      throw new Error(
        "Blockchain/runtime/deployment.json is missing. Deploy the contracts to " +
          "MST testnet first:  cd Blockchain && npm run deploy:mst"
      );
    }
    // The bridge needs a funded key to sign; on a remote network it refuses to
    // start without one.
    if (!rootEnv.BRIDGEKEY_PRIVATE_KEY) {
      throw new Error(
        "BRIDGEKEY_PRIVATE_KEY is not set in arkcare.env. The bridge cannot sign " +
          "for the deployed contracts without it."
      );
    }
    const deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
    console.log(
      "Using MST deployment:",
      deployment.network,
      "chainId",
      deployment.chainId,
      "capsule",
      deployment.capsuleAddress
    );
  } else {
    console.log(
      "CAREQUEST_UI_E2E_CHAIN=0 - running UI assertions only, on-chain checks skipped."
    );
  }

  let bridgeProcess;
  let server;
  let browser;
  const contexts = [];

  try {
    if (CHAIN_ENABLED) {
      await waitRpc();

      bridgeProcess = spawn("node", ["bridge-server.js"], {
        cwd: BLOCKCHAIN,
        stdio: ["ignore", "pipe", "pipe"],
        env: {
          ...process.env,
          CAREQUEST_BLOCKCHAIN_BRIDGE_PORT: new URL(BRIDGE_BASE).port,
        },
      });
      await waitHttp(BRIDGE_BASE + "/health");
    }

    const serverEnv = {
      ...process.env,
      ...rootEnv,
      NEXT_PUBLIC_APP_URL: BASE,
      AI_CHAT: process.env.AI_CHAT || "http://127.0.0.1:18000/chat",
      AI_PDF: process.env.AI_PDF || "http://127.0.0.1:18000/parse_report",
      // Without a bridge there is nothing to talk to, and the UI is exercised
      // through its database-only path instead.
      CAREQUEST_BLOCKCHAIN_ENABLED: CHAIN_ENABLED ? "true" : "false",
      CAREQUEST_BLOCKCHAIN_BRIDGE_URL: BRIDGE_BASE,
    };

    server = spawn(
      process.platform === "win32" ? "npm.cmd" : "npm",
      ["run", "start", "--", "-H", "127.0.0.1", "-p", "13002"],
      {
        cwd: FRONTEND,
        env: serverEnv,
        stdio: ["ignore", "pipe", "pipe"],
      }
    );
    let serverLog = "";
    server.stdout.on("data", (d) => (serverLog += d.toString()));
    server.stderr.on("data", (d) => (serverLog += d.toString()));

    await waitHttp(BASE);
    browser = await chromium.launch({
      headless: true,
      args: ["--no-sandbox"],
    });

    // Bootstrap demo identities and programs.
    for (const role of ["patient", "doctor"]) {
      const ctx = await browser.newContext();
      const page = await ctx.newPage();
      await signInDemo(page, role);
      await ctx.close();
    }

    const patientData = await getProfile("demo.patient@arkcare.local", "patients");
    const doctorData = await getProfile("demo.doctor@arkcare.local", "doctors");
    assert(patientData.profile, "demo patient missing");
    assert(doctorData.profile, "demo doctor missing");

    await clearPatientCareQuest(patientData.profile, doctorData.profile);

    // Re-seed patient memberships after cleanup.
    const reseedCtx = await browser.newContext();
    const reseedPage = await reseedCtx.newPage();
    await signInDemo(reseedPage, "patient");
    await reseedCtx.close();

    const { organization, program } = await getPrimaryProgram();
    const secondaryOrg = await (await db())
      .collection("organizations")
      .findOne({ slug: "lotus-heart-demo" });
    const secondaryProgram = await (await db())
      .collection("hospitalprograms")
      .findOne({ organization: secondaryOrg._id, slug: "lotus-path" });
    assert(secondaryProgram, "secondary hospital program missing");

    const memberships = await (await db())
      .collection("patientmemberships")
      .find({ patient: patientData.profile._id, status: "active" })
      .toArray();
    assert.strictEqual(memberships.length, 2, "patient must join two demo hospital programs");

    const initialAppointment = {
      _id: new mongoose.Types.ObjectId(),
      organization: organization._id,
      program: program._id,
      patient: patientData.profile._id,
      doctor: doctorData.profile._id,
      appointmentDate: new Date(Date.now() - 60 * 60 * 1000),
      reason: "Synthetic CareQuest consultation",
      status: "completed",
      notes: "Synthetic completed consultation for CareQuest UI E2E",
      amount: 0,
      currency: "INR",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    await (await db()).collection("appointments").insertOne(initialAppointment);

    const patientCtx = await browser.newContext();
    const doctorCtx = await browser.newContext();
    const nurseCtx = await browser.newContext();
    const adminCtx = await browser.newContext();
    contexts.push(patientCtx, doctorCtx, nurseCtx, adminCtx);

    const patientPage = await patientCtx.newPage();
    const doctorPage = await doctorCtx.newPage();
    const nursePage = await nurseCtx.newPage();
    const adminPage = await adminCtx.newPage();

    await signInDemo(patientPage, "patient");
    await signInDemo(doctorPage, "doctor");

    console.log("Pixel E2E: doctor approves plan with activity mission");
    await doctorPage.goto(BASE + "/doctor/care-plans");
    await doctorPage.getByText("CareQuest Care Plans", { exact: true }).waitFor();
    const appointmentSelect = doctorPage.locator("select").first();
    const completedOption = appointmentSelect
      .locator("option")
      .filter({ hasText: "completed" })
      .first();
    const appointmentValue = await completedOption.getAttribute("value");
    assert(appointmentValue, "completed consultation missing");
    await appointmentSelect.selectOption(appointmentValue);
    await doctorPage.getByRole("button", { name: "Create private draft" }).click();
    await doctorPage
      .getByText("Draft created. It is not visible to the patient.", { exact: true })
      .waitFor();
    await doctorPage.getByRole("button", { name: "Approve", exact: true }).click();
    await doctorPage
      .getByText("Plan approved. The patient can now view this version.", { exact: true })
      .waitFor({ timeout: 20000 });

    const database = await db();
    const plan = await database.collection("careplans").findOne({
      patient: patientData.profile._id,
      organization: organization._id,
      program: program._id,
    });
    assert(plan, "hospital-scoped CarePlan missing");

    const activityOccurrence = await database
      .collection("scheduledoccurrences")
      .findOne({
        carePlan: plan._id,
        activityType: "activity",
        organization: organization._id,
        program: program._id,
      });
    assert(activityOccurrence, "approved activity mission missing");
    assert.strictEqual(activityOccurrence.activityConfig.goalValue, 5000);

    console.log("Pixel E2E: patient sees two independent hospital programs");
    await patientPage.goto(BASE + "/patient/carequest");
    await patientPage.getByText("Your care missions", { exact: true }).waitFor();
    await patientPage.getByText("ArkCare City Hospital", { exact: true }).waitFor();
    await patientPage.getByText("Lotus Heart Institute", { exact: true }).waitFor();
    assert.strictEqual(
      await capsuleBalance(patientData.profile._id, secondaryProgram._id),
      0
    );

    console.log("Pixel E2E: lesson earns real hospital-scoped Capsules");
    await patientPage.getByRole("button", { name: /I understand.*2 CAP/ }).click();
    await waitForCapsuleBalance(
      patientData.profile._id,
      program._id,
      2
    );

    console.log("Pixel E2E: simulated device/compute can only use approved activity");
    let startActivity = patientPage.getByRole("button", {
      name: "Start simulated activity",
    });
    let connectActivity = patientPage.getByRole("button", {
      name: "Connect simulated Health Connect",
    });

    if (
      !(await startActivity.isVisible().catch(() => false)) &&
      !(await connectActivity.isVisible().catch(() => false))
    ) {
      // Use the synthetic clock until the clinician-approved activity is due.
      // Consent is intentionally unavailable before the mission reaches its due state.
      for (let i = 0; i < 8; i++) {
        const clock = patientPage.getByRole("button", {
          name: "Make next mission due (demo)",
        });
        await clock.click();
        await patientPage.waitForTimeout(400);

        startActivity = patientPage.getByRole("button", {
          name: "Start simulated activity",
        });
        connectActivity = patientPage.getByRole("button", {
          name: "Connect simulated Health Connect",
        });

        if (
          (await startActivity.isVisible().catch(() => false)) ||
          (await connectActivity.isVisible().catch(() => false))
        ) {
          break;
        }
      }
    }

    if (await connectActivity.isVisible().catch(() => false)) {
      await connectActivity.click();
      await patientPage
        .getByText(
          "Simulated device permission enabled for this demo program.",
          { exact: true }
        )
        .waitFor({ timeout: 10000 });
    }

    startActivity = patientPage.getByRole("button", {
      name: "Start simulated activity",
    });
    await startActivity.waitFor({ state: "visible", timeout: 15000 });
    await startActivity.click();
    await patientPage
      .getByRole("button", { name: "Verify demo evidence & claim Capsules" })
      .waitFor({ state: "visible", timeout: 15000 });
    await patientPage
      .getByRole("button", { name: "Verify demo evidence & claim Capsules" })
      .click();
    await patientPage
      .getByText("SIMULATED MINING PAYOUT", { exact: true })
      .waitFor({ timeout: 15000 });
    await waitForCapsuleBalance(
      patientData.profile._id,
      program._id,
      5
    );

    const miningRuns = await database
      .collection("miningsimulations")
      .find({ patient: patientData.profile._id, program: program._id })
      .toArray();
    assert.strictEqual(miningRuns.length, 1);
    assert.strictEqual(miningRuns[0].isSimulation, true);

    console.log("Pixel E2E: secondary hospital cannot borrow primary clinical activity");
    await patientPage.getByRole("button", { name: /Lotus Heart Institute/ }).click();
    await patientPage
      .getByText(
        "No clinician-approved activity mission is available in this hospital journey.",
        { exact: false }
      )
      .waitFor();
    assert.strictEqual(
      await patientPage.getByRole("button", { name: "Start simulated activity" }).count(),
      0
    );
    await patientPage.getByRole("button", { name: /ArkCare City Hospital/ }).click();

    console.log("Pixel E2E: Need Help creates one real handoff");
    let needHelp = patientPage.getByRole("button", { name: /Need help.*1/ }).first();
    if (!(await needHelp.isVisible().catch(() => false))) {
      await patientPage
        .getByRole("button", { name: "Make next mission due (demo)" })
        .click();
      needHelp = patientPage.getByRole("button", { name: /Need help.*1/ }).first();
    }
    await needHelp.waitFor({ state: "visible", timeout: 15000 });
    patientPage.once("dialog", (dialog) =>
      dialog.accept("I need clarification from my care team.")
    );
    await needHelp.click();
    await waitForCapsuleBalance(
      patientData.profile._id,
      program._id,
      6
    );

    const handoffs = await waitForHandoffCount(
      patientData.profile._id,
      organization._id,
      1
    );

    console.log("Pixel E2E: staff ownership and doctor escalation");
    await signInDemo(nursePage, "nurse");
    await nursePage.getByText("CareQuest handoff queue", { exact: true }).waitFor();

    const crossTenantRealtimeStatus = await nursePage.evaluate(
      async (organizationId) => {
        const form = new FormData();
        form.set("socket_id", "1.1");
        form.set(
          "channel_name",
          "private-carequest-staff-" + organizationId
        );
        const response = await fetch("/api/pusher/auth", {
          method: "POST",
          body: form,
          credentials: "same-origin",
        });
        return response.status;
      },
      secondaryOrg._id.toString()
    );
    assert.strictEqual(
      crossTenantRealtimeStatus,
      403,
      "Primary-hospital nurse authorized a secondary-hospital realtime channel"
    );

    await nursePage.getByRole("button", { name: /Assign to me/ }).click();
    nursePage.once("dialog", (dialog) =>
      dialog.accept("No answer on synthetic first contact.")
    );
    await nursePage.getByRole("button", { name: /Unsuccessful contact/ }).click();
    await nursePage.getByRole("button", { name: "Shift reassignment" }).click();
    await nursePage.getByRole("button", { name: /Assign to me/ }).click();
    nursePage.once("dialog", (dialog) =>
      dialog.accept("Clinical clarification requested.")
    );
    await nursePage.getByRole("button", { name: /Escalate to doctor/ }).click();

    await doctorPage.goto(BASE + "/doctor/escalations");
    await doctorPage.getByText("CareQuest handoff queue", { exact: true }).waitFor();
    doctorPage.once("dialog", (dialog) =>
      dialog.accept("Reviewed; continue with the approved plan.")
    );
    await doctorPage.getByRole("button", { name: /Resolve with outcome/ }).click();

    console.log("Pixel E2E: real appointment booking award and payment separation");
    await patientPage.goto(BASE + "/patient");
    const doctorCard = patientPage
      .locator("div.group")
      .filter({ hasText: "Dr. Aisha Rahman" })
      .first();
    await doctorCard.getByRole("button", { name: "Book Appointment" }).click();
    await patientPage.getByRole("heading", { name: "Book Appointment" }).waitFor();
    await chooseFutureAvailableDate(patientPage);
    await patientPage.getByRole("button", { name: /^\d{2}:\d{2}$/ }).first().click();
    await patientPage.getByRole("button", { name: "Demo Book — Skip Payment" }).click();
    await patientPage
      .getByText("Appointment Booked!", { exact: true })
      .waitFor({ timeout: 20000 });
    await waitForCapsuleBalance(
      patientData.profile._id,
      program._id,
      8
    );

    const demoPayment = await database.collection("paymentevidences").findOne({
      patient: { $exists: false },
      status: "demo",
    });
    // PaymentEvidence is appointment-scoped and intentionally stores no patient field.
    assert(demoPayment, "demo payment evidence record missing");
    assert.strictEqual(demoPayment.netPaidAmount, 0);

    console.log("Pixel E2E: sync hospital-specific on-chain balance at 8 CITY");
    await syncBlockchainProof(patientPage);

    const chainAccount = await database.collection("blockchainaccounts").findOne({
      patient: patientData.profile._id,
    });
    assert(chainAccount, "blockchain account missing");
    await waitForHospitalChainBalance(
      chainAccount.walletAddress,
      1001,
      8
    );

    console.log("Pixel E2E: funded benefit redemption atomically spends CITY only");
    const benefitCard = patientPage
      .locator("article")
      .filter({ hasText: "Care learning pack" })
      .first();
    await benefitCard
      .getByRole("button", { name: "Redeem funded benefit" })
      .click();
    await patientPage
      .getByText(/Benefit confirmed\./)
      .waitFor({ timeout: 10000 });
    await waitForCapsuleBalance(
      patientData.profile._id,
      program._id,
      0
    );
    assert.strictEqual(
      await capsuleBalance(patientData.profile._id, secondaryProgram._id),
      0
    );

    const redemption = await database.collection("redemptions").findOne({
      patient: patientData.profile._id,
      program: program._id,
      status: "confirmed",
    });
    assert(redemption, "real redemption ledger entry missing");

    await syncBlockchainProof(patientPage);
    await waitForHospitalChainBalance(
      chainAccount.walletAddress,
      1001,
      0
    );
    await waitForHospitalChainBalance(
      chainAccount.walletAddress,
      1002,
      0
    );

    console.log("Pixel E2E: attendance award restores 2 CITY");
    await doctorPage.goto(BASE + "/doctor");
    const statusCombo = doctorPage.getByRole("combobox").first();
    await statusCombo.click();
    await doctorPage.getByRole("option", { name: "Completed" }).click();
    await waitForCapsuleBalance(
      patientData.profile._id,
      program._id,
      2
    );

    await syncBlockchainProof(patientPage);
    await waitForHospitalChainBalance(
      chainAccount.walletAddress,
      1001,
      2
    );

    const secondaryAudit = await insertValidTenantAuditEvent({
      organizationId: secondaryOrg._id,
      programId: secondaryProgram._id,
      eventType: "lotus.private.audit",
    });

    const dailyCounter = await database
      .collection("capsuledailycounters")
      .findOne({
        patient: patientData.profile._id,
        organization: organization._id,
        program: program._id,
      });
    assert(dailyCounter, "daily Capsule counter missing");
    assert.strictEqual(
      Number(dailyCounter.awarded),
      10,
      "demo journey should consume exactly 10 of the 12 daily CITY award slots"
    );
    assert(
      Number(dailyCounter.awarded) <= Number(program.rules.dailyAwardCap),
      "hospital daily Capsule cap was exceeded"
    );

    console.log("Pixel E2E: admin keeps finance, rewards, simulation and identity separate");
    await signInDemo(adminPage, "hospital_admin");
    await adminPage
      .getByText("CareQuest service improvement", { exact: true })
      .waitFor();
    assert.strictEqual(
      await adminPage.getByText("Demo Patient", { exact: true }).count(),
      0,
      "aggregate admin dashboard exposed patient identity"
    );
    await adminPage.getByText("RECORDED FINANCE", { exact: true }).waitFor();
    await adminPage.getByText("FUTURE COMPUTE MODEL", { exact: true }).waitFor();
    await adminPage.getByText("SIMULATED pilot economics", { exact: true }).waitFor();
    assert.strictEqual(
      await adminPage.getByText("Lotus Path", { exact: true }).count(),
      0,
      "Hospital A admin saw Hospital B program"
    );

    console.log("Pixel E2E: audit hash chain remains valid");
    await adminPage.goto(BASE + "/admin/carequest/audit");
    await adminPage
      .getByText("CareQuest audit & integrity", { exact: true })
      .waitFor();
    await adminPage.getByText("VALID", { exact: true }).waitFor();
    assert.strictEqual(
      await adminPage.getByText(secondaryAudit.eventType, { exact: true }).count(),
      0,
      "Hospital A audit view exposed Hospital B provenance"
    );

    console.log("CAREQUEST PIXEL UI E2E PASS");
  } finally {
    for (const ctx of contexts) {
      try { await ctx.close(); } catch {}
    }
    try { if (browser) await browser.close(); } catch {}
    try { await mongoose.disconnect(); } catch {}

    if (server) {
      server.kill("SIGTERM");
      await new Promise((resolve) => setTimeout(resolve, 300));
      if (!server.killed) server.kill("SIGKILL");
    }
    if (bridgeProcess) bridgeProcess.kill("SIGTERM");
  }
}

main().catch((error) => {
  console.error("CAREQUEST PIXEL UI E2E FAIL");
  console.error(error);
  process.exit(1);
});
