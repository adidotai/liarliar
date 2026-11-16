import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { checkInDeferred, decide, entryFor, judge, ledgerDir, MAX_BLOCKS, parseLedger, readVerdict } from "../hooks/judge.mjs";

const run = (cmd, ok = true) => ({ k: "run", cmd, ok });
const wrun = (cmd, ok = true) => ({ k: "run", cmd, ok, writes: true });
const edit = (file = "src/a.js") => ({ k: "edit", file });
const stop = { k: "stop" };
const block = { k: "block" };
const done = (...lines) => `Fixed, all tests pass.\n\n\`\`\`receipt\n${lines.join("\n")}\n\`\`\``;
const goNpmTest = done("TASK     fix slug", "CLAIM    slug works", "  $ npm test", "  > pass 3 fail 0", "VERDICT  GO");

// entryFor
test("records a passing Bash command, whitespace-normalized", () => {
  assert.deepEqual(
    entryFor({ hook_event_name: "PostToolUse", tool_name: "Bash", tool_input: { command: "  npm   test " } }),
    { k: "run", cmd: "npm test", ok: true },
  );
});

test("records a failing Bash command as ok:false", () => {
  assert.deepEqual(
    entryFor({ hook_event_name: "PostToolUseFailure", tool_name: "Bash", tool_input: { command: "npm test" }, error: "Exit code 1", is_interrupt: false }),
    { k: "run", cmd: "npm test", ok: false },
  );
});

test("records PowerShell commands like Bash (Claude Code on Windows)", () => {
  assert.deepEqual(
    entryFor({ hook_event_name: "PostToolUseFailure", tool_name: "PowerShell", tool_input: { command: "npm test" }, error: "Exit code 1", is_interrupt: false }),
    { k: "run", cmd: "npm test", ok: false },
  );
});

test("skips a command the user interrupted", () => {
  assert.equal(entryFor({ hook_event_name: "PostToolUseFailure", tool_name: "Bash", tool_input: { command: "npm test" }, is_interrupt: true }), null);
});

test("records file edits from Edit, Write, MultiEdit and NotebookEdit", () => {
  for (const tool of ["Edit", "Write", "MultiEdit"]) {
    assert.deepEqual(entryFor({ tool_name: tool, tool_input: { file_path: "src/a.js" } }), { k: "edit", file: "src/a.js" });
  }
  assert.deepEqual(entryFor({ tool_name: "NotebookEdit", tool_input: { notebook_path: "a.ipynb" } }), { k: "edit", file: "a.ipynb" });
});

test("does not count a background command as a run: it has no result yet", () => {
  assert.equal(entryFor({ hook_event_name: "PostToolUse", tool_name: "Bash", tool_input: { command: "npm test", run_in_background: true } }), null);
});

test("ignores other tools, empty commands and junk input", () => {
  assert.equal(entryFor({ tool_name: "Read", tool_input: { file_path: "a" } }), null);
  assert.equal(entryFor({ tool_name: "Bash", tool_input: {} }), null);
  assert.equal(entryFor(null), null);
});

const ran = (command, tool = "Bash") => entryFor({ hook_event_name: "PostToolUse", tool_name: tool, tool_input: { command } });

test("a shell edit counts as an edit", () => {
  const cmd = "sed -i 's/a/b/' src/a.js";
  assert.deepEqual(ran(cmd), { k: "run", cmd, ok: true, writes: true });
  assert.match(judge("All good.", [wrun(cmd)]) ?? "not gated", /has no receipt/);
});

test("writing commands are detected and read-only ones are not", () => {
  const writing = ["echo x > out.txt", "cat a >> b", "tee log.txt", "mv a b", "cp a b", "rm a", "touch a",
    "git apply p.diff", "git restore a", "git checkout -- a", "perl -i -pe s/a/b/ f"];
  for (const cmd of writing) assert.deepEqual(ran(cmd), { k: "run", cmd, ok: true, writes: true }, cmd);
  for (const cmd of ["Set-Content a.txt x", "Remove-Item a"]) {
    assert.deepEqual(ran(cmd, "PowerShell"), { k: "run", cmd, ok: true, writes: true }, cmd);
  }
  const readOnly = ["npm test", "npm test 2>&1", "npm test > /dev/null", "npm test 2>&1 | tail -5", "grep -rn x src",
    "git status", "ls -la"];
  for (const cmd of readOnly) assert.deepEqual(ran(cmd), { k: "run", cmd, ok: true }, cmd);
});

const writes = (cmd, tool) => ran(cmd, tool)?.writes === true;
const assertWrites = (cmds, expected, tool) => {
  for (const cmd of cmds) assert.equal(writes(cmd, tool), expected, `${JSON.stringify(cmd)} should ${expected ? "" : "not "}write`);
};

test("redirects and tee into a temp folder or a device are not writes", () => {
  assertWrites(["node --test > /tmp/t.log 2>&1; tail /tmp/t.log", "npm test 2>&1 | tee /tmp/test.log",
    "git diff > /tmp/review.patch", "echo x > $TMPDIR/x", "echo x > /var/tmp/x", 'echo x > "$TMPDIR/my log"',
    "> %TEMP%\\x", "npm test | tee -a /tmp/t.log", "cat f | tee /dev/stderr"], false);
  assertWrites(["Out-File $env:TEMP\\x.txt", "'x' | Out-File -FilePath $env:TEMP\\x.txt", "npm test > $env:TEMP\\t.log"], false, "PowerShell");
  assertWrites(["echo x > tmp/x", "npm test | tee test.log", "tee -a /tmp/t.log out.log"], true);
});

test("write verbs count only in command position", () => {
  assertWrites(["grep -rn patch src", "rg rm scripts/", "docker run --rm img", "scp a host:b", "man cp", "which rm"], false);
  assertWrites(["sudo rm f", "xargs rm < list", "xargs -0 rm < list", "env X=1 rm f", "X=1 rm f", "command rm f",
    "time touch f", "nohup cp a b", "(cd src; rm f)", "cd src && mv a b", "npm test || rm f", "a | tee b",
    "find . -name '*.tmp' -exec rm {} \\;", "cd src\nrm f", "if true; then rm f; fi"], true);
});

test("--help and --version runs are not writes", () => {
  assertWrites(["cp --help", "mv --version", "rm --help", "tee --help", "git stash --help", "git checkout --help"], false);
});

test("probed read-only commands stay read-only", () => {
  assertWrites(["echo 'a > b'", 'git commit -m "rm the cp"', "grep -n => src", "echo a >= b", "echo a->b",
    "npm test 2>/dev/null", "npm test &>/dev/null", "npm test >| /dev/null", "npm test 1>&2"], false);
  assertWrites(["npm test > $null", "npm test 2>$null", "npm test > NUL"], false, "PowerShell");
  assertWrites(["echo x >| f"], true);
});

test("a temp-file redirect after the proof does not make it stale", () => {
  assert.equal(judge(goNpmTest, [edit(), run("npm test"), ran("git diff > /tmp/x")]), null);
});

test("formatters that rewrite files are writes; check modes are not", () => {
  assertWrites(["npx prettier --write .", "prettier -w src", "npx eslint --fix .", "black .", "black src/",
    "python -m black .", "ruff format .", "ruff check --fix .", "gofmt -w .", "cargo fmt", "go fmt ./..."], true);
  assertWrites(["npx prettier --check .", "npx eslint .", "black --check .", "black --diff src", "ruff format --check .",
    "gofmt -l .", "cargo fmt --check", "cargo fmt -- --check", "echo black", "grep -rn black src"], false);
});

test("git commands that rewrite the working tree are writes", () => {
  assertWrites(["git checkout a.js", "git checkout .", "git checkout src/a.js", "git checkout ./src", "git checkout HEAD -- a",
    "git stash", "git stash pop", "git stash apply", "git reset --hard", "git reset --hard HEAD~1", "git -C app checkout .",
    "git rm a", "git mv a b"], true);
  assertWrites(["git checkout main", "git checkout -b feature", "git checkout feature/login", "git checkout v0.1.0",
    "git stash list", "git stash show -p", "git reset HEAD a", "git log -- a", "echo git stash"], false);
});

test("PowerShell write cmdlets and aliases are writes in any case", () => {
  assertWrites(["Rename-Item a b", "rename-item a b", "Clear-Content a", "CLEAR-CONTENT a", "del a", "DEL a", "ni a",
    "NI a", "RM a", "set-content a x"], true, "PowerShell");
  assertWrites(["Get-ChildItem", "Get-Content a", "Select-String del a", "npm test | Out-Null"], false, "PowerShell");
});

test("write verbs called by path are writes", () => {
  assertWrites(["/bin/rm f", "/usr/bin/cp a b", "\\rm f", "sudo /bin/mv a b"], true);
});

test("write detection stays fast on long brace runs and heredocs", () => {
  // `{` starts a command; a scan that also crossed `{` used to rescan the rest of the run from every `{`.
  let json = "[";
  while (json.length < 200 * 1024) json += `{"id":${json.length},"tags":["a","b"],"meta":{"x":{"y":1}}},`;
  const heredoc = `cat > data.json <<'EOF'\n${json}{}]\nEOF`;
  const runs = ["{", "{a=", "{ ", "{/", "{x/"].map((unit) => unit.repeat(Math.ceil(300000 / unit.length)));
  for (const cmd of ["{".repeat(100000), "{a=".repeat(30000), heredoc, ...runs]) {
    const start = performance.now();
    ran(cmd);
    const ms = performance.now() - start;
    assert.ok(ms < 200, `${JSON.stringify(cmd.slice(0, 24))}… (${cmd.length} characters) took ${ms.toFixed(0)} ms`);
  }
  assert.equal(writes(heredoc), true, "the heredoc still writes data.json");
});

test("braces inside a wrapper option or a VAR=value keep the write verb in command position", () => {
  assertWrites(["ls | xargs -I{} rm {}", "find . -name x | xargs -I{} mv {} d/", "xargs -I{} sed -i s/a/b/ {}",
    "FOO=${BAR} rm f", "DIR=${HOME}/x sed -i s/a/b/ f", "env A={b} rm f", "sudo -u{a} rm f", "FOO={x rm f",
    "X=a{b rm f"], true);
  // PowerShell script blocks opened with no space before the {
  assertWrites(["gci|%{rm $_}", "ls|%{ rm $_ }", "$x|?{1}|%{del $_}", "ls | Where-Object{$_} | %{rm $_}", "do{rm a}while(0)",
    "$sb={rm a}; & $sb", "Invoke-Command -ScriptBlock{rm a}"], true, "PowerShell");
});

// parseLedger
test("parseLedger skips blank, malformed and incomplete lines", () => {
  const text = '{"k":"edit","file":"a"}\n\nnot json\nnull\n{"k":"run"}\n{"k":"run","cmd":"npm test","ok":true}\n';
  assert.deepEqual(parseLedger(text), [edit("a"), run("npm test")]);
});

// judge: what passes
test("lets a turn with no file edits through", () => {
  assert.equal(judge("Done, all tests pass.", [edit(), stop, run("npm test")]), null);
});

test("an explanation after edits still needs a receipt", () => {
  assert.match(judge("Here is how parseISO works.", [edit()]) ?? "not gated", /has no receipt/);
});

test("demands a receipt after file edits even without done words", () => {
  assert.match(judge("slugify now returns hello-world.", [edit()]) ?? "not gated", /has no receipt/);
});

test("a check-in question after edits is exempt", () => {
  assert.equal(judge("Should I also update the docs?", [edit()]), null);
});

test("a question that also claims done still needs a receipt", () => {
  assert.match(judge("Fixed it. Want me to run the suite?", [edit()]) ?? "not gated", /has no receipt/);
});

test("a question that reports a result or a change still needs a receipt", () => {
  const reports = [
    "slugify now trims whitespace and the example returns hello-world. Should I commit?",
    "Edited. Tests: 3 passed, 0 failed. Next?",
    "All green. Merge?",
    "Updated, and it builds cleanly. Want me to deploy?",
    "Verified: slug works. Want me to commit?",
    "I changed slugify to trim whitespace. Should I also add a test for it?",
  ];
  for (const msg of reports) assert.match(judge(msg, [edit()]) ?? "not gated", /has no receipt/, msg);
});

test("short check-in questions that report no result stay exempt", () => {
  const questions = [
    "Should I also update the docs?",
    "Which file should I edit next?",
    "Before I go further: do you want the slug lowercased, or should I keep the original case?",
    "I see two ways to handle empty input.\nShould slugify return an empty string, or throw?",
  ];
  for (const msg of questions) assert.equal(judge(msg, [edit()]), null, msg);
});

test("a long message is not a check-in, even when it ends with a question", () => {
  const long = `${"I looked at the parser and the tokenizer in detail. ".repeat(8)}Should I go on?`;
  assert.ok(long.length > 400);
  assert.match(judge(long, [edit()]) ?? "not gated", /has no receipt/);
  const fiveLines = "Notes:\n- the parser\n- the tokenizer\n- the docs\nShould I go on?";
  assert.match(judge(fiveLines, [edit()]) ?? "not gated", /has no receipt/);
});

test("a check-in question defers the receipt to a later turn, it does not cancel it", () => {
  const ask = { k: "stop", ask: true };
  assert.match(judge("Done.", [edit(), ask]) ?? "not gated", /has no receipt/);
  assert.match(judge("Done.", [edit(), ask, run("ls"), ask]) ?? "not gated", /has no receipt/);
  assert.equal(judge("Done.", [edit(), ask, stop]), null, "a plain stop ends the debt");
  assert.equal(judge(goNpmTest, [edit(), ask, run("npm test")]), null, "a receipt pays it");
});

test("the no-receipt message says when the edits came before a check-in question", () => {
  const ask = { k: "stop", ask: true };
  assert.match(judge("Done.", [edit(), ask]), /before the last check-in question/);
  assert.match(judge("Done.", [edit()]), /this turn changed files/);
  assert.match(judge("Done.", [edit(), ask, edit()]), /this turn changed files/);
  assert.ok(judge("Done.", [edit(), ask]).length < 1000);
});

test("checkInDeferred is true only for a check-in question while a receipt is owed", () => {
  const ask = { k: "stop", ask: true };
  assert.equal(checkInDeferred("Should I also update the docs?", [edit()]), true);
  assert.equal(checkInDeferred("Should I also update the docs?", [edit(), ask]), true);
  assert.equal(checkInDeferred("Should I also update the docs?", [edit(), stop]), false, "nothing owed");
  assert.equal(checkInDeferred("Should I also update the docs?", [run("ls")]), false, "nothing owed");
  assert.equal(checkInDeferred("Done.", [edit()]), false, "not a question");
  assert.equal(checkInDeferred("", [edit()]), false, "no message");
  assert.equal(checkInDeferred(`${goNpmTest}\n\nShould I also update the docs?`, [edit(), run("npm test")]), false, "has a receipt");
});

test("an empty final message still lets the agent stop", () => {
  assert.equal(judge("", [edit()]), null);
  assert.equal(judge("   ", [edit()]), null);
});

test("reads common completion phrasings as claims", () => {
  // Each ends with a question, so only the claim it makes keeps it from being a check-in.
  const phrasings = [
    "All 3 tests are passing.",
    "Implemented. npm test passes.",
    "The test now passes.",
    "Everything works now.",
    "Shipped the fix; the suite is green.",
    "The tests should pass now.",
  ].map((msg) => `${msg} Anything else?`);
  for (const msg of phrasings) assert.match(judge(msg, [edit()]) ?? "not gated", /has no receipt/, msg);
});

test("the claim pattern still recognises completion phrasings inside questions", () => {
  assert.match(judge("All 3 tests are passing, anything else?", [edit()]) ?? "not gated", /has no receipt/);
});

test("accepts a receipt whose command ran after the last edit and passed", () => {
  assert.equal(judge(goNpmTest, [edit(), run("npm test")]), null);
});

test("matches a cited command inside a longer one, like a cd prefix", () => {
  assert.equal(judge(goNpmTest, [edit(), run("cd app && npm test")]), null);
});

test("a fresh fail followed by a fresh pass is fine", () => {
  assert.equal(judge(goNpmTest, [edit(), run("npm test", false), run("npm test")]), null);
});

test("accepts an honest receipt with only UNVERIFIED claims", () => {
  const msg = done("CLAIM    works in Safari", "UNVERIFIED", "  - Safari: no browser here (user can run: npm run test:browser)", "VERDICT  GO WITH UNVERIFIED");
  assert.equal(judge(msg, [edit()]), null);
});

test("never blocks a NO-GO, even with a failing or stale command", () => {
  const msg = done("CLAIM    slug works", "  $ npm test", "  > fail 1", "VERDICT  NO-GO");
  assert.equal(judge(msg, [edit(), run("npm test", false)]), null);
  assert.equal(judge(msg.replace("VERDICT  NO-GO", "VERDICT: NO-GO"), [run("npm test"), edit()]), null);
});

test("accepts a capitalized fence and 'VERDICT: GO'", () => {
  const msg = goNpmTest.replace("```receipt", "```Receipt").replace("VERDICT  GO", "VERDICT: GO");
  assert.equal(judge(msg, [edit(), run("npm test")]), null);
});

test("parses a receipt in a CRLF message", () => {
  assert.equal(judge(goNpmTest.replace(/\n/g, "\r\n"), [edit(), run("npm test")]), null);
});

// judge: the four lies
test("lie 1: claims done with no receipt", () => {
  assert.match(judge("Fixed, all tests pass.", [edit()]), /has no receipt/);
});

test("lie 1: a receipt without a VERDICT line is not a receipt", () => {
  assert.match(judge(done("CLAIM    slug works", "  $ npm test"), [edit(), run("npm test")]), /has no receipt/);
});

test("lie 2: cites a command that never ran", () => {
  assert.match(judge(goNpmTest, [edit()]), /`npm test`, but no such command ran/);
});

test("lie 2: a decorated citation does not match the plain command that ran", () => {
  const msg = goNpmTest.replace("$ npm test", "$ npm test 2>&1");
  assert.match(judge(msg, [edit(), run("npm test")]), /no such command ran/);
});

test("lie 3: cites a command that only ran before the last edit", () => {
  assert.match(judge(goNpmTest, [run("npm test"), edit()]), /before the most recent file edit/);
});

test("lie 4: cites a failing run as a pass", () => {
  assert.match(judge(goNpmTest, [edit(), run("npm test", false)]), /latest run of `npm test` failed/);
});

test("lie 4: the latest fresh run wins over an earlier pass", () => {
  assert.match(judge(goNpmTest, [edit(), run("npm test"), run("npm test", false)]), /failed/);
});

test("lie 4 message says a cited command is proof only when it exits 0", () => {
  assert.match(judge(goNpmTest, [edit(), run("npm test", false)]), /exits 0/);
});

test("lie 5: a plain GO that cites no command", () => {
  assert.match(judge(done("CLAIM    all tests pass", "VERDICT  GO"), [edit()]), /cites no command/);
  assert.match(judge(done("VERDICT: GO"), [edit()]), /cites no command/);
});

test("checks a receipt even when the prose has no claim word", () => {
  const msg = goNpmTest.replace("Fixed, all tests pass.", "Here is the receipt for slugify.");
  assert.match(judge(msg, [edit()]), /no such command ran/);
});

test("checks a receipt in a turn with no edits", () => {
  assert.match(judge(goNpmTest, [edit(), run("npm test"), stop, run("npm test", false)]), /failed/);
});

test("checks every cited command, not just the first", () => {
  const msg = done("CLAIM    tests pass", "  $ npm test", "CLAIM    lint clean", "  $ npm run lint", "VERDICT  GO");
  assert.match(judge(msg, [edit(), run("npm test")]), /`npm run lint`/);
});

// judge: which runs prove a citation
test("a narrower passing run does not launder a failed full run", () => {
  assert.match(judge(goNpmTest, [edit(), run("npm test", false), run("npm test -- --grep slug")]), /failed/);
});

test("a cd-prefixed run still counts as the cited command", () => {
  assert.equal(judge(goNpmTest, [edit(), run("cd app && npm test")]), null);
});

test("a run after a shell edit in the same command is fresh", () => {
  assert.equal(judge(goNpmTest, [wrun("sed -i 's/a/b/' f.js && npm test")]), null);
});

test("a later shell edit makes earlier proof stale", () => {
  assert.match(judge(goNpmTest, [edit(), run("npm test"), wrun("sed -i 's/a/b/' f.js")]) ?? "not gated", /before the most recent file edit/);
});

test("a fresh narrow run does not refresh a stale full suite", () => {
  assert.match(judge(goNpmTest, [run("npm test"), edit(), run("npm test -- --grep slug")]), /before the most recent file edit/);
});

test("a run ending in '; <cmd>' is the cited command; a longer run counts only when the command never ran alone", () => {
  assert.match(judge(goNpmTest, [edit(), run("cd app; npm test", false), run("npm test -- --grep slug")]), /failed/);
  assert.equal(judge(goNpmTest, [edit(), run("set -o pipefail; npm test | tail -5")]), null);
});

// judge: receipts as real agents write them
const LOOSE_NO_GO = ["VERDICT  NO GO", "VERDICT: **NO-GO**", "VERDICT: `NO-GO`", "Verdict: No-Go", "VERDICT NOGO"];

test("reads loose NO-GO spellings as NO-GO", () => {
  for (const line of LOOSE_NO_GO) {
    assert.equal(judge(done("CLAIM    x", "  $ npm test", line), [edit(), run("npm test", false)]), null, line);
  }
});

test("reads loose NO-GO in a CRLF message", () => {
  for (const line of LOOSE_NO_GO) {
    const msg = done("CLAIM    x", "  $ npm test", line).replace(/\n/g, "\r\n");
    assert.equal(judge(msg, [edit(), run("npm test", false)]), null, line);
  }
});

test("reads a decorated verdict", () => {
  const msg = done("CLAIM x", "  $ npm test", "VERDICT ✅ GO");
  assert.equal(judge(msg, [edit(), run("npm test")]), null);
  assert.match(judge(msg, [edit()]), /no such command ran/);
});

test("a lowercase 'Verdict: GO' receipt is still checked", () => {
  const msg = goNpmTest.replace("Fixed, all tests pass.", "Here is the receipt for slugify.").replace("VERDICT  GO", "Verdict: GO");
  assert.match(judge(msg, [edit()]), /no such command ran/);
});

test("$ lines under UNVERIFIED are not citations", () => {
  const msg = done("CLAIM    x", "  $ npm test", "UNVERIFIED", "  - e2e needs staging, user can run:", "    $ npm run e2e", "VERDICT  GO WITH UNVERIFIED");
  assert.equal(judge(msg, [edit(), run("npm test")]), null);
});

test("an empty $ line is not a citation and borrows nothing", () => {
  const msg = done("CLAIM    x", "  $ ", "  > 3 passed", "VERDICT  GO");
  assert.match(judge(msg, [edit(), run("npm test")]), /cites no command/);
});

test("accepts a citation written as a list item", () => {
  for (const line of ["  - $ npm test", "  * $ npm test"]) {
    assert.equal(judge(done("CLAIM    slug works", line, "  > pass 3 fail 0", "VERDICT  GO"), [edit(), run("npm test")]), null, line);
  }
});

test("accepts a citation in a numbered or bulleted list", () => {
  for (const line of ["  1. $ npm test", "  2) $ npm test", "  • $ npm test", "  + $ npm test", "10. $ npm test"]) {
    const msg = done("CLAIM    slug works", line, "VERDICT  GO");
    assert.equal(judge(msg, [edit(), run("npm test")]), null, line);
    assert.match(judge(msg, [edit()]) ?? "not gated", /no such command ran/, line);
  }
});

test("a $command with no space is a citation, unless a digit follows the $", () => {
  const msg = done("CLAIM    slug works", "  $npm test", "VERDICT  GO");
  assert.equal(judge(msg, [edit(), run("npm test")]), null);
  assert.match(judge(msg, [edit()]) ?? "not gated", /no such command ran/);
  assert.match(judge(done("CLAIM    cheap", "  $5 per run", "VERDICT  GO"), [edit()]) ?? "not gated", /cites no command/);
});

test("an output line that quotes a $ command is not a citation", () => {
  const msg = done("CLAIM    slug works", "  > $ npm test", "VERDICT  GO");
  assert.match(judge(msg, [edit(), run("npm test")]) ?? "not gated", /cites no command/);
});

test("a decorated UNVERIFIED header hides the $ lines under it", () => {
  for (const header of ["**UNVERIFIED**", "## UNVERIFIED", "- UNVERIFIED:", "> UNVERIFIED", "_UNVERIFIED_"]) {
    const msg = done("CLAIM    x", "  $ npm test", header, "  $ npm run e2e", "VERDICT  GO WITH UNVERIFIED");
    assert.equal(judge(msg, [edit(), run("npm test")]), null, header);
  }
});

test("a decorated CLAIM line ends the UNVERIFIED section", () => {
  for (const claim of ["- CLAIM lint clean", "**CLAIM** lint clean", "CLAIMS:", "## CLAIM lint clean"]) {
    const msg = done("UNVERIFIED", "  - Safari: no browser here", claim, "  $ npm run lint", "VERDICT  GO WITH UNVERIFIED");
    assert.match(judge(msg, [edit()]) ?? "not gated", /`npm run lint`, but no such command ran/, claim);
  }
});

test("only an upper-case UNVERIFIED opens the section, so a note inside a claim hides nothing", () => {
  const note = done("CLAIM    slug", "  unverified on Windows, see below", "  $ npm test", "VERDICT  GO WITH UNVERIFIED");
  assert.match(judge(note, [edit()]) ?? "not gated", /no such command ran/);
  const titled = done("CLAIM    slug", "Unverified: Windows", "  $ npm test", "VERDICT  GO WITH UNVERIFIED");
  assert.match(judge(titled, [run("npm test"), edit()]) ?? "not gated", /before the most recent file edit/);
});

test("strips backticks around a cited command", () => {
  assert.equal(judge(done("CLAIM    slug works", "  $ `npm test`", "VERDICT  GO"), [edit(), run("npm test")]), null);
});

test("the receipt template shown to a user is not a receipt", () => {
  const msg = "Here is the format:\n```receipt\nCLAIM    <what you claim>\n  $ <exact command you ran>\nVERDICT  GO | GO WITH UNVERIFIED | NO-GO\n```";
  assert.equal(judge(msg, [edit(), stop]), null);
});

test("an honest NO-GO with a note after a pipe is not blocked", () => {
  const msg = done("CLAIM    x", "  $ npm test", "VERDICT  NO-GO | npm test fails").replace("Fixed, all tests pass.", "I implemented it.");
  assert.equal(judge(msg, [edit(), run("npm test", false)]), null);
});

test("an honest NO-GO is read in every common form, so it is never blocked", () => {
  for (const line of ["VERDICT  NO-GO | go fix X", "## VERDICT NO-GO", "### VERDICT: NO-GO", "VERDICT: NOT GO", "Verdict: not go"]) {
    assert.equal(judge(done("CLAIM    x", "  $ npm test", line), [edit(), run("npm test", false)]), null, line);
  }
  assert.equal(readVerdict("```receipt\nVERDICT  NO-GO | go fix X\n```"), "NO-GO");
});

test("a line is the template only when every part is exactly a verdict", () => {
  assert.equal(readVerdict("```receipt\nVERDICT  GO | GO WITH UNVERIFIED | NO-GO\n```"), null);
  assert.equal(readVerdict("```receipt\nVERDICT  **GO** | NO GO\n```"), null);
  assert.equal(readVerdict("```receipt\nVERDICT  GO | go live today\n```"), "GO");
  assert.match(judge(done("CLAIM    x", "  $ npm test", "VERDICT  GO | go live"), [edit()]) ?? "not gated", /no such command ran/);
});

test("a GO with a note after a pipe is still checked", () => {
  const msg = done("CLAIM    x", "  $ npm test", "VERDICT  GO | 3/3 green");
  assert.match(judge(msg, [edit(), run("npm test"), stop, run("npm test", false)]), /failed/);
});

test("the last VERDICT line wins", () => {
  const msg = done("CLAIM    x", "  $ npm test", "VERDICT  GO", "  > 1 failed on re-run", "VERDICT  NO-GO");
  assert.equal(judge(msg, [edit(), run("npm test", false)]), null);
});

test("an inline mention of a receipt fence does not hide the real receipt", () => {
  assert.match(judge(`I'll add a \`\`\`receipt block below.\n\n${goNpmTest}`, [edit()]), /no such command ran/);
});

test("a fence written as '``` receipt' is a receipt", () => {
  assert.match(judge(goNpmTest.replace("```receipt", "``` receipt"), [edit()]), /no such command ran/);
});

test("every receipt is checked, not just the first", () => {
  const noGo = done("CLAIM    slug works", "  $ npm test", "VERDICT  NO-GO");
  const msg = `${noGo}\n\nThen I fixed lint:\n\n\`\`\`receipt\nCLAIM    lint clean\n  $ npm run lint\nVERDICT  GO\n\`\`\``;
  assert.match(judge(msg, [edit()]), /no such command ran/);
});

// ledgerDir
test("ledgerDir is per user, sanitized, and honours LIARLIAR_DIR", () => {
  assert.equal(ledgerDir({}, "/tmp", 1000), join("/tmp", "liarliar-1000"));
  assert.equal(ledgerDir({}, "/tmp", "Aditya Abhiram"), join("/tmp", "liarliar-AdityaAbhiram"));
  assert.equal(ledgerDir({}, "/tmp", "../.."), join("/tmp", "liarliar-user"));
  assert.equal(ledgerDir({ LIARLIAR_DIR: "/x" }, "/tmp", 1000), "/x");
});

// decide
test("MAX_BLOCKS is 2", () => {
  assert.equal(MAX_BLOCKS, 2);
});

test("LIARLIAR=off disables the gate", () => {
  assert.equal(decide({ last_assistant_message: "Done." }, [edit()], { LIARLIAR: "off" }), null);
});

test("the off switch accepts OFF, 0, false and no", () => {
  for (const v of ["OFF", "0", "false", "no"]) {
    assert.equal(decide({ last_assistant_message: "Done." }, [edit()], { LIARLIAR: v }), null, v);
  }
  assert.match(decide({ last_assistant_message: "Done." }, [edit()], { LIARLIAR: "on" }), /has no receipt/);
});

test("every block message stays under 1,000 characters", () => {
  const cmd = `npm test ${"x".repeat(5000)}`;
  const msg = done("CLAIM    x", `  $ ${cmd}`, "VERDICT  GO");
  const cases = [
    [judge(msg, [edit()]), /no such command ran/],
    [judge(msg, [run(cmd), edit()]), /before the most recent file edit/],
    [judge(msg, [edit(), run(cmd, false)]), /failed/],
    [judge(done("CLAIM    x", "VERDICT  GO"), [edit()]), /cites no command/],
  ];
  for (const [reason, kind] of cases) {
    assert.match(reason, kind);
    assert.ok(reason.length < 1000, `${reason.length} characters`);
  }
});

test("stops blocking after MAX_BLOCKS blocks in a row", () => {
  const input = { stop_hook_active: true, last_assistant_message: "Done." };
  assert.match(decide(input, [edit(), block], {}), /has no receipt/);
  assert.equal(decide(input, [edit(), block, block], {}), null);
});

test("block counting restarts at any stop, a check-in stop too", () => {
  const input = { stop_hook_active: true, last_assistant_message: "Done." };
  assert.match(decide(input, [edit(), block, block, { k: "stop", ask: true }, block], {}) ?? "not gated", /has no receipt/);
});

test("old blocks do not count when the turn did not continue from a block", () => {
  assert.match(decide({ stop_hook_active: false, last_assistant_message: "Done." }, [edit(), block, block], {}), /has no receipt/);
});

test("lets the agent stop when the CLI sends no final message", () => {
  assert.equal(decide({}, [edit()], {}), null);
});

test("the skill's own example receipt passes with honest history and fails when stale", () => {
  const skill = readFileSync(new URL("../skills/liarliar/SKILL.md", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  const blocks = [...skill.matchAll(/```receipt\n[\s\S]*?\n```/g)];
  const that = "Fixed.\n\n" + blocks.at(-1)[0];
  assert.equal(judge(that, [edit(), run("npm test")]), null);
  assert.match(judge(that, [run("npm test"), edit()]), /before the most recent file edit/);
});

// readVerdict
test("readVerdict returns the verdict of the last receipt that has one", () => {
  const a = "```receipt\nCLAIM x\nVERDICT  GO\n```";
  const b = "```receipt\nCLAIM y\nVERDICT  NO-GO\n```";
  assert.equal(readVerdict(`${a}\n\nthen\n\n${b}`), "NO-GO");
  assert.equal(readVerdict("```receipt\nVERDICT  GO | GO WITH UNVERIFIED | NO-GO\n```"), null);
  assert.equal(readVerdict("Fixed, all tests pass."), null);
});
