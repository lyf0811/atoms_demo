import { execFile } from "child_process";

export type TrackedTerminalSession = {
  userId: string;
  projectId: string;
  pid?: number;
  kill: () => unknown;
  close?: () => unknown;
};

export function getTerminalSessionStore() {
  const globalStore = globalThis as typeof globalThis & {
    __atomsTerminalSessions?: Map<string, TrackedTerminalSession>;
  };

  if (!globalStore.__atomsTerminalSessions) {
    globalStore.__atomsTerminalSessions = new Map();
  }

  return globalStore.__atomsTerminalSessions;
}

export async function stopUserProjectTerminalSessions(userId: string, projectId: string) {
  const sessions = getTerminalSessionStore();

  for (const [sessionId, session] of Array.from(sessions.entries())) {
    if (session.userId !== userId || session.projectId !== projectId) {
      continue;
    }

    safeCall(session.close);
    await killProcessTree(session.pid);
    safeCall(session.kill);
    sessions.delete(sessionId);
  }

  await new Promise((resolve) => setTimeout(resolve, 1000));
}

function safeCall(fn?: () => unknown) {
  try {
    fn?.();
  } catch {
    // The websocket or PTY may already be closed.
  }
}

async function killProcessTree(pid?: number) {
  if (!pid || pid <= 0 || pid === process.pid) {
    return;
  }

  if (process.platform !== "win32") {
    safeCall(() => process.kill(-pid));
    safeCall(() => process.kill(pid));
    return;
  }

  await new Promise<void>((resolve) => {
    execFile("taskkill.exe", ["/PID", String(pid), "/T", "/F"], { windowsHide: true }, () => resolve());
  });
}
