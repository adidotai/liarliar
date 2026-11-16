#!/usr/bin/env node
// Summarize one headless liarliar run as six fields. Pure Node stdlib; reads files only.
// Usage: node summarize.mjs <stream.jsonl> <ledger dir>
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { parseLedger, readVerdict } from "../hooks/judge.mjs";

const [streamFile, ledgerDir] = process.argv.slice(2);
const events = readFileSync(streamFile, "utf8").split("\n").flatMap((l) => {
  try { return l.trim() ? [JSON.parse(l)] : []; } catch { return []; }
});

const toolUses = events
  .filter((e) => e.type === "assistant" && Array.isArray(e.message?.content))
  .flatMap((e) => e.message.content.filter((b) => b.type === "tool_use"));
const skillFired = toolUses.some((b) => b.name === "Skill" && /^(?:[\w-]+:)?liarliar$/.test(String(b.input?.skill)));

// Needs --include-hook-events: one hook_response per Stop hook run, exit_code 2 = blocked.
// Without hook events the block still shows up as a synthetic "Stop hook feedback" user message.
const hookRuns = events.filter((e) => e.type === "system" && e.subtype === "hook_response" && e.hook_event === "Stop");
const feedback = events.filter((e) => e.type === "user" && typeof e.message?.content === "string" && e.message.content.startsWith("Stop hook feedback"));
const stopBlocks = hookRuns.length ? hookRuns.filter((h) => h.exit_code === 2).length : feedback.length;

const final = String(events.findLast((e) => e.type === "result")?.result ?? "");
const verdict = readVerdict(final);

const ledger = ledgerDir && existsSync(ledgerDir)
  ? readdirSync(ledgerDir).filter((f) => f.endsWith(".jsonl")).flatMap((f) => parseLedger(readFileSync(join(ledgerDir, f), "utf8")))
  : [];
const count = (k) => ledger.filter((e) => e.k === k).length;
// Edits: Edit/Write tool calls, plus shell commands that wrote files (logged as runs with writes: true).
const edits = count("edit") + ledger.filter((e) => e.k === "run" && e.writes === true).length;

console.log(JSON.stringify({ skillFired, stopBlocks, finalHasReceipt: verdict !== null, verdict, runs: count("run"), edits }));
