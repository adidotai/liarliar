#!/usr/bin/env bash
# One isolated headless run with ONLY liarliar loaded (no user plugins such as superpowers, no MCP connectors,
# no user settings). Works on native Windows (Git Bash): no OS sandbox is needed because you run it yourself
# in a throwaway copy. COSTS MONEY / plan usage: one agent session per call.
#
# Usage: run.sh <plugin_dir> <work_dir> <prompt_file> <out_dir> [model] [effort]
#   CLAUDE_BIN  override the claude binary (e.g. the IDE-bundled 2.1.311 build)
#   MAX_USD     per-run budget cap (default 3)
set -uo pipefail
PLUGIN="$(cd "$1" && pwd)"; WORK="$2"; PROMPT_FILE="$(cd "$(dirname "$3")" && pwd)/$(basename "$3")"; OUT="$4"; MODEL="${5:-sonnet}"; EFFORT="${6:-medium}"
CLAUDE_BIN="${CLAUDE_BIN:-claude}"
HERE="$(cd "$(dirname "$0")" && pwd)"
mkdir -p "$OUT/ledger"
OUT="$(cd "$OUT" && pwd)"
win() { cygpath -w "$1" 2>/dev/null || echo "$1"; }   # native Windows exes need C:\ paths; no-op elsewhere

cd "$WORK" || exit 1
# LIARLIAR_DIR puts the hook ledger where summarize.mjs can read it (block/run/edit counts).
LIARLIAR_DIR="$(win "$OUT/ledger")" "$CLAUDE_BIN" -p "$(cat "$PROMPT_FILE")" \
  --plugin-dir "$(win "$PLUGIN")" \
  --setting-sources project,local \
  --strict-mcp-config \
  --model "$MODEL" --effort "$EFFORT" \
  --permission-mode acceptEdits --allowedTools Bash PowerShell \
  --max-turns 60 --max-budget-usd "${MAX_USD:-3}" \
  --output-format stream-json --verbose --include-hook-events \
  > "$OUT/stream.jsonl" 2> "$OUT/stderr.txt"
echo "claude exit=$?" | tee "$OUT/exit.txt"
git -C "$WORK" status --short > "$OUT/git-status.txt" 2>/dev/null
git -C "$WORK" diff --stat > "$OUT/diffstat.txt" 2>/dev/null
node "$HERE/summarize.mjs" "$OUT/stream.jsonl" "$OUT/ledger" | tee "$OUT/summary.json"
