import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { rateLimit } from "../src/lib/rateLimit";
import { createUpstashRestClient, resolveUpstashRestConfig } from "../src/lib/redis";
import {
  encryptExamVaultString,
  decryptExamVaultString,
  generateSubjectExamRoomCode,
  hashSubjectExamRoomCode,
  verifySubjectExamRoomCode,
} from "../src/lib/exam-vault";
import { planStrictExamGradebookSync, seededShuffle } from "../src/lib/cbt-exam-policy";

async function runSimulation() {
  const CONCURRENT_STUDENTS = 200;
  const QUESTIONS_PER_EXAM = 40;
  const runId = Date.now();

  console.log("=== CONCURRENT EXAM LOAD & UPSTASH REDIS SIMULATION ===");
  console.log(
    `Simulating ${CONCURRENT_STUDENTS} concurrent students x ${QUESTIONS_PER_EXAM} encrypted CBT questions...\n`
  );

  // -------------------------------------------------------------------------
  // 1. Check local Upstash REST config vs Vercel deployment env
  // -------------------------------------------------------------------------
  const localRestConfig = resolveUpstashRestConfig(process.env);
  if (localRestConfig) {
    const restStart = performance.now();
    const restClient = createUpstashRestClient(localRestConfig.url, localRestConfig.token);
    const probeKey = `sim:probe:${runId}`;
    const probeVal = await restClient.incr(probeKey);
    await restClient.expire(probeKey, 30);
    await restClient.del(probeKey);
    const restMs = (performance.now() - restStart).toFixed(1);
    console.log(
      `[1/5] Live Upstash REST Ping: OK (url=${localRestConfig.url}, incr=${probeVal}, 3 commands in ${restMs}ms)`
    );
  } else {
    console.log(
      "[1/5] Live Upstash REST Ping: SKIPPED locally (UPSTASH_REDIS_REST_* / KV_REST_API_* are set in Vercel Project Env, not local .env)."
    );
  }

  // -------------------------------------------------------------------------
  // 2. Shared School ICT Lab NAT Burst + Per-Student Room Lockout Test
  // -------------------------------------------------------------------------
  const rlStart = performance.now();
  const sharedLabIp = `197.210.44.${runId % 200}`;

  // Simulate 120 students in batch 1 logging in simultaneously from 1 school router IP
  const labLoginResults = await Promise.all(
    Array.from({ length: 120 }, (_, i) =>
      Promise.all([
        rateLimit(`sim:login:ip:${sharedLabIp}:${runId}`, 120, 60),
        rateLimit(`sim:login:acct:stu${i}_${runId}@wofs.edu`, 5, 300),
      ])
    )
  );
  const labAllowed = labLoginResults.filter(([ipRes, acctRes]) => ipRes.success && acctRes.success).length;
  assert.equal(labAllowed, 120, "All 120 students sharing 1 school router IP must be allowed through login burst");

  // Simulate 200 concurrent strict-exam entry requests (per-student bucket)
  const examEntryResults = await Promise.all(
    Array.from({ length: CONCURRENT_STUDENTS }, (_, idx) =>
      rateLimit(`sim:cbt_strict_exam:${10000 + idx}:${runId}`, 10, 60)
    )
  );
  assert.equal(
    examEntryResults.filter((r) => r.success).length,
    CONCURRENT_STUDENTS,
    "All 200 concurrent students must pass per-student CBT strict entry"
  );

  // Simulate 6 wrong room code guesses by a single malicious student
  const attackerGuesses = [];
  for (let g = 1; g <= 6; g++) {
    attackerGuesses.push(
      await rateLimit(`sim:exam_code_guess:99999:exam_${runId}`, 5, 600)
    );
  }
  assert.equal(attackerGuesses[4].success, true, "5th guess reaches max allowance");
  assert.equal(attackerGuesses[5].success, false, "6th wrong guess must be rate-limited");
  const rlMs = (performance.now() - rlStart).toFixed(1);
  console.log(
    `[2/5] Auth & Exam Room Burst (${CONCURRENT_STUDENTS} students + 120 shared-NAT logins + brute-force block): PASSED in ${rlMs}ms`
  );

  // -------------------------------------------------------------------------
  // 3. Simulated Upstash HTTP REST Transport Concurrency + Command Counter
  // -------------------------------------------------------------------------
  let simulatedRestCommands = 0;
  const originalFetch = globalThis.fetch;
  const memCounters = new Map<string, number>();

  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    simulatedRestCommands++;
    const cmd = JSON.parse(String(init?.body || "[]")) as (string | number)[];
    const op = String(cmd[0] || "").toUpperCase();
    const key = String(cmd[1] || "");
    let result: unknown = "OK";
    if (op === "INCR") {
      const next = (memCounters.get(key) || 0) + 1;
      memCounters.set(key, next);
      result = next;
    } else if (op === "EXPIRE") {
      result = 1;
    } else if (op === "TTL") {
      result = 59;
    }
    return new Response(JSON.stringify({ result }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;

  const restBurstStart = performance.now();
  try {
    const restSimClient = createUpstashRestClient("https://sim-upstash.internal", "sim_token");
    await Promise.all(
      Array.from({ length: CONCURRENT_STUDENTS }, async (_, idx) => {
        // Simulate 1 login check + 1 exam entry rate-limit flow (INCR + EXPIRE + TTL)
        const count = await restSimClient.incr(`sim:entry:${idx}`);
        if (count === 1) await restSimClient.expire(`sim:entry:${idx}`, 60);
        await restSimClient.ttl(`sim:entry:${idx}`);
      })
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
  const restBurstMs = (performance.now() - restBurstStart).toFixed(1);
  console.log(
    `[3/5] Upstash REST Client 200-Student Burst (${simulatedRestCommands} HTTP commands serialized): PASSED in ${restBurstMs}ms`
  );

  // -------------------------------------------------------------------------
  // 4. Vault Decrypt + Room Code Verification + Per-Student Option Shuffle
  // -------------------------------------------------------------------------
  const simExamId = `sim_exam_${runId}`;
  const { plainCode } = generateSubjectExamRoomCode("MTH");
  const roomHash = hashSubjectExamRoomCode(simExamId, "mathematics", plainCode);
  const encryptedBank = Array.from({ length: QUESTIONS_PER_EXAM }, (_, qIdx) => ({
    id: `q_${qIdx}`,
    stem: encryptExamVaultString(`Solve equation ${qIdx}: 2x + ${qIdx} = 10`),
    a: encryptExamVaultString(`Option A ${qIdx}`),
    b: encryptExamVaultString(`Option B ${qIdx}`),
    c: encryptExamVaultString(`Option C ${qIdx}`),
    d: encryptExamVaultString(`Option D ${qIdx}`),
  }));

  const cryptoStart = performance.now();
  for (let s = 0; s < CONCURRENT_STUDENTS; s++) {
    const check = verifySubjectExamRoomCode({
      scheduledExamId: simExamId,
      subjectCode: "mathematics",
      candidateCode: plainCode,
      expectedHash: roomHash,
      isActive: true,
      activatesAt: new Date(Date.now() - 60_000),
      expiresAt: new Date(Date.now() + 3_600_000),
    });
    assert.equal(check.valid, true);
    const orderedQuestions = seededShuffle(encryptedBank, `attempt_${runId}_${s}`);
    for (const q of orderedQuestions) {
      decryptExamVaultString(q.stem);
      decryptExamVaultString(q.a);
      decryptExamVaultString(q.b);
      decryptExamVaultString(q.c);
      decryptExamVaultString(q.d);
    }
  }
  const cryptoMs = (performance.now() - cryptoStart).toFixed(1);
  const totalDecrypts = CONCURRENT_STUDENTS * QUESTIONS_PER_EXAM * 5;
  console.log(
    `[4/5] Exam Vault + Room Code Burst (${CONCURRENT_STUDENTS} checks + ${totalDecrypts} AES-256-GCM decrypts): PASSED in ${cryptoMs}ms`
  );

  // -------------------------------------------------------------------------
  // 5. Terminal Gradebook Sync Burst + Upstash Quota Projection
  // -------------------------------------------------------------------------
  const syncStart = performance.now();
  const gradebookPlan = planStrictExamGradebookSync({
    targetColumn: "exam",
    maxWeight: 60,
    overwriteMode: "OVERWRITE_MATCHED",
    candidates: Array.from({ length: CONCURRENT_STUDENTS }, (_, s) => ({
      studentId: s + 1,
      scoreTenths: 500 + ((s * 23) % 501),
      existingCaScore: 28,
      existingExamScore: null,
      existingStatus: s === 199 ? "ABSENT" : "ENTERED",
    })),
  });
  assert.equal(gradebookPlan.updatedCount, CONCURRENT_STUDENTS - 1);
  assert.equal(gradebookPlan.absentOrExemptCount, 1);
  const syncMs = (performance.now() - syncStart).toFixed(2);
  console.log(
    `[5/5] Official Exam -> Gradebook Sync Plan (${CONCURRENT_STUDENTS} students): PASSED in ${syncMs}ms`
  );

  // Command Budget Math:
  // Per student per exam session:
  //   login:ip (2-3 cmds) + login:acct (2-3 cmds) + cbt_strict_exam (2-3 cmds) = ~8 commands
  const estimatedCmdsPerStudent = 8;
  const cmdsForOne200Exam = CONCURRENT_STUDENTS * estimatedCmdsPerStudent;
  const maxFreeTierExamsPerDay = Math.floor(10000 / cmdsForOne200Exam);

  console.log("\n=== UPSTASH FREE-TIER QUOTA PROJECTION (10,000 cmds/day) ===");
  console.log(`Estimated Redis commands per student/exam session : ~${estimatedCmdsPerStudent} cmds`);
  console.log(`Estimated Redis commands for 200 students (1 exam): ~${cmdsForOne200Exam} cmds`);
  console.log(
    `Headroom on Upstash Free Tier (10,000 cmds/day)     : ~${maxFreeTierExamsPerDay} full 200-student exam sittings/day`
  );
  console.log("Recommendation: Sufficient for up to ~5-6 full 200-student exam sittings/day;");
  console.log("upgrade Upstash store to Pay-as-you-go during full multi-class exam weeks.");
}

runSimulation().catch((err) => {
  console.error("❌ Simulation failed:", err);
  process.exit(1);
});
