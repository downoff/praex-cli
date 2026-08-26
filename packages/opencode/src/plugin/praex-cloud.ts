import type { Hooks, PluginInput } from "@opencode-ai/plugin"
import { createServer } from "http"
import open from "open"
import { OAUTH_DUMMY_KEY } from "../auth"

// Praex Cloud — the hosted tier (praex.ai gateway + velox247 fleet).
// Auth is a Firebase (GCP Identity Platform) ID token, not an API key. Sign-in is the
// loopback flow: `praex auth login` starts a listener on 127.0.0.1, opens
// praex.ai/cli-auth?port=…&state=… in the browser, the page signs the user in with
// Google and redirects back to the listener with the refresh token. A paste-code
// method remains for SSH/headless boxes. ID tokens live 1h, so the credential is
// refreshed inside a custom fetch — never stored in apiKey (it's snapshotted into
// the SDK cache key at load).
const FIREBASE_API_KEY = "AIzaSyBa0F9hDxnYMVObjeleNm_Sxh85UDesaQE" // public web key, not a secret
const SIGNIN_URL = "https://praex.ai/cli-auth"
const REFRESH_SKEW_MS = 60_000
// The page redirects to 127.0.0.1 literally (not "localhost") so a v6-first resolver
// can't send the browser to ::1 while the listener sits on v4.
const CALLBACK_PORT = 1456

type TokenResponse = {
  id_token: string
  refresh_token: string
  expires_in?: string | number
}

async function exchangeRefreshToken(refreshToken: string): Promise<TokenResponse | undefined> {
  const res = await fetch(`https://securetoken.googleapis.com/v1/token?key=${FIREBASE_API_KEY}`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken }),
  })
  if (!res.ok) return undefined
  return (await res.json()) as TokenResponse
}

function expiresAt(tokens: TokenResponse) {
  return Date.now() + Number(tokens.expires_in ?? 3600) * 1000
}

const RESULT_PAGE = (body: string) => `<!doctype html>
<html><head><meta charset="utf-8"><title>Praex</title><style>
  body{background:#0a0a0c;color:#e8e8ec;font:16px/1.6 -apple-system,"Segoe UI",Roboto,sans-serif;
    min-height:100vh;margin:0;display:grid;place-items:center}
  main{text-align:center;padding:24px}
  .mark{width:52px;height:52px;border-radius:14px;background:#1b1b22;border:1px solid #26262e;
    display:grid;place-items:center;font-size:26px;margin:0 auto 18px}
  h1{font-size:22px;letter-spacing:-0.02em;margin:0 0 6px}
  p{color:#8b8b96;margin:0}
</style></head><body><main><div class="mark">~</div>${body}</main></body></html>`

const HTML_SUCCESS = RESULT_PAGE(`<h1>Signed in</h1><p>You can close this tab and return to the terminal.</p>`)
const HTML_ERROR = (msg: string) => RESULT_PAGE(`<h1>Sign-in failed</h1><p>${msg}</p>`)

interface PendingSignIn {
  state: string
  resolve: (tokens: TokenResponse) => void
  reject: (error: Error) => void
}

let callbackServer: ReturnType<typeof createServer> | undefined
let pendingSignIn: PendingSignIn | undefined

async function startCallbackServer(): Promise<number> {
  if (callbackServer) return CALLBACK_PORT

  callbackServer = createServer((req, res) => {
    const url = new URL(req.url || "/", `http://127.0.0.1:${CALLBACK_PORT}`)
    if (url.pathname !== "/auth/callback") {
      res.writeHead(404)
      res.end("Not found")
      return
    }

    const state = url.searchParams.get("state")
    const code = url.searchParams.get("code")

    if (!pendingSignIn || state !== pendingSignIn.state) {
      res.writeHead(400, { "Content-Type": "text/html" })
      res.end(HTML_ERROR("Stale sign-in link. Run <code>praex auth login</code> again."))
      return
    }
    if (!code) {
      const current = pendingSignIn
      pendingSignIn = undefined
      res.writeHead(400, { "Content-Type": "text/html" })
      res.end(HTML_ERROR("The browser sent no credential back. Try again."))
      current.reject(new Error("Missing connect code in callback"))
      return
    }

    const current = pendingSignIn
    pendingSignIn = undefined

    // Verify the refresh token works before telling either side it succeeded.
    exchangeRefreshToken(code)
      .then((tokens) => {
        if (!tokens) throw new Error("Token exchange failed")
        res.writeHead(200, { "Content-Type": "text/html" })
        res.end(HTML_SUCCESS)
        current.resolve(tokens)
      })
      .catch((err) => {
        res.writeHead(400, { "Content-Type": "text/html" })
        res.end(HTML_ERROR("Could not verify the sign-in. Try again."))
        current.reject(err instanceof Error ? err : new Error(String(err)))
      })
  })

  await new Promise<void>((resolve, reject) => {
    callbackServer!.once("error", (err) => {
      callbackServer = undefined
      reject(err)
    })
    callbackServer!.listen(CALLBACK_PORT, "127.0.0.1", () => resolve())
  })

  return CALLBACK_PORT
}

function stopCallbackServer() {
  callbackServer?.close(() => {})
  callbackServer = undefined
}

function waitForCallback(state: string): Promise<TokenResponse> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => {
        if (pendingSignIn?.state === state) {
          pendingSignIn = undefined
          reject(new Error("Sign-in timed out"))
        }
      },
      5 * 60 * 1000,
    )
    pendingSignIn = {
      state,
      resolve: (tokens) => {
        clearTimeout(timeout)
        resolve(tokens)
      },
      reject: (error) => {
        clearTimeout(timeout)
        reject(error)
      },
    }
  })
}

// The hosted tier ships in the binary: every install gets the Praex provider and
// tiers without any config file. A user-defined praex-cloud block in config wins.
const GATEWAY_BASE_URL = "https://praex-gateway-384599766402.us-central1.run.app/v1"
const TIER_LIMITS = { context: 32768, output: 8192 }

export async function PraexCloudAuthPlugin(input: PluginInput): Promise<Hooks> {
  return {
    config: async (cfg) => {
      cfg.provider ??= {}
      if (!cfg.provider["praex-cloud"]) {
        cfg.provider["praex-cloud"] = {
          npm: "@ai-sdk/openai-compatible",
          name: "Praex",
          options: { baseURL: GATEWAY_BASE_URL },
          models: {
            "velox-ii-baked": { name: "Velox II · free", limit: { ...TIER_LIMITS } },
            "faber-i": { name: "Faber I · Pro", limit: { ...TIER_LIMITS } },
            "lucia-i": { name: "Lucia I · Max", limit: { ...TIER_LIMITS } },
          },
        }
      }
    },
    auth: {
      provider: "praex-cloud",
      methods: [
        {
          type: "oauth",
          label: "Praex account · sign in with Google (browser)",
          async authorize() {
            const port = await startCallbackServer()
            const state = Buffer.from(crypto.getRandomValues(new Uint8Array(24))).toString("base64url")
            const url = `${SIGNIN_URL}?port=${port}&state=${state}`
            const tokensPromise = waitForCallback(state)
            open(url).catch(() => {})
            return {
              url,
              instructions:
                "Sign in with Google in the browser. The terminal picks it up automatically. Nothing happening? Press Ctrl+C, run `praex login` again and pick Connect code.",
              method: "auto" as const,
              callback: async () => {
                try {
                  const tokens = await tokensPromise
                  return {
                    type: "success" as const,
                    refresh: tokens.refresh_token,
                    access: tokens.id_token,
                    expires: expiresAt(tokens),
                  }
                } catch {
                  return { type: "failed" as const }
                } finally {
                  stopCallbackServer()
                }
              },
            }
          },
        },
        {
          type: "oauth",
          label: "Connect code · paste from praex.ai (SSH / headless)",
          async authorize() {
            return {
              url: SIGNIN_URL,
              instructions: "Sign in with Google in any browser, then paste the connect code shown on the page.",
              method: "code" as const,
              callback: async (code: string) => {
                const tokens = await exchangeRefreshToken(code.trim())
                if (!tokens) return { type: "failed" as const }
                return {
                  type: "success" as const,
                  refresh: tokens.refresh_token,
                  access: tokens.id_token,
                  expires: expiresAt(tokens),
                }
              },
            }
          },
        },
      ],
      async loader(getAuth) {
        const auth = await getAuth()
        if (auth.type !== "oauth") return {}

        let refreshPromise: Promise<string> | undefined

        return {
          apiKey: OAUTH_DUMMY_KEY,
          async fetch(requestInput: RequestInfo | URL, init?: RequestInit) {
            const headers = new Headers(init?.headers)
            headers.delete("authorization")

            const current = await getAuth()
            if (current.type !== "oauth") return fetch(requestInput, init)

            let access = current.access
            if (!access || current.expires < Date.now() + REFRESH_SKEW_MS) {
              if (!refreshPromise) {
                refreshPromise = exchangeRefreshToken(current.refresh)
                  .then(async (tokens) => {
                    if (!tokens)
                      throw new Error("Praex sign-in expired — run `praex auth login` and pick Praex")
                    await input.client.auth.set({
                      path: { id: "praex-cloud" },
                      body: {
                        type: "oauth",
                        refresh: tokens.refresh_token,
                        access: tokens.id_token,
                        expires: expiresAt(tokens),
                      },
                    })
                    return tokens.id_token
                  })
                  .finally(() => {
                    refreshPromise = undefined
                  })
              }
              access = await refreshPromise
            }

            headers.set("authorization", `Bearer ${access}`)
            return fetch(requestInput, { ...init, headers })
          },
        }
      },
    },
  }
}
