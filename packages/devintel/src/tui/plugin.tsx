import type { TuiPlugin, TuiPluginModule, TuiPluginApi } from "@opencode-ai/plugin/tui"

export const DevIntelTuiPlugin: TuiPlugin = async (api: TuiPluginApi) => {
  api.slots.register({
    name: "sidebar_content",
    mode: "append",
    render(props) {
      const { session_id } = props
      return (
        <box>
          <text fg={api.theme.current.text}>
            <b>Dev-Intel</b>
          </text>
          <text fg={api.theme.current.textMuted}>Session: {session_id}</text>
        </box>
      )
    },
  })

  api.slots.register({
    name: "home_footer",
    mode: "append",
    render() {
      return (
        <text fg={api.theme.current.textMuted}>
          Dev-Intel: Memory tracking active
        </text>
      )
    },
  })
}

export const plugin: TuiPluginModule = {
  id: "internal:devintel",
  tui: DevIntelTuiPlugin,
}
