// Shared provider selection for the test scripts: auto-detect Azure
// credentials from env and use the real service when available, falling
// back to the local/offline substitute otherwise. Centralized here so
// run.mjs and checkKeywords.mjs don't each duplicate the same env-var
// checks and drift out of sync.
import { createTesseractOcrProvider } from '../src/providers/tesseractOcr.js';
import { createAzureVisionOcrProvider } from '../src/providers/azureVisionOcr.js';
import { createAzureOpenAiVisionProvider } from '../src/providers/azureOpenAiVision.js';

export function pickOcrProvider() {
  if (process.env.AZURE_VISION_ENDPOINT && process.env.AZURE_VISION_KEY) {
    return {
      provider: createAzureVisionOcrProvider({
        endpoint: process.env.AZURE_VISION_ENDPOINT,
        apiKey: process.env.AZURE_VISION_KEY,
      }),
      backend: 'azure-ai-vision',
    };
  }
  return { provider: createTesseractOcrProvider({ lang: 'chi_tra+eng' }), backend: 'tesseract-local' };
}

// Placeholder used until Azure OpenAI is available (see README § "換成正式雲端版本" —
// currently on hold because Azure for Students doesn't support Azure OpenAI
// deployments). Always "finds" something so callers can verify ROUTING
// (OCR miss -> fallback call) without claiming real vision accuracy.
function stubVisionFallback() {
  return {
    name: 'stub-vision (placeholder — Azure OpenAI on hold, see README § 6.3)',
    async locate({ keyword }) {
      return {
        matches: [{ text: keyword, boundingBox: { x: 0, y: 0, width: 0, height: 0 }, confidence: 0, matchType: 'llm-direct (stub)' }],
        raw: {},
      };
    },
  };
}

// Wraps an already-fetched detectText() result so it can be reused across
// multiple locateKeyword() calls against the same image without re-hitting
// the OCR API each time — each real call counts against the Azure quota,
// so this matters once a script queries more than one keyword per image.
export function cacheOcr(realOcr, cachedResult) {
  return { name: realOcr.name, async detectText() { return cachedResult; } };
}

export function pickVisionFallback() {
  if (process.env.AZURE_OPENAI_ENDPOINT && process.env.AZURE_OPENAI_KEY && process.env.AZURE_OPENAI_DEPLOYMENT) {
    return {
      provider: createAzureOpenAiVisionProvider({
        endpoint: process.env.AZURE_OPENAI_ENDPOINT,
        apiKey: process.env.AZURE_OPENAI_KEY,
        deployment: process.env.AZURE_OPENAI_DEPLOYMENT,
      }),
      backend: 'azure-openai-gpt4o',
    };
  }
  return { provider: stubVisionFallback(), backend: 'stub' };
}
