import connectDB from "@/lib/db";
import Doctor from "@/models/Doctor";
import CareQuestMembership from "@/models/CareQuestMembership";

function normalize(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(value) {
  return new Set(
    normalize(value)
      .split(" ")
      .filter((token) => token.length >= 3)
  );
}

function trigrams(value) {
  const normalized = "^" + normalize(value).replace(/\s+/g, "_") + "$";
  const grams = new Set();
  for (let index = 0; index < normalized.length - 2; index += 1) {
    grams.add(normalized.slice(index, index + 3));
  }
  return grams;
}

function similarity(a, b) {
  const left = trigrams(a);
  const right = trigrams(b);
  if (!left.size || !right.size) return 0;

  let intersection = 0;
  for (const gram of left) {
    if (right.has(gram)) intersection += 1;
  }

  return (2 * intersection) / (left.size + right.size);
}

function doctorSearchText(doctor) {
  return normalize(
    [
      doctor.name,
      doctor.specialization,
      doctor.category,
      ...(doctor.qualifications || []),
    ].join(" ")
  );
}

function serializeDoctor(doctor) {
  return {
    doctor_id: doctor._id.toString(),
    _id: doctor._id.toString(),
    name: doctor.name,
    specialization: doctor.specialization,
    category: doctor.category,
    phone: doctor.phone || "",
    experience: Number(doctor.experience || 0),
    consultationFee: Number(doctor.consultationFee || 0),
    qualifications: doctor.qualifications || [],
    availability: doctor.availability || [],
  };
}

async function activeDoctorUserIds(organizationId) {
  if (!organizationId) return null;

  const memberships = await CareQuestMembership.find({
    organization: organizationId,
    role: "doctor",
    active: true,
  })
    .select("user")
    .lean();

  return memberships.map((membership) => String(membership.user));
}

async function bookableDoctorQuery(organizationId = null) {
  const query = {
    status: "approved",
    consultationFee: { $gt: 0 },
    availability: {
      $elemMatch: {
        slots: { $exists: true, $ne: [] },
      },
    },
  };

  const authorizedUserIds = await activeDoctorUserIds(organizationId);
  if (authorizedUserIds) {
    if (!authorizedUserIds.length) return null;
    query.userId = { $in: authorizedUserIds };
  }

  return query;
}

export async function getApprovedDoctorDirectory({
  organizationId = null,
} = {}) {
  await connectDB();

  const query = await bookableDoctorQuery(organizationId);
  if (!query) return [];

  const doctors = await Doctor.find(query)
    .sort({ category: 1, experience: -1, name: 1 })
    .lean();

  return doctors.map(serializeDoctor);
}

export async function getBookableDoctorById({
  doctorId,
  organizationId = null,
}) {
  await connectDB();

  const id = String(doctorId || "");
  if (!/^[0-9a-fA-F]{24}$/.test(id)) return null;

  const query = await bookableDoctorQuery(organizationId);
  if (!query) return null;

  const doctor = await Doctor.findOne({
    ...query,
    _id: id,
  }).lean();

  return doctor || null;
}

export async function findApprovedDoctorsForAI({
  prompt = "",
  recommendedSpecialty = "",
  detectedConditions = [],
  organizationId = null,
  limit = 3,
} = {}) {
  await connectDB();

  const query = await bookableDoctorQuery(organizationId);
  if (!query) return [];

  const doctors = await Doctor.find(query)
    .sort({ experience: -1, name: 1 })
    .lean();

  const specialtyTokens = tokens(recommendedSpecialty);
  const contextTokens = tokens(
    [prompt, ...(detectedConditions || [])].join(" ")
  );

  const ranked = doctors.map((doctor) => {
    const searchable = doctorSearchText(doctor);
    let score = 0;

    for (const token of specialtyTokens) {
      if (searchable.includes(token)) score += 8;
    }
    for (const token of contextTokens) {
      if (searchable.includes(token)) score += 1;
    }

    const normalizedSpecialization = normalize(doctor.specialization);
    const normalizedCategory = normalize(doctor.category);
    const normalizedTarget = normalize(recommendedSpecialty);

    if (
      normalizedTarget &&
      (normalizedSpecialization.includes(normalizedTarget) ||
        normalizedTarget.includes(normalizedSpecialization))
    ) {
      score += 12;
    }

    if (
      normalizedTarget &&
      (normalizedCategory.includes(normalizedTarget) ||
        normalizedTarget.includes(normalizedCategory))
    ) {
      score += 10;
    }

    // Fuzzy matching uses only the live specialty/category text stored on
    // approved database doctors. No static doctor or specialty catalogue is
    // consulted.
    const fuzzySpecialization = similarity(
      recommendedSpecialty,
      doctor.specialization
    );
    const fuzzyCategory = similarity(recommendedSpecialty, doctor.category);

    if (fuzzySpecialization >= 0.45) {
      score += Math.round(fuzzySpecialization * 10);
    }
    if (fuzzyCategory >= 0.45) {
      score += Math.round(fuzzyCategory * 8);
    }

    return { doctor, score };
  });

  ranked.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const experienceDelta =
      Number(b.doctor.experience || 0) - Number(a.doctor.experience || 0);
    if (experienceDelta !== 0) return experienceDelta;
    return String(a.doctor.name).localeCompare(String(b.doctor.name));
  });

  // Category gate. When the AI's specialty maps cleanly onto exactly one live
  // doctor category (e.g. "throat pain" -> ENT), return only that category's
  // doctors. This is what stops unrelated specialties from being mixed into
  // the recommendation. We only widen the net if the dominant category has no
  // bookable doctors.
  const target = normalize(recommendedSpecialty);
  let dominantCategory = null;
  let dominantAffinity = 0;
  const categoryAffinity = new Map();

  for (const doctor of doctors) {
    const cat = normalize(doctor.category);
    if (!cat) continue;
    let affinity = similarity(recommendedSpecialty, doctor.category) * 10;
    if (target && (cat === target || cat.includes(target) || target.includes(cat))) {
      affinity += 8;
    }
    // An exact specialty-name match is an even stronger signal.
    const spec = normalize(doctor.specialization);
    if (target && (spec === target || spec.includes(target) || target.includes(spec))) {
      affinity += 6;
    }
    categoryAffinity.set(cat, Math.max(categoryAffinity.get(cat) || 0, affinity));
  }

  for (const [cat, affinity] of categoryAffinity) {
    if (affinity > dominantAffinity) {
      dominantAffinity = affinity;
      dominantCategory = cat;
    }
  }

  let pool = ranked;
  const DOMINANT_THRESHOLD = 8; // a clear single-category match
  if (dominantCategory && dominantAffinity >= DOMINANT_THRESHOLD) {
    const inDominant = ranked.filter(
      ({ doctor }) => normalize(doctor.category) === dominantCategory
    );
    if (inDominant.length) pool = inDominant;
  }

  const positive = pool.filter((entry) => entry.score > 0);

  // Never fill recommendation cards with unrelated clinicians. If the AI's
  // specialty intent does not match an active bookable doctor in the live
  // hospital directory, return no doctor rather than inventing one.
  return positive.slice(0, limit).map(({ doctor }) => serializeDoctor(doctor));
}
