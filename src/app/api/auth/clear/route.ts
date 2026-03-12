import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const cookieStore = await cookies();
  cookieStore.delete("session_token");
  const loginUrl = new URL("/auth/login", request.url);
  return NextResponse.redirect(loginUrl);
}
