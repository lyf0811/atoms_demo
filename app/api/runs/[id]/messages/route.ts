import { NextRequest, NextResponse } from "next/server";
import { updateRunWithMessage } from "@/lib/agent";
import { getUserBySessionToken, SESSION_COOKIE } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const user = await getUserBySessionToken(token);

  if (!user) {
    return NextResponse.json({ error: "Please login first." }, { status: 401 });
  }

  const body = (await request.json()) as { message?: string };
  const message = body.message?.trim();

  if (!message) {
    return NextResponse.json({ error: "Enter a refinement request." }, { status: 400 });
  }

  const result = await updateRunWithMessage(id, user.id, message);

  if (!result) {
    return NextResponse.json({ error: "Run not found." }, { status: 404 });
  }

  return NextResponse.json(result);
}
