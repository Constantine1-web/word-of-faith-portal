"use client";

import { useState } from "react";
import { createBatchScratchCards, getScratchCardsList } from "@/app/actions/scratchCards";
import { FiPlus, FiPrinter, FiDownload, FiSearch, FiCreditCard, FiCheckCircle, FiAlertCircle, FiX } from "react-icons/fi";

export default function CardsClient({
  initialCards,
  terms,
  activeTerm,
  initialStats
}: {
  initialCards: any[];
  terms: any[];
  activeTerm: any;
  initialStats: { total: number; unused: number; used: number };
}) {
  const [cards, setCards] = useState(initialCards);
  const [stats, setStats] = useState(initialStats);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Search & Filter
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [termFilter, setTermFilter] = useState<string>(activeTerm?.TermID?.toString() || "");

  // Batch Generation State
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [batchQuantity, setBatchQuantity] = useState(50);
  const [batchTermId, setBatchTermId] = useState<string>(activeTerm?.TermID?.toString() || "");
  const [batchMaxUsage, setBatchMaxUsage] = useState(5);

  // Generated Batch Printable View
  const [generatedBatch, setGeneratedBatch] = useState<{ serialNumber: string; pin: string }[] | null>(null);

  const handleGenerateBatch = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSuccess("");

    const termId = batchTermId ? parseInt(batchTermId) : undefined;
    const res = await createBatchScratchCards({
      quantity: batchQuantity,
      termId,
      maxUsage: batchMaxUsage
    });

    if (res.success && res.cards) {
      setGeneratedBatch(res.cards);
      setSuccess(`Successfully generated ${res.count} scratch cards! You can now print the sticker sheet or download the backup.`);
      setShowGenerateModal(false);
      
      // Refresh list
      const updated = await getScratchCardsList({ termId, status: statusFilter as any });
      if (updated.success && updated.cards) {
        setCards(updated.cards);
        if (updated.stats) setStats(updated.stats);
      }
    } else {
      setError(res.error || "Failed to generate scratch cards");
    }
    setLoading(false);
  };

  const handleSearchAndFilter = async () => {
    setLoading(true);
    const termId = termFilter ? parseInt(termFilter) : undefined;
    const res = await getScratchCardsList({
      termId,
      status: statusFilter as any,
      search: searchTerm || undefined
    });
    if (res.success && res.cards) {
      setCards(res.cards);
      if (res.stats) setStats(res.stats);
    }
    setLoading(false);
  };

  const exportCSV = () => {
    if (generatedBatch && generatedBatch.length > 0) {
      const csvContent = "data:text/csv;charset=utf-8," + 
        ["Serial Number,12-Digit PIN,Term,Max Usage"].concat(
          generatedBatch.map(c => `${c.serialNumber},${c.pin},${activeTerm?.TermName || "Active Term"},${batchMaxUsage}`)
        ).join("\n");
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement("a");
      link.setAttribute("href", encodedUri);
      link.setAttribute("download", `WOFS_ScratchCards_Batch_${Date.now()}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  const triggerPrint = () => {
    window.print();
  };

  return (
    <div>
      {error && <div style={{ background: "#fee2e2", color: "#b91c1c", padding: "1rem", borderRadius: "var(--radius-md)", marginBottom: "1.5rem", fontWeight: "bold" }}>{error}</div>}
      {success && <div style={{ background: "#dcfce7", color: "#15803d", padding: "1rem", borderRadius: "var(--radius-md)", marginBottom: "1.5rem", fontWeight: "bold" }}>{success}</div>}

      {/* Stats Cards */}
      <div className="responsive-grid" style={{ marginBottom: "2rem" }}>
        <div style={{ background: "var(--color-white)", padding: "1.5rem", borderRadius: "var(--radius-md)", boxShadow: "var(--shadow-sm)", borderLeft: "4px solid var(--color-navy-blue)" }}>
          <p style={{ color: "var(--color-gray-500)", marginBottom: "0.5rem", fontSize: "0.9rem" }}>Total Cards Generated</p>
          <h2 style={{ color: "var(--color-navy-blue)", margin: 0 }}>{stats.total.toLocaleString()}</h2>
        </div>
        <div style={{ background: "var(--color-white)", padding: "1.5rem", borderRadius: "var(--radius-md)", boxShadow: "var(--shadow-sm)", borderLeft: "4px solid #22c55e" }}>
          <p style={{ color: "var(--color-gray-500)", marginBottom: "0.5rem", fontSize: "0.9rem" }}>Unused / In Stock</p>
          <h2 style={{ color: "#16a34a", margin: 0 }}>{stats.unused.toLocaleString()}</h2>
        </div>
        <div style={{ background: "var(--color-white)", padding: "1.5rem", borderRadius: "var(--radius-md)", boxShadow: "var(--shadow-sm)", borderLeft: "4px solid #3b82f6" }}>
          <p style={{ color: "var(--color-gray-500)", marginBottom: "0.5rem", fontSize: "0.9rem" }}>Claimed / In Use</p>
          <h2 style={{ color: "#2563eb", margin: 0 }}>{stats.used.toLocaleString()}</h2>
        </div>
      </div>

      {/* Generated Batch Print Preview Section */}
      {generatedBatch && (
        <div style={{
          background: "var(--color-white)",
          padding: "2rem",
          borderRadius: "var(--radius-lg)",
          marginBottom: "2.5rem",
          border: "2px solid #22c55e",
          boxShadow: "var(--shadow-md)"
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem", flexWrap: "wrap", gap: "1rem" }}>
            <div>
              <span style={{ background: "#dcfce7", color: "#15803d", padding: "0.2rem 0.6rem", borderRadius: "var(--radius-full)", fontSize: "0.8rem", fontWeight: "bold" }}>
                NEW BATCH GENERATED ({generatedBatch.length} CARDS)
              </span>
              <h3 style={{ color: "var(--color-navy-blue)", margin: "0.5rem 0 0 0" }}>
                Printable Scratch Card Sheet
              </h3>
              <p style={{ color: "var(--color-gray-500)", fontSize: "0.85rem", margin: "0.25rem 0 0 0" }}>
                ⚠️ Important: Plaintext PINs are only displayed right now. Save or print this batch immediately.
              </p>
            </div>

            <div style={{ display: "flex", gap: "0.75rem" }}>
              <button
                onClick={exportCSV}
                className="btn btn-outline"
                style={{ display: "flex", alignItems: "center", gap: "0.5rem", padding: "0.6rem 1rem" }}
              >
                <FiDownload /> Download CSV
              </button>
              <button
                onClick={triggerPrint}
                className="btn btn-primary"
                style={{ display: "flex", alignItems: "center", gap: "0.5rem", padding: "0.6rem 1rem" }}
              >
                <FiPrinter /> Print Sticker Grid
              </button>
              <button
                onClick={() => setGeneratedBatch(null)}
                style={{ background: "none", border: "none", cursor: "pointer", color: "var(--color-gray-400)" }}
              >
                <FiX size={20} />
              </button>
            </div>
          </div>

          {/* Printable Cards Grid */}
          <div className="printable-cards-grid" style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
            gap: "1rem",
            maxHeight: "500px",
            overflowY: "auto",
            padding: "0.5rem"
          }}>
            {generatedBatch.map((card, idx) => (
              <div
                key={idx}
                style={{
                  background: "linear-gradient(135deg, #0A2540 0%, #14532D 100%)",
                  color: "white",
                  padding: "1rem",
                  borderRadius: "12px",
                  border: "1px solid rgba(255,255,255,0.2)",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                  boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.2)",
                  pageBreakInside: "avoid"
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid rgba(255,255,255,0.2)", paddingBottom: "0.5rem", marginBottom: "0.75rem" }}>
                  <span style={{ fontSize: "0.75rem", fontWeight: "bold", letterSpacing: "0.05em", color: "#4ade80" }}>
                    WORD OF FAITH SCHOOLS
                  </span>
                  <span style={{ fontSize: "0.7rem", opacity: 0.8 }}>
                    RESULT CHECKER
                  </span>
                </div>

                <div style={{ marginBottom: "0.75rem" }}>
                  <div style={{ fontSize: "0.7rem", opacity: 0.8, textTransform: "uppercase" }}>Serial Number:</div>
                  <div style={{ fontSize: "0.95rem", fontWeight: "bold", fontFamily: "monospace", color: "#93c5fd" }}>
                    {card.serialNumber}
                  </div>
                </div>

                <div style={{
                  background: "rgba(255, 255, 255, 0.15)",
                  backdropFilter: "blur(5px)",
                  padding: "0.5rem",
                  borderRadius: "6px",
                  textAlign: "center",
                  border: "1px dashed rgba(255, 255, 255, 0.4)"
                }}>
                  <div style={{ fontSize: "0.65rem", opacity: 0.9, textTransform: "uppercase", marginBottom: "0.2rem" }}>
                    SCRATCH PIN (12 DIGITS)
                  </div>
                  <div style={{ fontSize: "1.15rem", fontWeight: "900", letterSpacing: "2px", fontFamily: "monospace", color: "#ffffff" }}>
                    {card.pin}
                  </div>
                </div>

                <div style={{ marginTop: "0.75rem", fontSize: "0.65rem", opacity: 0.7, textAlign: "center" }}>
                  Max {batchMaxUsage} Usages · Check results on the student portal
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Controls & Filter Bar */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem", flexWrap: "wrap", gap: "1rem" }}>
        <div style={{ display: "flex", gap: "1rem", flex: 1, minWidth: "280px", maxWidth: "700px" }}>
          <div style={{ position: "relative", flex: 1 }}>
            <FiSearch style={{ position: "absolute", left: "1rem", top: "50%", transform: "translateY(-50%)", color: "var(--color-gray-400)" }} />
            <input
              type="text"
              placeholder="Search serial number or student..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearchAndFilter()}
              className="form-input"
              style={{ paddingLeft: "2.5rem" }}
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="form-input"
            style={{ width: "auto", minWidth: "130px" }}
          >
            <option value="all">All Status</option>
            <option value="unused">Unused Only</option>
            <option value="active">Claimed / Active</option>
          </select>

          <select
            value={termFilter}
            onChange={(e) => setTermFilter(e.target.value)}
            className="form-input"
            style={{ width: "auto", minWidth: "150px" }}
          >
            <option value="">All Terms</option>
            {terms.map(t => (
              <option key={t.TermID} value={t.TermID.toString()}>
                {t.SessionName} - {t.TermName}
              </option>
            ))}
          </select>

          <button onClick={handleSearchAndFilter} className="btn btn-outline" style={{ padding: "0.5rem 1rem" }}>
            Filter
          </button>
        </div>

        <button
          onClick={() => setShowGenerateModal(true)}
          className="btn btn-primary"
          style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}
        >
          <FiPlus /> Generate Batch
        </button>
      </div>

      {/* Cards Table */}
      <div style={{ background: "var(--color-white)", borderRadius: "var(--radius-lg)", border: "1px solid var(--color-gray-200)", overflowX: "auto", boxShadow: "var(--shadow-sm)" }}>
        <table className="responsive-table" style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "var(--color-gray-50)", borderBottom: "2px solid var(--color-gray-200)" }}>
              <th style={{ padding: "1rem", textAlign: "left" }}>Serial Number</th>
              <th style={{ padding: "1rem", textAlign: "left" }}>Term Scoped</th>
              <th style={{ padding: "1rem", textAlign: "center" }}>Status</th>
              <th style={{ padding: "1rem", textAlign: "center" }}>Usage Count</th>
              <th style={{ padding: "1rem", textAlign: "left" }}>Bound Student</th>
            </tr>
          </thead>
          <tbody>
            {cards.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ padding: "3rem", textAlign: "center", color: "var(--color-gray-500)" }}>
                  No scratch cards found. Click "Generate Batch" above.
                </td>
              </tr>
            ) : (
              cards.map((card) => (
                <tr key={card.CardID} style={{ borderBottom: "1px solid var(--color-gray-200)" }}>
                  <td data-label="Serial Number" style={{ padding: "1rem", fontWeight: "bold", fontFamily: "monospace", color: "var(--color-navy-blue)" }}>
                    {card.SerialNumber}
                  </td>
                  <td data-label="Term" style={{ padding: "1rem", fontSize: "0.9rem", color: "var(--color-gray-700)" }}>
                    {card.Term ? `${card.Term.SessionName} (${card.Term.TermName})` : "Universal"}
                  </td>
                  <td data-label="Status" style={{ padding: "1rem", textAlign: "center" }}>
                    {card.UsedBy === null ? (
                      <span style={{ background: "#dcfce7", color: "#15803d", padding: "0.25rem 0.75rem", borderRadius: "var(--radius-full)", fontSize: "0.85rem", fontWeight: "bold" }}>
                        Unused
                      </span>
                    ) : card.UsageCount >= card.MaxUsage ? (
                      <span style={{ background: "#fee2e2", color: "#b91c1c", padding: "0.25rem 0.75rem", borderRadius: "var(--radius-full)", fontSize: "0.85rem", fontWeight: "bold" }}>
                        Exhausted
                      </span>
                    ) : (
                      <span style={{ background: "#dbeafe", color: "#1e40af", padding: "0.25rem 0.75rem", borderRadius: "var(--radius-full)", fontSize: "0.85rem", fontWeight: "bold" }}>
                        Active
                      </span>
                    )}
                  </td>
                  <td data-label="Usage Count" style={{ padding: "1rem", textAlign: "center", fontWeight: "bold", color: "var(--color-gray-800)" }}>
                    {card.UsageCount} / {card.MaxUsage}
                  </td>
                  <td data-label="Bound Student" style={{ padding: "1rem", fontSize: "0.9rem" }}>
                    {card.Student ? (
                      <div>
                        <strong>{card.Student.PreferredName}</strong>
                        <div style={{ color: "var(--color-gray-500)", fontSize: "0.8rem" }}>
                          {card.Student.AdmissionNo} ({card.Student.Class?.ClassName})
                        </div>
                      </div>
                    ) : (
                      <span style={{ color: "var(--color-gray-400)", fontStyle: "italic" }}>Not yet claimed</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Generate Batch Modal */}
      {showGenerateModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: "1rem" }}>
          <div className="modal-content" style={{ background: "var(--color-white)", borderRadius: "var(--radius-lg)", padding: "2rem", width: "100%", maxWidth: "480px", boxShadow: "var(--shadow-floating)" }}>
            <h3 style={{ color: "var(--color-navy-blue)", marginBottom: "1rem" }}>Generate Scratch Card Batch</h3>
            <form onSubmit={handleGenerateBatch}>
              <div className="form-group">
                <label className="form-label">Batch Quantity</label>
                <select
                  className="form-input"
                  value={batchQuantity}
                  onChange={(e) => setBatchQuantity(parseInt(e.target.value))}
                  required
                >
                  <option value={20}>20 Cards (Trial Pack)</option>
                  <option value={50}>50 Cards (Standard Arm)</option>
                  <option value={100}>100 Cards (Full Grade)</option>
                  <option value={250}>250 Cards (School-Wide)</option>
                  <option value={500}>500 Cards (Annual Volume)</option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Target Academic Term</label>
                <select
                  className="form-input"
                  value={batchTermId}
                  onChange={(e) => setBatchTermId(e.target.value)}
                >
                  <option value="">Universal (Any Active Term)</option>
                  {terms.map(t => (
                    <option key={t.TermID} value={t.TermID.toString()}>
                      {t.SessionName} - {t.TermName} {t.IsActive ? "(Active)" : ""}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Max Usage Checks per PIN</label>
                <input
                  type="number"
                  min={1}
                  max={20}
                  className="form-input"
                  value={batchMaxUsage}
                  onChange={(e) => setBatchMaxUsage(parseInt(e.target.value))}
                  required
                />
                <small style={{ color: "var(--color-gray-500)", marginTop: "0.25rem", display: "block" }}>
                  Controls how many times a student can check their terminal result with one card.
                </small>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "1rem", marginTop: "1.5rem" }}>
                <button type="button" className="btn btn-outline" onClick={() => setShowGenerateModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={loading}>
                  {loading ? "Generating..." : `Generate ${batchQuantity} Cards`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
