import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const HOOK = fileURLToPath(new URL("../hooks/liarliar.mjs", import.meta.url));

// A fresh, isolated hook "session": its own ledger dir, LIARLIAR unset.
function session(t) {
  const dir = mkdtempSync(join(tmpdir(), "liarliar-test-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const env = { ...process.env, LIARLIAR_DIR: dir };
  delete env.LIARLIAR;
  const call = (mode, payload) => {
    const input = typeof payload === "string" ? payload : JSON.stringify({ session_id: "s1", ...payload });
    const r = spawnSync(process.execPath, [HOOK, mode], { input, env, encoding: "utf8" });
    return { code: r.status, stderr: r.stderr };
  };
  const ledger = (name = "s1") =>
    readFileSync(join(dir, `${name}.jsonl`), "utf8").trim().split("\n").map((l) => JSON.parse(l));
  return { call, ledger, dir };
}

const write = { hook_event_name: "PostToolUse", tool_name: "Write", tool_input: { file_path: "src/slug.js" } };
const npmTest = { hook_event_name: "PostToolUse", tool_name: "Bash", tool_input: { command: "npm test" } };
const npmTestFailed = { ...npmTest, hook_event_name: "PostToolUseFailure", error: "Exit code 1", is_interrupt: false };
const stopWith = (msg, active = false) => ({ hook_event_name: "Stop", stop_hook_active: active, last_assistant_message: msg });
const receipt = "Fixed.\n\n```receipt\nCLAIM    slug works\n  $ npm test\n  > pass 3 fail 0\nVERDICT  GO\n```";

test("blocks an unreceipted done with exit 2 and the reason on stderr", (t) => {
  const s = session(t);
  s.call("log", write);
  const r = s.call("gate", stopWith("Fixed, all tests pass."));
  assert.equal(r.code, 2);
  assert.match(r.stderr, /has no receipt/);
  assert.deepEqual(s.ledger().at(-1), { k: "block" });
});

test("lets a true receipt through and marks the turn stopped", (t) => {
  const s = session(t);
  s.call("log", write);
  s.call("log", npmTest);
  const r = s.call("gate", stopWith(receipt));
  assert.equal(r.code, 0);
  assert.equal(r.stderr, "");
  assert.deepEqual(s.ledger(), [{ k: "edit", file: "src/slug.js" }, { k: "run", cmd: "npm test", ok: true }, { k: "stop" }]);
});

test("records a failed command and catches it sold as a pass", (t) => {
  const s = session(t);
  s.call("log", write);
  s.call("log", npmTestFailed);
  const r = s.call("gate", stopWith(receipt));
  assert.equal(r.code, 2);
  assert.match(r.stderr, /failed/);
});

test("gives up after two blocks in a row", (t) => {
  const s = session(t);
  s.call("log", write);
  assert.equal(s.call("gate", stopWith("Done.", false)).code, 2);
  assert.equal(s.call("gate", stopWith("Done.", true)).code, 2);
  assert.equal(s.call("gate", stopWith("Done.", true)).code, 0);
});

test("a check-in question defers the receipt: the next turn still owes it", (t) => {
  const s = session(t);
  s.call("log", write);
  const ask = s.call("gate", stopWith("Before I add a test: should slugify also trim tabs?"));
  assert.equal(ask.code, 0);
  assert.deepEqual(s.ledger().at(-1), { k: "stop", ask: true });
  const next = s.call("gate", stopWith("It is done and all tests pass."));
  assert.equal(next.code, 2);
  assert.match(next.stderr, /has no receipt/);
});

test("works without a session_id, using unknown.jsonl", (t) => {
  const s = session(t);
  s.call("log", { ...write, session_id: undefined });
  assert.deepEqual(s.ledger("unknown"), [{ k: "edit", file: "src/slug.js" }]);
});

test("ledger files are private to their user", { skip: process.platform === "win32" && "POSIX file modes" }, (t) => {
  const s = session(t);
  s.call("log", write);
  assert.equal(statSync(join(s.dir, "s1.jsonl")).mode & 0o777, 0o600);
});

test("fails open on garbage input and unknown modes", (t) => {
  const s = session(t);
  assert.equal(s.call("gate", "not json").code, 0);
  assert.equal(s.call("log", "").code, 0);
  assert.equal(s.call("explode", write).code, 0);
});
