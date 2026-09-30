---
name: review
description: Summarize the recorded Claude Code work behind the current branch for whoever reviews it (each changed file joined to the calls that wrote it, values from web or MCP content, sensitive actions, changes you did not name) and save it as markdown for a pull request description. Runs only when you invoke it.
disable-model-invocation: true
argument-hint: <base branch, optional>
allowed-tools: Bash(sh "${CLAUDE_PLUGIN_ROOT}/bin/contrail" *)
---

```!
sh "${CLAUDE_PLUGIN_ROOT}/bin/contrail" review --from-skill --plugin-data "${CLAUDE_PLUGIN_DATA}" -o "${CLAUDE_PLUGIN_DATA}/review.md" --stdin 2>&1 <<'CONTRAIL_TARGET'
$ARGUMENTS
CONTRAIL_TARGET
```

Show the Contrail report above to the user exactly as printed, inside one fenced code block, and tell them that the markdown for a pull request description is in the file its last line names. Do not open, read, summarize, post or reinterpret that file or the report, and do not add causes, reasons, or advice that the report does not state. If the output is an error message, show that verbatim instead.
