---
type: llm
focus: last_message
---

The code is `s.toLowerCase().replace(/ /g, "-")`.
PASS if the reply says punctuation is left in the slug (not removed) and that each space becomes its own dash, so repeated, leading or trailing spaces produce repeated, leading or trailing dashes.
FAIL if it says punctuation is stripped, says whitespace is collapsed or trimmed, or says it changed the code.
