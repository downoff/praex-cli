export function wslServerIdsToStartOnInitialize(servers: { id: string }[]) {
  return servers.map((server) => server.id)
}

// praex.ai/install.sh always installs the latest CLI and cannot pin `expected`, so a
// successful install is any distro that now reports a version at all.
export function expectOpencodeVersion(installed: string | null, expected: string, distro = "Debian") {
  if (installed) return
  throw new Error(`Praex install finished but ${distro} still reports no version; expected ${expected}`)
}

export const pendingRestartAfterWslInstall = (runtime: { available: boolean }) => !runtime.available

export async function pollWslHealth(check: () => Promise<boolean>, signal: AbortSignal, interval = 100) {
  while (!signal.aborted) {
    if (await check()) return
    await abortableDelay(interval, signal)
  }
}

function abortableDelay(duration: number, signal: AbortSignal) {
  return new Promise<void>((resolve) => {
    const done = () => {
      clearTimeout(timeout)
      signal.removeEventListener("abort", done)
      resolve()
    }
    const timeout = setTimeout(done, duration)
    signal.addEventListener("abort", done, { once: true })
  })
}
