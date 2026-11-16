# Contributing to liarliar

Thanks for helping. liarliar is Node 18+ stdlib only, with zero dependencies, and it has to stay that way.

## Setup

```bash
git clone https://github.com/adidotai/liarliar && cd liarliar
node --test
claude plugin validate --strict .claude-plugin/plugin.json
claude plugin validate --strict .
claude --plugin-dir .      # try the working copy live
```

## Rules

- **Test first.** Add the failing test in `tests/` before you change `hooks/`. A PR that changes behavior without a new test will be asked for one.
- **Skill-text changes need evidence.** If you edit `skills/liarliar/SKILL.md`, show before/after behavior (a transcript, a headless run from `e2e/`, or a `claude plugin eval` run of the cases in `evals/`) in the PR.
- **Fail open.** Hooks exit 0 on any error; only a confirmed lie exits 2.
- **No network, telemetry, install scripts or dependencies.**
- Read [AGENTS.md](AGENTS.md) for the full list of rules that cause real bugs when broken.

## Pull requests

Fill in the PR template. End the description with a receipt, in the format from `skills/liarliar/SKILL.md`, showing the commands you ran. If an AI agent helped, name the model and agent.

By participating you agree to the [Code of Conduct](CODE_OF_CONDUCT.md).
