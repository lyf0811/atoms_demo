import { createServer } from "http";
import { watch } from "fs";
import { mkdir, readdir, readFile, stat, writeFile } from "fs/promises";
import next from "next";
import os from "os";
import path from "path";
import { pathToFileURL } from "url";

const terminalSessions = getTerminalSessionStore();
const dev = process.env.NODE_ENV !== "production";
const hostname = normalizeBindHost(process.env.APP_HOST || process.env.HOST);
const port = Number(process.env.PORT || 3100);
const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

console.log("[atoms server] preparing Next app...");
await app.prepare();
console.log("[atoms server] Next app ready");

const server = createServer((req, res) => {
  if (req.method === "GET" && req.url?.split("?")[0] === "/api/agent-events/debug") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        clients: agentEventClients.size,
        events: recentAgentEvents,
      }),
    );
    return;
  }

  if (req.method === "GET" && req.url?.split("?")[0] === "/api/agent-events/conversation") {
    const requestUrl = new URL(req.url || "", `http://${req.headers.host || "localhost"}`);
    const projectId = sanitizeFilePart(requestUrl.searchParams.get("projectId") || "default");
    identifyUserFromRequest(req)
      .then(async (userId) => {
        const messages = await readUserConversationMessages(userId, projectId);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ userId, projectId, messages }));
      })
      .catch((error) => {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: error instanceof Error ? error.message : "Could not read conversation." }));
      });
    return;
  }

  if (req.method === "POST" && req.url?.split("?")[0] === "/opencode-hook") {
    readJsonBody(req)
      .then(async (event) => {
        rememberOpenCodeMessageRole(event);
        rememberOpenCodeQuestion(event);
        const texts = dedupeHookTexts(event, [
          ...extractAssistantText(event),
          ...(await extractTranscriptAssistantText(event)),
        ]);
        const userTexts = dedupeUserConversationTexts(event, extractOpenCodeQuestionReplyTexts(event));
        const userId = resolveEventUserId(event);
        const projectId = resolveEventProjectId(event);
        const sessionId = getOpenCodeSessionId(event);
        const debug = rememberAgentEvent(event, texts, "hook");
        for (const text of userTexts) {
          void appendConversationMessage({
            userId,
            sessionId,
            projectId,
            role: "user",
            content: text,
            source: "terminal-selection",
            eventType: String(event?.hook_event_name || event?.event_type || ""),
          });
        }
        for (const text of texts) {
          void appendConversationMessage({
            userId,
            sessionId,
            projectId,
            role: "assistant",
            content: text,
            source: "hook",
            eventType: String(event?.hook_event_name || event?.event_type || ""),
          });
        }
        broadcastAgentEvent({ type: "hook", event, texts, userTexts, debug, userId, projectId });
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, texts: texts.length, userTexts: userTexts.length, debug }));
      })
      .catch((error) => {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: error instanceof Error ? error.message : "Invalid hook payload" }));
      });
    return;
  }

  handle(req, res);
});

console.log("[atoms server] attaching terminal server...");
await attachPtyServer(server);
console.log("[atoms server] terminal server ready");
attachAgentEventServer(server);
console.log("[atoms server] agent event websocket ready");
await attachAgentFileWatcher();
console.log("[atoms server] agent event file watcher ready");

server.listen(port, hostname, () => {
  console.log(`Ready on http://${hostname}:${port}`);
});

function normalizeBindHost(value) {
  const host = String(value || "").trim();

  if (!host) {
    return "0.0.0.0";
  }

  if (
    host === "0.0.0.0" ||
    host === "127.0.0.1" ||
    host === "localhost" ||
    host === "::" ||
    host === "::1" ||
    /^\d{1,3}(\.\d{1,3}){3}$/.test(host) ||
    host.includes(".")
  ) {
    return host;
  }

  console.warn(`[atoms server] Ignoring non-address host value "${host}". Binding to 0.0.0.0 instead.`);
  return "0.0.0.0";
}

function getTerminalSessionStore() {
  if (!globalThis.__atomsTerminalSessions) {
    globalThis.__atomsTerminalSessions = new Map();
  }

  return globalThis.__atomsTerminalSessions;
}

async function attachPtyServer(httpServer) {
  const [{ WebSocketServer }, pty] = await Promise.all([import("ws"), import("node-pty")]);
  const wss = new WebSocketServer({ noServer: true });

  httpServer.on("upgrade", (request, socket, head) => {
    const url = new URL(request.url || "", `http://${request.headers.host || "localhost"}`);

    if (url.pathname !== "/api/pty") {
      return;
    }

    void authorizeWebSocketRequest(request).then((isAuthorized) => {
      if (!isAuthorized) {
        socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
        socket.destroy();
        return;
      }

      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit("connection", ws, request);
      });
    });
  });

  wss.on("connection", async (ws, request) => {
    const userId = await identifyUserFromRequest(request);
    const requestUrl = new URL(request.url || "", `http://${request.headers.host || "localhost"}`);
    const projectId = sanitizeFilePart(requestUrl.searchParams.get("projectId") || "default");
    addActiveUser(userId);
    const userWorkspace = getUserProjectWorkspaceDirectory(userId, projectId);
    await mkdir(userWorkspace, { recursive: true });
    await ensureOpenCodeWorkspaceConfig(userWorkspace);
    const shell = process.platform === "win32" ? "powershell.exe" : process.env.SHELL || "bash";
    const args = process.platform === "win32" ? ["-NoLogo"] : ["-l"];
    const terminal = pty.spawn(shell, args, {
      name: "xterm-256color",
      cols: 100,
      rows: 32,
      cwd: userWorkspace,
      env: createTerminalEnv(userId, projectId),
    });
    const terminalSessionId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    terminalSessions.set(terminalSessionId, {
      userId,
      projectId,
      pid: terminal.pid,
      kill: () => terminal.kill(),
      close: () => ws.close(),
    });
    const jsonExtractor = createOpenCodeJsonExtractor((text) => {
      safeSend(ws, { type: "assistant", data: text });
      broadcastAssistantText(text, "terminal-json", userId, projectId);
    });

    terminal.onData((data) => {
      ws.send(JSON.stringify({ type: "output", data }));
      jsonExtractor.push(data);
    });

    terminal.onExit(({ exitCode }) => {
      terminalSessions.delete(terminalSessionId);
      safeSend(ws, { type: "output", data: `\r\n[terminal exited with code ${exitCode}]\r\n` });
      ws.close();
    });

    ws.on("message", (raw) => {
      try {
        const message = JSON.parse(String(raw));

        if (message.type === "input" && typeof message.data === "string") {
          if (message.source === "chat") {
            void appendConversationMessage({
              userId,
              sessionId: "opencode",
              projectId,
              role: "user",
              content: normalizeTerminalChatInput(message.data),
              source: "chat-input",
            });
          }
          terminal.write(message.data);
        }

        if (message.type === "resize" && Number.isFinite(message.cols) && Number.isFinite(message.rows)) {
          terminal.resize(Math.max(20, message.cols), Math.max(6, message.rows));
        }
      } catch {
        terminal.write(String(raw));
      }
    });

    ws.on("close", () => {
      terminalSessions.delete(terminalSessionId);
      removeActiveUser(userId);
      terminal.kill();
    });

    bootstrapShell(terminal, userId, projectId);
    safeSend(ws, { type: "opencode-status", data: "starting" });
  });
}

const agentEventClients = new Set();
const deliveredHookTexts = new Map();
const deliveredUserConversationTexts = new Map();
const recentAgentEvents = [];
const recentAgentMessages = [];
const processedAgentFiles = new Map();
const openCodeMessageRoles = new Map();
const openCodeQuestions = new Map();
const openCodeSessionUsers = new Map();
const openCodeSessionProjects = new Map();
const activeUserCounts = new Map();
const conversationWriteQueues = new Map();
let lastActiveUserId = "anonymous";

function attachAgentEventServer(httpServer) {
  import("ws").then(({ WebSocketServer }) => {
    const wss = new WebSocketServer({ noServer: true });

    httpServer.on("upgrade", (request, socket, head) => {
      const url = new URL(request.url || "", `http://${request.headers.host || "localhost"}`);

      if (url.pathname !== "/api/agent-events") {
        return;
      }

      void authorizeWebSocketRequest(request).then((isAuthorized) => {
        if (!isAuthorized) {
          socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
          socket.destroy();
          return;
        }

        wss.handleUpgrade(request, socket, head, (ws) => {
          wss.emit("connection", ws, request);
        });
      });
    });

    wss.on("connection", async (ws, request) => {
      const userId = await identifyUserFromRequest(request);
      const requestUrl = new URL(request.url || "", `http://${request.headers.host || "localhost"}`);
      const projectId = sanitizeFilePart(requestUrl.searchParams.get("projectId") || "default");
      addActiveUser(userId);
      ws.atomsUserId = userId;
      ws.atomsProjectId = projectId;
      agentEventClients.add(ws);
      ws.send(JSON.stringify({ type: "status", data: "connected to agent hook stream" }));
      ws.on("close", () => {
        agentEventClients.delete(ws);
        removeActiveUser(userId);
      });
    });
  });
}

function broadcastAgentEvent(payload) {
  const message = JSON.stringify(payload);

  for (const client of Array.from(agentEventClients)) {
    if (client.readyState === client.OPEN && shouldDeliverAgentPayload(payload, client.atomsUserId, client.atomsProjectId)) {
      client.send(message);
    }
  }
}

function broadcastAssistantText(text, source, userId = getCurrentConversationUserId(), projectId = "default") {
  const event = {
    hook_event_name: "OpenCodeJsonStdout",
    session_id: source,
    source,
    content: text,
    user_id: userId,
    project_id: projectId,
  };
  const texts = dedupeHookTexts(event, [text]);
  const debug = rememberAgentEvent(event, texts, source);

  if (texts.length) {
    for (const normalizedText of texts) {
      void appendConversationMessage({
        userId,
        sessionId: "opencode",
        projectId,
        role: "assistant",
        content: normalizedText,
        source,
      });
    }
    broadcastAgentEvent({ type: "hook", event, texts, debug, userId, projectId });
  }
}

async function attachAgentFileWatcher() {
  const directory = getAgentEventDirectory();
  await mkdir(directory, { recursive: true });
  console.log(`Watching OpenCode agent event files in ${directory}`);

  const scan = () => {
    void scanAgentEventDirectory(directory);
  };

  await primeAgentEventDirectory(directory);

  try {
    const watcher = watch(directory, { persistent: false }, (_eventType, filename) => {
      if (!filename || !String(filename).toLowerCase().endsWith(".json")) {
        return;
      }

      setTimeout(scan, 80);
    });

    watcher.on("error", (error) => {
      console.warn("OpenCode agent file watcher error:", error);
    });
  } catch (error) {
    console.warn("OpenCode agent file watcher could not start:", error);
  }

  setInterval(scan, 1500).unref();
}

async function primeAgentEventDirectory(directory) {
  let entries = [];

  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.toLowerCase().endsWith(".json")) {
      continue;
    }

    const filePath = path.join(directory, entry.name);

    try {
      const fileStat = await stat(filePath);
      processedAgentFiles.set(filePath, `${fileStat.size}:${fileStat.mtimeMs}`);
    } catch {
      // Ignore files that disappear while the watcher starts.
    }
  }
}

async function scanAgentEventDirectory(directory) {
  let entries = [];

  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    return;
  }

  const files = entries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".json"))
    .map((entry) => path.join(directory, entry.name))
    .sort((left, right) => path.basename(left).localeCompare(path.basename(right)));

  for (const filePath of files) {
    await processAgentEventFile(filePath);
  }
}

async function processAgentEventFile(filePath) {
  let fileStat;

  try {
    fileStat = await stat(filePath);
  } catch {
    return;
  }

  const signature = `${fileStat.size}:${fileStat.mtimeMs}`;

  if (processedAgentFiles.get(filePath) === signature) {
    return;
  }

  processedAgentFiles.set(filePath, signature);

  try {
    const raw = await readFile(filePath, "utf8");
    const events = parseAgentEventFile(raw);

    for (const event of events) {
      rememberOpenCodeMessageRole(event);
      rememberOpenCodeQuestion(event);
      const texts = dedupeHookTexts(event, extractAssistantText(event));
      const userTexts = dedupeUserConversationTexts(event, extractOpenCodeQuestionReplyTexts(event));
      const userId = resolveEventUserId(event);
      const projectId = resolveEventProjectId(event);
      const debug = rememberAgentEvent({ ...event, file_path: filePath }, texts, "file-watch");
      for (const text of userTexts) {
        void appendConversationMessage({
          userId,
          projectId,
          sessionId: getOpenCodeSessionId(event),
          role: "user",
          content: text,
          source: "terminal-selection",
          eventType: String(event?.hook_event_name || event?.event_type || event?.event?.type || ""),
        });
      }
      for (const text of texts) {
        void appendConversationMessage({
          userId,
          projectId,
          sessionId: getOpenCodeSessionId(event),
          role: "assistant",
          content: text,
          source: "file-watch",
          eventType: String(event?.hook_event_name || event?.event_type || event?.event?.type || ""),
        });
      }
      broadcastAgentEvent({ type: "hook", event: { ...event, file_path: filePath }, texts, userTexts, debug, userId, projectId });
    }
  } catch (error) {
    rememberAgentEvent(
      {
        hook_event_name: "AgentFileReadError",
        source: "file-watch",
        file_path: filePath,
        error: error instanceof Error ? error.message : String(error),
      },
      [],
      "file-watch",
    );
  }

  if (processedAgentFiles.size > 1000) {
    const stale = Array.from(processedAgentFiles.keys()).slice(0, processedAgentFiles.size - 800);

    for (const key of stale) {
      processedAgentFiles.delete(key);
    }
  }
}

function parseAgentEventFile(raw) {
  const trimmed = raw.trim();

  if (!trimmed) {
    return [];
  }

  try {
    const parsed = JSON.parse(trimmed);
    return Array.isArray(parsed) ? parsed.filter(Boolean) : [parsed];
  } catch {
    return trimmed
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  }
}

function rememberAgentEvent(event, texts, source) {
  const userId = resolveEventUserId(event);
  const projectId = resolveEventProjectId(event);
  const debug = {
    at: new Date().toISOString(),
    source,
    userId,
    projectId,
    hook_event_name: String(event?.hook_event_name || ""),
    event_type: String(event?.event_type || event?.type || event?.event?.type || ""),
    role: String(findStringByKey(event, "role") || ""),
    textCount: texts.length,
    textPreview: texts.map((text) => text.slice(0, 160)),
    keys: event && typeof event === "object" ? Object.keys(event).slice(0, 24) : [],
  };

  recentAgentEvents.push(debug);

  if (texts.length) {
    recentAgentMessages.push({ type: "hook", event, texts, debug, userId, projectId });
  }

  if (recentAgentEvents.length > 80) {
    recentAgentEvents.splice(0, recentAgentEvents.length - 80);
  }

  if (recentAgentMessages.length > 80) {
    recentAgentMessages.splice(0, recentAgentMessages.length - 80);
  }

  return debug;
}

function getAgentEventDirectory() {
  return path.join(getAgentEventBaseDirectory(), "raw");
}

function getAgentEventBaseDirectory() {
  return path.resolve(process.env.OPENCODE_EVENT_BASE_DIR || process.env.OPENCODE_EVENT_DIR || path.join(process.cwd(), "data", "opencode-agent-events"));
}

function getUserWorkspaceDirectory(userId) {
  return path.join(process.cwd(), "data", "workspaces", sanitizeFilePart(userId));
}

function getUserProjectWorkspaceDirectory(userId, projectId = "default") {
  return path.join(getUserWorkspaceDirectory(userId), "projects", sanitizeFilePart(projectId || "default"));
}

async function ensureOpenCodeWorkspaceConfig(userWorkspace) {
  const configPath = path.join(userWorkspace, "opencode.json");
  const pluginPath = path.resolve(process.cwd(), ".opencode", "plugin", "agent-monitor.js");
  const config = {
    $schema: "https://opencode.ai/config.json",
    plugin: [pathToFileURL(pluginPath).href],
    permission: {
      edit: "allow",
      read: "allow",
      list: "allow",
      grep: "allow",
      glob: "allow",
      external_directory: "deny",
      bash: "deny",
    },
  };

  await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
}

function getConversationDirectory() {
  return path.join(getAgentEventBaseDirectory(), "conversations");
}

function getOpenCodeSessionId(event) {
  return String(
    event?.session_id ||
      event?.sessionID ||
      event?.event?.properties?.sessionID ||
      event?.event?.properties?.info?.sessionID ||
      event?.event?.properties?.part?.sessionID ||
      "opencode",
  );
}

function resolveEventUserId(event) {
  const sessionId = getOpenCodeSessionId(event);
  const eventUserId = sanitizeFilePart(
    event?.user_id ||
      event?.userId ||
      event?._opencode_meta?.user_id ||
      event?._opencode_meta?.userId ||
      event?.event?.user_id ||
      event?.event?._opencode_meta?.user_id ||
      "",
  );

  if (eventUserId && eventUserId !== "unknown") {
    openCodeSessionUsers.set(sessionId, eventUserId);
    return eventUserId;
  }

  return openCodeSessionUsers.get(sessionId) || getCurrentConversationUserId();
}

function resolveEventProjectId(event) {
  const sessionId = getOpenCodeSessionId(event);
  const eventProjectId = sanitizeFilePart(
    event?.project_id ||
      event?.projectId ||
      event?._opencode_meta?.project_id ||
      event?._opencode_meta?.projectId ||
      event?.event?.project_id ||
      event?.event?._opencode_meta?.project_id ||
      process.env.ATOMS_PROJECT_ID ||
      "",
  );

  if (eventProjectId && eventProjectId !== "unknown") {
    openCodeSessionProjects.set(sessionId, eventProjectId);
    return eventProjectId;
  }

  return openCodeSessionProjects.get(sessionId) || "default";
}

function shouldDeliverAgentPayload(payload, userId, projectId) {
  const payloadUserId = payload?.userId || payload?.debug?.userId;
  const payloadProjectId = payload?.projectId || payload?.debug?.projectId;

  if (payloadUserId && userId && sanitizeFilePart(payloadUserId) !== sanitizeFilePart(userId)) {
    return false;
  }

  if (payloadProjectId && projectId && sanitizeFilePart(payloadProjectId) !== sanitizeFilePart(projectId)) {
    return false;
  }

  if (!payloadUserId && !payloadProjectId) {
    return true;
  }

  return true;
}

function addActiveUser(userId) {
  activeUserCounts.set(userId, (activeUserCounts.get(userId) || 0) + 1);
  lastActiveUserId = userId;
}

function removeActiveUser(userId) {
  const nextCount = (activeUserCounts.get(userId) || 1) - 1;

  if (nextCount <= 0) {
    activeUserCounts.delete(userId);
    return;
  }

  activeUserCounts.set(userId, nextCount);
}

function getCurrentConversationUserId() {
  if (activeUserCounts.has(lastActiveUserId)) {
    return lastActiveUserId;
  }

  const [firstActiveUserId] = activeUserCounts.keys();
  return firstActiveUserId || "anonymous";
}

async function identifyUserFromRequest(request) {
  const token = parseCookieHeader(request.headers.cookie || "").atoms_session;

  if (!token) {
    return "anonymous";
  }

  try {
    const [sessionsFile, usersFile] = await Promise.all([
      readDataJson("sessions.json", { sessions: [] }),
      readDataJson("users.json", { users: [] }),
    ]);
    const now = Date.now();
    const session = sessionsFile.sessions.find(
      (candidate) => candidate.token === token && new Date(candidate.expiresAt).getTime() > now,
    );

    if (!session) {
      return "anonymous";
    }

    const user = usersFile.users.find((candidate) => candidate.id === session.userId);
    return user?.id || session.userId || "anonymous";
  } catch {
    return "anonymous";
  }
}

function parseCookieHeader(header) {
  return String(header)
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce((cookies, part) => {
      const separatorIndex = part.indexOf("=");

      if (separatorIndex === -1) {
        return cookies;
      }

      const key = decodeURIComponent(part.slice(0, separatorIndex).trim());
      const value = decodeURIComponent(part.slice(separatorIndex + 1).trim());
      cookies[key] = value;
      return cookies;
    }, {});
}

async function readDataJson(fileName, fallback) {
  try {
    const raw = await readFile(path.join(process.cwd(), "data", fileName), "utf8");
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function normalizeTerminalChatInput(value) {
  return String(value).replace(/\r?\n$/, "").replace(/\r$/, "").trim();
}

function isPersistedUserConversationSource(source) {
  return source === "chat-input" || source === "terminal-selection";
}

async function appendConversationMessage(message) {
  const content = String(message.content || "").trim();

  if (!content) {
    return;
  }

  if (message.role === "user" && !isPersistedUserConversationSource(message.source)) {
    return;
  }

  const userId = sanitizeFilePart(message.userId || "anonymous");
  const projectId = sanitizeFilePart(message.projectId || "default");
  const sessionId = sanitizeFilePart(message.sessionId || "opencode");
  openCodeSessionProjects.set(sessionId, projectId);
  const filePath = path.join(getConversationDirectory(), userId, projectId, `${sessionId}.json`);
  const queueKey = filePath;
  const previous = conversationWriteQueues.get(queueKey) || Promise.resolve();
  const next = previous
    .catch(() => {})
    .then(async () => {
      await mkdir(path.dirname(filePath), { recursive: true });
      const conversation = await readConversationFile(filePath, {
        userId,
        projectId,
        sessionId,
        messages: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      const now = new Date();
      const existingMessage = conversation.messages.find((candidate) => {
        const candidateCreatedAt = new Date(candidate?.createdAt || 0).getTime();
        const age = Number.isFinite(candidateCreatedAt) ? now.getTime() - candidateCreatedAt : Infinity;

        return (
          age >= 0 &&
          age < 1500 &&
          candidate?.role === message.role &&
          String(candidate?.source || "unknown") === String(message.source || "unknown") &&
          String(candidate?.eventType || "") === String(message.eventType || "") &&
          normalizeConversationContent(candidate?.content) === normalizeConversationContent(content)
        );
      });

      if (existingMessage) {
        return;
      }

      conversation.messages.push({
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        role: message.role,
        content,
        source: message.source || "unknown",
        eventType: message.eventType || "",
        createdAt: now.toISOString(),
      });
      conversation.updatedAt = new Date().toISOString();
      await writeFile(filePath, JSON.stringify(conversation, null, 2), "utf8");
    })
    .finally(() => {
      if (conversationWriteQueues.get(queueKey) === next) {
        conversationWriteQueues.delete(queueKey);
      }
    });

  conversationWriteQueues.set(queueKey, next);
  await next;
}

async function readConversationFile(filePath, fallback) {
  let raw = "";

  try {
    raw = await readFile(filePath, "utf8");
    const parsed = JSON.parse(raw);
    return {
      ...fallback,
      ...parsed,
      messages: Array.isArray(parsed.messages) ? parsed.messages : [],
    };
  } catch {
    const recovered = recoverConversationFile(raw, fallback);
    return recovered || fallback;
  }
}

function recoverConversationFile(raw, fallback) {
  if (!raw) {
    return null;
  }

  const messages = [];
  const blocks = raw.match(/\{\s*"id"[\s\S]*?\n\s*\}/g) || [];

  for (const block of blocks) {
    const role = extractLooseJsonString(block, "role");
    const source = extractLooseJsonString(block, "source");

    if (role !== "user" && role !== "assistant") {
      continue;
    }

    const content = extractLooseJsonString(block, "content");

    if (!content) {
      continue;
    }

    messages.push({
      id: extractLooseJsonString(block, "id") || `${fallback.sessionId}-${messages.length}`,
      role,
      content,
      source: source || "conversation",
      eventType: extractLooseJsonString(block, "eventType") || "",
      createdAt: extractLooseJsonString(block, "createdAt") || fallback.createdAt || "",
    });
  }

  if (!messages.length) {
    return null;
  }

  return {
    ...fallback,
    messages,
  };
}

function extractLooseJsonString(block, key) {
  const line = block
    .split(/\r?\n/)
    .find((candidate) => candidate.trim().startsWith(`"${key}"`));

  if (!line) {
    return "";
  }

  const separatorIndex = line.indexOf(":");

  if (separatorIndex < 0) {
    return "";
  }

  return line
    .slice(separatorIndex + 1)
    .trim()
    .replace(/,$/, "")
    .replace(/^"/, "")
    .replace(/"$/, "")
    .trim();
}

async function readUserConversationMessages(userId, projectId = "default") {
  const safeUserId = sanitizeFilePart(userId || "anonymous");
  const safeProjectId = sanitizeFilePart(projectId || "default");
  const userDirectory = path.join(getConversationDirectory(), safeUserId, safeProjectId);
  let entries = [];

  try {
    entries = await readdir(userDirectory, { withFileTypes: true });
  } catch {
    return [];
  }

  const messages = [];
  const files = entries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".json"))
    .map((entry) => path.join(userDirectory, entry.name));

  for (const filePath of files) {
    const conversation = await readConversationFile(filePath, {
      userId: safeUserId,
      sessionId: path.basename(filePath, ".json"),
      messages: [],
      createdAt: "",
      updatedAt: "",
    });

    for (const message of conversation.messages) {
      if (!message?.content || (message.role !== "user" && message.role !== "assistant")) {
        continue;
      }

      if (message.role === "user" && !isPersistedUserConversationSource(message.source)) {
        continue;
      }

      messages.push({
        id: String(message.id || `${conversation.sessionId}-${messages.length}`),
        sessionId: conversation.sessionId,
        role: message.role,
        content: String(message.content),
        source: String(message.source || "conversation"),
        eventType: String(message.eventType || ""),
        createdAt: String(message.createdAt || conversation.createdAt || ""),
      });
    }
  }

  return dedupeConversationMessages(messages)
    .sort((left, right) => new Date(left.createdAt || 0).getTime() - new Date(right.createdAt || 0).getTime())
    .slice(-120);
}

function dedupeConversationMessages(messages) {
  const sortedMessages = [...messages].sort(
    (left, right) => new Date(left.createdAt || 0).getTime() - new Date(right.createdAt || 0).getTime(),
  );
  const seen = new Set();
  const unique = [];

  for (const message of sortedMessages) {
    const key = message.id
      ? `${message.sessionId}:${message.id}`
      : [
          message.sessionId,
          message.role,
          message.source,
          message.eventType,
          message.createdAt,
          normalizeConversationContent(message.content),
        ].join(":");

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    unique.push(message);
  }

  return unique;
}

function normalizeConversationContent(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function sanitizeFilePart(value) {
  return String(value || "unknown").replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120) || "unknown";
}

async function extractTranscriptAssistantText(event) {
  const transcriptPath = typeof event?.transcript_path === "string" ? event.transcript_path : "";

  if (!transcriptPath) {
    return [];
  }

  try {
    const raw = await readFile(transcriptPath, "utf8");
    const transcript = parseTranscript(raw);
    return extractAssistantMessagesFromTranscript(transcript);
  } catch {
    return [];
  }
}

function parseTranscript(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  }
}

function extractAssistantMessagesFromTranscript(transcript) {
  const messages = [];

  function visit(node) {
    if (!node) {
      return;
    }

    if (Array.isArray(node)) {
      for (const item of node) {
        visit(item);
      }

      return;
    }

    if (typeof node !== "object") {
      return;
    }

    const role = String(node.role || node.author || node.type || "").toLowerCase();
    const isAssistant =
      role === "assistant" ||
      role === "model" ||
      role.includes("assistant") ||
      role.includes("message.output");

    if (isAssistant) {
      const text = collectTextFields(node)
        .filter((value) => !isNoiseText(value))
        .join("\n")
        .trim();

      if (text) {
        messages.push(text);
      }
    }

    for (const value of Object.values(node)) {
      visit(value);
    }
  }

  visit(transcript);
  return messages.slice(-6);
}

function dedupeHookTexts(event, texts) {
  const dedupeKey = `${resolveEventUserId(event)}:${String(event?.session_id || event?.sessionID || "global")}`;
  const delivered = deliveredHookTexts.get(dedupeKey) || new Map();
  const next = [];
  const now = Date.now();

  for (const text of texts) {
    const normalized = text.trim();
    const lastDeliveredAt = delivered.get(normalized) || 0;

    if (!normalized || now - lastDeliveredAt < 3000) {
      continue;
    }

    delivered.set(normalized, now);
    next.push(normalized);
  }

  for (const [text, deliveredAt] of delivered) {
    if (now - deliveredAt > 60000) {
      delivered.delete(text);
    }
  }

  deliveredHookTexts.set(dedupeKey, delivered);
  return next;
}

function dedupeUserConversationTexts(event, texts) {
  const properties = event?.event?.properties;
  const eventIdentity = String(properties?.requestID || properties?.id || event?.event?.id || event?.id || "user");
  const dedupeKey = [
    resolveEventUserId(event),
    resolveEventProjectId(event),
    getOpenCodeSessionId(event),
    String(event?.event_type || event?.event?.type || "user"),
    eventIdentity,
  ].join(":");
  const delivered = deliveredUserConversationTexts.get(dedupeKey) || new Map();
  const next = [];
  const now = Date.now();

  for (const text of texts) {
    const normalized = text.trim();
    const lastDeliveredAt = delivered.get(normalized) || 0;

    if (!normalized || now - lastDeliveredAt < 120000) {
      continue;
    }

    delivered.set(normalized, now);
    next.push(normalized);
  }

  for (const [text, deliveredAt] of delivered) {
    if (now - deliveredAt > 120000) {
      delivered.delete(text);
    }
  }

  deliveredUserConversationTexts.set(dedupeKey, delivered);
  return next;
}

function safeSend(ws, payload) {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      raw += chunk;

      if (raw.length > 5_000_000) {
        reject(new Error("Payload too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

function isLocalRequest(request) {
  const address = request.socket.remoteAddress || "";
  return address === "127.0.0.1" || address === "::1" || address === "::ffff:127.0.0.1";
}

async function authorizeWebSocketRequest(request) {
  if (isLocalRequest(request) || process.env.ATOMS_ALLOW_REMOTE_WS === "true") {
    return true;
  }

  const userId = await identifyUserFromRequest(request);
  return userId !== "anonymous";
}

function createTerminalEnv(userId = "anonymous", projectId = "default") {
  const agentEventBaseDirectory = getAgentEventBaseDirectory();
  const agentEventDirectory = getAgentEventDirectory();
  const atomsUserId = sanitizeFilePart(userId);
  const atomsProjectId = sanitizeFilePart(projectId || "default");
  const userWorkspace = getUserProjectWorkspaceDirectory(userId, atomsProjectId);

  if (process.platform !== "win32") {
    return {
      ...process.env,
      ATOMS_USER_ID: atomsUserId,
      ATOMS_PROJECT_ID: atomsProjectId,
      ATOMS_WORKSPACE_DIR: userWorkspace,
      OPENCODE_EVENT_BASE_DIR: agentEventBaseDirectory,
      OPENCODE_EVENT_DIR: agentEventDirectory,
      OPENCODE_HOOK_PORT: String(port),
    };
  }

  const appDataNpm = path.join(os.homedir(), "AppData", "Roaming", "npm");
  return {
    ...process.env,
    PATH: [appDataNpm, process.env.PATH].filter(Boolean).join(path.delimiter),
    ATOMS_USER_ID: atomsUserId,
    ATOMS_PROJECT_ID: atomsProjectId,
    ATOMS_WORKSPACE_DIR: userWorkspace,
    OPENCODE_EVENT_BASE_DIR: agentEventBaseDirectory,
    OPENCODE_EVENT_DIR: agentEventDirectory,
    OPENCODE_HOOK_PORT: String(port),
  };
}

function bootstrapShell(terminal, userId = "anonymous", projectId = "default") {
  const atomsUserId = sanitizeFilePart(userId).replace(/'/g, "''");
  const atomsProjectId = sanitizeFilePart(projectId || "default").replace(/'/g, "''");
  const userWorkspace = getUserProjectWorkspaceDirectory(userId, projectId).replace(/'/g, "''");

  if (process.platform !== "win32") {
    terminal.write(
      [
        `cd '${userWorkspace}'`,
        `export ATOMS_USER_ID='${atomsUserId}'`,
        `export ATOMS_PROJECT_ID='${atomsProjectId}'`,
        `export ATOMS_WORKSPACE_DIR='${userWorkspace}'`,
        "echo '[atoms terminal] workspace:' \"$(pwd)\"",
        "echo '[atoms terminal] opencode event dir:' \"$OPENCODE_EVENT_DIR\"",
        "echo '[atoms terminal] checking opencode:'",
        "which opencode || true",
        "if command -v opencode >/dev/null 2>&1; then echo '[atoms terminal] starting opencode in workspace only...'; opencode \"$ATOMS_WORKSPACE_DIR\"; else echo '[atoms terminal] opencode was not found on PATH'; fi",
      ].join("\n") + "\n",
    );
    return;
  }

  const appDataNpm = path.join(os.homedir(), "AppData", "Roaming", "npm").replace(/'/g, "''");
  const agentEventBaseDirectory = getAgentEventBaseDirectory().replace(/'/g, "''");
  const agentEventDirectory = getAgentEventDirectory().replace(/'/g, "''");
  const commands = [
    `Set-Location -LiteralPath '${userWorkspace}'`,
    "$machinePath = [Environment]::GetEnvironmentVariable('Path','Machine')",
    "$userPath = [Environment]::GetEnvironmentVariable('Path','User')",
    `$extraPath = '${appDataNpm}'`,
    `$env:OPENCODE_EVENT_BASE_DIR = '${agentEventBaseDirectory}'`,
    `$env:OPENCODE_EVENT_DIR = '${agentEventDirectory}'`,
    `$env:OPENCODE_HOOK_PORT = '${port}'`,
    `$env:ATOMS_USER_ID = '${atomsUserId}'`,
    `$env:ATOMS_PROJECT_ID = '${atomsProjectId}'`,
    `$env:ATOMS_WORKSPACE_DIR = '${userWorkspace}'`,
    "$env:Path = @($machinePath, $userPath, $extraPath, $env:Path) -join ';'",
    "Write-Host '[atoms terminal] workspace:' (Get-Location)",
    "Write-Host '[atoms terminal] opencode event dir:' $env:OPENCODE_EVENT_DIR",
    "Write-Host '[atoms terminal] checking opencode:'",
    "where.exe opencode",
    "if (Get-Command opencode -ErrorAction SilentlyContinue) { Write-Host '[atoms terminal] starting opencode in workspace only...'; opencode $env:ATOMS_WORKSPACE_DIR } else { Write-Host '[atoms terminal] opencode was not found on PATH' }",
  ];

  terminal.write(`${commands.join("; ")}\r\n`);
}

function createOpenCodeJsonExtractor(onAssistantText) {
  let buffer = "";

  return {
    push(data) {
      buffer += stripAnsi(data).replace(/\r/g, "\n");
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();

        if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) {
          continue;
        }

        try {
          const event = JSON.parse(trimmed);
          const texts = extractAssistantText(event);

          for (const text of texts) {
            if (text.trim()) {
              onAssistantText(text.trim());
            }
          }
        } catch {
          // Ignore non-JSON terminal output.
        }
      }

      if (buffer.length > 20000) {
        buffer = buffer.slice(-20000);
      }
    },
  };
}

function stripAnsi(value) {
  return value
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "")
    .replace(/\x1b\][^\x07]*(\x07|\x1b\\)/g, "")
    .replace(/\x1b[=>]/g, "");
}

function extractAssistantText(event) {
  const hookEventName = String(event?.hook_event_name || "").toLowerCase();

  if (hookEventName === "assistantmessage") {
    return collectTextFields(event).filter((text) => !isNoiseText(text));
  }

  if (hookEventName === "opencoderawevent") {
    return extractOpenCodeRawText(event);
  }

  const role = findStringByKey(event, "role") || findStringByKey(event, "author");
  const type = findStringByKey(event, "type") || findStringByKey(event, "event");
  const looksAssistant =
    role?.toLowerCase() === "assistant" ||
    type?.toLowerCase().includes("assistant");

  if (!looksAssistant) {
    return [];
  }

  return collectTextFields(event).filter((text) => !isNoiseText(text));
}

function rememberOpenCodeQuestion(event) {
  const eventType = String(event?.event_type || event?.event?.type || "").toLowerCase();

  if (eventType !== "question.asked") {
    return;
  }

  const properties = event?.event?.properties;
  const requestId = typeof properties?.id === "string" ? properties.id : "";
  const questions = Array.isArray(properties?.questions) ? properties.questions : [];

  if (!requestId || !questions.length) {
    return;
  }

  openCodeQuestions.set(requestId, questions);

  if (openCodeQuestions.size > 200) {
    const stale = Array.from(openCodeQuestions.keys()).slice(0, openCodeQuestions.size - 160);

    for (const key of stale) {
      openCodeQuestions.delete(key);
    }
  }
}

function extractOpenCodeQuestionReplyTexts(event) {
  const eventType = String(event?.event_type || event?.event?.type || "").toLowerCase();

  if (eventType !== "question.replied" && eventType !== "question.answered") {
    return [];
  }

  const properties = event?.event?.properties;
  const answers = Array.isArray(properties?.answers) ? properties.answers : [];

  if (!answers.length) {
    return [];
  }

  const requestId = typeof properties?.requestID === "string" ? properties.requestID : "";
  const questions = requestId ? openCodeQuestions.get(requestId) || [] : [];
  const selections = answers
    .map((answer, index) => formatQuestionAnswer(answer, questions[index]))
    .filter(Boolean);

  if (!selections.length) {
    return [];
  }

  return [`Selected: ${selections.join("; ")}`];
}

function formatQuestionAnswer(answer, question) {
  const values = flattenQuestionAnswerValues(answer);

  if (!values.length) {
    return "";
  }

  const label = String(question?.header || question?.question || "").trim();
  const value = values.join(", ");
  return label ? `${label}: ${value}` : value;
}

function flattenQuestionAnswerValues(value) {
  if (value === null || value === undefined) {
    return [];
  }

  if (Array.isArray(value)) {
    return value.flatMap((item) => flattenQuestionAnswerValues(item));
  }

  if (typeof value === "object") {
    const directValue = value.value ?? value.label ?? value.text ?? value.name ?? value.id;
    return flattenQuestionAnswerValues(directValue);
  }

  const text = String(value).trim();
  return text ? [text] : [];
}

function extractOpenCodeRawText(event) {
  const eventType = String(event?.event_type || event?.event?.type || "").toLowerCase();
  const part = event?.event?.properties?.part;

  if (eventType !== "message.part.updated" || !part || typeof part !== "object") {
    return [];
  }

  if (part.type !== "text" || typeof part.text !== "string") {
    return [];
  }

  if (getOpenCodeMessageRole(part.sessionID, part.messageID) !== "assistant") {
    return [];
  }

  const text = part.text.trim();

  if (!text || isNoiseText(text)) {
    return [];
  }

  return [text];
}

function rememberOpenCodeMessageRole(event) {
  const hookEventName = String(event?.hook_event_name || "").toLowerCase();
  const eventType = String(event?.event_type || event?.event?.type || "").toLowerCase();

  if (hookEventName !== "opencoderawevent" || eventType !== "message.updated") {
    return;
  }

  const info = event?.event?.properties?.info;
  const messageId = typeof info?.id === "string" ? info.id : "";
  const sessionId = typeof info?.sessionID === "string" ? info.sessionID : event?.session_id;
  const role = typeof info?.role === "string" ? info.role.toLowerCase() : "";

  if (!messageId || !sessionId || !role) {
    return;
  }

  openCodeMessageRoles.set(`${sessionId}:${messageId}`, role);

  if (openCodeMessageRoles.size > 1000) {
    const stale = Array.from(openCodeMessageRoles.keys()).slice(0, openCodeMessageRoles.size - 800);

    for (const key of stale) {
      openCodeMessageRoles.delete(key);
    }
  }
}

function getOpenCodeMessageRole(sessionId, messageId) {
  if (!sessionId || !messageId) {
    return "";
  }

  return openCodeMessageRoles.get(`${sessionId}:${messageId}`) || "";
}

function findStringByKey(value, key) {
  if (!value || typeof value !== "object") {
    return "";
  }

  if (typeof value[key] === "string") {
    return value[key];
  }

  for (const child of Object.values(value)) {
    const found = findStringByKey(child, key);

    if (found) {
      return found;
    }
  }

  return "";
}

function collectTextFields(value) {
  const results = [];
  const seen = new Set();
  const keys = new Set(["text", "content", "delta", "message", "output", "summary"]);

  function visit(node, key = "") {
    if (!node) {
      return;
    }

    if (typeof node === "string") {
      if (keys.has(key) && !seen.has(node)) {
        seen.add(node);
        results.push(node);
      }

      return;
    }

    if (Array.isArray(node)) {
      for (const item of node) {
        visit(item);
      }

      return;
    }

    if (typeof node === "object") {
      for (const [childKey, childValue] of Object.entries(node)) {
        visit(childValue, childKey);
      }
    }
  }

  visit(value);
  return results;
}

function isNoiseText(value) {
  const text = value.trim();

  if (!text) {
    return true;
  }

  if (/^(assistant|message|part|delta|text|content)$/i.test(text)) {
    return true;
  }

  return false;
}
