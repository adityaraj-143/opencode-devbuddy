import { Schema } from "effect"

export class ProjectNotFound extends Schema.TaggedErrorClass<ProjectNotFound>()(
  "DevIntel.ProjectNotFound",
  { projectID: Schema.String },
) {}

export class DirectoryNotFound extends Schema.TaggedErrorClass<DirectoryNotFound>()(
  "DevIntel.DirectoryNotFound",
  { path: Schema.String },
) {}
