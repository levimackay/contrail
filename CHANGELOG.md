# Changelog

All notable changes to Contrail. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- `contrail export --otel`: a session as OpenTelemetry traces (OTLP/JSON). Sessions, turns and tool calls become spans with real times, Contrail's grades and trust labels become `contrail.*` attributes, provenance edges become span links, and effects become span events.
- `contrail report` and the `/contrail:report` skill: a session as one self-contained HTML page with summary cards, sensitive actions, the timeline, and every call's full trail. It loads nothing and runs no script, and it is written with mode 0600.
- A changelog, security policy, contributing guide, and issue and pull request templates.

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

[Unreleased]: https://github.com/levimackay/contrail/compare/5ec712e...HEAD
[0.2.0]: https://github.com/levimackay/contrail/pull/1
[0.1.0]: https://github.com/levimackay/contrail/commit/15206e6
