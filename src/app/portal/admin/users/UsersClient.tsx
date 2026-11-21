"use client";

import { useState } from "react";
import {
  createUserAccount,
  toggleUserStatus,
  adminResetPassword,
  updateAdminCapabilities,
} from "@/app/actions/admin";
import {
  ALL_CAPABILITIES,
  CAPABILITY_METADATA,
  CAPABILITY_PRESETS,
  type Capability,
  type CapabilityPresetName,
} from "@/server/security/capabilities";
import {
  FiUserPlus,
  FiKey,
  FiSearch,
  FiShield,
  FiUserCheck,
  FiUserX,
  FiSliders,
} from "react-icons/fi";

export default function UsersClient({ initialUsers, roles }: { initialUsers: any[]; roles: any[] }) {
  const [users, setUsers] = useState(initialUsers);
  const [searchTerm, setSearchTerm] = useState("");
  const [roleFilter, setRoleFilter] = useState("ALL");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Create User Modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newRole, setNewRole] = useState(roles[0]?.RoleName || "Teacher");
  const [newPassword, setNewPassword] = useState("wofschools2026");

  // Reset Password Modal
  const [showResetModal, setShowResetModal] = useState(false);
  const [resetTargetUser, setResetTargetUser] = useState<any>(null);
  const [resetPassValue, setResetPassValue] = useState("wofschools2026");

  // Section B.2 Capabilities & Presets Modal
  const [showCapModal, setShowCapModal] = useState(false);
  const [capTargetUser, setCapTargetUser] = useState<any>(null);
  const [selectedCaps, setSelectedCaps] = useState<Capability[]>([]);
  const [capReason, setCapReason] = useState("");

  const filteredUsers = users.filter((u) => {
    const matchesSearch =
      u.Email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.Student?.PreferredName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.Student?.AdmissionNo?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesRole = roleFilter === "ALL" || u.Role?.RoleName === roleFilter;
    return matchesSearch && matchesRole;
  });

  const handleToggleStatus = async (user: any) => {
    const nextState = !user.IsActive;
    const msg = nextState
      ? `Activate account for ${user.Email}?`
      : `Deactivate account for ${user.Email}? User will NOT be able to log in.`;

    if (!confirm(msg)) return;

    setLoading(true);
    setError("");
    setSuccess("");

    const res = await toggleUserStatus(user.UserID, nextState);
    if (res.success) {
      setUsers((prev) =>
        prev.map((u) => (u.UserID === user.UserID ? { ...u, IsActive: nextState } : u))
      );
      setSuccess(`Account status updated for ${user.Email}`);
    } else {
      setError(res.error || "Failed to update account status");
    }
    setLoading(false);
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSuccess("");

    const res = await createUserAccount({
      email: newEmail,
      roleName: newRole,
      password: newPassword,
    });

    if (res.success && res.user) {
      const createdRole = roles.find((r) => r.RoleName === newRole);
      setUsers((prev) => [
        { ...res.user, Role: createdRole, resolvedCapabilities: newRole === "Admin" ? ALL_CAPABILITIES : [] },
        ...prev,
      ]);
      setSuccess(`Account created for ${newEmail} with default password: ${res.defaultPassword}`);
      setShowCreateModal(false);
      setNewEmail("");
    } else {
      setError(res.error || "Failed to create user account");
    }
    setLoading(false);
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetTargetUser) return;

    setLoading(true);
    setError("");
    setSuccess("");

    const res = await adminResetPassword(resetTargetUser.UserID, resetPassValue);
    if (res.success) {
      setSuccess(`Password for ${resetTargetUser.Email} reset to: ${res.password}`);
      setShowResetModal(false);
      setResetTargetUser(null);
    } else {
      setError(res.error || "Failed to reset password");
    }
    setLoading(false);
  };

  const openCapabilitiesModal = (user: any) => {
    setCapTargetUser(user);
    const existing: Capability[] = Array.isArray(user.resolvedCapabilities)
      ? user.resolvedCapabilities
      : Array.isArray(user.Capabilities) && user.Capabilities.length > 0
      ? user.Capabilities
      : user.Role?.RoleName === "Admin"
      ? ALL_CAPABILITIES
      : [];
    setSelectedCaps(existing);
    setCapReason("");
    setShowCapModal(true);
  };

  const applyPreset = (preset: CapabilityPresetName) => {
    setSelectedCaps([...CAPABILITY_PRESETS[preset]]);
  };

  const toggleCap = (cap: Capability) => {
    setSelectedCaps((prev) =>
      prev.includes(cap) ? prev.filter((c) => c !== cap) : [...prev, cap]
    );
  };

  const handleSaveCapabilities = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!capTargetUser) return;

    setLoading(true);
    setError("");
    setSuccess("");

    const res = await updateAdminCapabilities({
      targetUserId: capTargetUser.UserID,
      capabilities: selectedCaps,
      reason: capReason || "Admin capability matrix update",
    });

    if (res.success && res.capabilities) {
      setUsers((prev) =>
        prev.map((u) =>
          u.UserID === capTargetUser.UserID
            ? { ...u, Capabilities: res.capabilities, resolvedCapabilities: res.capabilities }
            : u
        )
      );
      setSuccess(res.message || `Updated capabilities for ${capTargetUser.Email}`);
      setShowCapModal(false);
      setCapTargetUser(null);
    } else {
      setError(res.error || "Failed to update capabilities");
    }
    setLoading(false);
  };

  const getPresetBadge = (user: any) => {
    if (user.Role?.RoleName !== "Admin") return null;
    const caps: string[] = user.resolvedCapabilities || user.Capabilities || [];
    if (caps.length >= ALL_CAPABILITIES.length) {
      return { label: "FULL PRESET (14/14)", bg: "var(--status-purple-bg)", color: "var(--status-purple-text)" };
    }
    if (
      caps.length === 3 &&
      CAPABILITY_PRESETS.FINANCE.every((c) => caps.includes(c))
    ) {
      return { label: "FINANCE PRESET (Bursar)", bg: "var(--status-warning-bg)", color: "var(--status-warning-text)" };
    }
    if (
      caps.length === 1 &&
      caps[0] === "MANAGE_STUDENTS"
    ) {
      return { label: "REGISTRY PRESET", bg: "var(--status-info-bg)", color: "var(--status-info-text)" };
    }
    return { label: `SCOPED (${caps.length}/14 Caps)`, bg: "var(--bg-tertiary)", color: "var(--text-secondary)" };
  };

  return (
    <div>
      {error && (
        <div
          style={{
            background: "var(--status-error-bg)",
            color: "var(--status-error-text)",
            border: "1px solid var(--status-error-border)",
            padding: "1rem",
            borderRadius: "var(--radius-md)",
            marginBottom: "1.5rem",
            fontWeight: "bold",
          }}
        >
          {error}
        </div>
      )}
      {success && (
        <div
          style={{
            background: "var(--status-success-bg)",
            color: "var(--status-success-text)",
            border: "1px solid var(--status-success-border)",
            padding: "1rem",
            borderRadius: "var(--radius-md)",
            marginBottom: "1.5rem",
            fontWeight: "bold",
          }}
        >
          {success}
        </div>
      )}

      {/* Control Bar */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "1.5rem",
          flexWrap: "wrap",
          gap: "1rem",
        }}
      >
        <div style={{ display: "flex", gap: "1rem", flex: 1, minWidth: "min(100%, 280px)", maxWidth: "600px", flexWrap: "wrap" }}>
          <div style={{ position: "relative", flex: 1 }}>
            <FiSearch
              style={{
                position: "absolute",
                left: "1rem",
                top: "50%",
                transform: "translateY(-50%)",
                color: "var(--color-gray-400)",
              }}
            />
            <input
              type="text"
              placeholder="Search by email, student name, or reg number..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="form-input"
              style={{ paddingLeft: "2.5rem" }}
            />
          </div>
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="form-input"
            style={{ width: "auto", minWidth: "140px" }}
          >
            <option value="ALL">All Roles</option>
            {roles.map((r) => (
              <option key={r.RoleID} value={r.RoleName}>
                {r.RoleName}
              </option>
            ))}
          </select>
        </div>

        <button
          onClick={() => setShowCreateModal(true)}
          className="btn btn-primary"
          style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}
        >
          <FiUserPlus /> Provision New User
        </button>
      </div>

      {/* Users Table */}
      <div
        style={{
          background: "var(--color-white)",
          borderRadius: "var(--radius-lg)",
          border: "1px solid var(--color-gray-200)",
          overflowX: "auto",
          boxShadow: "var(--shadow-sm)",
        }}
      >
        <table className="responsive-table" style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "var(--color-gray-50)", borderBottom: "2px solid var(--color-gray-200)" }}>
              <th style={{ padding: "1rem", textAlign: "left" }}>User / Email</th>
              <th style={{ padding: "1rem", textAlign: "center" }}>Role</th>
              <th style={{ padding: "1rem", textAlign: "left" }}>Associated Profile & Capabilities</th>
              <th style={{ padding: "1rem", textAlign: "center" }}>Status</th>
              <th style={{ padding: "1rem", textAlign: "right" }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredUsers.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ padding: "3rem", textAlign: "center", color: "var(--color-gray-500)" }}>
                  No users found matching your criteria.
                </td>
              </tr>
            ) : (
              filteredUsers.map((user) => {
                const presetBadge = getPresetBadge(user);
                return (
                  <tr
                    key={user.UserID}
                    style={{
                      borderBottom: "1px solid var(--border-subtle)",
                      background: user.IsActive ? "transparent" : "var(--bg-secondary)",
                    }}
                  >
                    <td
                      data-label="User / Email"
                      style={{ padding: "1rem", fontWeight: "600", color: "var(--color-navy-blue)" }}
                    >
                      {user.Email}
                    </td>
                    <td data-label="Role" style={{ padding: "1rem", textAlign: "center" }}>
                      <span
                        style={{
                          padding: "0.25rem 0.75rem",
                          borderRadius: "var(--radius-full)",
                          fontSize: "0.85rem",
                          fontWeight: "bold",
                          background:
                            user.Role?.RoleName === "Admin"
                              ? "var(--status-error-bg)"
                              : user.Role?.RoleName === "Teacher"
                              ? "var(--status-info-bg)"
                              : "var(--status-success-bg)",
                          color:
                            user.Role?.RoleName === "Admin"
                              ? "var(--status-error-text)"
                              : user.Role?.RoleName === "Teacher"
                              ? "var(--status-info-text)"
                              : "var(--status-success-text)",
                        }}
                      >
                        {user.Role?.RoleName}
                      </span>
                    </td>
                    <td
                      data-label="Associated Profile"
                      style={{ padding: "1rem", fontSize: "0.9rem", color: "var(--color-gray-700)" }}
                    >
                      {user.Student ? (
                        <div>
                          <strong>{user.Student.PreferredName}</strong> · {user.Student.AdmissionNo} (
                          {user.Student.Class?.ClassName})
                        </div>
                      ) : user.Role?.RoleName === "Teacher" ? (
                        <div>
                          {user.FormMasterClasses?.length > 0 && (
                            <span
                              style={{
                                color: "var(--color-primary-green)",
                                fontWeight: "bold",
                                marginRight: "0.5rem",
                              }}
                            >
                              Class Teacher ({user.FormMasterClasses.map((c: any) => c.ClassName).join(", ")})
                            </span>
                          )}
                          <span>{user.TeacherMaps?.length || 0} Subject Class(es)</span>
                        </div>
                      ) : (
                        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                          <span style={{ color: "var(--color-gray-600)", fontWeight: 600 }}>Admin Portal</span>
                          {presetBadge && (
                            <span
                              style={{
                                background: presetBadge.bg,
                                color: presetBadge.color,
                                padding: "0.2rem 0.6rem",
                                borderRadius: "999px",
                                fontSize: "0.75rem",
                                fontWeight: 700,
                              }}
                            >
                              {presetBadge.label}
                            </span>
                          )}
                        </div>
                      )}
                    </td>
                    <td data-label="Status" style={{ padding: "1rem", textAlign: "center" }}>
                      {user.IsActive ? (
                        <span
                          style={{
                            color: "var(--status-success-text)",
                            fontSize: "0.85rem",
                            fontWeight: "bold",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "0.25rem",
                          }}
                        >
                          <FiUserCheck /> Active
                        </span>
                      ) : (
                        <span
                          style={{
                            color: "var(--status-error-text)",
                            fontSize: "0.85rem",
                            fontWeight: "bold",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "0.25rem",
                          }}
                        >
                          <FiUserX /> Deactivated
                        </span>
                      )}
                    </td>
                    <td data-label="Actions" style={{ padding: "1rem", textAlign: "right" }}>
                      <div style={{ display: "inline-flex", gap: "0.5rem", flexWrap: "wrap", justifyContent: "flex-end" }}>
                        {user.Role?.RoleName === "Admin" && (
                          <button
                            onClick={() => openCapabilitiesModal(user)}
                            disabled={loading}
                            className="btn btn-outline"
                            style={{
                              padding: "0.4rem 0.8rem",
                              fontSize: "0.85rem",
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "0.25rem",
                              borderColor: "var(--status-purple-border)",
                              color: "var(--status-purple-text)",
                            }}
                            title="Configure Admin Permissions & Roles"
                          >
                            <FiSliders /> Capabilities
                          </button>
                        )}

                        <button
                          onClick={() => {
                            setResetTargetUser(user);
                            setShowResetModal(true);
                          }}
                          disabled={loading}
                          className="btn btn-outline"
                          style={{
                            padding: "0.4rem 0.8rem",
                            fontSize: "0.85rem",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "0.25rem",
                          }}
                          title="Reset Password"
                        >
                          <FiKey /> Reset Pass
                        </button>

                        <button
                          onClick={() => handleToggleStatus(user)}
                          disabled={loading}
                          className="btn"
                          style={{
                            padding: "0.4rem 0.8rem",
                            fontSize: "0.85rem",
                            background: user.IsActive ? "var(--status-error-bg)" : "var(--status-success-bg)",
                            color: user.IsActive ? "var(--status-error-text)" : "var(--status-success-text)",
                            border: `1px solid ${user.IsActive ? "var(--status-error-border)" : "var(--status-success-border)"}`,
                          }}
                        >
                          {user.IsActive ? "Deactivate" : "Activate"}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Section B.2 Capabilities & Presets Modal */}
      {showCapModal && capTargetUser && (
        <div className="portal-modal-overlay">
          <div
            className="modal-content"
            style={{
              background: "var(--color-white)",
              borderRadius: "var(--radius-lg)",
              padding: "2rem",
              width: "100%",
              maxWidth: "680px",
              maxHeight: "90vh",
              overflowY: "auto",
              boxShadow: "var(--shadow-floating)",
            }}
          >
            <h3 style={{ color: "var(--color-navy-blue)", marginBottom: "0.25rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <FiShield /> Admin Permissions &amp; Presets
            </h3>
            <p style={{ color: "var(--color-gray-600)", fontSize: "0.9rem", marginBottom: "1rem" }}>
              Configuring switchable capabilities for <strong>{capTargetUser.Email}</strong>. Self-modification and demoting the last FULL admin are blocked by server guardrails.
            </p>

            {/* Quick Presets */}
            <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1.25rem", flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={() => applyPreset("FULL")}
                className="btn btn-outline"
                style={{ fontSize: "0.8rem", padding: "0.4rem 0.75rem", borderColor: "var(--status-purple-border)", color: "var(--status-purple-text)" }}
              >
                Apply FULL Preset (Principal / ICT Lead - All 14)
              </button>
              <button
                type="button"
                onClick={() => applyPreset("FINANCE")}
                className="btn btn-outline"
                style={{ fontSize: "0.8rem", padding: "0.4rem 0.75rem", borderColor: "var(--status-warning-border)", color: "var(--status-warning-text)" }}
              >
                Apply FINANCE Preset (Bursar - 3)
              </button>
              <button
                type="button"
                onClick={() => applyPreset("REGISTRY")}
                className="btn btn-outline"
                style={{ fontSize: "0.8rem", padding: "0.4rem 0.75rem", borderColor: "var(--status-info-border)", color: "var(--status-info-text)" }}
              >
                Apply REGISTRY Preset (Admissions - 1)
              </button>
            </div>

            <form onSubmit={handleSaveCapabilities}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 280px), 1fr))",
                  gap: "0.65rem",
                  marginBottom: "1.25rem",
                }}
              >
                {ALL_CAPABILITIES.map((cap) => {
                  const meta = CAPABILITY_METADATA[cap];
                  const checked = selectedCaps.includes(cap);
                  return (
                    <label
                      key={cap}
                      style={{
                        display: "flex",
                        alignItems: "flex-start",
                        gap: "0.6rem",
                        padding: "0.65rem",
                        borderRadius: "var(--radius-md)",
                        border: checked ? "1.5px solid var(--brand-primary)" : "1px solid var(--border-primary)",
                        background: checked ? "var(--status-success-bg)" : "var(--bg-card)",
                        cursor: "pointer",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleCap(cap)}
                        style={{ marginTop: "0.2rem" }}
                      />
                      <div>
                        <div style={{ fontWeight: 700, fontSize: "0.82rem", color: "var(--text-heading)" }}>
                          {cap}{" "}
                          {meta.requiresStepUpTotp && (
                            <span style={{ fontSize: "0.7rem", color: "var(--status-warning-text)", fontWeight: 600 }}>
                              (Step-up TOTP)
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                          {meta.description}
                        </div>
                      </div>
                    </label>
                  );
                })}
              </div>

              <div className="form-group">
                <label className="form-label">Audit Reason</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. Scoped account to Bursar FINANCE preset"
                  value={capReason}
                  onChange={(e) => setCapReason(e.target.value)}
                  required
                />
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "1rem", marginTop: "1.25rem" }}>
                <button type="button" className="btn btn-outline" onClick={() => setShowCapModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={loading}>
                  {loading ? "Saving..." : `Save Capabilities (${selectedCaps.length}/14)`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Provision User Modal */}
      {showCreateModal && (
        <div className="portal-modal-overlay">
          <div
            className="modal-content portal-modal-card"
            style={{
              padding: "2rem",
              maxWidth: "480px",
            }}
          >
            <h3 style={{ color: "var(--color-navy-blue)", marginBottom: "1rem" }}>Provision New User Account</h3>
            <form onSubmit={handleCreateUser}>
              <div className="form-group">
                <label className="form-label">Email Address</label>
                <input
                  type="email"
                  className="form-input"
                  placeholder="e.g. teacher.math@wordoffaith.edu.ng"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Assigned Role</label>
                <select
                  className="form-input"
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value)}
                  required
                >
                  {roles.map((r) => (
                    <option key={r.RoleID} value={r.RoleName}>
                      {r.RoleName}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Default Password</label>
                <input
                  type="text"
                  className="form-input"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                />
                <small style={{ color: "var(--color-gray-500)", marginTop: "0.25rem", display: "block" }}>
                  User can change this password after their first login.
                </small>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "1rem", marginTop: "1.5rem" }}>
                <button type="button" className="btn btn-outline" onClick={() => setShowCreateModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={loading}>
                  {loading ? "Creating..." : "Create Account"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reset Password Modal */}
      {showResetModal && resetTargetUser && (
        <div className="portal-modal-overlay">
          <div
            className="modal-content portal-modal-card"
            style={{
              padding: "2rem",
              maxWidth: "480px",
            }}
          >
            <h3 style={{ color: "var(--color-navy-blue)", marginBottom: "0.5rem" }}>Reset Password</h3>
            <p style={{ color: "var(--color-gray-600)", fontSize: "0.9rem", marginBottom: "1.5rem" }}>
              Setting a new password for <strong>{resetTargetUser.Email}</strong>.
            </p>

            <form onSubmit={handleResetPassword}>
              <div className="form-group">
                <label className="form-label">New Password</label>
                <input
                  type="text"
                  className="form-input"
                  value={resetPassValue}
                  onChange={(e) => setResetPassValue(e.target.value)}
                  required
                />
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "1rem", marginTop: "1.5rem" }}>
                <button type="button" className="btn btn-outline" onClick={() => setShowResetModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={loading}>
                  {loading ? "Resetting..." : "Save Password"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
