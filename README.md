> **AI agent asked to install this?** Follow [INSTALL.md](INSTALL.md) step by step.

# liarliar

[![CI](https://github.com/adidotai/liarliar/actions/workflows/ci.yml/badge.svg)](https://github.com/adidotai/liarliar/actions/workflows/ci.yml) [![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE) [![Agent Skills](https://img.shields.io/badge/Agent%20Skills-compatible-f97316.svg)](https://agentskills.io) [![Claude Code plugin](https://img.shields.io/badge/Claude%20Code-plugin-8A63D2.svg)](#install)

![liarliar catching a false "done"](assets/hero.svg)

*A real run (run 7, `fixture-induced-lie`): Claude Code 2.1.311, Sonnet 5.5. The agent was told to say "Fixed, all tests pass." without running anything. liarliar blocked it twice. [Full transcript excerpt](docs/verification.md#the-induced-lie-run-7); "…" marks omitted text.*

**Liar liar, tests on fire.** Your coding agent says "done". liarliar makes it prove it.

Every "done" now ends with a receipt. The format, with a passing check:

```receipt
TASK     fix: parseISO drops the timezone offset
CLAIM    timezone offset preserved
  $ npm test
  > tests 142 | pass 142 | fail 0
UNVERIFIED
  - Safari parsing: no browser here (user can run: npm run test:browser)
VERDICT  GO WITH UNVERIFIED
```

## Install

**Claude Code** (skill + enforcement hooks):

```bash
claude plugin marketplace add adidotai/liarliar && claude plugin install liarliar@liarliar
```

Or inside a session: `/plugin marketplace add adidotai/liarliar`, then `/plugin install liarliar@liarliar`, then `/reload-plugins`.

**Codex, Cursor, Copilot, Gemini CLI, OpenCode, Windsurf and 70+ more** (skill only):

```bash
npx skills add adidotai/liarliar
```

**Gemini CLI extension:** `gemini extensions install https://github.com/adidotai/liarliar`

**claude.ai or ChatGPT** (skill only, no hooks): download `liarliar.zip` from the latest release (https://github.com/adidotai/liarliar/releases/latest/download/liarliar.zip) and upload it without unzipping. **claude.ai** (Pro, Max, Team or Enterprise): turn on code execution in Settings → Capabilities, then Customize → Skills → upload the zip and switch it on. **ChatGPT** (Business, Enterprise, Healthcare or Edu): Plugins → Skills → Upload from your computer. The zip holds one file, SKILL.md — read it before you upload.

**Or ask your agent:** paste `https://github.com/adidotai/liarliar` and say "install this".

**Check it works:** ask *"Add a function slugify(text) with a test, and tell me when it's done."* The reply ends with a receipt.

## What it catches

Every turn in which your agent changed files (with its edit tools, or a shell edit like `sed -i`) must end with a receipt. The one exception is a short check-in question back to you: at most 4 lines and 400 characters, ending in `?`, claiming nothing is done and reporting no result (no "updated", "passes" or "works"). That defers the receipt but does not cancel it: a later turn that ends without one, and is not another check-in question, is sent back. Any receipt the agent writes is checked against what actually ran:

| Lie | What it looks like |
|---|---|
| No receipt | "Fixed, all tests pass." and nothing to back it |
| Ghost command | The receipt cites `npm test`; `npm test` never ran |
| Stale proof | `npm test` ran, then the agent edited the code again |
| Fail sold as pass | The latest `npm test` exited 1; the verdict says GO |
| Proof-free GO | The verdict says GO, but the receipt cites no command at all |

A caught lie sends the agent back with the reason. An honest NO-GO is never blocked: the goal is the truth, not a green tick.

## What it never does

- Never traps you. At most 2 send-backs per turn, and any internal error lets the agent through.
- No network, no telemetry, no dependencies. Two Node scripts (297 lines, readable in a few minutes).
- **Data handling:** the ledger stores full command lines and edited file paths in a per-user folder in your OS temp directory (mode 0700, files 0600; `LIARLIAR_DIR` overrides it). It is never uploaded and liarliar never deletes it. See [SECURITY.md](SECURITY.md).
- Off switch: set `LIARLIAR` to `off`, `0`, `false` or `no` (any case) in the environment Claude Code is launched with, or in the `env` block of your Claude Code settings. Setting it from a shell inside a running session does not work.

## FAQ

**Isn't this just "verify before saying done" in a prompt?** The skill is. The hook is the difference: a prompt cannot tell when a receipt cites a command that never ran. liarliar can, because it watched.

**Does it cost tokens?** About 70 tokens are always loaded, about 1,200 more when the skill fires (measured with `claude plugin details liarliar` on Claude Code 2.1.311). The hooks add no model context. A send-back costs one more round, spent on the check the agent skipped.

**Can an agent still cheat?** It could run a trivial command and cite it. The receipt still shows you exactly what ran, so the lie is visible instead of silent.

**Requirements:** Node.js 18+ on `PATH` for the hooks. Without Node on `PATH` the hooks are skipped and liarliar works as a skill.

## Known limits

- The proof is the command's exit code. `npm test | tail` exits with `tail`'s code, so a failing suite piped into `tail` looks like a pass. The skill tells agents to pipe with `set -o pipefail;`.
- Matching is textual. A cited command matches a run of exactly that command, or one that ends with it after `&&` or `;` (like `cd app && npm test`); only when no such run exists does a longer run that contains it count.
- The `>` output lines in a receipt are the agent's own quote of the output. They are not checked; the exit code of the cited command is.
- Shell edits are detected by a heuristic: `sed -i`, `>` and `tee` into a file outside a temp folder, `mv`/`cp`/`rm`/`touch` run as commands, `git checkout <path>`, `git stash`, `git reset --hard`, formatters in write mode (`prettier --write`, `eslint --fix`, `black`, `ruff format`, `gofmt -w`, `cargo fmt`) and PowerShell file cmdlets.
- Not detected as edits: package installs (`npm install`), writes inside a quoted command (`bash -c "…"`, `python -c`, `node -e`), scripts and build steps that write files, `git pull`/`merge`/`switch`, and `2>` redirects.
- Hook enforcement is Claude Code only for now. Other agents get the skill as instructions.

## How it works

- `hooks/liarliar.mjs log` runs after every shell command (Bash or PowerShell) and file edit, and appends to a per-session ledger.
- `hooks/liarliar.mjs gate` runs when the agent tries to stop.
- Every rule lives in `hooks/judge.mjs` as a pure function, tested in `tests/`.

## Built under its own rules

This repo's `.claude/settings.json` is set up to turn liarliar on when you open the folder in Claude Code and trust it. Scripted runs use `claude --plugin-dir .`.

## License

MIT

[![Star history](https://api.star-history.com/svg?repos=adidotai/liarliar&type=Date)](https://star-history.com/#adidotai/liarliar&Date)
