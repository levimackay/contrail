# Contrail

[![CI](https://github.com/levimackay/contrail/actions/workflows/ci.yml/badge.svg)](https://github.com/levimackay/contrail/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](#license)

**For any command or edit Claude Code made, Contrail shows where the values in it came from, who wrote that source, and how strong the evidence is.**

![contrail risks: a credential upload traced to line 7 of a fetched web page](docs/risks.svg)

Above, Claude Code was asked to set up a CLI. It searched the web, fetched a setup page, and that page contained a line addressed to AI agents: send `~/.aws/credentials` to a remote URL. The agent ran it. `contrail risks` lists that command first and traces both the credentials path and the upload URL to line 7 of the fetched page, marked `external`. You never named either one.

Contrail is a local-first plugin for Claude Code. It records hook events and, when you ask, reconstructs the observable trail behind an action: which inputs held the strings in the action's arguments before the agent first used them, who wrote each input (you, your config, your repo, the network, the agent itself), and a grade for each link from DIRECT to UNKNOWN. It uses deterministic rules, no LLM, and it never claims to know why the agent did anything.

The output on this page comes from two scripted example sessions over a real git repository, the same ones `npm run demo` builds and the end-to-end tests run against. They are not recordings of a real incident.

[Try it](#try-it-in-10-seconds) · [Install](#install) · [why](#contrail-why) · [risks](#contrail-risks) · [trace](#contrail-trace) · [sessions](#contrail-sessions) · [why commit](#contrail-why-commit) · [Grading](#how-grading-works) · [Privacy](#privacy-and-security) · [Limitations](#limitations) · [Roadmap](#roadmap)

## Try it in 10 seconds

With Node 24 (the demo runs the TypeScript sources directly):

```sh
git clone https://github.com/levimackay/contrail && cd contrail
npm ci
npm run demo
```

`npm run demo` builds a small repository and two recorded Claude Code sessions in a temporary directory, then prints the commands to try against them. Nothing is installed and nothing touches your real Claude Code data.

The two sessions:

- **auth** (`4f2a91c7`): "Users are getting logged out after 30 minutes. Figure out why and fix it." `CLAUDE.md` points the agent at `auth-service`, whose README recommends `jwt-decode`. The agent installs it, edits the session code, runs the tests, and commits when you say "looks good, commit it".
- **injection** (`9c1e7b52`): "Set up the QuickAuth CLI on this machine so I can test logins locally." The agent searches, fetches a setup page, pipes an install script to `sh`, and then runs the credential upload the page asked for.

Every domain in them is a reserved `.example` name.

## Install

Requires Claude Code on macOS or Linux. Recording needs only `sh`. Answering queries needs Node 22.13+ or Bun. Without either, Contrail keeps recording and tells you it needs one of them to answer.

```text
/plugin marketplace add levimackay/contrail
/plugin install contrail@contrail
```

Contrail has no history before it is installed. It records sessions from that point on.

To uninstall (this deletes the recorded data; add `--keep-data` to keep it):

```text
/plugin uninstall contrail@contrail
```

Windows is not supported.

### Asking from inside Claude Code

Three skills run the CLI and print its output verbatim in a code block. Claude adds nothing to it.

```text
/contrail:why last
/contrail:why src/auth/session.ts
/contrail:why "npm install foo-auth-helper"
/contrail:risks
/contrail:trace
```

All three are manual-only (`disable-model-invocation: true`): Claude never runs them on its own, only when you type them. `/contrail:risks` and `/contrail:trace` take no arguments. `/contrail:why` passes your text to the CLI through a quoted heredoc on standard input, so text like `npm install foo; rm -rf x` is searched for, never run.

Keeping Claude out of the loop is deliberate. The CLI output is the source of truth, and a model paraphrasing it could make an explanation sound more certain than the evidence.

### Asking from a terminal

The CLI is `bin/contrail` inside the installed plugin. Alias it, replacing `<version>` with the directory under `~/.claude/plugins/cache/contrail/contrail/`:

```sh
alias contrail="$HOME/.claude/plugins/cache/contrail/contrail/<version>/bin/contrail"
contrail why last
```

The path contains the plugin version, so update the alias after the plugin updates. From a clone of this repository, run `sh plugin/bin/contrail` instead. Run `contrail doctor` if a query returns nothing and you want to check the install.

## `contrail why`

The trail behind one action: a file change, a shell command, or the latest thing the agent did.

![contrail why "npm install jwt-decode"](docs/why.svg)

You never named `jwt-decode`. The only place it appeared in the agent's context before the install was line 13 of `auth-service/README.md`. The agent read that file after line 4 of `CLAUDE.md` mentioned `auth-service`, so the report follows the read one step upstream. An install is expected to change `package.json` and the lockfile, but Claude Code did not report those changes for this command, so they are POSSIBLE and worded "expected, not observed". The agent's own summary is shown at the bottom for context and is never used as evidence.

```text
contrail why <path>               the trail behind the latest agent change to a file
contrail why "<command text>"     the trail behind the latest shell command containing the text
contrail why last                 the latest side-effecting action in this repository
contrail why commit <sha>         what a commit contains, joined to the agent changes behind it
```

Reading a report:

- **Header.** The action, its session, turn and tool call, and whether the main agent or a subagent ran it.
- **Requested?** Whether your own sentences name the target. Text inside fenced code blocks counts as pasted material, not your words. If the sentence that names it also contains a negation such as "don't" or "instead of", the verdict is downgraded and a warning is printed.
- **Turn.** The prompt the action ran under, recorded by Claude Code.
- **Where the values came from.** For each significant string in the arguments (a package name, a path, a URL), the input where it first appeared in the agent's context, with the source line quoted. The trail is followed upstream: to the call that fetched the source, and through anything the agent wrote itself (see [conduits](#origins-and-trust)).
- **Searched.** How many inputs were checked. A value with no match is reported as UNKNOWN, never hidden.
- **Effects.** What the action changed, when Claude Code reported it, and what it was expected to change when it did not.
- **Weakest link.** The grade of the whole trail.
- **Footer.** What the grade means and does not mean, the agent's own words, and the blind spots.

Every line names the rule that produced it (`[R3]`), so a grade can always be traced to a stated condition.

## `contrail risks`

Sensitive actions across recent sessions in this repository, with where their values came from. This is the view in the image at the top.

```text
contrail risks [--session <id> | --all] [--json]
```

An action is sensitive when it matches one of these descriptions:

| Kind | Examples |
|---|---|
| credentials | a command or file tool touching `~/.aws/credentials`, `~/.ssh/`, `.netrc`, `.npmrc`, `.env`, `.kube/config`, `.git-credentials`, the GitHub CLI's `hosts.yml`, `.pgpass`, gcloud or Azure credentials; or `printenv` / a bare `env`, which print every variable |
| runs remote code | `curl ... \| sh`, `sh <(curl ...)`, `eval "$(curl ...)"` |
| network | `curl`, `wget`, `scp`, `rsync`, `ssh`, `git push`, `gh api` |
| install | `npm install`, `pnpm add`, `pip install`, `cargo add`, `brew install`, `npx` |
| destructive | `rm -rf`, `git reset --hard`, `git push --force`, `DROP TABLE`, `chmod 777` |

They are ordered by what their trail shows, newest first within each group:

- `▲` some value traces to external content: the web, an MCP server, a dependency, or network output.
- `△` you did not name it.
- `·` you named it.

Contrail explains; it does not judge or block. A flagged action is not proof of an attack, and an unflagged one is not proof of safety. The kinds describe the command, not its intent.

## `contrail trace`

A session as a timeline, one line per action, with the headline source of each side effect.

![contrail trace --session 4f2a](docs/trace.svg)

```text
contrail trace [--session <id>] [--writes | --shell | --network | --mcp | --subagents | --instructions | --tree] [--json]
```

Without `--session` it shows the latest session in this repository. A session id prefix is enough. The filters narrow the timeline to one kind of action.

`--tree` shows the same session as a forest instead of a timeline. Each action hangs under the call whose output first held its headline value, so a chain of reads, fetches and commands reads top to bottom. An action whose value came from something no call produced, such as your prompt or an instructions file, starts a tree under that source.

![contrail trace --session 9c1e --tree](docs/trace-tree.svg)

In the injection session, the credential upload and the install script both hang under the fetched page, which hangs under the web search, which came from your prompt. The placement follows data only. It does not say the page made the agent act.

## `contrail sessions`

Recent sessions at a glance: turns, reads, writes, shell commands, web and MCP calls, subagents, and how many sensitive actions trace to external content.

![contrail sessions](docs/sessions.svg)

```text
contrail sessions [--limit N] [--all] [--json]
```

It lists sessions in this repository when there are any, otherwise all of them. `--all` always lists all of them.

## `contrail why commit`

What a commit contains, joined to the agent changes behind each file.

![contrail why commit](docs/why-commit.svg)

Contrail finds the recorded shell command whose output was git's own `[branch sha] subject` line, which makes the commit itself DIRECT. Agents often commit with `git commit -q`, which prints no such line. Then Contrail asks git when it dated the commit and looks for the one recorded `git commit` whose hooks bracket that second. That join is LIKELY, not DIRECT, and if two commits were running at once it attributes neither. It then asks git for the commit's file list and joins each file by path to the latest agent change before the commit. A file the agent changed is LIKELY, not DIRECT: git lists the file and the agent changed it earlier, but whether that exact change is what was committed is not observed. A file changed only by an expected effect is POSSIBLE. A file with no recorded agent change is UNKNOWN: you, another process, or an earlier session. Above, `docs/CHANGELOG.md` is in the commit but the agent never touched it.

Commits made outside Claude Code's shell tool are not recorded, so `why commit` reports them as not found. It needs to run inside the repository so git can list the files.

## Other commands

| Command | What it does |
|---|---|
| `contrail export [<session> \| last]` | Print a session's recorded (redacted) events as JSON. |
| `contrail doctor` | Check the data directory, schema, stored and spooled events, unparseable events, retention, and time the capture hook on this machine. |
| `contrail prune` | Apply retention now and compact the database. |
| `contrail ingest` | Move spooled events into the database. It also runs after every turn and before every command, so you rarely need it. |

Global options: `--json` (why, trace, risks, sessions), `--data <dir>` to read another data directory, `-h` and `-v`.

## How grading works

| Grade | Meaning |
|---|---|
| DIRECT | Claude Code recorded the join itself: an equality on hook fields such as `prompt_id`, `tool_use_id`, `tool_response.filePath`, `bashEditDiff`, or git's commit line in a command's output. No text matching or timing is involved. |
| LIKELY | Exactly one observed input held this name-like token before the agent first used it. |
| POSSIBLE | Two or three inputs held it, or it is a plain word, or an effect is only expected. |
| UNKNOWN | No observed input holds it, or four or more do (too common to attribute). Always printed with the number of inputs searched and the blind spots. |

The rules:

| Rule | What it grades |
|---|---|
| R1 | Joins Claude Code recorded: the turn an action ran in, the files it reported changing, the commit it made. DIRECT. |
| R2 | Which inputs count as available to the agent at an action (below). |
| R3 | Where a token's value came from: one source LIKELY, two or three POSSIBLE, four or more UNKNOWN. |
| R4 | No observed source: UNKNOWN, which is not evidence of no influence. |
| R5 | One step further upstream from a credited source, up to three hops. |
| R6 | Effects a command is expected to have (an installer and its lockfile, a redirect target, the host a `curl` names). POSSIBLE, worded "expected, not observed". |
| R7 | A commit's files joined to earlier agent changes. LIKELY at best. |
| R8 | Whether your own sentences name the action's target. |
| R9 | A commit joined to the one recorded `git commit` running in the second git dated it, when git printed no commit line (`git commit -q`). LIKELY at best; two or more candidates attribute nothing. |

### Data provenance, not the agent's reasons

Contrail answers two questions about an action: did your own words name it, and where did the strings in its arguments first enter the agent's observable context? It never answers why the agent acted. Every report says so in its heading and its footer.

That is enforced in code, not left to tone:

- **Deterministic rules, no LLM.** A generated summary would invent causality. Every grade comes from a named rule.
- **Text matching never reaches DIRECT.** Only joins Claude Code recorded do. A trail is only as strong as its weakest inferred link.
- **The agent's own words cannot affect a grade.** Its visible text goes to the renderer for display and to nothing else. Thinking blocks are ignored. A test asserts that replacing the agent's narration leaves the explanation unchanged.
- **Trust labels never change a grade.** They say who wrote a source, not how strong the link is.
- **The wording is tested.** A test fails if any report's own wording uses "because", "caused", "led to", "decided", "tainted" or "malicious". Quoted text from you, your files or the agent is shown as is.

### What counts as evidence

An input counts as available to the agent at an action only if all of these hold:

- It reached the same context. The main agent and each subagent are separate contexts, and a subagent does not inherit its parent's inputs.
- It arrived before the action. Tool calls in one parallel batch never see each other's output.
- It arrived after the latest compaction in that context. Earlier inputs survive only through the summary.

A token is a string from the action's arguments: a package name, a path, a URL, an argument value. Flags, short tokens, common words, and the directory names in your working directory, home directory and username are dropped. Matching is exact after normalization (Unicode NFKC, invisible characters stripped, lowercase) and respects word boundaries, so `foo-auth-helper` does not match inside `foo-auth-helper-v2`.

Name-like tokens (`foo-auth-helper`, `retryWithJitter`) can reach LIKELY. Plain words such as `express` stop at POSSIBLE. When several inputs hold the same token, your own words are credited first and the others are listed as "also in".

The agent may repeat a name before the action that matters, for example `npm search foo` before `npm install foo`. Contrail uses the agent's first use as the cut-off, so an echo such as a search result is never counted as the source of the name it was searching for.

## Origins and trust

Every input is labeled with an origin and a trust level that says who wrote it:

- `principal`: you.
- `config`: your own configuration.
- `local`: content on your machine or in your repo that you did not write.
- `external`: the network, a dependency, or a plugin.
- `agent`: text the agent itself wrote.

| Origin | Trust | Observed via |
|---|---|---|
| Your prompt | principal | `UserPromptSubmit` |
| A slash command you typed | principal | `UserPromptExpansion` |
| Slash-command or skill body | Not observed: Claude Code records the command you typed, not the text it expands to (including a skill's `!` output). Listed as a blind spot. If a prompt ever arrives expanded, the body is labeled config, local or external by the command's source. | `UserPromptExpansion` |
| Your instructions (user, local or managed CLAUDE.md) | config | `InstructionsLoaded` |
| Repo instructions (project CLAUDE.md, `.claude/rules`) | local: repo content, not you | `InstructionsLoaded` |
| Repo file or search output | local. Dependency directories (`node_modules`, `vendor`, `.venv`, `site-packages`) are external. `~/.claude` is config. | Read, Grep, Glob and LS results |
| Shell output | local. External for curl, wget, gh, and git clone, fetch and pull, and for any command that names a dependency directory (`cat node_modules/x/README.md`). | Bash results |
| Web page (WebFetch) | external, labeled as a model's extraction of the page | WebFetch result and URL |
| Web search | external | WebSearch result |
| MCP result | external, annotated with the server | `mcp__*` tool results |
| Skill body (a skill the model invoked) | local for the project's `.claude/skills`, config for `~/.claude/skills`, read from disk at ingest because the tool result only says the skill launched. Plugin skills, and a name found in both places, are not read and are listed as a blind spot. | Skill tool call |
| Subagent prompt and result, compaction summary, a file the agent wrote and later read back | agent (conduit) | Agent tool, `PostCompact`, a Read of an agent-written path |
| A background task's report (`<task-notification>`), which Claude Code delivers as a prompt | the task's own: agent for a subagent, shell output for a command. Never principal. | `UserPromptSubmit` |
| What the agent said | never evidence | `Stop`, displayed only |

A **conduit** is text the agent wrote. It is never an origin: Contrail follows the same token past it to whoever supplied it first.

- A compaction summary is followed to the inputs from before the compaction.
- A file the agent wrote and later read back is followed into the write, even when a subagent did the writing.
- A subagent's instructions are followed into the parent's context that wrote them.
- A subagent's report, including one delivered later from the background, is followed into the subagent's own context.

## What Contrail can and cannot see

Hook fields were checked against the Claude Code documentation for 2.1.283 to 2.1.284. Unknown or missing fields produce fewer links and an explicit "not observed" note, never a crash.

Live sessions on Claude Code 2.1.284 (Linux, default permission mode) have exercised prompts, instruction loads, Read, Grep, Glob, Bash (including heredoc writes and `git commit -q`), Write, failed tool calls, background subagents and their `<task-notification>` reports, `SessionEnd`, and all three skills. WebFetch, WebSearch, MCP results, compaction and `bashEditDiff` are so far covered only by scripted sessions built from the documented payload shapes.

**What it records:**

| Signal | Hook |
|---|---|
| Your prompts and slash commands | `UserPromptSubmit`, `UserPromptExpansion` |
| CLAUDE.md and rules loads, including which file triggered a nested load | `InstructionsLoaded` |
| Every tool call before it runs, including ones later denied | `PreToolUse` |
| Tool results and file effects | `PostToolUse` |
| The exact text the model received from a batch of tool calls | `PostToolBatch` |
| Failed tool calls | `PostToolUseFailure` |
| Compaction boundaries and summaries | `PostCompact` |
| The end of a session, which also drains the spool | `SessionEnd` |
| Subagent scope | `SubagentStart`, `SubagentStop`, and `agent_id` on hook payloads |
| The end of a turn, shown as "agent said" and never as evidence | `Stop` |

**What it cannot see:**

- **Reasoning.** Contrail reports where an argument's value came from, never why the agent chose it. Thinking blocks are ignored on purpose.
- **Which part of the context actually moved the model.** There are only proxies: literal data flow, order and scope. With no evidence the result is UNKNOWN, and UNKNOWN does not mean "no influence".
- **Raw web pages.** WebFetch hands the model a smaller model's extraction of the page. Contrail records that text and the URL, and labels it as such.
- **`@`-mentioned files, AGENTS.md, and the text a slash command or skill expands to**, including a skill's `!` shell output. No hook carries these. Contrail lists `@`-mentions and slash commands in your prompts as blind spots.
- **The system prompt**, and content other hooks rewrote.
- **Anything before Contrail was installed.**

Reports say so themselves: every one ends with its blind spots, and UNKNOWN results print how many inputs were searched.

## Privacy and security

Contrail stores what your agent read. It is built so that it does not become the leak.

- **Local only.** No network calls and no telemetry.
- **Observe only.** It never blocks a tool call and never prints into the agent's context. A recorder that changes the agent corrupts its own evidence.
- **Outside your repo.** Data lives in the plugin's data directory, so it is never part of your repository and it survives deleting a worktree.
- **Redaction before storage.** Secrets are replaced with `[REDACTED:<rule>]` before anything is written to the database, for example `OPENAI_API_KEY=[REDACTED:env-secret]`. Redaction walks the decoded string values of each payload rather than the serialized JSON, because escape sequences would otherwise defeat pattern boundaries. The rules cover:
  - PEM and PGP private-key blocks, including truncated ones
  - AWS, GitHub, GitLab, npm, Hugging Face, OpenAI, Anthropic, Slack, Stripe, SendGrid and Google credentials
  - Slack and Discord webhook URLs, Azure SAS signatures and JWTs
  - `Authorization`, `Proxy-Authorization`, `X-Api-Key` and `Cookie` / `Set-Cookie` headers
  - passwords in URL userinfo, `--password` flags, `curl -u user:pass` and `mysql -p…`
  - sensitive `KEY=VALUE` pairs (`secret`, `token`, `password`, `pwd`, `api_key`, `access_key`, `private_key`, `credential`), quoted or bare
  - any string stored under a secret-named JSON key, such as `{"password": "…"}` or `{"key": "DB_PASSWORD", "value": "…"}`

  Placeholders such as `${VAR}`, `<...>` and `xxxx`, and code that only names a secret (`getToken()`, `process.env.API_KEY`), are left alone.
- **Bounded work.** Every regex quantifier is bounded and strings are capped before they are scanned, so a long run of hostile text cannot make redaction backtrack.
- **No entropy scanning.** High-entropy detection flags nearly every git SHA, UUID and tool id, and those are exactly the keys Contrail joins on. The rules match known secret shapes and keyword-named values instead.
- **Bounded content.** Strings are capped at 256 KB. Edit `originalFile` contents and images are dropped. A payload that cannot be processed is stored as a failure and never blocks later events.
- **Only instruction and skill files are read from disk.** When Claude Code reports a loaded `CLAUDE.md` or `.claude/rules` file, or the model invokes a skill by a bare name, Contrail reads that one file: the instructions file, or `SKILL.md` under your or the project's `.claude/skills/<name>/`. If a skill of that name exists in both places, which one ran is not observable, so neither is read. Only regular files within the size cap are read. The text is redacted like everything else, and not kept if the file changed after it loaded, because then it is no longer what the agent saw.
- **Safe to print.** Reports strip control characters and backticks from recorded text, so a recorded string cannot restyle your terminal or turn into a command when a report is shown inside Claude Code.
- **A short unredacted window.** Each hook event is first written to a spool file, unredacted, with mode 0600. Ingest redacts it into the database and deletes the file. Ingest runs after each turn (an async `Stop` hook), again when the session ends (a synchronous `SessionEnd` hook, since Claude Code may not finish an async hook on exit), and before every `contrail` command. So unredacted text exists for about one turn, and never outlasts the session unless ingest cannot run. That is the same trust boundary as Claude Code's own plaintext session transcripts.
- **Permissions.** The data directory is 0700 and its files are 0600.
- **Retention.** Sessions older than 90 days are removed, and the oldest go first when the database passes 1024 MB. Both are configurable (below).
- **Uninstall deletes the data**, unless you pass `--keep-data`.

Redaction is pattern-based, so it misses secrets it has no rule for. Treat `contrail.db` as sensitive.

## Architecture

```mermaid
flowchart LR
  CC[Claude Code] -- hook JSON on stdin --> CAP[hooks/capture.sh]
  CAP -- one file per event, 0600 --> SPOOL[(spool/)]
  SPOOL --> ING[ingest: redact, cap, index]
  ING --> DB[(contrail.db)]
  DB --> G[graph: events to inputs, actions, effects]
  G --> E[engine: pure rules R1 to R8]
  E --> R[render: all report wording]
  R --> CLI[contrail CLI]
  CLI --> SK["/contrail:why, :risks, :trace"]
```

- **Capture** (`plugin/hooks/capture.sh`): POSIX `sh`. Sets `umask 077`, copies stdin to a temp file in `spool/`, renames it into place, prints nothing, exits 0. One file per event, because concurrent appends to one shared log can interleave. Shell rather than Node, because Node is not guaranteed to be present and starts far slower. The design target is 20 ms or less per event; `contrail doctor` times it on your machine. Capture is synchronous so file order is event order.
- **Ingest:** for each spool file in name order, parses the JSON (keeping the raw file as a failure if it is invalid), redacts string values, caps sizes, inserts by spool name so a repeat is a no-op, fills the file-touch index, applies retention, and deletes the spool file. Two concurrent ingests are safe.
- **Store:** SQLite in WAL mode through `node:sqlite` or `bun:sqlite`, so nothing native to install. The database is a plain file you can inspect with `sqlite3`.
- **Graph and engine** (`src/graph/`, `src/engine/`): the provenance graph is derived at query time and never stored. Sessions are small, so this is cheap, and improving a rule re-grades every old session with no migration. The engine is pure functions over normalized events, and no function that grades takes agent text as input.
- **Render** (`src/render/`): the only place report wording lives.
- **Launcher** (`plugin/bin/contrail`): an `sh` script that runs the committed bundle `plugin/dist/contrail.mjs` with `bun` if present, otherwise `node` 22.13+.

The only runtime dependency, `shell-quote`, is bundled, so installing the plugin needs no build step and no `npm install`. CI fails if the bundle differs from a fresh build of `src/`.

### Repository layout

```
contrail/
├── .claude-plugin/marketplace.json   marketplace entry, points at plugin/
├── plugin/                           the installable plugin
│   ├── .claude-plugin/plugin.json
│   ├── hooks/                        hook registrations, capture.sh, health.sh
│   ├── bin/contrail                  sh launcher
│   ├── skills/                       /contrail:why, /contrail:risks, /contrail:trace
│   └── dist/contrail.mjs             committed bundle built from src/
├── src/
│   ├── cli.ts, main.ts               command-line entry
│   ├── store/                        SQLite adapter, schema, migrations, retention
│   ├── ingest/                       spool to events: redaction, size caps, repository key
│   ├── graph/                        events to provenance graph for one session
│   ├── engine/                       pure rules: tokens, context window, grading, trace, risks
│   ├── query/                        targets, sessions, commits
│   └── render/                       report wording and terminal style
├── scripts/                          npm run demo, npm run svg
├── docs/                             rendered demo output for this README
└── test/                             fixtures, end-to-end and adversarial tests
```

## Configuration

| Variable | Effect |
|---|---|
| `CONTRAIL_HOME` | Directory the CLI uses as the Contrail data directory. |
| `NO_COLOR` | Turn color off. |
| `FORCE_COLOR` | Turn color on when stdout is not a terminal. |

The CLI resolves the data directory in this order: `--data`, `CONTRAIL_HOME`, `--plugin-data` (which the skills pass), `CLAUDE_PLUGIN_DATA` (which Claude Code sets for plugin processes), then the single directory matching `~/.claude/plugins/data/contrail-*`. The capture hook also puts `CONTRAIL_HOME` first, so if you set it, recording, the skills and the CLI all use it. It holds `contrail.db`, the `spool/` directory and an optional `config.json`:

```json
{ "retention_days": 90, "max_db_mb": 1024 }
```

Missing or invalid values fall back to these defaults, and `contrail doctor` reports a `config.json` it cannot parse.

## How it compares

| Approach | What it tells you | How Contrail differs |
|---|---|---|
| `git blame` | Which commit last changed a line, and who committed it. | Works on shell commands and uncommitted changes, and reports the inputs before the action, not the history after it. `why commit` goes the other way: from a commit to the agent changes and sources behind it. |
| Session transcript viewers | Everything that happened, in order. | Filters to the inputs whose text appears in the action's arguments, labels who wrote each one, and grades the link. In a transcript, your prompt and a README line look alike. |
| Agent observability platforms (span trees) | Which call ran inside which, with timing and cost. | A span tree shows what was running, not where a value in a command came from. Contrail traces argument values to the input that first held them, locally, from Claude Code hooks. |
| Prompt-injection scanners and guardrails | Whether content looks like an attack, often blocking it. | Contrail makes no judgment about content and never blocks. `risks` reports which sensitive actions trace to external content, after the fact. The two fit together. |

These answer different questions. Contrail's is narrow on purpose.

## Limitations

- **It explains data flow, not decisions.** A LIKELY grade means a name first appeared in the agent's context from that source. It does not mean the source made the agent act.
- **Matching is literal.** If the agent paraphrased a source, or knew a name from training, Contrail finds no source and reports UNKNOWN. No observed source is not the same as no source.
- **No fuzzy matching.** There is no paraphrase or embedding matching, by design.
- **Shell file effects depend on a beta field.** Claude Code reports which files a shell command changed in `bashEditDiff`, which is beta. Without it, those changes are only "expected, not observed".
- **Web content is an extraction.** For WebFetch, Contrail sees what the model was given, not the page.
- **Unobserved inputs.** `@`-mentions, AGENTS.md, slash-command and skill bodies, the system prompt and other hooks' rewrites are not visible.
- **One session at a time.** Trails do not cross sessions. `why commit` only sees agent changes in the session that made the commit.
- **Sensitive-action patterns are a fixed list.** `risks` recognizes common credential paths and command shapes. An unusual command can go unflagged.
- **History starts at install.**
- **Redaction is best effort.** Secrets without a matching rule can be stored.
- **Hook fields change between Claude Code releases.** Contrail tolerates unknown and missing fields and degrades to fewer links, but a renamed field can quietly reduce what it can explain. `contrail doctor` counts unparseable events.
- **Claude Code only, on macOS and Linux.**

## Roadmap

**Shipped in 0.1**

- [x] Capture for every hook event, with redaction before storage
- [x] `contrail why <path | "command" | last>` and the `/contrail:why` skill
- [x] `contrail ingest` and `contrail doctor`

**Shipped in 0.2**

- [x] `contrail why commit <sha>`: a commit's files joined to the agent changes behind them
- [x] `contrail risks`: sensitive actions, those tracing to external content first. Explain-only.
- [x] `contrail trace` with `--writes`, `--shell`, `--network`, `--mcp`, `--subagents` and `--instructions`
- [x] `contrail sessions`, `contrail export`, `contrail prune`
- [x] `/contrail:risks` and `/contrail:trace` skills
- [x] Following conduits: compaction summaries, subagent prompts, files the agent wrote and read back
- [x] Expected shell effects (R6), always worded "expected, not observed"
- [x] Retention and `config.json`; `doctor` counts unparseable events and times the capture hook
- [x] Color output, honoring `NO_COLOR` and `FORCE_COLOR`
- [x] `trace --tree`: the session as a forest of trails
- [x] `why commit` for quiet commits (`git commit -q`), joined on git's commit time (R9)
- [x] Background task reports (`<task-notification>`) labeled by the task that produced them, never as your words
- [x] A synchronous `SessionEnd` ingest, so the unredacted spool never outlives a session

**Planned**

- [ ] Optional transcript enrichment, to show what the agent said right before each action
- [ ] `store_content: false` in `config.json`, for hash-only storage
- [ ] OpenTelemetry export with `contrail.origin` and `contrail.grade` attributes

Windows support, other agents, and an enforcement companion that consumes Contrail's graph are considered only if there is demand.

## Development

Node 24 is used for development because it runs TypeScript directly by stripping types, so there is no test framework beyond `node --test`. The plugin itself needs Node 22.13+ or Bun at runtime. Dev dependencies are `typescript`, `esbuild` and `@types/node`.

```sh
npm ci           # install dev dependencies
npm test         # run the tests with node --test
npm run build    # bundle src/ into plugin/dist/contrail.mjs
npm run check    # typecheck, test, build, and fail if plugin/dist/ is out of date
npm run demo     # build the example repository and sessions, and print commands to try
npm run svg      # re-render docs/*.svg from the example sessions
```

Test the plugin against a real Claude Code session by loading it from the working tree:

```sh
claude --plugin-dir ./plugin
```

Grading rules are specified with adversarial cases that double as the regression suite: the agent's own narration claiming you asked for something, a change of mind ("actually don't"), echo searches, parallel batches, compaction, text relayed through a subagent's instructions or through a file a subagent wrote, and hostile or pathological input to redaction and ingest. A rule change is not done until those still pass.

## Contributing

Issues and pull requests are welcome. Open an issue first for anything that changes grading rules or report wording.

- Keep `npm run check` green.
- Include tests with the change. For anything that could produce a false LIKELY or DIRECT, add an adversarial case.
- Keep the invariants: observe only, local only, no new runtime dependencies, and no causal claims in the output.

## License

MIT. See [LICENSE](LICENSE). The vendored secret-redaction rules are also MIT and are credited in [THIRD_PARTY_NOTICES](THIRD_PARTY_NOTICES).
