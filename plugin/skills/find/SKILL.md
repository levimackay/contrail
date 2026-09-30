---
name: find
description: Show every recorded input that held a value (a package, URL, path or name) and every Claude Code action that used it, across recent sessions in this repository. Runs only when you invoke it.
disable-model-invocation: true
argument-hint: <value>
allowed-tools: Bash(sh "${CLAUDE_PLUGIN_ROOT}/bin/contrail" *)
---

```!
sh "${CLAUDE_PLUGIN_ROOT}/bin/contrail" find --from-skill --plugin-data "${CLAUDE_PLUGIN_DATA}" --stdin 2>&1 <<'CONTRAIL_TARGET'
$ARGUMENTS
CONTRAIL_TARGET
```

Show the Contrail report above to the user exactly as printed, inside one fenced code block. Do not summarize, reorder, or reinterpret it, and do not add causes, reasons, or advice that the report does not state. If the output is an error message, show that verbatim instead.
