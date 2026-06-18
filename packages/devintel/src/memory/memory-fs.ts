import { mkdir, writeFile, readFile } from "fs/promises"
import { join } from "path"

export const DEVINTEL_DIR = ".devintel"
export const PROJECT_JSON = "project.json"
export const TASKS_JSON = "tasks.json"
export const DECISIONS_JSON = "decisions.json"
export const NOTES_JSON = "notes.json"

function devIntelPath(worktreePath: string): string {
  return join(worktreePath, DEVINTEL_DIR)
}

function filePath(worktreePath: string, name: string): string {
  return join(devIntelPath(worktreePath), name)
}

export async function ensureDir(worktreePath: string): Promise<void> {
  await mkdir(devIntelPath(worktreePath), { recursive: true })
}

export async function readJSON<T>(worktreePath: string, fileName: string, fallback: T): Promise<T> {
  try {
    const content = await readFile(filePath(worktreePath, fileName), "utf-8")
    return JSON.parse(content) as T
  } catch (err) {
    if ((err as { code?: string }).code === "ENOENT") return fallback
    throw err
  }
}

export async function writeJSON(worktreePath: string, fileName: string, data: unknown): Promise<void> {
  await writeFile(filePath(worktreePath, fileName), JSON.stringify(data, null, 2), "utf-8")
}

async function fileExists(worktreePath: string, fileName: string): Promise<boolean> {
  try {
    await readFile(filePath(worktreePath, fileName))
    return true
  } catch {
    return false
  }
}

export async function ensureFile<T>(worktreePath: string, fileName: string, defaults: T): Promise<void> {
  if (!(await fileExists(worktreePath, fileName))) {
    await writeJSON(worktreePath, fileName, defaults)
  }
}
