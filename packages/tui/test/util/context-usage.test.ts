import { describe, expect, test } from "bun:test"
import { contextUsage } from "../../src/util/context-usage"

const msg = (input: number, output: number, cacheRead = 0) =>
  ({
    role: "assistant",
    tokens: { input, output, reasoning: 0, cache: { read: cacheRead, write: 0 } },
  }) as any

describe("contextUsage", () => {
  test("first turn on a fixed-prefix model reads as nearly empty, not 63%", () => {
    // 20.6k prompt (prefix) + 90 output against a 32k window
    const out = contextUsage([msg(20_600, 90)], 32_768)
    expect(out?.label).toBe("90 (1% of context)")
  })
  test("conversation growth is measured against the room left after the prefix", () => {
    const out = contextUsage([msg(20_600, 90), msg(26_700, 400)], 32_768)
    // prefix 20.6k; last total 27.1k -> used 6.5k of 12.2k room ≈ 53%
    expect(out?.pct).toBe(53)
    expect(out?.label).toMatch(/^6\.5K \(53% of context\)$/)
  })
  test("no limit -> raw token count", () => {
    expect(contextUsage([msg(1_000, 50)], undefined)?.label).toBe("1.1K")
  })
  test("no answered message -> undefined", () => {
    expect(contextUsage([msg(1_000, 0)], 32_768)).toBeUndefined()
  })
  test("prefix above the limit falls back to the raw share, capped at 100", () => {
    const out = contextUsage([msg(40_000, 10)], 32_768)
    expect(out?.pct).toBe(100)
  })
})
