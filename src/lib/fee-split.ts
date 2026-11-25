/**
 * Authoritative Financial Split & Allocation Engine (Model A — Per-Student, Per-Term)
 *
 * Commercial Specification:
 * - Tuition & School Levies: 100% belongs to Word of Faith Schools.
 * - Portal / ICT Service Fee (₦800 per student, per academic term): 100% belongs to the Service Provider.
 * - Even when a student receives a 100% School Tuition/Levies waiver, the ₦800 Portal/ICT Service Fee
 *   remains payable once per term.
 * - On partial installments within a term, the ₦800 Portal/ICT Service Fee is satisfied first on the
 *   first settled installment(s); subsequent installments in the same term carry ₦0 Portal Fee so the
 *   Service Provider never exceeds ₦800 per student per term.
 * - Online Checkout Convenience Charge (Paystack Option A): Borne by the payer on top of the fee subtotal
 *   so 100% of Tuition/Levies and 100% of the ₦800 Portal Fee are preserved net of gateway charges.
 */

export const PORTAL_ICT_SERVICE_FEE_NAIRA = 800;
export const PORTAL_ICT_SERVICE_FEE_KOBO = BigInt(80_000);
export const FINANCIAL_MODEL_CODE = "MODEL_A_PER_TERM_800" as const;

export type GatewayFeePolicy = "PAYER_SURCHARGE" | "SCHOOL_ABSORBS";

export interface TermAllocationInput {
  grossPrincipalPaidKobo: bigint;
  targetPortalFeeKobo?: bigint;
  alreadyAllocatedPortalFeeKobo?: bigint;
  gatewayFeeKobo?: bigint;
}

export interface TermAllocationResult {
  grossPrincipalPaidKobo: bigint;
  gatewayFeeKobo: bigint;
  totalChargedKobo: bigint;
  providerShareKobo: bigint;
  schoolShareKobo: bigint;
  remainingPortalFeeAfterKobo: bigint;
  grossPrincipalPaidNaira: number;
  gatewayFeeNaira: number;
  totalChargedNaira: number;
  providerShareNaira: number;
  schoolShareNaira: number;
}

/**
 * Computes Paystack Nigeria NGN checkout convenience fee.
 * - Under `PAYER_SURCHARGE` (Option A): applies indicative standard Paystack pricing (1.5% + ₦100,
 *   ₦100 waived for transactions < ₦2,500, capped at ₦2,000) as a gross-up so net settlement
 *   preserves `subtotalKobo`. Actual merchant/educational tariff & surcharge legality should be
 *   confirmed with Paystack/legal counsel; switchable to `SCHOOL_ABSORBS` (`₦0` surcharge) in PortalSetting.
 */
export function computePaystackConvenienceFeeKobo(
  subtotalKobo: bigint,
  policy: GatewayFeePolicy = "PAYER_SURCHARGE"
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
 * Computes exact Paystack single-subaccount split parameters when the School owns the Main
 * Paystack merchant account (`bearer = "account"`) and the optional subaccount belongs to the
 * Service Provider.
 *
 * In Paystack's API, `transaction_charge` is the flat kobo amount allocated to the Main Account
 * (before deducting Paystack gateway fees under `bearer = "account"`), while the Subaccount
 * receives `totalChargedKobo - transaction_charge`.
 * Setting `transaction_charge = totalChargedKobo - providerShareKobo` ensures the Provider Subaccount
 * receives exact `providerShareKobo` (₦800 once per term) while the Main Account receives
 * `schoolShareKobo + gatewayFeeKobo` (covering Paystack processing under Option A).
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
 * Allocates a settled fee payment (principal excluding gateway pass-through surcharge) under Model A:
 * - Caps cumulative Provider Portal/ICT fee across the term at `targetPortalFeeKobo` (default ₦800).
 * - First settled kobo satisfy any unpaid Portal/ICT Service Fee up to the term cap; all remaining kobo
 *   go 100% to the School.
 */
export function allocateTermPaymentKobo(input: TermAllocationInput): TermAllocationResult {
  const principal = input.grossPrincipalPaidKobo > BigInt(0) ? input.grossPrincipalPaidKobo : BigInt(0);
  const targetPortal =
    input.targetPortalFeeKobo !== undefined && input.targetPortalFeeKobo >= BigInt(0)
      ? input.targetPortalFeeKobo
      : PORTAL_ICT_SERVICE_FEE_KOBO;
  const priorPortal =
    input.alreadyAllocatedPortalFeeKobo !== undefined && input.alreadyAllocatedPortalFeeKobo > BigInt(0)
      ? input.alreadyAllocatedPortalFeeKobo
      : BigInt(0);
  const gatewayFee =
    input.gatewayFeeKobo !== undefined && input.gatewayFeeKobo > BigInt(0)
      ? input.gatewayFeeKobo
      : BigInt(0);

  const portalStillDue = targetPortal > priorPortal ? targetPortal - priorPortal : BigInt(0);
  const providerShareKobo = principal < portalStillDue ? principal : portalStillDue;
  const schoolShareKobo = principal - providerShareKobo;
  const remainingPortalFeeAfterKobo = portalStillDue - providerShareKobo;
  const totalChargedKobo = principal + gatewayFee;

  return {
    grossPrincipalPaidKobo: principal,
    gatewayFeeKobo: gatewayFee,
    totalChargedKobo,
    providerShareKobo,
    schoolShareKobo,
    remainingPortalFeeAfterKobo,
    grossPrincipalPaidNaira: Number(principal) / 100,
    gatewayFeeNaira: Number(gatewayFee) / 100,
    totalChargedNaira: Number(totalChargedKobo) / 100,
    providerShareNaira: Number(providerShareKobo) / 100,
    schoolShareNaira: Number(schoolShareKobo) / 100,
  };
}

/**
 * Computes line-item obligation totals for a student's term invoice.
 * Even when School Tuition & Levies are waived (100% scholarship / Bursar waiver),
 * the ₦800 Portal/ICT Service Fee remains billable unless explicitly overridden by contract amendment.
 */
export function computeTermInvoiceTotals(params: {
  tuitionKobo: bigint;
  leviesKobo: bigint;
  portalFeeKobo?: bigint;
  isSchoolFeesWaived?: boolean;
}) {
  const waived = Boolean(params.isSchoolFeesWaived);
  const effectiveTuitionKobo = waived ? BigInt(0) : params.tuitionKobo > BigInt(0) ? params.tuitionKobo : BigInt(0);
  const effectiveLeviesKobo = waived ? BigInt(0) : params.leviesKobo > BigInt(0) ? params.leviesKobo : BigInt(0);
  const portalFeeKobo =
    params.portalFeeKobo !== undefined && params.portalFeeKobo >= BigInt(0)
      ? params.portalFeeKobo
      : PORTAL_ICT_SERVICE_FEE_KOBO;

  const schoolSubtotalKobo = effectiveTuitionKobo + effectiveLeviesKobo;
  const totalInvoiceKobo = schoolSubtotalKobo + portalFeeKobo;

  return {
    effectiveTuitionKobo,
    effectiveLeviesKobo,
    portalFeeKobo,
    schoolSubtotalKobo,
    totalInvoiceKobo,
  };
}

/**
 * Computes negative reversal split when an approved payment is refunded or disputed/charged back.
 */
export function computeReversalAllocationKobo(params: {
  paymentPrincipalKobo: bigint;
  creditedSchoolKobo: bigint;
  creditedProviderKobo: bigint;
  gatewayFeeKobo?: bigint;
}) {
  const reversalSchoolKobo = -BigInt(params.creditedSchoolKobo > BigInt(0) ? params.creditedSchoolKobo : BigInt(0));
  const reversalProviderKobo = -BigInt(params.creditedProviderKobo > BigInt(0) ? params.creditedProviderKobo : BigInt(0));
  const gatewayFee = params.gatewayFeeKobo && params.gatewayFeeKobo > BigInt(0) ? params.gatewayFeeKobo : BigInt(0);

  return {
    grossPrincipalReversedKobo: -BigInt(params.paymentPrincipalKobo > BigInt(0) ? params.paymentPrincipalKobo : BigInt(0)),
    schoolShareKobo: reversalSchoolKobo,
    providerShareKobo: reversalProviderKobo,
    gatewayFeeKobo: gatewayFee,
  };
}
