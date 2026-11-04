import prisma from "@/lib/db";
import crypto from "crypto";

// pdf-parse uses CommonJS export = syntax
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require("pdf-parse");

export interface ParsedClassListRow {
  tempId: string;
  extractedName: string;
  cleanName: string;
  existingStudentId?: number;
  isExisting: boolean;
  admissionNo: string;
  claimCode?: string;
  selected: boolean;
}

// Clean and normalize name tokens
function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Check if two names are a high-confidence match (order-agnostic)
function isNameMatch(nameA: string, nameB: string): boolean {
  const normA = normalizeName(nameA);
  const normB = normalizeName(nameB);
  if (!normA || !normB) return false;
  if (normA === normB) return true;

  const tokensA = normA.split(" ").filter((t: string) => t.length > 1);
  const tokensB = normB.split(" ").filter((t: string) => t.length > 1);

  if (tokensA.length === 0 || tokensB.length === 0) return false;

  // Check if all tokens of A are present in B or vice-versa
  const aInB = tokensA.every((t: string) => tokensB.includes(t));
  const bInA = tokensB.every((t: string) => tokensA.includes(t));

  return aInB || bInA;
}

// Generate random 6-character claim code (no ambiguous characters 0, O, 1, I)
export function generateClaimCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.randomBytes(6);
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars[bytes[i] % chars.length];
  }
  return `WOF-${code}`;
}

export async function parseAndMatchClassList(
  pdfBuffer: Buffer,
  targetClassId: number
): Promise<{
  success: boolean;
  classInfo?: { id: number; name: string; level: string; arm: string };
  rows?: ParsedClassListRow[];
  error?: string;
}> {
  try {
    const targetClass = await prisma.class.findUnique({
      where: { ClassID: targetClassId },
    });

    if (!targetClass) {
      return { success: false, error: "Target class arm not found." };
    }

    const pdfData = await pdfParse(pdfBuffer);
    const rawText = pdfData?.text || "";

    const lines: string[] = rawText
      .split(/\r?\n/)
      .map((l: string) => l.trim())
      .filter((l: string) => l.length > 0);

    const ignoredKeywords = [
      "word of faith",
      "schools",
      "class list",
      "class roster",
      "session",
      "academic",
      "term",
      "student name",
      "full name",
      "admission no",
      "reg no",
      "registration no",
      "gender",
      "sex",
      "signature",
      "serial",
      "s/n",
      "page",
      "total",
    ];

    const extractedEntries: Array<{ rawName: string; parsedRegNo?: string }> = [];

    for (const line of lines) {
      const lower = line.toLowerCase();
      // Skip headers and metadata lines
      if (ignoredKeywords.some((kw: string) => lower.includes(kw) && line.length < 50)) {
        continue;
      }

      // Check if line contains a student row (e.g. "1. John Doe WOF/2026/001" or "1) James, Mercy")
      // Match optional leading index like 1. or 1) or [1] or 01
      let cleaned = line.replace(/^\s*(\d+)[\.\)\]\-:\s]+/g, "").trim();

      // Check if an existing registration number is embedded in the line
      const regNoMatch = cleaned.match(/\b(WOF[S]?\/[0-9]{4}\/[A-Za-z0-9\/]+)\b/i);
      let parsedRegNo: string | undefined;
      if (regNoMatch) {
        parsedRegNo = regNoMatch[1].toUpperCase();
        cleaned = cleaned.replace(regNoMatch[0], "").trim();
      }

      // Strip trailing gender markers (e.g. " M ", " F ", " Male ", " Female ")
      cleaned = cleaned.replace(/\s+(M|F|Male|Female)\s*$/i, "").trim();

      // Clean comma if format is "LASTNAME, FIRSTNAME"
      if (cleaned.includes(",")) {
        const parts = cleaned.split(",").map((p: string) => p.trim());
        if (parts.length >= 2 && parts[0] && parts[1]) {
          cleaned = `${parts[1]} ${parts[0]}`;
        }
      }

      // Format casing to Title Case
      const formattedName = cleaned
        .split(/\s+/)
        .map((w: string) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(" ")
        .trim();

      if (formattedName.length >= 3 && !/^\d+$/.test(formattedName)) {
        extractedEntries.push({
          rawName: line,
          parsedRegNo,
        });
      }
    }

    if (extractedEntries.length === 0) {
      return {
        success: false,
        error: "No student names could be identified in the uploaded PDF. Please verify that the PDF contains student names.",
      };
    }

    // Fetch all existing students in the school to prevent duplicates and match existing pupils
    const allStudents = await prisma.student.findMany({
      select: {
        StudentID: true,
        PreferredName: true,
        FirstName: true,
        LastName: true,
        AdmissionNo: true,
        ClassID: true,
      },
    });

    // Prepare next sequential registration numbers for this year and class level
    const currentYear = new Date().getFullYear();
    const isPrimary = targetClass.Level.toLowerCase().includes("primary");
    const prefix = isPrimary ? "PRY" : "SEC";

    const existingYearRegs = allStudents.filter((s) =>
      s.AdmissionNo.startsWith(`WOFS/${currentYear}/${prefix}/`)
    );

    let maxSeq = 0;
    for (const s of existingYearRegs) {
      const parts = s.AdmissionNo.split("/");
      const last = parseInt(parts[parts.length - 1], 10);
      if (!isNaN(last) && last > maxSeq) {
        maxSeq = last;
      }
    }

    let nextSequence = maxSeq + 1;
    const resultRows: ParsedClassListRow[] = [];

    for (let i = 0; i < extractedEntries.length; i++) {
      const entry = extractedEntries[i];
      let cleaned = entry.rawName.replace(/^\s*(\d+)[\.\)\]\-:\s]+/g, "").trim();
      if (entry.parsedRegNo) {
        cleaned = cleaned.replace(new RegExp(entry.parsedRegNo, "i"), "").trim();
      }
      cleaned = cleaned.replace(/\s+(M|F|Male|Female)\s*$/i, "").trim();
      if (cleaned.includes(",")) {
        const parts = cleaned.split(",").map((p: string) => p.trim());
        if (parts.length >= 2 && parts[0] && parts[1]) {
          cleaned = `${parts[1]} ${parts[0]}`;
        }
      }
      const titleName = cleaned
        .split(/\s+/)
        .map((w: string) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(" ")
        .trim();

      // 1. Check if matching by explicit parsed registration number
      let matchedStudent = entry.parsedRegNo
        ? allStudents.find((s) => s.AdmissionNo.toLowerCase() === entry.parsedRegNo?.toLowerCase())
        : undefined;

      // 2. Check if matching by student name
      if (!matchedStudent) {
        matchedStudent = allStudents.find((s) => {
          const dbFullName = s.PreferredName || `${s.FirstName || ""} ${s.LastName || ""}`.trim();
          return isNameMatch(titleName, dbFullName);
        });
      }

      if (matchedStudent) {
        // Matched existing student: Retain their permanent registration number!
        resultRows.push({
          tempId: `row-${i}-${Date.now()}`,
          extractedName: entry.rawName,
          cleanName: matchedStudent.PreferredName || titleName,
          existingStudentId: matchedStudent.StudentID,
          isExisting: true,
          admissionNo: matchedStudent.AdmissionNo,
          selected: true,
        });
      } else {
        // New pupil: Assign next permanent sequential registration number + claim code
        const assignedRegNo = `WOFS/${currentYear}/${prefix}/${nextSequence.toString().padStart(3, "0")}`;
        const claimCode = generateClaimCode();
        nextSequence++;

        resultRows.push({
          tempId: `row-${i}-${Date.now()}`,
          extractedName: entry.rawName,
          cleanName: titleName,
          isExisting: false,
          admissionNo: assignedRegNo,
          claimCode,
          selected: true,
        });
      }
    }

    return {
      success: true,
      classInfo: {
        id: targetClass.ClassID,
        name: targetClass.ClassName,
        level: targetClass.Level,
        arm: targetClass.Arm,
      },
      rows: resultRows,
    };
  } catch (error: any) {
    console.error("parseAndMatchClassList error:", error);
    return { success: false, error: error.message || "Failed to parse class list PDF" };
  }
}
