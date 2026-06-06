"use client";

import { type FormEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  ChevronRight,
  Code2,
  Copy,
  Download,
  Edit3,
  FileCode2,
  Folder,
  FolderOpen,
  Hammer,
  LogOut,
  MessageSquareText,
  MoreHorizontal,
  PackagePlus,
  Plus,
  RefreshCw,
  Rocket,
  Send,
  Store,
  Terminal,
  Trash2,
  User,
} from "lucide-react";
import type { PreviewState, PublicUser } from "@/lib/types";
import { BrowserPtyTerminal } from "@/components/BrowserPtyTerminal";
import { PreviewApp } from "@/components/PreviewApp";

type BuilderWorkspaceProps = {
  user: PublicUser;
};

const starterPreview: PreviewState = {
  appName: "Atoms Demo",
  appType: "Agent Builder",
  theme: "light",
  accent: "#2563eb",
  layout: "dashboard",
  headline: "Describe an app and the agent turns it into a live demo",
  subhead: "Use the local terminal on the left to interact with the agent directly.",
  modules: ["Terminal", "Agent", "Files", "Preview"],
  status: "idle",
};

type WorkspaceFileEntry = {
  name: string;
  path: string;
  type: "file" | "directory";
  language: string;
};

type FileTreeNode = {
  name: string;
  path: string;
  type: "file" | "directory";
  language: string;
  children: FileTreeNode[];
};

type MarketProjectCard = {
  id: string;
  name: string;
  description: string;
  publishedAt: string;
  fileCount?: number;
  messageCount?: number;
};

type UserProject = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
};

type FileTreeNodesProps = {
  nodes: FileTreeNode[];
  expandedDirs: Set<string>;
  selectedPath: string;
  onToggleDir: (dirPath: string) => void;
  onSelectFile: (filePath: string) => void;
  openActionsPath: string;
  renamingPath: string;
  renameFileName: string;
  fileActionError: string;
  onOpenActions: (filePath: string) => void;
  onCloseActions: () => void;
  onDownloadFile: (filePath: string) => void;
  onDeleteFile: (filePath: string) => void;
  onStartRename: (filePath: string) => void;
  onRenameNameChange: (name: string) => void;
  onSubmitRename: (event: FormEvent<HTMLFormElement>, filePath: string) => void;
  onCancelRename: () => void;
  level?: number;
};

function FileTreeNodes({
  nodes,
  expandedDirs,
  selectedPath,
  onToggleDir,
  onSelectFile,
  openActionsPath,
  renamingPath,
  renameFileName,
  fileActionError,
  onOpenActions,
  onCloseActions,
  onDownloadFile,
  onDeleteFile,
  onStartRename,
  onRenameNameChange,
  onSubmitRename,
  onCancelRename,
  level = 0,
}: FileTreeNodesProps) {
  return (
    <>
      {nodes.map((node) => (
        <div className="file-tree-node" key={node.path}>
          <button
            className={`file-tree-item file-tree-main ${node.path === selectedPath ? "active" : ""}`}
            style={{ paddingLeft: `${level * 16 + 8}px` }}
            onClick={() => {
              if (node.type === "directory") {
                onToggleDir(node.path);
              } else {
                onSelectFile(node.path);
              }
            }}
          >
            {node.type === "directory" ? (
              expandedDirs.has(node.path) ? <FolderOpen size={15} /> : <Folder size={15} />
            ) : (
              <FileCode2 size={15} />
            )}
            <span className={node.type === "directory" ? "file-tree-dir" : ""}>{node.name}</span>
            {node.type === "directory" && (
              <ChevronRight
                size={14}
                className={`file-tree-chevron ${expandedDirs.has(node.path) ? "expanded" : ""}`}
              />
            )}
          </button>
          {node.type === "file" && (
            <button
              className="file-action-trigger"
              type="button"
              title="File actions"
              onClick={(event) => {
                event.stopPropagation();
                onOpenActions(openActionsPath === node.path ? "" : node.path);
              }}
            >
              <MoreHorizontal size={15} />
            </button>
          )}
          {node.type === "file" && openActionsPath === node.path && (
            <div className="file-action-panel">
              {renamingPath === node.path ? (
                <form onSubmit={(event) => onSubmitRename(event, node.path)}>
                  <input
                    autoFocus
                    value={renameFileName}
                    onChange={(event) => onRenameNameChange(event.target.value)}
                    placeholder="New file name"
                  />
                  <div className="file-action-row">
                    <button type="submit" disabled={!renameFileName.trim()}>
                      保存
                    </button>
                    <button type="button" onClick={onCancelRename}>
                      取消
                    </button>
                  </div>
                </form>
              ) : (
                <>
                  <button type="button" onClick={() => onDownloadFile(node.path)}>
                    <Download size={14} />
                    <span>下载</span>
                  </button>
                  <button type="button" onClick={() => onStartRename(node.path)}>
                    <Edit3 size={14} />
                    <span>重命名</span>
                  </button>
                  <button type="button" className="danger" onClick={() => onDeleteFile(node.path)}>
                    <Trash2 size={14} />
                    <span>删除</span>
                  </button>
                </>
              )}
              {fileActionError && <p>{fileActionError}</p>}
              <button className="file-action-close" type="button" onClick={onCloseActions}>
                关闭
              </button>
            </div>
          )}
          {node.type === "directory" && expandedDirs.has(node.path) && node.children.length > 0 && (
            <FileTreeNodes
              nodes={node.children}
              expandedDirs={expandedDirs}
              selectedPath={selectedPath}
              onToggleDir={onToggleDir}
              onSelectFile={onSelectFile}
              openActionsPath={openActionsPath}
              renamingPath={renamingPath}
              renameFileName={renameFileName}
              fileActionError={fileActionError}
              onOpenActions={onOpenActions}
              onCloseActions={onCloseActions}
              onDownloadFile={onDownloadFile}
              onDeleteFile={onDeleteFile}
              onStartRename={onStartRename}
              onRenameNameChange={onRenameNameChange}
              onSubmitRename={onSubmitRename}
              onCancelRename={onCancelRename}
              level={level + 1}
            />
          )}
        </div>
      ))}
    </>
  );
}

function buildFileTree(entries: WorkspaceFileEntry[]): FileTreeNode[] {
  const root: FileTreeNode = { name: "", path: "", type: "directory", language: "", children: [] };

  for (const entry of entries) {
    const parts = entry.path.split("/");
    let current = root;

    for (let i = 0; i < parts.length; i++) {
      const partName = parts[i];
      const isLast = i === parts.length - 1;
      const existing = current.children.find((c) => c.name === partName);

      if (existing) {
        current = existing;
      } else {
        const childPath = parts.slice(0, i + 1).join("/");
        const child: FileTreeNode = {
          name: partName,
          path: childPath,
          type: isLast ? entry.type : "directory",
          language: isLast ? entry.language : "",
          children: [],
        };
        current.children.push(child);
        current = child;
      }
    }
  }

  function sortNodes(node: FileTreeNode): FileTreeNode {
    const sorted = [...node.children].sort((a, b) => {
      if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    return { ...node, children: sorted.map(sortNodes) };
  }

  return sortNodes(root).children;
}

export function BuilderWorkspace({ user }: BuilderWorkspaceProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"builder" | "terminal" | "market">("builder");
  const [terminalMessages, setTerminalMessages] = useState<TerminalConversationMessage[]>([]);
  const [hookStatus, setHookStatus] = useState<"connecting" | "connected" | "closed">("connecting");
  const [isChatReady, setIsChatReady] = useState(false);
  const isOpenCodeConnected = hookStatus === "connected" && isChatReady;
  const isChatLoading = hookStatus === "connecting" || (hookStatus === "connected" && !isChatReady);
  const chatLoadingTitle = hookStatus === "connecting" ? "Agent is starting" : "Agent is getting ready";
  const chatLoadingText =
    hookStatus === "connecting"
      ? "Connecting terminal and opening the agent session."
      : "Chat input will be available in a few seconds.";
  const [projects, setProjects] = useState<UserProject[]>([]);
  const [activeProjectId, setActiveProjectId] = useState("default");
  const [isProjectsCollapsed, setIsProjectsCollapsed] = useState(false);
  const [terminalResetKey, setTerminalResetKey] = useState(0);
  const [directPrompt, setDirectPrompt] = useState("");
  const lastAssistantMessageRef = useRef<{ id: string; at: number } | null>(null);
  const conversationFeedRef = useRef<HTMLDivElement>(null);
  const [workspaceFiles, setWorkspaceFiles] = useState<WorkspaceFileEntry[]>([]);
  const [fileTree, setFileTree] = useState<FileTreeNode[]>([]);
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set());
  const [selectedPath, setSelectedPath] = useState("");
  const [selectedFileContent, setSelectedFileContent] = useState<string | null>(null);
  const [selectedFileLanguage, setSelectedFileLanguage] = useState("");
  const [isCodeCopied, setIsCodeCopied] = useState(false);
  const [openFileActionsPath, setOpenFileActionsPath] = useState("");
  const [renamingFilePath, setRenamingFilePath] = useState("");
  const [renameFileName, setRenameFileName] = useState("");
  const [fileActionError, setFileActionError] = useState("");
  const selectedPathRef = useRef("");
  const [preview] = useState<PreviewState>(starterPreview);
  const [activeViewTab, setActiveViewTab] = useState<"code" | "preview">("code");
  const [previewBootStatus, setPreviewBootStatus] = useState<"idle" | "starting" | "ready" | "error">("idle");
  const [previewBootLogs, setPreviewBootLogs] = useState<string[]>([]);
  const [previewReloadKey, setPreviewReloadKey] = useState(0);
  const previewBootStartedRef = useRef(false);
  const previewRequestAbortRef = useRef<AbortController | null>(null);
  const chatReadyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [marketProjects, setMarketProjects] = useState<MarketProjectCard[]>([]);
  const [isPublishDialogOpen, setIsPublishDialogOpen] = useState(false);
  const [publishName, setPublishName] = useState("");
  const [publishDescription, setPublishDescription] = useState("");
  const [publishStatus, setPublishStatus] = useState<"idle" | "publishing" | "error">("idle");
  const [publishError, setPublishError] = useState("");
  const [applyingProjectId, setApplyingProjectId] = useState("");
  const [selectedMarketProject, setSelectedMarketProject] = useState<MarketProjectCard | null>(null);
  const [marketApplyError, setMarketApplyError] = useState("");
  const [isCreateProjectDialogOpen, setIsCreateProjectDialogOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectError, setNewProjectError] = useState("");
  const [isCreatingProject, setIsCreatingProject] = useState(false);
  const [deletingProjectIds, setDeletingProjectIds] = useState<Set<string>>(new Set());
  const [isExportingCode, setIsExportingCode] = useState(false);

  async function loadProjects() {
    try {
      const response = await fetch("/api/projects", { cache: "no-store" });
      if (!response.ok) {
        return;
      }
      const data = (await response.json()) as { projects?: UserProject[] };
      const nextProjects = data.projects || [];
      setProjects(nextProjects);
      if (nextProjects.length && !nextProjects.some((project) => project.id === activeProjectId)) {
        setActiveProjectId(nextProjects[0].id);
      }
    } catch {
      // Project list is best-effort.
    }
  }

  function openCreateProjectDialog() {
    setNewProjectName("");
    setNewProjectError("");
    setIsCreatingProject(false);
    setIsCreateProjectDialogOpen(true);
  }

  async function createProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = newProjectName.trim();

    if (!name || isCreatingProject) {
      return;
    }

    setIsCreatingProject(true);
    setNewProjectError("");

    try {
      const response = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = (await response.json().catch(() => ({}))) as { project?: UserProject; error?: string };

      if (!response.ok || !data.project) {
        throw new Error(data.error || "Could not create project.");
      }

      await loadProjects();
      setActiveProjectId(data.project.id);
      setIsCreateProjectDialogOpen(false);
      setNewProjectName("");
    } catch (error) {
      setNewProjectError(error instanceof Error ? error.message : "Could not create project.");
    } finally {
      setIsCreatingProject(false);
    }
  }
  async function deleteProject(project: UserProject) {
    if (deletingProjectIds.has(project.id)) {
      return;
    }

    const confirmed = window.confirm(`确定删除「${project.name}」吗？该项目的代码和聊天记录会被删除。`);

    if (!confirmed) {
      return;
    }

    setDeletingProjectIds((current) => new Set(current).add(project.id));

    try {
      const fallbackProject = projects.find((candidate) => candidate.id !== project.id);

      if (activeProjectId === project.id) {
        if (!fallbackProject) {
          throw new Error("At least one project is required.");
        }

        stopPreviewStartup();
        setActiveProjectId(fallbackProject.id);
        setActiveViewTab("code");
        setSelectedPath("");
        selectedPathRef.current = "";
        setSelectedFileContent(null);
        setWorkspaceFiles([]);
        setFileTree([]);
        setTerminalMessages([]);
        setHookStatus("connecting");
        setPreviewBootStatus("idle");
        setPreviewBootLogs([]);
        previewBootStartedRef.current = false;
        await new Promise((resolve) => setTimeout(resolve, 1200));
      }

      const response = await fetch(`/api/projects/${encodeURIComponent(project.id)}`, { method: "DELETE" });
      const data = (await response.json().catch(() => ({}))) as { fallbackProject?: UserProject; error?: string };

      if (!response.ok) {
        throw new Error(data.error || "Could not delete project.");
      }

      setProjects((current) => current.filter((candidate) => candidate.id !== project.id));
      await loadProjects();
      if (activeProjectId === project.id && data.fallbackProject) {
        setActiveProjectId(data.fallbackProject.id);
      }
    } catch (error) {
      setDeletingProjectIds((current) => {
        const next = new Set(current);
        next.delete(project.id);
        return next;
      });
      window.alert(error instanceof Error ? error.message : "Could not delete project.");
    }
  }

  async function loadWorkspaceFiles(projectId = activeProjectId) {
    try {
      const response = await fetch(`/api/workspace/files?projectId=${encodeURIComponent(projectId)}`, { cache: "no-store" });
      if (!response.ok) return;
      const data = (await response.json()) as { files?: WorkspaceFileEntry[] };
      const files = data.files || [];
      setWorkspaceFiles(files);
      const tree = buildFileTree(files);
      setFileTree(tree);
      if (openFileActionsPath && !files.find((file) => file.path === openFileActionsPath)) {
        closeFileActions();
      }
      if (tree.length) {
        const allDirs = files.filter((f) => f.type === "directory").map((f) => f.path);
        setExpandedDirs((prev) => {
          const next = new Set(prev);
          for (const d of allDirs) next.add(d);
          return next;
        });
        if (!files.find((f) => f.path === selectedPathRef.current)) {
          const firstFile = files.find((f) => f.type === "file");
          if (firstFile) {
            setSelectedPath(firstFile.path);
          }
        }
      }
    } catch {
      // best-effort
    }
  }

  async function loadFileContent(filePath: string, projectId = activeProjectId) {
    setIsCodeCopied(false);
    setSelectedFileContent(null);
    try {
      const response = await fetch(
        `/api/workspace/read?projectId=${encodeURIComponent(projectId)}&path=${encodeURIComponent(filePath)}`,
        { cache: "no-store" },
      );
      if (!response.ok) {
        setSelectedFileContent("");
        return;
      }
      const data = (await response.json()) as { content?: string; path?: string };
      setSelectedFileContent(data.content ?? "");
    } catch {
      setSelectedFileContent("");
    }
  }

  async function loadConversationHistory(projectId = activeProjectId) {
    try {
      const response = await fetch(`/api/agent-events/conversation?projectId=${encodeURIComponent(projectId)}`, { cache: "no-store" });

      if (!response.ok) {
        return;
      }

      const data = (await response.json()) as { messages?: StoredConversationMessage[] };
      const messages = (data.messages || [])
        .map(mapStoredConversationMessage)
        .filter((message): message is TerminalConversationMessage => Boolean(message));

      lastAssistantMessageRef.current = null;
      setTerminalMessages(messages.slice(-80));
    } catch {
      // History is best-effort; live terminal output still works.
    }
  }

  useEffect(() => {
    selectedPathRef.current = selectedPath;
  }, [selectedPath]);

  useEffect(() => {
    if (!selectedPath) {
      setSelectedFileContent(null);
      return;
    }

    void loadFileContent(selectedPath, activeProjectId);
  }, [selectedPath, activeProjectId]);

  useEffect(() => {
    void loadProjects();
  }, [user.id]);

  useEffect(() => {
    if (chatReadyTimerRef.current) {
      clearTimeout(chatReadyTimerRef.current);
      chatReadyTimerRef.current = null;
    }
    setIsChatReady(false);
    stopPreviewStartup();
    setSelectedPath("");
    selectedPathRef.current = "";
    setSelectedFileContent(null);
    setIsCodeCopied(false);
    closeFileActions();
    setWorkspaceFiles([]);
    setFileTree([]);
    setTerminalMessages([]);
    setHookStatus("connecting");
    setActiveViewTab("code");
    setPreviewBootStatus("idle");
    setPreviewBootLogs([]);
    previewBootStartedRef.current = false;
    void loadWorkspaceFiles(activeProjectId);
    void loadMarketProjects();
    void loadConversationHistory(activeProjectId);
  }, [user.id, activeProjectId]);

  useEffect(() => {
    return () => {
      if (chatReadyTimerRef.current) {
        clearTimeout(chatReadyTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      void loadWorkspaceFiles(activeProjectId);
    }, 10_000);

    return () => window.clearInterval(intervalId);
  }, [user.id, activeProjectId]);

  function toggleDir(dirPath: string) {
    setExpandedDirs((prev) => {
      const next = new Set(prev);
      if (next.has(dirPath)) {
        next.delete(dirPath);
      } else {
        next.add(dirPath);
      }
      return next;
    });
  }

  useEffect(() => {
    const feed = conversationFeedRef.current;

    if (!feed) {
      return;
    }

    feed.scrollTop = feed.scrollHeight;
  }, [terminalMessages.length, isChatLoading]);

  useEffect(() => {
    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    const socket = new WebSocket(`${protocol}://${window.location.host}/api/agent-events?projectId=${encodeURIComponent(activeProjectId)}`);

    socket.addEventListener("message", (event) => {
      try {
        const payload = JSON.parse(event.data) as {
          type?: string;
          texts?: string[];
          data?: string;
          debug?: AgentHookDebug;
        };

        if (payload.type === "status") {
          return;
        }

        const incomingTexts = payload.texts?.length ? payload.texts : payload.debug?.textPreview || [];

        if (incomingTexts.length) {
          appendAgentMessages(incomingTexts, payload.debug);
        }
      } catch {
        // Ignore non-hook websocket frames.
      }
    });

    return () => socket.close();
  }, [activeProjectId]);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  async function loadMarketProjects() {
    try {
      const response = await fetch("/api/market/projects", { cache: "no-store" });
      if (!response.ok) {
        return;
      }
      const data = (await response.json()) as { projects?: MarketProjectCard[] };
      setMarketProjects(data.projects || []);
    } catch {
      // Market listing is best-effort.
    }
  }

  function openPublishDialog() {
    setPublishName("");
    setPublishDescription("");
    setPublishError("");
    setPublishStatus("idle");
    setIsPublishDialogOpen(true);
  }

  async function publishToMarket(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = publishName.trim();

    if (!name || publishStatus === "publishing") {
      return;
    }

    setPublishStatus("publishing");
    setPublishError("");

    try {
      const response = await fetch("/api/market/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description: publishDescription, projectId: activeProjectId }),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || "Could not publish project.");
      }

      setIsPublishDialogOpen(false);
      setPublishName("");
      setPublishDescription("");
      setPublishStatus("idle");
      await loadMarketProjects();
      setActiveTab("market");
    } catch (error) {
      setPublishStatus("error");
      setPublishError(error instanceof Error ? error.message : "Could not publish project.");
    }
  }

  function openMarketApplyDialog(project: MarketProjectCard) {
    setSelectedMarketProject(project);
    setMarketApplyError("");
  }

  async function exportWorkspaceCode() {
    if (isExportingCode) {
      return;
    }

    setIsExportingCode(true);

    try {
      const response = await fetch(`/api/workspace/export?projectId=${encodeURIComponent(activeProjectId)}`, {
        cache: "no-store",
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || "Could not export code.");
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      const activeProject = projects.find((project) => project.id === activeProjectId);
      link.href = url;
      link.download = `${safeDownloadName(activeProject?.name || "project-code")}.zip`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Could not export code.");
    } finally {
      setIsExportingCode(false);
    }
  }

  async function copySelectedFileContent() {
    if (selectedFileContent === null) {
      return;
    }

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(selectedFileContent);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = selectedFileContent;
        textarea.setAttribute("readonly", "");
        textarea.style.position = "fixed";
        textarea.style.left = "-9999px";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        textarea.remove();
      }

      setIsCodeCopied(true);
      window.setTimeout(() => setIsCodeCopied(false), 1400);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Could not copy file content.");
    }
  }

  function openFileActions(filePath: string) {
    setOpenFileActionsPath(filePath);
    setRenamingFilePath("");
    setRenameFileName("");
    setFileActionError("");
  }

  function closeFileActions() {
    setOpenFileActionsPath("");
    setRenamingFilePath("");
    setRenameFileName("");
    setFileActionError("");
  }

  async function downloadWorkspaceFile(filePath: string) {
    try {
      const response = await fetch(
        `/api/workspace/file?projectId=${encodeURIComponent(activeProjectId)}&path=${encodeURIComponent(filePath)}`,
        { cache: "no-store" },
      );

      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || "Could not download file.");
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filePath.split("/").pop() || "download";
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      closeFileActions();
    } catch (error) {
      setFileActionError(error instanceof Error ? error.message : "Could not download file.");
    }
  }

  function startRenameWorkspaceFile(filePath: string) {
    setRenamingFilePath(filePath);
    setRenameFileName(filePath.split("/").pop() || "");
    setFileActionError("");
  }

  async function renameWorkspaceFile(event: FormEvent<HTMLFormElement>, filePath: string) {
    event.preventDefault();
    const name = renameFileName.trim();

    if (!name) {
      return;
    }

    try {
      const response = await fetch(
        `/api/workspace/file?projectId=${encodeURIComponent(activeProjectId)}&path=${encodeURIComponent(filePath)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name }),
        },
      );
      const data = (await response.json().catch(() => ({}))) as { path?: string; error?: string };

      if (!response.ok || !data.path) {
        throw new Error(data.error || "Could not rename file.");
      }

      closeFileActions();
      if (selectedPath === filePath) {
        setSelectedPath(data.path);
      }
      await loadWorkspaceFiles(activeProjectId);
    } catch (error) {
      setFileActionError(error instanceof Error ? error.message : "Could not rename file.");
    }
  }

  async function deleteWorkspaceFile(filePath: string) {
    const confirmed = window.confirm(`确定删除「${filePath}」吗？`);

    if (!confirmed) {
      return;
    }

    try {
      const response = await fetch(
        `/api/workspace/file?projectId=${encodeURIComponent(activeProjectId)}&path=${encodeURIComponent(filePath)}`,
        { method: "DELETE" },
      );

      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || "Could not delete file.");
      }

      closeFileActions();
      if (selectedPath === filePath) {
        setSelectedPath("");
        selectedPathRef.current = "";
        setSelectedFileContent(null);
      }
      await loadWorkspaceFiles(activeProjectId);
    } catch (error) {
      setFileActionError(error instanceof Error ? error.message : "Could not delete file.");
    }
  }

  async function applyMarketProject() {
    const project = selectedMarketProject;

    if (!project || applyingProjectId) {
      return;
    }

    setApplyingProjectId(project.id);
    setMarketApplyError("");

    try {
      const response = await fetch(`/api/market/projects/${encodeURIComponent(project.id)}/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || "Could not apply market project.");
      }

      const data = (await response.json().catch(() => ({}))) as { userProject?: UserProject };
      const nextActiveProjectId = data.userProject?.id || activeProjectId;

      setSelectedMarketProject(null);
      setSelectedPath("");
      selectedPathRef.current = "";
      setSelectedFileContent(null);
      setActiveProjectId(nextActiveProjectId);
      setTerminalResetKey((key) => key + 1);
      setActiveViewTab("code");
      setPreviewBootStatus("idle");
      setPreviewBootLogs([]);
      previewBootStartedRef.current = false;
      await loadProjects();
      await loadWorkspaceFiles(nextActiveProjectId);
      await loadConversationHistory(nextActiveProjectId);
      setActiveTab("builder");
    } catch (error) {
      setMarketApplyError(error instanceof Error ? error.message : "Could not apply market project.");
    } finally {
      setApplyingProjectId("");
    }
  }

  function appendAgentMessages(texts: string[], debug?: AgentHookDebug) {
    const nextMessages = texts
      .map((text) => text.trim())
      .filter(Boolean)
      .map((content) => {
        const category = classifyAgentMessage(content, debug);
        return {
          id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          role: "assistant" as const,
          category,
          label: getAgentMessageLabel(category, debug),
          content,
        };
      });

    if (!nextMessages.length) {
      return;
    }

    lastAssistantMessageRef.current = null;
    setTerminalMessages((current) => mergeConversationMessages(current, nextMessages).slice(-80));
  }

  function sendDirectOpenCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const message = directPrompt.trim();

    if (!message || !isOpenCodeConnected) {
      return;
    }

    setDirectPrompt("");
    appendUserMessage(message);
    window.dispatchEvent(new CustomEvent("atoms-terminal-input", { detail: { data: `${message}\r` } }));
    lastAssistantMessageRef.current = null;
  }

  async function openPreviewTab() {
    setActiveViewTab("preview");

    if (previewBootStartedRef.current) {
      return;
    }

    await startPreview(false);
  }

  async function reloadPreview() {
    await startPreview(true);
  }

  function stopPreviewStartup() {
    previewRequestAbortRef.current?.abort();
    previewRequestAbortRef.current = null;
    previewBootStartedRef.current = false;
  }

  async function startPreview(restart: boolean) {
    previewRequestAbortRef.current?.abort();
    const abortController = new AbortController();
    previewRequestAbortRef.current = abortController;
    previewBootStartedRef.current = true;
    setPreviewBootStatus("starting");
    setPreviewBootLogs([]);

    try {
      const response = await fetch("/api/preview/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: abortController.signal,
        body: JSON.stringify({ path: selectedPath, restart, projectId: activeProjectId }),
      });

      if (!response.ok || !response.body) {
        throw new Error(await readPreviewError(response));
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const blocks = buffer.split("\n\n");
        buffer = blocks.pop() || "";

        for (const block of blocks) {
          const event = parsePreviewEvent(block);

          if (!event) {
            continue;
          }

          if (event.event === "log" && event.payload.content) {
            const message = event.payload.content;
            setPreviewBootLogs((logs) => [...logs, message].slice(-80));
          }

          if (event.event === "ready") {
            setPreviewBootStatus("ready");
            setPreviewReloadKey((key) => key + 1);
          }

          if (event.event === "error") {
            const message = event.payload.content || "Preview failed to start.";
            setPreviewBootStatus("error");
            previewBootStartedRef.current = false;
            setPreviewBootLogs((logs) => [...logs, message].slice(-80));
          }
        }
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        setPreviewBootStatus("idle");
        setPreviewBootLogs([]);
        return;
      }

      setPreviewBootStatus("error");
      previewBootStartedRef.current = false;
      setPreviewBootLogs((logs) => [
        ...logs,
        error instanceof Error ? error.message : "Could not start preview.",
      ].slice(-80));
    } finally {
      if (previewRequestAbortRef.current === abortController) {
        previewRequestAbortRef.current = null;
      }
    }
  }

  function appendUserMessage(content: string) {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setTerminalMessages((current) =>
      mergeConversationMessages(current, [
        {
          id,
          role: "user" as const,
          category: "user" as const,
          label: "You",
          content,
          createdAt: Date.now(),
          isPending: true,
        },
      ]).slice(-80),
    );
  }

  function handleAssistantOutput(data: string, category: AgentMessageCategory = "assistant", label = "Model") {
    const content = data.trim();

    if (!content) {
      return;
    }

    setTerminalMessages((current) => {
      const now = Date.now();
      const last = lastAssistantMessageRef.current;
      const shouldAppend = Boolean(last && now - last.at < 1800);

      if (shouldAppend && last) {
        lastAssistantMessageRef.current = { id: last.id, at: now };
        return current
          .map((message) =>
            message.id === last.id
              ? {
                  ...message,
                  content: `${message.content}${message.content.endsWith("\n") ? "" : "\n"}${content}`,
                }
              : message,
          )
          .slice(-80);
      }

      const id = `${now}-${Math.random().toString(36).slice(2)}`;
      lastAssistantMessageRef.current = { id, at: now };
      const next = mergeConversationMessages(current, [{ id, role: "assistant" as const, content, category, label }]);

      return next.slice(-80);
    });
  }

  return (
    <main className="tabbed-workspace">
      <header className="app-tabs">
        <div>
          <p className="eyebrow">Atoms Demo</p>
          <h1>
            {activeTab === "builder"
              ? "Builder Workspace"
              : activeTab === "terminal"
                ? "Local Browser Terminal"
                : "Market"}
          </h1>
        </div>
        <nav aria-label="Workspace tabs">
          <button className={activeTab === "builder" ? "active" : ""} onClick={() => setActiveTab("builder")}>
            Builder
          </button>
          <button className={activeTab === "terminal" ? "active" : ""} onClick={() => setActiveTab("terminal")}>
            Terminal
          </button>
          <button className={activeTab === "market" ? "active" : ""} onClick={() => void (setActiveTab("market"), loadMarketProjects())}>
            Market
          </button>
        </nav>
        <div className="tab-user-actions">
          <div className="user-chip">
            <User size={16} />
            <span>{user.name}</span>
          </div>
          <button className="icon-button" title="Logout" onClick={logout}>
            <LogOut size={18} />
          </button>
        </div>
      </header>

      <section className={`workspace-tab-panel ${activeTab === "builder" ? "active" : ""}`} aria-hidden={activeTab !== "builder"}>
        <section className="workspace-page builder-tab-page">
          <aside className="builder-sidebar">
            <section className={`project-switcher ${isProjectsCollapsed ? "collapsed" : ""}`} aria-label="Projects">
              <div className="section-heading">
                <button
                  className="project-collapse-button"
                  type="button"
                  title={isProjectsCollapsed ? "Expand projects" : "Collapse projects"}
                  aria-expanded={!isProjectsCollapsed}
                  onClick={() => setIsProjectsCollapsed((value) => !value)}
                >
                  <ChevronRight size={14} />
                </button>
                <Folder size={17} />
                <span>Projects</span>
                <button className="project-icon-button" type="button" title="New project" onClick={openCreateProjectDialog}>
                  <Plus size={14} />
                </button>
              </div>
              <div className="project-list" aria-hidden={isProjectsCollapsed}>
                {projects.map((project) => {
                  const isDeleting = deletingProjectIds.has(project.id);

                  return (
                    <div
                      className={`project-item ${project.id === activeProjectId ? "active" : ""} ${isDeleting ? "deleting" : ""}`}
                      key={project.id}
                    >
                      <button type="button" disabled={isDeleting} onClick={() => setActiveProjectId(project.id)}>
                        <span>{project.name}</span>
                        {isDeleting && <small>Deleting...</small>}
                      </button>
                      <button
                        className="project-delete-button"
                        type="button"
                        title={isDeleting ? "Deleting project" : "Delete project"}
                        disabled={projects.length <= 1 || isDeleting}
                        onClick={() => void deleteProject(project)}
                      >
                        {isDeleting ? <RefreshCw size={13} className="spin" /> : <Trash2 size={13} />}
                      </button>
                    </div>
                  );
                })}
              </div>
            </section>
            <section className="terminal-conversation">
              <div className="section-heading">
                <Terminal size={17} />
                <span>Chat</span>
                <small className={`hook-status hook-status-${hookStatus === "connected" && !isChatReady ? "warming" : hookStatus}`}>
                  {hookStatus === "connected" && !isChatReady ? "warming up" : hookStatus}
                </small>
              </div>
              <div className="conversation-feed" ref={conversationFeedRef}>
                {terminalMessages.length ? (
                  terminalMessages.map((message) => (
                    <article
                      className={`conversation-bubble conversation-bubble-${message.category} conversation-bubble-${message.role}`}
                      key={message.id}
                    >
                      <div className="conversation-bubble-meta">
                        {message.role === "user" ? (
                          <User size={13} />
                        ) : message.category === "assistant" ? (
                          <MessageSquareText size={13} />
                        ) : message.category === "tool" ? (
                          <Hammer size={13} />
                        ) : message.category === "error" ? (
                          <Terminal size={13} />
                        ) : (
                          <Check size={13} />
                        )}
                        <span>{message.label}</span>
                      </div>
                      {message.content}
                    </article>
                  ))
                ) : !isChatLoading ? (
                  <p className="conversation-empty">
                    The agent is starting in the terminal. Chat will be available when it is ready.
                  </p>
                ) : null}
              </div>
              <form className="opencode-direct-form" onSubmit={sendDirectOpenCode}>
                <div className="opencode-input-shell">
                  <textarea
                    value={directPrompt}
                    onChange={(event) => setDirectPrompt(event.target.value)}
                    placeholder={isOpenCodeConnected ? "Type a message" : ""}
                    disabled={!isOpenCodeConnected}
                    rows={3}
                  />
                  {isChatLoading && (
                    <div className="chat-warmup" role="status" aria-live="polite">
                      <RefreshCw size={15} className="spin" />
                      <div>
                        <strong>{chatLoadingTitle}</strong>
                        <span>{chatLoadingText}</span>
                      </div>
                    </div>
                  )}
                  {!isChatLoading && !isOpenCodeConnected && (
                    <div className="chat-warmup chat-warmup-static" role="status" aria-live="polite">
                      <Terminal size={15} />
                      <div>
                        <strong>Waiting for agent</strong>
                        <span>Chat input will unlock after the terminal is connected.</span>
                      </div>
                    </div>
                  )}
                </div>
                <button type="submit" disabled={!isOpenCodeConnected || !directPrompt.trim()} title="Send message">
                  <Send size={16} />
                </button>
              </form>
            </section>
          </aside>

          <section className="workspace-main">
        <div className="workspace-header workspace-header-compact">
          <div className="workspace-header-actions">
            <div className="work-view-tabs" role="tablist" aria-label="Build surface view">
              <button
                type="button"
                role="tab"
                aria-selected={activeViewTab === "code"}
                className={activeViewTab === "code" ? "active" : ""}
                onClick={() => setActiveViewTab("code")}
              >
                <Code2 size={15} />
                <span>Code</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeViewTab === "preview"}
                className={activeViewTab === "preview" ? "active" : ""}
                onClick={() => void openPreviewTab()}
              >
                <Rocket size={15} />
                <span>Preview</span>
              </button>
            </div>
          </div>
        </div>

        <div className="work-grid">
          {activeViewTab === "code" && (
          <section className="code-surface active">
            <div className="panel-header">
              <div className="section-heading">
                <Code2 size={17} />
                <span>Code</span>
              </div>
              <button
                className="publish-button"
                type="button"
                onClick={openPublishDialog}
              >
                <PackagePlus size={14} />
                <span>发布至市场</span>
              </button>
              <button
                className="publish-button"
                type="button"
                disabled={isExportingCode || workspaceFiles.filter((f) => f.type === "file").length === 0}
                onClick={() => void exportWorkspaceCode()}
              >
                {isExportingCode ? <RefreshCw size={14} className="spin" /> : <Download size={14} />}
                <span>{isExportingCode ? "导出中..." : "导出代码"}</span>
              </button>
              <button
                className="icon-button"
                title="Refresh files"
                onClick={() => void loadWorkspaceFiles(activeProjectId)}
              >
                <RefreshCw size={14} />
              </button>
              <span className="muted-label">{workspaceFiles.filter((f) => f.type === "file").length} files</span>
            </div>
            <div className="code-layout">
              <nav className="file-tree" aria-label="Workspace files">
                {fileTree.length ? (
                  <FileTreeNodes
                    nodes={fileTree}
                    expandedDirs={expandedDirs}
                    selectedPath={selectedPath}
                    onToggleDir={toggleDir}
                    onSelectFile={setSelectedPath}
                    openActionsPath={openFileActionsPath}
                    renamingPath={renamingFilePath}
                    renameFileName={renameFileName}
                    fileActionError={fileActionError}
                    onOpenActions={openFileActions}
                    onCloseActions={closeFileActions}
                    onDownloadFile={(filePath) => void downloadWorkspaceFile(filePath)}
                    onDeleteFile={(filePath) => void deleteWorkspaceFile(filePath)}
                    onStartRename={startRenameWorkspaceFile}
                    onRenameNameChange={setRenameFileName}
                    onSubmitRename={(event, filePath) => void renameWorkspaceFile(event, filePath)}
                    onCancelRename={() => {
                      setRenamingFilePath("");
                      setRenameFileName("");
                      setFileActionError("");
                    }}
                  />
                ) : (
                  <p className="conversation-empty">No files yet. Use the terminal to create files.</p>
                )}
              </nav>
              <div className="code-view-shell">
                <div className="code-view-toolbar">
                  <span>{selectedPath || "No file selected"}</span>
                  <button
                    className="code-copy-button"
                    type="button"
                    title={selectedFileContent !== null ? "Copy file content" : "Select a file first"}
                    disabled={selectedFileContent === null}
                    onClick={() => void copySelectedFileContent()}
                  >
                    {isCodeCopied ? <Check size={14} /> : <Copy size={14} />}
                    <span>{isCodeCopied ? "已复制" : "复制"}</span>
                  </button>
                </div>
                <pre className="code-view">
                  {selectedFileContent !== null ? (
                    <code>{selectedFileContent}</code>
                  ) : selectedPath ? (
                    <code>Loading...</code>
                  ) : (
                    <code>Select a file to view its content.</code>
                  )}
                </pre>
              </div>
            </div>
          </section>
          )}

          {activeViewTab === "preview" && (
          <section className="preview-surface active">
            <div className="panel-header">
              <div className="section-heading">
                <Rocket size={17} />
                <span>Live preview</span>
              </div>
              <button
                className="publish-button"
                type="button"
                onClick={openPublishDialog}
              >
                <PackagePlus size={14} />
                <span>发布至市场</span>
              </button>
            </div>
            {previewBootStatus === "ready" ? (
              <PreviewApp
                preview={preview}
                reloadKey={previewReloadKey}
                onReload={reloadPreview}
              />
            ) : (
              <div className="preview-startup">
                <div className="preview-startup-status">
                  <RefreshCw size={17} className={previewBootStatus === "starting" ? "spin" : ""} />
                  <div>
                    <strong>{previewBootStatus === "error" ? "Preview failed to start" : "Starting preview"}</strong>
                    <span>Running npm run dev for the selected project.</span>
                  </div>
                </div>
                <pre className="preview-startup-console">
                  {previewBootLogs.length ? previewBootLogs.join("") : "Waiting to start preview..."}
                </pre>
              </div>
            )}
          </section>
          )}
        </div>
      </section>
        </section>
      </section>

      <section className={`workspace-tab-panel ${activeTab === "terminal" ? "active" : ""}`} aria-hidden={activeTab !== "terminal"}>
        <BrowserPtyTerminal
          key={`${activeProjectId}-${terminalResetKey}`}
          active={activeTab === "terminal"}
          projectId={activeProjectId}
          onAssistantOutput={handleAssistantOutput}
          onTerminalStatusChange={(status) => {
            if (chatReadyTimerRef.current) {
              clearTimeout(chatReadyTimerRef.current);
              chatReadyTimerRef.current = null;
            }

            if (status === "opencode-connected") {
              setHookStatus("connected");
              setIsChatReady(false);
              chatReadyTimerRef.current = setTimeout(() => {
                setIsChatReady(true);
                chatReadyTimerRef.current = null;
              }, 5000);
              return;
            }

            if (status === "closed" || status === "error") {
              setHookStatus("closed");
              setIsChatReady(false);
              return;
            }

            setHookStatus("connecting");
            setIsChatReady(false);
          }}
        />
      </section>

      <section className={`workspace-tab-panel ${activeTab === "market" ? "active" : ""}`} aria-hidden={activeTab !== "market"}>
        <section className="market-page">
          <div className="market-header">
            <div className="section-heading">
              <Store size={18} />
              <span>Market</span>
            </div>
            <button className="publish-button" type="button" onClick={openPublishDialog}>
              <PackagePlus size={14} />
              <span>发布至市场</span>
            </button>
          </div>
          {marketProjects.length ? (
            <div className="market-grid">
              {marketProjects.map((project) => (
                <article className="market-card" key={project.id}>
                  <strong>{project.name}</strong>
                  <button
                    type="button"
                    onClick={() => openMarketApplyDialog(project)}
                    disabled={Boolean(applyingProjectId)}
                  >
                    {applyingProjectId === project.id ? "应用中..." : "应用"}
                  </button>
                  <p>{project.description || "暂无项目介绍"}</p>
                </article>
              ))}
            </div>
          ) : (
            <div className="market-empty">
              <Store size={22} />
              <span>还没有发布到市场的项目。</span>
            </div>
          )}
        </section>
      </section>

      {isCreateProjectDialogOpen && (
        <div className="publish-dialog-backdrop" role="presentation" onClick={() => setIsCreateProjectDialogOpen(false)}>
          <form className="publish-dialog" onSubmit={createProject} onClick={(event) => event.stopPropagation()}>
            <div className="section-heading">
              <Plus size={18} />
              <span>新建项目</span>
            </div>
            <input
              autoFocus
              value={newProjectName}
              onChange={(event) => setNewProjectName(event.target.value)}
              placeholder="输入项目名称"
              maxLength={80}
            />
            {newProjectError && <p className="form-error">{newProjectError}</p>}
            <div className="publish-dialog-actions">
              <button type="button" onClick={() => setIsCreateProjectDialogOpen(false)}>
                取消
              </button>
              <button type="submit" disabled={!newProjectName.trim() || isCreatingProject}>
                {isCreatingProject ? "创建中..." : "创建"}
              </button>
            </div>
          </form>
        </div>
      )}

      {isPublishDialogOpen && (
        <div className="publish-dialog-backdrop" role="presentation" onClick={() => setIsPublishDialogOpen(false)}>
          <form className="publish-dialog" onSubmit={publishToMarket} onClick={(event) => event.stopPropagation()}>
            <div className="section-heading">
              <PackagePlus size={18} />
              <span>发布至市场</span>
            </div>
            <input
              autoFocus
              value={publishName}
              onChange={(event) => setPublishName(event.target.value)}
              placeholder="输入项目名称"
              maxLength={80}
            />
            <textarea
              value={publishDescription}
              onChange={(event) => setPublishDescription(event.target.value)}
              placeholder="输入项目介绍"
              maxLength={300}
              rows={4}
            />
            {publishError && <p className="form-error">{publishError}</p>}
            <div className="publish-dialog-actions">
              <button type="button" onClick={() => setIsPublishDialogOpen(false)}>
                取消
              </button>
              <button type="submit" disabled={!publishName.trim() || publishStatus === "publishing"}>
                {publishStatus === "publishing" ? "发布中..." : "发布"}
              </button>
            </div>
          </form>
        </div>
      )}

      {selectedMarketProject && (
        <div className="publish-dialog-backdrop" role="presentation" onClick={() => setSelectedMarketProject(null)}>
          <div className="publish-dialog market-apply-dialog" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <div className="section-heading">
              <Store size={18} />
              <span>应用市场项目</span>
            </div>
            <div className="market-apply-summary">
              <strong>{selectedMarketProject.name}</strong>
              <p>{selectedMarketProject.description || "暂无项目介绍"}</p>
            </div>
            <p className="market-apply-note">
              应用后会创建一个新项目，并复制该市场项目的 chat 和 code。
            </p>
            {marketApplyError && <p className="form-error">{marketApplyError}</p>}
            <div className="publish-dialog-actions">
              <button type="button" disabled={Boolean(applyingProjectId)} onClick={() => setSelectedMarketProject(null)}>
                取消
              </button>
              <button
                className="dialog-primary-button"
                type="button"
                disabled={Boolean(applyingProjectId)}
                onClick={() => void applyMarketProject()}
              >
                {applyingProjectId ? "应用中..." : "新建并应用"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

type TerminalConversationMessage = {
  id: string;
  role: "assistant" | "user";
  category: AgentMessageCategory;
  label: string;
  content: string;
  createdAt?: number;
  isPending?: boolean;
};

type StoredConversationMessage = {
  id?: string;
  role?: "assistant" | "user";
  content?: string;
  source?: string;
  eventType?: string;
  createdAt?: string;
};

type AgentMessageCategory = "assistant" | "user" | "tool" | "status" | "error";

type AgentHookDebug = {
  source: string;
  hook_event_name: string;
  event_type: string;
  role?: string;
  textCount: number;
  textPreview?: string[];
};

type PreviewServerEvent = {
  event: "log" | "ready" | "error";
  payload: {
    content?: string;
    cwd?: string;
  };
};

function mapStoredConversationMessage(message: StoredConversationMessage): TerminalConversationMessage | null {
  const content = message.content?.trim();

  if (!content || (message.role !== "user" && message.role !== "assistant")) {
    return null;
  }

  if (message.role === "user") {
    if (message.source !== "chat-input") {
      return null;
    }

    return {
      id: message.id || `${message.createdAt || Date.now()}-user`,
      role: "user",
      category: "user",
      label: "You",
      content,
      createdAt: parseConversationTime(message.createdAt),
    };
  }

  const debug: AgentHookDebug = {
    source: message.source || "conversation",
    hook_event_name: message.eventType || "",
    event_type: message.eventType || "",
    textCount: 1,
  };
  const category = classifyAgentMessage(content, debug);

  return {
    id: message.id || `${message.createdAt || Date.now()}-assistant`,
    role: "assistant",
    category,
    label: getAgentMessageLabel(category, debug),
    content,
    createdAt: parseConversationTime(message.createdAt),
  };
}

function mergeConversationMessages(
  current: TerminalConversationMessage[],
  incoming: TerminalConversationMessage[],
) {
  const merged = [...current];

  for (const message of incoming) {
    const idMatchIndex = merged.findIndex((existing) => existing.id === message.id);

    if (idMatchIndex >= 0) {
      merged[idMatchIndex] = { ...merged[idMatchIndex], ...message, isPending: false };
      continue;
    }

    const optimisticMatchIndex = merged.findIndex((existing) => {
      if (!existing.isPending || existing.role !== message.role) {
        return false;
      }

      const existingCreatedAt = existing.createdAt || 0;
      const messageCreatedAt = message.createdAt || 0;
      const isNearby = existingCreatedAt > 0 && messageCreatedAt > 0 && Math.abs(messageCreatedAt - existingCreatedAt) < 5000;

      return isNearby && normalizeConversationText(existing.content) === normalizeConversationText(message.content);
    });

    if (optimisticMatchIndex >= 0) {
      merged[optimisticMatchIndex] = { ...message, isPending: false };
      continue;
    }

    merged.push(message);
  }

  return merged;
}

function parseConversationTime(value?: string) {
  const time = value ? new Date(value).getTime() : 0;
  return Number.isFinite(time) ? time : undefined;
}

function normalizeConversationText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function parsePreviewEvent(block: string): PreviewServerEvent | null {
  const event = block
    .split("\n")
    .find((line) => line.startsWith("event:"))
    ?.slice("event:".length)
    .trim();
  const data = block
    .split("\n")
    .find((line) => line.startsWith("data:"))
    ?.slice("data:".length)
    .trim();

  if (!event || !data || !["log", "ready", "error"].includes(event)) {
    return null;
  }

  try {
    return {
      event: event as PreviewServerEvent["event"],
      payload: JSON.parse(data) as PreviewServerEvent["payload"],
    };
  } catch {
    return null;
  }
}

function safeDownloadName(value: string) {
  return (
    value
      .trim()
      .replace(/[<>:"/\\|?*\x00-\x1F]+/g, "-")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .slice(0, 80) || "project-code"
  );
}

async function readPreviewError(response: Response) {
  const text = await response.text().catch(() => "");

  if (!text) {
    return `Could not start preview. HTTP ${response.status}`;
  }

  try {
    const data = JSON.parse(text) as { error?: string };
    return data.error || `Could not start preview. HTTP ${response.status}`;
  } catch {
    return text.slice(0, 500);
  }
}

function classifyAgentMessage(content: string, debug?: AgentHookDebug): AgentMessageCategory {
  const hookName = `${debug?.hook_event_name || ""} ${debug?.event_type || ""}`.toLowerCase();
  const role = (debug?.role || "").toLowerCase();
  const text = content.toLowerCase();

  if (hookName.includes("error") || text.startsWith("[error]") || text.includes("openCode exited with code".toLowerCase())) {
    return "error";
  }

  if (hookName.includes("tool") || hookName.includes("file")) {
    return "tool";
  }

  if (role === "assistant" || hookName.includes("assistant") || hookName.includes("message") || debug?.source === "terminal-json") {
    return "assistant";
  }

  return "status";
}

function getAgentMessageLabel(category: AgentMessageCategory, debug?: AgentHookDebug) {
  if (category === "assistant") {
    return "Model";
  }

  if (category === "tool") {
    return debug?.hook_event_name || debug?.event_type || "Tool";
  }

  if (category === "error") {
    return "Error";
  }

  return debug?.hook_event_name || debug?.event_type || debug?.source || "Status";
}

function parseSseChunk(chunk: string) {
  const event = chunk.match(/^event:\s*(.+)$/m)?.[1]?.trim() || "message";
  const data = chunk.match(/^data:\s*(.+)$/m)?.[1];

  if (!data) {
    return null;
  }

  try {
    return { event, payload: JSON.parse(data) as { content?: string } };
  } catch {
    return null;
  }
}


