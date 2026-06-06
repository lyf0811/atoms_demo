import { NextRequest } from "next/server";
import { getUserBySessionToken, SESSION_COOKIE } from "@/lib/auth";
import { freePreviewPort, stopUserProjectPreviewProcesses } from "@/lib/preview-processes";
import { stopUserProjectTerminalSessions } from "@/lib/terminal-processes";
import { deleteUserProject } from "@/lib/workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const user = await getUserBySessionToken(request.cookies.get(SESSION_COOKIE)?.value);

  if (!user) {
    return Response.json({ error: "Please login first." }, { status: 401 });
  }

  try {
    const { id } = await context.params;
    await stopUserProjectTerminalSessions(user.id, id);
    await stopUserProjectPreviewProcesses(user.id, id);
    await freePreviewPort();
    const fallbackProject = await deleteUserProject(user.id, id);
    return Response.json({ fallbackProject });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Could not delete project." },
      { status: 400 },
    );
  }
}
