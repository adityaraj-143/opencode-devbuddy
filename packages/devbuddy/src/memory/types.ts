export type TaskStatus = "todo" | "active" | "completed"

export interface ProjectMetadata {
  name: string
  description: string
  goals: string[]
  constraints: string[]
  createdAt: number
  updatedAt: number
}

export interface Task {
  id: string
  title: string
  description: string
  status: TaskStatus
  createdAt: number
  updatedAt: number
}

export interface TasksFile {
  tasks: Task[]
}

export interface Decision {
  id: string
  title: string
  rationale: string
  timestamp: number
}

export interface DecisionsFile {
  decisions: Decision[]
}

export interface Note {
  id: string
  content: string
  createdAt: number
  updatedAt: number
}

export interface NotesFile {
  notes: Note[]
}

export interface ProjectMemory {
  metadata: ProjectMetadata
  tasks: Task[]
  decisions: Decision[]
  notes: Note[]
}
