import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = path.resolve(process.env.ATOMS_DATA_DIR || path.join(projectRoot, "data"));

async function ensureDataDir() {
  await fs.mkdir(dataDir, { recursive: true });
}

export async function readJsonFile<T>(fileName: string, fallback: T): Promise<T> {
  await ensureDataDir();
  const filePath = path.join(dataDir, fileName);

  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      await writeJsonFile(fileName, fallback);
      return fallback;
    }

    throw error;
  }
}

export async function writeJsonFile<T>(fileName: string, value: T): Promise<void> {
  await ensureDataDir();
  const filePath = path.join(dataDir, fileName);
  await fs.writeFile(filePath, JSON.stringify(value, null, 2), "utf8");
}
