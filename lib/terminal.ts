import { spawn, type ChildProcessWithoutNullStreams } from "child_process";
import crypto from "crypto";
import os from "os";
import path from "path";

type TerminalSession = {
  id: string;
  process: ChildProcessWithoutNullStreams;
  buffer: string[];
  listeners: Set<(chunk: string) => void>;
  createdAt: number;
};

type TerminalGlobal = typeof globalThis & {
  __atomsTerminalSessions?: Map<string, TerminalSession>;
};

function sessions() {
  const globalStore = globalThis as TerminalGlobal;
  globalStore.__atomsTerminalSessions ??= new Map();
  return globalStore.__atomsTerminalSessions;
}

export function createTerminalSession() {
  const id = crypto.randomUUID();
  const shell = process.platform === "win32" ? "powershell.exe" : process.env.SHELL || "bash";
  const args = process.platform === "win32" ? ["-NoLogo", "-NoExit", "-Command", "-"] : ["-i"];
  const child = spawn(shell, args, {
    cwd: process.cwd(),
    env: createTerminalEnv(),
    windowsHide: true,
  });
  const session: TerminalSession = {
    id,
    process: child,
    buffer: [],
    listeners: new Set(),
    createdAt: Date.now(),
  };

  sessions().set(id, session);

  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => appendOutput(session, chunk));
  child.stderr.on("data", (chunk: string) => appendOutput(session, chunk));
  child.on("exit", (code) => {
    appendOutput(session, `\r\n[terminal exited with code ${code ?? "unknown"}]\r\n`);
    sessions().delete(id);
  });

  bootstrapShell(session);
  return session;
}

export function getTerminalSession(id: string) {
  return sessions().get(id) ?? null;
}

export function writeTerminalInput(id: string, input: string) {
  const session = getTerminalSession(id);

  if (!session) {
    return false;
  }

  session.process.stdin.write(input);
  return true;
}

export function closeTerminalSession(id: string) {
  const session = getTerminalSession(id);

  if (!session) {
    return false;
  }

  session.process.kill();
  sessions().delete(id);
  return true;
}

export function subscribeTerminal(id: string, listener: (chunk: string) => void) {
  const session = getTerminalSession(id);

  if (!session) {
    return null;
  }

  session.listeners.add(listener);
  return () => {
    session.listeners.delete(listener);
  };
}

export function readTerminalBacklog(id: string) {
  return getTerminalSession(id)?.buffer.join("") ?? "";
}

function appendOutput(session: TerminalSession, chunk: string) {
  session.buffer.push(chunk);

  if (session.buffer.length > 400) {
    session.buffer.splice(0, session.buffer.length - 400);
  }

  for (const listener of Array.from(session.listeners)) {
    listener(chunk);
  }
}

function bootstrapShell(session: TerminalSession) {
  if (process.platform !== "win32") {
    session.process.stdin.write("pwd\nwhich opencode || true\n");
    return;
  }

  const appDataNpm = path.join(os.homedir(), "AppData", "Roaming", "npm");
  const commands = [
    "$machinePath = [Environment]::GetEnvironmentVariable('Path','Machine')",
    "$userPath = [Environment]::GetEnvironmentVariable('Path','User')",
    `$extraPath = '${escapePowerShellSingleQuoted(appDataNpm)}'`,
    "$env:Path = @($machinePath, $userPath, $extraPath, $env:Path) -join ';'",
    "Write-Host '[atoms terminal] cwd:' (Get-Location)",
    "Write-Host '[atoms terminal] checking opencode:'",
    "where.exe opencode",
    "Write-Host '[atoms terminal] ready. Type opencode or any local command.'",
  ];

  session.process.stdin.write(`${commands.join("; ")}\r\n`);
}

function createTerminalEnv() {
  if (process.platform !== "win32") {
    return process.env;
  }

  const appDataNpm = path.join(os.homedir(), "AppData", "Roaming", "npm");
  return {
    ...process.env,
    PATH: [appDataNpm, process.env.PATH].filter(Boolean).join(path.delimiter),
  };
}

function escapePowerShellSingleQuoted(value: string) {
  return value.replace(/'/g, "''");
}
