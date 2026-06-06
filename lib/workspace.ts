import { randomUUID } from "crypto";
import { cp, mkdir, readdir, rm, stat, writeFile, readFile } from "fs/promises";
import path from "path";

export function sanitizeWorkspaceId(userId: string) {
  return userId.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);
}

export function getUserWorkspaceDirectory(userId: string) {
  return path.join(process.cwd(), "data", "workspaces", sanitizeWorkspaceId(userId));
}

export type UserProject = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
};

type UserProjectsIndex = {
  projects: UserProject[];
};

export function getUserProjectsDirectory(userId: string) {
  return path.join(getUserWorkspaceDirectory(userId), "projects");
}

export function getUserProjectWorkspaceDirectory(userId: string, projectId: string) {
  return path.join(getUserProjectsDirectory(userId), sanitizeWorkspaceId(projectId));
}

export function getWorkspaceTemplateDirectory() {
  return path.resolve(process.env.ATOMS_WORKSPACE_TEMPLATE_DIR || path.join(process.cwd(), "templates", "nextjs-base"));
}

export async function seedUserWorkspace(userId: string) {
  const workspaceDirectory = getUserProjectWorkspaceDirectory(userId, "default");
  const templateDirectory = getWorkspaceTemplateDirectory();

  await mkdir(workspaceDirectory, { recursive: true });

  try {
    const entries = await readdir(workspaceDirectory);
    if (entries.length > 0) {
      return { workspaceDirectory, seeded: false };
    }
  } catch {
    // mkdir above should normally handle this; keep the seed path best-effort.
  }

  const templateStats = await stat(templateDirectory);
  if (!templateStats.isDirectory()) {
    throw new Error("Workspace template is not a directory.");
  }

  await cp(templateDirectory, workspaceDirectory, {
    recursive: true,
    force: false,
    errorOnExist: false,
  });

  return { workspaceDirectory, seeded: true };
}

export async function listUserProjects(userId: string) {
  const index = await ensureUserProjects(userId);
  return index.projects;
}

export async function createUserProject(userId: string, name: string) {
  const index = await ensureUserProjects(userId);
  const normalizedName = normalizeProjectName(name);
  const now = new Date().toISOString();
  const project: UserProject = {
    id: `${Date.now()}-${randomUUID()}`,
    name: normalizedName,
    createdAt: now,
    updatedAt: now,
  };

  index.projects.push(project);
  await writeProjectsIndex(userId, index);
  await seedProjectWorkspace(userId, project.id);
  return project;
}

export async function deleteUserProject(userId: string, projectId: string) {
  const index = await ensureUserProjects(userId);
  const safeProjectId = sanitizeWorkspaceId(projectId);

  if (index.projects.length <= 1) {
    throw new Error("At least one project is required.");
  }

  const nextProjects = index.projects.filter((project) => project.id !== safeProjectId);

  if (nextProjects.length === index.projects.length) {
    throw new Error("Project was not found.");
  }

  await writeProjectsIndex(userId, { projects: nextProjects });
  removeDirectoryInBackground(getUserProjectWorkspaceDirectory(userId, safeProjectId));
  return nextProjects[0];
}

export async function resolveUserProjectWorkspace(userId: string, projectId?: string | null) {
  const index = await ensureUserProjects(userId);
  const project =
    index.projects.find((candidate) => candidate.id === sanitizeWorkspaceId(projectId || "")) || index.projects[0];
  const workspaceDirectory = getUserProjectWorkspaceDirectory(userId, project.id);
  await mkdir(workspaceDirectory, { recursive: true });
  await ensureProjectHasStarter(workspaceDirectory);
  return { project, workspaceDirectory };
}

export async function seedProjectWorkspace(userId: string, projectId: string) {
  const workspaceDirectory = getUserProjectWorkspaceDirectory(userId, projectId);
  const templateDirectory = getWorkspaceTemplateDirectory();

  await mkdir(workspaceDirectory, { recursive: true });

  const entries = await readdir(workspaceDirectory).catch(() => []);
  if (entries.length > 0) {
    return { workspaceDirectory, seeded: false };
  }

  await cp(templateDirectory, workspaceDirectory, {
    recursive: true,
    force: false,
    errorOnExist: false,
  });

  return { workspaceDirectory, seeded: true };
}

async function ensureProjectHasStarter(workspaceDirectory: string) {
  try {
    await stat(path.join(workspaceDirectory, "package.json"));
    return;
  } catch {
    const entries = await readdir(workspaceDirectory).catch(() => []);
    if (entries.length > 0) {
      return;
    }
  }

  await cp(getWorkspaceTemplateDirectory(), workspaceDirectory, {
    recursive: true,
    force: false,
    errorOnExist: false,
  });
}

async function ensureUserProjects(userId: string) {
  const existing = await readProjectsIndex(userId);

  if (existing.projects.length) {
    return existing;
  }

  const now = new Date().toISOString();
  const index: UserProjectsIndex = {
    projects: [
      {
        id: "default",
        name: "Default Project",
        createdAt: now,
        updatedAt: now,
      },
    ],
  };
  await writeProjectsIndex(userId, index);
  await migrateLegacyWorkspaceToDefaultProject(userId);
  await seedProjectWorkspace(userId, "default");
  return index;
}

async function migrateLegacyWorkspaceToDefaultProject(userId: string) {
  const legacyDirectory = getUserWorkspaceDirectory(userId);
  const projectDirectory = getUserProjectWorkspaceDirectory(userId, "default");
  const projectParent = getUserProjectsDirectory(userId);

  try {
    const entries = await readdir(projectDirectory);
    if (entries.length > 0) {
      return;
    }
  } catch {
    await mkdir(projectDirectory, { recursive: true });
  }

  await cp(legacyDirectory, projectDirectory, {
    recursive: true,
    force: false,
    errorOnExist: false,
    filter: (source) => path.resolve(source) !== path.resolve(projectParent) && !source.split(/[\\/]/).includes("projects"),
  }).catch(() => {});
}

async function readProjectsIndex(userId: string): Promise<UserProjectsIndex> {
  try {
    const raw = await readFile(getProjectsIndexPath(userId), "utf8");
    const parsed = JSON.parse(raw) as UserProjectsIndex;
    return { projects: Array.isArray(parsed.projects) ? parsed.projects : [] };
  } catch {
    return { projects: [] };
  }
}

async function writeProjectsIndex(userId: string, index: UserProjectsIndex) {
  await mkdir(getUserWorkspaceDirectory(userId), { recursive: true });
  await writeFile(getProjectsIndexPath(userId), `${JSON.stringify(index, null, 2)}\n`, "utf8");
}

function getProjectsIndexPath(userId: string) {
  return path.join(getUserWorkspaceDirectory(userId), "projects.json");
}

function normalizeProjectName(value: string) {
  const name = value.trim().replace(/\s+/g, " ");

  if (name.length < 2) {
    throw new Error("Project name must be at least 2 characters.");
  }

  return name.slice(0, 80);
}

async function removeDirectoryWithRetry(directory: string) {
  let lastError: unknown;

  for (let attempt = 0; attempt < 8; attempt++) {
    try {
      await rm(directory, { recursive: true, force: true, maxRetries: 3, retryDelay: 300 });
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 400 + attempt * 300));
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Could not delete project directory.");
}

function removeDirectoryInBackground(directory: string) {
  void removeDirectoryWithRetry(directory).catch((error) => {
    console.warn(
      `[atoms workspace] project removed from index, but directory cleanup is still pending: ${directory}`,
      error,
    );
  });
}
