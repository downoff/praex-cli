import { Effect, Schema } from "effect"
import * as Tool from "./tool"
import { FSUtil } from "@opencode-ai/core/fs-util"
import { Memory } from "../session/memory"

export const Parameters = Schema.Struct({
  action: Schema.Union([Schema.Literal("remember"), Schema.Literal("recall"), Schema.Literal("forget")]).annotate({
    description:
      "remember = save a new durable fact about the user; recall = read saved memories (all, or one by slug); forget = drop a memory by slug",
  }),
  title: Schema.optional(Schema.String).annotate({
    description: "Short human-readable title for the memory (required for remember)",
  }),
  content: Schema.optional(Schema.String).annotate({
    description: "The fact to remember, one fact per call (required for remember)",
  }),
  slug: Schema.optional(Schema.String).annotate({
    description: "The memory's file slug — required for forget, optional for recall (omit to list all)",
  }),
})

type Metadata = { action: string; slug?: string }

function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "memory"
  )
}

const DESCRIPTION = [
  "Your persistent memory across sessions — this is how you remember the user between conversations.",
  'action="remember": save a durable fact about the user (a preference, an ongoing project or goal, a',
  "correction, or a useful reference). Do this PROACTIVELY the moment you learn one, without being asked.",
  'action="recall": read your memories (omit slug to list the index, or pass a slug for one memory).',
  'action="forget": remove a memory by slug when it becomes wrong or the user asks you to forget it.',
  "Never store secrets, credentials, or one-off task details. One fact per remember call.",
].join("\n")

export const MemoryTool = Tool.define<typeof Parameters, Metadata, FSUtil.Service>(
  "memory",
  Effect.gen(function* () {
    const fs = yield* FSUtil.Service

    return {
      description: DESCRIPTION,
      parameters: Parameters,
      execute: (params: Schema.Schema.Type<typeof Parameters>, _ctx: Tool.Context<Metadata>) =>
        Effect.gen(function* () {
          if (params.action === "remember") {
            const title = params.title?.trim()
            const content = params.content?.trim()
            if (!title || !content) {
              return {
                title: "memory",
                output: 'remember needs both "title" and "content".',
                metadata: { action: "remember" },
              }
            }
            const slug = slugify(params.slug ?? title)
            const body = `---\nname: ${slug}\ntitle: ${title}\n---\n\n${content}\n`
            yield* fs.writeWithDirs(Memory.fileFor(slug), body)

            // Add a pointer to the index (idempotent on slug).
            const index = (yield* fs.readFileStringSafe(Memory.indexPath)) ?? "# Memory\n"
            let next = index
            if (!index.includes(`(${slug}.md)`)) {
              next = index.replace(/\s*$/, "") + `\n- [${title}](${slug}.md)\n`
            }
            yield* fs.writeWithDirs(Memory.indexPath, next)

            return {
              title: `Remembered: ${title}`,
              output: `Saved memory "${title}" → ${slug}.md`,
              metadata: { action: "remember", slug },
            }
          }

          if (params.action === "recall") {
            if (params.slug) {
              const slug = params.slug.replace(/\.md$/, "")
              const c = yield* fs.readFileStringSafe(Memory.fileFor(slug))
              return {
                title: `recall ${slug}`,
                output: c ?? `No memory found: ${slug}`,
                metadata: { action: "recall", slug },
              }
            }
            const index = (yield* fs.readFileStringSafe(Memory.indexPath)) ?? ""
            return {
              title: "memory",
              output: index.trim() || "No memories saved yet.",
              metadata: { action: "recall" },
            }
          }

          // forget — no hard delete via FSUtil; drop the index pointer and tombstone the file.
          const slug = (params.slug ?? "").replace(/\.md$/, "")
          if (!slug) {
            return { title: "memory", output: 'forget needs a "slug".', metadata: { action: "forget" } }
          }
          const index = (yield* fs.readFileStringSafe(Memory.indexPath)) ?? ""
          const pruned = index
            .split("\n")
            .filter((line) => !line.includes(`(${slug}.md)`))
            .join("\n")
          yield* fs.writeWithDirs(Memory.indexPath, pruned)
          yield* fs.writeWithDirs(Memory.fileFor(slug), `---\nname: ${slug}\n---\n\n(forgotten)\n`)
          return { title: `Forgot ${slug}`, output: `Forgot memory: ${slug}`, metadata: { action: "forget", slug } }
        }).pipe(Effect.orDie),
    } satisfies Tool.DefWithoutID<typeof Parameters, Metadata>
  }),
)
