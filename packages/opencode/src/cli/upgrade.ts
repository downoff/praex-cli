import { Config } from "@/config/config"
import { AppRuntime } from "@/effect/app-runtime"
import { Flag } from "@opencode-ai/core/flag/flag"
import { Installation } from "@/installation"
import * as PraexUpdate from "@/installation/praex-update"
import { InstallationVersion } from "@opencode-ai/core/installation/version"
import { GlobalBus } from "@/bus/global"
import semver from "semver"

// Background update check against the praex release channel. Patch releases
// install silently in place and apply on next launch; minor/major releases
// (or autoupdate: "notify") surface the TUI update dialog instead.
export async function upgrade() {
  if (!PraexUpdate.supported()) return
  const config = await AppRuntime.runPromise(Config.Service.use((cfg) => cfg.getGlobal()))
  if (config.autoupdate === false || Flag.OPENCODE_DISABLE_AUTOUPDATE) return
  const latest = await Installation.latest().catch(() => {})
  if (!latest) return
  if (!semver.valid(latest) || !semver.valid(InstallationVersion)) return
  if (!semver.gt(latest, InstallationVersion)) return

  const kind = Installation.getReleaseType(InstallationVersion, latest)

  if (config.autoupdate === "notify" || kind !== "patch") {
    GlobalBus.emit("event", {
      directory: "global",
      payload: {
        type: Installation.Event.UpdateAvailable.type,
        properties: { version: latest },
      },
    })
    return
  }

  await Installation.upgrade("curl", latest)
    .then(() =>
      GlobalBus.emit("event", {
        directory: "global",
        payload: {
          type: Installation.Event.Updated.type,
          properties: { version: latest },
        },
      }),
    )
    .catch(() => {})
}
