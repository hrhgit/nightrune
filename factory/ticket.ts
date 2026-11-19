// Reading a ticket and checking a run's files. Pure: no I/O.

export interface Ticket {
  readonly number: number;
  readonly title: string;
  readonly body: string;
  readonly labels: readonly string[];
}

/** The acceptance criteria: checkbox or numbered lines under a "## Acceptance criteria" heading. */
export function criteria(body: string): string[] {
  const section = /^##\s*Acceptance criteria\s*$([\s\S]*?)(?=^##\s|(?![\s\S]))/im.exec(body)?.[1] ?? '';
  return section.split('\n').flatMap((l) => {
    const m = /^\s*(?:[-*]\s*\[[ xX]\]|\d+[.)])\s+(.+)$/.exec(l);
    return m?.[1] === undefined ? [] : [m[1].trim()];
  });
}

/** The ticket's one area, from an `area:<name>` label; null if there is not exactly one known area. */
export function areaOf(labels: readonly string[], known: readonly string[]): string | null {
  const areas = labels.flatMap((l) => (l.startsWith('area:') ? [l.slice(5)] : []));
  const only = areas.length === 1 ? areas[0] : undefined;
  return only !== undefined && known.includes(only) ? only : null;
}

/** Files outside every allowed path prefix (a path ending in "/" is a folder, otherwise one file). */
export function outside(files: readonly string[], paths: readonly string[]): string[] {
  return files.filter((f) => !paths.some((p) => (p.endsWith('/') ? f.startsWith(p) : f === p)));
}
