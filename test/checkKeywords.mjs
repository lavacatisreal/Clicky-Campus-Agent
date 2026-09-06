// Full local coverage check: for every fixture that has a matching keyword
// list in test/keywords/, run EVERY keyword through the pipeline and print
// a report — no need to test keywords one at a time with `npm run demo`.
//
// For each keyword this shows two things:
//   1. "OCR" column — can Azure/Tesseract OCR alone find it? (the fast,
//      cheap, primary path)
//   2. "with fallback" column — once the vision fallback is added, does
//      the keyword resolve at all? This is what answers "OCR 辨識不到的
//      要怎麼辦" — it should ALWAYS say yes here, because that's exactly
//      what the fallback exists for. If a row ever shows "with fallback:
//      NOT FOUND", that's a real bug in the orchestrator, not an
//      OCR/detection limitation, and needs investigating.
//
// Without Azure credentials, the fallback column uses a stub that always
// returns a placeholder coordinate — it proves the ROUTING is correct
// (OCR miss -> LLM call), not that the coordinate is accurate. Once
// AZURE_OPENAI_* env vars are set, it automatically switches to the real
// createAzureOpenAiVisionProvider so the "with fallback" column becomes a
// real accuracy check too.
//
// Usage:
//   node test/checkKeywords.mjs --all
//   node test/checkKeywords.mjs --image test/fixtures/course-announce.png --keywords test/keywords/course-announce.json
//   add --annotate to also draw every FOUND keyword's box on one combined
//   image (test/output/<fixture>-annotated-all.png), numbered to match the
//   legend printed to the console — unlike `npm run demo`, which only ever
//   shows one keyword's box at a time.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readdir, readFile } from 'node:fs/promises';
import { Jimp } from 'jimp';
import { locateKeyword } from '../src/pipeline/locateKeyword.js';
import { pickOcrProvider, pickVisionFallback, cacheOcr } from './providers.mjs';
import { drawSetOfMark } from '../src/matching/setOfMark.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function getArg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : null;
}

async function checkOne(imagePath, keywordsPath) {
  const keywords = JSON.parse(await readFile(keywordsPath, 'utf8'));
  const meta = await Jimp.read(imagePath);
  const image = { path: imagePath, width: meta.bitmap.width, height: meta.bitmap.height };

  const { provider: realOcr, backend: ocrBackend } = pickOcrProvider();
  const ocrResult = await realOcr.detectText(image);
  const ocr = cacheOcr(realOcr, ocrResult);
  const { provider: visionFallback, backend: fallbackBackend } = pickVisionFallback();

  console.log(
    `\n=== ${path.basename(imagePath)} (${keywords.length} keywords, OCR: ${ocrBackend}, fallback: ${fallbackBackend}) ===`
  );

  let ocrHits = 0;
  let fallbackHits = 0;
  let unresolved = 0;
  const foundForAnnotation = [];

  for (const keyword of keywords) {
    const ocrOnly = await locateKeyword({ image, keyword }, { ocr });
    const withFallback = await locateKeyword({ image, keyword }, { ocr, visionFallback });

    // ocrOnly.found is true even for a low-confidence guess (source: 'none') —
    // locateKeyword always surfaces its best candidate so callers have
    // something to inspect. Only source: 'ocr' means "confident enough to
    // trust without a second opinion"; treat anything else as NOT resolved
    // by OCR alone, even if a (weak/imprecise) candidate exists.
    const ocrConfident = ocrOnly.source === 'ocr';
    const ocrCol = ocrConfident
      ? `OCR: FOUND (${ocrOnly.primaryMatch.confidence.toFixed(2)})`
      : ocrOnly.found
        ? `OCR: weak match only (${ocrOnly.primaryMatch.confidence.toFixed(2)}, low precision)`
        : 'OCR: not found';
    const fallbackCol = withFallback.found ? `with fallback: FOUND via ${withFallback.source}` : 'with fallback: NOT FOUND ⚠️';

    console.log(`  ${keyword.padEnd(20, '　')} ${ocrCol.padEnd(38)} | ${fallbackCol}`);

    if (ocrConfident) {
      ocrHits++;
      foundForAnnotation.push({ text: keyword, boundingBox: ocrOnly.primaryMatch.boundingBox });
    } else if (withFallback.found) {
      fallbackHits++;
      foundForAnnotation.push({ text: keyword, boundingBox: withFallback.primaryMatch.boundingBox });
    } else {
      unresolved++;
    }
  }

  console.log(
    `  --- ${ocrHits}/${keywords.length} found by OCR directly, ${fallbackHits}/${keywords.length} needed the vision fallback, ${unresolved}/${keywords.length} unresolved by either ---`
  );
  if (unresolved > 0) {
    console.log('  ⚠️  unresolved > 0 with a fallback attached is unexpected — investigate locateKeyword.js, not OCR tuning.');
  }

  if (process.argv.includes('--annotate') && foundForAnnotation.length) {
    const { dataUrl, marks } = await drawSetOfMark(image, foundForAnnotation);
    const outPath = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      'output',
      `${path.basename(imagePath, '.png')}-annotated-all.png`
    );
    await (await import('node:fs/promises')).writeFile(outPath, Buffer.from(dataUrl.split(',')[1], 'base64'));
    console.log(`  annotated image (${marks.length} boxes) written to ${outPath}`);
    console.log('  legend: ' + marks.map((m) => `${m.id}=${m.text}`).join(', '));
  }

  return { total: keywords.length, ocrHits, fallbackHits, unresolved };
}

const imageArg = getArg('image');
const keywordsArg = getArg('keywords');
const all = process.argv.includes('--all');

let pairs;
if (all) {
  const keywordFiles = (await readdir(path.join(__dirname, 'keywords'))).filter((f) => f.endsWith('.json'));
  pairs = keywordFiles.map((f) => ({
    image: path.join(__dirname, 'fixtures', f.replace(/\.json$/, '.png')),
    keywords: path.join(__dirname, 'keywords', f),
  }));
} else if (imageArg && keywordsArg) {
  pairs = [{ image: path.resolve(imageArg), keywords: path.resolve(keywordsArg) }];
} else {
  console.error('Usage: node test/checkKeywords.mjs --all');
  console.error('   or: node test/checkKeywords.mjs --image <png> --keywords <json>');
  process.exit(1);
}

const totals = { total: 0, ocrHits: 0, fallbackHits: 0, unresolved: 0 };
for (const { image, keywords } of pairs) {
  const r = await checkOne(image, keywords);
  totals.total += r.total;
  totals.ocrHits += r.ocrHits;
  totals.fallbackHits += r.fallbackHits;
  totals.unresolved += r.unresolved;
}

if (pairs.length > 1) {
  console.log(
    `\n=== TOTAL: ${totals.total} keywords across ${pairs.length} pages — ${totals.ocrHits} via OCR, ${totals.fallbackHits} via fallback, ${totals.unresolved} unresolved ===`
  );
}
