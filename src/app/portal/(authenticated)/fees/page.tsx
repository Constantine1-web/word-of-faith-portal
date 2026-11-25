"use client";

import { useEffect, useState, useCallback } from "react";
import {
  getOrCreateStudentFeeOrder,
  initializePayment,
  uploadBankTellerReceipt,
  verifyPaystackPayment,
} from "@/app/actions/payments";
import {
  allocateTermPaymentKobo,
  computePaystackConvenienceFeeKobo,
} from "@/lib/fee-split";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  FiLock,
  FiCheckCircle,
  FiCopy,
  FiUploadCloud,
  FiClock,
  FiCreditCard,
  FiCheck,
  FiUsers,
} from "react-icons/fi";

export default function PayFeesPage() {
  const searchParams = useSearchParams();
  const paymentStatus = searchParams.get("payment");
  const initialStudentParam = searchParams.get("studentId");

  const [selectedStudentId, setSelectedStudentId] = useState<number | undefined>(() => {
    const n = Number(initialStudentParam);
    return Number.isInteger(n) && n > 0 ? n : undefined;
  });
  const [activeTab, setActiveTab] = useState<"ONLINE" | "TELLER">("ONLINE");
  const [feeOrder, setFeeOrder] = useState<any>(null);
  const [loadingOrder, setLoadingOrder] = useState(true);

  // Payment mode (Full remaining balance vs Custom Installment >= ₦1,000)
  const [paymentMode, setPaymentMode] = useState<"FULL" | "PARTIAL">("FULL");
  const [customAmountNaira, setCustomAmountNaira] = useState<string>("");

  // Online gateway state
  const [onlineLoading, setOnlineLoading] = useState(false);
  const [onlineError, setOnlineError] = useState("");

  // Bank teller upload state
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [bankName, setBankName] = useState("");
  const [tellerNumber, setTellerNumber] = useState("");
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split("T")[0]);
  const [tellerLoading, setTellerLoading] = useState(false);
  const [tellerError, setTellerError] = useState("");
  const [tellerSuccess, setTellerSuccess] = useState("");

  const [copiedTrackingId, setCopiedTrackingId] = useState(false);
  const [copiedAccount, setCopiedAccount] = useState(false);

  const loadOrder = useCallback(
    async (studentIdOverride?: number) => {
      setLoadingOrder(true);
      const ref = searchParams.get("reference") || searchParams.get("trxref");
      if (paymentStatus === "verify" && ref) {
        try {
          await verifyPaystackPayment(ref);
        } catch (e) {
          console.error("Auto verification error:", e);
        }
      }

      const res = await getOrCreateStudentFeeOrder(studentIdOverride);
      if (res.success) {
        setFeeOrder(res);
        setSelectedStudentId(res.selectedStudentId);
        if (res.hasUploadedReceipt) {
          setActiveTab("TELLER");
        }
      }
      setLoadingOrder(false);
    },
    [paymentStatus, searchParams]
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const ref = searchParams.get("reference") || searchParams.get("trxref");
      if (paymentStatus === "verify" && ref) {
        try {
          await verifyPaystackPayment(ref);
        } catch (e) {
          console.error("Auto verification error:", e);
        }
      }

      const res = await getOrCreateStudentFeeOrder(selectedStudentId);
      if (cancelled) return;
      if (res.success) {
        setFeeOrder(res);
        setSelectedStudentId(res.selectedStudentId);
        if (res.hasUploadedReceipt) {
          setActiveTab("TELLER");
        }
      }
      setLoadingOrder(false);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paymentStatus, searchParams]);

  const handleSelectWard = async (studentId: number) => {
    setSelectedStudentId(studentId);
    setOnlineError("");
    setTellerError("");
    setTellerSuccess("");
    setPaymentMode("FULL");
    setCustomAmountNaira("");
    await loadOrder(studentId);
  };

  const handleCopy = (text: string, type: "tracking" | "account") => {
    navigator.clipboard.writeText(text);
    if (type === "tracking") {
      setCopiedTrackingId(true);
      setTimeout(() => setCopiedTrackingId(false), 2500);
    } else {
      setCopiedAccount(true);
      setTimeout(() => setCopiedAccount(false), 2500);
    }
  };

  const remainingDueNaira = Number(feeOrder?.remainingDueNaira ?? feeOrder?.amount ?? 0);
  const alreadyPaidNaira = Number(feeOrder?.alreadyPaidNaira ?? 0);

  const chosenPrincipalNaira =
    paymentMode === "PARTIAL"
      ? Math.min(
          remainingDueNaira,
          Math.max(Math.min(500, remainingDueNaira), Number(customAmountNaira) || 0)
        )
      : remainingDueNaira;

  const principalKobo = BigInt(Math.round(Math.max(0, chosenPrincipalNaira) * 100));
  const gatewayFeePolicy =
    feeOrder?.bankConfig?.gatewayFeePolicy === "PAYER_SURCHARGE"
      ? "PAYER_SURCHARGE"
      : "SCHOOL_ABSORBS";
  const gatewayFeeKobo = computePaystackConvenienceFeeKobo(principalKobo, gatewayFeePolicy);
  const gatewayFeeNaira = Number(gatewayFeeKobo) / 100;
  const totalPaystackChargeNaira = Number(principalKobo + gatewayFeeKobo) / 100;

  const targetPortalNaira = Number(feeOrder?.feeBreakdown?.maintenanceFeeNaira ?? 1000);
  const providerCapNaira = Number(feeOrder?.feeBreakdown?.providerPortionNaira ?? 800);
  const schoolPortalCapNaira = Number(feeOrder?.feeBreakdown?.schoolPortalPortionNaira ?? 200);
  const previewAlloc = allocateTermPaymentKobo({
    grossPrincipalPaidKobo: principalKobo,
    targetPortalFeeKobo: BigInt(Math.round(targetPortalNaira * 100)),
    alreadyAllocatedProviderKobo: BigInt(
      Math.round(Math.max(0, providerCapNaira - Number(feeOrder?.providerDueNaira ?? 0)) * 100)
    ),
    alreadyAllocatedSchoolPortalKobo: BigInt(
      Math.round(
        Math.max(0, schoolPortalCapNaira - Number(feeOrder?.schoolPortalDueNaira ?? 0)) * 100
      )
    ),
    gatewayFeeKobo,
  });

  // Portion of current payment that clears Portal ICT Fee vs School Charges
  const currentPortalPortionNaira = Number(previewAlloc.portalFeePortionAppliedKobo) / 100;
  const currentSchoolChargesPortionNaira = previewAlloc.schoolChargesShareNaira;
  const currentSchoolPortionNaira = previewAlloc.schoolShareNaira;

  const handleOnlinePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    setOnlineLoading(true);
    setOnlineError("");

    const res = await initializePayment({
      amount: chosenPrincipalNaira,
      description: `Consolidated School Fees (${feeOrder?.feeBreakdown?.levelDisplayName || "Term"})`,
      termId: feeOrder?.term?.TermID || 1,
      trackingId: feeOrder?.trackingId,
      targetStudentId: selectedStudentId,
    });

    if (res.error) {
      setOnlineError(res.error);
      setOnlineLoading(false);
    } else if (res.authorizationUrl) {
      window.location.href = res.authorizationUrl;
    }
  };

  const handleTellerUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!receiptFile) {
      setTellerError("Please choose a receipt file to upload.");
      return;
    }

    setTellerLoading(true);
    setTellerError("");
    setTellerSuccess("");

    const formData = new FormData();
    formData.append("receipt", receiptFile);
    formData.append("trackingId", feeOrder?.trackingId || "");
    formData.append("bankName", bankName);
    formData.append("tellerNumber", tellerNumber);
    formData.append("paymentDate", paymentDate);
    formData.append("amount", String(chosenPrincipalNaira));
    if (selectedStudentId) {
      formData.append("studentId", String(selectedStudentId));
    }

    const res = await uploadBankTellerReceipt(formData);

    if (res.success) {
      setTellerSuccess(res.message || "Receipt submitted successfully!");
      setReceiptFile(null);
      await loadOrder(selectedStudentId);
    } else {
      setTellerError(res.error || "Failed to submit receipt.");
    }
    setTellerLoading(false);
  };

  const wardsList: Array<{ studentId: number; admissionNo: string; fullName: string; className: string }> =
    feeOrder?.wards || [];

  const renderWardSwitcher = () => {
    if (wardsList.length <= 1) return null;
    return (
      <div
        style={{
          background: "var(--bg-card)",
          border: "1px solid var(--border-primary)",
          borderRadius: "var(--radius-md)",
          padding: "1rem 1.25rem",
          marginBottom: "1.5rem",
        }}
      >
        <div style={{ fontSize: "0.8rem", fontWeight: 800, textTransform: "uppercase", color: "var(--text-muted)", marginBottom: "0.65rem", display: "flex", alignItems: "center", gap: "0.4rem" }}>
          <FiUsers /> Select Child / Ward to Pay For
        </div>
        <div style={{ display: "flex", gap: "0.65rem", flexWrap: "wrap" }}>
          {wardsList.map((w) => {
            const active = w.studentId === selectedStudentId;
            return (
              <button
                key={w.studentId}
                type="button"
                onClick={() => handleSelectWard(w.studentId)}
                style={{
                  padding: "0.55rem 0.95rem",
                  borderRadius: "var(--radius-md)",
                  border: active ? "2px solid var(--color-primary-green)" : "1px solid var(--border-primary)",
                  background: active ? "var(--status-success-bg)" : "var(--bg-secondary)",
                  color: active ? "var(--status-success-text)" : "var(--text-primary)",
                  fontWeight: 700,
                  cursor: "pointer",
                  fontSize: "0.86rem",
                  textAlign: "left",
                }}
              >
                <div>{w.fullName}</div>
                <div style={{ fontSize: "0.74rem", opacity: 0.85 }}>{w.className} · {w.admissionNo}</div>
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  if (paymentStatus === "verify") {
    return (
      <div style={{ padding: "4rem 2rem", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center" }}>
        <div style={{ fontSize: "5rem", color: "var(--color-primary-green)", marginBottom: "1rem" }}>
          <FiCheckCircle />
        </div>
        <h1 style={{ color: "var(--color-navy-blue)", marginBottom: "1rem" }}>Payment Verified!</h1>
        <p style={{ color: "var(--color-gray-600)", fontSize: "1.1rem" }}>Your school fees transaction has been verified and recorded.</p>
        <Link href="/portal/fees/status" className="btn btn-primary" style={{ marginTop: "1.5rem" }}>
          View Transaction Status
        </Link>
      </div>
    );
  }

  if (loadingOrder) {
    return (
      <div style={{ padding: "3rem", textAlign: "center", color: "var(--color-gray-600)" }}>
        Loading term fee invoice and clearance status...
      </div>
    );
  }

  if (feeOrder?.isCleared) {
    return (
      <div style={{ padding: "clamp(1rem, 2.5vw, 2rem)", maxWidth: "740px", margin: "0 auto" }}>
        {renderWardSwitcher()}
        <div
          style={{
            background: "var(--color-white)",
            padding: "clamp(1.5rem, 4vw, 2.5rem)",
            borderRadius: "var(--radius-lg)",
            boxShadow: "var(--shadow-floating)",
            borderTop: "6px solid var(--color-primary-green)",
            textAlign: "center",
          }}
        >
          <div style={{ width: "72px", height: "72px", borderRadius: "50%", background: "var(--status-success-bg)", color: "var(--status-success-text)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "2.5rem", margin: "0 auto 1.5rem" }}>
            <FiCheckCircle />
          </div>

          <h1 style={{ color: "var(--color-navy-blue)", fontSize: "1.75rem", marginBottom: "0.5rem" }}>
            Financial Clearance Granted
          </h1>
          <p style={{ color: "var(--color-gray-700)", fontSize: "1.05rem", marginBottom: "1.5rem" }}>
            Term fees for <strong>{feeOrder.term?.SessionName} ({feeOrder.term?.TermName})</strong> have been verified and cleared by the Bursary.
          </p>

          <div style={{ background: "var(--color-gray-50)", padding: "1.25rem", borderRadius: "var(--radius-md)", marginBottom: "2rem", textAlign: "left", display: "grid", gap: "0.75rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid var(--color-gray-200)", paddingBottom: "0.5rem" }}>
              <span style={{ color: "var(--color-gray-500)" }}>Invoice / Reference:</span>
              <strong style={{ color: "var(--color-navy-blue)", fontFamily: "monospace" }}>{feeOrder.trackingId}</strong>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid var(--color-gray-200)", paddingBottom: "0.5rem" }}>
              <span style={{ color: "var(--color-gray-500)" }}>Student Name:</span>
              <strong>{feeOrder.student?.PreferredName || feeOrder.student?.AdmissionNo}</strong>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid var(--color-gray-200)", paddingBottom: "0.5rem" }}>
              <span style={{ color: "var(--color-gray-500)" }}>WOFS Student ID:</span>
              <strong>{feeOrder.student?.AdmissionNo}</strong>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "var(--color-gray-500)" }}>Total Principal Cleared:</span>
              <strong style={{ color: "var(--color-primary-green)" }}>₦{alreadyPaidNaira.toLocaleString()}</strong>
            </div>
          </div>

          <div style={{ display: "flex", gap: "1rem", justifyContent: "center", flexWrap: "wrap" }}>
            <Link href="/portal/fees/history" className="btn btn-primary" style={{ padding: "0.75rem 1.5rem" }}>
              View Payment History
            </Link>
            <Link href="/portal/results" className="btn btn-outline" style={{ padding: "0.75rem 1.5rem" }}>
              Check Term Results
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const trackingId = feeOrder?.trackingId || "WOF-PAY-PENDING";
  const bankConfig = feeOrder?.bankConfig || {
    bankName: "Zenith Bank PLC",
    accountName: "Word of Faith Schools",
    accountNumber: "1015694201",
  };

  return (
    <div style={{ padding: "1.5rem", maxWidth: "820px", margin: "0 auto" }}>
      <div style={{ marginBottom: "1.75rem", borderBottom: "2px solid var(--color-gray-200)", paddingBottom: "1rem" }}>
        <h1 style={{ color: "var(--color-navy-blue)", margin: 0, fontSize: "1.75rem" }}>
          School Fees Clearance &amp; Payment
        </h1>
        <p style={{ color: "var(--color-gray-600)", margin: "0.35rem 0 0 0", fontSize: "0.95rem" }}>
          {feeOrder?.term?.SessionName} • {feeOrder?.term?.TermName} — Clear term invoice to unlock terminal report cards.
        </p>
      </div>

      {renderWardSwitcher()}

      {/* Bill & Tracking ID Hero Card */}
      <div style={{ background: "linear-gradient(135deg, #0b2216 0%, #143424 100%)", color: "#ffffff", padding: "1.75rem", borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-floating)", marginBottom: "2rem", border: "1px solid rgba(212, 175, 55, 0.4)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "1rem" }}>
          <div>
            <span style={{ display: "inline-block", background: "rgba(212, 175, 55, 0.2)", color: "#fbbf24", border: "1px solid #d97706", padding: "0.2rem 0.65rem", borderRadius: "var(--radius-full)", fontSize: "0.75rem", fontWeight: "bold", marginBottom: "0.5rem" }}>
              ITEMIZED TERM FEE INVOICE ({feeOrder?.student?.PreferredName || feeOrder?.student?.AdmissionNo})
            </span>
            <h2 style={{ fontSize: "1.4rem", margin: "0 0 0.25rem 0", color: "#ffffff" }}>
              {feeOrder?.feeBreakdown?.levelDisplayName
                ? `${feeOrder.feeBreakdown.levelDisplayName} Term Invoice`
                : "Comprehensive Term Invoice"}
            </h2>
            <p style={{ margin: 0, color: "#d1fae5", fontSize: "0.85rem" }}>
              {feeOrder?.feeBreakdown?.isSchoolFeesWaived
                ? `Tuition & Levies Waived (Scholarship) · Portal/ICT Service Fee: ₦${feeOrder.feeBreakdown.maintenanceFeeNaira.toLocaleString()}`
                : `Tuition: ₦${(feeOrder?.feeBreakdown?.tuitionNaira || 0).toLocaleString()} · Levies: ₦${(feeOrder?.feeBreakdown?.leviesNaira || 0).toLocaleString()} · Portal/ICT Fee (1x/term): ₦${(feeOrder?.feeBreakdown?.maintenanceFeeNaira ?? 1000).toLocaleString()}`}
            </p>
            {alreadyPaidNaira > 0 && (
              <p style={{ margin: "0.35rem 0 0", color: "#86efac", fontSize: "0.82rem", fontWeight: 700 }}>
                Already Paid &amp; Credited: ₦{alreadyPaidNaira.toLocaleString()}
              </p>
            )}
          </div>

          <div style={{ textAlign: "right" }}>
            <span style={{ fontSize: "0.8rem", color: "#e2e8f0", display: "block" }}>Remaining Balance Due:</span>
            <span style={{ fontSize: "2rem", fontWeight: "bold", color: "#ffffff" }}>
              ₦{remainingDueNaira.toLocaleString()}
            </span>
          </div>
        </div>

        <div style={{ marginTop: "1.25rem", padding: "0.85rem 1.15rem", background: "rgba(0, 0, 0, 0.35)", borderRadius: "var(--radius-md)", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "0.75rem", border: "1px dashed rgba(255, 255, 255, 0.25)" }}>
          <div>
            <span style={{ fontSize: "0.75rem", color: "#d1fae5", display: "block" }}>Your Order Tracking ID:</span>
            <strong style={{ fontFamily: "monospace", fontSize: "1.1rem", letterSpacing: "1px", color: "#fef08a" }}>
              {trackingId}
            </strong>
          </div>
          <button
            type="button"
            onClick={() => handleCopy(trackingId, "tracking")}
            style={{ background: copiedTrackingId ? "#15803d" : "rgba(255, 255, 255, 0.15)", color: "#ffffff", border: "none", padding: "0.4rem 0.85rem", borderRadius: "var(--radius-sm)", fontSize: "0.85rem", cursor: "pointer", display: "flex", alignItems: "center", gap: "0.4rem" }}
          >
            {copiedTrackingId ? <FiCheck /> : <FiCopy />}
            {copiedTrackingId ? "Copied!" : "Copy Tracking ID"}
          </button>
        </div>
      </div>

      {/* Installment Selector */}
      {remainingDueNaira > 500 && (
        <div style={{ background: "var(--bg-card)", border: "1px solid var(--border-primary)", borderRadius: "var(--radius-md)", padding: "1rem 1.25rem", marginBottom: "1.5rem" }}>
          <div style={{ fontSize: "0.84rem", fontWeight: 700, color: "var(--text-heading)", marginBottom: "0.6rem" }}>
            Payment Amount Option
          </div>
          <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", alignItems: "center" }}>
            <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", cursor: "pointer", fontSize: "0.9rem", fontWeight: 600 }}>
              <input type="radio" name="payMode" checked={paymentMode === "FULL"} onChange={() => setPaymentMode("FULL")} />
              Full Balance (₦{remainingDueNaira.toLocaleString()})
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", cursor: "pointer", fontSize: "0.9rem", fontWeight: 600 }}>
              <input type="radio" name="payMode" checked={paymentMode === "PARTIAL"} onChange={() => setPaymentMode("PARTIAL")} />
              Partial Installment
            </label>
            {paymentMode === "PARTIAL" && (
              <input
                type="number"
                min={500}
                max={remainingDueNaira}
                step={500}
                placeholder={`₦500 – ₦${remainingDueNaira.toLocaleString()}`}
                value={customAmountNaira}
                onChange={(e) => setCustomAmountNaira(e.target.value)}
                className="form-input"
                style={{ width: "210px" }}
              />
            )}
          </div>
          <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: "0.45rem" }}>
            The single ₦1,000 Portal/ICT Fee (₦800 Provider · ₦200 School) is settled once per term on your first installment; additional installments apply 100% to Tuition &amp; Levies.
          </div>
        </div>
      )}

      {/* Channel Tabs */}
      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1.5rem" }}>
        <button
          type="button"
          onClick={() => setActiveTab("ONLINE")}
          style={{ flex: 1, padding: "0.9rem", fontWeight: "bold", borderRadius: "var(--radius-md)", border: activeTab === "ONLINE" ? "2px solid var(--color-primary-green)" : "1px solid var(--color-gray-300)", background: activeTab === "ONLINE" ? "var(--color-white)" : "var(--color-gray-100)", color: activeTab === "ONLINE" ? "var(--color-navy-blue)" : "var(--color-gray-600)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem" }}
        >
          <FiCreditCard /> Pay Online (Paystack)
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("TELLER")}
          style={{ flex: 1, padding: "0.9rem", fontWeight: "bold", borderRadius: "var(--radius-md)", border: activeTab === "TELLER" ? "2px solid var(--color-primary-green)" : "1px solid var(--color-gray-300)", background: activeTab === "TELLER" ? "var(--color-white)" : "var(--color-gray-100)", color: activeTab === "TELLER" ? "var(--color-navy-blue)" : "var(--color-gray-600)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem" }}
        >
          <FiUploadCloud /> Bank Transfer / Teller Upload
        </button>
      </div>

      {/* Tab 1: Online Gateway */}
      {activeTab === "ONLINE" && (
        <div style={{ background: "var(--color-white)", padding: "2rem", borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-sm)", border: "1px solid var(--color-gray-200)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--color-gray-200)", paddingBottom: "1rem", marginBottom: "1.25rem" }}>
            <h3 style={{ color: "var(--color-navy-blue)", margin: 0, display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <FiLock style={{ color: "var(--color-primary-green)" }} /> Automated Paystack Checkout
            </h3>
            <span style={{ background: "rgba(34, 197, 94, 0.1)", color: "var(--color-primary-green)", padding: "0.25rem 0.75rem", borderRadius: "var(--radius-full)", fontSize: "0.85rem", fontWeight: "bold" }}>
              Instant Clearance
            </span>
          </div>

          {onlineError && (
            <div style={{ background: "var(--status-error-bg)", color: "var(--status-error-text)", border: "1px solid var(--status-error-border)", padding: "0.75rem 1rem", borderRadius: "var(--radius-sm)", marginBottom: "1.25rem", fontSize: "0.9rem" }}>
              {onlineError}
            </div>
          )}

          <form onSubmit={handleOnlinePayment} style={{ display: "grid", gap: "1.25rem" }}>
            <div style={{ background: "var(--color-gray-50)", padding: "1.25rem", borderRadius: "var(--radius-md)", border: "1px solid var(--color-gray-200)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.45rem", fontSize: "0.92rem" }}>
                <span style={{ color: "var(--color-gray-600)" }}>School Tuition &amp; Levies (100% School):</span>
                <strong>₦{currentSchoolChargesPortionNaira.toLocaleString()}</strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.45rem", fontSize: "0.92rem" }}>
                <span style={{ color: "var(--color-gray-600)" }}>
                  Portal / ICT Fee Applied (₦{previewAlloc.providerShareNaira.toLocaleString()} Provider · ₦{previewAlloc.schoolPortalShareNaira.toLocaleString()} School):
                </span>
                <strong>₦{currentPortalPortionNaira.toLocaleString()}</strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.45rem", fontSize: "0.92rem" }}>
                <span style={{ color: "var(--color-gray-600)" }}>
                  {gatewayFeePolicy === "SCHOOL_ABSORBS"
                    ? "Paystack Processing Fee (Covered by School):"
                    : "Paystack Checkout Convenience Charge:"}
                </span>
                <strong>₦{gatewayFeeNaira.toLocaleString()}</strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", borderTop: "1px solid var(--color-gray-200)", paddingTop: "0.55rem", fontSize: "1.1rem" }}>
                <strong style={{ color: "var(--color-navy-blue)" }}>Total Gateway Checkout Amount:</strong>
                <strong style={{ color: "var(--color-primary-green)" }}>₦{totalPaystackChargeNaira.toLocaleString()}</strong>
              </div>
            </div>

            <button
              type="submit"
              disabled={onlineLoading || chosenPrincipalNaira <= 0}
              className="btn btn-primary"
              style={{ padding: "1rem", fontSize: "1.05rem", display: "flex", justifyContent: "center", alignItems: "center", gap: "0.5rem" }}
            >
              {onlineLoading ? "Redirecting to Paystack..." : `Proceed to Pay ₦${totalPaystackChargeNaira.toLocaleString()}`}
            </button>
          </form>
        </div>
      )}

      {/* Tab 2: Bank Teller Upload */}
      {activeTab === "TELLER" && (
        <div style={{ background: "var(--bg-card)", padding: "clamp(1rem, 2.5vw, 2rem)", borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-sm)", border: "1px solid var(--border-subtle)" }}>
          <div style={{ background: "var(--status-success-bg)", border: "1px solid var(--status-success-border)", padding: "1.5rem", borderRadius: "var(--radius-md)", marginBottom: "1.75rem" }}>
            <h4 style={{ color: "var(--status-success-text)", margin: "0 0 0.75rem 0", display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <FiCheckCircle /> Official School Bank Account Details
            </h4>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "1rem" }}>
              <div>
                <span style={{ fontSize: "0.8rem", color: "var(--text-muted)", display: "block" }}>Bank:</span>
                <strong style={{ color: "var(--text-primary)", fontSize: "1rem" }}>{bankConfig.bankName}</strong>
              </div>
              <div>
                <span style={{ fontSize: "0.8rem", color: "var(--text-muted)", display: "block" }}>Account Name:</span>
                <strong style={{ color: "var(--text-primary)", fontSize: "1rem" }}>{bankConfig.accountName}</strong>
              </div>
              <div>
                <span style={{ fontSize: "0.8rem", color: "var(--text-muted)", display: "block" }}>Account Number:</span>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <strong style={{ color: "var(--status-success-text)", fontSize: "1.1rem", letterSpacing: "1px", fontFamily: "monospace" }}>
                    {bankConfig.accountNumber}
                  </strong>
                  <button
                    type="button"
                    onClick={() => handleCopy(bankConfig.accountNumber, "account")}
                    title="Copy Account Number"
                    style={{ background: "none", border: "none", cursor: "pointer", color: "var(--status-success-text)" }}
                  >
                    {copiedAccount ? <FiCheck /> : <FiCopy />}
                  </button>
                </div>
              </div>
            </div>

            <div style={{ marginTop: "1rem", background: "var(--bg-card)", padding: "0.75rem 1rem", borderRadius: "var(--radius-sm)", border: "1px solid var(--status-success-border)", fontSize: "0.85rem", color: "var(--status-success-text)" }}>
              <strong>Transfer Amount:</strong> ₦{chosenPrincipalNaira.toLocaleString()} (School Net: ₦{currentSchoolPortionNaira.toLocaleString()} + Provider Portal Share: ₦{previewAlloc.providerShareNaira.toLocaleString()}) · <strong>Remark:</strong> <code>{trackingId}</code>
            </div>
          </div>

          {feeOrder?.hasUploadedReceipt && (
            <div style={{ background: "var(--status-warning-bg)", border: "1px solid var(--status-warning-border)", color: "var(--status-warning-text)", padding: "1rem 1.25rem", borderRadius: "var(--radius-md)", marginBottom: "1.5rem", display: "flex", alignItems: "center", gap: "0.75rem" }}>
              <FiClock style={{ fontSize: "1.5rem", flexShrink: 0 }} />
              <div>
                <strong>Receipt Under Bursary Review</strong>
                <p style={{ margin: "0.25rem 0 0 0", fontSize: "0.85rem" }}>
                  Receipt for Tracking ID <code>{trackingId}</code> is queued for verification (₦{(feeOrder.pendingSubmittedAmountNaira || chosenPrincipalNaira).toLocaleString()}). You can replace it below if needed.
                </p>
              </div>
            </div>
          )}

          {tellerSuccess && (
            <div style={{ background: "var(--status-success-bg)", color: "var(--status-success-text)", border: "1px solid var(--status-success-border)", padding: "1rem", borderRadius: "var(--radius-sm)", marginBottom: "1.5rem", fontWeight: "bold" }}>
              {tellerSuccess}
            </div>
          )}

          {tellerError && (
            <div style={{ background: "var(--status-error-bg)", color: "var(--status-error-text)", border: "1px solid var(--status-error-border)", padding: "1rem", borderRadius: "var(--radius-sm)", marginBottom: "1.5rem", fontWeight: "bold" }}>
              {tellerError}
            </div>
          )}

          <form onSubmit={handleTellerUpload} style={{ display: "grid", gap: "1.25rem" }}>
            <div>
              <label style={{ display: "block", marginBottom: "0.4rem", fontWeight: "bold", color: "var(--color-gray-800)" }}>
                Upload Bank Receipt / Transfer Screenshot (PNG, JPEG, WEBP, or PDF) *
              </label>
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp,application/pdf"
                required={!feeOrder?.hasUploadedReceipt}
                onChange={(e) => setReceiptFile(e.target.files?.[0] || null)}
                style={{ width: "100%", padding: "0.75rem", borderRadius: "var(--radius-md)", border: "1px dashed var(--color-primary-green)", background: "var(--color-gray-50)", cursor: "pointer" }}
              />
              <small style={{ color: "var(--color-gray-500)", display: "block", marginTop: "0.25rem" }}>
                Max 5MB. Verified privately by Bursary (stored outside public folders).
              </small>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "1rem" }}>
              <div>
                <label style={{ display: "block", marginBottom: "0.4rem", fontWeight: "bold", color: "var(--color-gray-800)" }}>Paying Bank Name *</label>
                <input type="text" required placeholder="e.g. Zenith Bank, GTBank, OPay" value={bankName} onChange={(e) => setBankName(e.target.value)} style={{ width: "100%", padding: "0.75rem", borderRadius: "var(--radius-md)", border: "1px solid var(--color-gray-300)" }} />
              </div>

              <div>
                <label style={{ display: "block", marginBottom: "0.4rem", fontWeight: "bold", color: "var(--color-gray-800)" }}>Teller Number / Session ID</label>
                <input type="text" placeholder="e.g. 202604081234..." value={tellerNumber} onChange={(e) => setTellerNumber(e.target.value)} style={{ width: "100%", padding: "0.75rem", borderRadius: "var(--radius-md)", border: "1px solid var(--color-gray-300)" }} />
              </div>

              <div>
                <label style={{ display: "block", marginBottom: "0.4rem", fontWeight: "bold", color: "var(--color-gray-800)" }}>Date of Payment *</label>
                <input type="date" required value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} style={{ width: "100%", padding: "0.75rem", borderRadius: "var(--radius-md)", border: "1px solid var(--color-gray-300)" }} />
              </div>
            </div>

            <button
              type="submit"
              disabled={tellerLoading}
              className="btn btn-primary"
              style={{ padding: "1rem", fontSize: "1.05rem", marginTop: "0.5rem", display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem" }}
            >
              <FiUploadCloud /> {tellerLoading ? "Uploading Receipt..." : `Submit ₦${chosenPrincipalNaira.toLocaleString()} Receipt for Verification`}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
