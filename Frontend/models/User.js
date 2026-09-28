import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const UserSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    // bcrypt hash — never returned to the client
    passwordHash: { type: String, required: true, select: false },
    // Set by actions/userActions.js once the user picks a role on the landing page
    role: {
      type: String,
      enum: [
        "patient",
        "doctor",
        "nurse",
        "coordinator",
        "hospital_admin",
        "platform_admin", // master/super view across every hospital
        null,
      ],
      default: null,
    },
    // The hospital this staff member belongs to. Staff are scoped to their own
    // organization for data + audit isolation. Left unset for patients (who can
    // belong to several hospitals) and for the platform admin (who sees all).
    homeOrganization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      default: null,
      index: true,
    },
    gender: {
      type: String,
      enum: ["male", "female", "other"],
      default: "other",
    },
    imageUrl: { type: String },
    lastLoginAt: { type: Date },
  },
  { timestamps: true }
);

// Instance method: compare a plaintext candidate against the stored hash.
UserSchema.methods.verifyPassword = function verifyPassword(candidate) {
  return bcrypt.compare(candidate, this.passwordHash);
};

// Instance method: the shape safe to hand to the browser.
UserSchema.methods.toPublic = function toPublic() {
  const [firstName, ...rest] = (this.name || "").trim().split(/\s+/);

  return {
    id: this._id.toString(),
    firstName,
    lastName: rest.join(" ") || null,
    fullName: this.name,
    // Mirrors the shape components already read, so client code needs no rewrites.
    primaryEmailAddress: { emailAddress: this.email },
    imageUrl: this.imageUrl || null,
    publicMetadata: {
      role: this.role ?? null,
      gender: this.gender ?? "other",
    },
  };
};

// Static: register a new user. Throws on duplicate email or weak password.
UserSchema.statics.register = async function register({
  name,
  email,
  password,
  gender,
}) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  const trimmedName = String(name || "").trim();

  if (!trimmedName) throw new Error("Name is required");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    throw new Error("A valid email address is required");
  }
  if (typeof password !== "string" || password.length < 8) {
    throw new Error("Password must be at least 8 characters");
  }

  const existing = await this.findOne({ email: normalizedEmail });
  if (existing) throw new Error("An account with this email already exists");

  const passwordHash = await bcrypt.hash(password, 12);

  return this.create({
    name: trimmedName,
    email: normalizedEmail,
    passwordHash,
    gender: gender || "other",
  });
};

// Static: verify credentials. Returns the user document or null.
UserSchema.statics.authenticate = async function authenticate(email, password) {
  if (!email || !password) return null;

  const user = await this.findOne({
    email: String(email).trim().toLowerCase(),
  }).select("+passwordHash");

  if (!user) return null;

  const ok = await user.verifyPassword(password);
  if (!ok) return null;

  return user;
};

export default mongoose.models.User || mongoose.model("User", UserSchema);
