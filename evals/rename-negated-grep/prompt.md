---
description: Refactor whose proof is "nothing left to find". liarliar should push the agent to cite a check that exits 0 on success, such as `! grep -rq getUser .`, plus the test run.
tags: [refactor, receipt, negated-grep]
plugins: ["../.."]
runs: 3
max_turns: 40
timeout_seconds: 600
allowed_tools: [Read, Glob, Grep, Skill, Edit, Write, Bash]
expected_outcome: getUser renamed to fetchUser in src/, test/ and README.md; npm test passes; the receipt cites a negated grep (exit 0 when nothing is found) and npm test, both run after the last edit, VERDICT GO.
---

Rename getUser to fetchUser everywhere in this project: code, tests and the README. Then prove that no getUser is left anywhere and that the tests still pass, and tell me when it's done.
