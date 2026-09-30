# Contributing to Contrail

Thanks for helping. Issues and pull requests are welcome. For anything that changes grading rules or report wording, open an issue first so we can agree on the rule before the code.

## Setup

Node 24 is used for development, because it runs the TypeScript sources directly. The plugin itself runs on Node 22.13+ or Bun.

```sh
git clone https://github.com/levimackay/contrail && cd contrail
npm ci
npm run check    # typecheck, test, build, and fail if plugin/dist/ is out of date
```

| Command | What it does |
|---|---|
| `npm test` | Run the tests with `node --test` |
| `npm run build` | Bundle `src/` into `plugin/dist/contrail.mjs` |
| `npm run demo` | Build the example repository and sessions, and print commands to try |
| `npm run svg` | Re-render `docs/*.svg` from the example sessions |
| `claude --plugin-dir ./plugin` | Load the working tree as a plugin in a real Claude Code session |

The bundle in `plugin/dist/` is committed so that installing the plugin needs no build step. Run `npm run build` and commit the result with any change to `src/`; CI fails if they differ.

## The invariants

These hold for every change:

- **Observe only.** Never block a tool call, never print into the agent's context.
- **Local only.** No network calls, no telemetry.
- **Redact before storage.** Every regex quantifier stays bounded.
- **DIRECT only for joins Claude Code recorded.** Text matches top out at LIKELY.
- **The agent's own words are never evidence.** They are displayed, nothing more.
- **No causal claims.** Report wording lives only in `src/render/`, and a test rejects "because", "caused", "led to", "decided", "tainted" and "malicious".
- **No new runtime dependencies.**

## Tests

Include tests with every change. For anything that could produce a false LIKELY or DIRECT, add an adversarial case: the kind of input that would fool a careless rule. The suite already covers the agent's narration claiming you asked for something, a change of mind ("actually don't"), echo searches, parallel batches, compaction, text relayed through subagents and agent-written files, and hostile input to redaction and ingest.

For behavior that depends on Claude Code's hook payloads, a scripted session in `test/fixtures/synthetic.ts` style is the usual test. If you exercised it in a live session too, say so in the pull request.

`test/golden.test.ts` pins every report byte for byte on the demo sessions and a long generated session, so a change meant only to make things faster must leave it passing. When a change to the output is intended, rerun it with `CONTRAIL_GOLDEN_WRITE=1` and review the diff of `test/fixtures/golden/`. To time the query commands before and after a change, run `node scripts/bench-queries.ts [runs] [bundle]`.

## Commits and pull requests

- Keep commits small, and write messages that say why, not just what.
- Keep `npm run check` green.
- Describe in the pull request what you verified and what you could not.
