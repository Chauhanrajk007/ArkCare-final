const fs = require("fs");
const path = require("path");
const assert = require("assert");
const mongoose = require("mongoose");
const Razorpay = require("razorpay");
const { chromium } = require("playwright");

const ROOT = path.resolve(__dirname, "../..");
const BASE = process.env.E2E_BASE_URL || "http://localhost:13000";
const PDF_FIXTURE = path.join(__dirname, "fixture-report.pdf");
const PNG_FIXTURE = path.join(__dirname, "fixture-image.png");

function loadEnv(file) {
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
    if (process.env[key] === undefined) process.env[key] = value;
  }
}
loadEnv(path.join(ROOT, "arkcare.env"));

const results = [];
async function check(name, fn) {
  const started = Date.now();
  try {
    await fn();
    results.push({ name, ok: true, ms: Date.now() - started });
    console.log(`PASS :: ${name}`);
    return true;
  } catch (error) {
    results.push({ name, ok: false, ms: Date.now() - started, error: String(error?.stack || error) });
    console.error(`FAIL :: ${name}\n${error?.stack || error}`);
    return false;
  }
}

async function db() {
  if (mongoose.connection.readyState !== 1) {
    await mongoose.connect(process.env.MONGODB_URI);
  }
  return mongoose.connection.db;
}

async function profileIdsForEmail(email) {
  const database = await db();
  const user = await database.collection("users").findOne({ email });
  if (!user) return {};
  const userId = user._id.toString();
  const [patient, doctor] = await Promise.all([
    database.collection("patients").findOne({ userId }),
    database.collection("doctors").findOne({ userId }),
  ]);
  return { user, patient, doctor };
}

async function deleteRelatedAppointments({ patient, doctor }) {
  const database = await db();
  const clauses = [];
  if (patient?._id) clauses.push({ patient: patient._id });
  if (doctor?._id) clauses.push({ doctor: doctor._id });
  if (!clauses.length) return;

  const appointments = await database
    .collection("appointments")
    .find({ $or: clauses })
    .project({ _id: 1 })
    .toArray();

  const appointmentIds = appointments.map((x) => x._id);
  if (appointmentIds.length) {
    const chats = await database
      .collection("chats")
      .find({ appointmentId: { $in: appointmentIds } })
      .project({ _id: 1 })
      .toArray();
    const chatIds = chats.map((x) => x._id);
    if (chatIds.length) {
      await database.collection("messages").deleteMany({ chatId: { $in: chatIds } });
      await database.collection("chats").deleteMany({ _id: { $in: chatIds } });
    }
    await Promise.all([
      database
        .collection("paymentevidences")
        .deleteMany({ appointment: { $in: appointmentIds } }),
      database
        .collection("bookingpayments")
        .deleteMany({ appointment: { $in: appointmentIds } }),
    ]);
    await database.collection("appointments").deleteMany({ _id: { $in: appointmentIds } });
  }
}

async function cleanupUser(email) {
  const database = await db();
  const ids = await profileIdsForEmail(email);
  if (!ids.user) return;
  await deleteRelatedAppointments(ids);
  await database.collection("patients").deleteMany({ userId: ids.user._id.toString() });
  await database.collection("doctors").deleteMany({ userId: ids.user._id.toString() });
  await database.collection("users").deleteOne({ _id: ids.user._id });
}

async function resetDemoData() {
  const database = await db();
  const patientIds = await profileIdsForEmail("demo.patient@arkcare.local");
  const doctorIds = await profileIdsForEmail("demo.doctor@arkcare.local");
  await deleteRelatedAppointments({
    patient: patientIds.patient,
    doctor: doctorIds.doctor,
  });
  if (patientIds.patient?._id) {
    await database.collection("patients").updateOne(
      { _id: patientIds.patient._id },
      { $unset: { patientDescription: "", lab_json: "" } }
    );
  }
}

async function deleteDemoGeneratedReports() {
  const ids = await profileIdsForEmail("demo.patient@arkcare.local");
  if (!ids.patient?.lab_json) return;
}

async function signInDemo(page, role) {
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  const buttonName = role === "patient" ? "Demo Patient" : "Demo Doctor";
  await page.getByRole("button", { name: buttonName }).click();
  await page.waitForURL(role === "patient" ? /\/patient/ : /\/doctor/, {
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
      return raw;
    }
  }
  throw new Error("No future enabled booking date found");
}

async function waitForMongo(find, timeoutMs = 15000) {
  const started = Date.now();
  let value = null;
  while (Date.now() - started < timeoutMs) {
    value = await find();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return value;
}


async function waitForRemoteConnected(page, mode) {
  await page
    .getByText(mode === "audio" ? "Voice consultation" : "Video consultation", { exact: true })
    .first()
    .waitFor({ timeout: 30000 });
  if (mode === "audio") {
    await page.getByText("Participant connected", { exact: true }).waitFor({ timeout: 45000 });
  } else {
    await page.getByText("Connected", { exact: true }).waitFor({ timeout: 45000 });
  }
}

async function main() {
  const runId = Date.now();
  const patientEmail = `arkcare.e2e.patient.${runId}@example.com`;
  const doctorEmail = `arkcare.e2e.doctor.${runId}@example.com`;
  const password = "ArkCareTest!2026";

  assert(fs.existsSync(PDF_FIXTURE), "fixture-report.pdf missing");
  assert(fs.existsSync(PNG_FIXTURE), "fixture-image.png missing");

  await db();

  const launchOptions = {
    headless: true,
    args: [
      "--use-fake-ui-for-media-stream",
      "--use-fake-device-for-media-stream",
      "--autoplay-policy=no-user-gesture-required",
      "--no-sandbox",
    ],
  };
  if (process.env.CHROMIUM_PATH) launchOptions.executablePath = process.env.CHROMIUM_PATH;

  const browser = await chromium.launch(launchOptions);

  let patientContext;
  let doctorContext;
  let patientPage;
  let doctorPage;

  try {
    await check("Guest page/API guards", async () => {
      const ctx = await browser.newContext();
      const page = await ctx.newPage();
      await page.goto(`${BASE}/patient`);
      await page.waitForURL(/\/sign-in/, { timeout: 15000 });
      const chat = await ctx.request.post(`${BASE}/api/chat`, { data: { prompt: "hello", thread_id: "guest" } });
      assert.strictEqual(chat.status(), 401);

      const pdf = await ctx.request.post(`${BASE}/api/pdf-processor`, { multipart: {} });
      assert.strictEqual(pdf.status(), 401);

      const agora = await ctx.request.post(`${BASE}/api/generate-agora-token`, {
        data: { channelName: "guest-channel", chatId: "000000000000000000000000" },
      });
      assert.strictEqual(agora.status(), 401);

      const signal = await ctx.request.post(`${BASE}/api/send-pusher-event`, {
        data: { channel: "private-chat-000000000000000000000000", event: "call-ended", data: {} },
      });
      assert.strictEqual(signal.status(), 401);

      const healthInsights = await ctx.request.post(`${BASE}/api/generate-health-insights`, {
        data: { health_score: 50, questionnaire_data: { responses: {}, categories: {} } },
      });
      assert.strictEqual(healthInsights.status(), 401);

      const pusherAuth = await ctx.request.post(`${BASE}/api/pusher/auth`, {
        form: {
          socket_id: "1.1",
          channel_name: "private-chat-000000000000000000000000",
        },
      });
      assert.strictEqual(pusherAuth.status(), 401);

      const upload = await ctx.request.post(`${BASE}/api/upload-image`, {
        multipart: {
          chatId: "000000000000000000000000",
        },
      });
      assert.strictEqual(upload.status(), 401);

      await ctx.close();
    });

    await check("Normal patient signup, logout, login, role assignment", async () => {
      const ctx = await browser.newContext();
      let response = await ctx.request.post(`${BASE}/api/auth/signup`, {
        data: { name: "E2E Patient", email: patientEmail, password, gender: "other" },
      });
      assert.strictEqual(response.status(), 201);
      response = await ctx.request.post(`${BASE}/api/auth/logout`);
      assert.ok(response.ok());
      response = await ctx.request.post(`${BASE}/api/auth/login`, {
        data: { email: patientEmail, password },
      });
      assert.ok(response.ok());
      const me = await (await ctx.request.get(`${BASE}/api/auth/me`)).json();
      assert.strictEqual(me.user.primaryEmailAddress.emailAddress, patientEmail);

      const page = await ctx.newPage();
      await page.goto(BASE);
      await page.getByRole("button", { name: /Patient path/i }).click();
      await page.waitForURL(/\/patient/, { timeout: 20000 });
      await page.getByText("Your care command center", { exact: true }).waitFor();
      await ctx.close();
      await cleanupUser(patientEmail);
    });

    await check("Normal doctor signup and onboarding", async () => {
      const ctx = await browser.newContext();
      let response = await ctx.request.post(`${BASE}/api/auth/signup`, {
        data: { name: "Dr E2E Tester", email: doctorEmail, password, gender: "other" },
      });
      assert.strictEqual(response.status(), 201);
      const page = await ctx.newPage();
      await page.goto(BASE);
      await page.getByRole("button", { name: /Doctor path/i }).click();
      await page.waitForURL(/\/doctor\/onboarding/, { timeout: 20000 });
      await page.getByLabel("Phone Number *").fill("9999999998");
      await page.getByLabel("Specialization *").fill("General Medicine");
      await page.getByRole("combobox").click();
      await page.getByRole("option", { name: "General Medicine" }).click();
      await page.getByLabel("Years of Experience *").fill("5");
      await page.getByLabel("Consultation Fee (₹) *").fill("500");
      await page.getByLabel("Qualifications *").fill("MBBS, MD");
      await page.getByLabel("Monday").click();
      await page.getByRole("button", { name: "09:00", exact: true }).click();
      await page.getByRole("button", { name: "Submit for Review" }).click();
      await page.waitForURL(/\/doctor$/, { timeout: 30000 });
      await page.getByText("Doctor workspace", { exact: true }).waitFor();
      await ctx.close();
      await cleanupUser(doctorEmail);
    });

    patientContext = await browser.newContext({
      permissions: ["microphone", "camera"],
      baseURL: BASE,
    });
    doctorContext = await browser.newContext({
      permissions: ["microphone", "camera"],
      baseURL: BASE,
    });
    patientPage = await patientContext.newPage();
    doctorPage = await doctorContext.newPage();

    await check("Demo patient and doctor seed/sign-in", async () => {
      await signInDemo(patientPage, "patient");
      await signInDemo(doctorPage, "doctor");
      const [p, d] = await Promise.all([
        profileIdsForEmail("demo.patient@arkcare.local"),
        profileIdsForEmail("demo.doctor@arkcare.local"),
      ]);
      assert(p.patient, "demo patient profile missing");
      assert(d.doctor, "demo doctor profile missing");
      assert.strictEqual(d.doctor.status, "approved");
    });

    await resetDemoData();
    await Promise.all([patientPage.reload(), doctorPage.reload()]);

    await check("Role guards for authenticated users", async () => {
      await patientPage.goto(`${BASE}/doctor`);
      await patientPage.waitForURL(/\/patient/, { timeout: 15000 });
      await doctorPage.goto(`${BASE}/patient`);
      await doctorPage.waitForURL(/\/doctor/, { timeout: 15000 });
    });

    await check("Demo appointment booking and atomic persistence", async () => {
      await patientPage.goto(`${BASE}/patient`);
      const doctorCard = patientPage.locator("div.group").filter({ hasText: "Dr. Aisha Rahman" }).first();
      await doctorCard.getByRole("button", { name: "Book Appointment" }).click();
      await patientPage.getByRole("heading", { name: "Book Appointment" }).waitFor();
      await chooseFutureAvailableDate(patientPage);
      await patientPage.getByRole("button", { name: /^\d{2}:\d{2}$/ }).first().click();
      await patientPage.getByRole("button", { name: "Demo Book — Skip Payment" }).click();
      await patientPage.getByText("Appointment Booked!", { exact: true }).waitFor({ timeout: 20000 });
      await patientPage.getByRole("button", { name: "View My Appointments" }).click();
      await patientPage.getByRole("button", { name: "Chat with Doctor" }).waitFor({ timeout: 15000 });

      const idsP = await profileIdsForEmail("demo.patient@arkcare.local");
      const idsD = await profileIdsForEmail("demo.doctor@arkcare.local");
      const database = await db();
      const appointments = await database.collection("appointments").find({
        patient: idsP.patient._id,
        doctor: idsD.doctor._id,
        status: "confirmed",
      }).toArray();
      assert.strictEqual(appointments.length, 1);
      assert(appointments[0].slotKey, "active appointment has no slotKey");
      assert.strictEqual(appointments[0].amount, 0);
    });

    await check("Doctor sees booked appointment", async () => {
      await doctorPage.goto(`${BASE}/doctor`);
      await doctorPage.getByRole("button", { name: "Chat", exact: true }).waitFor({ timeout: 15000 });
      await doctorPage.getByText("Demo Patient", { exact: true }).waitFor();
    });

    await check("Realtime private chat via Pusher", async () => {
      await patientPage.getByRole("button", { name: "Chat with Doctor" }).click();
      await doctorPage.getByRole("button", { name: "Chat", exact: true }).click();
      await patientPage.getByPlaceholder("Type your message...").waitFor();
      await doctorPage.getByPlaceholder("Type your message...").waitFor();
      await patientPage.getByText("Secure realtime connected", { exact: false }).waitFor({ timeout: 20000 });
      await doctorPage.getByText("Secure realtime connected", { exact: false }).waitFor({ timeout: 20000 });

      const message = `E2E realtime message ${runId}`;
      await patientPage.getByPlaceholder("Type your message...").fill(message);
      await patientPage.getByPlaceholder("Type your message...").press("Enter");
      await doctorPage.getByText(message, { exact: true }).waitFor({ timeout: 20000 });
    });

    await check("Cloudinary image upload + realtime delivery", async () => {
      const input = patientPage.locator('input[type="file"][accept="image/*"]');
      await input.setInputFiles(PNG_FIXTURE);
      await patientPage.getByRole("button", { name: "Send Image" }).click();
      await doctorPage.locator('img[alt="Uploaded image"]').last().waitFor({ timeout: 30000 });
    });

    await check("Agora audio call end-to-end", async () => {
      const patientChat = patientPage.locator('[role="dialog"]').filter({ hasText: "Chat with" }).first();
      await patientChat.getByRole("button", { name: "Start audio call" }).click();
      await doctorPage.getByText("Incoming audio call", { exact: true }).waitFor({ timeout: 20000 });
      await doctorPage.getByRole("button", { name: "Accept" }).click();

      await Promise.all([
        waitForRemoteConnected(patientPage, "audio", "patient"),
        waitForRemoteConnected(doctorPage, "audio", "doctor"),
      ]);

      await patientPage.getByRole("button", { name: "Mute microphone" }).click();
      await patientPage.getByRole("button", { name: "Unmute microphone" }).click();
      await patientPage.getByRole("button", { name: "End call" }).click();
      await patientPage.getByPlaceholder("Type your message...").waitFor({ timeout: 20000 });
      await doctorPage.getByPlaceholder("Type your message...").waitFor({ timeout: 20000 });

      const nextVideoButton = patientPage.getByRole("button", { name: "Start video call" });
      await nextVideoButton.waitFor({ state: "visible", timeout: 10000 });
      assert.strictEqual(
        await nextVideoButton.isEnabled(),
        true,
        "Patient call state did not return to idle after audio call"
      );
    });

    await check("Agora video call end-to-end", async () => {
      const patientChat = patientPage.locator('[role="dialog"]').filter({ hasText: "Chat with" }).first();
      await patientChat.getByRole("button", { name: "Start video call" }).click();
      await doctorPage.getByText("Incoming video call", { exact: true }).waitFor({ timeout: 20000 });
      await doctorPage.getByRole("button", { name: "Accept" }).click();

      await Promise.all([
        waitForRemoteConnected(patientPage, "video", "patient"),
        waitForRemoteConnected(doctorPage, "video", "doctor"),
      ]);

      await patientPage.waitForFunction(() => document.querySelectorAll("video").length >= 2, null, { timeout: 45000 });
      await doctorPage.waitForFunction(() => document.querySelectorAll("video").length >= 2, null, { timeout: 45000 });

      await patientPage.getByRole("button", { name: "Turn camera off" }).click();
      await patientPage.getByRole("button", { name: "Turn camera on" }).click();
      await patientPage.getByRole("button", { name: "End call" }).click();
      await patientPage.getByPlaceholder("Type your message...").waitFor({ timeout: 20000 });
    });

    await check("Health questionnaire + score + Groq insights", async () => {
      await patientPage.goto(`${BASE}/health`);
      await patientPage.getByRole("button", { name: "Take Health Assessment", exact: true }).click();

      for (let i = 0; i < 10; i++) {
        const radio = patientPage.locator('[role="radio"]').first();
        await radio.waitFor({ state: "visible", timeout: 10000 });
        await radio.click();
        await patientPage.waitForTimeout(350);
      }

      const scoreButton = patientPage.getByRole("button", { name: "Get My Score" });
      await scoreButton.click();
      await patientPage.getByRole("button", { name: "Retake Assessment" }).waitFor({ timeout: 60000 });
      await patientPage.getByText("AI Health Insights", { exact: true }).waitFor();

      const ids = await profileIdsForEmail("demo.patient@arkcare.local");
      const database = await db();
      const persistedPatient = await database.collection("patients").findOne({ _id: ids.patient._id });
      const persistedHealth = JSON.parse(persistedPatient.patientDescription);

      const insightResponse = await patientContext.request.post(
        `${BASE}/api/generate-health-insights`,
        {
          data: {
            health_score: persistedHealth.combined_health_score,
            questionnaire_data: persistedHealth.questionnaire_data,
          },
        }
      );
      const insightText = await insightResponse.text();
      assert.strictEqual(
        insightResponse.status(),
        200,
        `Health insights API failed: ${insightResponse.status()} ${insightText}`
      );
      const insightPayload = JSON.parse(insightText);
      assert(
        typeof insightPayload?.insights?.overall_assessment === "string" &&
          insightPayload.insights.overall_assessment.trim(),
        `Health insights response missing assessment: ${insightText}`
      );

      await patientPage.getByText("Overall Assessment", { exact: true }).waitFor({ timeout: 90000 });
    });

    await check("PDF report upload, AI parsing, persistence, authorized download", async () => {
      await patientPage.goto(`${BASE}/reports`);
      await patientPage.locator("#pdf-input").setInputFiles(PDF_FIXTURE);
      await patientPage.getByRole("button", { name: /Upload & Process 1 PDFs/ }).click();
      await patientPage.getByText("Processing Complete", { exact: true }).waitFor({ timeout: 120000 });

      const ids = await profileIdsForEmail("demo.patient@arkcare.local");
      const database = await db();
      const patient = await database.collection("patients").findOne({ _id: ids.patient._id });
      assert(patient.lab_json, "lab_json was not persisted");
      const lab = JSON.parse(patient.lab_json);
      assert(lab.pdf_download_url, "processed report download path missing");
      assert(typeof JSON.parse(patient.patientDescription).lab_summary === "string");

      const download = await patientContext.request.get(
        `${BASE}/api/report-download?path=${encodeURIComponent(lab.pdf_download_url)}`
      );
      assert.strictEqual(download.status(), 200);
      assert(/application\/pdf/i.test(download.headers()["content-type"] || ""));
      assert((await download.body()).length > 500);

      const doctorDownload = await doctorContext.request.get(
        `${BASE}/api/report-download?path=${encodeURIComponent(lab.pdf_download_url)}`
      );
      assert.strictEqual(doctorDownload.status(), 403);
    });

    await check("AI care navigator: Groq + doctor retrieval + live booking resolution", async () => {
      await patientPage.goto(`${BASE}/chatbot`);
      const prompt = "I have recurring palpitations and occasional shortness of breath. Which specialist should I consult?";
      const input = patientPage.getByPlaceholder("Describe your symptoms or ask a health question...");
      await input.fill(prompt);
      await input.press("Enter");
      await patientPage.getByText("AI Assistant", { exact: true }).last().waitFor({ timeout: 120000 });
      await patientPage.getByText("Recommended Specialists", { exact: true }).waitFor({ timeout: 120000 });
      await patientPage.getByText("LIVE DATABASE", { exact: true }).waitFor({ timeout: 15000 });
      assert.strictEqual(await patientPage.getByText(/trouble connecting to the AI service/i).count(), 0);

      const liveDoctorCard = patientPage.locator("[data-doctor-id]").first();
      const liveDoctorId = await liveDoctorCard.getAttribute("data-doctor-id");
      assert(/^[0-9a-fA-F]{24}$/.test(liveDoctorId || ""), "AI specialist is missing a MongoDB doctor id");
      const liveDoctor = await (await db()).collection("doctors").findOne({
        _id: new mongoose.Types.ObjectId(liveDoctorId),
        status: "approved",
      });
      assert(liveDoctor, "AI specialist id does not resolve to an approved MongoDB doctor");
      assert(
        Number(liveDoctor.consultationFee) > 0,
        "AI specialist must have a live payable consultation fee"
      );
      assert(
        Array.isArray(liveDoctor.availability) &&
          liveDoctor.availability.some(
            (entry) => Array.isArray(entry.slots) && entry.slots.length > 0
          ),
        "AI specialist must have bookable live availability"
      );
      const renderedDoctorName = (await liveDoctorCard.locator("h4").textContent())?.trim();
      assert.strictEqual(renderedDoctorName, liveDoctor.name);

      const demoPatient = await profileIdsForEmail("demo.patient@arkcare.local");
      assert(demoPatient.patient, "Demo patient profile missing");
      const primaryOrganization = await (await db())
        .collection("organizations")
        .findOne({ slug: "arkcare-demo-hospital" });
      assert(primaryOrganization, "Primary demo hospital missing");

      const patientMembership = await (await db())
        .collection("patientmemberships")
        .findOne({
          patient: demoPatient.patient._id,
          organization: primaryOrganization._id,
          status: "active",
        });
      assert(patientMembership, "Patient primary-hospital membership missing");

      const doctorMembership = await (await db())
        .collection("carequestmemberships")
        .findOne({
          user: new mongoose.Types.ObjectId(String(liveDoctor.userId)),
          organization: primaryOrganization._id,
          role: "doctor",
          active: true,
        });
      assert(
        doctorMembership,
        "AI specialist is not active staff in the patient hospital"
      );

      await liveDoctorCard.getByRole("button", { name: "Book Now" }).click();
      await patientPage
        .getByRole("heading", { name: "Book Appointment" })
        .waitFor({ timeout: 15000 });

      await chooseFutureAvailableDate(patientPage);
      await patientPage
        .getByText(/Live · Asia\/Kolkata/)
        .waitFor({ timeout: 15000 });

      const liveSlot = patientPage
        .getByRole("button", { name: /^\d{2}:\d{2}$/ })
        .first();
      await liveSlot.waitFor({ state: "visible", timeout: 15000 });
      await liveSlot.click();

      assert(
        String(process.env.RAZORPAY_KEY_ID || "").startsWith("rzp_test_"),
        "Full E2E must use Razorpay test keys; refusing to open live Checkout"
      );

      const payButton = patientPage.getByRole("button", {
        name: /Pay ₹.*& Book/,
      });
      await payButton.waitFor({ state: "visible", timeout: 15000 });
      await payButton.click();

      await patientPage
        .locator(
          'iframe[name="razorpay-checkout-frame"], .razorpay-container iframe'
        )
        .first()
        .waitFor({ state: "attached", timeout: 30000 });

      const booking = await waitForMongo(async () =>
        (await db())
          .collection("bookingpayments")
          .findOne(
            {
              patient: demoPatient.patient._id,
              doctor: liveDoctor._id,
              status: "created",
            },
            { sort: { createdAt: -1 } }
          )
      );
      assert(booking, "ArkCare did not persist a Razorpay booking order");
      assert.strictEqual(
        Number(booking.amountPaise),
        Math.round(Number(liveDoctor.consultationFee) * 100)
      );

      const heldAppointment = await (await db())
        .collection("appointments")
        .findOne({ _id: booking.appointment });
      assert(heldAppointment, "Razorpay booking slot hold is missing");
      assert.strictEqual(heldAppointment.status, "pending");
      assert(heldAppointment.slotKey, "Pending booking must reserve a slot key");
      assert(
        new Date(heldAppointment.holdExpiresAt) > new Date(),
        "Pending booking hold must have a future expiry"
      );

      const razorpay = new Razorpay({
        key_id: process.env.RAZORPAY_KEY_ID,
        key_secret: process.env.RAZORPAY_KEY_SECRET,
      });
      const gatewayOrder = await razorpay.orders.fetch(booking.orderId);
      assert.strictEqual(
        Number(gatewayOrder.amount),
        Number(booking.amountPaise)
      );
      assert.strictEqual(
        String(gatewayOrder.notes?.doctorId || ""),
        String(liveDoctor._id)
      );
      assert.strictEqual(
        String(gatewayOrder.notes?.patientId || ""),
        String(demoPatient.patient._id)
      );

      // Razorpay Checkout is cross-origin. Rather than depend on the
      // provider's current internal close-button DOM, exercise ArkCare's own
      // booking-modal close handler directly. It calls releasePaymentOrder
      // against the authenticated patient and must release the pending hold.
      await patientPage
        .getByRole("button", { name: "Close booking" })
        .evaluate((button) => button.click());

      const released = await waitForMongo(async () =>
        (await db()).collection("bookingpayments").findOne({
          _id: booking._id,
          status: "failed",
          gatewayStatus: "checkout_closed",
        })
      );
      assert(released, "Closing ArkCare booking did not release the Razorpay hold");

      const releasedAppointment = await (await db())
        .collection("appointments")
        .findOne({ _id: booking.appointment });
      assert.strictEqual(
        releasedAppointment,
        null,
        "Released Razorpay hold left a pending appointment behind"
      );

      await patientPage.goto(`${BASE}/patient`, {
        waitUntil: "domcontentloaded",
      });
    });

    await check("Scanner graceful offline mode", async () => {
      await patientPage.goto(`${BASE}/scanner`);
      await patientPage.getByText("Scanner module offline", { exact: true }).waitFor({ timeout: 15000 });
      await patientPage.getByText(/Scanner service is not configured/).waitFor();
    });

    await check("Razorpay test-mode API order creation", async () => {
      assert(
        String(process.env.RAZORPAY_KEY_ID || "").startsWith("rzp_test_"),
        "Full E2E requires Razorpay test keys"
      );
      const razorpay = new Razorpay({
        key_id: process.env.RAZORPAY_KEY_ID,
        key_secret: process.env.RAZORPAY_KEY_SECRET,
      });
      const order = await razorpay.orders.create({
        amount: 100,
        currency: "INR",
        receipt: `arkcare-e2e-${runId}`,
        notes: { source: "arkcare-self-hosted-e2e" },
      });
      assert(order.id && order.id.startsWith("order_"));
      const fetched = await razorpay.orders.fetch(order.id);
      assert.strictEqual(fetched.id, order.id);
      assert.strictEqual(Number(fetched.amount), 100);
    });

    await check("Doctor notes and terminal completion", async () => {
      await doctorPage.goto(`${BASE}/doctor`);
      const notes = doctorPage.getByPlaceholder("Add notes for this appointment...").first();
      await notes.fill(`E2E note ${runId}`);
      await notes.blur();
      await doctorPage.waitForTimeout(1000);

      const combo = doctorPage.getByRole("combobox").first();
      await combo.click();
      await doctorPage.getByRole("option", { name: "Completed" }).click();
      await doctorPage.getByText("completed", { exact: true }).waitFor({ timeout: 15000 });

      const idsP = await profileIdsForEmail("demo.patient@arkcare.local");
      const idsD = await profileIdsForEmail("demo.doctor@arkcare.local");
      const database = await db();
      const appointment = await database.collection("appointments").findOne({
        patient: idsP.patient._id,
        doctor: idsD.doctor._id,
      });
      assert.strictEqual(appointment.status, "completed");
      assert.strictEqual(appointment.slotKey, undefined);
      assert.strictEqual(appointment.notes, `E2E note ${runId}`);
    });
  } finally {
    try { if (patientContext) await patientContext.close(); } catch {}
    try { if (doctorContext) await doctorContext.close(); } catch {}
    try { await cleanupUser(patientEmail); } catch {}
    try { await cleanupUser(doctorEmail); } catch {}
    try { await resetDemoData(); } catch {}
    try { await browser.close(); } catch {}
    try { await mongoose.disconnect(); } catch {}

    fs.writeFileSync(
      path.join(__dirname, "full-e2e-results.json"),
      JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2)
    );
  }

  const failed = results.filter((x) => !x.ok);
  console.log("\n=== ArkCare Full E2E Summary ===");
  for (const result of results) {
    console.log(`${result.ok ? "PASS" : "FAIL"} :: ${result.name} (${result.ms}ms)`);
  }
  if (failed.length) {
    console.error(`\n${failed.length} test group(s) failed.`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
