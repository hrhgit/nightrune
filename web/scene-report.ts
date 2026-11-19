// What the scene preview page reports on window.__sceneReport. Kept free of DOM types so the
// Node script that drives the page (scripts/scenes.ts) can share it.

/** One piece of canvas text, in CSS pixels on screen. */
export interface TextMark {
  readonly scene: string;
  readonly canvas: 'board' | 'hand';
  readonly text: string;
  /** Font size as it appears on screen, after the canvas is scaled to fit the page. */
  readonly screenPx: number;
  /** True when part of the text falls outside its canvas. */
  readonly clipped: boolean;
}

/** Two pieces of text on the same canvas whose ink boxes overlap. */
export interface TextOverlap {
  readonly scene: string;
  readonly a: string;
  readonly b: string;
}

export interface SceneReport {
  readonly ready: boolean;
  readonly scenes: readonly string[];
  readonly marks: readonly TextMark[];
  readonly overlaps: readonly TextOverlap[];
  readonly errors: readonly string[];
}
