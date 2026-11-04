import { fetchAlocBatchQuestions } from "./aloc-api";

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

// Offline verified past question bank (Guarantees zero downtime if cloud APIs blink or encounter credit limits)
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
  ],
  physics: [
    {
      id: 9201,
      question: "A car accelerates uniformly from rest at 3 m/s² for 8 seconds. Calculate the total distance covered by the car.",
      option: { a: "48 m", b: "96 m", c: "120 m", d: "192 m" },
      answer: "b",
      solution: "Using s = ut + 0.5at²: since u = 0, s = 0.5 × 3 × (8)² = 0.5 × 3 × 64 = 96 m.",
      examtype: "WASSCE",
      examyear: "2020",
      image: null
    },
    {
      id: 9202,
      question: "Which of the following electromagnetic waves has the highest frequency?",
      option: { a: "Radio waves", b: "Infrared rays", c: "Gamma rays", d: "Microwaves" },
      answer: "c",
      solution: "In the electromagnetic spectrum, gamma rays have the shortest wavelength and consequently the highest frequency and photon energy.",
      examtype: "WASSCE",
      examyear: "2021",
      image: null
    },
    {
      id: 9203,
      question: "A stone of mass 2 kg is thrown vertically upwards with a velocity of 20 m/s. Calculate its maximum potential energy (take g = 10 m/s²).",
      option: { a: "200 J", b: "400 J", c: "600 J", d: "800 J" },
      answer: "b",
      solution: "By conservation of mechanical energy, Max P.E = Initial K.E = 0.5 × m × v² = 0.5 × 2 × (20)² = 400 J.",
      examtype: "WASSCE",
      examyear: "2019",
      image: null
    },
    {
      id: 9204,
      question: "An electric kettle rated 2 kW, 240 V is used for 30 minutes. Calculate the electrical energy consumed in kilowatt-hours (kWh).",
      option: { a: "0.5 kWh", b: "1.0 kWh", c: "2.0 kWh", d: "4.0 kWh" },
      answer: "b",
      solution: "Energy (kWh) = Power (kW) × Time (hours) = 2 kW × (30 / 60) h = 2 × 0.5 = 1.0 kWh.",
      examtype: "NECO",
      examyear: "2022",
      image: null
    }
  ],
  chemistry: [
    {
      id: 9301,
      question: "What is the oxidation number of sulfur in H₂SO₄?",
      option: { a: "+2", b: "+4", c: "+6", d: "-2" },
      answer: "c",
      solution: "2(+1) + S + 4(-2) = 0 => 2 + S - 8 = 0 => S = +6.",
      examtype: "WASSCE",
      examyear: "2021",
      image: null
    },
    {
      id: 9302,
      question: "Which of the following gases turns moist red litmus paper blue?",
      option: { a: "Carbon dioxide", b: "Sulfur dioxide", c: "Ammonia", d: "Chlorine" },
      answer: "c",
      solution: "Ammonia (NH₃) is an alkaline gas and dissolves in water to form basic ammonium hydroxide, turning red litmus paper blue.",
      examtype: "WASSCE",
      examyear: "2022",
      image: null
    }
  ],
  biology: [
    {
      id: 9401,
      question: "Which cellular organelle is primarily responsible for aerobic cellular respiration and ATP synthesis?",
      option: { a: "Ribosome", b: "Golgi apparatus", c: "Mitochondrion", d: "Endoplasmic reticulum" },
      answer: "c",
      solution: "The mitochondrion is known as the powerhouse of the cell because the Krebs cycle and oxidative phosphorylation take place within its cristae to generate ATP.",
      examtype: "WASSCE",
      examyear: "2020",
      image: null
    }
  ]
};

/**
 * Fetch questions from SdashAPI (secondary cloud provider)
 */
async function fetchFromSdash(subject: string, amount: number, examtype?: string): Promise<CBTQuestion[] | null> {
  const apiKey = process.env.SDASH_API_KEY;
  if (!apiKey) return null;

  try {
    const url = new URL("https://sdashapi.com/api/v1/q");
    url.searchParams.append("subject", subject.toLowerCase());
    url.searchParams.append("limit", Math.min(amount, 50).toString());

    if (examtype) {
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
    console.warn("[SdashAPI] Query error, attempting fallback:", err);
    return null;
  }
}

/**
 * Resilient multi-provider CBT fetcher:
 * 1. Queries ALOC Station API v1 first (using modern X-API-Key and dev.aloc.com.ng)
 * 2. Falls back to SdashAPI if ALOC Station is unavailable or credits are exhausted
 * 3. Falls back to offline verified question bank to guarantee zero student interruption
 */
export async function fetchQuestions(
  subject: string,
  amount: number = 10,
  examtype?: string
): Promise<CBTQuestion[]> {
  const subLower = subject.toLowerCase().trim();

  // 1. Primary: Query modern ALOC Station API v1
  try {
    const alocQuestions = await fetchAlocBatchQuestions(subLower, amount, examtype);
    if (alocQuestions && alocQuestions.length > 0) {
      return alocQuestions;
    }
  } catch (err) {
    console.warn("[CBT API] ALOC Station fetch encountered an error, falling back:", err);
  }

  // 2. Secondary: Query SdashAPI
  try {
    const sdashQuestions = await fetchFromSdash(subLower, amount, examtype);
    if (sdashQuestions && sdashQuestions.length > 0) {
      return sdashQuestions;
    }
  } catch (err) {
    console.warn("[CBT API] SdashAPI fallback encountered an error:", err);
  }

  // 3. Guaranteed Fallback: Local verified historical question bank
  if (FALLBACK_QUESTION_BANK[subLower] && FALLBACK_QUESTION_BANK[subLower].length > 0) {
    return FALLBACK_QUESTION_BANK[subLower];
  }

  // If nothing found for obscure criteria, return an empty array gracefully
  return [];
}
