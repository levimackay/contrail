# Security policy

Contrail records what your coding agent read and did, so its own safety matters. It is local only: it makes no network calls and sends no telemetry.

## Reporting a vulnerability

Please do not open a public issue for a security problem.

Report it privately through GitHub: [open a security advisory](https://github.com/levimackay/contrail/security/advisories/new). If that page is not available to you, open an issue that asks for a private contact and leave out the details.

Include what you did, what happened, and what you expected. A failing test or a small recorded session (redacted) is the fastest way to a fix.

## What counts

Anything that breaks one of these promises is in scope:

- **Nothing leaves the machine.** No network calls, no telemetry.
- **Observe only.** Contrail never blocks a tool call, never makes a permission decision, and its hooks never write into the agent's context. The tripwire's notice is a `systemMessage`, which Claude Code shows to you and does not give to the model. (A `/contrail:*` skill you run does put its report into the conversation: that is what running it asks for.)
- **Redaction before storage.** Secrets matching a rule never reach the database. With `store_content: false`, no text the agent read reaches it at all.
- **Safe to print.** Recorded text cannot put terminal escapes or backticks into a report.
- **Bounded work.** Hostile input cannot make capture, ingest or redaction hang or block later events.
- **Honest grading.** Nothing can make a text match reach DIRECT, or make the agent's own words or a third party's text count as yours.

A secret with no matching redaction rule is a known limitation rather than a vulnerability, but a report with the shape of the secret is welcome and usually becomes a new rule.

## What Contrail cannot protect against

- **The agent runs as you.** Claude Code's tools run with your account's permissions, and Contrail's data directory is yours, so an agent with shell access can add, change or delete what Contrail recorded, like any other file you own. Contrail flags every call that names its data directory or database as a sensitive action (`touches Contrail's records`), and the tripwire watches for it, but a record kept by the same account it observes is evidence, not a tamper-proof log. If you need that, ship the OpenTelemetry export to a collector the agent cannot write to.
- **Skill arguments are passed through a quoted heredoc.** `/contrail:why` and `/contrail:find` hand their argument to the CLI on stdin, so it is never expanded by the shell. A line consisting of exactly `CONTRAIL_TARGET` would end that heredoc early; only paste untrusted text as an argument if you have read it.
- **Unrecorded input.** What Claude Code does not pass to hooks (the system prompt, some injected context, the model's own knowledge) cannot be traced. Every report lists these blind spots.

## Supported versions

Fixes land on `main` and in the next release. Only the latest release is supported.
