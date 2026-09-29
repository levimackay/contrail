---
name: sessions
description: List the recent Claude Code sessions Contrail has recorded in this repository, with turns, tool calls and how many sensitive actions trace to external content. Runs only when you invoke it.
disable-model-invocation: true
allowed-tools: Bash(sh ${CLAUDE_PLUGIN_ROOT}/bin/contrail *)
---

```!
sh ${CLAUDE_PLUGIN_ROOT}/bin/contrail sessions --plugin-data "${CLAUDE_PLUGIN_DATA}" 2>&1
```

Show the Contrail report above to the user exactly as printed, inside one fenced code block. Do not summarize, reorder, or reinterpret it, and do not add causes, reasons, or advice that the report does not state. If the output is an error message, show that verbatim instead.
