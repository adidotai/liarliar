---
type: regex
target: last_message
flags: m
weight: 3
---
^\s*\$\s+(?:set -o pipefail;\s*)?!\s*(?:git\s+)?(?:grep|rg)\b.*getUser
