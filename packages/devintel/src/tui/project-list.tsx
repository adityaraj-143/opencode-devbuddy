import type { TuiPluginApi } from "@opencode-ai/plugin/tui"

export function ProjectList(props: { api: TuiPluginApi }) {
  const theme = () => props.api.theme.current
  return (
    <box>
      <text fg={theme().text}>
        <b>Projects</b>
      </text>
      <text fg={theme().textMuted}>Dev-Intel: Project Registry</text>
    </box>
  )
}
