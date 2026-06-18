export type VcsType = "git" | "hg" | "svn" | "none"

export interface ProjectMeta {
  name: string
  hasDevBuddyDir: boolean
  vcsType: VcsType
  vcsRemote?: string
}
