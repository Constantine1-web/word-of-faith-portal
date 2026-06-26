import { FiUsers, FiCreditCard, FiFileText, FiTrendingUp } from "react-icons/fi";

export default function AdminDashboard() {
  return (
    <div>
      <h1 style={{ color: "var(--color-navy-blue)", marginBottom: "2rem", borderBottom: "2px solid var(--color-gray-200)", paddingBottom: "1rem" }}>Admin Dashboard</h1>
      
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", gap: "1.5rem", marginBottom: "3rem" }}>
        
        <div style={{ background: "var(--color-white)", padding: "1.5rem", borderRadius: "var(--radius-md)", boxShadow: "var(--shadow-sm)", display: "flex", alignItems: "center", gap: "1rem", borderLeft: "4px solid var(--color-primary-green)" }}>
          <div style={{ background: "rgba(34, 197, 94, 0.1)", color: "var(--color-primary-green)", padding: "1rem", borderRadius: "50%", fontSize: "1.5rem" }}><FiUsers /></div>
          <div>
            <h3 style={{ color: "var(--color-gray-500)", fontSize: "0.9rem", margin: 0, textTransform: "uppercase" }}>Total Students</h3>
            <p style={{ color: "var(--color-navy-blue)", fontSize: "1.8rem", fontWeight: "bold", margin: 0 }}>1,245</p>
          </div>
        </div>

        <div style={{ background: "var(--color-white)", padding: "1.5rem", borderRadius: "var(--radius-md)", boxShadow: "var(--shadow-sm)", display: "flex", alignItems: "center", gap: "1rem", borderLeft: "4px solid #3b82f6" }}>
          <div style={{ background: "rgba(59, 130, 246, 0.1)", color: "#3b82f6", padding: "1rem", borderRadius: "50%", fontSize: "1.5rem" }}><FiCreditCard /></div>
          <div>
            <h3 style={{ color: "var(--color-gray-500)", fontSize: "0.9rem", margin: 0, textTransform: "uppercase" }}>Fees Collected</h3>
            <p style={{ color: "var(--color-navy-blue)", fontSize: "1.8rem", fontWeight: "bold", margin: 0 }}>₦4.5M</p>
          </div>
        </div>

        <div style={{ background: "var(--color-white)", padding: "1.5rem", borderRadius: "var(--radius-md)", boxShadow: "var(--shadow-sm)", display: "flex", alignItems: "center", gap: "1rem", borderLeft: "4px solid #a855f7" }}>
          <div style={{ background: "rgba(168, 85, 247, 0.1)", color: "#a855f7", padding: "1rem", borderRadius: "50%", fontSize: "1.5rem" }}><FiFileText /></div>
          <div>
            <h3 style={{ color: "var(--color-gray-500)", fontSize: "0.9rem", margin: 0, textTransform: "uppercase" }}>Results Uploaded</h3>
            <p style={{ color: "var(--color-navy-blue)", fontSize: "1.8rem", fontWeight: "bold", margin: 0 }}>85%</p>
          </div>
        </div>

      </div>

      <h2 style={{ color: "var(--color-navy-blue)", marginBottom: "1rem", fontSize: "1.25rem" }}>Recent Activities</h2>
      <div style={{ background: "var(--color-white)", borderRadius: "var(--radius-md)", boxShadow: "var(--shadow-sm)", padding: "1.5rem" }}>
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          <li style={{ padding: "1rem 0", borderBottom: "1px solid var(--color-gray-100)", display: "flex", gap: "1rem", alignItems: "center" }}>
            <span style={{ color: "var(--color-primary-green)" }}><FiTrendingUp /></span>
            <span><strong>Mrs. Sarah</strong> uploaded Primary 4 Mathematics results.</span>
            <span style={{ marginLeft: "auto", color: "var(--color-gray-500)", fontSize: "0.85rem" }}>10 mins ago</span>
          </li>
          <li style={{ padding: "1rem 0", borderBottom: "1px solid var(--color-gray-100)", display: "flex", gap: "1rem", alignItems: "center" }}>
            <span style={{ color: "#3b82f6" }}><FiCreditCard /></span>
            <span><strong>WOF/2026/P01</strong> completed First Term Tuition payment.</span>
            <span style={{ marginLeft: "auto", color: "var(--color-gray-500)", fontSize: "0.85rem" }}>1 hr ago</span>
          </li>
          <li style={{ padding: "1rem 0", display: "flex", gap: "1rem", alignItems: "center" }}>
            <span style={{ color: "var(--color-primary-green)" }}><FiUsers /></span>
            <span>New student admission registered: <strong>WOF/2026/005</strong>.</span>
            <span style={{ marginLeft: "auto", color: "var(--color-gray-500)", fontSize: "0.85rem" }}>3 hrs ago</span>
          </li>
        </ul>
      </div>
    </div>
  );
}
