import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { Effect, Layer, Schema, Context } from "effect"
import { serviceUse } from "@opencode-ai/core/effect/service-use"
import { errorMessage } from "@/util/error"
import { EventV2 } from "@opencode-ai/core/event"
import { makeRuntime } from "@opencode-ai/core/effect/runtime"
import semver from "semver"
import { InstallationChannel, InstallationVersion } from "@opencode-ai/core/installation/version"
import * as PraexUpdate from "./praex-update"

// Praex ships one way: a self-contained binary from praex.ai, self-updated in
// place. The package-manager methods are inherited surface kept for API
// compatibility; only "curl" (the tarball install) is ever detected.
export type Method = "curl" | "npm" | "yarn" | "pnpm" | "bun" | "brew" | "scoop" | "choco" | "unknown"

export type ReleaseType = "patch" | "minor" | "major"

export const Event = {
  Updated: EventV2.define({
    type: "installation.updated",
    schema: {
      version: Schema.String,
    },
  }),
  UpdateAvailable: EventV2.define({
    type: "installation.update-available",
    schema: {
      version: Schema.String,
    },
  }),
}

export function getReleaseType(current: string, latest: string): ReleaseType {
  const currMajor = semver.major(current)
  const currMinor = semver.minor(current)
  const newMajor = semver.major(latest)
  const newMinor = semver.minor(latest)

  if (newMajor > currMajor) return "major"
  if (newMinor > currMinor) return "minor"
  return "patch"
}

export const Info = Schema.Struct({
  version: Schema.String,
  latest: Schema.String,
}).annotate({ identifier: "InstallationInfo" })
export type Info = Schema.Schema.Type<typeof Info>

export function userAgent(client = "cli") {
  return `praex/${InstallationChannel}/${InstallationVersion}/${client}`
}

export const USER_AGENT = userAgent()

export function isPreview() {
  return InstallationChannel !== "latest"
}

export function isLocal() {
  return InstallationChannel === "local"
}

export class UpgradeFailedError extends Schema.TaggedErrorClass<UpgradeFailedError>()("UpgradeFailedError", {
  stderr: Schema.String,
}) {
  override get message() {
    return this.stderr
  }
}

export interface Interface {
  readonly info: () => Effect.Effect<Info>
  readonly method: () => Effect.Effect<Method>
  readonly latest: (method?: Method) => Effect.Effect<string>
  readonly upgrade: (method: Method, target: string) => Effect.Effect<void, UpgradeFailedError>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/Installation") {}

export const use = serviceUse(Service)

export const layer: Layer.Layer<Service> = Layer.sync(Service, () => {
  const result: Interface = {
    info: Effect.fn("Installation.info")(function* () {
      return {
        version: InstallationVersion,
        latest: yield* result.latest(),
      }
    }),
    method: Effect.fn("Installation.method")(function* () {
      return PraexUpdate.supported() ? ("curl" as Method) : ("unknown" as Method)
    }),
    latest: Effect.fn("Installation.latest")(function* () {
      const manifest = yield* Effect.promise(() => PraexUpdate.fetchManifest())
      if (!manifest) return yield* Effect.die(new Error("could not reach the praex release channel"))
      return manifest.version
    }),
    upgrade: Effect.fn("Installation.upgrade")(function* (m: Method, target: string) {
      const version = yield* Effect.tryPromise({
        try: () => PraexUpdate.apply(),
        catch: (err) => new UpgradeFailedError({ stderr: errorMessage(err) }),
      })
      yield* Effect.logInfo("upgraded", { method: m, target, version })
    }),
  }
  return Service.of(result)
})

export const defaultLayer = layer

const { runPromise } = makeRuntime(Service, defaultLayer)

export const latest = (...args: Parameters<Interface["latest"]>) => runPromise((s) => s.latest(...args))
export const method = () => runPromise((s) => s.method())
export const upgrade = (...args: Parameters<Interface["upgrade"]>) => runPromise((s) => s.upgrade(...args))

export const node = LayerNode.make(layer, [])

export * as Installation from "."
