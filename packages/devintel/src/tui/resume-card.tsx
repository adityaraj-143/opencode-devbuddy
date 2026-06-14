import type { TuiPluginApi } from "@opencode-ai/plugin/tui"

export function ResumeCard(props: { api: TuiPluginApi; projectName?: string; branchName?: string }) {
  const theme = () => props.api.theme.current
  return (
    <box>
      <text fg={theme().text}>
        <b>Resume</b>
      </text>
      <text fg={theme().textMuted}>
        {props.projectName ? `Project: ${props.projectName}` : "No project detected"}
      </text>
      {props.branchName && <text fg={theme().textMuted}>Branch: {props.branchName}</text>}
    </box>
  )
}
