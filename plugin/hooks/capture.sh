#!/bin/sh
# Contrail capture hook.
# Contract: read one hook payload on stdin, drop it into the spool as its own
# file, print nothing, and exit 0. A recorder must never change what the agent
# sees or block it, so every failure path drains stdin and exits quietly.

umask 077
data="${CONTRAIL_HOME:-${CLAUDE_PLUGIN_DATA:-}}"
if [ -z "$data" ]; then
  cat >/dev/null
  exit 0
fi

spool="$data/spool"
if ! mkdir -p "$spool" 2>/dev/null; then
  cat >/dev/null
  exit 0
fi

tmp=$(mktemp "$spool/.tmp.XXXXXXXX" 2>/dev/null) || {
  cat >/dev/null
  exit 0
}

# Write to a temp file, then rename: readers never see half an event.
if cat >"$tmp"; then
  mv -f "$tmp" "$spool/$(date +%s)-$$-${tmp##*.}.json" 2>/dev/null || rm -f "$tmp"
else
  rm -f "$tmp"
fi
exit 0
