// src/constants/tools.ts
var TOOL_CATEGORIES = {
  SUBAGENT: "Subagent",
  FILE_OPS: "File Operations",
  SEARCH: "Search Operations",
  WEB: "Web Operations",
  NOTEBOOK: "Notebook Operations",
  SHELL: "Shell Operations",
  TODO: "Task Management",
  PLANNING: "Planning"
};
var CLAUDE_TOOLS = {
  TASK: "Task",
  READ: "Read",
  WRITE: "Write",
  EDIT: "Edit",
  MULTI_EDIT: "MultiEdit",
  GLOB: "Glob",
  GREP: "Grep",
  LS: "LS",
  BASH: "Bash",
  BASH_OUTPUT: "BashOutput",
  KILL_SHELL: "KillShell",
  WEB_FETCH: "WebFetch",
  WEB_SEARCH: "WebSearch",
  NOTEBOOK_READ: "NotebookRead",
  NOTEBOOK_EDIT: "NotebookEdit",
  TODO_WRITE: "TodoWrite",
  EXIT_PLAN_MODE: "ExitPlanMode"
};
function normalizeGuardPath(value) {
  return String(value || "").replace(/\\/g, "/");
}
function isLikelyPathKey(key) {
  return /(^|_)(path|file|dir|directory|cwd|pattern|glob)$/i.test(String(key || ""));
}
function isAbsoluteGuardPath(value) {
  return /^[a-zA-Z]:\//.test(value) || value.startsWith("/");
}
function joinGuardPath(root, value) {
  const normalizedRoot = normalizeGuardPath(root).replace(/\/+$/, "");
  const normalizedValue = normalizeGuardPath(value);
  if (isAbsoluteGuardPath(normalizedValue)) {
    return normalizedValue;
  }
  const parts = `${normalizedRoot}/${normalizedValue}`.split("/");
  const result = [];
  for (const part of parts) {
    if (!part || part === ".") continue;
    if (part === "..") result.pop();
    else result.push(part);
  }
  const prefix = /^[a-zA-Z]:$/.test(result[0]) ? "" : "/";
  return `${prefix}${result.join("/")}`;
}
function isInsideGuardRoot(root, value) {
  const normalizedRoot = normalizeGuardPath(root).replace(/\/+$/, "").toLowerCase();
  const normalizedValue = normalizeGuardPath(value).toLowerCase();
  return normalizedValue === normalizedRoot || normalizedValue.startsWith(`${normalizedRoot}/`);
}
function collectWorkspacePathViolations(value, root, key = "") {
  const violations = [];
  if (!root || value == null) return violations;
  if (typeof value === "string") {
    if (isLikelyPathKey(key) || value.includes("/") || value.includes("\\") || value.includes("..")) {
      const resolved = joinGuardPath(root, value);
      if (!isInsideGuardRoot(root, resolved)) {
        violations.push(`${key || "path"}=${value}`);
      }
    }
    return violations;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => violations.push(...collectWorkspacePathViolations(item, root, `${key}[${index}]`)));
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
    throw new Error(`Blocked access outside workspace: ${violations.slice(0, 3).join(", ")}`);
  }
}
var TOOL_REGISTRY = {
  [CLAUDE_TOOLS.TASK]: {
    name: CLAUDE_TOOLS.TASK,
    category: TOOL_CATEGORIES.SUBAGENT,
    description: "Launch a new agent to handle complex tasks"
  },
  [CLAUDE_TOOLS.READ]: {
    name: CLAUDE_TOOLS.READ,
    category: TOOL_CATEGORIES.FILE_OPS,
    description: "Read file contents",
    sensitive: true
  },
  [CLAUDE_TOOLS.WRITE]: {
    name: CLAUDE_TOOLS.WRITE,
    category: TOOL_CATEGORIES.FILE_OPS,
    description: "Write content to a file",
    sensitive: true
  },
  [CLAUDE_TOOLS.EDIT]: {
    name: CLAUDE_TOOLS.EDIT,
    category: TOOL_CATEGORIES.FILE_OPS,
    description: "Edit file content",
    sensitive: true
  },
  [CLAUDE_TOOLS.MULTI_EDIT]: {
    name: CLAUDE_TOOLS.MULTI_EDIT,
    category: TOOL_CATEGORIES.FILE_OPS,
    description: "Make multiple edits to a file",
    sensitive: true
  },
  [CLAUDE_TOOLS.GLOB]: {
    name: CLAUDE_TOOLS.GLOB,
    category: TOOL_CATEGORIES.SEARCH,
    description: "Find files by pattern"
  },
  [CLAUDE_TOOLS.GREP]: {
    name: CLAUDE_TOOLS.GREP,
    category: TOOL_CATEGORIES.SEARCH,
    description: "Search file contents"
  },
  [CLAUDE_TOOLS.LS]: {
    name: CLAUDE_TOOLS.LS,
    category: TOOL_CATEGORIES.SEARCH,
    description: "List directory contents"
  },
  [CLAUDE_TOOLS.BASH]: {
    name: CLAUDE_TOOLS.BASH,
    category: TOOL_CATEGORIES.SHELL,
    description: "Execute bash commands",
    sensitive: true
  },
  [CLAUDE_TOOLS.BASH_OUTPUT]: {
    name: CLAUDE_TOOLS.BASH_OUTPUT,
    category: TOOL_CATEGORIES.SHELL,
    description: "Read output from background shell"
  },
  [CLAUDE_TOOLS.KILL_SHELL]: {
    name: CLAUDE_TOOLS.KILL_SHELL,
    category: TOOL_CATEGORIES.SHELL,
    description: "Kill a background shell"
  },
  [CLAUDE_TOOLS.WEB_FETCH]: {
    name: CLAUDE_TOOLS.WEB_FETCH,
    category: TOOL_CATEGORIES.WEB,
    description: "Fetch and process web content"
  },
  [CLAUDE_TOOLS.WEB_SEARCH]: {
    name: CLAUDE_TOOLS.WEB_SEARCH,
    category: TOOL_CATEGORIES.WEB,
    description: "Search the web"
  },
  [CLAUDE_TOOLS.NOTEBOOK_READ]: {
    name: CLAUDE_TOOLS.NOTEBOOK_READ,
    category: TOOL_CATEGORIES.NOTEBOOK,
    description: "Read Jupyter notebook",
    sensitive: true
  },
  [CLAUDE_TOOLS.NOTEBOOK_EDIT]: {
    name: CLAUDE_TOOLS.NOTEBOOK_EDIT,
    category: TOOL_CATEGORIES.NOTEBOOK,
    description: "Edit Jupyter notebook",
    sensitive: true
  },
  [CLAUDE_TOOLS.TODO_WRITE]: {
    name: CLAUDE_TOOLS.TODO_WRITE,
    category: TOOL_CATEGORIES.TODO,
    description: "Manage task list"
  },
  [CLAUDE_TOOLS.EXIT_PLAN_MODE]: {
    name: CLAUDE_TOOLS.EXIT_PLAN_MODE,
    category: TOOL_CATEGORIES.PLANNING,
    description: "Exit planning mode"
  }
};
function isClaudeTool(toolName) {
  return Object.values(CLAUDE_TOOLS).includes(toolName);
}
function getToolMetadata(toolName) {
  if (!isClaudeTool(toolName)) {
    return;
  }
  return TOOL_REGISTRY[toolName];
}

// src/services/session-manager.ts
class SessionManager {
  cwd;
  transcriptBasePath;
  sessions = new Map;
  idleTimeout = 60000;
  idleTimers = new Map;
  constructor(cwd, transcriptBasePath) {
    this.cwd = cwd;
    this.transcriptBasePath = transcriptBasePath;
  }
  initSession(sessionId, source) {
    const existing = this.sessions.get(sessionId);
    if (existing && source === "resume") {
      existing.source = "resume";
      existing.lastActivity = Date.now();
      this.resetIdleTimer(sessionId);
      return existing;
    }
    const actualSource = source || (existing ? "resume" : "startup");
    const session = {
      sessionId,
      startTime: Date.now(),
      lastActivity: Date.now(),
      transcriptPath: `${this.transcriptBasePath}/${sessionId}.json`,
      cwd: this.cwd,
      source: actualSource,
      isFirstMessage: true,
      toolCallCount: 0,
      activeTools: new Set,
      completedTools: new Set,
      isResponding: false,
      hasSubagent: false,
      messageCount: 0,
      stopHookActive: false,
      subagentStopHookActive: false
    };
    this.sessions.set(sessionId, session);
    this.resetIdleTimer(sessionId);
    return session;
  }
  getSession(sessionId) {
    return this.sessions.get(sessionId);
  }
  updateActivity(sessionId) {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.lastActivity = Date.now();
      this.resetIdleTimer(sessionId);
    }
  }
  setResponding(sessionId, responding) {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.isResponding = responding;
      if (!responding) {
        this.checkForStopEvent(sessionId);
      }
    }
  }
  startTool(sessionId, toolName, args) {
    const session = this.sessions.get(sessionId);
    if (!session)
      return;
    session.lastActivity = Date.now();
    session.toolCallCount++;
    session.activeTools.add(toolName);
    session.lastToolName = toolName;
    session.lastToolArgs = args;
    session.isFirstMessage = false;
    if (toolName === "Task") {
      session.hasSubagent = true;
      session.subagentCallId = `${sessionId}-task-${Date.now()}`;
    }
    this.resetIdleTimer(sessionId);
  }
  completeTool(sessionId, toolName) {
    const session = this.sessions.get(sessionId);
    if (!session)
      return;
    session.activeTools.delete(toolName);
    session.completedTools.add(toolName);
    if (toolName === "Task" && session.hasSubagent) {
      this.handleSubagentStop(sessionId);
    }
    if (session.activeTools.size === 0 && !session.isResponding) {
      this.checkForStopEvent(sessionId);
    }
  }
  handleUserMessage(sessionId) {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.messageCount++;
      session.isResponding = true;
      session.lastActivity = Date.now();
      this.resetIdleTimer(sessionId);
    }
  }
  checkForStopEvent(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session)
      return;
    if (!session.isResponding && session.activeTools.size === 0 && session.messageCount > 0 && !session.stopHookActive) {
      session.stopHookActive = true;
    }
  }
  handleSubagentStop(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session)
      return;
    if (session.hasSubagent && !session.subagentStopHookActive) {
      session.subagentStopHookActive = true;
      session.hasSubagent = false;
    }
  }
  endSession(sessionId, reason, error) {
    const session = this.sessions.get(sessionId);
    if (!session)
      return;
    session.endReason = reason;
    session.errorDetails = error;
    const timer = this.idleTimers.get(sessionId);
    if (timer) {
      clearTimeout(timer);
      this.idleTimers.delete(sessionId);
    }
    setTimeout(() => {
      this.sessions.delete(sessionId);
    }, 5000);
  }
  resetIdleTimer(sessionId) {
    const existingTimer = this.idleTimers.get(sessionId);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }
    const timer = setTimeout(() => {
      this.handleIdleTimeout(sessionId);
    }, this.idleTimeout);
    this.idleTimers.set(sessionId, timer);
  }
  handleIdleTimeout(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session)
      return;
    this.endSession(sessionId, "idle");
  }
  buildSessionStartEvent(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }
    return {
      hook_event_name: "SessionStart",
      session_id: sessionId,
      transcript_path: session.transcriptPath,
      cwd: session.cwd,
      source: session.source
    };
  }
  buildSessionEndEvent(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }
    return {
      hook_event_name: "SessionEnd",
      session_id: sessionId,
      transcript_path: session.transcriptPath,
      cwd: session.cwd,
      reason: session.endReason || "unknown"
    };
  }
  buildStopEvent(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }
    return {
      hook_event_name: "Stop",
      session_id: sessionId,
      transcript_path: session.transcriptPath,
      cwd: session.cwd,
      stop_hook_active: session.stopHookActive
    };
  }
  buildSubagentStopEvent(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }
    return {
      hook_event_name: "SubagentStop",
      session_id: sessionId,
      transcript_path: session.transcriptPath,
      cwd: session.cwd,
      stop_hook_active: session.subagentStopHookActive
    };
  }
  getActiveSessions() {
    return Array.from(this.sessions.values());
  }
  dispose() {
    for (const timer of this.idleTimers.values()) {
      clearTimeout(timer);
    }
    this.idleTimers.clear();
    this.sessions.clear();
  }
}

// src/services/user-interaction-handler.ts
class UserInteractionHandler {
  cwd;
  _transcriptBasePath;
  prompts = new Map;
  notifications = new Map;
  promptHistory = new Map;
  notificationQueue = [];
  maxHistorySize = 100;
  constructor(cwd, _transcriptBasePath) {
    this.cwd = cwd;
    this._transcriptBasePath = _transcriptBasePath;
  }
  processUserPrompt(sessionId, prompt, control) {
    const promptId = `${sessionId}-prompt-${Date.now()}`;
    const metadata = {
      promptId,
      sessionId,
      timestamp: Date.now(),
      originalPrompt: prompt,
      modifiedPrompt: control?.modifiedPrompt,
      wasBlocked: control?.block || false,
      blockReason: control?.reason,
      contextInjected: control?.contextToInject,
      characterCount: prompt.length,
      wordCount: prompt.split(/\s+/).filter((w) => w.length > 0).length,
      hasCodeBlocks: /```[\s\S]*?```/.test(prompt),
      hasUrls: /https?:\/\/[^\s]+/.test(prompt),
      sentiment: this.analyzeSentiment(prompt)
    };
    this.prompts.set(promptId, metadata);
    const history = this.promptHistory.get(sessionId) || [];
    history.push(promptId);
    if (history.length > this.maxHistorySize) {
      const removed = history.shift();
      if (removed) {
        this.prompts.delete(removed);
      }
    }
    this.promptHistory.set(sessionId, history);
    return metadata;
  }
  createNotification(sessionId, type, message, severity = "info") {
    const notificationId = `${sessionId}-notif-${Date.now()}`;
    const notification = {
      notificationId,
      sessionId,
      timestamp: Date.now(),
      type,
      message,
      severity,
      requiresAction: severity === "error" || severity === "critical",
      dismissed: false
    };
    this.notifications.set(notificationId, notification);
    this.notificationQueue.push(notification);
    if (severity === "info") {
      setTimeout(() => {
        notification.dismissed = true;
      }, 5000);
    }
    return notification;
  }
  getPendingNotifications(sessionId) {
    return this.notificationQueue.filter((n) => n.sessionId === sessionId && !n.dismissed && n.requiresAction);
  }
  dismissNotification(notificationId, actionTaken) {
    const notification = this.notifications.get(notificationId);
    if (notification) {
      notification.dismissed = true;
      notification.actionTaken = actionTaken;
      const index = this.notificationQueue.findIndex((n) => n.notificationId === notificationId);
      if (index !== -1) {
        this.notificationQueue.splice(index, 1);
      }
    }
  }
  analyzeSentiment(prompt) {
    const lower = prompt.toLowerCase();
    if (lower.startsWith("create ") || lower.startsWith("make ") || lower.startsWith("build ") || lower.startsWith("implement ") || lower.startsWith("fix ") || lower.startsWith("update ") || lower.startsWith("delete ") || lower.startsWith("run ")) {
      return "command";
    }
    if (lower.includes("doesn't work") || lower.includes("error") || lower.includes("bug") || lower.includes("wrong") || lower.includes("failed") || lower.includes("can't")) {
      return "negative";
    }
    if (lower.includes("great") || lower.includes("good") || lower.includes("thanks") || lower.includes("perfect") || lower.includes("excellent")) {
      return "positive";
    }
    return "neutral";
  }
  buildUserPromptSubmitEvent(sessionId, prompt, transcriptPath) {
    return {
      hook_event_name: "UserPromptSubmit",
      session_id: sessionId,
      transcript_path: transcriptPath,
      cwd: this.cwd,
      prompt
    };
  }
  buildNotificationEvent(sessionId, message, transcriptPath) {
    return {
      hook_event_name: "Notification",
      session_id: sessionId,
      transcript_path: transcriptPath,
      cwd: this.cwd,
      message
    };
  }
  getPromptHistory(sessionId) {
    const history = this.promptHistory.get(sessionId) || [];
    return history.map((id) => this.prompts.get(id)).filter((p) => p !== undefined);
  }
  getSessionStats(sessionId) {
    const history = this.getPromptHistory(sessionId);
    if (history.length === 0) {
      return {
        totalPrompts: 0,
        blockedPrompts: 0,
        averagePromptLength: 0,
        codeBlockCount: 0,
        urlCount: 0,
        sentimentBreakdown: {}
      };
    }
    const sentimentCounts = {
      positive: 0,
      negative: 0,
      neutral: 0,
      command: 0
    };
    let totalLength = 0;
    let blockedCount = 0;
    let codeBlockCount = 0;
    let urlCount = 0;
    for (const prompt of history) {
      totalLength += prompt.characterCount;
      if (prompt.wasBlocked)
        blockedCount++;
      if (prompt.hasCodeBlocks)
        codeBlockCount++;
      if (prompt.hasUrls)
        urlCount++;
      if (prompt.sentiment) {
        sentimentCounts[prompt.sentiment]++;
      }
    }
    return {
      totalPrompts: history.length,
      blockedPrompts: blockedCount,
      averagePromptLength: Math.round(totalLength / history.length),
      codeBlockCount,
      urlCount,
      sentimentBreakdown: sentimentCounts
    };
  }
  checkPromptTriggers(prompt) {
    const lower = prompt.toLowerCase();
    if (lower.includes("rm -rf") || lower.includes("format ") || lower.includes("delete all") || lower.includes("drop database")) {
      return "permission_needed" /* PERMISSION_NEEDED */;
    }
    if (lower.includes("api key") || lower.includes("password") || lower.includes("secret") || lower.includes("credential")) {
      return "tool_blocked" /* TOOL_BLOCKED */;
    }
    if (prompt.length > 1e4) {
      return "context_limit" /* CONTEXT_LIMIT */;
    }
    return null;
  }
  clearSession(sessionId) {
    const history = this.promptHistory.get(sessionId) || [];
    for (const promptId of history) {
      this.prompts.delete(promptId);
    }
    this.promptHistory.delete(sessionId);
    const notificationIds = Array.from(this.notifications.keys()).filter((id) => this.notifications.get(id)?.sessionId === sessionId);
    for (const id of notificationIds) {
      this.notifications.delete(id);
    }
    this.notificationQueue = this.notificationQueue.filter((n) => n.sessionId !== sessionId);
  }
  getActiveSessions() {
    return Array.from(this.promptHistory.keys());
  }
  dispose() {
    this.prompts.clear();
    this.notifications.clear();
    this.promptHistory.clear();
    this.notificationQueue = [];
  }
}

// src/utils/logger.ts
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
var LOG_FILE = "/tmp/agent-monitor.log";
function formatLogEntry(level, ...args) {
  const timestamp = new Date().toISOString();
  const message = args.map((arg) => {
    if (typeof arg === "object" && arg !== null) {
      try {
        return JSON.stringify(arg, null, 2);
      } catch {
        return String(arg);
      }
    }
    return String(arg);
  }).join(" ");
  return `[${timestamp}] [${level}] ${message}
`;
}
function writeLog(level, ...args) {
  try {
    const entry = formatLogEntry(level, ...args);
    appendFileSync(LOG_FILE, entry, "utf8");
  } catch (_error) {}
}
var logger = {
  log: (...args) => writeLog("INFO", ...args),
  info: (...args) => writeLog("INFO", ...args),
  warn: (...args) => writeLog("WARN", ...args),
  error: (...args) => writeLog("ERROR", ...args),
  debug: (...args) => writeLog("DEBUG", ...args)
};

// src/opencode/full-claude-plugin.ts
var VSCODE_PORT = process.env.OPENCODE_HOOK_PORT || 3100;
var VSCODE_HOST = "localhost";
var ENDPOINT = `http://${VSCODE_HOST}:${VSCODE_PORT}/opencode-hook`;
var EVENT_FILE_COUNTER = 0;
function sanitizeEventFilePart(value) {
  return String(value || "unknown").replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80);
}
function writeAgentEventFile(directory, event, meta) {
  try {
    const eventDirectory = process.env.OPENCODE_EVENT_DIR || `${directory}/data/opencode-agent-events/raw`;
    mkdirSync(eventDirectory, { recursive: true });
    const hookName = sanitizeEventFilePart(event?.hook_event_name || event?.event_type || event?.type || "event");
    const sessionId = sanitizeEventFilePart(event?.session_id || event?.sessionID || "session");
    const filename = `${Date.now()}-${EVENT_FILE_COUNTER++}-${sessionId}-${hookName}.json`;
    const separator = eventDirectory.endsWith("/") || eventDirectory.endsWith("\\") ? "" : "/";
    writeFileSync(`${eventDirectory}${separator}${filename}`, JSON.stringify({ ...event, _opencode_meta: meta }, null, 2), "utf8");
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
}
var FullClaudeMonitorPlugin = async ({
  project,
  directory,
  worktree,
  client,
  $
}) => {
  logger.log("[Agent Monitor] Full Claude plugin loaded with user interactions, sending to:", ENDPOINT);
  const transcriptBasePath = `${directory}/.opencode/transcripts`;
  const sessionManager = new SessionManager(directory, transcriptBasePath);
  const interactionHandler = new UserInteractionHandler(directory, transcriptBasePath);
  const pendingContextInjections = new Map;
  const pendingSystemMessages = new Map;
  async function sendClaudeEventWithControl(event) {
    logger.log("[Agent Monitor] Sending Claude event:", event.hook_event_name, {
      session: event.session_id,
      tool: "tool_name" in event ? event.tool_name : undefined,
      prompt: "prompt" in event ? `${event.prompt.substring(0, 50)}...` : undefined
    });
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
      const response = await fetch(ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          ...event,
          _opencode_meta: eventMeta
        })
      });
      if (!response.ok) {
        throw new Error(`Failed to send event: ${response.status} ${response.statusText}`);
      }
      const control = await response.json();
      return control;
    } catch (error) {
      logger.warn("[Agent Monitor] Monitor server unreachable, allowing operation:", error);
      return { block: false };
    }
  }
  async function sendClaudeEvent(event) {
    await sendClaudeEventWithControl(event);
  }
  async function handleBlockedPrompt(sessionId, reason, transcriptPath) {
    logger.log("[Agent Monitor] Prompt blocked:", reason);
    interactionHandler.createNotification(sessionId, "tool_blocked" /* TOOL_BLOCKED */, reason || "Prompt was blocked by monitor", "warning");
    const notifEvent = interactionHandler.buildNotificationEvent(sessionId, `Prompt blocked: ${reason}`, transcriptPath);
    await sendClaudeEvent(notifEvent);
    return null;
  }
  async function handlePromptTriggers(sessionId, prompt, transcriptPath) {
    const triggerType = interactionHandler.checkPromptTriggers(prompt);
    if (!triggerType) {
      return;
    }
    const notification = interactionHandler.createNotification(sessionId, triggerType, `Prompt triggered ${triggerType} notification`, triggerType === "permission_needed" /* PERMISSION_NEEDED */ ? "warning" : "info");
    const notifEvent = interactionHandler.buildNotificationEvent(sessionId, notification.message, transcriptPath);
    await sendClaudeEvent(notifEvent);
  }
  function handlePromptError(sessionId, error) {
    logger.error("[Agent Monitor] Failed to process user prompt:", error);
    interactionHandler.createNotification(sessionId, "error_occurred" /* ERROR_OCCURRED */, `Failed to process prompt: ${error.message}`, "error");
    return "";
  }
  async function handleUserPrompt(sessionId, prompt) {
    const session = sessionManager.getSession(sessionId) || sessionManager.initSession(sessionId, "startup");
    const promptEvent = {
      hook_event_name: "UserPromptSubmit",
      session_id: sessionId,
      transcript_path: session.transcriptPath,
      cwd: directory,
      prompt
    };
    try {
      const control = await sendClaudeEventWithControl(promptEvent);
      const promptMetadata = interactionHandler.processUserPrompt(sessionId, prompt, control);
      if (control.block) {
        return await handleBlockedPrompt(sessionId, control.reason, session.transcriptPath);
      }
      if (control.modifiedPrompt) {
        logger.log("[Agent Monitor] Prompt modified");
        promptMetadata.modifiedPrompt = control.modifiedPrompt;
      }
      if (control.contextToInject) {
        pendingContextInjections.set(sessionId, control.contextToInject);
        logger.log("[Agent Monitor] Context will be injected into response");
      }
      if (control.systemMessage) {
        pendingSystemMessages.set(sessionId, control.systemMessage);
        logger.log("[Agent Monitor] System message will be added");
      }
      await handlePromptTriggers(sessionId, prompt, session.transcriptPath);
      return control.modifiedPrompt || prompt;
    } catch (error) {
      handlePromptError(sessionId, error);
      return prompt;
    }
  }
  function sanitizeSensitiveArgs(args) {
    return {
      _sanitized: true,
      param_count: Object.keys(args).length,
      param_types: Object.keys(args).reduce((acc, key) => {
        acc[key] = typeof args[key];
        return acc;
      }, {})
    };
  }
  function sanitizeArgValue(key, value) {
    if (key === "command" && typeof value === "string") {
      return value.substring(0, 100);
    }
    if (key === "pattern" || key === "glob" || key === "path") {
      return value;
    }
    if (typeof value === "string" && value.length > 200) {
      return `${value.substring(0, 200)}... [truncated]`;
    }
    if (typeof value === "object") {
      return "[object]";
    }
    return value;
  }
  function sanitizeToolInput(toolName, args) {
    const metadata = getToolMetadata(toolName);
    if (metadata?.sensitive) {
      return sanitizeSensitiveArgs(args);
    }
    const safeArgs = {};
    for (const [key, value] of Object.entries(args)) {
      safeArgs[key] = sanitizeArgValue(key, value);
    }
    return safeArgs;
  }
  function setupIdleNotifications() {
    setInterval(() => {
      for (const session of sessionManager.getActiveSessions()) {
        const now = Date.now();
        if (now - session.lastActivity > 55000 && now - session.lastActivity < 60000) {
          interactionHandler.createNotification(session.sessionId, "idle_warning" /* IDLE_WARNING */, "Session will become idle in 5 seconds", "warning");
          const notifEvent = interactionHandler.buildNotificationEvent(session.sessionId, "Session idle warning", session.transcriptPath);
          sendClaudeEvent(notifEvent).catch(logger.error);
        }
      }
    }, 5000);
  }
  setupIdleNotifications();
  return {
    "chat.message": async (_input, output) => {
      const { message, parts } = output;
      const sessionId = message?.sessionID || "unknown";
      const isUserMessage = message?.role === "user";
      const isAssistantMessage = message?.role === "assistant";
      const messageText = Array.isArray(parts) ? parts.map((p) => p.text || p.content || "").join(`
`) : typeof message?.content === "string" ? message.content : String(message || "");
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
      const promptText = messageText;
      const processedPrompt = await handleUserPrompt(sessionId, promptText);
      sessionManager.handleUserMessage(sessionId);
      if (processedPrompt === null) {
        throw new Error("Prompt blocked by monitor");
      }
      if (processedPrompt !== promptText) {
        message.modifiedText = processedPrompt;
      }
    },
    "tool.execute.before": async (input, output) => {
      const { tool, sessionID } = input;
      const { args } = output;
      assertWorkspaceOnlyToolUse(tool, args);
      try {
        let session = sessionManager.getSession(sessionID);
        if (!session) {
          session = sessionManager.initSession(sessionID, "startup");
          const sessionStartEvent = sessionManager.buildSessionStartEvent(sessionID);
          await sendClaudeEvent(sessionStartEvent);
          logger.warn("[Agent Monitor] Session initialized in fallback mode:", sessionID);
        }
        sessionManager.startTool(sessionID, tool, args);
        const preToolEvent = {
          hook_event_name: "PreToolUse",
          session_id: sessionID,
          transcript_path: session.transcriptPath,
          cwd: session.cwd,
          tool_name: tool,
          tool_input: sanitizeToolInput(tool, args)
        };
        const control = await sendClaudeEventWithControl(preToolEvent);
        if (control.block) {
          interactionHandler.createNotification(sessionID, "tool_blocked" /* TOOL_BLOCKED */, `Tool ${tool} blocked: ${control.reason}`, "warning");
          throw new Error(control.reason || "Tool call blocked by agent monitor");
        }
        if (control.contextToInject) {
          logger.log("[Agent Monitor] Context injected for tool:", tool);
        }
        sessionManager.setResponding(sessionID, true);
      } catch (error) {
        if (error.message?.includes("blocked by agent monitor")) {
          throw error;
        }
        logger.warn("[Agent Monitor] Error in tool pre-execution, allowing tool:", error);
      }
    },
    "tool.execute.after": async (input, output) => {
      const { tool, sessionID } = input;
      const session = sessionManager.getSession(sessionID);
      if (!session) {
        logger.warn("[Agent Monitor] Session not found for post-execute:", sessionID);
        return;
      }
      try {
        const pendingContext = pendingContextInjections.get(sessionID);
        if (pendingContext) {
          logger.log("[Agent Monitor] Injecting context into tool response");
          output.contextInjected = pendingContext;
          pendingContextInjections.delete(sessionID);
        }
        const postToolEvent = {
          hook_event_name: "PostToolUse",
          session_id: sessionID,
          transcript_path: session.transcriptPath,
          cwd: session.cwd,
          tool_name: tool,
          tool_input: sanitizeToolInput(tool, session.lastToolArgs || {}),
          tool_response: {
            title: output.title,
            output_length: output.output?.length || 0,
            has_metadata: !!output.metadata,
            success: true,
            context_injected: !!pendingContext
          }
        };
        await sendClaudeEvent(postToolEvent);
        sessionManager.completeTool(sessionID, tool);
        if (tool === "Task") {
          const subagentStopEvent = sessionManager.buildSubagentStopEvent(sessionID);
          await sendClaudeEvent(subagentStopEvent);
        }
        setTimeout(async () => {
          sessionManager.setResponding(sessionID, false);
          const session2 = sessionManager.getSession(sessionID);
          if (session2?.stopHookActive) {
            const stopEvent = sessionManager.buildStopEvent(sessionID);
            await sendClaudeEvent(stopEvent);
          }
        }, 500);
      } catch (error) {
        logger.error("[Agent Monitor] Failed to send PostToolUse event:", error);
      }
    },
    event: async ({ event }) => {
      try {
        const rawSessionId = event?.properties?.sessionID || event?.properties?.info?.id || event?.properties?.message?.sessionID || "unknown";
        if (shouldWriteRawOpenCodeEvent(event)) {
          await sendClaudeEvent({
            hook_event_name: "OpenCodeRawEvent",
            session_id: rawSessionId,
            event_type: event?.type || "unknown",
            event
          });
        }
        if (event.type === "session.updated") {
          const sessionInfo = event.properties.info;
          const sessionID = sessionInfo?.id;
          if (sessionID) {
            const existingSession = sessionManager.getSession(sessionID);
            if (!existingSession) {
              sessionManager.initSession(sessionID, "startup");
              const sessionStartEvent = sessionManager.buildSessionStartEvent(sessionID);
              await sendClaudeEvent(sessionStartEvent);
              logger.log("[Agent Monitor] New session created:", sessionID);
            }
          }
        } else if (event.type === "session.idle") {
          const sessionID = event.properties.sessionID;
          const session = sessionManager.getSession(sessionID);
          if (session) {
            sessionManager.setResponding(sessionID, false);
            const stopEvent = sessionManager.buildStopEvent(sessionID);
            await sendClaudeEvent(stopEvent);
            logger.log("[Agent Monitor] Agent stopped responding (session.idle)");
          }
        } else if (event.type === "session.deleted") {
          const sessionInfo = event.properties.info;
          const sessionID = sessionInfo?.id || "unknown";
          const session = sessionManager.getSession(sessionID);
          if (session) {
            const sessionEndEvent = sessionManager.buildSessionEndEvent(sessionID);
            await sendClaudeEvent(sessionEndEvent);
            const stats = interactionHandler.getSessionStats(sessionID);
            const _summaryMessage = `Session ended: ${stats.totalPrompts} prompts, ${stats.blockedPrompts} blocked`;
            sessionManager.endSession(sessionID, "deleted");
            interactionHandler.clearSession(sessionID);
            logger.log("[Agent Monitor] Session deleted (session.deleted)");
          }
        } else if (event.type === "session.error") {
          const sessionID = event.properties.sessionID || "unknown";
          const errorName = event.properties.error?.name || "unknown";
          interactionHandler.createNotification(sessionID, "error_occurred" /* ERROR_OCCURRED */, `Session error: ${errorName}`, "error");
          const session = sessionManager.getSession(sessionID);
          if (session) {
            const notifEvent = interactionHandler.buildNotificationEvent(sessionID, `Session error: ${errorName}`, session.transcriptPath);
            await sendClaudeEvent(notifEvent);
            sessionManager.endSession(sessionID, `error: ${errorName}`, event.properties.error);
            const sessionEndEvent = sessionManager.buildSessionEndEvent(sessionID);
            await sendClaudeEvent(sessionEndEvent);
          }
        }
      } catch (error) {
        logger.error("[Agent Monitor] Failed to send session event:", error);
      }
    }
  };
};
export {
  FullClaudeMonitorPlugin
};
