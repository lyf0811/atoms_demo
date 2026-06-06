import { NextRequest, NextResponse } from "next/server";
import { createRun } from "@/lib/agent";
import { getUserBySessionToken, SESSION_COOKIE } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const user = await getUserBySessionToken(token);

  if (!user) {
    return NextResponse.json({ error: "Please login first." }, { status: 401 });
  }

  const body = (await request.json()) as { prompt?: string };
  const prompt = body.prompt?.trim();

  if (!prompt) {
    return NextResponse.json({ error: "Enter an app description." }, { status: 400 });
  }

  const run = await createRun(user.id, prompt);
  return NextResponse.json({ run });
}
