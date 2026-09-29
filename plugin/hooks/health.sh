#!/bin/sh
# SessionStart health check. Silent when recording works. Otherwise it shows
# one warning to the user through systemMessage, which never reaches the model.

umask 077
cat >/dev/null
data="${CONTRAIL_HOME:-${CLAUDE_PLUGIN_DATA:-}}"

if [ -z "$data" ]; then
  msg="Contrail is not recording: Claude Code did not provide a plugin data directory."
elif ! mkdir -p "$data/spool" 2>/dev/null || [ ! -w "$data/spool" ]; then
  msg="Contrail is not recording: $data/spool is not writable."
else
  exit 0
fi

msg=$(printf '%s' "$msg" | tr -d '\000-\037"\134')
printf '{"systemMessage": "%s"}\n' "$msg"
exit 0
