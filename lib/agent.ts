import crypto from "crypto";
import type { AgentEvent, AgentStep, GeneratedFile, PreviewState, Run } from "@/lib/types";
import { readJsonFile, writeJsonFile } from "@/lib/storage";

type RunsFile = { runs: Run[] };

const palette = {
  light: "#2563eb",
  dark: "#38bdf8",
  fresh: "#10b981",
  studio: "#f97316",
} as const;

export async function readRuns() {
  return readJsonFile<RunsFile>("runs.json", { runs: [] });
}

export async function saveRuns(runsFile: RunsFile) {
  await writeJsonFile("runs.json", runsFile);
}

export function inferPreview(prompt: string): PreviewState {
  const lower = prompt.toLowerCase();
  const wantsDark = lower.includes("dark") || lower.includes("black");
  const wantsCommerce = lower.includes("shop") || lower.includes("commerce") || lower.includes("store");
  const wantsDashboard = lower.includes("dashboard") || lower.includes("saas") || lower.includes("analytics");
  const wantsProductivity = lower.includes("task") || lower.includes("crm") || lower.includes("workflow");
  const theme = wantsDark ? "dark" : wantsCommerce ? "fresh" : wantsProductivity ? "studio" : "light";
  const layout = wantsCommerce ? "commerce" : wantsDashboard ? "dashboard" : wantsProductivity ? "productivity" : "landing";
  const appType = wantsCommerce ? "Commerce" : wantsDashboard ? "SaaS Dashboard" : wantsProductivity ? "Workflow Tool" : "Product Site";
  const appName = extractAppName(prompt);

  return {
    appName,
    appType,
    theme,
    accent: palette[theme],
    layout,
    headline: `${appName} is ready to launch`,
    subhead: "Generated from your prompt with interface, components, test state, and deploy preview.",
    modules: layoutModules(layout),
    status: "idle",
  };
}

function extractAppName(prompt: string) {
  const cleaned = prompt
    .replace(/[^a-zA-Z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 3)
    .join(" ");

  if (!cleaned) {
    return "New App";
  }

  if (cleaned.length > 18) {
    return "Launch Studio";
  }

  return cleaned;
}

function layoutModules(layout: PreviewState["layout"]) {
  const modules = {
    dashboard: ["Revenue", "Growth", "Automations", "Team Activity"],
    landing: ["Value Prop", "Features", "Testimonials", "Primary CTA"],
    commerce: ["New Drops", "Cart", "Inventory", "Orders"],
    productivity: ["Today", "Customers", "Reminders", "Progress"],
  };

  return modules[layout];
}

function filesForPreview(preview: PreviewState): GeneratedFile[] {
  return [
    {
      path: "app/page.tsx",
      language: "tsx",
      content: `export default function ${safeComponentName(preview.appName)}() {
  return (
    <main className="app-shell">
      <section className="hero">
        <p>${preview.appType}</p>
        <h1>${preview.headline}</h1>
        <span>${preview.subhead}</span>
      </section>
    </main>
  );
}`,
    },
    {
      path: "components/MetricGrid.tsx",
      language: "tsx",
      content: `const modules = ${JSON.stringify(preview.modules, null, 2)};

export function MetricGrid() {
  return (
    <div className="metric-grid">
      {modules.map((label, index) => (
        <article key={label}>
          <strong>{String(index + 1).padStart(2, "0")}</strong>
          <span>{label}</span>
        </article>
      ))}
    </div>
  );
}`,
    },
    {
      path: "app/globals.css",
      language: "css",
      content: `:root {
  --accent: ${preview.accent};
}

.app-shell {
  min-height: 100vh;
  background: ${preview.theme === "dark" ? "#0f172a" : "#f8fafc"};
  color: ${preview.theme === "dark" ? "#e2e8f0" : "#0f172a"};
}`,
    },
  ];
}

function safeComponentName(appName: string) {
  const compact = appName.replace(/[^a-zA-Z0-9]/g, "");
  return compact ? `${compact}Page` : "GeneratedPage";
}

function createEvents(basePreview: PreviewState): AgentEvent[] {
  const buildingPreview = { ...basePreview, status: "building" as const };
  const readyPreview = { ...basePreview, status: "ready" as const };
  const deployedPreview = {
    ...basePreview,
    status: "deployed" as const,
    deployUrl: `https://${basePreview.appName.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "demo"}.atoms-demo.dev`,
  };
  const files = filesForPreview(basePreview);

  return [
    {
      id: crypto.randomUUID(),
      type: "thinking",
      title: "Understand intent",
      detail: `Analyzing the product goal, page structure, and core experience for ${basePreview.appName}.`,
      delayMs: 450,
      preview: buildingPreview,
    },
    {
      id: crypto.randomUUID(),
      type: "plan",
      title: "Generate product plan",
      detail: `Selected ${basePreview.appType} with a ${basePreview.layout} layout and ${basePreview.modules.length} core modules.`,
      delayMs: 900,
      preview: buildingPreview,
    },
    {
      id: crypto.randomUUID(),
      type: "file_update",
      title: "Create app files",
      detail: "Writing page, component, and style files while the code pane updates.",
      delayMs: 1200,
      files,
      preview: buildingPreview,
    },
    {
      id: crypto.randomUUID(),
      type: "test",
      title: "Run checks",
      detail: "Component render, responsive layout, interaction state, and console checks passed.",
      delayMs: 1250,
      files,
      preview: readyPreview,
    },
    {
      id: crypto.randomUUID(),
      type: "preview",
      title: "Start live preview",
      detail: "Preview refreshed and ready for inspection on the right.",
      delayMs: 900,
      files,
      preview: readyPreview,
    },
    {
      id: crypto.randomUUID(),
      type: "deploy",
      title: "Prepare deploy",
      detail: `Build complete. Demo deploy URL generated: ${deployedPreview.deployUrl}`,
      delayMs: 1000,
      files,
      preview: deployedPreview,
    },
    {
      id: crypto.randomUUID(),
      type: "done",
      title: "Done",
      detail: "The app demo is complete. Continue chatting with the agent to refine it.",
      delayMs: 550,
      files,
      preview: deployedPreview,
    },
  ];
}

export async function createRun(userId: string, prompt: string) {
  const preview = inferPreview(prompt);
  const events = createEvents(preview);
  const now = new Date().toISOString();
  const run: Run = {
    id: crypto.randomUUID(),
    userId,
    prompt,
    status: "running",
    steps: [],
    messages: [
      {
        id: crypto.randomUUID(),
        role: "user",
        content: prompt,
        createdAt: now,
      },
      {
        id: crypto.randomUUID(),
        role: "agent",
        content: "I will move through product structure, UI, code, tests, and deploy preview.",
        createdAt: now,
      },
    ],
    files: [],
    preview,
    events,
    createdAt: now,
    updatedAt: now,
  };
  const runsFile = await readRuns();
  runsFile.runs.unshift(run);
  await saveRuns(runsFile);
  return run;
}

export async function getRunForUser(runId: string, userId: string) {
  const runsFile = await readRuns();
  return runsFile.runs.find((run) => run.id === runId && run.userId === userId) ?? null;
}

export async function updateRunWithMessage(runId: string, userId: string, message: string) {
  const runsFile = await readRuns();
  const run = runsFile.runs.find((candidate) => candidate.id === runId && candidate.userId === userId);

  if (!run) {
    return null;
  }

  const nextPreview = applyFollowUp(run.preview, message);
  const files = filesForPreview(nextPreview);
  const now = new Date().toISOString();
  const agentReply = `Updated theme, modules, and code preview based on: ${message}`;
  const event: AgentEvent = {
    id: crypto.randomUUID(),
    type: "file_update",
    title: "Refine app",
    detail: agentReply,
    delayMs: 500,
    files,
    preview: { ...nextPreview, status: "ready" },
  };

  run.messages.push(
    { id: crypto.randomUUID(), role: "user", content: message, createdAt: now },
    { id: crypto.randomUUID(), role: "agent", content: agentReply, createdAt: now },
  );
  run.events = [event];
  run.files = files;
  run.preview = { ...nextPreview, status: "ready" };
  run.steps.push(eventToStep(event, "done"));
  run.status = "complete";
  run.updatedAt = now;
  await saveRuns(runsFile);
  return { run, event };
}

function applyFollowUp(preview: PreviewState, message: string): PreviewState {
  const lower = message.toLowerCase();
  const wantsDark = lower.includes("dark") || lower.includes("black");
  const wantsLight = lower.includes("light") || lower.includes("bright");
  const wantsDashboard = lower.includes("dashboard") || lower.includes("analytics") || lower.includes("metrics");
  const wantsCommerce = lower.includes("shop") || lower.includes("store") || lower.includes("commerce");
  const wantsLogin = lower.includes("login") || lower.includes("signup") || lower.includes("auth");
  const theme = wantsDark ? "dark" : wantsLight ? "light" : preview.theme;
  const layout = wantsCommerce ? "commerce" : wantsDashboard ? "dashboard" : preview.layout;
  const modules = layoutModules(layout);

  return {
    ...preview,
    theme,
    accent: palette[theme],
    layout,
    modules: wantsLogin ? ["Login", "Account State", ...modules.slice(0, 2)] : modules,
    headline: wantsDark ? `${preview.appName} dark edition is ready` : preview.headline,
    status: "building",
  };
}

export function eventToStep(event: AgentEvent, status: AgentStep["status"]): AgentStep {
  return {
    id: event.id,
    type: event.type,
    title: event.title,
    detail: event.detail,
    status,
    timestamp: new Date().toISOString(),
  };
}
