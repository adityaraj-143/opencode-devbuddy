import type { TuiPluginApi } from "@opencode-ai/plugin/tui"

export function ProjectList(props: { api: TuiPluginApi; projects: Array<{ name: string; worktreePath: string }> }) {
  const theme = () => props.api.theme.current
  return (
    <box>
      <text fg={theme().text}>
        <b>Projects</b>
      </text>
      {props.projects.map((project) => (
        <text fg={theme().textMuted}>{project.name}</text>
      ))}
    </box>
  )
}
