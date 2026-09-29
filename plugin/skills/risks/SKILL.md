---
name: risks
description: List sensitive actions in recent sessions (credential access, network egress, remote code, installs) with where their values came from, graded by evidence. Runs only when you invoke it.
disable-model-invocation: true
allowed-tools: Bash(sh ${CLAUDE_PLUGIN_ROOT}/bin/contrail *)
---

```!
sh ${CLAUDE_PLUGIN_ROOT}/bin/contrail risks --data "${CLAUDE_PLUGIN_DATA}" 2>&1
```

Show the Contrail report above to the user exactly as printed, inside one fenced code block. Do not summarize, reorder, or reinterpret it, and do not add causes, reasons, or advice that the report does not state. If the output is an error message, show that verbatim instead.
