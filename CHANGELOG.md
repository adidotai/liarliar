# Changelog

## 0.1.0 (unreleased)

- The liarliar skill and its receipt format.
- A Claude Code Stop hook that catches five lies: no receipt, ghost command, stale proof, a failing run sold as a pass, and a GO with no proof at all.
- Skill-only installs for Codex, Cursor, Gemini CLI and 70+ agents via `npx skills`.
- Verified end-to-end on Claude Code 2.1.217 (Windows): induced false "done" blocked and corrected, questions not gated.
- Verified from the installed plugin cache (a path with a space): a ghost-command receipt was blocked twice and withdrawn, a failing `npm test` was recorded as failed, and a GO receipt citing it was blocked with exit 2.
- Gate fixes: a narrow run no longer launders a broader cited command; loose NO-GO spellings are accepted; commands cited in lists or backticks are recognized; `$` lines under UNVERIFIED are ignored; the blank receipt template is not treated as a receipt.
- Off switch: `LIARLIAR` set to `off`, `0`, `false` or `no` (case-insensitive) disables the gate.
- SKILL.md rewrite: a Process section, a real before/after Example, and a 200-character description.
- `liarliar.zip` release asset for claude.ai and ChatGPT uploads.
- Live verification on Claude Code 2.1.311 (own repo, more-itertools, slugify fixture), and the hooks now exit quietly when Node is missing: see [docs/verification.md](docs/verification.md).
- Engagement, after that verification found liarliar never engaged: every turn that changes files now ends with a receipt (only a check-in question that claims nothing is exempt, so done words are no longer needed to trigger it); shell commands that write files (`sed -i`, redirects, `mv`/`cp`/`rm`, `git apply`/`restore`/`checkout --`, PowerShell `Set-Content` and similar) count as edits, for the demand and for stale proof; and the skill's description now says to use it for any coding task that edits files.
- Re-verified on Claude Code 2.1.311 after the engagement fix: every editing session with the hooks running ended with a receipt, 4 of 7 sessions were blocked (an induced "Fixed, all tests pass." was caught twice and ended as UNVERIFIED), and there was no false GO; the skill loaded at task start in only 1 session, otherwise after a block: see [docs/verification.md](docs/verification.md#re-verification-after-the-engagement-fix).
- Final-review gate fixes: a short check-in question (at most 4 lines and 400 characters, ending in `?`, reporting no result) defers the receipt to a later turn instead of cancelling it; write verbs (`rm`, `cp`, `tee`…) count only in command position and not for `--help` or `--version`, and redirects and `tee` into a temp folder or a device are not edits; formatters in write mode, `git checkout <path>`, `git stash`, `git reset --hard` and more PowerShell cmdlets count as edits; citations in numbered and bullet lists are read; a decorated `**UNVERIFIED**` header is recognised, and only an upper-case UNVERIFIED opens the section; `NO-GO | note`, `## VERDICT NO-GO` and `NOT GO` read as NO-GO.
