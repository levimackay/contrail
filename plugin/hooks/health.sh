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
  # What the agent read lives here: only this user may list or open it.
  chmod 700 "$data" 2>/dev/null
  # A stable path to the CLI, for a shell alias or a statusLine command: the plugin's own
  # directory changes with every version, the data directory does not.
  if [ -n "${CLAUDE_PLUGIN_ROOT:-}" ] && mkdir -p "$data/bin" 2>/dev/null; then
    root=$(printf '%s' "$CLAUDE_PLUGIN_ROOT" | sed "s/'/'\\\\''/g")
    dir=$(printf '%s' "$data" | sed "s/'/'\\\\''/g")
    tmp="$data/bin/.contrail.$$"
    {
      # printf, not echo: some shells' echo turns \047 into a quote and would undo the quoting.
      printf '%s\n' '#!/bin/sh'
      printf '%s\n' "# Written by Contrail's SessionStart hook: a stable path to the installed CLI."
      printf '%s\n' "[ -n \"\${CONTRAIL_HOME:-}\" ] || CONTRAIL_HOME='$dir'"
      printf '%s\n' 'export CONTRAIL_HOME'
      printf '%s\n' "exec sh '$root/bin/contrail' \"\$@\""
    } >"$tmp" 2>/dev/null
    if ! { chmod 700 "$tmp" && mv -f "$tmp" "$data/bin/contrail"; } 2>/dev/null; then
      rm -f "$tmp"
    fi
  fi
  exit 0
fi

msg=$(printf '%s' "$msg" | tr -d '\000-\037"\134')
printf '{"systemMessage": "%s"}\n' "$msg"
exit 0
