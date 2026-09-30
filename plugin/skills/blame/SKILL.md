---
name: blame
description: Show each line of a file as it is now next to the recorded Claude Code call that last wrote it, with that call's turn and where its values came from, graded by evidence. Runs only when you invoke it.
disable-model-invocation: true
argument-hint: <file>
allowed-tools: Bash(sh "${CLAUDE_PLUGIN_ROOT}/bin/contrail" *)
---

```!
sh "${CLAUDE_PLUGIN_ROOT}/bin/contrail" blame --from-skill --plugin-data "${CLAUDE_PLUGIN_DATA}" --stdin 2>&1 <<'CONTRAIL_TARGET'
$ARGUMENTS
CONTRAIL_TARGET
```

Show the Contrail report above to the user exactly as printed, inside one fenced code block. Do not summarize, reorder, or reinterpret it, and do not add causes, reasons, or advice that the report does not state. If the output is an error message, show that verbatim instead.
