export const SUBJECTS = [
  "english",
  "mathematics",
  "commerce",
  "accounting",
  "biology",
  "physics",
  "chemistry",
  "englishlit",
  "government",
  "crk",
  "geography",
  "economics",
  "irk",
  "civiledu",
  "insurance",
  "currentaffairs",
  "history",
];

export const SCHOOL_INTERNAL_SUBJECT_PRESETS = [
  "basicscience",
  "basictech",
  "computerstudies",
  "socialstudies",
  "agricscience",
  "homeeconomics",
  "businessstudies",
  "quantitative",
  "verbal",
  "phe",
  "french",
];

export const EXAM_TYPES = ["utme", "wassce", "neco", "post-utme", "school-internal"];

const SUBJECT_LABELS: Record<string, string> = {
  english: "English Language",
  mathematics: "Mathematics",
  commerce: "Commerce",
  accounting: "Financial Accounting",
  biology: "Biology",
  physics: "Physics",
  chemistry: "Chemistry",
  englishlit: "Literature in English",
  government: "Government",
  crk: "Christian Religious Studies (CRK)",
  geography: "Geography",
  economics: "Economics",
  irk: "Islamic Religious Studies (IRK)",
  civiledu: "Civic Education",
  insurance: "Insurance",
  currentaffairs: "Current Affairs",
  history: "History",
  basicscience: "Basic Science",
  basictech: "Basic Technology",
  computerstudies: "Computer Studies / ICT",
  socialstudies: "Social Studies",
  agricscience: "Agricultural Science",
  homeeconomics: "Home Economics",
  businessstudies: "Business Studies",
  quantitative: "Quantitative Reasoning",
  verbal: "Verbal Reasoning",
  phe: "Physical & Health Education",
  french: "French",
};

export function formatCbtSubjectLabel(code: string): string {
  const key = (code || "").toLowerCase().trim();
  if (SUBJECT_LABELS[key]) return SUBJECT_LABELS[key];
  return key
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (ch) => ch.toUpperCase()) || "General Subject";
}

export function formatCbtExamBodyLabel(code: string): string {
  const norm = (code || "").toUpperCase().replace(/_/g, "-").trim();
  if (norm === "SCHOOL-INTERNAL") return "SCHOOL-INTERNAL (Word of Faith Assessment)";
  return norm || "WASSCE";
}

export function mapSubjectNameToCbtCodes(subjectName?: string | null): string[] {
  const s = (subjectName || "").trim().toLowerCase();
  const codes = new Set<string>();
  if (!s) return [];

  if (s.includes("math")) codes.add("mathematics");
  if (s.includes("english") && !s.includes("lit")) codes.add("english");
  if (s.includes("lit")) codes.add("englishlit");
  if (s.includes("bio")) codes.add("biology");
  if (s.includes("basic science")) {
    codes.add("basicscience");
    codes.add("biology");
  }
  if (s.includes("basic tech")) codes.add("basictech");
  if (s.includes("computer") || s.includes("ict")) codes.add("computerstudies");
  if (s.includes("social")) codes.add("socialstudies");
  if (s.includes("agric")) codes.add("agricscience");
  if (s.includes("home")) codes.add("homeeconomics");
  if (s.includes("business")) codes.add("businessstudies");
  if (s.includes("quant")) codes.add("quantitative");
  if (s.includes("verbal")) codes.add("verbal");
  if (s.includes("phe") || s.includes("physical") || s.includes("health")) codes.add("phe");
  if (s.includes("french")) codes.add("french");
  if (s.includes("chem")) codes.add("chemistry");
  if (s.includes("phys")) codes.add("physics");
  if (s.includes("civic")) codes.add("civiledu");
  if (s.includes("christian") || s.includes("crk") || s.includes("crs")) codes.add("crk");
  if (s.includes("islamic") || s.includes("irk") || s.includes("irs")) codes.add("irk");
  if (s.includes("econ")) codes.add("economics");
  if (s.includes("gov")) codes.add("government");
  if (s.includes("geo")) codes.add("geography");
  if (s.includes("comm")) codes.add("commerce");
  if (s.includes("account")) codes.add("accounting");
  if (s.includes("hist")) codes.add("history");
  if (s.includes("insur")) codes.add("insurance");
  if (s.includes("current")) codes.add("currentaffairs");

  codes.add(s.replace(/[^a-z0-9]/g, ""));
  return Array.from(codes).filter(Boolean);
}
