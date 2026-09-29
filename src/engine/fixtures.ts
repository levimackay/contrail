import type { Action, Input, Scope, Token } from './types.ts';

/** Builders for engine tests: sensible defaults, override what the test is about. */

export const MAIN: Scope = { sessionId: 's1', agentId: null };
export const SUB: Scope = { sessionId: 's1', agentId: 'a7' };

export function mkInput(o: Partial<Input> & { id: string }): Input {
  return {
    scope: MAIN,
    origin: 'file',
    trust: 'local',
    ref: o.id,
    label: o.id,
    text: '',
    truncated: false,
    fidelity: 'as-seen',
    availableAt: 1,
    producedBy: null,
    promptId: 'p1',
    ...o,
  };
}

export function mkAction(o: Partial<Action> & { id: string }): Action {
  return {
    scope: MAIN,
    promptId: 'p1',
    tool: 'Bash',
    input: {},
    response: null,
    preSeq: 1,
    postSeq: null,
    status: 'ok',
    mcpServer: null,
    ...o,
  };
}

export function mkToken(text: string, o: Partial<Token> = {}): Token {
  return { text, role: 'target', group: 0, shaped: true, derived: false, argPath: '$.command', ...o };
}
