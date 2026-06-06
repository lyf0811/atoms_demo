import { randomUUID } from "crypto";
import { cp, mkdir, readdir, readFile, rm, stat, writeFile } from "fs/promises";
import path from "path";
import { createUserProject, getUserProjectWorkspaceDirectory, sanitizeWorkspaceId } from "@/lib/workspace";

export type MarketProject = {
  id: string;
  name: string;
  description: string;
  ownerUserId: string;
  publishedAt: string;
  codePath: string;
  chatPath: string;
  fileCount: number;
  messageCount: number;
};

type MarketIndex = {
  projects: MarketProject[];
};

type ConversationMessage = {
  id?: string;
  role?: "assistant" | "user";
  content?: string;
  source?: string;
  eventType?: string;
  createdAt?: string;
};

export async function listMarketProjects() {
  const index = await readMarketIndex();
  return index.projects
    .map((project) => ({
      id: project.id,
      name: project.name,
      description: project.description || "",
      publishedAt: project.publishedAt,
      fileCount: project.fileCount,
      messageCount: project.messageCount,
    }))
    .sort((left, right) => new Date(right.publishedAt).getTime() - new Date(left.publishedAt).getTime());
}

export async function publishMarketProject(userId: string, projectId: string, projectName: string, projectDescription = "") {
  const name = normalizeProjectName(projectName);
  const description = normalizeProjectDescription(projectDescription);
  const id = `${Date.now()}-${randomUUID()}`;
  const projectDirectory = path.join(getMarketProjectsDirectory(), id);
  const codeDirectory = path.join(projectDirectory, "code");
  const chatDirectory = path.join(projectDirectory, "chat");
  const workspaceDirectory = getUserProjectWorkspaceDirectory(userId, projectId || "default");

  await mkdir(projectDirectory, { recursive: true });
  await mkdir(chatDirectory, { recursive: true });

  await cp(workspaceDirectory, codeDirectory, {
    recursive: true,
    force: false,
    errorOnExist: false,
    filter: shouldPublishPath,
  });

  const messages = await readUserConversationMessages(userId, projectId);
  await writeFile(path.join(chatDirectory, "messages.json"), `${JSON.stringify({ messages }, null, 2)}\n`, "utf8");

  const project: MarketProject = {
    id,
    name,
    description,
    ownerUserId: userId,
    publishedAt: new Date().toISOString(),
    codePath: path.relative(getMarketDirectory(), codeDirectory).replace(/\\/g, "/"),
    chatPath: path.relative(getMarketDirectory(), chatDirectory).replace(/\\/g, "/"),
    fileCount: await countPublishedFiles(codeDirectory),
    messageCount: messages.length,
  };
  const index = await readMarketIndex();
  index.projects.unshift(project);
  await writeMarketIndex(index);

  return project;
}

export async function applyMarketProjectToNewUserProject(marketProjectId: string, userId: string) {
  const project = await findMarketProject(marketProjectId);

  if (!project) {
    throw new Error("Market project was not found.");
  }

  const userProject = await createUserProject(userId, project.name);
  const result = await copyMarketProjectToUserProject(marketProjectId, userId, userProject.id);

  return {
    ...result,
    userProject,
  };
}

async function copyMarketProjectToUserProject(marketProjectId: string, userId: string, userProjectId: string) {
  const project = await findMarketProject(marketProjectId);

  if (!project) {
    throw new Error("Market project was not found.");
  }

  const projectDirectory = path.join(getMarketProjectsDirectory(), project.id);
  const codeDirectory = path.join(projectDirectory, "code");
  const chatMessagesPath = path.join(projectDirectory, "chat", "messages.json");
  const workspaceDirectory = getUserProjectWorkspaceDirectory(userId, userProjectId || "default");

  await rm(workspaceDirectory, { recursive: true, force: true, maxRetries: 3, retryDelay: 300 });
  await mkdir(workspaceDirectory, { recursive: true });
  await cp(codeDirectory, workspaceDirectory, {
    recursive: true,
    force: true,
    errorOnExist: false,
    filter: shouldPublishPath,
  });

  const messages = await readMarketChatMessages(chatMessagesPath);
  await clearUserConversation(userId, userProjectId || "default");
  await writeUserConversationSnapshot(userId, userProjectId || "default", project.id, messages);

  return {
    id: project.id,
    name: project.name,
    description: project.description || "",
    fileCount: await countPublishedFiles(codeDirectory),
    messageCount: messages.length,
  };
}

async function findMarketProject(projectId: string) {
  const safeProjectId = String(projectId || "").trim();

  if (!safeProjectId || safeProjectId.includes("..") || path.isAbsolute(safeProjectId)) {
    return null;
  }

  const index = await readMarketIndex();
  return index.projects.find((project) => project.id === safeProjectId) || null;
}

function normalizeProjectName(value: string) {
  const name = value.trim().replace(/\s+/g, " ");

  if (name.length < 2) {
    throw new Error("Project name must be at least 2 characters.");
  }

  return name.slice(0, 80);
}

function normalizeProjectDescription(value: string) {
  return value.trim().replace(/\s+/g, " ").slice(0, 300);
}

function getDataDirectory() {
  return path.resolve(process.env.ATOMS_DATA_DIR || path.join(process.cwd(), "data"));
}

function getMarketDirectory() {
  return path.join(getDataDirectory(), "market");
}

function getMarketProjectsDirectory() {
  return path.join(getMarketDirectory(), "projects");
}

function getMarketIndexPath() {
  return path.join(getMarketDirectory(), "projects.json");
}

async function readMarketIndex(): Promise<MarketIndex> {
  try {
    const raw = await readFile(getMarketIndexPath(), "utf8");
    const parsed = JSON.parse(raw) as MarketIndex;
    return { projects: Array.isArray(parsed.projects) ? parsed.projects : [] };
  } catch {
    return { projects: [] };
  }
}

async function writeMarketIndex(index: MarketIndex) {
  await mkdir(getMarketDirectory(), { recursive: true });
  await writeFile(getMarketIndexPath(), `${JSON.stringify(index, null, 2)}\n`, "utf8");
}

function shouldPublishPath(source: string) {
  const parts = source.split(/[\\/]/);
  const blocked = new Set(["node_modules", ".next", ".next-app", ".git", "dist", "out"]);
  return !parts.some((part) => blocked.has(part));
}

async function countPublishedFiles(directory: string): Promise<number> {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    return 0;
  }

  let count = 0;
  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      count += await countPublishedFiles(fullPath);
    } else if (entry.isFile()) {
      count += 1;
    }
  }
  return count;
}

async function readUserConversationMessages(userId: string, projectId = "default") {
  const safeUserId = sanitizeWorkspaceId(userId || "anonymous");
  const userDirectory = path.join(getConversationDirectory(), safeUserId, sanitizeWorkspaceId(projectId || "default"));
  let entries;

  try {
    entries = await readdir(userDirectory, { withFileTypes: true });
  } catch {
    return [];
  }

  const messages: Array<ConversationMessage & { sessionId: string }> = [];
  const files = entries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".json"))
    .map((entry) => path.join(userDirectory, entry.name));

  for (const filePath of files) {
    const sessionId = path.basename(filePath, ".json");
    const conversation = await readConversationFile(filePath);

    for (const message of conversation) {
      if (!message?.content || (message.role !== "user" && message.role !== "assistant")) {
        continue;
      }

      if (message.role === "user" && message.source !== "chat-input") {
        continue;
      }

      messages.push({
        id: String(message.id || `${sessionId}-${messages.length}`),
        sessionId,
        role: message.role,
        content: String(message.content),
        source: String(message.source || "conversation"),
        eventType: String(message.eventType || ""),
        createdAt: String(message.createdAt || ""),
      });
    }
  }

  return messages.sort((left, right) => new Date(left.createdAt || 0).getTime() - new Date(right.createdAt || 0).getTime());
}

async function readConversationFile(filePath: string): Promise<ConversationMessage[]> {
  try {
    const fileStat = await stat(filePath);
    if (!fileStat.isFile()) {
      return [];
    }
    const raw = await readFile(filePath, "utf8");
    const parsed = JSON.parse(raw) as { messages?: ConversationMessage[] };
    return Array.isArray(parsed.messages) ? parsed.messages : [];
  } catch {
    return [];
  }
}

async function readMarketChatMessages(filePath: string) {
  try {
    const raw = await readFile(filePath, "utf8");
    const parsed = JSON.parse(raw) as { messages?: ConversationMessage[] };
    return Array.isArray(parsed.messages) ? parsed.messages : [];
  } catch {
    return [];
  }
}

async function writeUserConversationSnapshot(
  userId: string,
  userProjectId: string,
  marketProjectId: string,
  messages: ConversationMessage[],
) {
  const safeUserId = sanitizeWorkspaceId(userId || "anonymous");
  const safeUserProjectId = sanitizeWorkspaceId(userProjectId || "default");
  const safeMarketProjectId = sanitizeWorkspaceId(marketProjectId || "market-project");
  const userDirectory = path.join(getConversationDirectory(), safeUserId, safeUserProjectId);
  const now = new Date().toISOString();
  const normalizedMessages = messages
    .filter((message) => message?.content && (message.role === "user" || message.role === "assistant"))
    .map((message, index) => ({
      id: `${Date.now()}-${index}-${randomUUID()}`,
      role: message.role,
      content: String(message.content),
      source: message.role === "user" ? "chat-input" : String(message.source || "market"),
      eventType: String(message.eventType || "market-apply"),
      createdAt: now,
    }));

  await mkdir(userDirectory, { recursive: true });
  await writeFile(
    path.join(userDirectory, `market-${safeMarketProjectId}.json`),
    `${JSON.stringify(
      {
        userId: safeUserId,
        sessionId: `market-${safeMarketProjectId}`,
        messages: normalizedMessages,
        createdAt: now,
        updatedAt: now,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
}

async function clearUserConversation(userId: string, userProjectId: string) {
  const safeUserId = sanitizeWorkspaceId(userId || "anonymous");
  const safeUserProjectId = sanitizeWorkspaceId(userProjectId || "default");
  const userDirectory = path.join(getConversationDirectory(), safeUserId, safeUserProjectId);
  await rm(userDirectory, { recursive: true, force: true, maxRetries: 3, retryDelay: 300 });
}

function getConversationDirectory() {
  return path.resolve(
    process.env.OPENCODE_EVENT_BASE_DIR ||
      process.env.OPENCODE_EVENT_DIR ||
      path.join(getDataDirectory(), "opencode-agent-events"),
    "conversations",
  );
}
