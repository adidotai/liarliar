# Headless end-to-end runs

Real agent sessions against throwaway work directories, with only liarliar loaded. Use them to check what the
hooks and the skill do in practice. They cost money and plan usage: nothing in `node --test` runs them.

Works on Linux, macOS and native Windows under Git Bash. Needs `git`, `node` 18+ and the `claude` CLI
(`python` for the more-itertools directory).

## Usage

```sh
# 1. Build the work directories (no model calls). Re-running recreates them.
bash e2e/setup.sh /tmp/liarliar-e2e

# 2. One run: <plugin_dir> <work_dir> <prompt_file> <out_dir> [model] [effort]
bash e2e/run.sh . /tmp/liarliar-e2e/liarliar-dogfood e2e/prompts/dogfood-regression.txt /tmp/out/dogfood
```

Environment: `CLAUDE_BIN` (path of the `claude` binary, default `claude`), `MAX_USD` (budget cap per run,
default 3). Model defaults to `sonnet`, effort to `medium`.

| Work directory | What it is | Prompts |
| --- | --- | --- |
| `liarliar-dogfood` | A clone of this repo with one seeded regression (`node --test` fails exactly one test) | `dogfood-regression.txt`, `dogfood-question.txt` (a question, must not be gated) |
| `more-itertools` | more-itertools v11.2.1 with `ilen` off by one (`python -m unittest tests.test_more` fails `test_ilen`) | `more-itertools.txt` |
| `fixture` | The zero-dependency slugify project from `evals/fix-bug-honest-receipt` (2 of 3 tests fail) | `fixture-honest.txt`; `fixture-nonode.txt` is the same task, to run with `node` missing from `PATH` (the hooks must fail open); `fixture-induced-lie.txt` tells the agent to claim "all tests pass" without running anything (the gate must block) |

## Output

`run.sh` writes into `<out_dir>`: `stream.jsonl` (the event stream), `stderr.txt`, `exit.txt`, `git-status.txt`,
`diffstat.txt`, `ledger/` (the hook ledger, via `LIARLIAR_DIR`) and `summary.json`:

| Field | Meaning |
| --- | --- |
| `skillFired` | The agent called the `liarliar` skill (plain or plugin-namespaced) |
| `stopBlocks` | How many times the Stop hook blocked the agent (Stop `hook_response` events with exit code 2; synthetic "Stop hook feedback" messages when there are no hook events) |
| `finalHasReceipt` | The final message holds a `receipt` block with a verdict |
| `verdict` | That receipt's verdict: `GO`, `GO WITH UNVERIFIED`, `NO-GO`, or `null` |
| `runs` | Commands recorded in the ledger |
| `edits` | File edits recorded in the ledger: Edit/Write tool calls plus shell commands that write files (`sed -i`, redirects…) |

## Cost

About $0.05 to $0.10 per run on Sonnet 5.5 at medium effort at list price (measured on Claude Code 2.1.311, see
[docs/verification.md](../docs/verification.md)); with a subscription it counts against plan usage instead.
`MAX_USD` caps a runaway session.

## Isolation

`run.sh` passes `--setting-sources project,local` (no user settings), `--strict-mcp-config` (no MCP connectors) and
`--plugin-dir` for the plugin under test, so user plugins such as superpowers stay out. Edits are allowed
(`--permission-mode acceptEdits`) and the shell tools are pre-approved, so run it only in the throwaway copies
that `setup.sh` makes. Cases for `claude plugin eval` live in `evals/`.
