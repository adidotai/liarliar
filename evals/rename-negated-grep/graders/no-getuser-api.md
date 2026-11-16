---
type: regex
target: { source: file, path: src/api.js }
match: not_contains
weight: 0.5
---
\bgetUser\b
