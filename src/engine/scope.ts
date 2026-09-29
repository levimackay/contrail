import type { Scope } from './types.ts';

export const scopeKey = (s: Scope): string => `${s.sessionId}/${s.agentId ?? 'main'}`;

export const sameScope = (a: Scope, b: Scope): boolean => a.sessionId === b.sessionId && a.agentId === b.agentId;
