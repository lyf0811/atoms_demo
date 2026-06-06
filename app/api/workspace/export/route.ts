import AdmZip from "adm-zip";
import { readdir, stat } from "fs/promises";
import path from "path";
import { NextRequest } from "next/server";
import { getUserBySessionToken, SESSION_COOKIE } from "@/lib/auth";
import { resolveUserProjectWorkspace } from "@/lib/workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_DEPTH = 5;

export async function GET(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const user = await getUserBySessionToken(token);

  if (!user) {
    return Response.json({ error: "Please login first." }, { status: 401 });
  }

  const { project, workspaceDirectory } = await resolveUserProjectWorkspace(
    user.id,
    request.nextUrl.searchParams.get("projectId"),
  );

  try {
    await stat(workspaceDirectory);
  } catch {
    return Response.json({ error: "Workspace was not found." }, { status: 404 });
  }

  const zip = new AdmZip();
  await addDirectoryToZip(zip, workspaceDirectory, workspaceDirectory);

  const buffer = zip.toBuffer();
  const fileName = `${safeDownloadName(project.name || project.id)}.zip`;

  return new Response(buffer, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${fileName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      "Cache-Control": "no-store",
    },
  });
}

async function addDirectoryToZip(zip: AdmZip, directory: string, baseDirectory: string, depth = 0) {
  if (depth > MAX_DEPTH) {
    return;
  }

  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (shouldSkipEntry(entry.name)) {
      continue;
    }

    const fullPath = path.join(directory, entry.name);
    const relativePath = path.relative(baseDirectory, fullPath).replace(/\\/g, "/");

    if (entry.isDirectory()) {
      await addDirectoryToZip(zip, fullPath, baseDirectory, depth + 1);
      continue;
    }

    if (entry.isFile()) {
      zip.addLocalFile(fullPath, path.posix.dirname(relativePath) === "." ? "" : path.posix.dirname(relativePath));
    }
  }
}

function shouldSkipEntry(name: string) {
  return name.startsWith(".") || name === "node_modules";
}

function safeDownloadName(value: string) {
  return value
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1F]+/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80) || "project-code";
}
