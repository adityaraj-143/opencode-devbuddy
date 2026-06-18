import { Schema } from "effect"

export class ProjectNotFound extends Schema.TaggedErrorClass<ProjectNotFound>()(
  "DevBuddy.ProjectNotFound",
  { projectID: Schema.String },
) {}

export class DirectoryNotFound extends Schema.TaggedErrorClass<DirectoryNotFound>()(
  "DevBuddy.DirectoryNotFound",
  { path: Schema.String },
) {}
