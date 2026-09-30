<h1 align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/logo-dark.svg">
    <source media="(prefers-color-scheme: light)" srcset="docs/logo-light.svg">
    <img src="docs/logo-light.svg" alt="Contrail" width="420">
  </picture>
</h1>

<h3 align="center">Ask why Claude Code did anything. Get the record, not a story.</h3>

<p align="center">
  <a href="https://github.com/levimackay/contrail/actions/workflows/ci.yml"><img src="https://github.com/levimackay/contrail/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT license"></a>
  <a href="package.json"><img src="https://img.shields.io/badge/version-0.4.0-green.svg" alt="Version 0.4.0"></a>
  <a href="#quick-start"><img src="https://img.shields.io/badge/Claude%20Code-plugin-d97757.svg" alt="Claude Code plugin"></a>
  <a href="#requirements"><img src="https://img.shields.io/badge/runtime-Node%2022.13%2B%20%7C%20Bun-339933.svg" alt="Node 22.13+ or Bun"></a>
  <a href="#privacy-and-security"><img src="https://img.shields.io/badge/data-local%20only-555.svg" alt="Local only"></a>
</p>

<p align="center">
  <a href="#quick-start">Quick start</a> ·
  <a href="#why-not-just-ask-claude">Why not just ask Claude?</a> ·
  <a href="#commands">Commands</a> ·
  <a href="#how-it-works">How it works</a> ·
  <a href="#how-grading-works">Grading</a> ·
  <a href="#privacy-and-security">Privacy</a> ·
  <a href="#faq">FAQ</a>
</p>

Claude Code just installed a package you never mentioned, piped a script into `sh`, or rewrote a function in a way you did not ask for. Where did that come from? A README it read? A web page? Your own words, three prompts ago?

Claude cannot tell you reliably. Once a session ends, its context is gone, and even mid-session its explanation is a reconstruction, not a record. **Contrail keeps the record.** It is a local Claude Code plugin that records what the agent read and did, and traces every value in an action (a package name, a path, a URL) back to the input where it first appeared, with who wrote that input and how sure each link is.

## Quick start

Inside Claude Code:

```text
/plugin marketplace add levimackay/contrail
/plugin install contrail@contrail
```

Pick "Install for you (user scope)" when asked. Contrail is active at once and records from the next tool call. From a terminal, the same is `claude plugin marketplace add levimackay/contrail` then `claude plugin install contrail@contrail`.

That is all the setup there is. From then on:

**1. It warns you before a risky call whose values came from outside.** When Claude is about to touch credentials, the network or the shell, and a value in that call first appeared in a web page, an MCP result or a dependency's files, you see one line before Claude Code asks for permission:

```text
PreToolUse:Bash says: Contrail ▲ runs remote code · network · not named in your words:
get.fastlog.example/setup.sh first appeared in node_modules/fastlog/README.md:9 (external, LIKELY).
Trail: /contrail:why toolu…cgnJw
```

The notice goes to you, not to Claude, and it never blocks anything or changes a permission decision.

**2. You can ask why about anything.** Point `/contrail:why` at whatever looks wrong:

```text
/contrail:why                              the last thing Claude did
/contrail:why src/auth/session.ts:42       the call that last wrote that line, and where its values came from
/contrail:why src/auth/session.ts          the latest change to the file
/contrail:why "npm install jwt-decode"     the latest command containing that text
/contrail:why jwt-decode                   the latest call that used that value
/contrail:why 3f9c2e1                      a commit, joined to the agent changes in it
```

Before you open a pull request that Claude wrote, `/contrail:review` summarizes the branch for whoever reviews it: which files the agent changed, whether you asked for them, and any value that came from a web page or an MCP server.

Every report starts with the answer and then shows the evidence:

<p align="center">
  <img src="docs/hero.svg" alt="contrail why: a credential upload traced to line 7 of a fetched web page">
</p>

Above, Claude Code was asked to set up a CLI. It searched the web and fetched a setup page containing a line addressed to AI agents: send `~/.aws/credentials` to a remote URL. The agent ran it. You never named either value; both first appeared on line 7 of that page, which the agent found through a web search that started from your prompt.

<sub>All output on this page comes from two scripted example sessions over a real git repository: the same ones `npm run demo` builds and the end-to-end tests run against. They are not recordings of a real incident. Every domain in them is a reserved `.example` name. The tripwire notice above is from a live Claude Code session against a local test repository.</sub>

**Try it without installing.** With Node 24, `npm run demo` builds a small repository and two recorded sessions in a temporary directory, then prints the commands to run against them:

```sh
git clone https://github.com/levimackay/contrail && cd contrail
npm ci && npm run demo
```

## Why not just ask Claude?

You can ask Claude why it did something, and it will give you an answer. It is not the same thing:

- **The context is gone.** After a session ends, or after compaction, Claude does not have what it read. Contrail does, across every session since you installed it.
- **An explanation is not a record.** Claude's answer is generated after the fact. Contrail shows the input a value came from, quotes the line, and says who wrote it.
- **Your words and a web page look the same to the model.** Contrail labels every source: you, your config, your repo, the web or an MCP server, or the agent itself. A value that came from a README is never reported as yours.
- **An agent that followed an injected instruction is the wrong witness.** Contrail uses no LLM. Every grade comes from a named, deterministic rule over what Claude Code recorded.

What it gives you instead:

- **One command for any question.** `/contrail:why` takes a file, a line, a command, a commit, a call id or a value, or nothing for the last action.
- **Line-level provenance.** `blame` shows each line of a file next to the recorded agent call that last wrote it, across sessions; `why file:line` gives that call's full trail.
- **A warning before, not only an answer after.** The tripwire tells you when a sensitive call's values came from external content, before you approve it.
- **Graded evidence.** Every link is DIRECT, LIKELY, POSSIBLE or UNKNOWN by a named rule (`[R3]`), and every report says what Contrail could not see.
- **Sees through the agent's own notes.** Subagent instructions and reports, compaction summaries, and files the agent wrote and read back are followed to whoever supplied the value first.
- **Local, observe only, redacted.** No network calls, no telemetry, nothing blocked. Secrets are removed before anything is stored, and `store_content: false` stores no text the agent read at all.

## Commands

| Command | What it shows |
|---|---|
| [`contrail why [<anything>]`](#contrail-why) | The trail behind whatever you point at: nothing (the last action), a file, `file:line`, a command, a commit, a call id or a value |
| [`contrail blame <file>`](#contrail-blame) | Each line of a file with the recorded agent call that last wrote it, across sessions |
| [`contrail review [<base>]`](#contrail-review) | The recorded agent work behind a branch, for its reviewer, as terminal output or pull request markdown |
| [`contrail why commit <sha>`](#contrail-why-commit) | A commit's files, joined to the agent changes behind them |
| [`contrail risks`](#contrail-risks) | Sensitive actions, with where their values came from |
| [`contrail trace [--tree]`](#contrail-trace) | A session as a timeline, or as a forest of trails |
| [`contrail find "<value>"`](#contrail-find) | Every recorded input that held a value, and every call that used it |
| [`contrail sessions`](#contrail-sessions) | Recent sessions at a glance |
| [`contrail export [<session> \| last] [--otel]`](#export-to-opentelemetry) | A session's recorded (redacted) events as JSON, or as OpenTelemetry traces |
| [`contrail report [<session>] [-o file.html]`](#contrail-report) | A session as one self-contained HTML page |
| [`contrail statusline`](#status-line) | One line for Claude Code's status bar |
| `contrail doctor` | Checks the install, prints the launcher path, and times the capture hook |
| `contrail prune` | Applies retention now and compacts the database |
| `contrail forget <session>` | Deletes one recorded session (or everything, with `--all --yes`), leaving none of its text in the database files |
| `contrail ingest` | Moves spooled events into the database (it also runs automatically) |

Options: `--json` for machine-readable output (why, trace, risks, sessions), `--session <id>` (a prefix is enough), `--data <dir>` to read another data directory, `-h` and `-v`.

Inside Claude Code, the `/contrail:why`, `/contrail:blame`, `/contrail:review`, `/contrail:risks`, `/contrail:trace`, `/contrail:sessions`, `/contrail:find` and `/contrail:report` skills run the same CLI. They are manual only: Claude never runs them on its own, and each prints its report exactly as the CLI wrote it. From a terminal, use the launcher Contrail keeps in its data directory. Its path stays the same across plugin updates, and `contrail doctor` prints it:

```sh
alias contrail='sh "$(echo ~/.claude/plugins/data/contrail-*/bin/contrail)"'
contrail why last
```

The launcher is written when a Claude Code session starts with the plugin enabled. From a clone of this repository, run `sh plugin/bin/contrail` instead.

### Status line

Contrail can show the current session in Claude Code's status bar: how many sensitive actions trace to external content, how many you did not name, and how many calls were recorded.

```text
contrail ▲ 2 from external content · 5 calls
```

Add it to `~/.claude/settings.json`:

```json
{
  "statusLine": {
    "type": "command",
    "command": "sh ~/.claude/plugins/data/contrail-contrail/bin/contrail statusline"
  }
}
```

Use the launcher path `contrail doctor` prints if yours differs. The command reads the session Claude Code passes on stdin, takes 70 to 100 ms in a typical session (more in a very long one), and never fails: if anything goes wrong it prints just `contrail`. To keep an existing status line, call `contrail statusline` from your own script and print both.

### Tripwire

Before a tool call runs, and before Claude Code asks for permission, the tripwire checks it. When the call touches credentials, the network or the shell, installs something, or touches Contrail's own records, and a value in it first appeared in external content (a web page or web search, an MCP result, or a file inside a dependency such as `node_modules/`), it shows you one line:

```text
Contrail ▲ credentials · network · not named in your words: ~/.aws/credentials, collect.telemetry.example/v1
first appeared in WebFetch of docs.quickauth.example/cli/setup:7 (external, LIKELY). Trail: /contrail:why toolu…Ab3xQ
```

- **It goes to you, not to Claude.** The notice is a hook `systemMessage`, which Claude Code shows to the person and does not add to the model's context. A live session confirmed the model does not see it.
- **It never blocks.** It makes no permission decision; whatever you would have been asked, you are still asked.
- **It is quiet.** It stays silent for calls with nothing sensitive and for sensitive calls whose values came from you or your repo. Ordinary calls pay for one `sh` pattern match; only a call that looks sensitive starts the CLI.
- **It can be turned off** with `"tripwire": false` in [`config.json`](#configuration).

### `contrail why`

The trail behind whatever you point at. With no argument, the last thing the agent did. Otherwise a file (its latest agent change), `file:line` or `file:start-end` (the call that last wrote that line; see [`blame`](#contrail-blame)), a shell command's text, a commit sha, a call id as reports print it (`toolu…ALhq1`, or `toolu...ALhq1`), or any value the agent used, such as a package name or a URL (the latest call whose arguments held it).

![contrail why "npm install jwt-decode"](docs/why.svg)

You never named `jwt-decode`. The only place it appeared in the agent's context before the install was line 13 of `auth-service/README.md`. The agent read that file after line 4 of `CLAUDE.md` mentioned `auth-service`, so the report follows the read one step upstream. An install is expected to change `package.json` and the lockfile. Claude Code did not report those changes for this command, so they are POSSIBLE and worded "expected, not observed". The agent's own summary is shown at the bottom for context and is never used as evidence.

<details>
<summary><b>Reading a report</b></summary>

- **Header.** The action, its session, turn and tool call, and whether the main agent or a subagent ran it.
- **In short.** The answer first: whether your words named the action, what is sensitive about it, and for each value the chain of sources it was first observed in, with the grade of each link.
- **Requested?** Whether your own sentences name the target. Text inside fenced code blocks counts as pasted material, not your words. If the sentence that names it also contains a negation such as "don't" or "instead of", the verdict is downgraded and a warning is printed.
- **Turn.** The prompt the action ran under, recorded by Claude Code.
- **Where the values came from.** For each significant string in the arguments (a package name, a path, a URL), the input where it first appeared in the agent's context, with the source line quoted. The trail is followed upstream: to the call that fetched the source, and through anything the agent wrote itself (see [conduits](#origins-and-trust)). After three steps the report stops and names the call whose own trail picks up from there.
- **Searched.** How many inputs were checked. A value with no match is reported as UNKNOWN, never hidden.
- **Effects.** What the action changed, when Claude Code reported it, and what it was expected to change when it did not.
- **Weakest link.** The grade of the whole trail.
- **Footer.** What the grade means and does not mean, the agent's own words, and the blind spots.

Every line names the rule that produced it (`[R3]`), so a grade can always be traced to a stated condition.

</details>

### `contrail blame`

Each line of a file as it is now, next to the recorded agent call that last wrote it: the session, the date, the turn (your words or a background task report), the call id to pass to `contrail why`, and where that call's values came from.

![contrail blame auth-service/src/session.ts](docs/blame.svg)

```text
contrail blame <file> [--session <id>] [--json]
contrail why <file>:<line>          # or <file>:<start>-<end>: the full trail behind the call that last wrote that line
```

Claude Code cannot tell you why a line exists once the session that wrote it is gone, and `git blame` only names the commit. For every line, Contrail finds the latest recorded write whose text holds that line, across all sessions, through the file's recorded Edit, Write, MultiEdit and NotebookEdit calls and literal shell heredocs.

- **Graded honestly.** The file join is recorded (DIRECT). The line join is a text match (R10), so it is LIKELY at best, and POSSIBLE when the file holds the text more often than the call wrote it or when a shell write was expected but not reported.
- **Credit where it is due.** An Edit is credited only with the lines it added, not the context it carried over. A Write is credited with every line it wrote. Blank and bracket-only lines join a block only when the lines on both sides belong to the same call.
- **Never guesses.** A line no recorded write holds is shown as such: it may be yours, pre-existing, or changed since. Lines are compared trimmed, so reindenting keeps attribution, but a formatter run or a hand edit shows UNKNOWN.
- **What carries text.** Only Edit, Write, MultiEdit, NotebookEdit and literal `cat`/`tee` heredocs record the text written. `npm install`, `sed -i`, `echo >` and the like record none; blame lists those writes in its header and points to `contrail why <file>`.

### `contrail review`

The recorded agent work behind the current branch, for whoever reviews it: every commit in `<base>..HEAD` and every uncommitted change, each file joined to the Claude Code calls that wrote it.

![contrail review](docs/review.svg)

```text
contrail review [<base>] [--markdown | --json] [-o review.md]
```

It leads with what a reviewer should read first: values in the agent's changes whose trail reaches a web page, a web search or an MCP server; sensitive actions in the sessions behind the branch; and files your own words never named. Then, for each file: the calls that wrote it, the prompt each ran under (your words, or a background task report), whether your words named it, and where its values came from. Each commit is joined to the call that made it (DIRECT from git's commit line, LIKELY from its commit time). A file with no recorded agent write is listed as such, never guessed.

- **Base.** Without one, it compares with the first of `origin/HEAD`, `origin/main`, `origin/master`, `main`, `master` that exists, and says which.
- **Markdown for the pull request.** `--markdown` writes GitHub markdown for a pull request description or comment ([an example](docs/review-example.md)). Every recorded string stays literal, so text from a fetched page cannot add links, images, HTML or @mentions. `/contrail:review [base]` shows the terminal view in Claude Code and saves the markdown to `review.md` in the plugin's data directory. Contrail never posts it; you paste it.
- **Limits.** Files are joined by path and time, not content, so LIKELY is the strongest grade for a file. Only sessions active in this repository since the branch point are searched. Rebased, amended or squashed commits no longer match their recorded commit lines, and commits made outside Claude Code's shell tool are never joined.

### `contrail risks`

Sensitive actions across recent sessions in this repository, with where their values came from. This is the view at the top of this page.

```text
contrail risks [--session <id> | --all] [--json]
```

| Kind | Examples |
|---|---|
| credentials | a command or file tool touching `~/.aws/credentials`, `~/.ssh/`, `.netrc`, `.npmrc`, `.env`, `.kube/config`, `.git-credentials`, the GitHub CLI's `hosts.yml`, `.pgpass`, gcloud or Azure credentials; or `printenv` / a bare `env`, which print every variable |
| runs remote code | `curl ... \| sh`, `sh <(curl ...)`, `eval "$(curl ...)"` |
| network | `curl`, `wget`, `scp`, `rsync`, `ssh`, `git push`, `gh api` |
| install | `npm install`, `pnpm add`, `pip install`, `cargo add`, `brew install`, `npx` |
| destructive | `rm -rf`, `git reset --hard`, `git push --force`, `DROP TABLE`, `chmod 777` |

Findings are ordered by what their trail shows, newest first within each group:

- `▲` some value traces to external content: the web, an MCP server, a dependency, or network output.
- `△` you did not name it.
- `·` you named it.

Contrail explains; it does not judge or block. A flagged action is not proof of an attack, and an unflagged one is not proof of safety. The kinds describe the command, not its intent.

### `contrail trace`

A session as a timeline, one line per action, with the headline source of each side effect.

![contrail trace --session 4f2a](docs/trace.svg)

```text
contrail trace [--session <id>] [--writes | --shell | --network | --mcp | --subagents | --instructions | --tree] [--json]
```

Without `--session` it shows the latest session in this repository. The filters narrow the timeline to one kind of action.

`--tree` shows the same session as a forest. Each action hangs under the call whose output first held its headline value, so a chain of reads, fetches and commands reads top to bottom. An action whose value came from something no call produced, such as your prompt or an instructions file, starts a tree under that source.

![contrail trace --session 9c1e --tree](docs/trace-tree.svg)

In the injection session, the credential upload and the install script both hang under the fetched page. The page hangs under the web search, and the search came from your prompt. The placement follows data only. It does not say the page made the agent act.

### `contrail find`

Where one value appeared across your recorded sessions: every input that held it, and every call that used it, in order.

![contrail find collect.telemetry.example](docs/find.svg)

```text
contrail find "<value>" [--session <id> | --all] [--json]
```

It searches the recent sessions in this repository, or all of them with `--all`. Matching is whole-token after normalization, the same as grading, so `jwt-decode` does not match inside `jwt-decode-v2`. `find` lists sightings and grades nothing; run `contrail why` on a call for its graded trail. Contrail's own queries are left out, since they hold the value only because someone searched for it.

### `contrail sessions`

Recent sessions at a glance: turns, reads, writes, shell commands, web and MCP calls, subagents, and how many sensitive actions trace to external content.

![contrail sessions](docs/sessions.svg)

```text
contrail sessions [--limit N] [--all] [--json]
```

It lists sessions in this repository when there are any, otherwise all of them. `--all` always lists all of them.

### `contrail why commit`

What a commit contains, joined to the agent changes behind each file.

![contrail why commit](docs/why-commit.svg)

- **The commit itself.** Contrail finds the recorded shell command whose output was git's own `[branch sha] subject` line, which makes the commit DIRECT. Agents often commit with `git commit -q`, which prints no such line. Then Contrail asks git when it dated the commit and looks for the one recorded `git commit` whose hooks bracket that second. That join is LIKELY, and if two commits were running at once it attributes neither.
- **Each file.** Contrail asks git for the commit's file list and joins each file by path to the latest agent change before the commit. A file the agent changed is LIKELY, not DIRECT: whether that exact change is what was committed is not observed. A file changed only by an expected effect is POSSIBLE. A file with no recorded agent change is UNKNOWN: you, another process, or an earlier session. Above, `docs/CHANGELOG.md` is in the commit, but the agent never touched it.

Commits made outside Claude Code's shell tool are not recorded, and `why commit` needs to run inside the repository so git can list the files.

### `contrail report`

One session as a single HTML file you open in any browser, offline. It has summary cards, the sensitive actions, and the whole timeline. Every tool call opens into its full trail, in the same colors as the terminal.

```sh
contrail report <session> -o session.html
```

<p align="center">
  <img src="docs/report.png" alt="contrail report: summary cards, sensitive actions, and a timeline with one call opened to its full trail" width="820">
</p>

The page is self-contained: no scripts, no stylesheets or fonts from elsewhere, and a Content-Security-Policy that forbids loading anything, so it cannot reach the network. All recorded text is escaped. It follows your system's light or dark theme. The file holds what the agent read (redacted), so it is written with mode 0600, like the database. Inside Claude Code, `/contrail:report` writes it to the plugin's data directory and prints the path.

### Export to OpenTelemetry

```sh
contrail export <session> --otel > session.otlp.json
```

`--otel` writes the session as one OTLP/JSON trace request on one line, the format collectors' file receivers read. From there it can go into Jaeger, Grafana Tempo, Honeycomb or any OpenTelemetry backend. Contrail itself never sends it anywhere.

- **Spans.** The session is the root span, each turn a child, and each tool call a child of its turn, with its real start and end times. A failed call carries an error status.
- **Attributes.** Contrail's findings go on each call: `contrail.grade`, `contrail.requested`, `contrail.value`, `contrail.source`, `contrail.origin`, `contrail.trust`, and for sensitive actions `contrail.sensitive` and `contrail.external_upstream`.
- **Links.** Each provenance edge becomes a span link from an action to the call (or turn) whose output held its value, with the grade, rule and value on the link.
- **Events.** Each effect (a file written, a commit, a host reached) is a span event.

Span and trace ids are derived from the session, so exporting a session twice gives the same trace. The output is checked against the official OTLP protobuf schema.

## How it works

1. **Capture.** A POSIX `sh` hook receives every Claude Code hook event and writes it to its own spool file (0600). It prints nothing, always exits 0, and never blocks a tool call.
2. **Ingest.** After each turn, at session end and before every query, spooled events are redacted, size-capped and stored in a local SQLite database. The spool file is then deleted.
3. **Graph.** When you ask, one session's events become a provenance graph: every input the agent could see (prompts, files, command output, web pages, subagent reports) and every action it took.
4. **Engine.** Pure, deterministic rules extract the values in an action's arguments, find the inputs that held them before the agent first used them, and grade each link.
5. **Render.** One module holds all report wording, with tests that keep it free of causal claims.

```mermaid
flowchart LR
  CC[Claude Code] -- hook JSON on stdin --> CAP[hooks/capture.sh]
  CAP -- one file per event, 0600 --> SPOOL[(spool/)]
  SPOOL --> ING[ingest: redact, cap, index]
  ING --> DB[(contrail.db)]
  DB --> G[graph: events to inputs, actions, effects]
  G --> E[engine: pure rules R1 to R9]
  E --> R[render: all report wording]
  R --> CLI[contrail CLI]
  CLI --> SK["/contrail:why, :blame, :review, :risks, :trace, :find, :report"]
  CLI --> OUT["HTML report, OTLP traces"]
```

<details>
<summary><b>Architecture details</b></summary>

- **Capture** (`plugin/hooks/capture.sh`): POSIX `sh`. Sets `umask 077`, copies stdin to a temp file in `spool/`, renames it into place, prints nothing, exits 0. It writes one file per event, because concurrent appends to one shared log can interleave. It uses shell rather than Node, because Node is not guaranteed to be present and starts far slower. The design target is 20 ms or less per event; `contrail doctor` times it on your machine. Capture is synchronous so file order is event order.
- **Ingest:** for each spool file in name order, parses the JSON (keeping the raw file as a failure if it is invalid), redacts string values, caps sizes, inserts by spool name so a repeat is a no-op, fills the file-touch index, applies retention, and deletes the spool file. Two concurrent ingests are safe.
- **Store:** SQLite in WAL mode through `node:sqlite` or `bun:sqlite`, so nothing native to install. The database is a plain file you can inspect with `sqlite3`.
- **Graph and engine** (`src/graph/`, `src/engine/`): the provenance graph is derived at query time and never stored. Sessions are small, so this is cheap, and improving a rule re-grades every old session with no migration. The engine is pure functions over normalized events, and no function that grades takes agent text as input.
- **Render** (`src/render/`): the only place report wording lives.
- **Launcher** (`plugin/bin/contrail`): an `sh` script that runs the committed bundle `plugin/dist/contrail.mjs` with `bun` if present, otherwise `node` 22.13+.

The only runtime dependency, `shell-quote`, is bundled, so installing the plugin needs no build step and no `npm install`. CI fails if the bundle differs from a fresh build of `src/`.

```
contrail/
├── .claude-plugin/marketplace.json   marketplace entry, points at plugin/
├── plugin/                           the installable plugin
│   ├── .claude-plugin/plugin.json
│   ├── hooks/                        hook registrations, capture.sh, health.sh
│   ├── bin/contrail                  sh launcher
│   ├── skills/                       /contrail:why, :risks, :trace, :find, :report
│   └── dist/contrail.mjs             committed bundle built from src/
├── src/
│   ├── cli.ts, main.ts               command-line entry
│   ├── store/                        SQLite adapter, schema, migrations, retention
│   ├── ingest/                       spool to events: redaction, size caps, hashing, repository key
│   ├── graph/                        events to provenance graph for one session
│   ├── engine/                       pure rules: tokens, context window, grading, trace, risks
│   ├── query/                        targets, sessions, commits
│   └── render/                       report wording and terminal style
├── scripts/                          npm run demo, npm run svg
├── docs/                             logo and rendered demo output for this README
└── test/                             fixtures, end-to-end and adversarial tests
```

</details>

## How grading works

| Grade | Meaning |
|---|---|
| **DIRECT** | Claude Code recorded the join itself: an equality on hook fields such as `prompt_id`, `tool_use_id`, `tool_response.filePath`, `bashEditDiff`, or git's commit line in a command's output. No text matching or timing is involved. |
| **LIKELY** | Exactly one observed input held this name-like token before the agent first used it. |
| **POSSIBLE** | Two or three inputs held it, or it is a plain word, or an effect is only expected. |
| **UNKNOWN** | No observed input holds it, or four or more do (too common to attribute). Always printed with the number of inputs searched and the blind spots. |

A trail is only as strong as its weakest inferred link, and text matching never reaches DIRECT.

### Data provenance, not the agent's reasons

Contrail answers two questions about an action: did your own words name it, and where did the strings in its arguments first enter the agent's observable context? It never answers why the agent acted. Every report says so in its heading and its footer.

That is enforced in code, not left to tone:

- **Deterministic rules, no LLM.** A generated summary would invent causality. Every grade comes from a named rule.
- **The agent's own words cannot affect a grade.** Its visible text goes to the renderer for display and nowhere else. Thinking blocks are ignored. A test asserts that replacing the agent's narration leaves the explanation unchanged.
- **Trust labels never change a grade.** They say who wrote a source, not how strong the link is.
- **The wording is tested.** A test fails if any report's own wording uses "because", "caused", "led to", "decided", "tainted" or "malicious". Quoted text from you, your files or the agent is shown as is.

<details>
<summary><b>The rules, R1 to R9</b></summary>

| Rule | What it grades |
|---|---|
| R1 | Joins Claude Code recorded: the turn an action ran in, the files it reported changing, the commit it made. DIRECT. |
| R2 | Which inputs count as available to the agent at an action (below). |
| R3 | Where a token's value came from: one source LIKELY, two or three POSSIBLE, four or more UNKNOWN. |
| R4 | No observed source: UNKNOWN, which is not evidence of no influence. |
| R5 | One step further upstream from a credited source, up to three hops. A trail that goes further says so and names the call to run `why` on next. |
| R6 | Effects a command is expected to have (an installer and its lockfile, a redirect target, the host a `curl` names). POSSIBLE, worded "expected, not observed". |
| R7 | A commit's files joined to earlier agent changes. LIKELY at best. |
| R8 | Whether your own sentences name the action's target. |
| R9 | A commit joined to the one recorded `git commit` running in the second git dated it, when git printed no commit line (`git commit -q`). LIKELY at best; two or more candidates attribute nothing. |
| R10 | A line of a file as it is now, joined to the latest recorded write whose text contains it. A text match: LIKELY at best, POSSIBLE when the file holds the text more often than the call wrote it or the write was only expected. |

</details>

<details>
<summary><b>What counts as evidence</b></summary>

An input counts as available to the agent at an action only if all of these hold:

- It reached the same context. The main agent and each subagent are separate contexts, and a subagent does not inherit its parent's inputs.
- It arrived before the action. Tool calls in one parallel batch never see each other's output.
- It arrived after the latest compaction in that context. Earlier inputs survive only through the summary.

A token is a string from the action's arguments: a package name, a path, a URL, an argument value. Flags, short tokens, common words, and the directory names in your working directory, home directory and username are dropped. Matching is exact after normalization (Unicode NFKC, invisible characters stripped, lowercase) and respects word boundaries, so `foo-auth-helper` does not match inside `foo-auth-helper-v2`.

Name-like tokens (`foo-auth-helper`, `retryWithJitter`) can reach LIKELY. Plain words such as `express` stop at POSSIBLE. When several inputs hold the same token, your own words are credited first and the others are listed as "also in".

The agent may repeat a name before the action that matters, for example `npm search foo` before `npm install foo`. Contrail uses the agent's first use as the cut-off, so an echo such as a search result is never counted as the source of the name it was searching for.

</details>

## Origins and trust

Every input is labeled with the trust level of whoever wrote it:

| Trust | Who wrote it |
|---|---|
| `principal` | You. |
| `config` | Your own configuration. |
| `local` | Content on your machine or in your repo that you did not write. |
| `external` | The network, a dependency, or a plugin. |
| `agent` | The agent itself. |

A **conduit** is text the agent wrote. It is never an origin: Contrail follows the same value past it to whoever supplied it first.

- A compaction summary is followed to the inputs from before the compaction.
- A file the agent wrote and later read back is followed into the write, even when a subagent did the writing.
- A subagent's instructions are followed into the parent's context that wrote them.
- A subagent's report, including one delivered later from the background, is followed into the subagent's own context.

<details>
<summary><b>Every origin, its trust, and the hook that observes it</b></summary>

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

</details>

## What Contrail can and cannot see

**It records** your prompts and slash commands, CLAUDE.md and rules loads, every tool call before it runs (including ones later denied), tool results and file effects, the exact text the model received from each batch of tool calls, failures, compactions, subagent scope, and the end of every turn and session.

**It cannot see:**

- **Reasoning.** Contrail reports where an argument's value came from, never why the agent chose it. Thinking blocks are ignored on purpose.
- **Which part of the context actually moved the model.** There are only proxies: literal data flow, order and scope. With no evidence the result is UNKNOWN, and UNKNOWN does not mean "no influence".
- **Raw web pages.** WebFetch hands the model a smaller model's extraction of the page. Contrail records that text and the URL, and labels it as such.
- **`@`-mentioned files, AGENTS.md, and the text a slash command or skill expands to**, including a skill's `!` shell output. No hook carries these. Contrail lists `@`-mentions and slash commands in your prompts as blind spots.
- **The system prompt**, and content other hooks rewrote.
- **Anything before Contrail was installed.**

Reports say so themselves: every one ends with its blind spots, and UNKNOWN results print how many inputs were searched.

<details>
<summary><b>Hooks recorded, and what has been verified live</b></summary>

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

Hook fields were checked against the Claude Code documentation for 2.1.283 to 2.1.284. Unknown or missing fields produce fewer links and an explicit "not observed" note, never a crash.

Live sessions on Claude Code 2.1.284 and 2.1.285 (Linux, default permission mode) have exercised prompts, instruction loads, Read, Grep, Glob, Bash (including heredoc writes and `git commit -q`), Write, Edit, WebFetch, failed and denied tool calls, background subagents and their `<task-notification>` reports, `PostCompact`, `SessionEnd`, a model-invoked skill, `store_content: false`, the tripwire (a notice shown before the permission prompt, which the model did not see), installing from the marketplace in an interactive session, plugin paths with spaces and quotes, and the why (including `file:line`), blame, review, risks, trace, sessions, find and report skills. WebSearch, MCP results, auto-mode denials (`PermissionDenied`) and `bashEditDiff` are so far covered only by scripted sessions built from the documented payload shapes.

</details>

## Privacy and security

Contrail stores what your agent read. It is built so that it does not become the leak.

- **Local only.** No network calls and no telemetry.
- **Observe only.** It never blocks a tool call and never prints into the agent's context; the tripwire's notice goes to you, not the model. A recorder that changes the agent corrupts its own evidence.
- **Outside your repo.** Data lives in the plugin's data directory, so it is never part of your repository and it survives deleting a worktree.
- **Redaction before storage.** Secrets are replaced with `[REDACTED:<rule>]` before anything is written to the database, for example `OPENAI_API_KEY=[REDACTED:env-secret]`.
- **Optional hash-only storage.** With [`store_content: false`](#storing-no-text-the-agent-read), no text the agent read is stored, and grading still works.
- **Safe to print.** Reports strip control characters and backticks from recorded text, so a recorded string cannot restyle your terminal or turn into a command when a report is shown inside Claude Code.
- **Permissions.** The data directory is 0700 and its files are 0600.
- **Retention.** Sessions older than 90 days are removed, and the oldest go first when the database passes 1024 MB. Both are configurable.
- **Forget on demand.** `contrail forget <session>` deletes one session, and `contrail forget --all --yes` deletes everything, spool included. Freed pages are zeroed, the database is rewritten and its write-ahead log truncated, so the deleted text does not linger in either file.
- **Uninstall deletes the data**, unless you pass `--keep-data`.

Redaction is pattern-based, so it misses secrets it has no rule for. Treat `contrail.db` as sensitive, or turn on hash-only storage. To report a security problem, see [SECURITY.md](SECURITY.md).

<details>
<summary><b>Redaction rules and other safeguards</b></summary>

Redaction walks the decoded string values of each payload rather than the serialized JSON, because escape sequences would otherwise defeat pattern boundaries. The rules cover:

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
- **A short unredacted window.** Each hook event is first written to a spool file, unredacted, with mode 0600. Ingest redacts it into the database and deletes the file. Ingest runs after each turn (an async `Stop` hook), when the session ends (a synchronous `SessionEnd` hook that records the event and then ingests, since Claude Code may not finish an async hook on exit), and before every `contrail` command. So unredacted text exists for about one turn, and never outlasts the session unless ingest cannot run. That is the same trust boundary as Claude Code's own plaintext session transcripts.

</details>

## Configuration

| Variable | Effect |
|---|---|
| `CONTRAIL_HOME` | Directory to use as the Contrail data directory, for recording and queries alike. |
| `NO_COLOR` | Turn color off. |
| `FORCE_COLOR` | Turn color on when stdout is not a terminal. |

The data directory holds `contrail.db`, the `spool/` directory and an optional `config.json`:

```json
{ "retention_days": 90, "max_db_mb": 1024, "store_content": true, "tripwire": true }
```

Missing or invalid values fall back to these defaults, and `contrail doctor` reports a `config.json` it cannot parse. `"tripwire": false` turns off the notice before sensitive calls; recording and every command work the same.

<details>
<summary><b>How the data directory is chosen</b></summary>

The CLI resolves it in this order: `--data`, `CONTRAIL_HOME`, `--plugin-data` (which the skills pass), `CLAUDE_PLUGIN_DATA` (which Claude Code sets for plugin processes), then the single directory matching `~/.claude/plugins/data/contrail-*`. The capture hook also puts `CONTRAIL_HOME` first, so if you set it, recording, the skills and the CLI all use it.

</details>

### Storing no text the agent read

Set `"store_content": false` and Contrail stores no text the agent read. That covers tool results, file and page contents, instruction and skill files, compaction summaries and background task reports. The agent's own messages and edit patches are dropped.

Grading still works:

- At ingest, every span of that text that a traced value could match (a path, URL, package or name) is replaced with a keyed hash (HMAC-SHA256, 48 bits, with a random key in `content.key`, mode 0600, in the data directory). The hashes stay on their original lines.
- A value is found by hashing it with the same key, so grades and line numbers come out the same as with text stored. Quotes read `(text not stored)`.

The trade-offs:

- A value containing a space cannot be matched.
- Anyone who has both `contrail.db` and `content.key` can confirm a guessed value. They cannot recover the text.
- Your prompts and each action's arguments (commands, paths, URLs) are still stored as redacted text, because they are what a report explains.
- The setting applies to events ingested after it is set. Earlier rows keep their text until retention removes them.

## Requirements

- Claude Code on macOS or Linux. Windows is not supported.
- Recording needs only `sh`.
- Queries need Node 22.13+ or Bun. With an older Node, or neither, Contrail keeps recording and each query says which runtime it found and what to install.
- If you set `CLAUDE_CONFIG_DIR`, Contrail looks for its data there.

Contrail has no history before it is installed. To uninstall, run `/plugin uninstall contrail@contrail` in Claude Code; it asks whether to delete the recorded data. From a terminal, `claude plugin uninstall contrail@contrail` deletes it unless you add `--keep-data`.

## FAQ

**Does it slow Claude Code down?**
Barely. Each hook event runs a small shell script that writes one file: about 7 ms per event (p95 under 9 ms), and about 8 ms for an event carrying a 1 MB tool response, measured on a 4-vCPU Linux VM. A tool call fires about three events, so roughly 20 to 25 ms on a call that usually takes seconds. The tripwire adds about 3 ms to a call that looks ordinary and runs the CLI only for one that looks sensitive (about 60 ms in a short session). When a session ends, the few hundred events left are redacted and stored in under 0.2 s. The status line command takes 70 to 100 ms and runs outside the agent's loop. To measure your own machine, run `sh scripts/bench-hooks.sh` from a clone, or `contrail doctor` for the capture hook alone.

**Does it send my data anywhere?**
No. There are no network calls and no telemetry. Everything stays in the plugin's data directory on your machine.

**Does it use an LLM to explain things?**
No. Every grade comes from a deterministic, named rule. A model summary could invent causality; Contrail's job is to show only what the evidence supports.

**Can it block a dangerous command?**
No, by design. The tripwire tells you before a sensitive call whose values came from outside, and you still decide in Claude Code's own permission prompt. A recorder that changes what the agent does corrupts its own evidence. Contrail pairs well with a guardrail that does block.

**Does the tripwire tell Claude anything?**
No. Its notice is a `systemMessage`, which Claude Code shows to you and does not give to the model. A live session confirmed the model does not see it. The `/contrail:*` skills are different: running one puts its report into the conversation, because you asked for it there.

**Can the agent tamper with Contrail's records?**
It runs as you, so an agent with shell access could edit or delete them, like any file you own. Contrail flags every call that names its data directory or database (`touches Contrail's records`), and the tripwire watches for it. For a record the agent cannot touch, ship the [OpenTelemetry export](#export-to-opentelemetry) to a collector elsewhere. See [SECURITY.md](SECURITY.md).

**What does LIKELY actually mean?**
That exactly one observed input held that value before the agent first used it. It does not mean that input made the agent act. Contrail never claims to know the agent's reasons.

**Why is something UNKNOWN when I can see where it came from?**
Matching is literal. If the agent paraphrased a source, knew a name from training, or read it through something no hook records (an `@`-mention, AGENTS.md, a slash command's body), there is no observed source. The report lists those blind spots.

**Does it work with subagents?**
Yes. Each subagent is its own context. Values in a subagent's report, including one delivered later from the background, are followed into the subagent's own work.

## How it compares

| Approach | What it tells you | How Contrail differs |
|---|---|---|
| `git blame` | Which commit last changed a line, and who committed it. | Works on shell commands and uncommitted changes, and reports the inputs before the action, not the history after it. `why commit` goes the other way: from a commit to the agent changes and sources behind it. |
| Session transcript viewers | Everything that happened, in order. | Filters to the inputs whose text appears in the action's arguments, labels who wrote each one, and grades the link. In a transcript, your prompt and a README line look alike. |
| Agent observability platforms (span trees) | Which call ran inside which, with timing and cost. | A span tree shows what was running, not where a value in a command came from. Contrail traces argument values to the input that first held them, locally, from Claude Code hooks. |
| Prompt-injection scanners and guardrails | Whether content looks like an attack, often blocking it. | Contrail makes no judgment about content and never blocks. `risks` reports which sensitive actions trace to external content, after the fact. The two fit together. |

## Limitations

- **It explains data flow, not decisions.** A LIKELY grade means a name first appeared in the agent's context from that source. It does not mean the source made the agent act.
- **Matching is literal.** If the agent paraphrased a source, or knew a name from training, Contrail finds no source and reports UNKNOWN. There is no paraphrase or embedding matching, by design.
- **Shell file effects depend on a beta field.** Claude Code reports which files a shell command changed in `bashEditDiff`, which is beta. Without it, those changes are only "expected, not observed".
- **Web content is an extraction.** For WebFetch, Contrail sees what the model was given, not the page.
- **Trails stay within a session.** A value is traced through the session it was used in; `why commit` only sees agent changes in the session that made the commit. `blame` and `find` do look across sessions.
- **Blame is a text match.** It credits the latest recorded write holding a line's text. It cannot tell identical text written earlier, or already there, from the latest writer's, and it needs the written text to have been recorded.
- **The tripwire runs before the call.** It reads the session so far, so in a very long session with many large reads its notice can take a second or two before a sensitive-looking call. Ordinary calls do not start it.
- **Sensitive-action patterns are a fixed list.** An unusual command can go unflagged.
- **Redaction is best effort.** Secrets without a matching rule can be stored.
- **Hook fields change between Claude Code releases.** Contrail tolerates unknown and missing fields and degrades to fewer links, but a renamed field can quietly reduce what it can explain. `contrail doctor` counts unparseable events.

## Roadmap

**Shipped in 0.1**

- [x] Capture for every hook event, with redaction before storage
- [x] `contrail why <path | "command" | last>` and the `/contrail:why` skill
- [x] `contrail ingest` and `contrail doctor`

**Shipped in 0.2**

- [x] `contrail why commit <sha>`, including quiet commits joined on git's commit time (R9)
- [x] `contrail risks`: sensitive actions, those tracing to external content first
- [x] `contrail trace` with filters, and `--tree` for the session as a forest of trails
- [x] `contrail sessions`, `contrail export`, `contrail prune`
- [x] `/contrail:risks` and `/contrail:trace` skills
- [x] Following conduits: compaction summaries, subagent prompts and reports, files the agent wrote and read back
- [x] Background task reports labeled by the task that produced them, never as your words
- [x] Expected shell effects (R6), always worded "expected, not observed"
- [x] Retention and `config.json`, and `store_content: false` for hash-only storage
- [x] A synchronous `SessionEnd` ingest, so the unredacted spool never outlives a session
- [x] Color output, honoring `NO_COLOR` and `FORCE_COLOR`

**Shipped in 0.3**

- [x] OpenTelemetry export: sessions as OTLP traces, with grades as attributes and provenance as span links
- [x] `contrail report` and `/contrail:report`: a session as one self-contained HTML page
- [x] `contrail statusline`, and a launcher at a stable path for aliases and the status bar
- [x] `contrail find` and `/contrail:find`: every recorded input that held a value, and every call that used it
- [x] `contrail why <call id>`, for any call a report shows, and `/contrail:sessions`
- [x] Trails longer than one report's three steps are marked, with the call to continue from

**Shipped in 0.4**

- [x] The tripwire: a notice for you, before the permission prompt, when a sensitive call's values came from external content
- [x] `contrail why` on anything: nothing, a file, `file:line`, a command, a commit, a call id or a value; every report leads with an In short answer
- [x] `contrail blame` and `/contrail:blame`: each line of a file with the recorded agent call that last wrote it
- [x] `contrail review` and `/contrail:review`: the recorded agent work behind a branch, as terminal output or pull request markdown
- [x] Hardening from a pre-launch audit: much broader secret redaction, linear name matching, unread spool FIFOs and symlinks, sanitized control and bidi characters, commit joins that an echo cannot spoof, safe report writes

**Planned**

- [ ] Optional transcript enrichment, to show what the agent said right before each action

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

Grading rules are specified with adversarial cases that double as the regression suite. They include the agent's own narration claiming you asked for something, a change of mind ("actually don't"), echo searches, parallel batches, compaction, text relayed through a subagent's instructions or through a file a subagent wrote, and hostile or pathological input to redaction and ingest. A rule change is not done until those still pass.

## Contributing

Issues and pull requests are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for setup, the invariants every change keeps, and how tests are written. Open an issue first for anything that changes grading rules or report wording. Report security problems privately, as described in [SECURITY.md](SECURITY.md). Release notes are in [CHANGELOG.md](CHANGELOG.md).

## License

MIT. See [LICENSE](LICENSE). The vendored secret-redaction rules are also MIT and are credited in [THIRD_PARTY_NOTICES](THIRD_PARTY_NOTICES).
