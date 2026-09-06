// Standalone smoke test for JUST Azure AI Vision (OCR primary line) —
// useful while working through Azure setup incrementally, before the
// Azure OpenAI fallback resource exists yet. See test/azure-connection-test.mjs
// for the full two-service test once both are set up.
//
//   node --env-file-if-exists=.env test/azure-vision-test.mjs
import path from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Jimp } from 'jimp';
import { generateFixture } from './generateFixture.mjs';
import { createAzureVisionOcrProvider } from '../src/providers/azureVisionOcr.js';
import { locateKeyword } from '../src/pipeline/locateKeyword.js';
import { cacheOcr } from './providers.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const required = ['AZURE_VISION_ENDPOINT', 'AZURE_VISION_KEY'];
const missing = required.filter((k) => !process.env[k]);
if (missing.length) {
  console.error(`[vision-test] missing env vars: ${missing.join(', ')}`);
  console.error('[vision-test] fill them into .env, then run: node --env-file-if-exists=.env test/azure-vision-test.mjs');
  process.exit(1);
}

const fixturePath = path.join(__dirname, 'fixtures', 'portal-mockup.png');
if (!existsSync(fixturePath)) await generateFixture(fixturePath);
const meta = await Jimp.read(fixturePath);
const image = { path: fixturePath, width: meta.bitmap.width, height: meta.bitmap.height };

console.log('[vision-test] calling Azure AI Vision (Read OCR)...');
const realOcr = createAzureVisionOcrProvider({
  endpoint: process.env.AZURE_VISION_ENDPOINT,
  apiKey: process.env.AZURE_VISION_KEY,
});
const ocrResult = await realOcr.detectText(image); // the only real API call this script makes
const ocr = cacheOcr(realOcr, ocrResult); // reused below so locateKeyword doesn't call the API again
const lineCount = ocrResult.items.filter((i) => i.level === 'line').length;
console.log(`[vision-test] OK — Azure detected ${lineCount} lines of text on the test screenshot`);

console.log('[vision-test] locating "忘記密碼"...');
const result = await locateKeyword({ image, keyword: '忘記密碼' }, { ocr });
console.log(
  result.found
    ? `[vision-test] FOUND via ${result.source} at (${Math.round(result.primaryMatch.boundingBox.x)}, ${Math.round(result.primaryMatch.boundingBox.y)}), confidence ${result.primaryMatch.confidence.toFixed(2)}`
    : '[vision-test] NOT FOUND — unexpected, investigate'
);

console.log('\n[vision-test] Azure AI Vision is wired up correctly. Once Azure OpenAI is set up too, switch to: npm run test:azure');
