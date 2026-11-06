"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import {
  getOrCreateStudentFeeOrder,
  initializePayment,
  uploadBankTellerReceipt,
  verifyPaystackPayment,
} from "@/app/actions/payments";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  FiLock,
  FiCheckCircle,
  FiCopy,
  FiUploadCloud,
  FiClock,
  FiFileText,
  FiAlertCircle,
  FiCreditCard,
  FiCheck,
} from "react-icons/fi";

export default function PayFeesPage() {
  const { data: session } = useSession();
  const searchParams = useSearchParams();
  const paymentStatus = searchParams.get("payment");

  const [activeTab, setActiveTab] = useState<"ONLINE" | "TELLER">("ONLINE");
  const [feeOrder, setFeeOrder] = useState<any>(null);
  const [loadingOrder, setLoadingOrder] = useState(true);

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

  useEffect(() => {
    async function loadOrder() {
      setLoadingOrder(true);

      const ref = searchParams.get("reference") || searchParams.get("trxref");
      if (paymentStatus === "verify" && ref) {
        try {
          await verifyPaystackPayment(ref);
        } catch (e) {
          console.error("Auto verification error:", e);
        }
      }

      const res = await getOrCreateStudentFeeOrder();
      if (res.success) {
        setFeeOrder(res);
        if (res.hasUploadedReceipt) {
          setActiveTab("TELLER");
        }
      }
      setLoadingOrder(false);
    }
    loadOrder();
  }, [paymentStatus, searchParams]);

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

  const handleOnlinePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    setOnlineLoading(true);
    setOnlineError("");

    const termId = feeOrder?.term?.TermID || 1;
    const amount = feeOrder?.amount || 65000;
    const trackingId = feeOrder?.trackingId;

    const res = await initializePayment({
      amount,
      description: "Consolidated School Fees",
      termId,
      trackingId,
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
    formData.append("amount", String(feeOrder?.amount || 65000));

    const res = await uploadBankTellerReceipt(formData);

    if (res.success) {
      setTellerSuccess(res.message || "Receipt submitted successfully!");
      setFeeOrder((prev: any) => ({
        ...prev,
        hasUploadedReceipt: true,
        status: "Pending",
      }));
      setReceiptFile(null);
    } else {
      setTellerError(res.error || "Failed to submit receipt.");
    }
    setTellerLoading(false);
  };

  if (paymentStatus === "verify") {
    return (
      <div style={{ padding: "4rem 2rem", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center" }}>
        <div style={{ fontSize: "5rem", color: "var(--color-primary-green)", marginBottom: "1rem" }}>
          <FiCheckCircle />
        </div>
        <h1 style={{ color: "var(--color-navy-blue)", marginBottom: "1rem" }}>Payment Verified!</h1>
        <p style={{ color: "var(--color-gray-600)", fontSize: "1.1rem" }}>Your school fees transaction has been approved and recorded.</p>
        <Link href="/portal/fees/status" className="btn btn-primary" style={{ marginTop: "1.5rem" }}>
          View Transaction Status
        </Link>
      </div>
    );
  }

  if (loadingOrder) {
    return (
      <div style={{ padding: "3rem", textAlign: "center", color: "var(--color-gray-600)" }}>
        Loading your term fee order and financial clearance status...
      </div>
    );
  }

  // If student is ALREADY cleared for this term
  if (feeOrder?.isCleared) {
    return (
      <div style={{ padding: "clamp(1rem, 2.5vw, 2rem)", maxWidth: "720px", margin: "0 auto" }}>
        <div style={{
          background: "var(--color-white)",
          padding: "clamp(1.5rem, 4vw, 2.5rem)",
          borderRadius: "var(--radius-lg)",
          boxShadow: "var(--shadow-floating)",
          borderTop: "6px solid var(--color-primary-green)",
          textAlign: "center"
        }}>
          <div style={{
            width: "72px",
            height: "72px",
            borderRadius: "50%",
            background: "#dcfce7",
            color: "#166534",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "2.5rem",
            margin: "0 auto 1.5rem"
          }}>
            <FiCheckCircle />
          </div>

          <h1 style={{ color: "var(--color-navy-blue)", fontSize: "1.75rem", marginBottom: "0.5rem" }}>
            Financial Clearance Granted
          </h1>
          <p style={{ color: "var(--color-gray-700)", fontSize: "1.05rem", marginBottom: "1.5rem" }}>
            Your school fees for <strong>{feeOrder.term?.SessionName} ({feeOrder.term?.TermName})</strong> have been verified and approved by the Bursary.
          </p>

          <div style={{ background: "var(--color-gray-50)", padding: "1.25rem", borderRadius: "var(--radius-md)", marginBottom: "2rem", textAlign: "left", display: "grid", gap: "0.75rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid var(--color-gray-200)", paddingBottom: "0.5rem" }}>
              <span style={{ color: "var(--color-gray-500)" }}>Order Tracking ID:</span>
              <strong style={{ color: "var(--color-navy-blue)", fontFamily: "monospace" }}>{feeOrder.trackingId}</strong>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid var(--color-gray-200)", paddingBottom: "0.5rem" }}>
              <span style={{ color: "var(--color-gray-500)" }}>Student Name:</span>
              <strong>{feeOrder.student?.PreferredName}</strong>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid var(--color-gray-200)", paddingBottom: "0.5rem" }}>
              <span style={{ color: "var(--color-gray-500)" }}>Registration Number:</span>
              <strong>{feeOrder.student?.AdmissionNo}</strong>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "var(--color-gray-500)" }}>Amount Paid:</span>
              <strong style={{ color: "var(--color-primary-green)" }}>₦{(feeOrder.amount || 65000).toLocaleString()}</strong>
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
  const amount = feeOrder?.amount || 65000;

  return (
    <div style={{ padding: "1.5rem", maxWidth: "800px", margin: "0 auto" }}>
      <div style={{ marginBottom: "1.75rem", borderBottom: "2px solid var(--color-gray-200)", paddingBottom: "1rem" }}>
        <h1 style={{ color: "var(--color-navy-blue)", margin: 0, fontSize: "1.75rem" }}>
          School Fees Clearance & Payment
        </h1>
        <p style={{ color: "var(--color-gray-600)", margin: "0.35rem 0 0 0", fontSize: "0.95rem" }}>
          {feeOrder?.term?.SessionName} • {feeOrder?.term?.TermName} — Clear fees to unlock term exams, report cards, and results.
        </p>
      </div>

      {/* Bill & Tracking ID Hero Card */}
      <div style={{
        background: "linear-gradient(135deg, #0b2216 0%, #143424 100%)",
        color: "var(--color-white)",
        padding: "1.75rem",
        borderRadius: "var(--radius-lg)",
        boxShadow: "var(--shadow-floating)",
        marginBottom: "2rem",
        position: "relative",
        border: "1px solid rgba(212, 175, 55, 0.4)"
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "1rem" }}>
          <div>
            <span style={{
              display: "inline-block",
              background: "rgba(212, 175, 55, 0.2)",
              color: "#fbbf24",
              border: "1px solid #d97706",
              padding: "0.2rem 0.65rem",
              borderRadius: "var(--radius-full)",
              fontSize: "0.75rem",
              fontWeight: "bold",
              marginBottom: "0.5rem"
            }}>
              CONSOLIDATED SCHOOL FEES
            </span>
            <h2 style={{ fontSize: "1.4rem", margin: "0 0 0.25rem 0", color: "#ffffff" }}>
              Comprehensive Term Fee
            </h2>
            <p style={{ margin: 0, color: "#d1fae5", fontSize: "0.85rem" }}>
              Includes Tuition, Educational Supplies, PTA, and Standard School Levies.
            </p>
          </div>

          <div style={{ textAlign: "right" }}>
            <span style={{ fontSize: "0.8rem", color: "#9ca3af", display: "block" }}>Amount Due:</span>
            <span style={{ fontSize: "2rem", fontWeight: "bold", color: "#ffffff" }}>
              ₦{amount.toLocaleString()}
            </span>
          </div>
        </div>

        {/* Tracking ID Badge Bar */}
        <div style={{
          marginTop: "1.25rem",
          padding: "0.85rem 1.15rem",
          background: "rgba(0, 0, 0, 0.35)",
          borderRadius: "var(--radius-md)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "0.75rem",
          border: "1px dashed rgba(255, 255, 255, 0.25)"
        }}>
          <div>
            <span style={{ fontSize: "0.75rem", color: "#d1fae5", display: "block" }}>Your Order Tracking ID:</span>
            <strong style={{ fontFamily: "monospace", fontSize: "1.1rem", letterSpacing: "1px", color: "#fef08a" }}>
              {trackingId}
            </strong>
          </div>
          <button
            type="button"
            onClick={() => handleCopy(trackingId, "tracking")}
            style={{
              background: copiedTrackingId ? "#15803d" : "rgba(255, 255, 255, 0.15)",
              color: "#ffffff",
              border: "none",
              padding: "0.4rem 0.85rem",
              borderRadius: "var(--radius-sm)",
              fontSize: "0.85rem",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "0.4rem",
              transition: "background 0.2s"
            }}
          >
            {copiedTrackingId ? <FiCheck /> : <FiCopy />}
            {copiedTrackingId ? "Copied!" : "Copy Tracking ID"}
          </button>
        </div>
      </div>

      {/* Payment Channel Tabs */}
      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1.5rem" }}>
        <button
          type="button"
          onClick={() => setActiveTab("ONLINE")}
          style={{
            flex: 1,
            padding: "0.9rem",
            fontWeight: "bold",
            borderRadius: "var(--radius-md)",
            border: activeTab === "ONLINE" ? "2px solid var(--color-primary-green)" : "1px solid var(--color-gray-300)",
            background: activeTab === "ONLINE" ? "var(--color-white)" : "var(--color-gray-100)",
            color: activeTab === "ONLINE" ? "var(--color-navy-blue)" : "var(--color-gray-600)",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "0.5rem",
            boxShadow: activeTab === "ONLINE" ? "var(--shadow-sm)" : "none"
          }}
        >
          <FiCreditCard /> Pay Online (Instant Gateway)
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("TELLER")}
          style={{
            flex: 1,
            padding: "0.9rem",
            fontWeight: "bold",
            borderRadius: "var(--radius-md)",
            border: activeTab === "TELLER" ? "2px solid var(--color-primary-green)" : "1px solid var(--color-gray-300)",
            background: activeTab === "TELLER" ? "var(--color-white)" : "var(--color-gray-100)",
            color: activeTab === "TELLER" ? "var(--color-navy-blue)" : "var(--color-gray-600)",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "0.5rem",
            boxShadow: activeTab === "TELLER" ? "var(--shadow-sm)" : "none"
          }}
        >
          <FiUploadCloud /> Bank Transfer / Teller Upload
        </button>
      </div>

      {/* Tab 1: Pay Online */}
      {activeTab === "ONLINE" && (
        <div style={{
          background: "var(--color-white)",
          padding: "2.5rem 2rem",
          borderRadius: "var(--radius-lg)",
          boxShadow: "var(--shadow-sm)",
          border: "1px solid var(--color-gray-200)"
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--color-gray-200)", paddingBottom: "1rem", marginBottom: "1.5rem" }}>
            <h3 style={{ color: "var(--color-navy-blue)", margin: 0, display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <FiLock style={{ color: "var(--color-primary-green)" }} /> Automated Gateway Checkout
            </h3>
            <span style={{ background: "rgba(34, 197, 94, 0.1)", color: "var(--color-primary-green)", padding: "0.25rem 0.75rem", borderRadius: "var(--radius-full)", fontSize: "0.85rem", fontWeight: "bold" }}>
              Instant Verification
            </span>
          </div>

          {onlineError && (
            <div style={{ background: "#fee2e2", color: "#b91c1c", padding: "0.75rem 1rem", borderRadius: "var(--radius-sm)", marginBottom: "1.25rem", fontSize: "0.9rem" }}>
              {onlineError}
            </div>
          )}

          <p style={{ color: "var(--color-gray-700)", lineHeight: 1.6, marginBottom: "1.5rem" }}>
            Pay directly on the school portal via your debit card, USSD, or direct bank transfer. Your studentship financial clearance will be granted instantly upon transaction approval.
          </p>

          <form onSubmit={handleOnlinePayment} style={{ display: "grid", gap: "1.5rem" }}>
            <div style={{ background: "var(--color-gray-50)", padding: "1.25rem", borderRadius: "var(--radius-md)", border: "1px solid var(--color-gray-200)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.5rem" }}>
                <span style={{ color: "var(--color-gray-600)" }}>Charge Item:</span>
                <strong>Consolidated School Fees</strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.5rem" }}>
                <span style={{ color: "var(--color-gray-600)" }}>Order Tracking Ref:</span>
                <strong style={{ fontFamily: "monospace" }}>{trackingId}</strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", borderTop: "1px solid var(--color-gray-200)", paddingTop: "0.5rem", fontSize: "1.1rem" }}>
                <strong style={{ color: "var(--color-navy-blue)" }}>Total to Pay:</strong>
                <strong style={{ color: "var(--color-primary-green)" }}>₦{amount.toLocaleString()}</strong>
              </div>
            </div>

            <button
              type="submit"
              disabled={onlineLoading}
              className="btn btn-primary"
              style={{ padding: "1rem", fontSize: "1.1rem", display: "flex", justifyContent: "center", alignItems: "center", gap: "0.5rem" }}
            >
              {onlineLoading ? "Redirecting to Gateway..." : `Proceed to Pay ₦${amount.toLocaleString()}`}
            </button>
          </form>
        </div>
      )}

      {/* Tab 2: Bank Teller & Receipt Upload */}
      {activeTab === "TELLER" && (
        <div style={{
          background: "var(--color-white)",
          padding: "clamp(1rem, 2.5vw, 2rem)",
          borderRadius: "var(--radius-lg)",
          boxShadow: "var(--shadow-sm)",
          border: "1px solid var(--color-gray-200)"
        }}>
          {/* Official Bank Account Details */}
          <div style={{
            background: "#f0fdf4",
            border: "1px solid #bbf7d0",
            padding: "1.5rem",
            borderRadius: "var(--radius-md)",
            marginBottom: "1.75rem"
          }}>
            <h4 style={{ color: "#143424", margin: "0 0 0.75rem 0", display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <FiCheckCircle /> Official School Bank Account Details
            </h4>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "1rem" }}>
              <div>
                <span style={{ fontSize: "0.8rem", color: "#4b5563", display: "block" }}>Bank:</span>
                <strong style={{ color: "#111827", fontSize: "1rem" }}>Zenith Bank PLC</strong>
              </div>
              <div>
                <span style={{ fontSize: "0.8rem", color: "#4b5563", display: "block" }}>Account Name:</span>
                <strong style={{ color: "#111827", fontSize: "1rem" }}>Word of Faith Schools</strong>
              </div>
              <div>
                <span style={{ fontSize: "0.8rem", color: "#4b5563", display: "block" }}>Account Number:</span>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <strong style={{ color: "#143424", fontSize: "1.1rem", letterSpacing: "1px", fontFamily: "monospace" }}>1015694201</strong>
                  <button
                    type="button"
                    onClick={() => handleCopy("1015694201", "account")}
                    title="Copy Account Number"
                    style={{ background: "none", border: "none", cursor: "pointer", color: "#15803d" }}
                  >
                    {copiedAccount ? <FiCheck /> : <FiCopy />}
                  </button>
                </div>
              </div>
            </div>

            <div style={{
              marginTop: "1rem",
              background: "#ffffff",
              padding: "0.75rem 1rem",
              borderRadius: "var(--radius-sm)",
              border: "1px solid #86efac",
              fontSize: "0.85rem",
              color: "#166534"
            }}>
              <strong>Mandatory Narration / Remark:</strong> Please enter <code>{trackingId}</code> in your bank transfer remark so the system can automatically match your payment.
            </div>
          </div>

          {/* Pending Upload Alert if student already submitted */}
          {feeOrder?.hasUploadedReceipt && (
            <div style={{
              background: "#fffbeb",
              border: "1px solid #fde68a",
              color: "#92400e",
              padding: "1rem 1.25rem",
              borderRadius: "var(--radius-md)",
              marginBottom: "1.5rem",
              display: "flex",
              alignItems: "center",
              gap: "0.75rem"
            }}>
              <FiClock style={{ fontSize: "1.5rem", flexShrink: 0 }} />
              <div>
                <strong>Receipt Currently Under Bursary Audit</strong>
                <p style={{ margin: "0.25rem 0 0 0", fontSize: "0.85rem" }}>
                  A receipt has been uploaded for Tracking ID <code>{trackingId}</code>. Once the Bursar or Admin verifies it, your studentship will be cleared. You can upload a replacement below if needed.
                </p>
              </div>
            </div>
          )}

          {tellerSuccess && (
            <div style={{ background: "#dcfce7", color: "#15803d", padding: "1rem", borderRadius: "var(--radius-sm)", marginBottom: "1.5rem", fontWeight: "bold" }}>
              {tellerSuccess}
            </div>
          )}

          {tellerError && (
            <div style={{ background: "#fee2e2", color: "#b91c1c", padding: "1rem", borderRadius: "var(--radius-sm)", marginBottom: "1.5rem", fontWeight: "bold" }}>
              {tellerError}
            </div>
          )}

          {/* Receipt Upload Form */}
          <form onSubmit={handleTellerUpload} style={{ display: "grid", gap: "1.25rem" }}>
            <div>
              <label style={{ display: "block", marginBottom: "0.4rem", fontWeight: "bold", color: "var(--color-gray-800)" }}>
                Upload Bank Receipt / Transfer Screenshot (Image or PDF) *
              </label>
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp,application/pdf"
                required={!feeOrder?.hasUploadedReceipt}
                onChange={(e) => setReceiptFile(e.target.files?.[0] || null)}
                style={{
                  width: "100%",
                  padding: "0.75rem",
                  borderRadius: "var(--radius-md)",
                  border: "1px dashed var(--color-primary-green)",
                  background: "var(--color-gray-50)",
                  cursor: "pointer"
                }}
              />
              <small style={{ color: "var(--color-gray-500)", display: "block", marginTop: "0.25rem" }}>
                Max file size: 5MB. Duplicates are cryptographically detected and rejected.
              </small>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "1rem" }}>
              <div>
                <label style={{ display: "block", marginBottom: "0.4rem", fontWeight: "bold", color: "var(--color-gray-800)" }}>
                  Paying Bank Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Zenith Bank, GTBank, OPay"
                  value={bankName}
                  onChange={(e) => setBankName(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "0.75rem",
                    borderRadius: "var(--radius-md)",
                    border: "1px solid var(--color-gray-300)"
                  }}
                />
              </div>

              <div>
                <label style={{ display: "block", marginBottom: "0.4rem", fontWeight: "bold", color: "var(--color-gray-800)" }}>
                  Teller Number / Session ID
                </label>
                <input
                  type="text"
                  placeholder="e.g. 202604081234..."
                  value={tellerNumber}
                  onChange={(e) => setTellerNumber(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "0.75rem",
                    borderRadius: "var(--radius-md)",
                    border: "1px solid var(--color-gray-300)"
                  }}
                />
              </div>

              <div>
                <label style={{ display: "block", marginBottom: "0.4rem", fontWeight: "bold", color: "var(--color-gray-800)" }}>
                  Date of Payment *
                </label>
                <input
                  type="date"
                  required
                  value={paymentDate}
                  onChange={(e) => setPaymentDate(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "0.75rem",
                    borderRadius: "var(--radius-md)",
                    border: "1px solid var(--color-gray-300)"
                  }}
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={tellerLoading}
              className="btn btn-primary"
              style={{
                padding: "1rem",
                fontSize: "1.05rem",
                marginTop: "0.5rem",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "0.5rem"
              }}
            >
              <FiUploadCloud /> {tellerLoading ? "Submitting Receipt..." : "Submit Receipt for Bursary Verification"}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
