export default function DashboardLoading() {
  return (
    <div style={{ padding: "2rem", width: "100%", animation: "pulse 1.5s infinite ease-in-out" }}>
      {/* Header Skeleton */}
      <div style={{ 
        height: "120px", 
        background: "var(--color-gray-200)", 
        borderRadius: "var(--radius-lg)", 
        marginBottom: "2rem" 
      }} />

      {/* Notice Board Skeleton */}
      <div style={{ 
        height: "200px", 
        background: "var(--color-gray-200)", 
        borderRadius: "var(--radius-lg)", 
        marginBottom: "2rem" 
      }} />

      {/* Grid Cards Skeleton */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", gap: "1.5rem" }}>
        <div style={{ height: "100px", background: "var(--color-gray-200)", borderRadius: "var(--radius-md)" }} />
        <div style={{ height: "100px", background: "var(--color-gray-200)", borderRadius: "var(--radius-md)" }} />
        <div style={{ height: "100px", background: "var(--color-gray-200)", borderRadius: "var(--radius-md)" }} />
      </div>

      <style>{`
        @keyframes pulse {
          0% { opacity: 0.6; }
          50% { opacity: 0.3; }
          100% { opacity: 0.6; }
        }
      `}</style>
    </div>
  );
}
