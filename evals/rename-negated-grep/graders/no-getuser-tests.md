---
type: regex
target: { source: file, path: test/user.test.js }
match: not_contains
weight: 0.5
---
\bgetUser\b
