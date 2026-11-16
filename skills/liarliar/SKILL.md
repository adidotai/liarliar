---
name: liarliar
description: "Use for any coding task that edits files. Before ending the turn, prove each claim with a command run after the last edit in a receipt block, or mark it UNVERIFIED."
license: MIT
---

# liarliar

**Every turn that changes files ends with a receipt.** No receipt, no "done". Every claim cites a command you
ran in this session *after your last edit*, and the output line that proves it. Anything you could not check
goes under UNVERIFIED, with the reason. The user will ship on your word: an honest NO-GO is a good outcome; a
false GO is the worst one.

## Process

1. List each claim you will make: fixed, passing, builds, works.
2. After your last edit, run the check that proves each one, and read its output.
3. If a check fails, fix it and run every check again, or report NO-GO.
4. If you cannot run commands at all, every claim is UNVERIFIED: the verdict is at most GO WITH UNVERIFIED.
5. End every turn that changed files with the receipt. The one exception is a short check-in question to the
   user (at most 4 lines and 400 characters, ending in `?`) that claims nothing is done and reports no result,
   such as "updated", "passes" or "works". It defers the receipt, it does not cancel it: a later turn owes it.

## The receipt

A fenced code block with the info string `receipt`. Copy each command exactly as you ran it.

```receipt
TASK     <one line: what was asked>
CLAIM    <what you claim>
  $ <exact command you ran>
  > <output line that proves it: exit code, pass/fail counts, diff stat>
UNVERIFIED
  - <claim>: <why it could not be checked> (user can run: <command>)
VERDICT  GO | GO WITH UNVERIFIED | NO-GO
```

Pick exactly one verdict:
- **GO**: every claim has fresh, passing evidence, and at least one `$` command proves it.
- **GO WITH UNVERIFIED**: the evidence you have is fresh and passing, but some claims could not be checked.
- **NO-GO**: something you were asked to fix still fails, or the task could not be done. Say what fails.

## Example

Before (`npm test` last ran before the final edit; two tests now fail):

> Fixed, all tests pass.

After (fixed the two `formatDate` tests the change broke, then re-ran):

```receipt
TASK     fix: parseISO drops the timezone offset
CLAIM    timezone offset preserved
  $ npm test
  > tests 142 | pass 142 | fail 0
UNVERIFIED
  - Safari parsing: no browser here (user can run: npm run test:browser)
VERDICT  GO WITH UNVERIFIED
```

## Evidence

- Counts: a test, build, type-check or lint run after your last edit, or a reproduction that failed before the
  change and passes after. For UI, a screenshot or browser check.
- Does not count: reading the code, "the change is small", "this should pass", output you did not read, or a run
  from before your last edit (stale: run it again).
- The command's own exit code is the proof. Run it unpiped, or start with `set -o pipefail;` before piping into
  `tail` or `head`; otherwise the pipe reports `tail`'s exit code. A check that passes by finding nothing must
  still exit 0: `! grep -rq oldName src/`.
- Never skip the run because the fix looks obvious, call a failure "probably unrelated", or skip, weaken or
  delete a failing test. Report it.

## Enforcement

Where liarliar's hooks are installed (Claude Code today), a check compares the receipt with what actually ran
and sends you back for five lies: a turn that edited files and ends without a receipt, a ghost command that
never ran, stale proof from before your last edit, a failing run sold as a pass, or GO with no command cited.
Shell commands that write files, such as `sed -i` or a `>` redirect, count as edits. A short check-in question
defers the receipt: the next turn that ends without one, and is not another check-in question, is sent back. An
honest NO-GO always gets through. Elsewhere it runs on your honour.
