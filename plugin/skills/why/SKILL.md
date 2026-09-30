---
name: why
description: Point at anything Claude Code did (a file, a line as path:line, a command, a commit, a package or URL it used, or nothing for its last action) and see the recorded trail behind it, with every link graded by evidence. Runs only when you invoke it.
disable-model-invocation: true
argument-hint: [file | file:line | "command" | commit | package or URL | nothing for the last action]
allowed-tools: Bash(sh ${CLAUDE_PLUGIN_ROOT}/bin/contrail *)
---

```!
sh ${CLAUDE_PLUGIN_ROOT}/bin/contrail why --plugin-data "${CLAUDE_PLUGIN_DATA}" --stdin 2>&1 <<'CONTRAIL_TARGET'
$ARGUMENTS
CONTRAIL_TARGET
```

Show the Contrail report above to the user exactly as printed, inside one fenced code block. Do not summarize, reorder, or reinterpret it, and do not add causes, reasons, or advice that the report does not state. If the output is an error message, show that verbatim instead.
