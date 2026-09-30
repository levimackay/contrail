import { createHash } from 'node:crypto';
import type { Finding } from '../engine/risks.ts';
import { headlineTrace } from '../engine/tree.ts';
import type { Action, Explanation, Graph, Input } from '../engine/types.ts';
import { clip } from '../util.ts';
import { describe } from './why.ts';

/**
 * A session as OpenTelemetry traces (OTLP/JSON, one ExportTraceServiceRequest). The session is
 * the root span, each turn a child, each tool call a child of its turn with real start and end
 * times. Contrail's findings ride along as contrail.* attributes, and each provenance edge
 * becomes a span link from an action to the call whose output held its value. Written to a
 * file or stdout for a collector to pick up; Contrail itself never sends it anywhere.
 */

type Value = { stringValue: string } | { intValue: string } | { boolValue: boolean };
interface Attribute {
  key: string;
  value: Value;
}

const SPAN_KIND_INTERNAL = 1;
const STATUS_ERROR = 2;

function attrs(o: Record<string, string | number | boolean | null | undefined>): Attribute[] {
  const out: Attribute[] = [];
  for (const [key, v] of Object.entries(o)) {
    if (v === null || v === undefined || v === '') continue;
    if (typeof v === 'boolean') out.push({ key, value: { boolValue: v } });
    else if (typeof v === 'number') out.push({ key, value: { intValue: String(Math.trunc(v)) } });
    else out.push({ key, value: { stringValue: v } });
  }
  return out;
}

/** Deterministic ids, so exporting a session twice yields the same trace. */
const hexId = (kind: string, value: string, length: 16 | 32) => {
  const hex = createHash('sha256').update(`${kind}:${value}`).digest('hex').slice(0, length);
  return /^0+$/.test(hex) ? `1${hex.slice(1)}` : hex;
};
const nanos = (us: number) => (BigInt(Math.round(us)) * 1000n).toString();

export function toOtlp(g: Graph, explanations: Map<string, Explanation>, findings: Finding[], version: string): unknown {
  const sessionId = g.sessionId || 'unknown';
  const traceId = hexId('trace', sessionId, 32);
  const rootId = hexId('session', sessionId, 16);
  const actionSpan = (id: string) => hexId('action', `${sessionId}:${id}`, 16);
  const turnSpan = (promptId: string) => hexId('turn', `${sessionId}:${promptId}`, 16);
  const at = (seq: number) => g.timeUs[Math.max(0, Math.min(g.timeUs.length - 1, seq - 1))] ?? 0;
  const first = g.timeUs.length ? Math.min(...g.timeUs) : 0;
  const last = g.timeUs.length ? Math.max(...g.timeUs) : 0;
  const inputs = new Map(g.inputs.map(i => [i.id, i]));
  const actionIds = new Set(g.actions.map(a => a.id));
  const byAction = new Map(findings.map(f => [f.action.id, f]));

  const spans: unknown[] = [
    {
      traceId,
      spanId: rootId,
      name: `claude-code session ${sessionId.slice(0, 8)}`,
      kind: SPAN_KIND_INTERNAL,
      startTimeUnixNano: nanos(first),
      endTimeUnixNano: nanos(last),
      attributes: attrs({ 'session.id': sessionId, 'contrail.cwd': g.env.cwd, 'contrail.source': g.source, 'contrail.turns': g.prompts.length, 'contrail.tool_calls': g.actions.length }),
    },
  ];

  g.prompts.forEach((p, i) => {
    const next = g.prompts[i + 1];
    spans.push({
      traceId,
      spanId: turnSpan(p.promptId),
      parentSpanId: rootId,
      name: `turn ${p.label}`,
      kind: SPAN_KIND_INTERNAL,
      startTimeUnixNano: nanos(at(p.seq)),
      endTimeUnixNano: nanos(next ? at(next.seq - 1) : last),
      attributes: attrs({
        'contrail.prompt.label': p.label,
        'contrail.prompt.from': p.from === 'task' ? 'background task report' : 'you',
        'contrail.prompt.text': clip(p.text, 500),
      }),
    });
  });

  for (const a of g.actions) {
    const e = explanations.get(a.id);
    const head = e ? headlineTrace(e) : undefined;
    const link = head?.links.find(l => l.grade !== 'UNKNOWN');
    const source = link?.to ? inputs.get(link.to) : undefined;
    const finding = byAction.get(a.id);
    const start = at(a.preSeq);
    const end = Math.max(start, at(a.postSeq ?? a.preSeq));
    const parent = a.promptId && g.prompts.some(p => p.promptId === a.promptId) ? turnSpan(a.promptId) : rootId;
    spans.push({
      traceId,
      spanId: actionSpan(a.id),
      parentSpanId: parent,
      name: clip(`${a.tool} ${describe(a, g)}`, 120),
      kind: SPAN_KIND_INTERNAL,
      startTimeUnixNano: nanos(start),
      endTimeUnixNano: nanos(end),
      attributes: attrs({
        'contrail.tool': a.tool,
        'contrail.tool_use_id': a.id,
        'contrail.agent_id': a.scope.agentId,
        'contrail.seq': a.preSeq,
        'contrail.requested': e?.requested.verdict,
        'contrail.grade': e?.chainGrade,
        'contrail.value': head ? clip(head.token.text, 200) : null,
        'contrail.source': source ? clip(source.label, 200) : null,
        'contrail.origin': source?.origin,
        'contrail.trust': source?.trust,
        'contrail.sensitive': finding?.kinds.join(','),
        'contrail.external_upstream': finding ? finding.externalUpstream : null,
      }),
      events: g.effects
        .filter(fx => fx.actionId === a.id)
        .map(fx => ({
          timeUnixNano: nanos(end),
          name: 'contrail.effect',
          attributes: attrs({ 'contrail.effect.kind': fx.kind, 'contrail.effect.target': clip(fx.target, 200), 'contrail.effect.evidence': fx.evidence }),
        })),
      links: provenanceLinks(a, e, inputs, actionIds, traceId, actionSpan, turnSpan),
      ...(a.status === 'failed' || a.status === 'interrupted' ? { status: { code: STATUS_ERROR, message: a.status } } : {}),
    });
  }

  return {
    resourceSpans: [
      {
        resource: { attributes: attrs({ 'service.name': 'claude-code', 'contrail.version': version }) },
        scopeSpans: [{ scope: { name: 'contrail', version }, spans }],
      },
    ],
  };
}

/** One link per earlier call (or turn) whose output held a value in this action, strongest grade first. */
function provenanceLinks(
  a: Action,
  e: Explanation | undefined,
  inputs: Map<string, Input>,
  actionIds: Set<string>,
  traceId: string,
  actionSpan: (id: string) => string,
  turnSpan: (promptId: string) => string,
): unknown[] {
  if (!e) return [];
  const order = { DIRECT: 0, LIKELY: 1, POSSIBLE: 2, UNKNOWN: 3 };
  const links = new Map<string, { spanId: string; grade: keyof typeof order; value: string; source: Input; rule: string }>();
  for (const t of e.traces) {
    for (const l of t.links) {
      const source = l.to ? inputs.get(l.to) : undefined;
      if (!source || l.grade === 'UNKNOWN') continue;
      const spanId =
        source.producedBy && source.producedBy !== a.id && actionIds.has(source.producedBy)
          ? actionSpan(source.producedBy)
          : source.origin === 'prompt' && source.promptId
            ? turnSpan(source.promptId)
            : null;
      if (!spanId) continue;
      const seen = links.get(spanId);
      if (!seen || order[l.grade] < order[seen.grade]) links.set(spanId, { spanId, grade: l.grade, value: t.token.text, source, rule: l.rule });
    }
  }
  return [...links.values()]
    .sort((x, y) => order[x.grade] - order[y.grade])
    .map(l => ({
      traceId,
      spanId: l.spanId,
      attributes: attrs({
        'contrail.link': 'value_from',
        'contrail.grade': l.grade,
        'contrail.rule': l.rule,
        'contrail.value': clip(l.value, 200),
        'contrail.source': clip(l.source.label, 200),
        'contrail.trust': l.source.trust,
      }),
    }));
}
