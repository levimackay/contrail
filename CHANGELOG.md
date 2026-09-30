# Changelog

All notable changes to Contrail. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Fixed

- Quotes show the value on long lines. A value found far into a long line, such as WebSearch's one-line list of links or a one-line JSON tool result, is now quoted from just before it. Before, the quote started at the beginning of the line and clipping hid the value.

### Changed

- Queries are much faster in long sessions, and their output is unchanged, which golden-output tests now pin. On a 250-call session with 35 MB recorded:
  - the status line takes about 250 ms instead of 680 ms
  - the tripwire takes about 220 ms instead of 390 ms
  - `why`, `risks` and `find` take 180 to 260 ms instead of 340 to 700 ms

  Large Read, search and web results are now read only when a report prints them, and text search no longer builds a set of every word it has seen.
- MCP and WebSearch tracing is verified in real sessions. It is also tested against the payload shapes Claude Code 2.1.285 records: bare content-block lists, `structuredContent` results as text, error results as `PostToolUseFailure`, embedded resources, and WebSearch's results-and-summary shape.

### Added

- `contrail import`: brings in sessions from before Contrail was installed, rebuilt from Claude Code's own transcripts through the same redaction path. Every report marks them as reconstructed, not recorded live, and lists what a transcript lacks. Sessions recorded live are never touched, running it again stores nothing new, and first-run messages point to it.
- `contrail watch`: a live feed for a second terminal. Each tool call appears as it starts, with where its values came from and `▲` when they came from external content, followed by a line if it fails or is denied.
- A new sensitive kind, `persistence`: a write to something that runs again later, such as shell startup files, git hooks, a crontab, `~/.ssh/authorized_keys`, and Claude Code's own settings, hooks, MCP config and `CLAUDE.md`. `risks` lists it and the tripwire watches for it, so an injected instruction that plants itself for later is flagged. Reading these files does not count.
- In imported sessions, a denied call says who denied it (you, a permission rule, or auto mode) and Claude Code's reason, from the denial the transcript records.
- Calls that auto mode denies are recorded. Auto mode skips PreToolUse for a call it refuses, so until now the attempt left no trace. `why` shows it as denied with Claude Code's reason and traces its values like any other call, and `risks`, `trace`, `review` and the HTML report list it. On a Claude Code version without the `PermissionDenied` event, that one hook entry is ignored and nothing else changes.
- `contrail forget <session>` and `contrail forget --all --yes`: delete recorded sessions on demand, with freed pages zeroed, the database rewritten and its write-ahead log truncated, so the deleted text is not left in either file.

## [0.4.0] - 2026-09-30

### Added

- A tripwire before sensitive tool calls. When a call touches credentials, the network or the shell, installs something, or touches Contrail's own records, and a value in it first appeared in external content (a web page or search, an MCP result, a dependency's files), you see one line before Claude Code asks for permission. It is a `systemMessage`: shown to you, not given to the model. It never blocks or makes a permission decision, and `"tripwire": false` in `config.json` turns it off.
- `contrail why` answers whatever it is pointed at: nothing (the last action), a file, `file:line` or `file:start-end`, a command, a bare commit sha, a call id, or any value the agent used, such as a package name or a URL.
- Every `why` report starts with an In short block: whether your words named the action, what is sensitive about it, and each value's chain of sources with their grades.
- `contrail blame <file>` and `/contrail:blame`: each line of a file as it is now, credited to the recorded agent call that last wrote that text (R10, LIKELY at best), with its session, turn, call id and trail, across sessions.
- `contrail review [<base>]` and `/contrail:review`: the recorded agent work behind a branch for its reviewer. Commits are joined to the calls that made them and changed files to the calls that wrote them, committed or not. It lists values from external content, sensitive actions and changes you did not name, as terminal output, JSON, or escaped GitHub markdown for a pull request.
- A new sensitive kind, `touches Contrail's records`, for calls that name Contrail's data directory or database. Contrail's own queries are not counted.
- `scripts/bench-hooks.sh`, which measures hook overhead on your machine.

### Changed

- Clearer messages before anything is recorded, and when Node is too old (the message names the version found) or no runtime is installed. A skill whose command fails, such as `/contrail:why` before anything is recorded, now shows Contrail's message instead of Claude Code's "Shell command failed" block.
- The CLI finds the data directory under `$CLAUDE_CONFIG_DIR` when that is set.
- The capture hook starts one process fewer per event.
- Report wording no longer says "the agent chose this", which claimed more than is observable.

### Security

- Redaction covers far more before anything is stored:
  - credential file contents: `.netrc` and `.pgpass` passwords, Docker `auth`, kubeconfig client keys and certificates, Azure `AccountKey` and npm `_auth`
  - secrets passed as separate command-line arguments (`--token X`, `--api-key X`, `aws configure set …`, `docker login -p`, `sshpass -p`, `twine -p`, `redis-cli -a`)
  - environment names judged by their words (ENCRYPTION_KEY, SIGNING_KEY, APP_KEY, RAILS_MASTER_KEY, TWILIO_AUTH)
  - quoted, comma-holding, typed and name/value-pair notations
  - URL passwords containing `/`
  - many more token formats (Slack, Google, Vault, OpenAI, GitLab, PyPI and others)
- Values are no longer excused as code just for containing a dot, brackets or only digits.
- There are fewer false positives on ordinary code (`PWD=`, `password: string`, type annotations).
- A secret straddling the 256 KB storage cap is redacted whole before the string is cut.
- An event nested thousands of levels deep is stored with its session and call, redacted, instead of as an unparsed failure.
- Parse errors no longer quote the start of the payload they could not parse.
- 256 KB of repeated private-key headers is redacted in milliseconds instead of over a second, and every redaction pattern is now bounded, which a test enforces.

### Fixed

- Two processes creating a new database at the same moment no longer fail one of them with "database is locked".
- Skills work when the plugin's path contains a space, such as a macOS home folder named after a person.
- A commit line printed by a command counts only if that command was running when git dated the commit, so echoing someone else's commit line is no longer DIRECT.
- A FIFO or symlink in the spool is removed unread. A FIFO made every command wait, and a symlink would have been read and stored.
- Recorded file names, branches and ids can no longer put terminal escapes, 8-bit controls, bidi overrides or zero-width marks into a report.
- A long run of `@` or `.` in a written file no longer stalls the status line: name matching is linear.
- The launcher is written with `printf`, so a path holding an octal escape cannot break its quoting.
- `report -o` and `review -o` replace what is at the path with a 0600 file instead of following a symlink or keeping an existing file's mode.
- The data directory is made 0700; Claude Code creates it with your umask.
- trace, find, report and `export --otel` label a session with no tool calls by its session id.
- "1 tool call", not "1 tool calls".
- A negation counts against a request only when it comes before the mention in the same clause, so "edit app.py so it prints hi instead of hello" is no longer reported as a negated request for app.py.
- A call with no recorded result (denied, stopped, or still running) says so in words instead of PENDING.

## [0.3.0] - 2026-09-29

### Added

- `contrail export --otel`: a session as OpenTelemetry traces (OTLP/JSON). Sessions, turns and tool calls become spans with real times, Contrail's grades and trust labels become `contrail.*` attributes, provenance edges become span links, and effects become span events.
- `contrail report` and the `/contrail:report` skill: a session as one self-contained HTML page with summary cards, sensitive actions, the timeline, and every call's full trail. It loads nothing and runs no script, and it is written with mode 0600.
- `contrail find` and the `/contrail:find` skill: every recorded input that held a value and every call that used it, across sessions, in order. It works with hash-only storage and leaves out Contrail's own queries.
- `contrail statusline`: the current session in Claude Code's status bar, from the JSON Claude Code passes on stdin. It never fails; on any error it prints just the name.
- A launcher at a stable path, `<data directory>/bin/contrail`, kept up to date by the SessionStart hook, so a shell alias or status-line command survives plugin updates. `contrail doctor` prints it.
- The `/contrail:sessions` skill: recent sessions in this repository, from inside Claude Code.
- `contrail why <call id>`: the trail behind any recorded tool call (a Read, a WebFetch, a search), by the id reports print (`toolu…ALhq1` or `toolu...ALhq1`) or in full.
- A changelog, security policy, contributing guide, and issue and pull request templates.

### Changed

- A trail longer than the three steps one report follows now says so, and names the call to run `why` on next, instead of ending as if it started there.

## [0.2.0] - 2026-09-29

### Added

- `contrail why commit <sha>`: a commit's files joined to the agent changes behind them (R7), and quiet commits (`git commit -q`) joined on git's commit time (R9).
- `contrail risks`: credential access, network egress, remote code, installs and destructive commands, with those whose values trace to external content first.
- `contrail trace` with `--writes`, `--shell`, `--network`, `--mcp`, `--subagents` and `--instructions` filters, and `--tree` for the session as a forest of trails.
- `contrail sessions`, `contrail export` and `contrail prune`.
- `/contrail:risks` and `/contrail:trace` skills.
- Following conduits: compaction summaries, subagent prompts and reports (including background ones), and files the agent wrote and read back.
- Expected shell effects (R6), always worded "expected, not observed".
- `config.json` with retention (`retention_days`, `max_db_mb`) and `store_content: false`, which stores no text the agent read, only keyed hashes that keep grades and line numbers.
- The body of a skill the model invokes is read at ingest.
- Color output, honoring `NO_COLOR` and `FORCE_COLOR`.
- A scripted demo (`npm run demo`) and rendered SVG views of it (`npm run svg`).

### Fixed

- A background subagent's report, which Claude Code delivers as a prompt, was labeled as your words. It is now labeled by the task that produced it and never counts as your request.
- `2>&1`, `>&2` and `3<&0` were read as file writes, and descriptor numbers leaked into arguments.
- Commits run through wrappers (`time`, `sudo -u`, `env VAR=`, `timeout N`) were not recognized.
- The async `Stop` ingest could be cut short when a session ended, leaving events unredacted in the spool. A synchronous `SessionEnd` hook now records its own event, then ingests.
- The skills overrode `CONTRAIL_HOME`, so they could read a different directory than recording wrote to.
- Shell output from dependency directories (`cat node_modules/x/README.md`) was labeled local instead of external.
- Recorded text could carry terminal escapes or backticks into reports. Everything printed is now sanitized.
- `why commit` compared symlinked and real paths, so on macOS every file showed UNKNOWN.

### Changed

- Explaining a large session is about 9x faster: a word-set prefilter skips inputs that cannot hold a value, without changing any result.
- Long tool call and subagent ids are shortened in text reports; JSON keeps them whole.

## [0.1.0] - 2026-09-28

### Added

- Capture for every Claude Code hook event: a POSIX `sh` hook, one spool file per event.
- SQLite storage through `node:sqlite` or `bun:sqlite`, with redaction before anything is written.
- `contrail why <path | "command" | last>`, graded DIRECT, LIKELY, POSSIBLE or UNKNOWN by named rules.
- `contrail ingest` and `contrail doctor`.
- The `/contrail:why` skill, which passes its argument on standard input so it is never run as shell.

[Unreleased]: https://github.com/levimackay/contrail/compare/main...HEAD
[0.3.0]: https://github.com/levimackay/contrail/pull/2
[0.2.0]: https://github.com/levimackay/contrail/pull/1
[0.1.0]: https://github.com/levimackay/contrail/commit/15206e6
