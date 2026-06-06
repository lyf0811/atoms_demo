import { NextRequest, NextResponse } from "next/server";
import { getUserBySessionToken, SESSION_COOKIE, toPublicUser } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const user = await getUserBySessionToken(token);
  return NextResponse.json({ user: user ? toPublicUser(user) : null });
}
