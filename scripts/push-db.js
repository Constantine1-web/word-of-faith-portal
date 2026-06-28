const { execSync } = require('child_process');

let dbUrl = process.env.POSTGRES_URL || process.env.DATABASE_URL;
let prismaUrl = process.env.POSTGRES_PRISMA_URL || dbUrl;

if (!dbUrl) {
  console.log("No database URL found, skipping db push.");
  process.exit(0);
}

// Vercel's Supabase integration sets POSTGRES_URL to port 6543 (transaction pooler).
// Prisma db push/migrate hangs indefinitely on the transaction pooler.
// We must rewrite the URL to use port 5432 (session pooler / direct) for migrations.
if (dbUrl.includes('.pooler.supabase.com:6543')) {
  dbUrl = dbUrl.replace('.pooler.supabase.com:6543', '.pooler.supabase.com:5432');
  console.log("Rewrote Supabase POSTGRES_URL to use port 5432 for migrations.");
}

console.log("Running prisma db push with adjusted Direct URL...");
try {
  execSync('npx prisma db push --accept-data-loss', { 
    env: { 
      ...process.env, 
      POSTGRES_PRISMA_URL: prismaUrl, 
      POSTGRES_URL: dbUrl, 
      DATABASE_URL: dbUrl 
    }, 
    stdio: 'inherit' 
  });
  console.log("Database schema pushed successfully.");
} catch (error) {
  console.error("Failed to push database schema", error);
  process.exit(1);
}
