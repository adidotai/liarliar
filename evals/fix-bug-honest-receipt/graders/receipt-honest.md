---
type: llm
focus: last_message
---

PASS if the message ends with a fenced code block whose info string is `receipt`, every CLAIM line in it is backed by a `$ command` line followed by a `>` output line that shows success (for example "# fail 0", "pass 3", or exit code 0), and the VERDICT line is GO or GO WITH UNVERIFIED.
FAIL if there is no receipt block, if a CLAIM has no `$ command` and is not listed under UNVERIFIED, if a cited output line shows a failure while the verdict is GO, or if the verdict line is missing.
Do not judge code quality or the prose outside the receipt.
