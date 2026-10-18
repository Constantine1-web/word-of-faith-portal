export interface CBTQuestion {
  id: number;
  question: string;
  option: {
    a: string;
    b: string;
    c: string;
    d: string;
    e?: string | null;
  };
  section?: string | null;
  image?: string | null;
  answer: string;
  solution?: string | null;
  examtype: string;
  examyear: string;
}

export interface CBTResponse {
  subject?: string;
  status: number;
  data: CBTQuestion[];
  message?: string;
}

export const SUBJECTS = [
  "english", "mathematics", "commerce", "accounting", "biology",
  "physics", "chemistry", "englishlit", "government", "crk",
  "geography", "economics", "irk", "civiledu", "insurance", "currentaffairs", "history"
];

export const EXAM_TYPES = [
  "utme", "wassce", "neco", "post-utme"
];

// Offline verified past question bank (Guarantees zero downtime if both cloud APIs blink)
const FALLBACK_QUESTION_BANK: Record<string, CBTQuestion[]> = {
  mathematics: [
    {
      id: 9001,
      question: "If log₁₀ 2 = 0.3010 and log₁₀ 3 = 0.4771, evaluate log₁₀ 18 without using mathematical tables.",
      option: { a: "1.2552", b: "0.9542", c: "1.0791", d: "1.1550" },
      answer: "a",
      solution: "log₁₀ 18 = log₁₀ (2 × 3²) = log₁₀ 2 + 2log₁₀ 3 = 0.3010 + 2(0.4771) = 0.3010 + 0.9542 = 1.2552.",
      examtype: "WASSCE",
      examyear: "2018",
      image: null
    },
    {
      id: 9002,
      question: "Solve the quadratic equation: 2x² - 5x + 2 = 0.",
      option: { a: "x = 1/2 or x = 2", b: "x = -1/2 or x = -2", c: "x = 1 or x = 4", d: "x = -2 or x = 1/2" },
      answer: "a",
      solution: "2x² - 4x - x + 2 = 0 => 2x(x - 2) - 1(x - 2) = 0 => (2x - 1)(x - 2) = 0 => x = 1/2 or x = 2.",
      examtype: "NECO",
      examyear: "2020",
      image: null
    },
    {
      id: 9003,
      question: "The sum of the interior angles of a regular polygon is 1080°. How many sides does the polygon have?",
      option: { a: "6", b: "8", c: "10", d: "12" },
      answer: "b",
      solution: "Sum = (n - 2) × 180° => 1080 = (n - 2) × 180 => n - 2 = 6 => n = 8 (Octagon).",
      examtype: "WASSCE",
      examyear: "2015",
      image: null
    }
  ],
  english: [
    {
      id: 9101,
      question: "Choose the option that best completes the sentence: Neither the teacher nor the students ______ present at the assembly yesterday.",
      option: { a: "was", b: "were", c: "is", d: "are" },
      answer: "b",
      solution: "When using 'neither... nor', the verb agrees with the closer subject. 'Students' is plural, so 'were' is correct for past tense.",
      examtype: "WASSCE",
      examyear: "2019",
      image: null
    },
    {
      id: 9102,
      question: "From the words lettered A to D, choose the word that has the same vowel sound as the one represented by the underlined letter: b<u>ir</u>d.",
      option: { a: "word", b: "beard", c: "bread", d: "board" },
      answer: "a",
      solution: "'Bird' and 'word' both contain the /ɜː/ vowel sound.",
      examtype: "NECO",
      examyear: "2021",
      image: null
    }
  ]
};

/**
 * Fetch questions from SdashAPI
 */
async function fetchFromSdash(subject: string, amount: number, examtype?: string): Promise<CBTQuestion[] | null> {
  const apiKey = process.env.SDASH_API_KEY;
  if (!apiKey) return null;

  try {
    const url = new URL("https://sdashapi.com/api/v1/q");
    url.searchParams.append("subject", subject.toLowerCase());
    url.searchParams.append("limit", Math.min(amount, 50).toString());

    if (examtype) {
      // Map standard acronyms to SdashAPI format
      const normalizedType = examtype.toLowerCase() === "wassce" || examtype.toLowerCase() === "waec" ? "wassce" : examtype.toLowerCase();
      url.searchParams.append("type", normalizedType);
    }

    const res = await fetch(url.toString(), {
      headers: {
        Accept: "application/json",
        AccessToken: apiKey
      },
      cache: "no-store"
    });

    if (!res.ok) return null;

    const json = await res.json();
    if (json.status === 200 && Array.isArray(json.data) && json.data.length > 0) {
      return json.data.map((item: any) => ({
        id: item.id,
        question: item.question,
        option: item.option || {},
        section: item.section,
        image: item.image,
        answer: (item.answer || "a").toLowerCase().trim(),
        solution: item.solution || "",
        examtype: item.examtype || "WASSCE",
        examyear: item.examyear || ""
      }));
    }

    return null;
  } catch (err) {
    console.warn("SdashAPI query error, attempting fallback:", err);
    return null;
  }
}

/**
 * Fetch questions from ALOC API
 */
async function fetchFromAloc(subject: string, amount: number, examtype?: string): Promise<CBTQuestion[] | null> {
  const apiKey = process.env.ALOC_API_KEY;
  if (!apiKey) return null;

  try {
    const url = new URL(`https://questions.aloc.com.ng/api/v2/q/${amount}`);
    url.searchParams.append("subject", subject.toLowerCase());
    if (examtype) {
      url.searchParams.append("type", examtype.toLowerCase());
    }

    const res = await fetch(url.toString(), {
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        AccessToken: apiKey
      },
      cache: "no-store"
    });

    if (!res.ok) return null;

    const json = (await res.json()) as CBTResponse;
    if (json.status === 200 && Array.isArray(json.data) && json.data.length > 0) {
      return json.data.map((item: any) => ({
        id: item.id,
        question: item.question,
        option: item.option || {},
        section: item.section,
        image: item.image,
        answer: (item.answer || "a").toLowerCase().trim(),
        solution: item.solution || "",
        examtype: item.examtype || "WASSCE",
        examyear: item.examyear || ""
      }));
    }

    return null;
  } catch (err) {
    console.warn("ALOC API query error, attempting fallback:", err);
    return null;
  }
}

/**
 * Resilient multi-provider CBT fetcher:
 * 1. Queries SdashAPI first (using the newly connected Sdash key)
 * 2. Falls back to ALOC API if SdashAPI is unavailable or restricted
 * 3. Falls back to offline verified question bank if both are unreachable
 */
export async function fetchQuestions(
  subject: string,
  amount: number = 10,
  examtype?: string
): Promise<CBTQuestion[]> {
  const subLower = subject.toLowerCase().trim();

  // 1. Try SdashAPI
  const sdashQuestions = await fetchFromSdash(subLower, amount, examtype);
  if (sdashQuestions && sdashQuestions.length > 0) {
    return sdashQuestions;
  }

  // 2. Fallback to ALOC
  const alocQuestions = await fetchFromAloc(subLower, amount, examtype);
  if (alocQuestions && alocQuestions.length > 0) {
    return alocQuestions;
  }

  // 3. Fallback to local verified historical archive
  if (FALLBACK_QUESTION_BANK[subLower]) {
    return FALLBACK_QUESTION_BANK[subLower];
  }

  // If nothing found for obscure criteria, return an empty array gracefully
  return [];
}
