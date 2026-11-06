import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

const PUBLIC_PORTAL_ALLOWLIST = new Set([
  "/portal/login",
  "/portal/register",
  "/portal/forgot-password",
  "/portal/reset-password",
  "/portal/unauthorized",
]);

const ADMIN_ALLOWED_ROLES = new Set([
  "Admin",
  "admin",
  "SUPER_ADMIN",
  "PRINCIPAL",
  "BURSAR",
  "ADMISSIONS",
]);

const TEACHER_ALLOWED_ROLES = new Set([
  "Teacher",
  "teacher",
  "TEACHER",
  "FORM_MASTER",
  "PRINCIPAL",
  "SUPER_ADMIN",
  "Admin",
  "admin",
]);

function resolveProxyJwtSecret(): string {
  const configured = process.env.NEXTAUTH_SECRET?.trim();
  if (configured && configured.length >= 16) {
    return configured;
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error("CRITICAL: NEXTAUTH_SECRET must be configured in production.");
  }
  return "dev-only-nextauth-secret-do-not-use-in-production-2026";
}

function applySecurityHeaders(response: NextResponse): NextResponse {
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), payment=(self), usb=()"
  );
  response.headers.set(
    "Strict-Transport-Security",
    "max-age=63072000; includeSubDomains; preload"
  );
  return response;
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow non-portal routes with security headers
  if (!pathname.startsWith("/portal")) {
    return applySecurityHeaders(NextResponse.next());
  }

  // Allow explicit public authentication & error routes under /portal
  if (PUBLIC_PORTAL_ALLOWLIST.has(pathname)) {
    return applySecurityHeaders(NextResponse.next());
  }

  // Default-deny for all other /portal/* routes: verify JWT explicitly (fail-closed)
  const token = await getToken({
    req: request,
    secret: resolveProxyJwtSecret(),
  });

  const numericId = Number(token?.id ?? token?.sub);
  const hasValidIdentity =
    token !== null &&
    typeof token === "object" &&
    !Number.isNaN(numericId) &&
    numericId > 0 &&
    typeof token.role === "string" &&
    token.role.length > 0;

  if (!hasValidIdentity) {
    const loginUrl = new URL("/portal/login", request.url);
    if (pathname.startsWith("/portal/")) {
      loginUrl.searchParams.set("callbackUrl", pathname);
    }
    return applySecurityHeaders(NextResponse.redirect(loginUrl));
  }

  const userRoles = new Set<string>([
    token.role as string,
    ...((Array.isArray(token.roles) ? token.roles : []) as string[]),
  ]);

  // Gate 1: Admin Control Center (/portal/admin/*)
  if (pathname.startsWith("/portal/admin")) {
    const canAccessAdmin = Array.from(userRoles).some((r) => ADMIN_ALLOWED_ROLES.has(r));
    if (!canAccessAdmin) {
      return applySecurityHeaders(
        NextResponse.redirect(new URL("/portal/unauthorized?zone=admin", request.url))
      );
    }
  }

  // Gate 2: Dedicated Teacher Workspace (/portal/teacher/*)
  if (pathname.startsWith("/portal/teacher")) {
    const canAccessTeacher = Array.from(userRoles).some((r) => TEACHER_ALLOWED_ROLES.has(r));
    if (!canAccessTeacher) {
      return applySecurityHeaders(
        NextResponse.redirect(new URL("/portal/unauthorized?zone=teacher", request.url))
      );
    }
  }

  return applySecurityHeaders(NextResponse.next());
}

export const config = {
  matcher: ["/portal/:path*", "/api/:path*"],
};
