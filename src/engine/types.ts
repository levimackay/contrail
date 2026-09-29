/**
 * The provenance model. Plain data only: every value can be written as a literal
 * in a test, and nothing here holds the agent's own narration.
 */

/** How strong the evidence for a link is. DIRECT only ever comes from a join Claude Code recorded. */
export type Grade = 'DIRECT' | 'LIKELY' | 'POSSIBLE' | 'UNKNOWN';

/** Who wrote a source. A label, never a grade modifier. */
export type Trust = 'principal' | 'config' | 'local' | 'external' | 'agent';

export type RuleId = 'R1' | 'R2' | 'R3' | 'R4' | 'R5' | 'R6' | 'R7' | 'R8' | 'R9';

export type Origin =
  | 'prompt'
  | 'template'
  | 'instructions'
  | 'file'
  | 'dependency_file'
  | 'search'
  | 'shell'
  | 'web'
  | 'web_search'
  | 'mcp'
  | 'skill'
  | 'subagent_prompt'
  | 'subagent_result'
  | 'compaction'
  | 'tool_output';

/** One context window: the main thread of a session, or one subagent. */
export interface Scope {
  sessionId: string;
  agentId: string | null;
}

/** One tool call. */
export interface Action {
  id: string;
  scope: Scope;
  promptId: string | null;
  tool: string;
  input: Record<string, unknown>;
  response: unknown;
  preSeq: number;
  postSeq: number | null;
  status: 'ok' | 'failed' | 'interrupted' | 'pending';
  mcpServer: { name: string; source: string } | null;
}

/** Text that entered an agent's context, and where it came from. */
export interface Input {
  id: string;
  scope: Scope;
  origin: Origin;
  trust: Trust;
  /** Identity for counting distinct sources: the same file read twice is one source. */
  ref: string;
  label: string;
  text: string;
  truncated: boolean;
  fidelity: 'as-seen' | 'reported' | 'read-at-ingest';
  /** The seq from which the agent could see this text. */
  availableAt: number;
  /** The tool call that returned this text, if any. */
  producedBy: string | null;
  promptId: string | null;
  /** For a subagent's report: the subagent's own context, where the values in it came from. */
  relays?: Scope | null;
}

/** Something an action changed. */
/** Something an action changed. `expected` effects were inferred from the command, not reported (R6). */
export interface Effect {
  id: string;
  actionId: string;
  kind: 'file' | 'network' | 'commit';
  target: string;
  path: string | null;
  evidence: 'filePath' | 'bashEditDiff' | 'response' | 'commit_stdout' | 'expected';
  patch: string[];
  commit?: Commit;
}

export interface Commit {
  branch: string;
  sha: string;
  subject: string;
}

/** A string from an action's arguments that we try to trace. */
export interface Token {
  text: string;
  /** targets say what the action acts on; hints are other names worth tracing */
  role: 'target' | 'hint';
  /** targets in the same group are alternatives for one thing (a path, its basename, its stem) */
  group: number | null;
  /** name-like (has - _ . / @ : a digit, or a camelCase hump), so one source is meaningful */
  shaped: boolean;
  /** derived forms (a file stem) only count toward "you named it", weakly */
  derived: boolean;
  argPath: string;
}

export interface Link {
  type: 'in_turn' | 'value_from' | 'changed';
  from: string;
  to: string | null;
  grade: Grade;
  rule: RuleId;
  /** true when Claude Code recorded the join; false when inferred from text */
  recorded: boolean;
  token?: string;
  quote?: { ref: string; line: number | null; text: string };
  firstSeen?: boolean;
  note?: string;
}

export interface Sentence {
  promptId: string;
  seq: number;
  text: string;
}

export type Verdict = 'NAMED' | 'NAMED_NEGATED' | 'PARTLY_NAMED' | 'NOT_NAMED' | 'NOTHING_TO_MATCH';

export interface RequestVerdict {
  verdict: Verdict;
  grade: Grade;
  /** how many of your sentences were checked */
  searched: number;
  sentence?: Sentence;
  matched?: string;
}

export interface Env {
  cwd: string;
  home: string;
  user: string;
}

export interface Prompt {
  promptId: string;
  seq: number;
  /** p1, p2, … in session order */
  label: string;
  /** your words; for a slash command, the command you typed; for a task report, its summary */
  text: string;
  /**
   * you: you typed it. task: Claude Code started the turn itself to deliver a background task's
   * report (a <task-notification>). A task turn is never your words.
   */
  from: 'you' | 'task';
}

export interface Graph {
  actions: Action[];
  inputs: Input[];
  effects: Effect[];
  prompts: Prompt[];
  /** PostCompact seqs, by scope key */
  compactSeqs: Record<string, number[]>;
  /** Display only. No engine function reads this. */
  agentSaid: { byPrompt: Record<string, string>; byAgent: Record<string, string> };
  env: Env;
  firstEvent: string | null;
}

export interface TokenTrace {
  token: Token;
  /** an earlier call that used the token first, or null when this action is the first use */
  firstUse: { actionId: string; preSeq: number } | null;
  searched: { count: number; beforeSeq: number };
  links: Link[];
  /**
   * One step further back (R5):
   *   call        how the agent came to call the tool that returned the credited input
   *   conduit     the credited text was agent-written, so the same name is followed further back
   *   compaction  the credited text is a compaction summary, so the same name is looked for before it
   */
  upstream: { kind: 'call' | 'conduit' | 'compaction'; via: Action | null; trace: TokenTrace } | null;
}

export interface Explanation {
  action: Action;
  turn: Link | null;
  requested: RequestVerdict;
  traces: TokenTrace[];
  effects: Link[];
  chainGrade: Grade;
  blindSpots: string[];
}
