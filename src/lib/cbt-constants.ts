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
