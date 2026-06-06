import { NextRequest } from "next/server";
import { execFile } from "child_process";
import { mkdir } from "fs/promises";
import os from "os";
import path from "path";
import { getUserBySessionToken, SESSION_COOKIE } from "@/lib/auth";
import { runOpenCodeAgent } from "@/lib/opencode";
import { resolveUserProjectWorkspace } from "@/lib/workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const user = await getUserBySessionToken(token);

  if (!user) {
    return Response.json({ error: "Please login first." }, { status: 401 });
  }

  const whereResult = await findOpenCode(user.id);

  return Response.json({
    opencodeBin: process.env.OPENCODE_BIN || null,
    pathPreview: (process.env.PATH || "").split(path.delimiter).slice(0, 12),
    where: whereResult,
  });
}

export async function POST(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const user = await getUserBySessionToken(token);

  if (!user) {
    return Response.json({ error: "Please login first." }, { status: 401 });
  }

  const body = (await request.json()) as {
    message?: string;
    binary?: string;
    model?: string;
    agent?: string;
    session?: string;
    projectId?: string;
  };
  const message = body.message?.trim();

  if (!message) {
    return Response.json({ error: "Enter a message for OpenCode." }, { status: 400 });
  }

  const { workspaceDirectory } = await resolveUserProjectWorkspace(user.id, body.projectId);
  await mkdir(workspaceDirectory, { recursive: true });
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let isClosed = false;
      const send = (type: string, payload: unknown) => {
        if (isClosed) {
          return;
        }

        controller.enqueue(encoder.encode(`event: ${type}\n`));
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
      };
      const close = () => {
        if (!isClosed) {
          isClosed = true;
          controller.close();
        }
      };

      const child = runOpenCodeAgent({
        message,
        cwd: workspaceDirectory,
        binary: body.binary,
        model: body.model,
        agent: body.agent,
        session: body.session,
        userId: user.id,
        onChunk: (chunk) => {
          send(chunk.type, { content: chunk.content });

          if (chunk.type === "done") {
            close();
          }
        },
      });

      request.signal.addEventListener("abort", () => {
        child.kill();
        close();
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

function findOpenCode(userId = "anonymous") {
  const command = process.platform === "win32" ? "where.exe" : "which";

  return new Promise<{ ok: boolean; output: string }>((resolve) => {
    execFile(command, ["opencode"], { windowsHide: true, env: createOpenCodeEnv(userId) }, (error, stdout, stderr) => {
      resolve({
        ok: !error,
        output: `${stdout}${stderr}`.trim(),
      });
    });
  });
}

function createOpenCodeEnv(userId = "anonymous") {
  const agentEventBaseDirectory = path.resolve(
    process.env.OPENCODE_EVENT_BASE_DIR ||
      process.env.OPENCODE_EVENT_DIR ||
      path.join(/* turbopackIgnore: true */ process.cwd(), "data", "opencode-agent-events"),
  );
  const agentEventDirectory = path.join(agentEventBaseDirectory, "raw");
  const atomsUserId = sanitizeEnvValue(userId);

  if (process.platform !== "win32") {
    return {
      ...process.env,
      ATOMS_USER_ID: atomsUserId,
      OPENCODE_EVENT_BASE_DIR: agentEventBaseDirectory,
      OPENCODE_EVENT_DIR: agentEventDirectory,
      OPENCODE_HOOK_PORT: process.env.OPENCODE_HOOK_PORT || process.env.PORT || "3100",
    };
  }

  const appDataNpm = path.join(os.homedir(), "AppData", "Roaming", "npm");

  return {
    ...process.env,
    PATH: [appDataNpm, process.env.PATH].filter(Boolean).join(path.delimiter),
    ATOMS_USER_ID: atomsUserId,
    OPENCODE_EVENT_BASE_DIR: agentEventBaseDirectory,
    OPENCODE_EVENT_DIR: agentEventDirectory,
    OPENCODE_HOOK_PORT: process.env.OPENCODE_HOOK_PORT || process.env.PORT || "3100",
  };
}

function sanitizeEnvValue(value: string) {
  return String(value || "anonymous").replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120) || "anonymous";
}
