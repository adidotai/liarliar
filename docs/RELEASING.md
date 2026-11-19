# Releasing liarliar 0.1.0

This is the maintainer's ordered checklist for publishing `github.com/adidotai/liarliar`. Run the steps in order.
The checks below (tests, validators, tag dry run) are already done in the repo; re-run them if you change anything,
and after step 0 if you rewrite the history:

```bash
node --test
claude plugin validate --strict .claude-plugin/plugin.json
claude plugin validate --strict .
claude plugin tag --dry-run .
git status
```

From 0.1.1 on, `plugin.json` has an `icon` field, and `--strict` validation needs Claude Code 2.1.281 or later (CI pins
2.1.311). With an older `claude`, run `npx -y @anthropic-ai/claude-code@2.1.311 plugin validate --strict .` instead.
For a release after 0.1.0, follow [Later releases](#later-releases) at the end.

`claude plugin tag --dry-run .` prints `liarliar--v0.1.0` as its suggested tag. We tag `v0.1.0` instead. The
release workflow (`.github/workflows/release.yml`) runs on both `v*` and `liarliar--v*`, so either form works; use
one, never both.

## 0. Decide what history to publish

`gh repo create … --push` (step 2) publishes every commit: each author name and email, and the full contents of
every old commit, including text that later commits removed (old URLs, local paths, a previous username). Check what
is there before you push:

```bash
git log --format='%an <%ae>' | sort | uniq -c
```

Pick one option. For (a) and (b) you need the GitHub noreply address `<id>+adidotai@users.noreply.github.com`;
the id comes from:

```bash
gh api users/adidotai --jq .id
```

**(a) One clean root commit.** The repo starts with a single commit, authored with the noreply address. Start from
a clean `git status` (`git add -A` stages every untracked file that is not ignored), and back up the full history
first:

```bash
git bundle create ../liarliar-full-history.bundle --all
git checkout --orphan release && git add -A && git -c user.email=<noreply> -c user.name="Aditya Abhiram" commit -m "liarliar v0.1.0"
git branch -M release main
```

**(b) Rewrite the history** with `git filter-repo`, which keeps every commit but changes the author email and
replaces text in all of them. Install it with `pip install git-filter-repo`, take the same bundle backup as in (a),
then write a mailmap line `Aditya Abhiram <noreply> <old email>` and one `--replace-text` line `old==>new` for each
string to scrub (the old username, each local path prefix). `git filter-repo` refuses to rewrite a repo that is
not a fresh clone, so run it in one and publish from there:

```bash
git clone --no-local . ../liarliar-clean && cd ../liarliar-clean
git filter-repo --mailmap ../mailmap.txt --replace-text ../replacements.txt
```

**(c) Publish as is, knowingly.** Every author email and every old commit's contents become public.

After (a) or (b), set the noreply address for future commits in this repo, then re-run the checks at the top:

```bash
git config user.email <noreply>
```

## 1. Log in as adidotai

The `gh` CLI on this machine may be logged in as a different account. Switch it before step 2.

```bash
gh auth login --hostname github.com
gh auth switch --hostname github.com --user adidotai
gh auth setup-git
gh api user --jq .login
```

The last command must print `adidotai`. If it does not, stop.

Then check the commit email. Run `git log --format=%ae | sort -u` in the repo. The noreply address from step 0 is
always attributed to adidotai; any other address must be listed and verified on the adidotai account (GitHub,
Settings, Emails), or those commits will not be attributed to adidotai.

## 2. Create the private repo and push

```bash
gh repo create adidotai/liarliar --private --source . --remote origin --push
gh run watch --exit-status
```

`gh run watch` follows the first CI run and, with `--exit-status`, exits non-zero if it fails. All six test jobs
(3 OS × Node 18 and 22) and the validate job must pass before you go on.

## 3. Set the description and topics

```bash
gh repo edit adidotai/liarliar --description "Liar liar, tests on fire. Your coding agent says \"done\"; liarliar makes it prove it. A skill plus a Claude Code Stop hook: every turn that edits files (shell edits count) must end with a receipt of commands that actually ran. It catches five lies, from no receipt to a failed run sold as a pass. Zero deps, no network. Works with 70+ agents." --add-topic claude-code --add-topic claude-code-plugin --add-topic claude-skills --add-topic agent-skills --add-topic ai-agents --add-topic claude --add-topic claude-code-hooks --add-topic coding-agents --add-topic ai-coding --add-topic agentic-coding --add-topic llm --add-topic developer-tools --add-topic testing --add-topic verification --add-topic code-quality --add-topic hallucination --add-topic codex --add-topic cursor --add-topic gemini-cli --add-topic anthropic
```

The description is under 350 characters. Leave the homepage empty for now.

## 4. Create the issue label

The issue forms use `bug`, `enhancement` (both default labels) and `false-block` (not a default label).

```bash
gh label create false-block --repo adidotai/liarliar --color F97316 --description "liarliar blocked an honest receipt"
```

## 5. Upload the social preview (web UI only)

Repo Settings, General, Social preview, Edit, Upload an image. Choose `assets/social-preview.png`.

## 6. Date the changelog

In `CHANGELOG.md`, change `## 0.1.0 (unreleased)` to `## 0.1.0 (YYYY-MM-DD)` with the real date. The heading must
still start with `## 0.1.0 `: the release workflow uses the CHANGELOG section whose heading matches the tag's version
as the release notes, and fails when there is none.

```bash
git add CHANGELOG.md
git commit -m "docs: date the 0.1.0 changelog"
git push
```

## 7. Tag and release

Push the commit first (step 6), then tag that commit.

```bash
git tag v0.1.0
git push origin v0.1.0
gh run watch --exit-status
gh release view v0.1.0
```

The workflow runs the tests, builds `liarliar.zip` from `skills/liarliar`, checks that it holds only
`liarliar/SKILL.md`, and creates the GitHub Release with the zip attached. When `gh run watch` asks, pick the
`release` run. `gh release view v0.1.0` must list `liarliar.zip` as an asset.

## 8. Make the repo public

```bash
gh repo edit adidotai/liarliar --visibility public --accept-visibility-change-consequences
```

## 9. Enable private vulnerability reporting

GitHub offers it for public repositories, so do this right after step 8. Repo Settings, Code security, Private
vulnerability reporting, Enable. `SECURITY.md` tells reporters to use it.

## 10. Verify from outside the repo

Do all of this from a folder that is NOT inside the repo. The repo's own `.claude/settings.json` declares a local
marketplace that is also named `liarliar`, and running `marketplace remove` inside the repo rewrites that tracked
file.

```bash
cd "$(mktemp -d)"
claude plugin marketplace add adidotai/liarliar && claude plugin install liarliar@liarliar
claude plugin details liarliar
npx skills add adidotai/liarliar --list
curl -L -o liarliar.zip https://github.com/adidotai/liarliar/releases/latest/download/liarliar.zip
unzip -l liarliar.zip
```

Then, by hand:

- Upload `liarliar.zip` to claude.ai (Customize, Skills) and to ChatGPT (Plugins, Skills, Upload). Both need the
  paid plans listed in the README. Confirm the skill appears and can be switched on.

Clean up the verification install, again from outside the repo:

```bash
claude plugin uninstall liarliar@liarliar && claude plugin marketplace remove liarliar
```

Only after this cleanup, check self-hosting: open the repo folder in Claude Code interactively, trust it when asked,
and check that `/plugin` shows liarliar enabled from the repo's own local marketplace. Headless runs cannot do this
check. Doing it before the cleanup would test the GitHub-installed `liarliar` marketplace instead, which has the same
name and shadows the local one.

## 11. Optional: claude.ai directory submission

At `claude.ai/directory/manage`: Submit new, then Plugin bundle. It needs a paid plan, and the repo must be public.

## Later releases

The repo is already public, so a later release is short. Replace `X.Y.Z` with the new version.

1. Set `"version": "X.Y.Z"` in `.claude-plugin/plugin.json`, `.codex-plugin/plugin.json`,
   `.cursor-plugin/plugin.json` and `gemini-extension.json`.
2. Add a `## X.Y.Z (YYYY-MM-DD)` section at the top of `CHANGELOG.md`. It becomes the release notes.
3. Run the checks at the top of this page, then commit, push, tag and watch the release:

```bash
git push
git tag vX.Y.Z
git push origin vX.Y.Z
gh run list --repo adidotai/liarliar --limit 3
gh release view vX.Y.Z --repo adidotai/liarliar
```

`gh release view` must list `liarliar.zip`, and the notes must start with `## X.Y.Z`. Claude Code users get the new
version with `claude plugin marketplace update liarliar`, then `claude plugin update liarliar@liarliar`.
