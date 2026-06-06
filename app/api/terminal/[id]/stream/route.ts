import { NextRequest } from "next/server";
import { getUserBySessionToken, SESSION_COOKIE } from "@/lib/auth";
import { readTerminalBacklog, subscribeTerminal } from "@/lib/terminal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const user = await getUserBySessionToken(token);

  if (!user) {
    return Response.json({ error: "Please login first." }, { status: 401 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let isClosed = false;
      const send = (chunk: string) => {
        if (isClosed) {
          return;
        }

        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ chunk })}\n\n`));
      };
      const unsubscribe = subscribeTerminal(id, send);

      if (!unsubscribe) {
        send("[terminal session not found]\r\n");
        isClosed = true;
        controller.close();
        return;
      }

      const backlog = readTerminalBacklog(id);

      if (backlog) {
        send(backlog);
      }

      request.signal.addEventListener("abort", () => {
        isClosed = true;
        unsubscribe();
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-store, must-revalidate",
      Connection: "keep-alive",
    },
  });
}
