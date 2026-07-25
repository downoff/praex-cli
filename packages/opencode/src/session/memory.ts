import { Effect } from "effect"
import * as path from "path"
import fsp from "fs/promises"
import { Global } from "@opencode-ai/core/global"

// Persistent, per-user memory that carries across sessions ("like Claude has it").
// Stored as one markdown file per fact under Global data dir, with a MEMORY.md index.
// The index is injected into the system prompt every turn; the model reads a specific
// file when it needs detail and writes new facts via the `memory` tool.
export namespace Memory {
  export const dir = path.join(Global.Path.data, "memory")
  export const indexPath = path.join(dir, "MEMORY.md")

  export function fileFor(slug: string) {
    return path.join(dir, slug.replace(/\.md$/, "") + ".md")
  }

  // Read the index with no Effect service requirement (uses node fs directly) so it
  // composes into the chat loop regardless of which services that layer provides.
  export const readIndex = Effect.fn("Memory.readIndex")(function* () {
    return yield* Effect.promise(() => fsp.readFile(indexPath, "utf8").catch(() => ""))
  })

  // The block appended to the system prompt each session. Undefined when empty.
  export const system = Effect.fn("Memory.system")(function* () {
    const index = yield* readIndex()
    if (!index.trim()) return undefined
    return [
      "# Your memory",
      "",
      "You have persistent memory that carries across every session. The index below lists what",
      "you already know about this user — when something in it is relevant, use it, and read the",
      `referenced file under ${dir} when you need the full detail.`,
      "",
      "Whenever you learn a durable fact about the user — a preference, an ongoing project or goal,",
      'a correction they give you, or a useful reference — save it by calling the `memory` tool with',
      'action "remember", proactively and in the same turn, without being asked. Never store secrets,',
      "credentials, or one-off task details.",
      "",
      "<memory-index>",
      index.trim(),
      "</memory-index>",
    ].join("\n")
  })
}
