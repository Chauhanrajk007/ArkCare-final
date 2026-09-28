import mongoose from "mongoose";

const RecurrenceSchema = new mongoose.Schema(
  {
    kind: {
      type: String,
      enum: ["once", "daily", "weekly", "custom"],
      default: "once",
    },
    timeLocal: {
      type: String,
      trim: true,
      maxlength: 5,
    },
    daysOfWeek: [
      {
        type: Number,
        min: 0,
        max: 6,
      },
    ],
    interval: {
      type: Number,
      min: 1,
      max: 365,
      default: 1,
    },
  },
  { _id: false }
);

const ActivitySchema = new mongoose.Schema(
  {
    activityKey: {
      type: String,
      required: true,
      trim: true,
      maxlength: 80,
    },
    type: {
      type: String,
      enum: ["lesson", "reminder", "follow_up", "activity", "quiz"],
      required: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 160,
    },
    instructions: {
      type: String,
      required: true,
      trim: true,
      maxlength: 4000,
    },
    recurrence: {
      type: RecurrenceSchema,
      default: () => ({ kind: "once", interval: 1 }),
    },
    safetyText: {
      type: String,
      trim: true,
      maxlength: 2000,
    },
    helpText: {
      type: String,
      trim: true,
      maxlength: 2000,
    },
    activityConfig: {
      goalType: {
        type: String,
        enum: ["steps"],
        default: "steps",
      },
      goalValue: {
        type: Number,
        min: 250,
        max: 50000,
        default: 5000,
      },
    },
    // Set when this activity was generated from an uploaded consultation
    // report. Lets the patient dashboard pull the report's RAG quiz without
    // re-deriving which report a mission came from.
    sourceReport: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "DoctorReport",
      default: null,
    },
  },
  { _id: false }
);

const PlanVersionSchema = new mongoose.Schema(
  {
    carePlan: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CarePlan",
      required: true,
      index: true,
    },
    versionNumber: {
      type: Number,
      required: true,
      min: 1,
    },
    status: {
      type: String,
      enum: ["draft", "approved", "rejected", "superseded"],
      default: "draft",
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 160,
    },
    summary: {
      type: String,
      trim: true,
      maxlength: 4000,
      default: "",
    },
    validFrom: {
      type: Date,
      required: true,
    },
    validTo: {
      type: Date,
      default: null,
    },
    timezone: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
      default: "UTC",
    },
    safetyText: {
      type: String,
      trim: true,
      maxlength: 3000,
      default: "",
    },
    helpText: {
      type: String,
      trim: true,
      maxlength: 3000,
      default: "",
    },
    activities: {
      type: [ActivitySchema],
      validate: {
        validator(value) {
          return Array.isArray(value) && value.length > 0 && value.length <= 50;
        },
        message: "A care plan must contain between 1 and 50 activities",
      },
    },
    source: {
      type: {
        type: String,
        enum: ["clinician", "ai_draft", "document_summary"],
        default: "clinician",
      },
      reference: {
        type: String,
        trim: true,
        maxlength: 500,
      },
    },
    createdByUserId: {
      type: String,
      required: true,
      index: true,
    },
    approvedByUserId: {
      type: String,
      default: null,
    },
    approvedAt: {
      type: Date,
      default: null,
    },
    rejectedByUserId: {
      type: String,
      default: null,
    },
    rejectedAt: {
      type: Date,
      default: null,
    },
    rejectionReason: {
      type: String,
      trim: true,
      maxlength: 2000,
      default: "",
    },
  },
  { timestamps: true }
);

PlanVersionSchema.index(
  { carePlan: 1, versionNumber: 1 },
  { unique: true }
);
PlanVersionSchema.index({ carePlan: 1, status: 1, versionNumber: -1 });

export default mongoose.models.PlanVersion ||
  mongoose.model("PlanVersion", PlanVersionSchema);
