import type { TuiPlugin, TuiPluginApi } from "@opencode-ai/plugin/tui"
import { ProjectList } from "./project-list"

export const DevBuddyTuiPlugin: TuiPlugin = async (api: TuiPluginApi) => {
  api.slots.register({
    order: 200,
    slots: {
      sidebar_content() {
        return <ProjectList api={api} />
      },
    },
  })
}

export const plugin = {
  id: "internal:devbuddy" as const,
  tui: DevBuddyTuiPlugin,
}
