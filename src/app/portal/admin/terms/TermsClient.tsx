"use client";

import { useState } from "react";
import { setActiveTerm, toggleTermLock, createAcademicTerm } from "@/app/actions/terms";
import { FiCheckCircle, FiLock, FiUnlock, FiPlus, FiCalendar, FiAlertCircle } from "react-icons/fi";

export default function TermsClient({ initialTerms }: { initialTerms: any[] }) {
  const [terms, setTerms] = useState(initialTerms);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [showModal, setShowModal] = useState(false);

  // Form state
  const [sessionName, setSessionName] = useState("2026/2027");
  const [termName, setTermName] = useState("First Term");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [makeActive, setMakeActive] = useState(false);

  const activeTerm = terms.find(t => t.IsActive);

  const handleSetActive = async (termId: number) => {
    if (!confirm("Are you sure you want to switch the global active term? This will set the active period across the entire portal.")) return;
    setLoading(true);
    setError("");
    setSuccess("");

    const res = await setActiveTerm(termId);
    if (res.success) {
      setTerms(prev => prev.map(t => ({
        ...t,
        IsActive: t.TermID === termId
      })));
      setSuccess("Active academic term updated successfully!");
    } else {
      setError(res.error || "Failed to update active term");
    }
    setLoading(false);
  };

  const handleToggleLock = async (term: any) => {
    const nextState = !term.IsLocked;
    const msg = nextState
      ? `Freeze score entry for ${term.SessionName} - ${term.TermName}? Teachers will NOT be able to add or edit scores.`
      : `Unfreeze score entry for ${term.SessionName} - ${term.TermName}? Teachers will be able to edit scores.`;

    if (!confirm(msg)) return;

    setLoading(true);
    setError("");
    setSuccess("");

    const res = await toggleTermLock(term.TermID, nextState);
    if (res.success) {
      setTerms(prev => prev.map(t => t.TermID === term.TermID ? { ...t, IsLocked: nextState } : t));
      setSuccess(nextState ? "Score entry has been LOCKED." : "Score entry has been UNLOCKED.");
    } else {
      setError(res.error || "Failed to update lock status");
    }
    setLoading(false);
  };

  const handleCreateTerm = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSuccess("");

    const res = await createAcademicTerm({
      sessionName,
      termName,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      makeActive
    });

    if (res.success && res.term) {
      setTerms(prev => {
        let updated = makeActive ? prev.map(t => ({ ...t, IsActive: false })) : [...prev];
        return [res.term, ...updated];
      });
      setSuccess("Academic term created successfully!");
      setShowModal(false);
      setTermName("Second Term");
    } else {
      setError(res.error || "Failed to create academic term");
    }
    setLoading(false);
  };

  return (
    <div>
      {error && <div style={{ background: "#fee2e2", color: "#b91c1c", padding: "1rem", borderRadius: "var(--radius-md)", marginBottom: "1.5rem", fontWeight: "bold" }}>{error}</div>}
      {success && <div style={{ background: "#dcfce7", color: "#15803d", padding: "1rem", borderRadius: "var(--radius-md)", marginBottom: "1.5rem", fontWeight: "bold" }}>{success}</div>}

      {/* Global Active State Banner */}
      <div style={{
        background: activeTerm ? "linear-gradient(135deg, #0A2540 0%, #14532D 100%)" : "#374151",
        color: "white",
        padding: "1.5rem 2rem",
        borderRadius: "var(--radius-lg)",
        marginBottom: "2rem",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        flexWrap: "wrap",
        gap: "1.5rem",
        boxShadow: "var(--shadow-md)"
      }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem" }}>
            <span style={{ background: "rgba(34, 197, 94, 0.2)", color: "#4ade80", border: "1px solid #4ade80", padding: "0.2rem 0.6rem", borderRadius: "var(--radius-full)", fontSize: "0.8rem", fontWeight: "bold" }}>
              CURRENT ACTIVE PERIOD
            </span>
            {activeTerm?.IsLocked && (
              <span style={{ background: "rgba(239, 68, 68, 0.2)", color: "#f87171", border: "1px solid #f87171", padding: "0.2rem 0.6rem", borderRadius: "var(--radius-full)", fontSize: "0.8rem", fontWeight: "bold", display: "flex", alignItems: "center", gap: "0.25rem" }}>
                <FiLock /> SCORE ENTRY LOCKED
              </span>
            )}
          </div>
          <h2 style={{ color: "white", margin: 0, fontSize: "1.75rem" }}>
            {activeTerm ? `${activeTerm.SessionName} Academic Session — ${activeTerm.TermName}` : "No Active Term Set"}
          </h2>
          <p style={{ margin: "0.5rem 0 0 0", opacity: 0.85, fontSize: "0.9rem" }}>
            All teacher score inputs, scratch card verifications, and student broadsheets default to this active term.
          </p>
        </div>

        <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
          {activeTerm && (
            <button
              onClick={() => handleToggleLock(activeTerm)}
              disabled={loading}
              className="btn"
              style={{
                background: activeTerm.IsLocked ? "#22c55e" : "#ef4444",
                color: "white",
                display: "flex",
                alignItems: "center",
                gap: "0.5rem"
              }}
            >
              {activeTerm.IsLocked ? <><FiUnlock /> Unlock Score Entry</> : <><FiLock /> Lock Score Entry</>}
            </button>
          )}
          <button
            onClick={() => setShowModal(true)}
            className="btn btn-primary"
            style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}
          >
            <FiPlus /> Add Session / Term
          </button>
        </div>
      </div>

      {/* Terms List Table */}
      <div style={{ background: "var(--color-white)", borderRadius: "var(--radius-lg)", border: "1px solid var(--color-gray-200)", overflowX: "auto", boxShadow: "var(--shadow-sm)" }}>
        <table className="responsive-table" style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "var(--color-gray-50)", borderBottom: "2px solid var(--color-gray-200)" }}>
              <th style={{ padding: "1rem", textAlign: "left" }}>Session</th>
              <th style={{ padding: "1rem", textAlign: "left" }}>Term</th>
              <th style={{ padding: "1rem", textAlign: "center" }}>Status</th>
              <th style={{ padding: "1rem", textAlign: "center" }}>Score Lock</th>
              <th style={{ padding: "1rem", textAlign: "center" }}>Activity Records</th>
              <th style={{ padding: "1rem", textAlign: "right" }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {terms.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ padding: "3rem", textAlign: "center", color: "var(--color-gray-500)" }}>
                  No academic terms configured yet. Click "Add Session / Term" above to get started.
                </td>
              </tr>
            ) : (
              terms.map((term) => (
                <tr key={term.TermID} style={{ borderBottom: "1px solid var(--color-gray-200)", background: term.IsActive ? "rgba(34, 197, 94, 0.05)" : "transparent" }}>
                  <td data-label="Session" style={{ padding: "1rem", fontWeight: "bold", color: "var(--color-navy-blue)" }}>
                    {term.SessionName}
                  </td>
                  <td data-label="Term" style={{ padding: "1rem", color: "var(--color-gray-800)" }}>
                    {term.TermName}
                  </td>
                  <td data-label="Status" style={{ padding: "1rem", textAlign: "center" }}>
                    {term.IsActive ? (
                      <span style={{ background: "#dcfce7", color: "#15803d", padding: "0.25rem 0.75rem", borderRadius: "var(--radius-full)", fontSize: "0.85rem", fontWeight: "bold", display: "inline-flex", alignItems: "center", gap: "0.25rem" }}>
                        <FiCheckCircle /> Active
                      </span>
                    ) : (
                      <span style={{ background: "var(--color-gray-100)", color: "var(--color-gray-600)", padding: "0.25rem 0.75rem", borderRadius: "var(--radius-full)", fontSize: "0.85rem" }}>
                        Inactive
                      </span>
                    )}
                  </td>
                  <td data-label="Score Lock" style={{ padding: "1rem", textAlign: "center" }}>
                    {term.IsLocked ? (
                      <span style={{ color: "#ef4444", fontWeight: "bold", fontSize: "0.85rem", display: "inline-flex", alignItems: "center", gap: "0.25rem" }}>
                        <FiLock /> Locked
                      </span>
                    ) : (
                      <span style={{ color: "#22c55e", fontSize: "0.85rem", display: "inline-flex", alignItems: "center", gap: "0.25rem" }}>
                        <FiUnlock /> Open
                      </span>
                    )}
                  </td>
                  <td data-label="Activity Records" style={{ padding: "1rem", textAlign: "center", fontSize: "0.85rem", color: "var(--color-gray-600)" }}>
                    {term._count?.Results || 0} Results · {term._count?.ScratchCards || 0} Cards · {term._count?.PaymentRecords || 0} Payments
                  </td>
                  <td data-label="Actions" style={{ padding: "1rem", textAlign: "right" }}>
                    <div style={{ display: "inline-flex", gap: "0.5rem" }}>
                      {!term.IsActive && (
                        <button
                          onClick={() => handleSetActive(term.TermID)}
                          disabled={loading}
                          className="btn btn-outline"
                          style={{ padding: "0.4rem 0.8rem", fontSize: "0.85rem" }}
                        >
                          Set Active
                        </button>
                      )}
                      <button
                        onClick={() => handleToggleLock(term)}
                        disabled={loading}
                        className="btn"
                        style={{
                          padding: "0.4rem 0.8rem",
                          fontSize: "0.85rem",
                          background: term.IsLocked ? "#dcfce7" : "#fee2e2",
                          color: term.IsLocked ? "#15803d" : "#b91c1c",
                          border: "none"
                        }}
                      >
                        {term.IsLocked ? "Unlock Scores" : "Lock Scores"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Add Session/Term Modal */}
      {showModal && (
        <div style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.5)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 1000,
          padding: "1rem"
        }}>
          <div className="modal-content" style={{
            background: "var(--color-white)",
            borderRadius: "var(--radius-lg)",
            padding: "2rem",
            width: "100%",
            maxWidth: "500px",
            boxShadow: "var(--shadow-floating)"
          }}>
            <h3 style={{ color: "var(--color-navy-blue)", marginBottom: "1rem" }}>Add Academic Session & Term</h3>
            <form onSubmit={handleCreateTerm}>
              <div className="form-group">
                <label className="form-label">Academic Session</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. 2026/2027 or 2027/2028"
                  value={sessionName}
                  onChange={(e) => setSessionName(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Term Name</label>
                <select
                  className="form-input"
                  value={termName}
                  onChange={(e) => setTermName(e.target.value)}
                  required
                >
                  <option value="First Term">First Term</option>
                  <option value="Second Term">Second Term</option>
                  <option value="Third Term">Third Term</option>
                  <option value="Annual / Summer Session">Annual / Summer Session</option>
                </select>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                <div className="form-group">
                  <label className="form-label">Start Date (Optional)</label>
                  <input
                    type="date"
                    className="form-input"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">End Date (Optional)</label>
                  <input
                    type="date"
                    className="form-input"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                  />
                </div>
              </div>

              <div style={{ marginBottom: "1.5rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <input
                  type="checkbox"
                  id="makeActiveCheck"
                  checked={makeActive}
                  onChange={(e) => setMakeActive(e.target.checked)}
                />
                <label htmlFor="makeActiveCheck" style={{ fontSize: "0.9rem", color: "var(--color-navy-blue)", cursor: "pointer" }}>
                  Make this the active period immediately
                </label>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "1rem" }}>
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => setShowModal(false)}
                  disabled={loading}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={loading}
                >
                  {loading ? "Creating..." : "Create Term"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
