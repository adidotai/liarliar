// liarliar's rules, as pure functions. No I/O here: hooks/liarliar.mjs does the reading and writing.
import { join } from "node:path";

const RUN_TOOLS = new Set(["Bash", "PowerShell"]);
const EDIT_TOOLS = new Set(["Edit", "Write", "MultiEdit", "NotebookEdit"]);
const CLAIM = new RegExp(
  "\\b(done|fixed|finished|completed?|resolved|implemented|shipped|(?:works|working) now" +
    "|(?:tests?|checks?|specs?|suite|build)(?:\\s+(?:are|is|now|all|should|will))*\\s+(?:pass(?:ed|es|ing)?|green)" +
    "|ready to (?:merge|ship|commit|deploy))\\b",
  "i",
);
// Words that report a result or a change, so the message is a status report, not a check-in. Only reported
// forms count: "should it return null?" and "which file should I edit?" stay questions.
const RESULT = new RegExp(
  "\\b(?:pass(?:es|ed|ing)|works|worked|returns|returned|builds|compiles|succeed(?:s|ed)|successful(?:ly)?" +
    "|verified|confirmed|tested|updated|edited|changed|(?:all|is|are|now|stays|turned)\\s+green" +
    "|0\\s+fail(?:s|ed|ures?)?|exit(?:s|ed)\\s+(?:with\\s+)?(?:code\\s+)?0|now\\s+[a-z]+s)\\b",
  "i",
);
// Shell commands that write files: a heuristic, tested on the raw command (newlines kept) with quoted strings
// blanked out. It stays linear on long commands: no WORD scan crosses a SHELL_START, PS_BLOCK does no WORD scan,
// and the other scans stop at a space or ; & |, or after 200 characters (tests/judge.test.mjs times it).
// A temp folder or a device: /tmp/, /var/tmp/, /dev/, $TMPDIR ($TMP, $TEMP), %TEMP%, $env:TEMP.
const TEMP = String.raw`(?:\/(?:var\/)?tmp\/|\/dev\/|\$\{?TE?MP(?:DIR)?\b|%TE?MP%|\$env:TE?MP\b)`;
// One character of a word: not a space, ; & | ( ) or a backtick. A word may hold braces: -I{}, X=${HOME}/x.
const WORD = String.raw`[^\s;&|()\x60]`;
// Command position: the start of the command or of a line, after ; & | ( or a backtick, after a { that starts a
// word ({ rm a; }, % {del $_}, but not the { in -I{} or ${X}), or after find's -exec; then past VAR=x and wrappers
// (sudo, xargs, env, command, time, nohup, npx…), and past a path or a backslash. Every start is a non-WORD
// character or follows one, so no WORD scan crosses a start, and a run like "{{{{…" holds one start, not many.
const SHELL_START = String.raw`(?:^|[\n;&|(\x60]|(?<!${WORD})\{|\s-exec(?:dir)?\s)[ \t]*(?:\w+=${WORD}*[ \t]+){0,4}` +
  String.raw`(?:(?:sudo|xargs|env|command(?![ \t]+-[vV])|time|nohup|exec|then|do|else|npx|uvx|(?:uv|poetry|pipx)[ \t]+run` +
  String.raw`|python3?[ \t]+-m)(?:[ \t]+-${WORD}+){0,4}(?:[ \t]+\w+=${WORD}*){0,4}[ \t]+){0,3}\\?(?:${WORD}*\/)?`;
// Also a PowerShell script block whose { follows a word with no space: gci|%{rm $_}, ?{…}, $sb={…}, do{…},
// Where-Object{…}, -ScriptBlock{…}. The verb must follow the { directly: no WORD scan, so "%{%{…" stays linear.
const PS_BLOCK = String.raw`(?:[%?=]|-(?:ScriptBlock|FilterScript|Process|Begin|End)` +
  String.raw`|\b(?:do|try|catch|finally|else|foreach|ForEach-Object|where|Where-Object))\{[ \t]*`;
const CMD = `(?:${SHELL_START}|${PS_BLOCK})`;
const WRITES = new RegExp([
  String.raw`${CMD}g?sed\b[^;&|\n]{0,200}?\s-(?:[a-zA-Z]*i|-in-place)`, // sed -i, -Ei, --in-place
  String.raw`${CMD}perl\b[^;&|\n]{0,200}?\s-[a-z0-9]*i`, // perl -i, -pi (not -I or -Mstrict)
  // git apply, restore, rm and mv; checkout of a path (after --, or like ., ./x, a.js, src/a.js; a bare name is
  // a branch); stash, pop and apply (not list or show); reset --hard
  String.raw`${CMD}git(?:\s+-C\s+${WORD}+){0,2}\s+(?:(?:apply|restore|rm|mv)\b` +
    String.raw`|checkout\b(?!\s+--help)[^;&|\n]{0,200}?\s(?:--\s+[^\s;&|]|\.{1,2}(?=[\s;&|)]|$)|\.{0,2}\/|` +
    String.raw`[^\s;&|-][^\s;&|]*\.[A-Za-z]\w{0,9}(?=[\s;&|)]|$))` +
    String.raw`|stash\b(?!\s+(?:list|show|drop|clear|create|--help)\b)|reset\b[^;&|\n]{0,200}?\s--hard\b)`,
].join("|"));
const WRITES_ANY_CASE = new RegExp([
  // a `> file`, `>> file` or `>| file` redirect: not 2>&1, &>, >&2, =>, ->, >=, >(), nor into a temp folder, a
  // device, $null or NUL
  String.raw`(?<![\d&>=-])>{1,2}(?![>=(])(?!\|?\s*(?:&|${TEMP}|(?:\$null|nul)\b))`,
  // tee into a file that is not in a temp folder or a device
  String.raw`${CMD}tee(?:[ \t]+(?:-${WORD}*|${TEMP}${WORD}*)){0,8}[ \t]+(?!${TEMP}|-)\S`,
  // file verbs and PowerShell aliases, not for --help or --version
  String.raw`${CMD}(?:mv|cp|rm|touch|truncate|patch|del|erase|ni)[ \t]+(?!--(?:help|version)\b)\S`,
  // PowerShell file cmdlets, unless the path is in a temp folder
  String.raw`\b(?:(?:Set|Add|Clear)-Content|Out-File|(?:New|Remove|Move|Copy|Rename)-Item)\b` +
    String.raw`(?![ \t]+(?:-(?:File|Literal)?Path[ \t]+)?${TEMP})`,
  // formatters that rewrite files, not their check modes
  String.raw`\bprettier\b[^;&|\n]{0,200}?\s(?:--write|-w)(?![\w-])`,
  String.raw`\b(?:eslint|ruff)\b[^;&|\n]{0,200}?\s--fix(?![\w-])`,
  String.raw`\bruff[ \t]+format\b(?![^;&|\n]{0,200}?\s--(?:check|diff)\b)`,
  String.raw`\bgofmt\b[^;&|\n]{0,200}?\s-w(?![\w-])`,
  String.raw`\b(?:cargo|go)[ \t]+fmt\b(?![^;&|\n]{0,200}?\s--check\b)`,
  String.raw`${CMD}black[ \t]+(?![^;&|\n]{0,200}?--(?:check|diff|help|version)\b)\S`,
].join("|"), "i");
const QUOTED = /'[^']*'|"[^"]*"/g; // each opening quote scans to its closing one at most once: linear
const TEMP_START = new RegExp(`^${TEMP}`, "i");
// Every receipt fence that opens a line ("``` receipt" too); it closes at the next fence that opens a line.
const RECEIPTS = /^[ \t]*`{3,}[ \t]*receipt\b[^\n]*\n([\s\S]*?)^[ \t]*`{3,}/gim;
// A VERDICT line, captured whole: "Verdict: **No-Go**", "## VERDICT NO GO", "VERDICT ✅ GO | 3/3 green".
const VERDICT = /^[ \t>*_`#-]*VERDICT\b([^\n]*)$/gim;
// A `$ command` line, also in a list ("- $ x", "1. $ x", "• $ x"), or `$x` when no digit follows the `$`. One
// line only: an empty "$ " never borrows the next line. A "> $ x" line is quoted output, not a citation.
const CITED = /^[ \t]*(?:(?:[-*+•]|\d+[.)])[ \t]*)?\$(?:[ \t]+|(?=[^\s\d]))(\S.*)$/gm;
// `$` lines the receipt lists as unchecked are not citations: from an UNVERIFIED line to the next CLAIM or
// VERDICT line, each decorated like a VERDICT line (**UNVERIFIED**, ## CLAIM). UNVERIFIED counts in upper case
// only, so a lowercase "unverified" note inside a claim hides nothing.
const UNVERIFIED_OPENS = /^[ \t>*_`#-]*UNVERIFIED(?![A-Za-z0-9])/;
const UNVERIFIED_ENDS = /^[ \t>*_`#-]*(?:CLAIMS?|Claims?|VERDICT|Verdict)(?![A-Za-z0-9])/;
const RULE = "Each claim cites a command run after the last edit, or goes under UNVERIFIED.";
const FORMAT = "A receipt is a code block with the info string `receipt` that lists each CLAIM with the " +
  "`$ command` that proves it, puts anything unchecked under UNVERIFIED, and ends with VERDICT GO, GO WITH " +
  "UNVERIFIED or NO-GO. The liarliar skill has the full format.";
const NO_RECEIPT = `liarliar: this turn changed files, but the last message has no receipt. ${FORMAT}`;
const NO_RECEIPT_OWED = "liarliar: files were changed before the last check-in question, so a receipt is still " +
  `owed, but the last message has no receipt. ${FORMAT}`;
export const MAX_BLOCKS = 2;

const norm = (s) => String(s ?? "").trim().replace(/\s+/g, " ");
const clip = (s) => (s.length > 120 ? `${s.slice(0, 120)}…` : s);
// The ledger after the last entry that passes `end`.
const since = (ledger, end) => ledger.slice(ledger.findLastIndex(end) + 1);
const anyStop = (e) => e.k === "stop";
// A check-in stop ({ k: "stop", ask: true }) only defers the receipt, so the edits before it are still owed.
const plainStop = (e) => e.k === "stop" && !e.ask;
/** Whether a shell command writes files. Quoted text is blanked, but a quoted temp path stays one: `> "$TMPDIR/x"`. */
function writesFiles(cmd) {
  const bare = cmd.replace(QUOTED, (q) => (TEMP_START.test(q.slice(1)) ? "/tmp/" : "''"));
  return WRITES.test(bare) || WRITES_ANY_CASE.test(bare);
}
const isEdit = (e) => e.k === "edit" || (e.k === "run" && e.writes === true);
// Where the last file edit sits in the ledger: an edit at its own index, a writing run just before its own
// result, so `sed -i … && npm test` is fresh proof and a later edit still makes it stale.
const lastEditAt = (ledger) => ledger.reduce((last, e, i) => (isEdit(e) ? (e.k === "edit" ? i : i - 0.5) : last), -1);
/** A check-in question: short (at most 400 characters and 4 non-empty lines), its last line ends with "?", and it
 * neither claims done nor reports a result or change. */
function checkIn(text) {
  const t = text.trim();
  if (t.length > 400) return false;
  const lines = t.split("\n").map((l) => l.trim()).filter(Boolean);
  return lines.length <= 4 && lines.at(-1).endsWith("?") && !CLAIM.test(t) && !RESULT.test(t);
}
/** The receipt bodies in `text` that have a verdict. */
const receiptsIn = (text) => [...text.matchAll(RECEIPTS)].map(([, body]) => body).filter(verdictOf);

const letters = (value) => value.toUpperCase().replace(/[^A-Z]+/g, " ").trim();
/** One verdict value, read loosely: "GO", "GO WITH UNVERIFIED", "NO-GO", or null. */
function verdictWord(value) {
  const v = letters(value);
  if (/^NOT? ?GO\b/.test(v)) return "NO-GO"; // NO-GO, NO GO, NOGO, NOT GO
  if (/^GO WITH\b/.test(v)) return "GO WITH UNVERIFIED";
  return /^GO\b/.test(v) ? "GO" : null;
}
/** Exactly one verdict and nothing else, markdown and case aside: "**GO**", "NO GO", "GO WITH UNVERIFIED". */
const onlyVerdict = (value) => /^(?:GO|GO WITH UNVERIFIED|NOT? ?GO)$/.test(letters(value));

/** A receipt's verdict, from its last VERDICT line: "GO", "GO WITH UNVERIFIED", "NO-GO", or null (not a receipt). */
function verdictOf(receipt) {
  const parts = ([...receipt.matchAll(VERDICT)].at(-1)?.[1] ?? "").split("|");
  // The template lists the verdicts, so every `|` part is exactly one ("GO | GO WITH UNVERIFIED | NO-GO").
  // Otherwise text after a `|` is a note: "NO-GO | go fix X", "GO | 3/3 green".
  if (parts.length > 1 && parts.every(onlyVerdict)) return null;
  return verdictWord(parts[0]);
}

/** The receipt without its UNVERIFIED sections. */
function withoutUnverified(receipt) {
  let hidden = false;
  return receipt.split("\n").filter((line) => {
    if (UNVERIFIED_OPENS.test(line)) hidden = true;
    else if (UNVERIFIED_ENDS.test(line)) hidden = false;
    return !hidden;
  }).join("\n");
}

/** Where ledgers live: LIARLIAR_DIR, or a per-user folder in the OS temp dir (shared /tmp must not mix users). */
export const ledgerDir = (env, tmp, user) =>
  env.LIARLIAR_DIR || join(tmp, `liarliar-${String(user ?? "").replace(/[^\w-]/g, "") || "user"}`);

/** The ledger entry for a PostToolUse / PostToolUseFailure input, or null if it is not worth recording. */
export function entryFor(input) {
  const args = input?.tool_input ?? {};
  if (RUN_TOOLS.has(input?.tool_name)) {
    const cmd = norm(args.command);
    const failed = input.hook_event_name === "PostToolUseFailure";
    // A background launch has no result yet, and an interrupted run has no honest one: neither is proof.
    if (!cmd || args.run_in_background || (failed && input.is_interrupt)) return null;
    // Writes are read from the raw command, so a new line still starts a command.
    return writesFiles(String(args.command)) ? { k: "run", cmd, ok: !failed, writes: true } : { k: "run", cmd, ok: !failed };
  }
  if (EDIT_TOOLS.has(input?.tool_name)) return { k: "edit", file: args.file_path ?? args.notebook_path ?? "" };
  return null;
}

/** Ledger entries from JSONL text. Blank, malformed and incomplete lines are skipped. */
export function parseLedger(text) {
  return String(text ?? "").split("\n").flatMap((line) => {
    try {
      const e = JSON.parse(line);
      return typeof e?.k === "string" && (e.k !== "run" || typeof e.cmd === "string") ? [e] : [];
    } catch {
      return [];
    }
  });
}

/** The verdict of the last receipt in `text` that has one, or null. */
export function readVerdict(text) {
  const verdicts = [...String(text ?? "").matchAll(RECEIPTS)].map(([, body]) => verdictOf(body)).filter(Boolean);
  return verdicts.at(-1) ?? null;
}

/** Why the agent's final message must not end the turn, or null if it may. */
export function judge(message, ledger) {
  const text = String(message ?? "");
  if (!text.trim()) return null; // no final message (a CLI that does not send it): let the agent stop
  const receipts = receiptsIn(text);
  if (!receipts.length) {
    // Every turn that changed files ends with a receipt. A check-in question back to the user defers it.
    if (!since(ledger, plainStop).some(isEdit) || checkIn(text)) return null;
    return since(ledger, anyStop).some(isEdit) ? NO_RECEIPT : NO_RECEIPT_OWED;
  }
  // Every receipt that is present is checked, whatever the prose says or the turn did.
  for (const receipt of receipts) {
    const why = check(receipt, ledger);
    if (why) return why;
  }
  return null;
}

/** Why one receipt (with a verdict) does not hold up against the ledger, or null if it does. */
function check(receipt, ledger) {
  const verdict = verdictOf(receipt);
  if (verdict === "NO-GO") return null; // an honest NO-GO is never a false "done"

  const cited = [...withoutUnverified(receipt).matchAll(CITED)]
    .map(([, c]) => norm(c.trim().replace(/^`(.+)`$/, "$1")))
    .filter(Boolean);
  if (!cited.length && verdict === "GO") {
    return "liarliar: the verdict is GO, but the receipt cites no command. GO needs at least one `$ command` run " +
      "after the last edit; claims without one belong under UNVERIFIED, with the verdict GO WITH UNVERIFIED.";
  }
  const lastEdit = lastEditAt(ledger);
  for (const cmd of cited) {
    const all = ledger.flatMap((e, i) => (e.k === "run" && e.cmd.includes(cmd) ? [{ ...e, i }] : []));
    // When the cited command itself ran (alone, or after `cd x &&` / `x;`), only those runs count:
    // a narrower `npm test -- --grep slug` must not stand in for a failed or stale `npm test`.
    const whole = all.filter((e) => e.cmd === cmd || e.cmd.endsWith(` && ${cmd}`) || e.cmd.endsWith(`; ${cmd}`));
    const runs = whole.length ? whole : all;
    if (!runs.length) return `liarliar: the receipt cites \`${clip(cmd)}\`, but no such command ran in this session (background runs do not count). ${RULE}`;
    const fresh = runs.filter((e) => e.i > lastEdit);
    if (!fresh.length) return `liarliar: \`${clip(cmd)}\` last ran before the most recent file edit, so it says nothing about the current code. ${RULE}`;
    if (!fresh.at(-1).ok) {
      return `liarliar: the latest run of \`${clip(cmd)}\` failed (non-zero exit), but the verdict is not NO-GO. ` +
        "A cited command is proof only when it exits 0 on success; a check that passes by finding nothing can be " +
        `negated, like \`! grep -q pattern\`. ${RULE}`;
    }
  }
  return null;
}

/** The Stop-hook decision: a block reason, or null to let the agent stop. */
export function decide(input, ledger, env = {}) {
  if (/^(off|0|false|no)$/i.test(String(env.LIARLIAR ?? "").trim())) return null;
  const blocks = since(ledger, anyStop).filter((e) => e.k === "block").length;
  if (input?.stop_hook_active && blocks >= MAX_BLOCKS) return null;
  return judge(input?.last_assistant_message, ledger);
}

/** True when a stop that the gate lets through is a check-in question while files still need a receipt. The gate
 * then logs { k: "stop", ask: true }, so the receipt stays owed in the next turn. */
export function checkInDeferred(message, ledger) {
  const text = String(message ?? "");
  return Boolean(text.trim()) && !receiptsIn(text).length && since(ledger, plainStop).some(isEdit) && checkIn(text);
}
