import { spawn } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";

export type OpenCodeChunk =
  | { type: "status"; content: string }
  | { type: "text"; content: string }
  | { type: "error"; content: string }
  | { type: "done"; content: string };

type RunOpenCodeOptions = {
  message: string;
  cwd: string;
  binary?: string;
  model?: string;
  agent?: string;
  session?: string;
  userId?: string;
  onChunk: (chunk: OpenCodeChunk) => void;
};

export function runOpenCodeAgent(options: RunOpenCodeOptions) {
  const binary = options.binary?.trim() || process.env.OPENCODE_BIN || "opencode";
  const args = ["run", "--format", "json", "--dir", options.cwd];

  if (options.model) {
    args.push("--model", options.model);
  }

  if (options.agent) {
    args.push("--agent", options.agent);
  }

  if (options.session) {
    args.push("--session", options.session);
  }

  args.push(options.message);

  if (looksLikePath(binary) && !fs.existsSync(binary)) {
    options.onChunk({
      type: "error",
      content: `OpenCode path does not exist: ${binary}`,
    });
    options.onChunk({ type: "done", content: "OpenCode process could not start." });
    return createNoopProcess();
  }

  options.onChunk({ type: "status", content: `Starting ${binary} ${args.slice(0, -1).join(" ")}` });

  const command = createSpawnCommand(binary, args);
  const child = spawn(command.file, command.args, {
    cwd: options.cwd,
    shell: false,
    windowsHide: true,
    env: createOpenCodeEnv(options.userId),
  });

  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");

  let stdoutBuffer = "";
  let stderrBuffer = "";

  child.stdout.on("data", (data: string) => {
    stdoutBuffer += data;
    const lines = stdoutBuffer.split(/\r?\n/);
    stdoutBuffer = lines.pop() ?? "";

    for (const line of lines) {
      emitOpenCodeLine(line, options.onChunk);
    }
  });

  child.stderr.on("data", (data: string) => {
    stderrBuffer += data;
    const lines = stderrBuffer.split(/\r?\n/);
    stderrBuffer = lines.pop() ?? "";

    for (const line of lines) {
      if (line.trim()) {
        options.onChunk({ type: "error", content: line.trim() });
      }
    }
  });

  child.on("error", (error) => {
    const isMissingBinary = error.message.toLowerCase().includes("not found") || error.message.toLowerCase().includes("enoent");
    options.onChunk({
      type: "error",
      content: isMissingBinary
        ? missingBinaryMessage(binary)
        : error.message,
    });
    options.onChunk({ type: "done", content: "OpenCode process could not start." });
  });

  child.on("close", (code) => {
    if (stdoutBuffer.trim()) {
      emitOpenCodeLine(stdoutBuffer, options.onChunk);
    }

    if (stderrBuffer.trim()) {
      options.onChunk({ type: "error", content: stderrBuffer.trim() });
    }

    if (code === 0) {
      options.onChunk({ type: "done", content: "OpenCode run complete." });
      return;
    }

    options.onChunk({ type: "error", content: `OpenCode exited with code ${code}.` });
    options.onChunk({ type: "done", content: "OpenCode run finished with an error." });
  });

  return child;
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

function looksLikePath(value: string) {
  return value.includes("\\") || value.includes("/") || /^[a-zA-Z]:/.test(value);
}

function createNoopProcess() {
  return {
    kill() {
      return true;
    },
  };
}

function createSpawnCommand(binary: string, args: string[]) {
  if (process.platform !== "win32") {
    return { file: binary, args };
  }

  const extension = path.extname(binary).toLowerCase();
  const needsCmd = extension === ".cmd" || extension === ".bat" || extension === "" || !extension;

  if (!needsCmd) {
    return { file: binary, args };
  }

  return {
    file: "cmd.exe",
    args: ["/d", "/s", "/c", [binary, ...args].map(quoteForCmd).join(" ")],
  };
}

function quoteForCmd(value: string) {
  if (!value) {
    return "\"\"";
  }

  const escaped = value.replace(/(["^&|<>])/g, "^$1");
  return /[\s"^&|<>]/.test(value) ? `"${escaped}"` : escaped;
}

function missingBinaryMessage(binary: string) {
  const pathValue = process.env.PATH || "";
  const pathPreview = pathValue.split(path.delimiter).slice(0, 8).join(path.delimiter);

  return [
    `OpenCode binary was not found by the server process: ${binary}.`,
    "If you installed it after starting Next.js, restart `npm run dev` so PATH is refreshed.",
    "If it is installed outside PATH, set OPENCODE_BIN to the full opencode.exe or opencode.cmd path.",
    `Server PATH begins with: ${pathPreview}`,
  ].join("\n");
}

function emitOpenCodeLine(line: string, onChunk: (chunk: OpenCodeChunk) => void) {
  const trimmed = line.trim();

  if (!trimmed) {
    return;
  }

  try {
    const event = JSON.parse(trimmed) as Record<string, unknown>;
    const content = extractText(event);
    const eventType = String(event.type || event.event || event.kind || "event");

    if (content) {
      onChunk({ type: "text", content });
      return;
    }

    onChunk({ type: "status", content: eventType });
  } catch {
    onChunk({ type: "text", content: trimmed });
  }
}

function extractText(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  if (!value || typeof value !== "object") {
    return "";
  }

  const record = value as Record<string, unknown>;
  const directKeys = ["text", "content", "message", "delta", "summary"];

  for (const key of directKeys) {
    const direct = record[key];

    if (typeof direct === "string" && direct.trim()) {
      return direct.trim();
    }
  }

  for (const nestedKey of ["data", "part", "response", "assistant"]) {
    const nested = extractText(record[nestedKey]);

    if (nested) {
      return nested;
    }
  }

  return "";
}
