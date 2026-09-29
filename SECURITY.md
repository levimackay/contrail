# Security policy

Contrail records what your coding agent read and did, so its own safety matters. It is local only: it makes no network calls and sends no telemetry.

## Reporting a vulnerability

Please do not open a public issue for a security problem.

Report it privately through GitHub: [open a security advisory](https://github.com/levimackay/contrail/security/advisories/new). If that page is not available to you, open an issue that asks for a private contact and leave out the details.

Include what you did, what happened, and what you expected. A failing test or a small recorded session (redacted) is the fastest way to a fix.

## What counts

Anything that breaks one of these promises is in scope:

- **Nothing leaves the machine.** No network calls, no telemetry.
- **Observe only.** Contrail never blocks a tool call and never writes into the agent's context.
- **Redaction before storage.** Secrets matching a rule never reach the database. With `store_content: false`, no text the agent read reaches it at all.
- **Safe to print.** Recorded text cannot put terminal escapes or backticks into a report.
- **Bounded work.** Hostile input cannot make capture, ingest or redaction hang or block later events.
- **Honest grading.** Nothing can make a text match reach DIRECT, or make the agent's own words or a third party's text count as yours.

A secret with no matching redaction rule is a known limitation rather than a vulnerability, but a report with the shape of the secret is welcome and usually becomes a new rule.

## Supported versions

Fixes land on `main` and in the next release. Only the latest release is supported.
