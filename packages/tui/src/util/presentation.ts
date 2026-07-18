// Squared-tilde mark + PRAEX wordmark (matches ../logo.ts)
const logo = {
  left: [
    "█▀▀▀▀▀▀▀▀▀█", //
    "█▄▄▀▀▀▄▄▄▀█",
    "█▄▄▄▄▄▄▄▄▄█",
  ],
  right: [
    "█▀▀▀▄ █▀▀▀▄ ▄▀▀▀▄ █▀▀▀▀ ▀▄ ▄▀", //
    "█▄▄▄▀ █▄▄▄▀ █▄▄▄█ █▀▀▀    █  ",
    "█     █  ▀▄ █   █ █▄▄▄▄ ▄▀ ▀▄",
  ],
}

const reset = "\x1b[0m"
const bold = "\x1b[1m"
const dim = "\x1b[90m"
const purple = "\x1b[38;5;141m"
const bright = "\x1b[1m\x1b[97m"

function wordmark(pad = "") {
  return logo.left.map((line, index) => {
    const left = `${purple}${line}${reset}`
    const right = `${bright}${logo.right[index] ?? ""}${reset}`
    return `${pad}${left} ${right}`
  })
}

export function sessionEpilogue(input: { title: string; sessionID?: string }) {
  const weak = (text: string) => `${dim}${text.padEnd(10, " ")}${reset}`
  return [
    ...wordmark("  "),
    "",
    `  ${weak("Session")}${bold}${input.title}${reset}`,
    `  ${weak("Continue")}${bold}praex -s ${input.sessionID}${reset}`,
    "",
  ].join("\n")
}
