import { NextResponse } from "next/server";
import { requireRole } from "@/lib/authz";

export async function GET() {
  if (process.env.NODE_ENV === "production" && process.env.ENABLE_DEBUG_ENV !== "true") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    await requireRole(["SUPER_ADMIN", "Admin"]);

    return NextResponse.json({
      status: "ok",
      details: {
        has_POSTGRES_URL: Boolean(process.env.POSTGRES_URL),
        has_POSTGRES_PRISMA_URL: Boolean(process.env.POSTGRES_PRISMA_URL),
        has_POSTGRES_URL_NON_POOLING: Boolean(process.env.POSTGRES_URL_NON_POOLING),
        has_DATABASE_URL: Boolean(process.env.DATABASE_URL),
        has_ALOC_API_KEY: Boolean(process.env.ALOC_API_KEY),
        has_SDASH_API_KEY: Boolean(process.env.SDASH_API_KEY),
        has_GOOGLE_GENERATIVE_AI_API_KEY: Boolean(process.env.GOOGLE_GENERATIVE_AI_API_KEY),
      },
    });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }
}
