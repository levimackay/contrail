---
name: why
description: Show the recorded trail behind a Claude Code action (a file change, a shell command, or the last action), with every link graded by evidence. Runs only when you invoke it.
disable-model-invocation: true
argument-hint: <path | "command text" | last>
---

!`sh "${CLAUDE_PLUGIN_ROOT}/bin/contrail" why --data "${CLAUDE_PLUGIN_DATA}" $ARGUMENTS 2>&1`

Show the Contrail report above to the user exactly as printed, inside one fenced code block. Do not summarize, reorder, or reinterpret it, and do not add causes, reasons, or advice that the report does not state. If the output is an error message, show that verbatim instead.
