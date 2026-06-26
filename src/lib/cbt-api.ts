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
  section: string;
  image: string;
  answer: string;
  solution: string;
  examtype: string;
  examyear: string;
}

export interface CBTResponse {
  subject: string;
  status: number;
  data: CBTQuestion[];
}

export const SUBJECTS = [
  "english", "mathematics", "commerce", "accounting", "biology",
  "physics", "chemistry", "englishlit", "government", "crk",
  "geography", "economics", "irk", "civiledu", "insurance", "currentaffairs", "history"
];

export const EXAM_TYPES = [
  "utme", "wassce", "post-utme", "neco"
];

export async function fetchQuestions(subject: string, amount: number = 10, examtype?: string): Promise<CBTQuestion[]> {
  const apiKey = process.env.ALOC_API_KEY;
  if (!apiKey) {
    throw new Error("ALOC API key is missing. Please check your .env file.");
  }

  // ALOC endpoints format:
  // Single question: /api/v2/q?subject=subject
  // Multiple questions: /api/v2/q/amount?subject=subject
  // If examtype is passed, append &type=examtype (assuming their API supports filtering by type, 
  // but if it doesn't we might just fetch and filter client-side or stick to default)
  
  const url = new URL(`https://questions.aloc.com.ng/api/v2/q/${amount}`);
  url.searchParams.append('subject', subject);
  if (examtype) {
    url.searchParams.append('type', examtype);
  }

  try {
    const res = await fetch(url.toString(), {
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'AccessToken': apiKey
      },
      // Cache settings - depends if we want fresh questions each time
      cache: 'no-store'
    });

    if (!res.ok) {
      throw new Error(`ALOC API returned status: ${res.status}`);
    }

    const json = await res.json() as CBTResponse;
    if (json.status !== 200) {
      throw new Error(`ALOC API error: status ${json.status}`);
    }
    
    return json.data;
  } catch (error) {
    console.error("Error fetching CBT questions:", error);
    throw error;
  }
}
