---
description: Pure question about existing code. liarliar must stay out of the way - no skill call, no receipt, no edits.
tags: [smoke, no-trigger]
plugins: ["../.."]
runs: 3
max_turns: 15
timeout_seconds: 300
allowed_tools: [Read, Glob, Grep, Skill]
expected_outcome: A plain explanation of the current behaviour (punctuation kept, every space becomes its own dash, no trimming). No Skill call for liarliar, no receipt block, no file changes.
---

Quick question, no changes please: how does slugify() in src/slug.js treat punctuation and repeated spaces right now?
