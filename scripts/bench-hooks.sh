#!/bin/sh
# Measures what Contrail adds to a Claude Code session, on this machine:
#   - the capture hook per event, for a small payload and a 1 MB tool response
#   - the SessionStart health hook
#   - SessionEnd: capture, then ingest of a whole session's spool (a few hundred events)
#   - the statusline command
# Usage: sh scripts/bench-hooks.sh [runs]   (default 50; SessionEnd runs a fifth as often)
# The CLI runs on whatever plugin/bin/contrail picks: Bun if it is on PATH, otherwise Node.
# Everything is written to a temporary directory that is removed afterwards.
set -eu

runs=${1:-50}
root=$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd)
capture="$root/plugin/hooks/capture.sh"
health="$root/plugin/hooks/health.sh"
launcher="$root/plugin/bin/contrail"
work=$(mktemp -d "${TMPDIR:-/tmp}/contrail-bench.XXXXXX")
trap 'rm -rf "$work"' EXIT INT TERM

# Nanoseconds since the epoch: GNU date has %N; BSD date (macOS) does not, so fall back to perl.
if [ "$(date +%N)" != N ] && [ "$(date +%N)" != %N ]; then
  now() { date +%s%N; }
else
  now() { perl -MTime::HiRes=time -e 'printf "%.0f\n", time * 1e9'; }
fi

# pad N: N bytes of JSON-safe text
pad() { head -c "$1" /dev/zero | tr '\0' 'x'; }

# stats FILE: median and p95 of the nanosecond samples in FILE, in milliseconds
stats() {
  sort -n "$1" | awk -v base="${2:-0}" '
    { v[NR] = ($1 - base) / 1e6 }
    END {
      m = int((NR + 1) / 2); p = int(NR * 0.95 + 0.999)
      if (p > NR) p = NR
      printf "median %6.1f ms   p95 %6.1f ms   (n=%d)\n", v[m], v[p], NR
    }'
}

# time_runs N OUT CMD...: run CMD N times with stdin from $input, one sample per run into OUT
time_runs() {
  n=$1 out=$2
  shift 2
  : >"$out"
  i=0
  while [ "$i" -lt "$n" ]; do
    t0=$(now)
    "$@" <"$input" >/dev/null 2>&1 || true
    t1=$(now)
    echo $((t1 - t0)) >>"$out"
    i=$((i + 1))
  done
}

# The timer itself costs a fork per sample; measure it with a no-op and subtract its median.
input=/dev/null
time_runs "$runs" "$work/noop" true
timer=$(sort -n "$work/noop" | awk '{ v[NR] = $1 } END { print v[int((NR + 1) / 2)] }')

small="$work/small.json"
printf '{"session_id":"bench","hook_event_name":"PreToolUse","cwd":"%s","tool_name":"Bash","tool_use_id":"toolu_bench","tool_input":{"command":"npm test","description":"Run the tests"}}' "$work" >"$small"
large="$work/large.json"
{
  printf '{"session_id":"bench","hook_event_name":"PostToolUse","cwd":"%s","tool_name":"Bash","tool_use_id":"toolu_bench","tool_input":{"command":"cat big.log"},"tool_response":{"stdout":"' "$work"
  pad 1048576
  printf '","stderr":"","interrupted":false}}'
} >"$large"

export CONTRAIL_HOME="$work/data"

echo "machine: $(uname -sm), $(getconf _NPROCESSORS_ONLN 2>/dev/null || echo '?') CPUs"
echo "runtime: $(sh "$launcher" doctor 2>/dev/null | head -n 1 || echo 'none')"
echo "timer overhead subtracted: $(awk -v t="$timer" 'BEGIN { printf "%.1f ms", t / 1e6 }')"
echo

input=$small
time_runs "$runs" "$work/t" sh "$capture"
printf 'capture.sh, %-24s %s\n' "$(wc -c <"$small" | tr -d ' ') B event:" "$(stats "$work/t" "$timer")"
rm -rf "$CONTRAIL_HOME/spool"

input=$large
time_runs "$runs" "$work/t" sh "$capture"
printf 'capture.sh, %-24s %s\n' "1 MB tool response:" "$(stats "$work/t" "$timer")"
rm -rf "$CONTRAIL_HOME/spool"

input=/dev/null
time_runs "$runs" "$work/t" env CLAUDE_PLUGIN_ROOT="$root/plugin" sh "$health"
printf '%-36s %s\n' "health.sh (SessionStart):" "$(stats "$work/t" "$timer")"

# A realistic session: 150 file reads (PreToolUse and PostToolUse each), 19 prompts and
# 19 stops, responses of 2 KB with every tenth one 64 KB: 339 events with SessionEnd,
# about 1.3 MB of JSON.
spool_session() {
  mkdir -p "$CONTRAIL_HOME/spool"
  s=$CONTRAIL_HOME/spool
  j=0
  while [ "$j" -lt 150 ]; do
    if [ $((j % 8)) -eq 0 ]; then
      printf '{"session_id":"%s","hook_event_name":"UserPromptSubmit","cwd":"%s","prompt":"step %d: fix the failing test in src/app.ts"}' "$1" "$work" "$j" >"$s/$2-$j-a.json"
      printf '{"session_id":"%s","hook_event_name":"Stop","cwd":"%s","last_assistant_message":"done with step %d"}' "$1" "$work" "$j" >"$s/$2-$j-z.json"
    fi
    size=2048
    [ $((j % 10)) -eq 0 ] && size=65536
    printf '{"session_id":"%s","hook_event_name":"PreToolUse","cwd":"%s","tool_name":"Read","tool_use_id":"toolu_%d","tool_input":{"file_path":"%s/src/f%d.ts"}}' "$1" "$work" "$j" "$work" "$j" >"$s/$2-$j-b.json"
    {
      printf '{"session_id":"%s","hook_event_name":"PostToolUse","cwd":"%s","tool_name":"Read","tool_use_id":"toolu_%d","tool_input":{"file_path":"%s/src/f%d.ts"},"tool_response":{"type":"text","file":{"filePath":"%s/src/f%d.ts","content":"' "$1" "$work" "$j" "$work" "$j" "$work" "$j"
      pad "$size"
      printf '"}}}'
    } >"$s/$2-$j-c.json"
    j=$((j + 1))
  done
}

end_runs=$(((runs + 4) / 5))
: >"$work/end"
k=0
while [ "$k" -lt "$end_runs" ]; do
  spool_session "bench-$k" "$k"
  printf '{"session_id":"bench-%d","hook_event_name":"SessionEnd","cwd":"%s","reason":"exit"}' "$k" "$work" >"$work/end.json"
  t0=$(now)
  sh "$capture" <"$work/end.json"
  sh "$launcher" ingest --from-hook </dev/null >/dev/null 2>&1 || true
  t1=$(now)
  echo $((t1 - t0)) >>"$work/end"
  k=$((k + 1))
done
events=$(sh "$launcher" doctor 2>/dev/null | sed -n 's/^events stored *\([0-9]*\) .*/\1/p')
printf '%-36s %s\n' "SessionEnd, $((events / end_runs)) events ingested:" "$(stats "$work/end" "$timer")"

printf '{"session_id":"bench-0","cwd":"%s"}' "$work" >"$work/status.json"
input=$work/status.json
time_runs "$runs" "$work/t" sh "$launcher" statusline
printf '%-36s %s\n' "contrail statusline:" "$(stats "$work/t" "$timer")"
