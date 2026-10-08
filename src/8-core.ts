// Pure logic, no vscode imports, so it can be tested headlessly.
export type Criterion =
  | { type: 'lines'; every: number }
  | { type: 'saves'; every: number }
  | { type: 'minutes'; every: number }
  | { type: 'github' };

export interface State {
  lines: number;       // lines since last lines-reward
  saves: number;
  activeMs: number;
  lastGithubDay: string; // YYYY-MM-DD of last github reward
  rewardIndex: number; // next image to show
  rewardsEarned: number;
}

export const emptyState = (): State => ({ lines: 0, saves: 0, activeMs: 0, lastGithubDay: '', rewardIndex: 0, rewardsEarned: 0 });

export function parseCriteria(raw: unknown): Criterion[] {
  if (!Array.isArray(raw)) return [];
  const out: Criterion[] = [];
  for (const c of raw) {
    if (!c || typeof c !== 'object') continue;
    const t = (c as any).type;
    const every = Number((c as any).every);
    if (t === 'github') out.push({ type: 'github' });
    else if ((t === 'lines' || t === 'saves' || t === 'minutes') && Number.isFinite(every) && every >= 1) out.push({ type: t, every: Math.floor(every) });
  }
  return out;
}

/** Lines added by one text change. Pure deletions and pastes of huge blocks count nothing extra. */
export function linesAdded(text: string, rangeLineSpan: number, maxPerChange = 200): number {
  const newlines = (text.match(/\n/g) || []).length;
  const net = newlines - rangeLineSpan; // replacing lines does not count as new writing
  return Math.max(0, Math.min(net, maxPerChange));
}

export const isHttpsImage = (u: string) => { try { return new URL(u).protocol === 'https:'; } catch { return false; } };

export function localDay(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Add progress, return how many rewards were earned from this addition and mutate state. */
export function addLines(s: State, crit: Criterion[], n: number): number {
  const c = crit.find(x => x.type === 'lines') as { every: number } | undefined;
  if (!c || n <= 0) return 0;
  s.lines += n;
  const earned = Math.floor(s.lines / c.every);
  s.lines -= earned * c.every;
  return earned;
}
export function addSave(s: State, crit: Criterion[]): number {
  const c = crit.find(x => x.type === 'saves') as { every: number } | undefined;
  if (!c) return 0;
  s.saves += 1;
  const earned = Math.floor(s.saves / c.every);
  s.saves -= earned * c.every;
  return earned;
}
export function addActive(s: State, crit: Criterion[], ms: number): number {
  const c = crit.find(x => x.type === 'minutes') as { every: number } | undefined;
  if (!c || ms <= 0) return 0;
  s.activeMs += ms;
  const unit = c.every * 60000;
  const earned = Math.floor(s.activeMs / unit);
  s.activeMs -= earned * unit;
  return earned;
}
/** One github reward per day, only if contributions > 0. */
export function applyGithub(s: State, crit: Criterion[], day: string, contributions: number): number {
  if (!crit.some(x => x.type === 'github') || contributions <= 0 || s.lastGithubDay === day) return 0;
  s.lastGithubDay = day;
  return 1;
}

/** Pick next image (cycles) and advance. */
export function nextImage(s: State, images: string[]): string | undefined {
  const valid = images.filter(isHttpsImage);
  if (!valid.length) return undefined;
  const url = valid[s.rewardIndex % valid.length];
  s.rewardIndex += 1;
  s.rewardsEarned += 1;
  return url;
}

export function progressSummary(s: State, crit: Criterion[]): string {
  const parts: string[] = [];
  for (const c of crit) {
    if (c.type === 'lines') parts.push(`${s.lines}/${c.every} lines`);
    if (c.type === 'saves') parts.push(`${s.saves}/${c.every} saves`);
    if (c.type === 'minutes') parts.push(`${Math.floor(s.activeMs / 60000)}/${c.every} min`);
    if (c.type === 'github') parts.push(s.lastGithubDay === localDay(new Date()) ? 'GitHub: done today' : 'GitHub: not yet today');
  }
  return parts.join('  |  ') || 'No goals set';
}
