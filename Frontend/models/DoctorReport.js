import mongoose from "mongoose";

/**
 * An attached clinical document. `ocrText` is the raw machine-extracted text
 * from a scanned prescription. It is stored as evidence of what the machine
 * read, never as the clinician's own words.
 */
const ReportImageSchema = new mongoose.Schema(
  {
    url: { type: String, required: true, trim: true },
    publicId: { type: String, default: "", trim: true },
    kind: {
      type: String,
      enum: ["prescription", "report_scan", "other"],
      default: "prescription",
    },
    fileName: { type: String, default: "", trim: true },
    ocrText: { type: String, default: "" },
    ocrEngine: { type: String, default: "" },
  },
  { _id: false }
);

const ParsedMedicationSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 160 },
    dose: { type: String, default: "", trim: true, maxlength: 80 },
    frequency: { type: String, default: "", trim: true, maxlength: 120 },
    duration: { type: String, default: "", trim: true, maxlength: 120 },
    instructions: { type: String, default: "", trim: true, maxlength: 1000 },
    // The exact clinician/OCR wording this was derived from, so a reviewer can
    // always see what the machine based the structured row on.
    verbatim: { type: String, default: "", trim: true, maxlength: 1000 },
    confidence: { type: Number, default: null, min: 0, max: 1 },
    needsReview: { type: Boolean, default: false },
  },
  { _id: false }
);

const ParsedConditionSchema = new mongoose.Schema(
  {
    label: { type: String, required: true, trim: true, maxlength: 160 },
    verbatim: { type: String, default: "", trim: true, maxlength: 500 },
    categoryIds: [{ type: String, trim: true }],
    confidence: { type: Number, default: null, min: 0, max: 1 },
  },
  { _id: false }
);

const ParsedActivitySchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 160 },
    instructions: { type: String, required: true, trim: true, maxlength: 4000 },
    type: {
      type: String,
      enum: ["lesson", "reminder", "follow_up", "activity"],
      default: "reminder",
    },
    recurrenceKind: {
      type: String,
      enum: ["once", "daily", "weekly", "custom"],
      default: "once",
    },
    timeLocal: { type: String, default: "", trim: true, maxlength: 5 },
    goalValue: { type: Number, default: null, min: 250, max: 50000 },
    safetyText: { type: String, default: "", trim: true, maxlength: 2000 },
  },
  { _id: false }
);

/**
 * A retrieved quiz question. `correctAnswer` is stripped before the question is
 * ever sent to the patient browser and is only used for server-side grading.
 */
const QuizItemSchema = new mongoose.Schema(
  {
    questionId: { type: String, required: true, trim: true },
    question: { type: String, required: true, trim: true, maxlength: 600 },
    options: [{ type: String, trim: true, maxlength: 300 }],
    correctAnswer: { type: String, required: true, trim: true, maxlength: 300 },
    explanation: { type: String, default: "", trim: true, maxlength: 1000 },
    categoryId: { type: String, default: "", trim: true },
    categoryTitle: { type: String, default: "", trim: true },
    source: { type: String, default: "", trim: true },
    score: { type: Number, default: 0 },
  },
  { _id: false }
);

const ParsedSchema = new mongoose.Schema(
  {
    conditions: [ParsedConditionSchema],
    medications: [ParsedMedicationSchema],
    activities: [ParsedActivitySchema],
    remarkSummary: { type: String, default: "", trim: true, maxlength: 4000 },
    patientActivitySummary: { type: String, default: "", trim: true, maxlength: 4000 },
    followUpWindow: { type: String, default: "", trim: true, maxlength: 200 },
    keywords: [{ type: String, trim: true, maxlength: 80 }],
    ai: {
      model: { type: String, default: "" },
      parseMode: {
        type: String,
        enum: ["text", "ocr", "hybrid", "rules_only", "failed"],
        default: "text",
      },
      generatedAt: { type: Date, default: null },
      warnings: [{ type: String, trim: true, maxlength: 400 }],
      needsReview: { type: Boolean, default: false },
    },
  },
  { _id: false }
);

const QuizSchema = new mongoose.Schema(
  {
    items: [QuizItemSchema],
    // Graded result. Written once; there is no path that rewrites it.
    result: {
      submittedAt: { type: Date, default: null },
      answers: [{ type: String, trim: true, maxlength: 300 }],
      correctCount: { type: Number, default: 0 },
      total: { type: Number, default: 0 },
      awardedCapsules: { type: Number, default: 0 },
      capsuleAwardId: { type: String, default: "" },
    },
  },
  { _id: false }
);

const DoctorReportSchema = new mongoose.Schema(
  {
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      default: null,
      index: true,
    },
    program: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "HospitalProgram",
      default: null,
      index: true,
    },
    patient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Patient",
      required: true,
      index: true,
    },
    doctor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Doctor",
      required: true,
      index: true,
    },
    appointment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Appointment",
      required: true,
      index: true,
    },
    visitAt: { type: Date, default: null },

    // Reports are append-only. A correction is a new revision; an existing
    // revision is never edited or deleted, so a doctor cannot withdraw a
    // prescription or remark they already put their name to.
    revision: { type: Number, required: true, min: 1, default: 1 },

    title: { type: String, default: "", trim: true, maxlength: 200 },
    clinicalSummary: { type: String, required: true, trim: true, maxlength: 8000 },
    patientActivity: { type: String, default: "", trim: true, maxlength: 4000 },
    prescriptionText: { type: String, default: "", trim: true, maxlength: 8000 },
    images: [ReportImageSchema],

    parsed: { type: ParsedSchema, default: () => ({}) },
    quiz: { type: QuizSchema, default: () => ({ items: [] }) },

    // sha256 over the canonical clinician-authored content. This is what gets
    // anchored on-chain, so the doctor's own words are what is provable.
    contentHash: { type: String, required: true, trim: true, index: true },

    blockchain: {
      status: {
        type: String,
        enum: ["disabled", "pending", "anchored", "failed"],
        default: "pending",
      },
      batchId: { type: String, default: "" },
      merkleRoot: { type: String, default: "" },
      txHash: { type: String, default: "" },
      blockNumber: { type: Number, default: null },
      anchoredAt: { type: Date, default: null },
      error: { type: String, default: "" },
    },

    authoredByUserId: { type: String, required: true, index: true },
    createdByRole: { type: String, enum: ["doctor"], default: "doctor" },
  },
  { timestamps: true }
);

DoctorReportSchema.index({ appointment: 1, revision: -1 });
DoctorReportSchema.index({ organization: 1, patient: 1, createdAt: -1 });
DoctorReportSchema.index({ doctor: 1, createdAt: -1 });
// One content hash per appointment: a replayed submission is rejected rather
// than silently creating a second identical "revision".
DoctorReportSchema.index(
  { appointment: 1, contentHash: 1 },
  { unique: true }
);

export default mongoose.models.DoctorReport ||
  mongoose.model("DoctorReport", DoctorReportSchema);
