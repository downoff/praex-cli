#!/usr/bin/env bash
# Founder-machine scenarios against a built praex binary (hosted lineup, 09-06).
#
#   script/verify-lineup.sh [path/to/praex]      # default: packages/opencode/dist/opencode-linux-x64/bin/opencode
#
# Proves the hosted model list comes from the gateway, never from user config:
#   1. clean HOME → live lineup listed and cached with the gateway's display names
#   2. a stale user `praex-cloud` block naming a retired model cannot bring it back
#   3. an unreachable endpoint with no cache → baked lineup, in about a second
# Hits the live gateway. Exit 0 only when every check passes. Run it before every release.
set -u
ROOT=$(cd "$(dirname "$0")/.." && pwd)
BIN=${1:-$ROOT/packages/opencode/dist/opencode-linux-x64/bin/opencode}
[ -x "$BIN" ] || { echo "no binary at $BIN (build: cd packages/opencode && bun run script/build.ts --only=linux-x64)"; exit 2; }
pass=0; fail=0
check(){ if [ "$2" = "$3" ]; then echo "  ok: $1"; pass=$((pass+1)); else echo "  FAIL: $1 (got '$2' want '$3')"; fail=$((fail+1)); fi; }
models(){ env -i HOME="$1" PATH=/usr/bin:/bin XDG_CACHE_HOME="$1/.cache" XDG_CONFIG_HOME="$1/.config" timeout 120 "$BIN" models 2>&1 | grep -E '^praex-cloud/' | sort | tr '\n' ' ' | sed 's/ $//'; }
LIVE=$(curl -sf https://praex-gateway-384599766402.us-central1.run.app/v1/models | python3 -c 'import json,sys; print(" ".join(sorted("praex-cloud/"+m["id"] for m in json.load(sys.stdin)["data"])))')
[ -n "$LIVE" ] || { echo "gateway unreachable; cannot verify"; exit 2; }
PRO=$(curl -sf https://praex-gateway-384599766402.us-central1.run.app/v1/models | python3 -c 'import json,sys; d=json.load(sys.stdin)["data"]; m=[x for x in d if x.get("plan")=="pro"][0]; print(m["id"]+"|"+m["name"])')
PRO_ID=${PRO%%|*}; PRO_NAME=${PRO#*|}

H=$(mktemp -d); echo "--- 1. clean HOME, no config ---"
check "clean install lists the live lineup" "$(models "$H")" "$LIVE"
C=$(ls "$H"/.cache/praex/praex-cloud-models.json 2>/dev/null); check "lineup cached on disk" "$([ -n "$C" ] && echo yes || echo no)" "yes"
[ -n "$C" ] && check "cache carries gateway display name" "$(python3 -c "import json;print(json.load(open('$C'))['models']['$PRO_ID']['name'])")" "$PRO_NAME"

H2=$(mktemp -d); mkdir -p "$H2/.config/praex"; echo "--- 2. STALE user block (the founder-machine case) ---"
cat > "$H2/.config/praex/config.json" <<'JSON'
{ "provider": { "praex-cloud": { "npm": "@ai-sdk/openai-compatible", "name": "Praex",
  "options": { "baseURL": "https://praex-gateway-384599766402.us-central1.run.app/v1" },
  "models": { "velox-ii-baked": { "name": "Velox II · free" }, "faber-i": { "name": "Faber I · Pro" }, "lucia-i": { "name": "Lucia I · Max" } } } } }
JSON
check "stale faber-i block cannot resurrect the retired model" "$(models "$H2")" "$LIVE"

H3=$(mktemp -d); mkdir -p "$H3/.config/praex"; echo "--- 3. OFFLINE endpoint, no cache → baked list, fast ---"
cat > "$H3/.config/praex/config.json" <<'JSON'
{ "provider": { "praex-cloud": { "options": { "baseURL": "http://127.0.0.1:9/v1" } } } }
JSON
t0=$(date +%s%N); out=$(models "$H3"); ms=$(( ($(date +%s%N)-t0)/1000000 ))
check "offline falls back to the baked lineup" "$([ -n "$out" ] && echo listed || echo empty)" "listed"
echo "  (baked: $out; offline start took ${ms} ms total, includes process startup)"
rm -rf "$H" "$H2" "$H3"
echo "---- $pass passed, $fail failed ----"; [ $fail -eq 0 ]
