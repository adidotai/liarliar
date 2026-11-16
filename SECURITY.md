# Security policy

## Reporting a vulnerability

Please use GitHub's private vulnerability reporting: open the repository's **Security** tab and choose **Report a vulnerability**. Do not open a public issue for a security problem.

## What liarliar runs

Two Node scripts, 297 lines in total, with no network calls and no dependencies:

- `hooks/judge.mjs`: the rules, as pure functions.
- `hooks/liarliar.mjs`: reads the hook input on stdin, writes the ledger, sets the exit code.

## What it stores

The ledger records full command lines and edited file paths. It lives in a per-user folder in your OS temp directory (`liarliar-<uid or username>`, mode 0700, files 0600). Set `LIARLIAR_DIR` to put it elsewhere. liarliar never uploads the ledger and never deletes it. Command lines can contain secrets, so redact them before sharing an excerpt.

## Read before you install

Public reports in 2026 showed malicious agent skills that ship scripts and hooks. Before you install any skill that ships code, read its scripts. For liarliar, read `hooks/`: it is short enough to read in a few minutes.
