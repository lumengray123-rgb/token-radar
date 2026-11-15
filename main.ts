// The token radar's runner: one sealed snapshot in, the whole entry out.
//
//   node main.ts --input /input/snapshot.json        (or MAKEFUN_INPUT)
//   node main.ts --output-dir /output                 (or MAKEFUN_OUTPUT_DIR)
//
// It reads the snapshot, builds the board (lib/model.ts), and writes:
//
//   /output/board.json     the ranked board: {rows: BoardRow[]}
//   /output/data.js        the dashboard's dataset, as one script
//   /output/dashboard/     the static page, copied from the repo's dashboard/
//   /output/screenshots/   the three screenshots, copied from screenshots/
//   /output/dossier.json   the dossier, built from /output by the kit's
//                          vendor/makefun-board.ts (buildDossier)
//
// The run is fully deterministic: the same snapshot always yields the same
// bytes. It refuses to write a board the gate would not take (boardIssue),
// and it never writes into the snapshot's directory.

import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { boardIssue, buildRadar, dataScript, parseSnapshot } from './lib/model.ts';
import { buildDossier } from './vendor/makefun-board.ts';

/** The files that make the entry, and what they carry. */
const OUTPUT_FILES = {
  board: 'board.json',
  data: 'data.js',
  dossier: 'dossier.json',
  dashboard: 'dashboard',
  screenshots: 'screenshots',
} as const;

const ROOT = dirname(fileURLToPath(import.meta.url));

function flag(argv: string[], name: string): string | undefined {
  const i = argv.indexOf(name);
  return i >= 0 && i + 1 < argv.length ? argv[i + 1] : undefined;
}

function usage(): string {
  return [
    'usage: node main.ts [--input <snapshot.json>] [--output-dir <dir>]',
    '  --input       the snapshot to rank; default /input/snapshot.json, else MAKEFUN_INPUT',
    '  --output-dir  where the entry is written; default /output, else MAKEFUN_OUTPUT_DIR',
  ].join('\n');
}

function fail(message: string): never {
  console.error(`token-radar: ${message}`);
  process.exit(1);
}

function main(argv: string[]): void {
  if (argv.includes('--help') || argv.includes('-h')) {
    console.log(usage());
    return;
  }
  const inputPath = flag(argv, '--input') ?? process.env.MAKEFUN_INPUT ?? '/input/snapshot.json';
  const outputDir = flag(argv, '--output-dir') ?? process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

  if (!existsSync(inputPath)) fail(`no snapshot at ${inputPath}`);
  const snapshot = parseSnapshot(readFileSync(inputPath, 'utf8'));

  const { board, radar } = buildRadar(snapshot);
  const issue = boardIssue(board, snapshot);
  if (issue !== null) fail(`the board fails its own checks: ${issue}`);

  // The output directory is created fresh, and the snapshot's directory is
  // never written into: the two must not be the same place.
  const resolvedInput = resolve(inputPath);
  const resolvedOutput = resolve(outputDir);
  if (dirname(resolvedInput) === resolvedOutput) fail('the output directory is the snapshot directory');
  mkdirSync(resolvedOutput, { recursive: true });

  writeFileSync(join(resolvedOutput, OUTPUT_FILES.board), `${JSON.stringify({ rows: board }, null, 2)}\n`);
  writeFileSync(join(resolvedOutput, OUTPUT_FILES.data), dataScript(radar));

  const dashboardSrc = join(ROOT, OUTPUT_FILES.dashboard);
  const screenshotsSrc = join(ROOT, OUTPUT_FILES.screenshots);
  if (!existsSync(dashboardSrc)) fail(`no dashboard directory at ${dashboardSrc}`);
  if (!existsSync(screenshotsSrc)) fail(`no screenshots directory at ${screenshotsSrc}`);
  cpSync(dashboardSrc, join(resolvedOutput, OUTPUT_FILES.dashboard), { recursive: true });
  cpSync(screenshotsSrc, join(resolvedOutput, OUTPUT_FILES.screenshots), { recursive: true });

  // The dossier is built last, from everything just written.
  const dossier = buildDossier(resolvedOutput, { text_max_bytes: 65536 });
  writeFileSync(join(resolvedOutput, OUTPUT_FILES.dossier), dossier);

  const shotCount = readdirSync(join(resolvedOutput, OUTPUT_FILES.screenshots)).filter((f) => {
    const st = statSync(join(resolvedOutput, OUTPUT_FILES.screenshots, f));
    return st.isFile();
  }).length;
  console.log(
    `token-radar: ${board.length} rows (${radar.watchlist_size} watchlist, ${radar.early_size} early), ` +
      `${radar.live_size} live-token protocols, ${shotCount} screenshots, dossier ${dossier.length} bytes`,
  );
}

main(process.argv.slice(2));
