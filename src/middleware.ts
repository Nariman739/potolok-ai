import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Security headers applied to all matched routes
const securityHeaders = {
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
  "Permissions-Policy":
    "camera=(), microphone=(), geolocation=(self), browsing-topics=()",
  "Content-Security-Policy": [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://*.public.blob.vercel-storage.com https://*.vercel-storage.com",
    "font-src 'self' data:",
    "connect-src 'self' https://*.neon.tech https://openrouter.ai https://api.telegram.org https://*.vercel-storage.com",
    "frame-src 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; "),
};

export function middleware(request: NextRequest) {
  const token = request.cookies.get("session_token")?.value;
  const { pathname } = request.nextUrl;

  // Protected routes — require auth
  if (pathname.startsWith("/dashboard")) {
    if (!token) {
      const loginUrl = new URL("/auth/login", request.url);
      loginUrl.searchParams.set("redirect", pathname);
      const redirectResponse = NextResponse.redirect(loginUrl);
      for (const [key, value] of Object.entries(securityHeaders)) {
        redirectResponse.headers.set(key, value);
      }
      return redirectResponse;
    }
  }

  // Auth pages — redirect to dashboard if already logged in
  if (pathname.startsWith("/auth/")) {
    if (token) {
      const dashboardResponse = NextResponse.redirect(
        new URL("/dashboard", request.url)
      );
      for (const [key, value] of Object.entries(securityHeaders)) {
        dashboardResponse.headers.set(key, value);
      }
      return dashboardResponse;
    }
  }

  // Apply security headers to all responses
  const response = NextResponse.next();
  for (const [key, value] of Object.entries(securityHeaders)) {
    response.headers.set(key, value);
  }
  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico
     * - public files (images, etc.)
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
