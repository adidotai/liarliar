# AGENTS.md: working on liarliar

liarliar makes coding agents prove "done": one skill (`skills/liarliar/SKILL.md`), two hook files (`hooks/`),
and thin per-agent manifests. Node 18+ stdlib only. Zero dependencies.

## This repo runs liarliar on itself

Every turn that changes files ends with a receipt (a short check-in question that reports no result defers it to a later turn; format in `skills/liarliar/SKILL.md`). In Claude Code
the Stop hook checks it.

## Commands

- Tests: `node --test`
- Validate: `claude plugin validate --strict .claude-plugin/plugin.json` and `claude plugin validate --strict .`
  (Claude Code 2.1.281 or later; older versions reject the `icon` field. CI pins 2.1.311.)
- Try the working copy live: `claude --plugin-dir .`
- Headless runs don't load the repo's own plugin; use `claude --plugin-dir .` for scripted checks.

## Where things live

- Rules: `hooks/judge.mjs`, pure functions, unit-tested in `tests/judge.test.mjs`.
- I/O: `hooks/liarliar.mjs` (stdin, ledger file, exit code), tested by spawning it in `tests/hook.test.mjs`.
- Version: one `version` in `.claude-plugin/plugin.json`, `.codex-plugin/plugin.json`, `.cursor-plugin/plugin.json`
  and `gemini-extension.json`. `tests/package.test.mjs` fails if they drift.

## Rules that cause real bugs when broken

- Test first: add the failing test in `tests/` before changing `hooks/`.
- Hooks fail open. Any exception exits 0; only a confirmed lie exits 2.
- Block messages are factual statements, never commands, under 1,000 characters.
- SKILL.md frontmatter: only `name`, `description`, `license`, `compatibility`, `metadata`, `allowed-tools`.
  The description stays on one line, at most 200 characters, with no `<` or `>`; quote it in double quotes if it contains `: `. The core rule stays in the first 10 lines of the body.
- No network calls, telemetry, install scripts or dependencies.
- No root `CLAUDE.md`: it fails `claude plugin validate --strict`. Claude Code reads `.claude/CLAUDE.md`.
- No absolute paths in committed files.

## Releasing

Bump all four manifest versions together, add a dated `## <version> (YYYY-MM-DD)` section to CHANGELOG.md, run the
tests and both validators, then tag `v<version>` and push the tag. The release workflow attaches `liarliar.zip` and
uses that CHANGELOG section as the release notes. The human's ordered checklist is
[docs/RELEASING.md](docs/RELEASING.md).

## If you are an AI agent opening a PR

Include the receipt for the change, and name the model and agent you used.
