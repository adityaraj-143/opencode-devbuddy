export * as DevIntelScanner from "./scanner"

import { Effect } from "effect"
import { access } from "fs/promises"
import { join } from "path"

export interface ScanResult {
  name: string
  hasDevIntel: boolean
  vcsType: string
  vcsRemote?: string
}

async function detectVCS(directory: string): Promise<{ type: string; remote?: string }> {
  try {
    await access(join(directory, ".git"))
    return { type: "git" }
  } catch {
    try {
      await access(join(directory, ".hg"))
      return { type: "hg" }
    } catch {
      return { type: "none" }
    }
  }
}

async function detectDevIntel(directory: string): Promise<boolean> {
  try {
    await access(join(directory, ".devintel"))
    return true
  } catch {
    try {
      await access(join(directory, ".opencode"))
      return true
    } catch {
      return false
    }
  }
}

export function scan(directory: string) {
  return Effect.promise(async (): Promise<ScanResult> => {
    const vcs = await detectVCS(directory)
    const hasDevIntel = await detectDevIntel(directory)
    return {
      name: directory.split("/").pop() ?? "unknown",
      hasDevIntel,
      vcsType: vcs.type,
      vcsRemote: vcs.remote,
    }
  })
}
