---
name: trace
description: List every side effect in the latest session in this repository (loads, reads, edits, shell commands, commits) with where each one's values came from, graded by evidence. Runs only when you invoke it.
disable-model-invocation: true
allowed-tools: Bash(sh ${CLAUDE_PLUGIN_ROOT}/bin/contrail *)
---

```!
sh ${CLAUDE_PLUGIN_ROOT}/bin/contrail trace --plugin-data "${CLAUDE_PLUGIN_DATA}" 2>&1
```

Show the Contrail report above to the user exactly as printed, inside one fenced code block. Do not summarize, reorder, or reinterpret it, and do not add causes, reasons, or advice that the report does not state. If the output is an error message, show that verbatim instead.
