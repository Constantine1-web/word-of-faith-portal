export interface ParsedCbtCsvQuestion {
  rowNumber: number;
  subjectCode: string;
  examBody: string;
  topic: string;
  stem: string;
  optionA: string;
  optionB: string;
  optionC: string;
  optionD: string;
  correctKey: "a" | "b" | "c" | "d";
  explanation: string;
}

export interface ParsedCbtCsvResult {
  validRows: ParsedCbtCsvQuestion[];
  errors: Array<{ rowNumber: number; error: string }>;
}

function parseCsvMatrix(csvText: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  const cleanInput = (csvText || "").replace(/^\uFEFF/, "");

  for (let i = 0; i < cleanInput.length; i++) {
    const ch = cleanInput[i];
    const next = cleanInput[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        field += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        row.push(field.trim());
        field = "";
      } else if (ch === "\r" && next === "\n") {
        row.push(field.trim());
        rows.push(row);
        row = [];
        field = "";
        i++;
      } else if (ch === "\n" || ch === "\r") {
        row.push(field.trim());
        rows.push(row);
        row = [];
        field = "";
      } else {
        field += ch;
      }
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field.trim());
    rows.push(row);
  }

  return rows.filter((r) => r.some((cell) => cell.length > 0));
}

export function normalizeCbtSubjectCode(raw: string): string {
  return (raw || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

export function parseSchoolCbtQuestionsCsv(
  csvText: string,
  defaults?: { subjectCode?: string; examBody?: string }
): ParsedCbtCsvResult {
  const matrix = parseCsvMatrix(csvText);
  if (matrix.length < 2) {
    return {
      validRows: [],
      errors: [
        {
          rowNumber: 1,
          error: "CSV must contain a header row and at least one question row.",
        },
      ],
    };
  }

  const headers = matrix[0].map((h) => h.toLowerCase().replace(/[^a-z0-9]/g, ""));
  const findCol = (aliases: string[]): number =>
    headers.findIndex((h) => aliases.includes(h));

  const idxSubject = findCol(["subject", "subjectcode"]);
  const idxExamBody = findCol(["exambody", "exam", "examtype"]);
  const idxTopic = findCol(["topic", "unit"]);
  const idxStem = findCol(["stem", "question", "questiontext"]);
  const idxA = findCol(["optiona", "a", "choicea"]);
  const idxB = findCol(["optionb", "b", "choiceb"]);
  const idxC = findCol(["optionc", "c", "choicec"]);
  const idxD = findCol(["optiond", "d", "choiced"]);
  const idxCorrect = findCol(["correctkey", "correct", "answer", "correctoption"]);
  const idxExplanation = findCol(["explanation", "solution", "rationale"]);

  if (idxStem === -1 || idxA === -1 || idxB === -1 || idxC === -1 || idxD === -1 || idxCorrect === -1) {
    return {
      validRows: [],
      errors: [
        {
          rowNumber: 1,
          error:
            "Missing required CSV headers. Expected: stem (or question), optionA, optionB, optionC, optionD, correctKey (or answer).",
        },
      ],
    };
  }

  const validRows: ParsedCbtCsvQuestion[] = [];
  const errors: Array<{ rowNumber: number; error: string }> = [];

  const fallbackSubject = normalizeCbtSubjectCode(defaults?.subjectCode || "english") || "english";
  const fallbackExam = (defaults?.examBody || "SCHOOL_INTERNAL").toUpperCase().trim();

  for (let i = 1; i < matrix.length; i++) {
    const cols = matrix[i];
    const rowNumber = i + 1;

    const rawSubject = idxSubject !== -1 ? cols[idxSubject] : "";
    const subjectCode = normalizeCbtSubjectCode(rawSubject) || fallbackSubject;
    const examBody = (idxExamBody !== -1 && cols[idxExamBody] ? cols[idxExamBody] : fallbackExam)
      .toUpperCase()
      .replace(/-/g, "_")
      .trim();
    const topic = (idxTopic !== -1 && cols[idxTopic] ? cols[idxTopic] : "School Class Assessment").trim();
    const stem = (cols[idxStem] || "").trim();
    const optionA = (cols[idxA] || "").trim();
    const optionB = (cols[idxB] || "").trim();
    const optionC = (cols[idxC] || "").trim();
    const optionD = (cols[idxD] || "").trim();
    const correctRaw = (cols[idxCorrect] || "").toLowerCase().trim();
    const explanation = (idxExplanation !== -1 ? cols[idxExplanation] : "").trim();

    if (stem.length < 5) {
      errors.push({ rowNumber, error: "Question stem must be at least 5 characters." });
      continue;
    }
    if (!optionA || !optionB || !optionC || !optionD) {
      errors.push({ rowNumber, error: "All four options (A, B, C, D) must be non-empty." });
      continue;
    }
    if (correctRaw !== "a" && correctRaw !== "b" && correctRaw !== "c" && correctRaw !== "d") {
      errors.push({
        rowNumber,
        error: `Invalid correct answer "${cols[idxCorrect] || ""}". Must be A, B, C, or D.`,
      });
      continue;
    }

    validRows.push({
      rowNumber,
      subjectCode,
      examBody: examBody || "SCHOOL_INTERNAL",
      topic,
      stem,
      optionA,
      optionB,
      optionC,
      optionD,
      correctKey: correctRaw,
      explanation,
    });
  }

  return { validRows, errors };
}
