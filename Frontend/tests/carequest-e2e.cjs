const fs = require("fs");
const path = require("path");
const assert = require("assert");
const { spawn } = require("child_process");
const mongoose = require("mongoose");
const { chromium } = require("playwright");

const ROOT = path.resolve(__dirname, "../..");
const FRONTEND = path.join(ROOT, "Frontend");
const BASE = process.env.CAREQUEST_E2E_BASE_URL || "http://127.0.0.1:13001";

function readEnv(file) {
  const env = {};
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
Object.assign(process.env, Object.fromEntries(
  Object.entries(rootEnv).filter(([key]) => process.env[key] === undefined)
));

async function db() {
  if (mongoose.connection.readyState !== 1) {
    assert(process.env.MONGODB_URI, "MONGODB_URI missing for CareQuest E2E");
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

async function waitForServer() {
  for (let i = 0; i < 90; i++) {
    try {
      const response = await fetch(BASE);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error("CareQuest E2E Next.js server did not start");
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
  throw new Error("No future booking date found");
}

async function clearCareQuest(patient, doctor) {
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
  if (patient?._id) {
    const sessions = await database
      .collection("activitysessions")
      .find({ patient: patient._id })
      .toArray();
    const sessionIds = sessions.map((item) => item._id);
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
  }
  if (patient?.userId) {
    await database.collection("userpreferences").deleteMany({ userId: patient.userId });
  }
  if (patient?._id || doctor?._id) {
    const clauses = [];
    if (patient?._id) clauses.push({ patient: patient._id });
    if (doctor?._id) clauses.push({ doctor: doctor._id });
    if (clauses.length) {
      const appointments = await database
        .collection("appointments")
        .find({ $or: clauses })
        .project({ _id: 1 })
        .toArray();
      const appointmentIds = appointments.map((item) => item._id);
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
    }
  }
}

async function capsuleBalance(patientId) {
  const rows = await (await db())
    .collection("capsuleawards")
    .find({ patient: patientId })
    .toArray();
  return rows.reduce((sum, row) => sum + Number(row.amount || 0), 0);
}
async function waitForCapsuleBalance(patientId, expected, timeoutMs = 15000) {
  const started = Date.now();
  let last = null;
  while (Date.now() - started < timeoutMs) {
    last = await capsuleBalance(patientId);
    if (last === expected) return last;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  assert.strictEqual(last, expected);
}

async function waitForHandoffCount(patientId, expected, timeoutMs = 15000) {
  const started = Date.now();
  let rows = [];
  while (Date.now() - started < timeoutMs) {
    rows = await (await db())
      .collection("handoffcases")
      .find({ patient: patientId })
      .toArray();
    if (rows.length === expected) return rows;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  assert.strictEqual(rows.length, expected);
  return rows;
}

async function main() {
  const serverEnv = {
    ...process.env,
    ...rootEnv,
    NEXT_PUBLIC_APP_URL: BASE,
    AI_CHAT: process.env.AI_CHAT || "http://127.0.0.1:18000/chat",
    AI_PDF: process.env.AI_PDF || "http://127.0.0.1:18000/parse_report",
    CAREQUEST_BLOCKCHAIN_ENABLED: "false",
  };

  const server = spawn(
    process.platform === "win32" ? "npm.cmd" : "npm",
    ["run", "start", "--", "-H", "127.0.0.1", "-p", "13001"],
    {
      cwd: FRONTEND,
      env: serverEnv,
      stdio: ["ignore", "pipe", "pipe"],
    }
  );
  let serverLog = "";
  server.stdout.on("data", (d) => (serverLog += d.toString()));
  server.stderr.on("data", (d) => (serverLog += d.toString()));

  let browser;
  const contexts = [];
  try {
    await waitForServer();
    browser = await chromium.launch({
      headless: true,
      args: ["--no-sandbox"],
    });

    const bootstrap = await browser.newContext();
    contexts.push(bootstrap);
    const bootstrapPage = await bootstrap.newPage();
    await signInDemo(bootstrapPage, "patient");
    await bootstrap.close();
    contexts.pop();

    const bootstrapDoctor = await browser.newContext();
    contexts.push(bootstrapDoctor);
    const bootstrapDoctorPage = await bootstrapDoctor.newPage();
    await signInDemo(bootstrapDoctorPage, "doctor");
    await bootstrapDoctor.close();
    contexts.pop();

    const patientData = await getProfile("demo.patient@arkcare.local", "patients");
    const doctorData = await getProfile("demo.doctor@arkcare.local", "doctors");
    assert(patientData.profile, "demo patient missing");
    assert(doctorData.profile, "demo doctor missing");

    await clearCareQuest(patientData.profile, doctorData.profile);

    const initialAppointment = {
      _id: new mongoose.Types.ObjectId(),
      patient: patientData.profile._id,
      doctor: doctorData.profile._id,
      appointmentDate: new Date(Date.now() - 60 * 60 * 1000),
      reason: "Synthetic CareQuest consultation",
      status: "completed",
      notes: "Synthetic completed consultation for CareQuest E2E",
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

    console.log("CareQuest E2E: create and approve plan");
    await doctorPage.goto(BASE + "/doctor/care-plans");
    await doctorPage.getByText("CareQuest Care Plans", { exact: true }).waitFor();
    const appointmentSelect = doctorPage.locator("select").first();
    const completedOption = appointmentSelect.locator("option").filter({ hasText: "completed" }).first();
    const appointmentValue = await completedOption.getAttribute("value");
    assert(appointmentValue, "completed consultation missing from care-plan picker");
    await appointmentSelect.selectOption(appointmentValue);
    await doctorPage.getByRole("button", { name: "Create private draft" }).click();
    await doctorPage.getByText("Draft created. It is not visible to the patient.", { exact: true }).waitFor();
    await doctorPage.getByRole("button", { name: "Approve", exact: true }).click();
    await doctorPage
      .getByText("Plan approved. The patient can now view this version.", { exact: true })
      .waitFor({ timeout: 20000 });

    const database = await db();
    const plan = await database.collection("careplans").findOne({
      patient: patientData.profile._id,
    });
    assert(plan, "CarePlan not persisted");
    assert.strictEqual(plan.currentApprovedVersion, 1);
    const occurrences = await database.collection("scheduledoccurrences").find({
      carePlan: plan._id,
    }).toArray();
    assert(occurrences.length >= 3, "approved plan did not create missions");

    console.log("CareQuest E2E: lesson, equal response credit, and handoff");
    await patientPage.goto(BASE + "/patient/carequest");
    await patientPage.getByText("Your care missions", { exact: true }).waitFor();
    await patientPage.getByRole("button", { name: /I understand.*2 CAP/ }).click();
    await waitForCapsuleBalance(patientData.profile._id, 2);

    let needHelp = patientPage.getByRole("button", { name: /Need help.*1/ }).first();
    if (!(await needHelp.isVisible().catch(() => false))) {
      for (let i = 0; i < 5; i++) {
        await patientPage
          .getByRole("button", { name: "Make next mission due (demo)" })
          .click();
        await patientPage.waitForTimeout(300);
        needHelp = patientPage.getByRole("button", { name: /Need help.*1/ }).first();
        if (await needHelp.isVisible().catch(() => false)) break;
      }
      await needHelp.waitFor({ state: "visible", timeout: 15000 });
    }
    patientPage.once("dialog", (dialog) =>
      dialog.accept("I need clarification from my care team.")
    );
    await needHelp.click();
    await waitForCapsuleBalance(patientData.profile._id, 3);

    const handoffs = await waitForHandoffCount(
      patientData.profile._id,
      1
    );
    assert.strictEqual(handoffs.length, 1, "Need Help must create exactly one case");

    console.log("CareQuest E2E: nurse ownership, failed contact, shift reassignment, escalation");
    await signInDemo(nursePage, "nurse");
    await nursePage.getByText("CareQuest handoff queue", { exact: true }).waitFor();
    await nursePage.getByText("Demo Patient", { exact: true }).waitFor();
    await nursePage.getByRole("button", { name: "Assign to me" }).click();
    nursePage.once("dialog", (dialog) =>
      dialog.accept("No answer on first synthetic contact attempt.")
    );
    await nursePage.getByRole("button", { name: "Unsuccessful contact" }).click();
    await nursePage.getByRole("button", { name: "Shift reassignment" }).click();
    await nursePage.getByRole("button", { name: "Assign to me" }).click();
    nursePage.once("dialog", (dialog) =>
      dialog.accept("Clinical question requires doctor review.")
    );
    await nursePage.getByRole("button", { name: "Escalate to doctor" }).click();
    await nursePage
      .getByText("ESCALATED", { exact: true })
      .waitFor({ timeout: 15000 });

    console.log("CareQuest E2E: doctor escalation resolution");
    await doctorPage.goto(BASE + "/doctor/escalations");
    await doctorPage.getByText("CareQuest handoff queue", { exact: true }).waitFor();
    await doctorPage.getByText("Demo Patient", { exact: true }).waitFor();
    doctorPage.once("dialog", (dialog) =>
      dialog.accept("Reviewed; continue with clinician-approved plan and follow-up.")
    );
    await doctorPage.getByRole("button", { name: "Resolve with outcome" }).click();

    console.log("CareQuest E2E: real follow-up booking and attendance Capsules");
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
    await patientPage.getByText("Appointment Booked!", { exact: true }).waitFor({ timeout: 20000 });

    await waitForCapsuleBalance(patientData.profile._id, 5);

    await doctorPage.goto(BASE + "/doctor");
    const statusCombo = doctorPage.getByRole("combobox").first();
    await statusCombo.click();
    await doctorPage.getByRole("option", { name: "Completed" }).click();
    await waitForCapsuleBalance(patientData.profile._id, 7);

    console.log("CareQuest E2E: opt-out stops new rewards but not care access");
    await patientPage.goto(BASE + "/patient/carequest");
    await patientPage
      .getByRole("button", { name: "Opt out of gamified CareQuest" })
      .click();
    await patientPage
      .getByRole("button", { name: "Opt back into CareQuest" })
      .waitFor({ timeout: 10000 });

    let doneNoReward = patientPage.getByRole("button", { name: "Done", exact: true }).first();
    if (!(await doneNoReward.isVisible().catch(() => false))) {
      for (let i = 0; i < 5; i++) {
        await patientPage
          .getByRole("button", { name: "Make next mission due (demo)" })
          .click();
        await patientPage.waitForTimeout(300);
        doneNoReward = patientPage
          .getByRole("button", { name: "Done", exact: true })
          .first();
        if (await doneNoReward.isVisible().catch(() => false)) break;
      }
    }
    await doneNoReward.waitFor({ state: "visible", timeout: 15000 });
    await doneNoReward.click();
    await patientPage.waitForTimeout(800);
    assert.strictEqual(
      await capsuleBalance(patientData.profile._id),
      7,
      "Opt-out must prevent additional Capsule awards"
    );

    console.log("CareQuest E2E: notification failure leaves mission visible");
    await patientPage
      .getByRole("button", { name: "Simulate notification failure" })
      .click();
    await patientPage
      .getByText("Synthetic notification failure recorded. Mission remains visible in-app.", {
        exact: true,
      })
      .waitFor({ timeout: 10000 });

    console.log("CareQuest E2E: aggregate admin privacy and audit");
    await signInDemo(adminPage, "hospital_admin");
    await adminPage
      .getByText("CareQuest service improvement", { exact: true })
      .waitFor();
    assert.strictEqual(
      await adminPage.getByText("Demo Patient", { exact: true }).count(),
      0,
      "Aggregate admin dashboard exposed patient identity"
    );
    await adminPage.getByText("SIMULATED pilot economics", { exact: true }).waitFor();
    await adminPage.goto(BASE + "/admin/carequest/audit");
    await adminPage.getByText("CareQuest audit & integrity", { exact: true }).waitFor();
    await adminPage.getByText("VALID", { exact: true }).waitFor();

    const finalCase = await database.collection("handoffcases").findOne({
      patient: patientData.profile._id,
    });
    assert.strictEqual(finalCase.status, "resolved");
    assert(finalCase.outcome, "resolved handoff missing outcome");

    console.log("CAREQUEST E2E PASS");
  } finally {
    for (const ctx of contexts) {
      try { await ctx.close(); } catch {}
    }
    try { if (browser) await browser.close(); } catch {}

    try {
      const patientData = await getProfile("demo.patient@arkcare.local", "patients");
      const doctorData = await getProfile("demo.doctor@arkcare.local", "doctors");
      await clearCareQuest(patientData.profile, doctorData.profile);
    } catch (error) {
      console.error("CareQuest cleanup warning:", error.message);
    }

    try { await mongoose.disconnect(); } catch {}
    server.kill("SIGTERM");
    await new Promise((resolve) => setTimeout(resolve, 500));
    if (!server.killed) server.kill("SIGKILL");
  }
}

main().catch((error) => {
  console.error("CAREQUEST E2E FAIL");
  console.error(error);
  process.exit(1);
});
