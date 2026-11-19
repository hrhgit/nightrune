// npm run scenes [-- --only <id>] [-- --out <dir>]
// Opens every scene of web/scene.html in a headless browser at three viewports, saves one PNG
// per scene and viewport, and writes report.json with what the page measured: the smallest text
// on screen, text drawn outside its canvas, overlapping text, and console errors.
// Exits 1 if a scene fails to render or the page logs an error. Small or overlapping text is
// reported, not failed: it is input for review, not a gate (yet).
// Uses the installed Google Chrome by default; set CHROME_PATH to use another Chromium build.
import { mkdir, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { parseArgs } from 'node:util';
import { chromium, type BrowserContextOptions, type Page } from 'playwright-core';
import { createServer } from 'vite';
import type { SceneReport } from '../web/scene-report.ts';

const VIEWPORTS: Record<string, BrowserContextOptions> = {
  desktop: { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 },
  phone: { viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  'phone-reduced-motion': {
    viewport: { width: 375, height: 812 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    reducedMotion: 'reduce',
  },
};

/** Text smaller than this on screen is listed as small in the summary. */
const SMALL_TEXT_PX = 12;

interface SceneResult {
  readonly scene: string;
  readonly viewport: string;
  readonly image: string;
  readonly minBoardTextPx: number | null;
  readonly minHandTextPx: number | null;
  readonly smallText: readonly { readonly text: string; readonly px: number }[];
  readonly clippedText: readonly string[];
  readonly overlappingText: readonly (readonly [string, string])[];
  readonly errors: readonly string[];
}

const { values: args } = parseArgs({ options: { only: { type: 'string' }, out: { type: 'string', default: 'out/scenes' } } });
const outDir = args.out;

const server = await createServer({ configFile: 'vite.config.ts', logLevel: 'error', server: { port: 0, strictPort: false } });
await server.listen();
const base = server.resolvedUrls?.local[0];
if (base === undefined) throw new Error('Vite did not report a local URL');

const chromePath = process.env['CHROME_PATH'];
const browser = await chromium.launch(chromePath === undefined ? { channel: 'chrome' } : { executablePath: chromePath });
const results: SceneResult[] = [];

try {
  for (const [name, options] of Object.entries(VIEWPORTS)) {
    const context = await browser.newContext(options);
    const page = await context.newPage();
    let errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(`console: ${msg.text()}`);
    });
    page.on('pageerror', (err) => errors.push(`page: ${err.message}`));

    // The page lists its own scenes; ask it rather than keeping a second list here.
    await page.goto(new URL('scene.html', base).href);
    const all = await readReport(page);
    const ids = args.only === undefined ? all.scenes : all.scenes.filter((id) => id === args.only);
    if (ids.length === 0) throw new Error(`No scene "${args.only ?? ''}". Known: ${all.scenes.join(', ')}`);

    await mkdir(join(outDir, name), { recursive: true });
    for (const id of ids) {
      errors = [];
      const image = join(outDir, name, `${id}.png`);
      let report: SceneReport;
      try {
        await page.goto(new URL(`scene.html?id=${encodeURIComponent(id)}`, base).href);
        report = await readReport(page);
        const el = page.locator(`#scene-${id}`);
        if ((await el.count()) === 1) await el.screenshot({ path: image, animations: 'disabled' });
        else errors.push(`no #scene-${id} element to screenshot`);
      } catch (err) {
        // Record and move on, so one broken scene never hides the others or the report.
        report = { ready: false, scenes: [], marks: [], overlaps: [], errors: [`run: ${err instanceof Error ? err.message : String(err)}`] };
      }
      const sizes = (canvas: 'board' | 'hand') => {
        const px = report.marks.filter((m) => m.canvas === canvas).map((m) => m.screenPx);
        return px.length === 0 ? null : Math.min(...px);
      };
      results.push({
        scene: id,
        viewport: name,
        image: relative(outDir, image),
        minBoardTextPx: sizes('board'),
        minHandTextPx: sizes('hand'),
        smallText: dedupe(report.marks.filter((m) => m.screenPx < SMALL_TEXT_PX).map((m) => ({ text: m.text, px: m.screenPx }))),
        clippedText: [...new Set(report.marks.filter((m) => m.clipped).map((m) => m.text))],
        overlappingText: report.overlaps.map((o) => [o.a, o.b] as const),
        errors: [...report.errors, ...errors],
      });
    }
    await context.close();
  }
} finally {
  await browser.close();
  await server.close();
}

await writeFile(join(outDir, 'report.json'), `${JSON.stringify({ viewports: Object.keys(VIEWPORTS), smallTextPx: SMALL_TEXT_PX, results }, null, 2)}\n`);

for (const r of results) {
  const notes = [
    r.errors.length > 0 ? `ERROR ${r.errors.join('; ')}` : '',
    r.smallText.length > 0 ? `small text: ${r.smallText.map((t) => `"${t.text}" ${t.px}px`).join(', ')}` : '',
    r.overlappingText.length > 0 ? `overlap: ${r.overlappingText.map(([a, b]) => `"${a}"/"${b}"`).join(', ')}` : '',
    r.clippedText.length > 0 ? `clipped: ${r.clippedText.join(', ')}` : '',
  ].filter((n) => n !== '');
  console.log(`${r.viewport.padEnd(21)} ${r.scene.padEnd(14)} min text ${String(r.minBoardTextPx).padStart(4)}px  ${notes.join(' | ') || 'ok'}`);
}
console.log(`\n${results.length} screenshots and report.json in ${outDir}`);
if (results.some((r) => r.errors.length > 0)) process.exitCode = 1;

async function readReport(page: Page): Promise<SceneReport> {
  // These callbacks run in the page; globalThis is the page's window there.
  await page.waitForFunction(() => (globalThis as { __sceneReport?: SceneReport }).__sceneReport?.ready === true, undefined, { timeout: 15_000 });
  return page.evaluate(() => (globalThis as unknown as { __sceneReport: SceneReport }).__sceneReport);
}

function dedupe<T extends { text: string; px: number }>(items: readonly T[]): T[] {
  const seen = new Map<string, T>();
  for (const it of items) seen.set(`${it.text}@${it.px}`, it);
  return [...seen.values()];
}
