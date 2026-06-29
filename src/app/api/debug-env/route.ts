import { NextResponse } from "next/server";

export async function GET() {
  const envKeys = Object.keys(process.env);
  
  // Also check if the specific Postgres URLs exist and are valid strings
  const postgresVars = {
    has_POSTGRES_URL: !!process.env.POSTGRES_URL,
    has_POSTGRES_PRISMA_URL: !!process.env.POSTGRES_PRISMA_URL,
    has_POSTGRES_URL_NON_POOLING: !!process.env.POSTGRES_URL_NON_POOLING,
    has_DATABASE_URL: !!process.env.DATABASE_URL,
    POSTGRES_URL_prefix: process.env.POSTGRES_URL ? process.env.POSTGRES_URL.substring(0, 15) : null,
    POSTGRES_URL_NON_POOLING_prefix: process.env.POSTGRES_URL_NON_POOLING ? process.env.POSTGRES_URL_NON_POOLING.substring(0, 15) : null,
  };

  return NextResponse.json({
    keys: envKeys.filter(k => k.includes('POSTGRES') || k.includes('DATABASE') || k.includes('SUPABASE')),
    details: postgresVars
  });
}
