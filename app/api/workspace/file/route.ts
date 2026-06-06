import { readFile, rename, rm, stat } from "fs/promises";
import path from "path";
import { NextRequest } from "next/server";
import { getUserBySessionToken, SESSION_COOKIE } from "@/lib/auth";
import { resolveUserProjectWorkspace } from "@/lib/workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const context = await resolveWorkspaceFile(request);

  if (!context.ok) {
    return Response.json({ error: context.error }, { status: context.status });
  }

  try {
    const content = await readFile(context.fullPath);
    const fileName = path.basename(context.fullPath);
    return new Response(content, {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="${safeHeaderFileName(fileName)}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return Response.json({ error: "Could not download file." }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const context = await resolveWorkspaceFile(request);

  if (!context.ok) {
    return Response.json({ error: context.error }, { status: context.status });
  }

  const body = (await request.json().catch(() => ({}))) as { name?: string };
  const nextName = String(body.name || "").trim();

  if (!isSafeFileName(nextName)) {
    return Response.json({ error: "Invalid file name." }, { status: 400 });
  }

  const nextPath = path.join(path.dirname(context.fullPath), nextName);

  if (!isInsideWorkspace(nextPath, context.workspaceDirectory)) {
    return Response.json({ error: "Path traversal denied." }, { status: 403 });
  }

  try {
    await rename(context.fullPath, nextPath);
    return Response.json({
      path: path.relative(context.workspaceDirectory, nextPath).replace(/\\/g, "/"),
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Could not rename file." },
      { status: 500 },
    );
  }
}

export async function DELETE(request: NextRequest) {
  const context = await resolveWorkspaceFile(request);

  if (!context.ok) {
    return Response.json({ error: context.error }, { status: context.status });
  }

  try {
    await rm(context.fullPath, { force: true });
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Could not delete file." },
      { status: 500 },
    );
  }
}

async function resolveWorkspaceFile(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const user = await getUserBySessionToken(token);

  if (!user) {
    return { ok: false as const, status: 401, error: "Please login first." };
  }

  const filePath = request.nextUrl.searchParams.get("path");

  if (!filePath || filePath.includes("..") || path.isAbsolute(filePath)) {
    return { ok: false as const, status: 400, error: "Invalid file path." };
  }

  const { workspaceDirectory } = await resolveUserProjectWorkspace(
    user.id,
    request.nextUrl.searchParams.get("projectId"),
  );
  const fullPath = path.resolve(workspaceDirectory, filePath);

  if (!isInsideWorkspace(fullPath, workspaceDirectory)) {
    return { ok: false as const, status: 403, error: "Path traversal denied." };
  }

  try {
    const fileStat = await stat(fullPath);

    if (!fileStat.isFile()) {
      return { ok: false as const, status: 400, error: "Not a file." };
    }
  } catch {
    return { ok: false as const, status: 404, error: "File not found." };
  }

  return { ok: true as const, fullPath, workspaceDirectory };
}

function isInsideWorkspace(targetPath: string, workspaceDirectory: string) {
  const relativePath = path.relative(path.resolve(workspaceDirectory), path.resolve(targetPath));
  return relativePath === "" || (!relativePath.startsWith("..") && !path.isAbsolute(relativePath));
}

function isSafeFileName(value: string) {
  return Boolean(value) && !value.includes("/") && !value.includes("\\") && !value.includes("..");
}

function safeHeaderFileName(value: string) {
  return value.replace(/[<>:"/\\|?*\x00-\x1F]+/g, "-");
}
