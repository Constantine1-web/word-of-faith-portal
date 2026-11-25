/**
 * Authoritative Financial Split & Allocation Engine
 * Model: ₦1,000 Gross Portal / ICT Fee -> ₦800 Service Provider (80%) + ₦200 Word of Faith Schools (20%)
 *
 * Commercial Specification:
 * - Gross Portal / ICT Fee: ₦1,000 (100,000 kobo) once per billed student per academic term.
 * - Allocation of the ₦1,000 Portal Fee line:
 *   • 80% = ₦800 (80,000 kobo) Service Provider Entitlement (Edidiong Owoidoho Akpan)
 *   • 20% = ₦200 (20,000 kobo) School Portal-Fee Share (Word of Faith Schools)
 * - School Tuition & All Other School Charges: 100% attributable to Word of Faith Schools.
 * - Partial Instalments ("Portal-fee-first" default):
 *   First cleared kobo apply to the ₦1,000 Portal Fee line (split 80:20 in deterministic integer
 *   kobo) until the term's Portal Fee line is fully satisfied; all subsequent kobo apply 100%
 *   to School Charges (₦0 Provider, ₦0 School Portal Share).
 * - Cumulative caps per student-term: Provider <= ₦800 (80,000 kobo), School Portal Share <= ₦200 (20,000 kobo).
 * - Gateway processing charges: tracked separately from invoice principal; default policy is
 *   `SCHOOL_ABSORBS` (₦0 checkout surcharge) unless `PAYER_SURCHARGE` is explicitly approved.
 */

export const GROSS_PORTAL_FEE_NAIRA = 1000;
export const GROSS_PORTAL_FEE_KOBO = BigInt(100_000);
export const PROVIDER_PORTAL_SHARE_CAP_NAIRA = 800;
export const PROVIDER_PORTAL_SHARE_CAP_KOBO = BigInt(80_000);
export const SCHOOL_PORTAL_SHARE_CAP_NAIRA = 200;
export const SCHOOL_PORTAL_SHARE_CAP_KOBO = BigInt(20_000);
export const FINANCIAL_MODEL_CODE = "PORTAL_FEE_1000_80_20" as const;

// Legacy aliases retained so external references compile cleanly against the updated Model
export const PORTAL_ICT_SERVICE_FEE_NAIRA = PROVIDER_PORTAL_SHARE_CAP_NAIRA;
export const PORTAL_ICT_SERVICE_FEE_KOBO = PROVIDER_PORTAL_SHARE_CAP_KOBO;

export type GatewayFeePolicy = "SCHOOL_ABSORBS" | "PAYER_SURCHARGE";
export type ReversalScope = "FULL" | "TUITION_ONLY" | "PORTAL_FEE_ONLY" | "CHARGEBACK";

export interface TermAllocationInput {
  grossPrincipalPaidKobo: bigint;
  targetPortalFeeKobo?: bigint;
  alreadyAllocatedProviderKobo?: bigint;
  alreadyAllocatedSchoolPortalKobo?: bigint;
  /** @deprecated Legacy parameter: interpreted as prior cumulative Provider share if `alreadyAllocatedProviderKobo` omitted */
  alreadyAllocatedPortalFeeKobo?: bigint;
  gatewayFeeKobo?: bigint;
}

export interface TermAllocationResult {
  grossPrincipalPaidKobo: bigint;
  gatewayFeeKobo: bigint;
  totalChargedKobo: bigint;
  targetPortalFeeKobo: bigint;
  portalFeePortionAppliedKobo: bigint;
  providerShareKobo: bigint;
  schoolPortalShareKobo: bigint;
  schoolChargesShareKobo: bigint;
  /** Total School Allocation = schoolPortalShareKobo + schoolChargesShareKobo */
  schoolShareKobo: bigint;
  remainingPortalFeeAfterKobo: bigint;
  grossPrincipalPaidNaira: number;
  gatewayFeeNaira: number;
  totalChargedNaira: number;
  providerShareNaira: number;
  schoolPortalShareNaira: number;
  schoolChargesShareNaira: number;
  schoolShareNaira: number;
}

/**
 * Splits a target Portal Fee cap (e.g. ₦1,000 = 100,000 kobo, or prorated) into exact
 * integer kobo shares: 80% Provider + 20% School (remainder goes to School so shares sum exact).
 */
export function computePortalFeeBeneficiaryCapsKobo(targetPortalFeeKobo: bigint) {
  const safeGross = targetPortalFeeKobo > BigInt(0) ? targetPortalFeeKobo : BigInt(0);
  const providerCapKobo = (safeGross * BigInt(80)) / BigInt(100);
  const schoolPortalCapKobo = safeGross - providerCapKobo;
  return {
    targetPortalFeeKobo: safeGross,
    providerCapKobo,
    schoolPortalCapKobo,
  };
}

/**
 * Computes Paystack Nigeria NGN checkout convenience surcharge.
 * - Default policy (`SCHOOL_ABSORBS`): returns `0n` (School Main Account absorbs processing charges).
 * - Optional policy (`PAYER_SURCHARGE`): indicative standard Paystack pricing (1.5% + ₦100,
 *   ₦100 waived for transactions < ₦2,500, capped at ₦2,000) added on top so principal settles
 *   intact (only use after written Paystack + legal counsel confirmation).
 */
export function computePaystackConvenienceFeeKobo(
  subtotalKobo: bigint,
  policy: GatewayFeePolicy = "SCHOOL_ABSORBS"
): bigint {
  if (policy === "SCHOOL_ABSORBS" || subtotalKobo <= BigInt(0)) return BigInt(0);

  // Under ₦2,500 total gross: flat ₦100 is waived -> rate is 1.5% -> gross = ceil(S / 0.985)
  const noFlatGross = (subtotalKobo * BigInt(1000) + BigInt(984)) / BigInt(985);
  if (noFlatGross < BigInt(250_000)) {
    return noFlatGross - subtotalKobo;
  }

  // ≥ ₦2,500 total gross: 1.5% + ₦100 (10,000 kobo), capped at ₦2,000 (200,000 kobo)
  const withFlatGross = ((subtotalKobo + BigInt(10_000)) * BigInt(1000) + BigInt(984)) / BigInt(985);
  const rawFee = withFlatGross - subtotalKobo;
  const maxPaystackFeeKobo = BigInt(200_000);
  return rawFee > maxPaystackFeeKobo ? maxPaystackFeeKobo : rawFee;
}

/**
 * Computes Paystack `/transaction/initialize` single-subaccount split parameters where:
 * - School owns the Main Paystack Account (`bearer = "account"`)
 * - Service Provider owns the verified Subaccount
 * In Paystack `/transaction/initialize`, `transaction_charge` sets the flat kobo amount retained
 * by the Main Account (before deducting Paystack fees under `bearer = "account"`), and the
 * Subaccount receives `totalChargedKobo - transaction_charge = providerShareKobo`.
 */
export function computePaystackSubaccountSplitKobo(params: {
  totalChargedKobo: bigint;
  providerShareKobo: bigint;
}) {
  const providerCut =
    params.providerShareKobo > BigInt(0) && params.providerShareKobo <= params.totalChargedKobo
      ? params.providerShareKobo
      : BigInt(0);
  const transactionChargeMainAccountKobo = params.totalChargedKobo - providerCut;
  return {
    transactionChargeMainAccountKobo,
    expectedSubaccountShareKobo: providerCut,
    bearer: "account" as const,
  };
}

/**
 * Allocates a settled fee payment (principal excluding any separate gateway surcharge) under the
 * "Portal-fee-first" 80:20 model:
 * - Applies first kobo of cumulative term payments toward `targetPortalFeeKobo` (default ₦1,000).
 * - Splits each applied kobo 80% Provider / 20% School using deterministic integer kobo rounding
 *   so cumulative Provider <= ₦800 (80%) and cumulative School Portal <= ₦200 (20%).
 * - Allocates 100% of remaining principal to `schoolChargesShareKobo` (Tuition & School Levies).
 */
export function allocateTermPaymentKobo(input: TermAllocationInput): TermAllocationResult {
  const principal = input.grossPrincipalPaidKobo > BigInt(0) ? input.grossPrincipalPaidKobo : BigInt(0);
  const rawTargetPortal =
    input.targetPortalFeeKobo !== undefined && input.targetPortalFeeKobo >= BigInt(0)
      ? input.targetPortalFeeKobo
      : GROSS_PORTAL_FEE_KOBO;

  const { targetPortalFeeKobo, providerCapKobo, schoolPortalCapKobo } =
    computePortalFeeBeneficiaryCapsKobo(rawTargetPortal);

  let priorProvider = BigInt(0);
  let priorSchoolPortal = BigInt(0);

  if (
    input.alreadyAllocatedProviderKobo !== undefined ||
    input.alreadyAllocatedSchoolPortalKobo !== undefined
  ) {
    priorProvider =
      input.alreadyAllocatedProviderKobo && input.alreadyAllocatedProviderKobo > BigInt(0)
        ? input.alreadyAllocatedProviderKobo
        : BigInt(0);
    priorSchoolPortal =
      input.alreadyAllocatedSchoolPortalKobo && input.alreadyAllocatedSchoolPortalKobo > BigInt(0)
        ? input.alreadyAllocatedSchoolPortalKobo
        : BigInt(0);
  } else if (
    input.alreadyAllocatedPortalFeeKobo !== undefined &&
    input.alreadyAllocatedPortalFeeKobo > BigInt(0)
  ) {
    // Legacy compatibility: treat prior Portal allocation proportionally
    const legacy = input.alreadyAllocatedPortalFeeKobo;
    if (legacy >= targetPortalFeeKobo) {
      priorProvider = providerCapKobo;
      priorSchoolPortal = schoolPortalCapKobo;
    } else if (legacy >= providerCapKobo) {
      priorProvider = providerCapKobo;
      priorSchoolPortal = legacy - providerCapKobo;
    } else {
      priorProvider = (legacy * BigInt(80)) / BigInt(100);
      priorSchoolPortal = legacy - priorProvider;
    }
  }

  const gatewayFee =
    input.gatewayFeeKobo !== undefined && input.gatewayFeeKobo > BigInt(0)
      ? input.gatewayFeeKobo
      : BigInt(0);

  const priorPortalGross = priorProvider + priorSchoolPortal;
  const portalStillDue =
    targetPortalFeeKobo > priorPortalGross ? targetPortalFeeKobo - priorPortalGross : BigInt(0);

  const portalFeePortionAppliedKobo = principal < portalStillDue ? principal : portalStillDue;

  const providerRemainingCap =
    providerCapKobo > priorProvider ? providerCapKobo - priorProvider : BigInt(0);
  const schoolPortalRemainingCap =
    schoolPortalCapKobo > priorSchoolPortal ? schoolPortalCapKobo - priorSchoolPortal : BigInt(0);

  let providerShareKobo = BigInt(0);
  let schoolPortalShareKobo = BigInt(0);

  if (portalFeePortionAppliedKobo > BigInt(0)) {
    if (portalFeePortionAppliedKobo === portalStillDue) {
      // Completing the term Portal Fee line: settle exact remaining 80% / 20% caps
      providerShareKobo = providerRemainingCap;
      schoolPortalShareKobo = portalFeePortionAppliedKobo - providerShareKobo;
    } else {
      // Partial within Portal Fee: 80% in integer kobo to Provider, deterministic remainder to School
      const rawProv = (portalFeePortionAppliedKobo * BigInt(80)) / BigInt(100);
      providerShareKobo = rawProv < providerRemainingCap ? rawProv : providerRemainingCap;
      schoolPortalShareKobo = portalFeePortionAppliedKobo - providerShareKobo;

      // Ensure schoolPortalShareKobo never overshoots its 20% cap on unusual sequences
      if (schoolPortalShareKobo > schoolPortalRemainingCap) {
        const overflow = schoolPortalShareKobo - schoolPortalRemainingCap;
        schoolPortalShareKobo = schoolPortalRemainingCap;
        const extraProv =
          providerShareKobo + overflow <= providerRemainingCap
            ? overflow
            : providerRemainingCap - providerShareKobo;
        providerShareKobo += extraProv;
      }
    }
  }

  const schoolChargesShareKobo = principal - (providerShareKobo + schoolPortalShareKobo);
  const schoolShareKobo = schoolPortalShareKobo + schoolChargesShareKobo;
  const remainingPortalFeeAfterKobo =
    portalStillDue - (providerShareKobo + schoolPortalShareKobo);
  const totalChargedKobo = principal + gatewayFee;

  return {
    grossPrincipalPaidKobo: principal,
    gatewayFeeKobo: gatewayFee,
    totalChargedKobo,
    targetPortalFeeKobo,
    portalFeePortionAppliedKobo,
    providerShareKobo,
    schoolPortalShareKobo,
    schoolChargesShareKobo,
    schoolShareKobo,
    remainingPortalFeeAfterKobo,
    grossPrincipalPaidNaira: Number(principal) / 100,
    gatewayFeeNaira: Number(gatewayFee) / 100,
    totalChargedNaira: Number(totalChargedKobo) / 100,
    providerShareNaira: Number(providerShareKobo) / 100,
    schoolPortalShareNaira: Number(schoolPortalShareKobo) / 100,
    schoolChargesShareNaira: Number(schoolChargesShareKobo) / 100,
    schoolShareNaira: Number(schoolShareKobo) / 100,
  };
}

/**
 * Computes itemized obligation totals for a student's term invoice.
 * - `tuitionKobo + leviesKobo` -> School Charges (waived to `0n` if `isSchoolFeesWaived=true`).
 * - `grossPortalFeeKobo` -> `₦1,000` (`100,000 kobo`), optionally prorated (`prorationPct`),
 *   or `0n` if `isPortalFeeExempt=true` by written Board policy.
 */
export function computeTermInvoiceTotals(params: {
  tuitionKobo: bigint;
  leviesKobo: bigint;
  portalFeeKobo?: bigint;
  isSchoolFeesWaived?: boolean;
  isPortalFeeExempt?: boolean;
  portalFeeProrationPct?: number;
}) {
  const waived = Boolean(params.isSchoolFeesWaived);
  const portalExempt = Boolean(params.isPortalFeeExempt);
  const prorationPct =
    typeof params.portalFeeProrationPct === "number" &&
    Number.isFinite(params.portalFeeProrationPct) &&
    params.portalFeeProrationPct >= 0 &&
    params.portalFeeProrationPct <= 100
      ? Math.round(params.portalFeeProrationPct)
      : 100;

  const effectiveTuitionKobo = waived
    ? BigInt(0)
    : params.tuitionKobo > BigInt(0)
    ? params.tuitionKobo
    : BigInt(0);
  const effectiveLeviesKobo = waived
    ? BigInt(0)
    : params.leviesKobo > BigInt(0)
    ? params.leviesKobo
    : BigInt(0);

  const basePortalFeeKobo =
    params.portalFeeKobo !== undefined && params.portalFeeKobo >= BigInt(0)
      ? params.portalFeeKobo
      : GROSS_PORTAL_FEE_KOBO;
  const portalFeeKobo = portalExempt
    ? BigInt(0)
    : (basePortalFeeKobo * BigInt(prorationPct)) / BigInt(100);

  const { providerCapKobo: portalProviderCapKobo, schoolPortalCapKobo: portalSchoolCapKobo } =
    computePortalFeeBeneficiaryCapsKobo(portalFeeKobo);

  const schoolChargesSubtotalKobo = effectiveTuitionKobo + effectiveLeviesKobo;
  const schoolSubtotalKobo = schoolChargesSubtotalKobo;
  const totalInvoiceKobo = schoolChargesSubtotalKobo + portalFeeKobo;

  return {
    effectiveTuitionKobo,
    effectiveLeviesKobo,
    portalFeeKobo,
    portalProviderCapKobo,
    portalSchoolCapKobo,
    schoolChargesSubtotalKobo,
    schoolSubtotalKobo,
    totalSchoolEntitlementKobo: schoolChargesSubtotalKobo + portalSchoolCapKobo,
    totalInvoiceKobo,
  };
}

/**
 * Computes line-item-accurate negative reversal entries for refunds, chargebacks, or rejections:
 * - `FULL` / `CHARGEBACK`: reverses School Charges + School 20% Portal Share + Provider 80% Portal Share.
 * - `TUITION_ONLY`: reverses ONLY `creditedSchoolChargesKobo`; leaves Portal Fee shares untouched.
 * - `PORTAL_FEE_ONLY`: reverses ONLY `creditedProviderKobo` (80%) and `creditedSchoolPortalKobo` (20%).
 */
export function computeReversalAllocationKobo(params: {
  scope?: ReversalScope;
  paymentPrincipalKobo?: bigint;
  creditedSchoolChargesKobo?: bigint;
  creditedSchoolPortalKobo?: bigint;
  creditedSchoolKobo?: bigint;
  creditedProviderKobo: bigint;
  gatewayFeeKobo?: bigint;
}) {
  const scope: ReversalScope = params.scope || "FULL";
  const provCredit = params.creditedProviderKobo > BigInt(0) ? params.creditedProviderKobo : BigInt(0);

  let chargesCredit: bigint;
  let schoolPortalCredit: bigint;
  if (
    params.creditedSchoolChargesKobo !== undefined ||
    params.creditedSchoolPortalKobo !== undefined
  ) {
    chargesCredit =
      params.creditedSchoolChargesKobo && params.creditedSchoolChargesKobo > BigInt(0)
        ? params.creditedSchoolChargesKobo
        : BigInt(0);
    schoolPortalCredit =
      params.creditedSchoolPortalKobo && params.creditedSchoolPortalKobo > BigInt(0)
        ? params.creditedSchoolPortalKobo
        : BigInt(0);
  } else {
    const legacySchool =
      params.creditedSchoolKobo && params.creditedSchoolKobo > BigInt(0)
        ? params.creditedSchoolKobo
        : BigInt(0);
    chargesCredit = legacySchool;
    schoolPortalCredit = BigInt(0);
  }

  let revProvider = BigInt(0);
  let revSchoolPortal = BigInt(0);
  let revSchoolCharges = BigInt(0);

  if (scope === "TUITION_ONLY") {
    revSchoolCharges = -chargesCredit;
  } else if (scope === "PORTAL_FEE_ONLY") {
    revProvider = -provCredit;
    revSchoolPortal = -schoolPortalCredit;
  } else {
    revProvider = -provCredit;
    revSchoolPortal = -schoolPortalCredit;
    revSchoolCharges = -chargesCredit;
  }

  const revSchoolTotal = revSchoolPortal + revSchoolCharges;
  const revGrossPrincipal = revProvider + revSchoolTotal;
  const gatewayFee =
    params.gatewayFeeKobo && params.gatewayFeeKobo > BigInt(0) ? params.gatewayFeeKobo : BigInt(0);

  return {
    scope,
    grossPrincipalReversedKobo: revGrossPrincipal,
    providerShareKobo: revProvider,
    schoolPortalShareKobo: revSchoolPortal,
    schoolChargesShareKobo: revSchoolCharges,
    schoolShareKobo: revSchoolTotal,
    gatewayFeeKobo: gatewayFee,
  };
}
