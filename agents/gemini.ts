import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const MODEL = "gemini-2.5-flash";

/// Calls Gemini with a system persona + user prompt, expecting a JSON object
/// back. Strips markdown code-fences if the model wraps its JSON in one —
/// small models do this often enough that it's worth handling defensively.
export async function askGeminiJSON<T>(systemPrompt: string, userPrompt: string): Promise<T> {
  const raw = await askGeminiText(systemPrompt, userPrompt);
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
  return JSON.parse(cleaned) as T;
}

/// Calls Gemini with a system persona + user prompt, returning the raw text
/// response — used for generating actual deliverable content, where the
/// output is the thing being paid for, not a structured decision.
///
/// Retries on transient connection failures (seen live: a plain connect
/// timeout reaching Google's servers crashed an otherwise-correct agent
/// process mid-task) — a single network blip shouldn't take down an agent
/// that's already mid-negotiation with a live escrow on the other side.
export async function askGeminiText(systemPrompt: string, userPrompt: string): Promise<string> {
  const contents = `${systemPrompt}\n\n${userPrompt}`;

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await ai.models.generateContent({ model: MODEL, contents });
      return response.text ?? "";
    } catch (err) {
      if (attempt === 3) throw err;
      await new Promise((r) => setTimeout(r, 1000 * attempt));
    }
  }
  throw new Error("unreachable");
}
