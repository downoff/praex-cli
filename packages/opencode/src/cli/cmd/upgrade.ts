import type { Argv } from "yargs"
import { UI } from "../ui"
import * as prompts from "@clack/prompts"
import * as PraexUpdate from "@/installation/praex-update"
import { InstallationVersion } from "@opencode-ai/core/installation/version"
import semver from "semver"

export const UpgradeCommand = {
  command: "upgrade",
  aliases: ["update"],
  describe: "update praex to the latest version",
  builder: (yargs: Argv) => {
    return yargs.option("force", {
      alias: "f",
      describe: "reinstall even if already on the latest version",
      type: "boolean",
    })
  },
  handler: async (args: { force?: boolean }) => {
    UI.empty()
    UI.println(UI.logo("  "))
    UI.empty()
    prompts.intro("Update")

    if (!PraexUpdate.supported()) {
      if (process.platform !== "linux" || process.arch !== "x64") {
        prompts.log.error("Self-update ships for Linux x64 for now. Grab the latest from praex.ai/download.")
      } else {
        prompts.log.info("This is a source build. Update with git pull instead.")
      }
      prompts.outro("Done")
      return
    }

    const spinner = prompts.spinner()
    spinner.start("Checking for updates")
    const manifest = await PraexUpdate.fetchManifest()
    if (!manifest) {
      spinner.stop("Could not reach the praex release channel", 1)
      prompts.log.error("Check your connection and try again, or reinstall from praex.ai/download.")
      prompts.outro("Done")
      process.exitCode = 1
      return
    }

    const current = semver.valid(InstallationVersion) ? InstallationVersion : undefined
    const upToDate = current && !semver.gt(manifest.version, current)
    if (upToDate && !args.force) {
      spinner.stop(`Already on the latest version (v${current})`)
      prompts.outro("Done")
      return
    }

    spinner.message(upToDate ? `Reinstalling v${manifest.version}` : `Updating to v${manifest.version}`)
    try {
      const version = await PraexUpdate.apply(manifest)
      spinner.stop(`Updated to v${version}`)
      prompts.outro("Restart praex to use the new version")
    } catch (err) {
      spinner.stop("Update failed", 1)
      prompts.log.error(err instanceof Error ? err.message : String(err))
      prompts.log.info("You can always reinstall: curl -fsSL https://praex.ai/install.sh | bash")
      prompts.outro("Done")
      process.exitCode = 1
    }
  },
}
