import { execFile } from "child_process";

export type TrackedPreviewProcess = {
  child: {
    pid?: number;
    kill: () => void;
  };
  cwd: string;
  ready: boolean;
  logs: string[];
};

export const PREVIEW_PORT = 3000;

export function getPreviewProcessStore() {
  const globalStore = globalThis as typeof globalThis & {
    __atomsPreviewProcesses?: Map<string, TrackedPreviewProcess>;
  };

  if (!globalStore.__atomsPreviewProcesses) {
    globalStore.__atomsPreviewProcesses = new Map();
  }

  return globalStore.__atomsPreviewProcesses;
}

export async function stopUserProjectPreviewProcesses(userId: string, projectId: string) {
  const previewProcesses = getPreviewProcessStore();
  const processPrefix = `${userId}:${projectId}:`;

  for (const [key, previewProcess] of Array.from(previewProcesses.entries())) {
    if (!key.startsWith(processPrefix)) {
      continue;
    }

    previewProcess.child.kill();
    previewProcesses.delete(key);
  }

  await new Promise((resolve) => setTimeout(resolve, 500));
}

export async function freePreviewPort(log?: (message: string) => void) {
  try {
    const pids = (await findPreviewPortProcessIds()).filter((pid) => pid > 0 && pid !== process.pid);

    if (!pids.length) {
      return;
    }

    log?.(`[preview] freeing port ${PREVIEW_PORT}: ${pids.join(", ")}`);
    removeTrackedProcessesByPid(pids);

    for (const pid of pids) {
      try {
        process.kill(pid);
      } catch {
        // The process may have already exited after the port scan.
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 700));
  } catch (error) {
    log?.(`[preview] could not inspect port ${PREVIEW_PORT}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function removeTrackedProcessesByPid(pids: number[]) {
  const previewProcesses = getPreviewProcessStore();
  const pidSet = new Set(pids);

  for (const [key, previewProcess] of Array.from(previewProcesses.entries())) {
    if (previewProcess.child.pid && pidSet.has(previewProcess.child.pid)) {
      previewProcesses.delete(key);
    }
  }
}

async function findPreviewPortProcessIds() {
  if (process.platform === "win32") {
    const output = await execFileText("powershell.exe", [
      "-NoProfile",
      "-Command",
      `$ErrorActionPreference='SilentlyContinue'; Get-NetTCPConnection -LocalPort ${PREVIEW_PORT} -State Listen | Select-Object -ExpandProperty OwningProcess -Unique`,
    ]);
    return parseProcessIds(output);
  }

  const output = await execFileText("sh", [
    "-lc",
    `if command -v lsof >/dev/null 2>&1; then lsof -ti TCP:${PREVIEW_PORT} -sTCP:LISTEN || true; elif command -v fuser >/dev/null 2>&1; then fuser ${PREVIEW_PORT}/tcp 2>/dev/null || true; fi`,
  ]);
  return parseProcessIds(output);
}

function execFileText(file: string, args: string[]) {
  return new Promise<string>((resolve, reject) => {
    execFile(file, args, { windowsHide: true }, (error, stdout, stderr) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(`${stdout}${stderr}`);
    });
  });
}

function parseProcessIds(value: string) {
  return Array.from(new Set(value.split(/\D+/).map((part) => Number(part)).filter(Number.isFinite)));
}
