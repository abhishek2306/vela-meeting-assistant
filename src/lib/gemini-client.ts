import { GoogleGenerativeAI, GenerativeModel } from "@google/generative-ai";

const apiKey = process.env.GEMINI_API_KEY || "";
const genAI = new GoogleGenerativeAI(apiKey);

/**
 * Ordered list of Gemini models to try.
 * Attempts the first model, then falls through on rate limit (429), unavailability (503),
 * or not-found (404) errors. Can be overridden via the GEMINI_MODEL_LIST env var
 * (comma-separated, e.g. "gemini-2.0-flash,gemini-2.0-flash-lite").
 *
 * All model names here are confirmed valid for the generateContent API.
 */
const DEFAULT_MODEL_LIST = [
    "gemini-2.5-flash",         // Primary model (if available)
    "gemini-2.0-flash",         // Reliable fast model
    "gemini-2.0-flash-lite",    // Lightweight model
    "gemini-1.5-flash",         // Fallback legacy flash model
];

function getModelList(): string[] {
    const envOverride = process.env.GEMINI_MODEL_LIST;
    if (envOverride) {
        return envOverride.split(",").map((m) => m.trim()).filter(Boolean);
    }
    return DEFAULT_MODEL_LIST;
}

/**
 * Parses the retry delay (in seconds) from a Gemini 429 error response.
 * Returns 0 if no retry info is found.
 */
function parseRetryDelay(err: any): number {
    try {
        // Google includes RetryInfo in the error details JSON
        const msg: string = err?.message || "";
        const match = msg.match(/"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/);
        if (match) return Math.ceil(parseFloat(match[1]));

        // Also check errorDetails array if present
        const details = err?.errorDetails || [];
        for (const d of details) {
            if (d?.["@type"]?.includes("RetryInfo") && d?.retryDelay) {
                return Math.ceil(parseFloat(d.retryDelay));
            }
        }
    } catch (_) { /* ignore parse errors */ }
    return 0;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Error codes that signal we should skip the current model and try the next.
 */
function shouldSkipModel(err: any): boolean {
    const msg: string = err?.message || "";
    const status = err?.status ?? err?.code ?? 0;
    return (
        [429, 503, 404].includes(status) ||
        msg.includes("429") ||
        msg.includes("503") ||
        msg.includes("quota") ||
        msg.includes("not found") ||
        msg.includes("rate limit")
    );
}

/**
 * Attempts to generate content using models from the priority list.
 * Automatically falls over to the next model on rate limit, unavailability or 404 errors.
 * When a model is rate-limited, it waits for the suggested retry delay (up to 30s) once
 * before giving up on that model.
 *
 * @param prompt - The full prompt string to send to the model
 * @returns The text response from the first successful model
 */
export async function generateWithFailover(
    prompt: string,
    images?: { data: string; mimeType: string }[]
): Promise<string> {
    const models = getModelList();
    let lastError: Error | null = null;

    // Convert images to Gemini parts if provided
    const parts: any[] = [prompt];
    if (images && images.length > 0) {
        for (const img of images) {
            // Strip data:image/...;base64, prefix if present
            const base64Data = img.data.includes(",") ? img.data.split(",")[1] : img.data;
            parts.push({
                inlineData: {
                    data: base64Data,
                    mimeType: img.mimeType
                }
            });
        }
    }

    for (const modelName of models) {
        let attempt = 0;
        const maxAttempts = 2;

        while (attempt < maxAttempts) {
            attempt++;
            try {
                const model: GenerativeModel = genAI.getGenerativeModel({ model: modelName });
                const result = await model.generateContent(parts);
                const text = result.response.text().trim();

                if (modelName !== models[0]) {
                    console.log(`[Gemini Failover] Handled by fallback model: ${modelName} (attempt ${attempt})`);
                }
                return text;
            } catch (err: any) {
                if (shouldSkipModel(err)) {
                    lastError = err;

                    if (attempt < maxAttempts) {
                        // First failure: wait for suggested retry delay, then try once more
                        const delaySecs = parseRetryDelay(err);
                        const waitMs = delaySecs > 0 ? Math.min(delaySecs * 1000, 30_000) : 0;
                        if (waitMs > 0) {
                            console.warn(`[Gemini Failover] Model "${modelName}" rate-limited. Waiting ${delaySecs}s before retry...`);
                            await sleep(waitMs);
                        } else {
                            // No delay suggested — skip immediately
                            break;
                        }
                    } else {
                        console.warn(`[Gemini Failover] Skipping model "${modelName}" after max attempts, trying next...`);
                    }
                } else {
                    // Non-recoverable error (e.g., auth failure, bad request) — fail immediately
                    throw err;
                }
            }
        }
    }

    throw new Error(
        `All Gemini models are currently unavailable or rate-limited. Last error: ${lastError?.message}`
    );
}
