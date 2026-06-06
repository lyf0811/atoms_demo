import { NextRequest } from "next/server";
import { readFile, stat } from "fs/promises";
import path from "path";
import { getUserBySessionToken, SESSION_COOKIE } from "@/lib/auth";
import { resolveUserProjectWorkspace } from "@/lib/workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_FILE_SIZE = 2 * 1024 * 1024;

export async function GET(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const user = await getUserBySessionToken(token);

  if (!user) {
    return Response.json({ error: "Please login first." }, { status: 401 });
  }

  const filePath = request.nextUrl.searchParams.get("path");

  if (!filePath || filePath.includes("..") || path.isAbsolute(filePath)) {
    return Response.json({ error: "Invalid file path." }, { status: 400 });
  }

  const { workspaceDirectory: workspaceDir } = await resolveUserProjectWorkspace(
    user.id,
    request.nextUrl.searchParams.get("projectId"),
  );
  const fullPath = path.resolve(workspaceDir, filePath);

  if (!fullPath.startsWith(path.resolve(workspaceDir))) {
    return Response.json({ error: "Path traversal denied." }, { status: 403 });
  }

  try {
    const fileStat = await stat(fullPath);

    if (!fileStat.isFile()) {
      return Response.json({ error: "Not a file." }, { status: 400 });
    }

    if (fileStat.size > MAX_FILE_SIZE) {
      return Response.json({ error: "File too large." }, { status: 400 });
    }
  } catch {
    return Response.json({ error: "File not found." }, { status: 404 });
  }

  try {
    const content = await readFile(fullPath, "utf8");
    return Response.json({ content, path: filePath });
  } catch {
    return Response.json({ error: "Could not read file." }, { status: 500 });
  }
}
