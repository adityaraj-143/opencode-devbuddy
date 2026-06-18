import { Schema } from "effect"

export const Project = Schema.Struct({
  id: Schema.String,
  worktreePath: Schema.String,
  name: Schema.String,
  vcsType: Schema.String,
  vcsRemote: Schema.optional(Schema.String),
  lastOpenedAt: Schema.optional(Schema.Number),
  timesOpened: Schema.Number,
  createdAt: Schema.Number,
  updatedAt: Schema.Number,
})
export type Project = typeof Project.Type
