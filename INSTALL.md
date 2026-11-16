# Installing liarliar (instructions for AI agents)

Your user asked you to install liarliar from https://github.com/adidotai/liarliar.
Follow the section for the agent you are running in, run the commands yourself, and report the result.
Do not clone the repo and copy files by hand: in Claude Code that skips the hooks, which are the part that
checks receipts.

## Claude Code

Run in the shell:

```bash
claude plugin marketplace add adidotai/liarliar
claude plugin install liarliar@liarliar
```

If `marketplace add` reports that `liarliar` is already registered, run `claude plugin marketplace update liarliar`
and continue.

Check: `claude plugin list` shows `liarliar@liarliar` as enabled.

Then tell the user: "liarliar is installed. Run /reload-plugins (or restart Claude Code) to turn it on."

## Gemini CLI

```bash
gemini extensions install https://github.com/adidotai/liarliar
```

## Any other agent (Codex, Cursor, Copilot, OpenCode, Windsurf and others)

```bash
npx skills add adidotai/liarliar
```

This installs the skill. Hook enforcement is Claude Code only for now.

## claude.ai or ChatGPT

An agent cannot install a skill from inside a chat app. Give the user the upload steps from the README: download `liarliar.zip` from https://github.com/adidotai/liarliar/releases/latest/download/liarliar.zip and upload it without unzipping (claude.ai: Customize → Skills, with code execution on in Settings → Capabilities; ChatGPT: Plugins → Skills → Upload from your computer). This installs the skill only, no hooks.

To check, the user starts a new chat and asks for a small change "and tell me when it is done". The reply should end with a `receipt` block.

## After installing

Tell the user how to check it: ask "Add a function slugify(text) with a test, and tell me when it's done."
The reply should end with a `receipt` block that cites the test command.

Requirements: Node.js 18+ on `PATH` for the Claude Code hooks. Without Node, liarliar still works as a skill.
