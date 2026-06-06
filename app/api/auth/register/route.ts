import { NextRequest, NextResponse } from "next/server";
import { createSession, createUser, sessionCookieOptions, toPublicUser, SESSION_COOKIE } from "@/lib/auth";
import { seedUserWorkspace } from "@/lib/workspace";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { email?: string; password?: string; name?: string };

    if (!body.email || !body.password) {
      return NextResponse.json({ error: "Email and password are required." }, { status: 400 });
    }

    const user = await createUser(body.email, body.password, body.name);
    await seedUserWorkspace(user.id);
    const session = await createSession(user.id);
    const response = NextResponse.json({ user: toPublicUser(user) }, { status: 201 });
    response.cookies.set(SESSION_COOKIE, session.token, sessionCookieOptions(session.expiresAt));
    return response;
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Registration failed." },
      { status: 400 },
    );
  }
}
