export * as DevIntelProjectContext from "./context"

import { Effect } from "effect"
import { readdir, readFile } from "fs/promises"
import { join } from "path"
import { access } from "fs/promises"

interface MemoryFile {
  domain: string
  content: unknown
}

async function readJSON(path: string): Promise<unknown> {
  try {
    await access(path)
    const content = await readFile(path, "utf-8")
    return JSON.parse(content)
  } catch {
    return null
  }
}

export function loadMemory(devintelDir: string) {
  return Effect.promise(async (): Promise<MemoryFile[]> => {
    const memoryDir = join(devintelDir, "memory")
    let files: string[]
    try {
      await access(memoryDir)
      files = await readdir(memoryDir)
    } catch {
      return []
    }
    const results: MemoryFile[] = []
    for (const file of files) {
      if (!file.endsWith(".json")) continue
      const domain = file.replace(/\.json$/, "")
      const content = await readJSON(join(memoryDir, file))
      if (content) results.push({ domain, content })
    }
    return results
  })
}
