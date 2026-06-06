import { readFileSync, writeFileSync } from "fs";
import path from "path";

const pluginPath = path.join(process.cwd(), ".opencode", "plugin", "agent-monitor.js");
let source = readFileSync(pluginPath, "utf8");
let changed = false;

if (!source.includes('writeFileSync } from "node:fs"')) {
  const target = `import { appendFileSync } from "node:fs";`;
  const replacement = `import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";`;

  if (!source.includes(target)) {
    throw new Error("Could not find expected fs import in OpenCode agent monitor plugin.");
  }

  source = source.replace(target, replacement);
  changed = true;
}

if (source.includes("var VSCODE_PORT = 3043;")) {
  source = source.replace("var VSCODE_PORT = 3043;", "var VSCODE_PORT = process.env.OPENCODE_HOOK_PORT || 3100;");
  changed = true;
}

if (!source.includes("function assertWorkspaceOnlyToolUse(")) {
  const target = `  EXIT_PLAN_MODE: "ExitPlanMode"
};`;
  const replacement = `${target}
function normalizeGuardPath(value) {
  return String(value || "").replace(/\\\\/g, "/");
}
function isLikelyPathKey(key) {
  return /(^|_)(path|file|dir|directory|cwd|pattern|glob)$/i.test(String(key || ""));
}
function isAbsoluteGuardPath(value) {
  return /^[a-zA-Z]:\\//.test(value) || value.startsWith("/");
}
function joinGuardPath(root, value) {
  const normalizedRoot = normalizeGuardPath(root).replace(/\\/+$/, "");
  const normalizedValue = normalizeGuardPath(value);
  if (isAbsoluteGuardPath(normalizedValue)) {
    return normalizedValue;
  }
  const parts = \`\${normalizedRoot}/\${normalizedValue}\`.split("/");
  const result = [];
  for (const part of parts) {
    if (!part || part === ".") continue;
    if (part === "..") result.pop();
    else result.push(part);
  }
  const prefix = /^[a-zA-Z]:$/.test(result[0]) ? "" : "/";
  return \`\${prefix}\${result.join("/")}\`;
}
function isInsideGuardRoot(root, value) {
  const normalizedRoot = normalizeGuardPath(root).replace(/\\/+$/, "").toLowerCase();
  const normalizedValue = normalizeGuardPath(value).toLowerCase();
  return normalizedValue === normalizedRoot || normalizedValue.startsWith(\`\${normalizedRoot}/\`);
}
function collectWorkspacePathViolations(value, root, key = "") {
  const violations = [];
  if (!root || value == null) return violations;
  if (typeof value === "string") {
    if (isLikelyPathKey(key) || value.includes("/") || value.includes("\\\\") || value.includes("..")) {
      const resolved = joinGuardPath(root, value);
      if (!isInsideGuardRoot(root, resolved)) {
        violations.push(\`\${key || "path"}=\${value}\`);
      }
    }
    return violations;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => violations.push(...collectWorkspacePathViolations(item, root, \`\${key}[\${index}]\`)));
    return violations;
  }
  if (typeof value === "object") {
    for (const [childKey, childValue] of Object.entries(value)) {
      violations.push(...collectWorkspacePathViolations(childValue, root, childKey));
    }
  }
  return violations;
}
function assertWorkspaceOnlyToolUse(tool, args) {
  const root = process.env.ATOMS_WORKSPACE_DIR;
  if (!root) return;
  if (tool === CLAUDE_TOOLS.BASH || tool === "bash") {
    throw new Error("Shell commands are disabled in this workspace sandbox.");
  }
  const violations = collectWorkspacePathViolations(args, root);
  if (violations.length) {
    throw new Error(\`Blocked access outside workspace: \${violations.slice(0, 3).join(", ")}\`);
  }
}`;

  if (!source.includes(target)) {
    throw new Error("Could not find expected tool constants block in OpenCode agent monitor plugin.");
  }

  source = source.replace(target, replacement);
  changed = true;
}

if (!source.includes("assertWorkspaceOnlyToolUse(tool, args);")) {
  const target = `      const { tool, sessionID } = input;
      const { args } = output;
      try {`;
  const replacement = `      const { tool, sessionID } = input;
      const { args } = output;
      assertWorkspaceOnlyToolUse(tool, args);
      try {`;

  if (!source.includes(target)) {
    throw new Error("Could not find expected tool.execute.before block in OpenCode agent monitor plugin.");
  }

  source = source.replace(target, replacement);
  changed = true;
}

if (!source.includes("function writeAgentEventFile(")) {
  const target = `var ENDPOINT = \`http://\${VSCODE_HOST}:\${VSCODE_PORT}/opencode-hook\`;`;
  const replacement = `var ENDPOINT = \`http://\${VSCODE_HOST}:\${VSCODE_PORT}/opencode-hook\`;
var EVENT_FILE_COUNTER = 0;
function sanitizeEventFilePart(value) {
  return String(value || "unknown").replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80);
}
function writeAgentEventFile(directory, event, meta) {
  try {
    const eventDirectory = process.env.OPENCODE_EVENT_DIR || \`\${directory}/data/opencode-agent-events/raw\`;
    mkdirSync(eventDirectory, { recursive: true });
    const hookName = sanitizeEventFilePart(event?.hook_event_name || event?.event_type || event?.type || "event");
    const sessionId = sanitizeEventFilePart(event?.session_id || event?.sessionID || "session");
    const filename = \`\${Date.now()}-\${EVENT_FILE_COUNTER++}-\${sessionId}-\${hookName}.json\`;
    const separator = eventDirectory.endsWith("/") || eventDirectory.endsWith("\\\\") ? "" : "/";
    writeFileSync(\`\${eventDirectory}\${separator}\${filename}\`, JSON.stringify({ ...event, _opencode_meta: meta }, null, 2), "utf8");
  } catch (error) {
    logger.warn("[Agent Monitor] Failed to write event file:", error);
  }
}
function shouldWriteRawOpenCodeEvent(event) {
  const eventType = event?.type || "";
  const partType = event?.properties?.part?.type || "";
  if (eventType === "message.part.delta") {
    return false;
  }
  if (eventType === "message.part.updated" && partType !== "text") {
    return false;
  }
  if (eventType === "session.next.agent.switched" || eventType === "session.next.model.switched") {
    return false;
  }
  return true;
}`;

  if (!source.includes(target)) {
    throw new Error("Could not find expected endpoint block in OpenCode agent monitor plugin.");
  }

  source = source.replace(target, replacement);
  changed = true;
}

if (!source.includes("function shouldWriteRawOpenCodeEvent(")) {
  const target = `function writeAgentEventFile(directory, event, meta) {
  try {
    const eventDirectory = process.env.OPENCODE_EVENT_DIR || \`\${directory}/data/opencode-agent-events/raw\`;
    mkdirSync(eventDirectory, { recursive: true });
    const hookName = sanitizeEventFilePart(event?.hook_event_name || event?.event_type || event?.type || "event");
    const sessionId = sanitizeEventFilePart(event?.session_id || event?.sessionID || "session");
    const filename = \`\${Date.now()}-\${EVENT_FILE_COUNTER++}-\${sessionId}-\${hookName}.json\`;
    const separator = eventDirectory.endsWith("/") || eventDirectory.endsWith("\\\\") ? "" : "/";
    writeFileSync(\`\${eventDirectory}\${separator}\${filename}\`, JSON.stringify({ ...event, _opencode_meta: meta }, null, 2), "utf8");
  } catch (error) {
    logger.warn("[Agent Monitor] Failed to write event file:", error);
  }
}`;
  const replacement = `${target}
function shouldWriteRawOpenCodeEvent(event) {
  const eventType = event?.type || "";
  const partType = event?.properties?.part?.type || "";
  if (eventType === "message.part.delta") {
    return false;
  }
  if (eventType === "message.part.updated" && partType !== "text") {
    return false;
  }
  if (eventType === "session.next.agent.switched" || eventType === "session.next.model.switched") {
    return false;
  }
  return true;
}`;

  if (!source.includes(target)) {
    throw new Error("Could not find expected event file writer in OpenCode agent monitor plugin.");
  }

  source = source.replace(target, replacement);
  changed = true;
}

if (!source.includes("writeAgentEventFile(directory, event, eventMeta);")) {
  const target = `    });
    try {
      const response = await fetch(ENDPOINT, {`;
  const replacement = `    });
    const eventMeta = {
      project: typeof project === "object" && project !== null && "name" in project ? String(project.name) : "unknown",
      directory,
      worktree,
      user_id: process.env.ATOMS_USER_ID || "anonymous",
      project_id: process.env.ATOMS_PROJECT_ID || "default",
      timestamp: Date.now()
    };
    writeAgentEventFile(directory, event, eventMeta);
    try {
      const response = await fetch(ENDPOINT, {`;

  if (!source.includes(target)) {
    throw new Error("Could not find expected send event block in OpenCode agent monitor plugin.");
  }

  source = source.replace(target, replacement);
  source = source.replace(`          _opencode_meta: {
            project: typeof project === "object" && project !== null && "name" in project ? String(project.name) : "unknown",
            directory,
            worktree,
            timestamp: Date.now()
          }`, "          _opencode_meta: eventMeta");
  changed = true;
}

if (!source.includes("user_id: process.env.ATOMS_USER_ID || \"anonymous\"")) {
  const target = `      worktree,
      timestamp: Date.now()`;
  const replacement = `      worktree,
      user_id: process.env.ATOMS_USER_ID || "anonymous",
      timestamp: Date.now()`;

  if (source.includes(target)) {
    source = source.replace(target, replacement);
    changed = true;
  }
}

if (!source.includes("project_id: process.env.ATOMS_PROJECT_ID || \"default\"")) {
  const target = `      user_id: process.env.ATOMS_USER_ID || "anonymous",
      timestamp: Date.now()`;
  const replacement = `      user_id: process.env.ATOMS_USER_ID || "anonymous",
      project_id: process.env.ATOMS_PROJECT_ID || "default",
      timestamp: Date.now()`;

  if (source.includes(target)) {
    source = source.replace(target, replacement);
    changed = true;
  }
}

if (!source.includes('hook_event_name: "AssistantMessage"')) {
  const target = `      const isUserMessage = message?.role === "user";
      if (!isUserMessage)
        return;
      const promptText = Array.isArray(parts) ? parts.map((p) => p.text || "").join(\`
\`) : String(message);`;

  const replacement = `      const isUserMessage = message?.role === "user";
      const isAssistantMessage = message?.role === "assistant";
      const messageText = Array.isArray(parts) ? parts.map((p) => p.text || p.content || "").join(\`
\`) : typeof message?.content === "string" ? message.content : String(message || "");
      if (isAssistantMessage) {
        const session = sessionManager.getSession(sessionId) || sessionManager.initSession(sessionId, "assistant");
        if (messageText.trim()) {
          await sendClaudeEvent({
            hook_event_name: "AssistantMessage",
            session_id: sessionId,
            transcript_path: session.transcriptPath,
            cwd: session.cwd,
            content: messageText
          });
        }
        return;
      }
      if (!isUserMessage)
        return;
      const promptText = messageText;`;

  if (!source.includes(target)) {
    throw new Error("Could not find expected chat.message block in OpenCode agent monitor plugin.");
  }

  source = source.replace(target, replacement);
  changed = true;
}

if (!source.includes('hook_event_name: "OpenCodeRawEvent"')) {
  const target = `    event: async ({ event }) => {
      try {`;

  const replacement = `    event: async ({ event }) => {
      try {
        const rawSessionId = event?.properties?.sessionID || event?.properties?.info?.id || event?.properties?.message?.sessionID || "unknown";
        if (shouldWriteRawOpenCodeEvent(event)) {
          await sendClaudeEvent({
            hook_event_name: "OpenCodeRawEvent",
            session_id: rawSessionId,
            event_type: event?.type || "unknown",
            event
          });
        }`;

  if (!source.includes(target)) {
    throw new Error("Could not find expected event handler block in OpenCode agent monitor plugin.");
  }

  source = source.replace(target, replacement);
  changed = true;
}

if (source.includes(`        await sendClaudeEvent({
          hook_event_name: "OpenCodeRawEvent",
          session_id: rawSessionId,
          event_type: event?.type || "unknown",
          event
        });`)) {
  source = source.replace(`        await sendClaudeEvent({
          hook_event_name: "OpenCodeRawEvent",
          session_id: rawSessionId,
          event_type: event?.type || "unknown",
          event
        });`, `        if (shouldWriteRawOpenCodeEvent(event)) {
          await sendClaudeEvent({
            hook_event_name: "OpenCodeRawEvent",
            session_id: rawSessionId,
            event_type: event?.type || "unknown",
            event
          });
        }`);
  changed = true;
}

if (changed) {
  writeFileSync(pluginPath, source, "utf8");
  console.log("Patched OpenCode agent monitor to forward assistant messages and raw events.");
} else {
  console.log("OpenCode agent monitor already has assistant/raw event forwarding.");
}
