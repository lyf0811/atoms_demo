import { NextRequest } from "next/server";
import { readdir, stat } from "fs/promises";
import path from "path";
import { getUserBySessionToken, SESSION_COOKIE } from "@/lib/auth";
import { resolveUserProjectWorkspace } from "@/lib/workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_DEPTH = 5;

type FileEntry = {
  name: string;
  path: string;
  type: "file" | "directory";
  language: string;
};

function getLanguageFromExt(fileName: string): string {
  const ext = fileName.includes(".") ? fileName.split(".").pop()!.toLowerCase() : "";
  const map: Record<string, string> = {
    ts: "typescript",
    tsx: "typescript",
    js: "javascript",
    jsx: "javascript",
    mjs: "javascript",
    cjs: "javascript",
    json: "json",
    md: "markdown",
    css: "css",
    html: "html",
    py: "python",
    rb: "ruby",
    go: "go",
    rs: "rust",
    java: "java",
    yaml: "yaml",
    yml: "yaml",
    toml: "toml",
    sh: "bash",
    bat: "bat",
    ps1: "powershell",
    sql: "sql",
    graphql: "graphql",
    vue: "vue",
    svelte: "svelte",
    txt: "text",
    env: "env",
    gitignore: "gitignore",
  };
  return map[ext] || ext || "text";
}

async function walkDir(dir: string, baseDir: string, depth = 0): Promise<FileEntry[]> {
  if (depth > MAX_DEPTH) {
    return [];
  }

  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }

  const results: FileEntry[] = [];

  for (const entry of entries) {
    if (entry.name.startsWith(".") || entry.name === "node_modules") {
      continue;
    }

    const fullPath = path.join(dir, entry.name);
    const relativePath = path.relative(baseDir, fullPath).replace(/\\/g, "/");

    if (entry.isDirectory()) {
      results.push({ name: entry.name, path: relativePath, type: "directory", language: "" });
      const children = await walkDir(fullPath, baseDir, depth + 1);
      results.push(...children);
    } else if (entry.isFile()) {
      results.push({
        name: entry.name,
        path: relativePath,
        type: "file",
        language: getLanguageFromExt(entry.name),
      });
    }
  }

  return results;
}

export async function GET(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const user = await getUserBySessionToken(token);

  if (!user) {
    return Response.json({ error: "Please login first." }, { status: 401 });
  }

  const { workspaceDirectory: workspaceDir } = await resolveUserProjectWorkspace(
    user.id,
    request.nextUrl.searchParams.get("projectId"),
  );

  try {
    await stat(workspaceDir);
  } catch {
    return Response.json({ files: [] });
  }

  const files = await walkDir(workspaceDir, workspaceDir);
  return Response.json({ files });
}
