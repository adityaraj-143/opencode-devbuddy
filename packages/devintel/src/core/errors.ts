import { Schema } from "effect"

export class ProjectNotFound extends Schema.TaggedErrorClass<ProjectNotFound>()(
  "DevIntel.ProjectNotFound",
  { projectID: Schema.String },
) {}

export class SessionNotFound extends Schema.TaggedErrorClass<SessionNotFound>()(
  "DevIntel.SessionNotFound",
  { sessionID: Schema.String },
) {}

export class MemoryNotFound extends Schema.TaggedErrorClass<MemoryNotFound>()(
  "DevIntel.MemoryNotFound",
  { memoryID: Schema.String },
) {}

export class DatabaseConnectionFailed extends Schema.TaggedErrorClass<DatabaseConnectionFailed>()(
  "DevIntel.DatabaseConnectionFailed",
  { cause: Schema.String },
) {}

export class DevIntelDirectoryNotFound extends Schema.TaggedErrorClass<DevIntelDirectoryNotFound>()(
  "DevIntel.DevIntelDirectoryNotFound",
  { path: Schema.String },
) {}
