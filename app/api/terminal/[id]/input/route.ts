import { NextRequest } from "next/server";
import { getUserBySessionToken, SESSION_COOKIE } from "@/lib/auth";
import { writeTerminalInput } from "@/lib/terminal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const user = await getUserBySessionToken(token);

  if (!user) {
    return Response.json({ error: "Please login first." }, { status: 401 });
  }

  const body = (await request.json()) as { input?: string };
  const ok = writeTerminalInput(id, body.input ?? "");

  if (!ok) {
    return Response.json({ error: "Terminal session not found." }, { status: 404 });
  }

  return Response.json({ ok: true });
}
