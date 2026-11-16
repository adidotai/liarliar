import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const SUMMARIZE = fileURLToPath(new URL("../e2e/summarize.mjs", import.meta.url));
const line = (o) => JSON.stringify(o);
const summarize = (...args) => JSON.parse(execFileSync(process.execPath, [SUMMARIZE, ...args], { encoding: "utf8" }));
// A temp folder for one test, removed when the test ends.
const tempDir = (t) => {
  const dir = mkdtempSync(join(tmpdir(), "liarliar-sum-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
};
const receipt = "Done.\n\n```receipt\nTASK     t\nCLAIM    c\n  $ npm test\n  > pass 3 fail 0\nVERDICT  GO\n```";

test("summarize prints exactly the six fields from a stream and a ledger", (t) => {
  const dir = tempDir(t);
  const stream = join(dir, "stream.jsonl");
  writeFileSync(stream, [
    line({ type: "system", subtype: "init", plugins: [{ name: "liarliar" }] }),
    line({ type: "assistant", message: { content: [{ type: "tool_use", name: "Skill", input: { skill: "liarliar" } }] } }),
    line({ type: "system", subtype: "hook_response", hook_event: "Stop", exit_code: 2 }),
    line({ type: "user", isSynthetic: true, message: { role: "user", content: "Stop hook feedback:\nliarliar: nope" } }),
    line({ type: "result", subtype: "success", result: receipt }),
  ].join("\n") + "\n");
  const ledger = join(dir, "ledger");
  mkdirSync(ledger);
  writeFileSync(join(ledger, "s1.jsonl"), [
    { k: "edit", file: "a.js" }, { k: "run", cmd: "npm test", ok: true }, { k: "block" },
  ].map(line).join("\n") + "\n");
  const out = summarize(stream, ledger);
  assert.deepEqual(out, { skillFired: true, stopBlocks: 1, finalHasReceipt: true, verdict: "GO", runs: 1, edits: 1 });
  assert.deepEqual(Object.keys(out), ["skillFired", "stopBlocks", "finalHasReceipt", "verdict", "runs", "edits"]);
});

test("summarize counts shell commands that wrote files as edits, and still as runs", (t) => {
  const dir = tempDir(t);
  const stream = join(dir, "stream.jsonl");
  writeFileSync(stream, line({ type: "result", result: "No receipt here." }) + "\n");
  const ledger = join(dir, "ledger");
  mkdirSync(ledger);
  writeFileSync(join(ledger, "s1.jsonl"), [
    { k: "edit", file: "a.js" },
    { k: "run", cmd: "sed -i s/1200/120/ hooks/judge.mjs", ok: true, writes: true },
    { k: "run", cmd: "npm test", ok: true },
  ].map(line).join("\n") + "\n");
  const out = summarize(stream, ledger);
  assert.equal(out.edits, 2);
  assert.equal(out.runs, 2);
});

test("summarize falls back to feedback messages, and tolerates a missing ledger", (t) => {
  const dir = tempDir(t);
  const stream = join(dir, "stream.jsonl");
  writeFileSync(stream, [
    line({ type: "assistant", message: { content: [{ type: "tool_use", name: "Skill", input: { skill: "other:thing" } }] } }),
    line({ type: "user", isSynthetic: true, message: { role: "user", content: "Stop hook feedback:\nx" } }),
    line({ type: "result", result: "No receipt here." }),
  ].join("\n"));
  const out = summarize(stream, join(dir, "none"));
  assert.deepEqual(out, { skillFired: false, stopBlocks: 1, finalHasReceipt: false, verdict: null, runs: 0, edits: 0 });
});
