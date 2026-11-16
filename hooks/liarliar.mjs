#!/usr/bin/env node
// liarliar hook entry point.
//   log  (PostToolUse, PostToolUseFailure): record what actually ran or changed.
//   gate (Stop): every turn that changed files must end with a receipt; block it if the receipt does not hold up.
// Fails open: any error exits 0, so liarliar can never break a session.
import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import { tmpdir, userInfo } from "node:os";
import { join } from "node:path";
import { checkInDeferred, decide, entryFor, ledgerDir, parseLedger } from "./judge.mjs";

const user = () => {
  try {
    return process.getuid?.() ?? userInfo().username;
  } catch {
    return "user";
  }
};

try {
  const input = JSON.parse(readFileSync(0, "utf8"));
  const dir = ledgerDir(process.env, tmpdir(), user());
  const file = join(dir, `${String(input.session_id ?? "").replace(/[^\w-]/g, "") || "unknown"}.jsonl`);
  const append = (entry) => {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    appendFileSync(file, `${JSON.stringify(entry)}\n`, { mode: 0o600 });
  };

  if (process.argv[2] === "log") {
    const entry = entryFor(input);
    if (entry) append(entry);
  } else if (process.argv[2] === "gate") {
    let text = "";
    try {
      text = readFileSync(file, "utf8");
    } catch {
      // no ledger yet: nothing ran this session
    }
    const ledger = parseLedger(text);
    const reason = decide(input, ledger, process.env);
    // A check-in question only defers the receipt: `ask` keeps the edits before it owed in the next turn.
    const deferred = !reason && checkInDeferred(input.last_assistant_message, ledger);
    append(reason ? { k: "block" } : deferred ? { k: "stop", ask: true } : { k: "stop" });
    if (reason) {
      process.stderr.write(reason);
      process.exitCode = 2;
    }
  }
} catch {
  process.exitCode = 0;
}
