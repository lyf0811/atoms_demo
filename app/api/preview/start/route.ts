import { spawn, type ChildProcessWithoutNullStreams } from "child_process";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { stat } from "fs/promises";
import path from "path";
import { NextRequest } from "next/server";
import { getUserBySessionToken, SESSION_COOKIE } from "@/lib/auth";
import { freePreviewPort, getPreviewProcessStore } from "@/lib/preview-processes";
import { resolveUserProjectWorkspace } from "@/lib/workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PreviewProcess = {
  child: ChildProcessWithoutNullStreams;
  cwd: string;
  ready: boolean;
  logs: string[];
};

const previewProcesses = getPreviewProcessStore();

export async function POST(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const user = await getUserBySessionToken(token);

  if (!user) {
    return Response.json({ error: "Please login first." }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as { path?: string; restart?: boolean; projectId?: string };
  const selectedPath = String(body.path || "").trim();
  const shouldRestart = body.restart === true;
  const { project, workspaceDirectory: workspaceDir } = await resolveUserProjectWorkspace(user.id, body.projectId);
  const cwdResult = await resolvePreviewWorkingDirectory(workspaceDir, selectedPath);

  if (!cwdResult.ok) {
    return Response.json({ error: cwdResult.error }, { status: cwdResult.status });
  }

  const processKey = `${user.id}:${project.id}:${cwdResult.cwd}`;
  const encoder = new TextEncoder();

  return new Response(
    new ReadableStream<Uint8Array>({
      async start(controller) {
        let isClosed = false;
        let timeout: ReturnType<typeof setTimeout> | undefined;
        const logs: string[] = [];
        let activePreviewProcess: PreviewProcess | null = null;
        let activeBuildChild: ChildProcessWithoutNullStreams | null = null;
        let activeInstallChild: ChildProcessWithoutNullStreams | null = null;

        const send = (event: string, payload: unknown) => {
          if (isClosed) {
            return;
          }

          try {
            controller.enqueue(encoder.encode(`event: ${event}\n`));
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
          } catch {
            isClosed = true;
          }
        };
        const close = () => {
          if (isClosed) {
            return;
          }

          isClosed = true;
          if (timeout) {
            clearTimeout(timeout);
          }
          request.signal.removeEventListener("abort", cancelActiveChildren);
          try {
            controller.close();
          } catch {
            // The client may have already disconnected.
          }
        };
        const cancelActiveChildren = () => {
          isClosed = true;
          if (timeout) {
            clearTimeout(timeout);
          }
          previewProcesses.delete(processKey);
          safeKill(activePreviewProcess?.child);
          safeKill(activeBuildChild);
          safeKill(activeInstallChild);
        };

        if (request.signal.aborted) {
          cancelActiveChildren();
          return;
        }

        request.signal.addEventListener("abort", cancelActiveChildren, { once: true });

        const existing = previewProcesses.get(processKey);
        if (existing && shouldRestart) {
          send("log", { content: `[preview] stopping dev server in ${existing.cwd}` });
          safeKill(existing.child);
          previewProcesses.delete(processKey);
        }

        if (existing?.ready && !shouldRestart) {
          send("log", { content: `[preview] dev server already running in ${existing.cwd}` });
          send("ready", { cwd: existing.cwd });
          close();
          return;
        }

        if (existing && !existing.ready && !shouldRestart) {
          send("log", { content: `[preview] dev server is still starting in ${existing.cwd}` });
          for (const log of existing.logs.slice(-30)) {
            send("log", { content: log });
          }
          send("log", { content: "[preview] waiting for the existing startup process..." });
          timeout = setTimeout(close, 1200);
          return;
        }

        stopOtherUserPreviewProcesses(user.id, processKey, send);
        await freePreviewPort((content) => send("log", { content }));
        send("log", { content: `[preview] cd ${cwdResult.cwd}` });
        ensurePreviewNextConfig(cwdResult.cwd);

        const appendLog = (chunk: string) => {
          const text = stripAnsi(chunk);
          logs.push(text);
          logs.splice(0, Math.max(0, logs.length - 100));
          send("log", { content: text });
        };

        const startBuild = () => {
          send("log", { content: "[preview] npm run build" });
          const buildCommand = createNpmScriptCommand("build");
          const buildChild = spawn(buildCommand.file, buildCommand.args, {
            cwd: cwdResult.cwd,
            env: createPreviewEnv(cwdResult.cwd, "build"),
            windowsHide: true,
          });
          activeBuildChild = buildChild;

          buildChild.stdout.setEncoding("utf8");
          buildChild.stderr.setEncoding("utf8");
          buildChild.stdout.on("data", appendLog);
          buildChild.stderr.on("data", appendLog);
          buildChild.on("error", (error) => {
            send("error", { content: error.message });
            close();
          });
          buildChild.on("close", (code) => {
            activeBuildChild = null;
            if (code === 0) {
              send("log", { content: "[preview] build completed" });
              startDevServer();
            } else {
              send("error", { content: `[preview] build failed with code ${code}` });
              close();
            }
          });
        };

        const startDevServer = () => {
          send("log", { content: "[preview] npm run dev" });
          const devCommand = createNpmScriptCommand("dev");
          const child = spawn(devCommand.file, devCommand.args, {
            cwd: cwdResult.cwd,
            env: createPreviewEnv(cwdResult.cwd, "dev"),
            windowsHide: true,
          });
          const previewProcess: PreviewProcess = {
            child,
            cwd: cwdResult.cwd,
            ready: false,
            logs,
          };
          activePreviewProcess = previewProcess;
          previewProcesses.set(processKey, previewProcess);

          const appendDevLog = (chunk: string) => {
            const text = stripAnsi(chunk);
            previewProcess.logs.push(text);
            previewProcess.logs = previewProcess.logs.slice(-100);
            send("log", { content: text });

            if (!previewProcess.ready && isDevServerReady(text)) {
              previewProcess.ready = true;
              send("ready", { cwd: cwdResult.cwd });
              close();
            }
          };

          child.stdout.setEncoding("utf8");
          child.stderr.setEncoding("utf8");
          child.stdout.on("data", appendDevLog);
          child.stderr.on("data", appendDevLog);
          child.on("error", (error) => {
            previewProcesses.delete(processKey);
            send("error", { content: error.message });
            close();
          });
          child.on("close", (code) => {
            previewProcesses.delete(processKey);
            if (!previewProcess.ready) {
              send("error", { content: `[preview] dev server exited with code ${code}` });
              close();
            }
          });
        };

        const startInstall = () => {
          send("log", { content: "[preview] npm install" });
          const installCommand = createNpmScriptCommand("install");
          const installChild = spawn(installCommand.file, installCommand.args, {
            cwd: cwdResult.cwd,
            env: createPreviewEnv(cwdResult.cwd, "install"),
            windowsHide: true,
          });
          activeInstallChild = installChild;

          installChild.stdout.setEncoding("utf8");
          installChild.stderr.setEncoding("utf8");
          installChild.stdout.on("data", appendLog);
          installChild.stderr.on("data", appendLog);
          installChild.on("error", (error) => {
            send("error", { content: error.message });
            close();
          });
          installChild.on("close", (code) => {
            activeInstallChild = null;
            if (code === 0) {
              send("log", { content: "[preview] dependencies installed" });
              startBuild();
            } else {
              send("error", { content: `[preview] npm install failed with code ${code}` });
              close();
            }
          });
        };

        if (shouldInstallDependencies(cwdResult.cwd)) {
          startInstall();
        } else {
          startBuild();
        }

        timeout = setTimeout(() => {
          if (!activePreviewProcess?.ready) {
            previewProcesses.delete(processKey);
            safeKill(activePreviewProcess?.child);
            safeKill(activeBuildChild);
            safeKill(activeInstallChild);
            send("error", { content: "[preview] timed out waiting for preview to become ready" });
          }
          close();
        }, 180_000);
      },
    }),
    {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-store, must-revalidate",
        Connection: "keep-alive",
      },
    },
  );
}

function stopOtherUserPreviewProcesses(
  userId: string,
  activeProcessKey: string,
  send: (event: string, payload: unknown) => void,
) {
  const userPrefix = `${userId}:`;

  for (const [key, previewProcess] of Array.from(previewProcesses.entries())) {
    if (key === activeProcessKey || !key.startsWith(userPrefix)) {
      continue;
    }

    send("log", { content: `[preview] stopping previous project dev server in ${previewProcess.cwd}` });
    safeKill(previewProcess.child);
    previewProcesses.delete(key);
  }
}

function safeKill(child?: { kill: () => unknown } | null) {
  try {
    child?.kill();
  } catch {
    // The child may have already exited.
  }
}

async function resolvePreviewWorkingDirectory(workspaceDir: string, selectedPath: string) {
  const safeWorkspace = path.resolve(workspaceDir);

  if (selectedPath.includes("..") || path.isAbsolute(selectedPath)) {
    return { ok: false as const, status: 400, error: "Invalid file path." };
  }

  const targetPath = path.resolve(safeWorkspace, selectedPath || ".");

  if (!isInsideWorkspace(targetPath, safeWorkspace)) {
    return { ok: false as const, status: 403, error: "Path traversal denied." };
  }

  let targetDirectory = targetPath;

  try {
    const targetStat = await stat(targetPath);
    targetDirectory = targetStat.isDirectory() ? targetPath : path.dirname(targetPath);
  } catch {
    targetDirectory = path.dirname(targetPath);
  }

  const packageDirectory = findNearestPackageDirectory(targetDirectory, safeWorkspace);

  if (!packageDirectory) {
    return { ok: false as const, status: 404, error: "Could not find a package.json for the selected file." };
  }

  return { ok: true as const, cwd: packageDirectory };
}

function findNearestPackageDirectory(startDirectory: string, workspaceDir: string) {
  let current = path.resolve(startDirectory);
  const root = path.resolve(workspaceDir);

  while (current.startsWith(root)) {
    if (existsSync(path.join(current, "package.json"))) {
      return current;
    }

    const parent = path.dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }

  return null;
}

function isInsideWorkspace(targetPath: string, workspaceDir: string) {
  const relativePath = path.relative(workspaceDir, targetPath);
  return relativePath === "" || (!relativePath.startsWith("..") && !path.isAbsolute(relativePath));
}

function createNpmScriptCommand(script: "install" | "build" | "dev") {
  const command = script === "install" ? "npm install" : `npm run ${script}`;
  const args = script === "install" ? ["install"] : ["run", script];

  if (process.platform === "win32") {
    return {
      file: process.env.ComSpec || "cmd.exe",
      args: ["/d", "/s", "/c", command],
    };
  }

  return {
    file: "npm",
    args,
  };
}

function shouldInstallDependencies(cwd: string) {
  const packageJsonPath = path.join(cwd, "package.json");
  const nodeModulesPath = path.join(cwd, "node_modules");

  if (!existsSync(packageJsonPath)) {
    return false;
  }

  if (!existsSync(nodeModulesPath)) {
    return true;
  }

  try {
    const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const dependencyNames = [
      ...Object.keys(packageJson.dependencies || {}),
      ...Object.keys(packageJson.devDependencies || {}),
    ];

    return dependencyNames.some((dependencyName) => !existsSync(path.join(nodeModulesPath, ...dependencyName.split("/"))));
  } catch {
    return false;
  }
}

function ensurePreviewNextConfig(cwd: string) {
  const configPath = path.join(cwd, "next.config.mjs");
  const fixedConfig = `import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  turbopack: {
    root,
  },
};

export default nextConfig;
`;

  try {
    if (!existsSync(configPath)) {
      writeFileSync(configPath, fixedConfig, "utf8");
      return;
    }

    const currentConfig = readFileSync(configPath, "utf8");
    if (currentConfig.includes("const nextConfig = {};") && !currentConfig.includes("turbopack")) {
      writeFileSync(configPath, fixedConfig, "utf8");
    }
  } catch {
    // Keep preview startup best-effort; Next will report config errors if any remain.
  }
}

function createPreviewEnv(cwd: string, phase: "install" | "build" | "dev") {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    HOST: "0.0.0.0",
    PORT: "3000",
  };
  const mutableEnv = env as Record<string, string | undefined>;
  if (phase === "build") {
    mutableEnv.NODE_ENV = "production";
  } else if (phase === "dev") {
    mutableEnv.NODE_ENV = "development";
  } else if (env.NODE_ENV && !["production", "development", "test"].includes(env.NODE_ENV)) {
    delete mutableEnv.NODE_ENV;
  }

  const pathKey = Object.keys(env).find((key) => key.toLowerCase() === "path") || "PATH";
  env[pathKey] = createPreviewPath(cwd);
  return env;
}

function createPreviewPath(cwd: string) {
  return [
    path.join(cwd, "node_modules", ".bin"),
    path.join(process.cwd(), "node_modules", ".bin"),
    process.env.PATH,
  ]
    .filter(Boolean)
    .join(path.delimiter);
}

function isDevServerReady(text: string) {
  const normalized = text.toLowerCase();
  return (
    normalized.includes("ready") ||
    normalized.includes("local:") ||
    normalized.includes("localhost:3000") ||
    normalized.includes("0.0.0.0:3000") ||
    normalized.includes("started server") ||
    normalized.includes("compiled successfully")
  );
}

function stripAnsi(value: string) {
  return value.replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, "");
}
