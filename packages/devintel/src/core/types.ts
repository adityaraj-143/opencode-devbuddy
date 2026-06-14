export type VcsType = "git" | "hg" | "svn" | "none"

export interface ProjectMeta {
  name: string
  hasDevIntelDir: boolean
  vcsType: VcsType
  vcsRemote?: string
}
