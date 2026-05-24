import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";

// GET /api/auth/bridge?token=<session_token>&redirect=/dashboard/branding
// SSO-мост для мобильного приложения: мастер уже залогинен в app,
// нам нужно открыть веб-страницу (например /dashboard/branding) с тем же
// session_token, чтобы он не вводил пароль второй раз.
//
// Принимает существующий valid session token, ставит cookie, редиректит.

const SESSION_COOKIE = "session_token";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token");
  const redirectParam = url.searchParams.get("redirect") || "/dashboard";

  // Защита от open redirect: только внутренние пути
  const safeRedirect = redirectParam.startsWith("/") && !redirectParam.startsWith("//")
    ? redirectParam
    : "/dashboard";

  if (!token) {
    return NextResponse.redirect(new URL("/auth/login", request.url));
  }

  const session = await prisma.session.findUnique({
    where: { token },
    select: { expiresAt: true, masterId: true },
  });

  if (!session || session.expiresAt < new Date()) {
    return NextResponse.redirect(new URL("/auth/login", request.url));
  }

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: session.expiresAt,
  });

  return NextResponse.redirect(new URL(safeRedirect, request.url));
}
