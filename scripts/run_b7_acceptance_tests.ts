import assert from "node:assert/strict";
import {
  gradeFor,
  computeSubjectStats,
  computeBroadsheetRankings,
  WAEC_SECONDARY_BANDS,
} from "../src/server/domain/grading";
import {
  resolveActorCapabilities,
  assertSeparationOfDuties,
  CAPABILITY_PRESETS,
} from "../src/server/security/capabilities";
import {
  generateTotpSecret,
  computeTotpCode,
  verifyTotpCode,
  generateRecoveryCodes,
} from "../src/server/security/totp";

async function main() {
  console.log("=== Running Section B.7 Automated Acceptance & Domain Tests ===\n");

  // 1. Tenths Grading Boundary Verification (Section B.3)
  console.log("1. Testing gradeFor() tenths boundaries...");
  assert.deepEqual(gradeFor(745, WAEC_SECONDARY_BANDS), {
    grade: "B2",
    remark: "Very Good",
  });
  assert.deepEqual(gradeFor(750, WAEC_SECONDARY_BANDS), {
    grade: "A1",
    remark: "Excellent",
  });
  assert.deepEqual(gradeFor(399, WAEC_SECONDARY_BANDS), {
    grade: "F9",
    remark: "Fail",
  });
  assert.deepEqual(gradeFor(400, WAEC_SECONDARY_BANDS), {
    grade: "E8",
    remark: "Pass",
  });
  console.log("   ✔ 745 tenths (74.5) -> B2, 750 tenths (75.0) -> A1, 399 -> F9, 400 -> E8");

  // 2. Subject Statistics & Standard Competition Ranking (1, 2, 2, 4)
  console.log(
    "2. Testing computeSubjectStats() & computeBroadsheetRankings() (1-2-2-4 ranking + incomplete/withdrawn exclusion)..."
  );
  const stats = computeSubjectStats([800, 750, 750, 600]);
  assert.equal(stats.highestTenths, 800);
  assert.equal(stats.lowestTenths, 600);
  assert.equal(stats.averageTenths, 725);

  const rankings = computeBroadsheetRankings([
    {
      studentId: 1,
      isWithdrawn: false,
      hasPendingSubject: false,
      enteredSubjectTotalsTenths: [850, 900], // avg 875 -> Position 1
    },
    {
      studentId: 2,
      isWithdrawn: false,
      hasPendingSubject: false,
      enteredSubjectTotalsTenths: [800, 800], // avg 800 -> Position 2 (tied)
    },
    {
      studentId: 3,
      isWithdrawn: false,
      hasPendingSubject: false,
      enteredSubjectTotalsTenths: [750, 850], // avg 800 -> Position 2 (tied)
    },
    {
      studentId: 4,
      isWithdrawn: false,
      hasPendingSubject: false,
      enteredSubjectTotalsTenths: [700, 700], // avg 700 -> Position 4 (skips 3!)
    },
    {
      studentId: 5,
      isWithdrawn: false,
      hasPendingSubject: true, // incomplete -> unranked (null)
      enteredSubjectTotalsTenths: [950],
    },
    {
      studentId: 6,
      isWithdrawn: true, // withdrawn -> unranked (null)
      hasPendingSubject: false,
      enteredSubjectTotalsTenths: [990, 990],
    },
  ]);

  const byId = Object.fromEntries(rankings.map((r) => [r.studentId, r]));
  assert.equal(byId[1].position, 1);
  assert.equal(byId[2].position, 2);
  assert.equal(byId[3].position, 2);
  assert.equal(byId[4].position, 4);
  assert.equal(byId[5].position, null);
  assert.equal(byId[6].position, null);
  console.log("   ✔ Standard competition ranking (1, 2, 2, 4) & incomplete/withdrawn exclusion verified.");

  // 3. Separation of Duties (Section B.2)
  console.log("3. Testing assertSeparationOfDuties()...");
  assertSeparationOfDuties(101, 202, "Sheet unlock request");
  assert.throws(
    () => assertSeparationOfDuties(101, 101, "Sheet unlock request"),
    /SEPARATION_OF_DUTIES_VIOLATION/
  );
  console.log("   ✔ Separation of Duties blocks self-approval as required.");

  // 4. Capability Matrix & Presets (Section B.2)
  console.log("4. Testing Capability presets (FULL, FINANCE, REGISTRY)...");
  const bursarCaps = resolveActorCapabilities(CAPABILITY_PRESETS.FINANCE, ["BURSAR"], "Admin");
  assert.equal(bursarCaps.has("APPROVE_PAYMENTS"), true);
  assert.equal(bursarCaps.has("PUBLISH_RESULTS"), false);

  const registryCaps = resolveActorCapabilities(CAPABILITY_PRESETS.REGISTRY, ["ADMISSIONS"], "Admin");
  assert.equal(registryCaps.has("MANAGE_STUDENTS"), true);
  assert.equal(registryCaps.has("APPROVE_PAYMENTS"), false);
  console.log("   ✔ Capability guardrails verified.");

  // 5. Step-Up TOTP 2FA (RFC 6238 - Section B.2)
  console.log("5. Testing RFC 6238 TOTP generation & verification...");
  const secret = generateTotpSecret();
  const code = computeTotpCode(secret);
  assert.equal(code.length, 6);
  assert.equal(verifyTotpCode(secret, code), true);
  assert.equal(verifyTotpCode(secret, code === "000000" ? "999999" : "000000"), false);
  const recovery = generateRecoveryCodes();
  assert.equal(recovery.plainCodes.length, 8);
  assert.equal(recovery.codeHashes.length, 8);
  console.log("   ✔ RFC 6238 TOTP & recovery codes verified.");

  console.log("\n✅ ALL SECTION B.7 ACCEPTANCE TESTS PASSED!");
}

main().catch((err) => {
  console.error("Acceptance test failed:", err);
  process.exit(1);
});
