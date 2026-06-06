import { NextRequest, NextResponse } from "next/server";
import { getRunForUser } from "@/lib/agent";
import { getUserBySessionToken, SESSION_COOKIE } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const user = await getUserBySessionToken(token);

  if (!user) {
    return NextResponse.json({ error: "Please login first." }, { status: 401 });
  }

  const run = await getRunForUser(id, user.id);

  if (!run) {
    return NextResponse.json({ error: "Run not found." }, { status: 404 });
  }

  return NextResponse.json({ events: run.events });
}
