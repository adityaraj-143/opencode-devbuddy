import type { TuiPlugin, TuiPluginApi } from "@opencode-ai/plugin/tui"
import { ProjectList } from "./project-list"

export const DevIntelTuiPlugin: TuiPlugin = async (api: TuiPluginApi) => {
  api.slots.register({
    name: "sidebar_content",
    mode: "append",
    render() {
      return <ProjectList api={api} />
    },
  })
}

export const plugin = {
  id: "internal:devintel" as const,
  tui: DevIntelTuiPlugin,
}
