export type User = {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  createdAt: string;
};

export type PublicUser = Omit<User, "passwordHash">;

export type Session = {
  token: string;
  userId: string;
  expiresAt: string;
  createdAt: string;
};

export type AgentEventType =
  | "thinking"
  | "plan"
  | "file_update"
  | "test"
  | "preview"
  | "deploy"
  | "done"
  | "error";

export type StepStatus = "pending" | "running" | "done" | "error";

export type AgentStep = {
  id: string;
  type: AgentEventType;
  title: string;
  detail: string;
  status: StepStatus;
  timestamp: string;
};

export type GeneratedFile = {
  path: string;
  language: string;
  content: string;
  isEditing?: boolean;
};

export type PreviewState = {
  appName: string;
  appType: string;
  theme: "light" | "dark" | "fresh" | "studio";
  accent: string;
  layout: "dashboard" | "landing" | "commerce" | "productivity";
  headline: string;
  subhead: string;
  modules: string[];
  status: "idle" | "building" | "ready" | "deployed";
  deployUrl?: string;
};

export type AgentEvent = {
  id: string;
  type: AgentEventType;
  title: string;
  detail: string;
  delayMs: number;
  files?: GeneratedFile[];
  preview?: PreviewState;
};

export type Run = {
  id: string;
  userId: string;
  prompt: string;
  status: "idle" | "running" | "complete" | "error";
  steps: AgentStep[];
  messages: ChatMessage[];
  files: GeneratedFile[];
  preview: PreviewState;
  events: AgentEvent[];
  createdAt: string;
  updatedAt: string;
};

export type ChatMessage = {
  id: string;
  role: "user" | "agent";
  content: string;
  createdAt: string;
};
