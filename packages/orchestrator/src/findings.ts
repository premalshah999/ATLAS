// Review findings (manual §29): structured, deduplicated, and "confirmed" only with a reproduction
// that ATLAS itself observed failing in the same attempt.
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { FindingKind, FindingSeverity, newId, nowIso, type Finding } from '@atlas/contracts';

export const FindingArgs = z.object({
  file: z.string().min(1).max(500),
  line: z.number().int().min(1).optional(),
  endLine: z.number().int().min(1).optional(),
  severity: FindingSeverity,
  kind: FindingKind,
  title: z.string().min(3).max(200),
  observation: z.string().min(3).max(4000),
  evidence: z.string().min(1).max(8000),
  recommendation: z.string().max(4000).optional(),
  reproducedBy: z.string().regex(/^art_[A-Za-z0-9]+$/).optional(),
  confidence: z.number().min(0).max(1).default(0.5),
}).strict();
export type FindingArgs = z.infer<typeof FindingArgs>;

export function fingerprint(a: Pick<FindingArgs, 'file' | 'line' | 'title'>): string {
  const norm = a.title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  return createHash('sha256').update(`${a.file}:${a.line ?? 0}:${norm}`).digest('hex').slice(0, 24);
}

/**
 * Build a finding. A "confirmed" claim without a verified failing reproduction from this attempt is
 * downgraded to "suspected" and the downgrade is stated in the evidence.
 */
export function makeFinding(a: FindingArgs, ctx: { missionId: string; taskId: string; failingRuns: ReadonlySet<string> }): { finding: Finding; downgraded: boolean } {
  let kind = a.kind;
  let evidence = a.evidence;
  let downgraded = false;
  if (kind === 'confirmed' && !(a.reproducedBy && ctx.failingRuns.has(a.reproducedBy))) {
    kind = 'suspected';
    downgraded = true;
    evidence = `${evidence}\n\n[ATLAS] Reported as confirmed, but no failing reproduction from this review was referenced; recorded as suspected.`;
  }
  return {
    downgraded,
    finding: {
      id: newId('fnd'), missionId: ctx.missionId, taskId: ctx.taskId, file: a.file, line: a.line ?? null, endLine: a.endLine ?? null,
      severity: a.severity, kind, title: a.title, observation: a.observation, recommendation: a.recommendation ?? null, evidence,
      reproductionArtifactId: kind === 'confirmed' ? a.reproducedBy! : null, confidence: a.confidence, status: 'open', fingerprint: fingerprint(a), createdAt: nowIso(),
    },
  };
}

/** Only open, confirmed, high or medium severity findings block release. */
export function blockingFindings(fs: Finding[]): Finding[] {
  return fs.filter((f) => f.status === 'open' && f.kind === 'confirmed' && (f.severity === 'high' || f.severity === 'medium'));
}
