export * as DevIntelProjectMemory from "./project-memory"

import { Context, Effect } from "effect"
import { DevIntelProjects } from "../projects/registry"
import { createID } from "../core/id"
import { ProjectNotFound } from "../core/errors"
import * as Fs from "./memory-fs"
import type {
  ProjectMetadata,
  Task,
  TaskStatus,
  TasksFile,
  Decision,
  DecisionsFile,
  Note,
  NotesFile,
  ProjectMemory,
} from "./types"

export interface Interface {
  readonly initialize: (projectId: string) => Effect.Effect<void, any, any>
  readonly getProjectMemory: (projectId: string) => Effect.Effect<ProjectMemory, any, any>
  readonly updateMetadata: (
    projectId: string,
    input: { name?: string; description?: string; goals?: string[]; constraints?: string[] },
  ) => Effect.Effect<ProjectMetadata, any, any>
  readonly addTask: (projectId: string, input: { title: string; description?: string }) => Effect.Effect<Task, any, any>
  readonly updateTask: (
    projectId: string,
    taskId: string,
    input: { title?: string; description?: string; status?: TaskStatus },
  ) => Effect.Effect<Task, any, any>
  readonly addDecision: (projectId: string, input: { title: string; rationale: string }) => Effect.Effect<Decision, any, any>
  readonly addNote: (projectId: string, content: string) => Effect.Effect<Note, any, any>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/v2/devintel/ProjectMemory") {}

function worktreePath(projectId: string) {
  return Effect.gen(function* () {
    const projects = yield* DevIntelProjects.Service
    const project = yield* projects.get(projectId)
    if (!project) return yield* Effect.fail(new ProjectNotFound({ projectID: projectId }))
    return project.worktreePath
  })
}

const defaultMetadata = (): ProjectMetadata => ({
  name: "",
  description: "",
  goals: [],
  constraints: [],
  createdAt: Date.now(),
  updatedAt: Date.now(),
})

const defaultTasksFile = (): TasksFile => ({ tasks: [] })
const defaultDecisionsFile = (): DecisionsFile => ({ decisions: [] })
const defaultNotesFile = (): NotesFile => ({ notes: [] })

const _initialize = Effect.fn("DevIntelProjectMemory.initialize")(function* (projectId: string) {
  const path = yield* worktreePath(projectId)
  yield* Effect.promise(async () => {
    await Fs.ensureDir(path)
    await Fs.ensureFile(path, Fs.PROJECT_JSON, defaultMetadata())
    await Fs.ensureFile(path, Fs.TASKS_JSON, defaultTasksFile())
    await Fs.ensureFile(path, Fs.DECISIONS_JSON, defaultDecisionsFile())
    await Fs.ensureFile(path, Fs.NOTES_JSON, defaultNotesFile())
  })
})

const _getProjectMemory = Effect.fn("DevIntelProjectMemory.getProjectMemory")(function* (projectId: string) {
  const path = yield* worktreePath(projectId)
  const [metadata, tasksFile, decisionsFile, notesFile] = yield* Effect.promise(async () => {
    await Fs.ensureDir(path)
    const m = await Fs.readJSON<ProjectMetadata>(path, Fs.PROJECT_JSON, defaultMetadata())
    const t = await Fs.readJSON<TasksFile>(path, Fs.TASKS_JSON, defaultTasksFile())
    const d = await Fs.readJSON<DecisionsFile>(path, Fs.DECISIONS_JSON, defaultDecisionsFile())
    const n = await Fs.readJSON<NotesFile>(path, Fs.NOTES_JSON, defaultNotesFile())
    return [m, t, d, n] as const
  })
  return { metadata, tasks: tasksFile.tasks, decisions: decisionsFile.decisions, notes: notesFile.notes }
})

const _updateMetadata = Effect.fn("DevIntelProjectMemory.updateMetadata")(function* (
  projectId: string,
  input: { name?: string; description?: string; goals?: string[]; constraints?: string[] },
) {
  const path = yield* worktreePath(projectId)
  const metadata = yield* Effect.promise(async () => {
    await Fs.ensureDir(path)
    const existing = await Fs.readJSON<ProjectMetadata>(path, Fs.PROJECT_JSON, defaultMetadata())
    const updated: ProjectMetadata = {
      name: input.name ?? existing.name,
      description: input.description ?? existing.description,
      goals: input.goals ?? existing.goals,
      constraints: input.constraints ?? existing.constraints,
      createdAt: existing.createdAt,
      updatedAt: Date.now(),
    }
    await Fs.writeJSON(path, Fs.PROJECT_JSON, updated)
    return updated
  })
  return metadata
})

const _addTask = Effect.fn("DevIntelProjectMemory.addTask")(function* (
  projectId: string,
  input: { title: string; description?: string },
) {
  const path = yield* worktreePath(projectId)
  const task = yield* Effect.promise(async () => {
    await Fs.ensureDir(path)
    const file = await Fs.readJSON<TasksFile>(path, Fs.TASKS_JSON, defaultTasksFile())
    const now = Date.now()
    const newTask: Task = {
      id: createID("t"),
      title: input.title,
      description: input.description ?? "",
      status: "todo",
      createdAt: now,
      updatedAt: now,
    }
    file.tasks.push(newTask)
    await Fs.writeJSON(path, Fs.TASKS_JSON, file)
    return newTask
  })
  return task
})

const _updateTask = Effect.fn("DevIntelProjectMemory.updateTask")(function* (
  projectId: string,
  taskId: string,
  input: { title?: string; description?: string; status?: TaskStatus },
) {
  const path = yield* worktreePath(projectId)
  const task = yield* Effect.promise(async () => {
    const file = await Fs.readJSON<TasksFile>(path, Fs.TASKS_JSON, defaultTasksFile())
    const existing = file.tasks.find((t) => t.id === taskId)
    if (!existing) throw new Error(`Task not found: ${taskId}`)
    Object.assign(existing, {
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      updatedAt: Date.now(),
    })
    await Fs.writeJSON(path, Fs.TASKS_JSON, file)
    return existing
  })
  return task
})

const _addDecision = Effect.fn("DevIntelProjectMemory.addDecision")(function* (
  projectId: string,
  input: { title: string; rationale: string },
) {
  const path = yield* worktreePath(projectId)
  const decision = yield* Effect.promise(async () => {
    await Fs.ensureDir(path)
    const file = await Fs.readJSON<DecisionsFile>(path, Fs.DECISIONS_JSON, defaultDecisionsFile())
    const newDecision: Decision = {
      id: createID("d"),
      title: input.title,
      rationale: input.rationale,
      timestamp: Date.now(),
    }
    file.decisions.push(newDecision)
    await Fs.writeJSON(path, Fs.DECISIONS_JSON, file)
    return newDecision
  })
  return decision
})

const _addNote = Effect.fn("DevIntelProjectMemory.addNote")(function* (
  projectId: string,
  content: string,
) {
  const path = yield* worktreePath(projectId)
  const note = yield* Effect.promise(async () => {
    await Fs.ensureDir(path)
    const file = await Fs.readJSON<NotesFile>(path, Fs.NOTES_JSON, defaultNotesFile())
    const now = Date.now()
    const newNote: Note = {
      id: createID("n"),
      content,
      createdAt: now,
      updatedAt: now,
    }
    file.notes.push(newNote)
    await Fs.writeJSON(path, Fs.NOTES_JSON, file)
    return newNote
  })
  return note
})

export const layer: Effect.Effect<Interface> = Effect.sync(() =>
  Service.of({
    initialize: (projectId) => _initialize(projectId),
    getProjectMemory: (projectId) => _getProjectMemory(projectId),
    updateMetadata: (projectId, input) => _updateMetadata(projectId, input),
    addTask: (projectId, input) => _addTask(projectId, input),
    updateTask: (projectId, taskId, input) => _updateTask(projectId, taskId, input),
    addDecision: (projectId, input) => _addDecision(projectId, input),
    addNote: (projectId, content) => _addNote(projectId, content),
  }) as unknown as Interface,
)
