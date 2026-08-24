"use client";

import { useState } from "react";
import { createUserAccount, toggleUserStatus, adminResetPassword } from "@/app/actions/admin";
import { FiUserPlus, FiKey, FiCheck, FiX, FiSearch, FiShield, FiUserCheck, FiUserX } from "react-icons/fi";

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

  const filteredUsers = users.filter(u => {
    const matchesSearch = u.Email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.Student?.PreferredName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.Student?.AdmissionNo?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesRole = roleFilter === "ALL" || u.Role.RoleName === roleFilter;
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
      setUsers(prev => prev.map(u => u.UserID === user.UserID ? { ...u, IsActive: nextState } : u));
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
      password: newPassword
    });

    if (res.success && res.user) {
      const createdRole = roles.find(r => r.RoleName === newRole);
      setUsers(prev => [{ ...res.user, Role: createdRole }, ...prev]);
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

  return (
    <div>
      {error && <div style={{ background: "#fee2e2", color: "#b91c1c", padding: "1rem", borderRadius: "var(--radius-md)", marginBottom: "1.5rem", fontWeight: "bold" }}>{error}</div>}
      {success && <div style={{ background: "#dcfce7", color: "#15803d", padding: "1rem", borderRadius: "var(--radius-md)", marginBottom: "1.5rem", fontWeight: "bold" }}>{success}</div>}

      {/* Control Bar */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem", flexWrap: "wrap", gap: "1rem" }}>
        <div style={{ display: "flex", gap: "1rem", flex: 1, minWidth: "280px", maxWidth: "600px" }}>
          <div style={{ position: "relative", flex: 1 }}>
            <FiSearch style={{ position: "absolute", left: "1rem", top: "50%", transform: "translateY(-50%)", color: "var(--color-gray-400)" }} />
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
            {roles.map(r => (
              <option key={r.RoleID} value={r.RoleName}>{r.RoleName}</option>
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
      <div style={{ background: "var(--color-white)", borderRadius: "var(--radius-lg)", border: "1px solid var(--color-gray-200)", overflowX: "auto", boxShadow: "var(--shadow-sm)" }}>
        <table className="responsive-table" style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "var(--color-gray-50)", borderBottom: "2px solid var(--color-gray-200)" }}>
              <th style={{ padding: "1rem", textAlign: "left" }}>User / Email</th>
              <th style={{ padding: "1rem", textAlign: "center" }}>Role</th>
              <th style={{ padding: "1rem", textAlign: "left" }}>Associated Profile</th>
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
              filteredUsers.map((user) => (
                <tr key={user.UserID} style={{ borderBottom: "1px solid var(--color-gray-200)", opacity: user.IsActive ? 1 : 0.6 }}>
                  <td data-label="User / Email" style={{ padding: "1rem", fontWeight: "600", color: "var(--color-navy-blue)" }}>
                    {user.Email}
                  </td>
                  <td data-label="Role" style={{ padding: "1rem", textAlign: "center" }}>
                    <span style={{
                      padding: "0.25rem 0.75rem",
                      borderRadius: "var(--radius-full)",
                      fontSize: "0.85rem",
                      fontWeight: "bold",
                      background: user.Role.RoleName === "Admin" ? "#fee2e2" : user.Role.RoleName === "Teacher" ? "#dbeafe" : "#dcfce7",
                      color: user.Role.RoleName === "Admin" ? "#b91c1c" : user.Role.RoleName === "Teacher" ? "#1e40af" : "#15803d"
                    }}>
                      {user.Role.RoleName}
                    </span>
                  </td>
                  <td data-label="Associated Profile" style={{ padding: "1rem", fontSize: "0.9rem", color: "var(--color-gray-700)" }}>
                    {user.Student ? (
                      <div>
                        <strong>{user.Student.PreferredName}</strong> · {user.Student.AdmissionNo} ({user.Student.Class?.ClassName})
                      </div>
                    ) : user.Role.RoleName === "Teacher" ? (
                      <div>
                        {user.FormMasterClasses?.length > 0 && (
                          <span style={{ color: "var(--color-primary-green)", fontWeight: "bold", marginRight: "0.5rem" }}>
                            Form Master ({user.FormMasterClasses.map((c: any) => c.ClassName).join(", ")})
                          </span>
                        )}
                        <span>{user.TeacherMaps?.length || 0} Subject Arm(s)</span>
                      </div>
                    ) : (
                      <span style={{ color: "var(--color-gray-500)" }}>System Administrator</span>
                    )}
                  </td>
                  <td data-label="Status" style={{ padding: "1rem", textAlign: "center" }}>
                    {user.IsActive ? (
                      <span style={{ color: "#16a34a", fontSize: "0.85rem", fontWeight: "bold", display: "inline-flex", alignItems: "center", gap: "0.25rem" }}>
                        <FiUserCheck /> Active
                      </span>
                    ) : (
                      <span style={{ color: "#dc2626", fontSize: "0.85rem", fontWeight: "bold", display: "inline-flex", alignItems: "center", gap: "0.25rem" }}>
                        <FiUserX /> Deactivated
                      </span>
                    )}
                  </td>
                  <td data-label="Actions" style={{ padding: "1rem", textAlign: "right" }}>
                    <div style={{ display: "inline-flex", gap: "0.5rem" }}>
                      <button
                        onClick={() => {
                          setResetTargetUser(user);
                          setShowResetModal(true);
                        }}
                        disabled={loading}
                        className="btn btn-outline"
                        style={{ padding: "0.4rem 0.8rem", fontSize: "0.85rem", display: "inline-flex", alignItems: "center", gap: "0.25rem" }}
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
                          background: user.IsActive ? "#fee2e2" : "#dcfce7",
                          color: user.IsActive ? "#b91c1c" : "#15803d",
                          border: "none"
                        }}
                      >
                        {user.IsActive ? "Deactivate" : "Activate"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Provision User Modal */}
      {showCreateModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: "1rem" }}>
          <div className="modal-content" style={{ background: "var(--color-white)", borderRadius: "var(--radius-lg)", padding: "2rem", width: "100%", maxWidth: "480px", boxShadow: "var(--shadow-floating)" }}>
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
                  {roles.map(r => (
                    <option key={r.RoleID} value={r.RoleName}>{r.RoleName}</option>
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
                <button type="button" className="btn btn-outline" onClick={() => setShowCreateModal(false)}>Cancel</button>
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
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: "1rem" }}>
          <div className="modal-content" style={{ background: "var(--color-white)", borderRadius: "var(--radius-lg)", padding: "2rem", width: "100%", maxWidth: "480px", boxShadow: "var(--shadow-floating)" }}>
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
                <button type="button" className="btn btn-outline" onClick={() => setShowResetModal(false)}>Cancel</button>
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
