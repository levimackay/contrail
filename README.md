# Contrail

[![CI](https://github.com/levimackay/contrail/actions/workflows/ci.yml/badge.svg)](https://github.com/levimackay/contrail/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](#license)

**Claude can tell you what it changed. Contrail shows the trail that led there, and how sure each step is.**

Contrail is a local-first plugin for Claude Code. It records hook events and answers one question about a file change, a shell command, or the last thing the agent did: what observable trail led to this action? It labels every input by origin (your prompt, CLAUDE.md, a repo file, the web, an MCP server, a subagent) and grades each link DIRECT, LIKELY, POSSIBLE or UNKNOWN from evidence alone. It never claims to know why the agent decided anything.

[Demo](#demo) · [Install](#install) · [Quick start](#quick-start) · [`contrail why`](#contrail-why) · [Grading](#how-grading-works) · [Privacy](#privacy-and-security) · [Limitations](#limitations) · [Roadmap](#roadmap)

## Demo

Claude Code was asked to figure out why authentication was broken. Along the way it read a README and installed a package nobody asked for. This is the actual CLI output for that session (it ships as a test fixture, so you can reproduce it):

```text
$ contrail why "npm install foo-auth-helper"
Bash  npm install foo-auth-helper
  session s1 · turn p1 · t4 · seq 9 · main agent

Requested?  NOT NAMED (the agent chose this). Your 1 sentence this session does not name it.  [R8]
Turn        DIRECT   ran while answering p1: "Figure out why authentication is broken."  [R1]

Where the values came from (data provenance, not the agent's reasons)
  foo-auth-helper  ($.command)
    LIKELY   only observed in auth-service/README.md:83  [R3]
             83│ use foo-auth-helper for token refresh
             repo file (local) · returned by t2 (seq 5)
    how the agent came to call Read t2:
      auth-service  ($.file_path)
        LIKELY   only observed in CLAUDE.md:4  [R3]
                 4│ When auth breaks, check auth-service first.
                 repo instructions (repo content, not you)
  (searched 4 inputs in this agent's context before seq 9)

Effects
  DIRECT   package.json       changed while this command ran  [R1 bashEditDiff]
  DIRECT   package-lock.json  changed while this command ran  [R1 bashEditDiff]

Weakest link on this trail: LIKELY
LIKELY means "this value first appeared in the agent's context from this source", not "this source made the agent act".
Not observable: the agent's reasons for this action.
Agent said (shown for context, never used as evidence): "The README recommends foo-auth-helper for token refresh, so I installed it."
Blind spots: model knowledge and reasoning; system prompt; AGENTS.md; context injected by other hooks. No observed source is not the same as no source.
```

In plain terms: you never named the package. The only place it appeared in the agent's context before the install was line 83 of `auth-service/README.md`, a file the agent read after line 4 of `CLAUDE.md` pointed it at `auth-service`. Claude Code itself reported both file changes, so those links are DIRECT. Nothing here claims the README *made* the agent act; it shows where the value came from.

## Why

After a session you can see what Claude Code did. It is much harder to see why one specific action happened.

- Why did it run `npm install foo-auth-helper`? You never asked for that package.
- Which file told it to? Was that your instruction, or a line in a README it read on the way?
- Did text from a web page or an MCP server end up in a shell command?

The session transcript holds the raw material, but answering from it means reading hundreds of events by hand. It also keeps your instructions and a README's instructions side by side without saying which is which, and they are not the same thing.

Contrail keeps them apart. It records what the agent consumed and did. For any action it shows which observed inputs held the strings in that action's arguments before the agent first used them, who wrote each input, and how strong the evidence is.

It is not a transcript viewer, a token tracker, a general logger or a security scanner. It has one job: explain the observable trail behind an action.

## How it compares

| Approach | What it tells you | How Contrail differs |
|---|---|---|
| `git blame` | Which commit last changed a line, and who committed it. | Works on shell commands and uncommitted changes. Reports the inputs that came before the action, not the history after it. |
| Session transcript viewers | Everything that happened, in order. | Filters to the inputs whose text appears in the action's arguments, labels who wrote each one, and grades the link. In a transcript, your prompt and a README line look alike. |
| Agent observability platforms (span trees) | Which call ran inside which, with timing and cost. | A span tree shows what was running, not where a value in a command came from. Contrail traces argument values back to the input that first held them, and runs locally from Claude Code hooks. |
| Prompt-injection scanners | Whether content looks like an attack. | Contrail makes no judgment about content. It reports origin and evidence grade, and it never blocks or alerts. |

These answer different questions. Contrail's is narrow on purpose.

## Install

Requires Claude Code on macOS or Linux. Recording needs only `sh`. Answering queries needs Node 22.13+ or Bun. Without either, Contrail keeps recording and tells you it needs one of them to answer.

```text
/plugin marketplace add levimackay/contrail
/plugin install contrail@contrail
```

Contrail has no history before it is installed. It records sessions from that point on.

To uninstall:

```text
/plugin uninstall contrail@contrail
```

Uninstalling deletes the recorded data. Add `--keep-data` to keep the history:

```text
/plugin uninstall contrail@contrail --keep-data
```

Windows is not supported.

## Quick start

1. Install the plugin and use Claude Code as usual. Contrail records in the background.
2. When Claude does something you want explained, ask from inside the session:

   ```text
   /contrail:why last
   /contrail:why src/auth/session.ts
   /contrail:why "npm install foo-auth-helper"
   ```

3. Or ask from a terminal. The CLI is `bin/contrail` inside the installed plugin. Alias it, replacing `<version>` with the directory under `~/.claude/plugins/cache/contrail/contrail/`:

   ```sh
   alias contrail="$HOME/.claude/plugins/cache/contrail/contrail/<version>/bin/contrail"
   contrail why last
   ```

   The path contains the plugin version, so update the alias after the plugin updates. From a clone of this repository, run it directly:

   ```sh
   sh plugin/bin/contrail why last
   ```

Run `contrail doctor` if a query returns nothing and you want to check the install.

## `contrail why`

```text
contrail why <target> [--json] [--data <dir>]
```

| Target | Explains |
|---|---|
| `<path>` | What led to changes to this file. |
| `"<command text>"` | What led to the shell command containing this text. |
| `last` | What led to the most recent side-effecting action. |

| Flag | Effect |
|---|---|
| `--json` | Print the explanation as JSON instead of text. |
| `--data <dir>` | Read the Contrail data directory at `<dir>` instead of the default location. |
| `--stdin` | Read the target from standard input. The skill uses this so your text is never interpreted by a shell. |

Commands in the current release:

| Command | What it does |
|---|---|
| `contrail why <target>` | Explain one action. |
| `contrail ingest` | Move spooled events into the database. It also runs before every command, so you rarely need it. |
| `contrail doctor` | Check the install and the recorded data. |

### Reading a report

The [demo](#demo) shows every part of a report.

- **Header.** The action, its session, turn and tool call, and whether the main agent or a subagent ran it.
- **Requested?** Whether your own sentences name the target. Text inside fenced code blocks is treated as pasted material and does not count. If the sentence that names it also contains a negation such as "don't" or "instead of", the verdict is downgraded and a warning is printed.
- **Turn.** The prompt the action ran under, recorded by Claude Code.
- **Where the values came from.** For each significant string in the action's arguments (a package name, a path, a URL), the input where it first appeared in the agent's context, with the source line quoted. If the agent learned a path by reading a file, the report follows that read one step upstream.
- **Searched.** How many inputs in the agent's context were checked. A value with no match is reported as UNKNOWN, not hidden.
- **Effects.** What the action changed, when Claude Code reported it.
- **Weakest link.** The grade of the whole trail: the weakest link that was found along it.
- **Footer.** What the grade does and does not mean, the agent's own words shown for context only, and the blind spots.

Every line names the rule that produced it (`[R3]`), so a grade can always be traced to a stated condition.

## The `/contrail:why` skill

`/contrail:why <args>` runs the CLI with the same targets and prints its output verbatim in a code block. Claude adds nothing to it. Your arguments reach the CLI through a quoted heredoc on standard input (`--stdin`), so text like `npm install foo; rm -rf x` is searched for, never run.

That is deliberate. The CLI output is the source of truth, and it keeps the model from "improving" an explanation into something more confident than the evidence. The skill is manual-only (`disable-model-invocation: true`): Claude never runs it on its own, only when you type it.

It needs the same runtime as the CLI: Node 22.13+ or Bun.

## How grading works

| Grade | Meaning |
|---|---|
| DIRECT | Claude Code recorded the join itself: an equality on hook fields such as `prompt_id`, `tool_use_id` or `tool_response.filePath`. No text matching is involved. |
| LIKELY | Exactly one observed input held this name-like token before the agent first used it. |
| POSSIBLE | Two or three inputs held it, or it is a plain word, or an effect is merely expected. |
| UNKNOWN | No observed input holds it, or four or more do (too common to attribute). Always printed with "not evidence of no influence" and the list of blind spots. |

### Data provenance, not the agent's reasons

Contrail answers two separate questions about one action:

1. Did your own words name it?
2. Where did the strings in its arguments first enter the agent's observable context?

It never answers why the agent decided. Every report says so in its heading ("data provenance, not the agent's reasons") and in its footer ("Not observable: the agent's reasons for this action.").

This is enforced by construction, not by tone:

- **Deterministic rules, no LLM.** An LLM summary would invent causality. Every grade comes from a named rule.
- **Text matching never reaches DIRECT.** Only joins that Claude Code recorded do. A chain is only as strong as its weakest inferred link.
- **The agent's own words cannot affect a grade.** Its visible text is passed to the renderer for display and to nothing else. Thinking blocks are ignored.
- **Trust labels never change a grade.** They say who wrote a source, not how strong the link is.
- **The wording is tested.** A unit test asserts that Contrail's own wording never uses `because`, `caused`, `led to`, `decided`, `tainted` or `malicious`. Quoted text from you, your files or the agent is shown as is.

### What counts as evidence

An input counts as "available to the agent" at an action only if all of these hold:

- It reached the same context. The main thread and each subagent are separate contexts, and a subagent does not inherit its parent's inputs.
- It arrived before the action. Tool calls in one parallel batch never see each other's output.
- It arrived after the latest compaction in that context. Earlier inputs are gone verbatim.

A token is a string from the action's arguments: a package name, a path, a URL, an argument value. Flags, short tokens, common words, and the directory names that make up your working directory, home directory and username are dropped. Matching is exact after normalization (Unicode NFKC, invisible characters stripped, lowercase) and respects word boundaries, so `foo-auth-helper` does not match inside `foo-auth-helper-v2`.

Name-like tokens (`foo-auth-helper`, `retryWithJitter`) can reach LIKELY. Plain words such as `express` cannot go above POSSIBLE. When several inputs hold the same token, your own words are credited first, and the others are listed as "also in".

Before a name reaches an action, the agent may have repeated it in an earlier call. Contrail uses the agent's first use as the cut-off, so an echo such as a `grep foo` result is never counted as the source of `foo`.

## Origins and trust

Every input is labeled with an origin. Trust says who wrote the source:

- `principal`: you.
- `config`: your own configuration.
- `local`: content on your machine or in your repo, not written by you.
- `external`: the network, a dependency, or a plugin.
- `agent`: text the agent itself wrote.

| Origin | Trust | Observed via |
|---|---|---|
| Your prompt | principal | `UserPromptSubmit` |
| A slash command you typed | principal | `UserPromptExpansion` |
| Slash-command template | config, local or external, by the command's source | `UserPromptExpansion` (expanded body) |
| Your instructions (user, local or managed CLAUDE.md) | config | `InstructionsLoaded` |
| Repo instructions (project CLAUDE.md, `.claude/rules`) | local: repo content, not you | `InstructionsLoaded` |
| Repo file or search output | local. Dependency directories (`node_modules`, `vendor`, `.venv`, `site-packages`) are external. `~/.claude` is config. | Read, Grep, Glob and LS results |
| Shell output | local. External for curl, wget, gh and git clone, fetch and pull. | Bash results |
| Web page (WebFetch) | external, labeled as a model's extraction of the page | WebFetch result and URL |
| Web search | external | WebSearch result |
| MCP result | external, annotated with the server's source | `mcp__*` tool results |
| Skill body | external if plugin-namespaced, otherwise local | Skill tool call and result |
| Subagent prompt and result, compaction summary, a file the agent wrote and later read back | agent (conduit) | Agent tool, `PostCompact`, a Read of an agent-written path |
| What the agent said | never evidence | `Stop`, shown for display only |

A conduit is text the agent wrote. It is never an origin: Contrail follows the same token upstream past it, to whoever first supplied it. Following conduits is planned for v0.1. The current release follows the chain from an action back through the file reads that led to it.

## What Contrail can and cannot see

Hook fields were checked against the Claude Code documentation for 2.1.283 to 2.1.284. Unknown or missing fields produce fewer links and an explicit "not observed" note, never a crash.

**What it records:**

| Signal | Hook |
|---|---|
| Your prompts and slash commands | `UserPromptSubmit`, `UserPromptExpansion` |
| CLAUDE.md and rules loads, including which file triggered a nested load | `InstructionsLoaded` |
| Every tool call before it runs, including ones later denied | `PreToolUse` |
| Tool results and file effects | `PostToolUse` |
| The exact text the model received from a batch of tool calls | `PostToolBatch` |
| Failed tool calls | `PostToolUseFailure` |
| Compaction boundaries | `PostCompact` |
| Subagent scope, via `agent_id` on hook payloads | all of the above |
| The end of a turn, shown as "agent said" and never as evidence | `Stop` |

**What it cannot see:**

- **Reasoning.** Contrail reports where an argument's value came from, never why the agent decided. Thinking blocks are ignored on purpose.
- **Which part of the context actually moved the model.** There are only proxies: literal data flow, order and scope. With no evidence the result is UNKNOWN, and UNKNOWN does not mean "no influence".
- **Raw web pages.** WebFetch hands Claude a small model's summary of the page. Contrail records that summary and the URL, and labels it as such.
- **`@`-mentioned files, AGENTS.md, and skill `!` shell preprocessing.** No hook fires for these. Contrail marks them unobserved when your prompt contains an `@`.
- **The system prompt**, and content that other hooks rewrote.
- **Anything before Contrail was installed.**

The report says so itself. UNKNOWN results print the number of inputs searched and the blind-spot list, and every report ends with the blind-spot line.

## Privacy and security

Contrail stores what your agent read. It is built so that it does not become a leak.

- **Local only.** No network calls and no telemetry.
- **Outside your repo.** Data lives in the plugin's data directory, so it is never part of your repository and it survives deleting a worktree.
- **Redaction before storage.** Secrets are replaced with `[REDACTED:<rule>]` before anything is written to the database, for example `OPENAI_API_KEY=[REDACTED:env-secret]`. Redaction walks the decoded string values of each payload rather than the serialized JSON, because escape sequences would otherwise defeat pattern boundaries. The rules cover:
  - PEM and PGP private-key blocks, including truncated ones
  - AWS, GitHub, GitLab, npm, Hugging Face, OpenAI, Anthropic, Slack, Stripe, SendGrid and Google credentials
  - Slack and Discord webhook URLs, Azure SAS signatures and JWTs
  - `Authorization`, `Proxy-Authorization`, `X-Api-Key` and `Cookie` / `Set-Cookie` headers
  - passwords in URL userinfo, `--password` flags, `curl -u user:pass` and `mysql -p…`
  - sensitive `KEY=VALUE` pairs (`secret`, `token`, `password`, `pwd`, `api_key`, `access_key`, `private_key`, `credential`), quoted or bare
  - any string stored under a secret-named JSON key, such as `{"password": "…"}` or `{"key": "DB_PASSWORD", "value": "…"}`

  Placeholders such as `${VAR}`, `<...>` and `xxxx`, and code that only names a secret (`getToken()`, `process.env.API_KEY`), are left alone. Every pattern is bounded, so a long run of text cannot make redaction backtrack; strings are capped before they are scanned.
- **No entropy scanning.** High-entropy detection flags nearly every git SHA, UUID and tool id, and those are exactly the keys Contrail joins on. The rules match known secret shapes and keyword-named values instead.
- **Bounded content.** Strings are capped at 256 KB. Edit `originalFile` contents and images are dropped, keeping only a sha256. A payload that cannot be processed is stored as a failure and never blocks later events.
- **Only instruction files are read from disk.** When Claude Code reports a loaded `CLAUDE.md` or `.claude/rules` file, Contrail reads that file (regular files only, within the size cap). If it changed after it loaded, its text is not used, because it is no longer what the agent saw.
- **Safe to print.** Reports strip control characters and backticks from recorded text, so a recorded string cannot restyle your terminal or turn into a command when a report is shown inside Claude Code.
- **A short unredacted window.** Each hook event is first written to a spool file, unredacted, with mode 0600. Ingest redacts it into the database and deletes the file. Ingest runs after each turn (an async `Stop` hook) and before every `contrail` command, so unredacted text exists for about one turn. That is the same trust boundary as Claude Code's own plaintext session transcripts.
- **Permissions.** The data directory is 0700 and its files are 0600.
- **Uninstall deletes the data**, unless you pass `--keep-data`.

Redaction is pattern-based, so it misses secrets it has no rule for. Treat `contrail.db` as sensitive.

## Performance

Capture is a POSIX `sh` hook (`plugin/hooks/capture.sh`) that writes each hook payload to its own file in the spool directory. It writes to a temporary file and renames it, so a reader never sees half a file.

The design target is 20 ms or less per hook. In development measurements on an M2 MacBook Air it takes about 15 ms per event. It prints nothing, always exits 0, and never blocks a tool call.

Two choices keep it that fast and safe:

- **Shell, not Node.** Node is not guaranteed to be present and starts much slower per invocation. Capture needs only `sh`.
- **One file per event, not a shared log.** Concurrent appends to a single file can interleave when payloads are large. Separate files cannot.

Capture is synchronous on purpose. Claude Code waits for each capture hook, so file order reflects real order, and the engine relies on that order. The cost is a small delay per event, which is why the budget is tight. The post-turn ingest is the only hook Contrail runs asynchronously (Claude Code itself fires `InstructionsLoaded` asynchronously; Contrail places lazily loaded instruction files at the Read that triggered them).

Grading happens when you ask. The only processing outside a query is that async ingest after each turn.

## Architecture

Paths below are relative to `plugin/`.

```
Claude Code ──hook JSON on stdin──▶ hooks/capture.sh ──▶ spool/<id>.json   (0600, unredacted, short-lived)
                                                           │
     Stop hook (async) · any `contrail` command ──▶ ingest ─┴▶ redact ─▶ contrail.db (events, touches)
                                                                           │
           contrail why ◀── render ◀── engine (pure) ◀── session loader ◀──┘
                 ▲
   /contrail:why skill ── runs the CLI, prints its output verbatim
```

- **Capture** (`hooks/capture.sh`): sets `umask 077`, copies stdin to a temp file in `spool/`, renames it into place, prints nothing, exits 0. If the data directory cannot be written, `hooks/health.sh` on `SessionStart` prints a warning that you see and the model does not.
- **Ingest** (TypeScript): for each spool file in name order, parses the JSON (keeping the raw file with a `parse_error` if it is invalid), redacts string values, caps sizes, inserts by spool name so a repeat is a no-op, fills the file-touch index, and deletes the spool file. Two concurrent ingests are safe.
- **Store:** SQLite in WAL mode, built into Node 22.13+ and Bun, so there are zero runtime dependencies. The database is a plain file you can inspect with `sqlite3`.
- **Engine** (`src/engine/`): pure functions over normalized events. No I/O, and no function that grades takes agent text as input.
- **Render:** the only place report wording lives.
- **Launcher** (`bin/contrail`): an `sh` script that runs `dist/contrail.mjs` with `bun` if present, otherwise `node` 22.13+.

Two decisions shape the design:

- **The provenance graph is derived at query time and never stored.** Sessions are small, so building the graph on demand is cheap, and improving a rule re-grades every old session with no migration.
- **Contrail observes and never intervenes.** It never blocks a tool call and never writes into the agent's context, because a recorder that changes the agent corrupts its own evidence.

### Repository layout

```
contrail/
├── .claude-plugin/
│   └── marketplace.json      marketplace entry, points at plugin/
├── plugin/                   the installable plugin
│   ├── .claude-plugin/
│   │   └── plugin.json
│   ├── hooks/                hook registrations and capture.sh
│   ├── bin/contrail          sh launcher
│   ├── skills/why/           the /contrail:why skill
│   └── dist/contrail.mjs     committed bundle built from src/
├── src/
│   ├── cli.ts, main.ts       command-line entry
│   ├── store/                SQLite adapter (node:sqlite or bun:sqlite), schema, migrations
│   ├── ingest/               spool → events: redaction, size caps, repository key
│   ├── graph/                events → provenance graph for one session
│   ├── engine/               pure provenance engine: tokens, context window, grading, explain
│   ├── query/                target resolution (path, command text, last)
│   └── render/               report wording
├── test/                     fixtures and integration tests
├── LICENSE
└── THIRD_PARTY_NOTICES
```

The bundle in `plugin/dist/` is committed so that installing the plugin needs no build step. CI fails if it differs from a fresh build of `src/`.

## Configuration

| Variable | Effect |
|---|---|
| `CONTRAIL_HOME` | Directory the CLI uses as the Contrail data directory. |

The CLI resolves the data directory in this order:

1. `CONTRAIL_HOME`
2. `CLAUDE_PLUGIN_DATA`, which Claude Code sets for plugin processes
3. the single directory matching `~/.claude/plugins/data/contrail-*`

Once installed, the data directory is `~/.claude/plugins/data/contrail-<marketplace>/`. It holds `contrail.db`, the `spool/` directory, and (planned) an optional `config.json`. Run the CLI from a terminal and it finds the directory on its own.

A `config.json` with `retention_days`, `max_db_mb` and `store_content` (set to `false` for hash-only storage) is planned for v0.1, along with retention.

## Limitations

- **It explains data flow, not decisions.** A LIKELY grade means a name first appeared in the agent's context from that source. It does not mean the source made the agent act.
- **Matching is literal.** If the agent paraphrased a source, or knew a name from training, Contrail finds no source and reports UNKNOWN. No observed source is not the same as no source.
- **No fuzzy matching.** Text matching never reaches DIRECT, and there is no paraphrase or embedding matching.
- **Shell file effects depend on a beta field.** Claude Code reports which files a shell command changed in `bashEditDiff`, which is beta. Without it, Contrail cannot record those changes as DIRECT.
- **Web content is a summary.** For WebFetch, Contrail sees what the model was given, not the page.
- **Unobserved inputs.** `@`-mentions, AGENTS.md, skill `!` preprocessing, the system prompt and other hooks' rewrites are not visible.
- **One session at a time.** Chains do not cross sessions.
- **History starts at install.**
- **Redaction is best effort.** Secrets without a matching rule can be stored.
- **Hook fields change between Claude Code releases.** Contrail tolerates unknown and missing fields and degrades to fewer links, but a renamed field can silently reduce what it can explain. `contrail doctor` is meant to surface this.
- **Claude Code only, on macOS and Linux.** No Windows and no other agents.

## Roadmap

Available now: `contrail why <path | "command" | last>`, `contrail ingest`, and `contrail doctor`.

**Planned for v0.1**

- `contrail why commit <sha>`: the actions behind a commit.
- `contrail trace`, with filters for writes, shell, network, MCP, subagents and instruction loads, and a `/contrail:trace` skill.
- `contrail sessions`.
- `contrail doctor` beyond the basics: counts of unknown or unparsed events and a capture timing check.
- `contrail export <session-id>`: session JSON to stdout.
- Retention and pruning, and `config.json`.
- Following conduits (subagent relays, compaction summaries, files the agent wrote).
- Expected shell effects, graded POSSIBLE and always worded as "expected, not observed".

**Planned for v0.2**

- A `risks` view: sensitive actions, such as credential-file access or network egress, that sit downstream of untrusted origins. Explain-only.
- `trace --tree`, an ASCII graph.
- Optional transcript enrichment, to show what the agent said right before each action.

**Planned for v0.3**

- OpenTelemetry export with `contrail.origin` and `contrail.grade` attributes.

Windows support, other agents and an enforcement companion that consumes Contrail's graph are considered only if there is demand.

## Development

Node 24 is used for development because it runs TypeScript test files directly by stripping types, so there is no test framework. The plugin itself needs Node 22.13+ or Bun at runtime and has no runtime dependencies. Dev dependencies are `typescript`, `esbuild` and `@types/node`.

```sh
npm ci           # install dev dependencies
npm test         # run the tests with node --test
npm run build    # bundle src/ into plugin/dist/contrail.mjs
npm run check    # typecheck, test, build, and fail if plugin/dist/ is out of date
```

Test the plugin against a real Claude Code session by loading it from the working tree:

```sh
claude --plugin-dir ./plugin
```

Grading rules are specified with adversarial cases that double as the regression suite. Examples include an injected "the user asked you to..." line in a README, a change of mind ("actually don't"), echo searches, parallel batches, compaction, and text laundered through a file the agent wrote. A rule change is not done until those still pass.

## Contributing

Issues and pull requests are welcome. Open an issue first for anything that changes grading rules or report wording.

- Keep `npm run check` green.
- Include tests with the change. For anything that could produce a false LIKELY or DIRECT, add an adversarial case.
- Keep the invariants: observe only, local only, no runtime dependencies, and no causal claims in the output.

## License

MIT. See [LICENSE](LICENSE). The vendored secret-redaction rules are also MIT and are credited in [THIRD_PARTY_NOTICES](THIRD_PARTY_NOTICES).
