---
name: report
description: Write the latest session in this repository as a self-contained HTML report (sensitive actions, timeline, every call's trail, graded by evidence) and print where it was saved. Runs only when you invoke it.
disable-model-invocation: true
allowed-tools: Bash(sh "${CLAUDE_PLUGIN_ROOT}/bin/contrail" *)
---

```!
sh "${CLAUDE_PLUGIN_ROOT}/bin/contrail" report --plugin-data "${CLAUDE_PLUGIN_DATA}" -o "${CLAUDE_PLUGIN_DATA}/report.html" 2>&1
```

Show the Contrail output above to the user exactly as printed, inside one fenced code block, and tell them they can open that file in a browser. Do not open, read, summarize or reinterpret the report, and do not add causes, reasons, or advice. If the output is an error message, show that verbatim instead.
