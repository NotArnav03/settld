import { askGeminiText, askGeminiJSON } from "./gemini.js";

/// Worker side: actually produces the deliverable — this is the thing being
/// paid for, not a placeholder. Stored directly on-chain as the escrow's
/// resultHash (short enough for testnet gas to be a non-issue) so the
/// delivered content is itself publicly verifiable, not just a pointer to it.
export async function generateDeliverable(task: string): Promise<string> {
  const system = `You are the WORKER agent completing a paid task on an autonomous agent labor market.
Produce ONLY the deliverable itself — no preamble like "Here is the summary", no meta-commentary about the task, no markdown formatting. Just the requested content, ready to hand over as-is.`;

  const text = await askGeminiText(system, task);
  return text.trim();
}

export interface JudgeVerdict {
  satisfactory: boolean;
  reasoning: string;
}

/// Hirer side: judges the delivered content against the original task spec
/// before deciding whether to call approveAndRelease. This is the honest fix
/// for the "optimistic release" gap — the contract still has no on-chain
/// verification (and isn't meant to), but the hirer's own decision to release
/// funds is no longer a rubber stamp on "something got submitted."
export async function judgeDeliverable(task: string, deliverable: string): Promise<JudgeVerdict> {
  const system = `You are the HIRER agent's quality judge on an autonomous agent labor market.
You will be given the original task and the content a worker agent delivered for it.
Decide whether the delivered content actually satisfies the task — judge substance, not effort or politeness.
Respond with ONLY a JSON object, no markdown, no commentary: {"satisfactory": boolean, "reasoning": string (one or two sentences explaining the decision)}.`;

  const user = `TASK: ${task}\n\nDELIVERED CONTENT:\n${deliverable}`;

  return askGeminiJSON<JudgeVerdict>(system, user);
}
