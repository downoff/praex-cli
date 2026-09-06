import { describe, expect, test } from "bun:test"
import { splitFences } from "../../src/routes/session/index"

describe("splitFences", () => {
  test("prose, fenced code, prose", () => {
    const out = splitFences("Hello\n\n```python\nprint(1)\n```\n\nBye")
    expect(out).toEqual([
      { type: "markdown", text: "Hello" },
      { type: "code", lang: "python", text: "print(1)" },
      { type: "markdown", text: "Bye" },
    ])
  })
  test("unterminated fence while streaming is code", () => {
    const out = splitFences("Start\n```ts\nconst a = 1")
    expect(out.at(-1)).toEqual({ type: "code", lang: "ts", text: "const a = 1" })
  })
  test("no fences -> one markdown segment; tildes and longer fences work", () => {
    expect(splitFences("just text")).toEqual([{ type: "markdown", text: "just text" }])
    const out = splitFences("~~~~\nx\n~~~~\n")
    expect(out).toEqual([{ type: "code", lang: "", text: "x" }])
  })
  test("a shorter closing fence does not close a longer one", () => {
    const out = splitFences("````md\n```\ninner\n```\n````")
    expect(out).toEqual([{ type: "code", lang: "md", text: "```\ninner\n```" }])
  })
})
