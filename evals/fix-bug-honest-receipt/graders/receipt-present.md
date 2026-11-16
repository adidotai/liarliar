---
type: regex
target: last_message
flags: m
weight: 2
---
```receipt[^\n]*\n[\s\S]*?^\s*VERDICT\b[:\s]*(?:GO|NO-GO)\b[\s\S]*?```
