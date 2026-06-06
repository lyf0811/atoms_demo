import { NextRequest } from "next/server";
import { getUserBySessionToken, SESSION_COOKIE } from "@/lib/auth";
import { createTerminalSession } from "@/lib/terminal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const user = await getUserBySessionToken(token);

  if (!user) {
    return Response.json({ error: "Please login first." }, { status: 401 });
  }

  const session = createTerminalSession();
  return Response.json({ sessionId: session.id });
}
