// Shared task config for the agent processes.
// Deliberately evergreen, not time-sensitive: "top 3 DeFi protocols on Monad
// right now" depends on live information neither the worker's nor the
// hirer's Gemini calls can access (no search grounding — see STEP-BY-STEP.md),
// so a frozen training cutoff can confidently give a wrong or outdated
// answer. A general-knowledge question sidesteps that risk entirely, and
// this one happens to be exactly what the whole project demonstrates.
export const TASK_DESCRIPTION =
  "Explain what an escrow smart contract is and why it lets two parties who don't trust each other transact safely, in one paragraph.";
export const DEADLINE_SECONDS = 180; // escrow deadline = now + this, generous for a live demo
// The worker generates a real deliverable for TASK_DESCRIPTION at submission time
// (agents/task.ts) and submits it directly as resultHash — no placeholder needed.

// Layer 4 — negotiation. Prices in MON (converted to wei right before createEscrow).
export const HIRER_MAX_BUDGET_MON = 0.02;
export const WORKER_MIN_PRICE_MON = 0.006;
export const MAX_NEGOTIATION_ROUNDS = 3;

// Real IPC between hirer.ts and worker.ts for the pre-escrow negotiation handshake
// (there's no contract yet at this point, so this can't happen on-chain).
export const NEGOTIATION_PORT = 4021;
export const NEGOTIATION_URL = `http://127.0.0.1:${NEGOTIATION_PORT}/negotiate`;

// Dashboard-only visibility feed: the hirer's judge verdict + reasoning are
// computed entirely off-chain (never touch the contract), so they're pushed
// here purely so a browser dashboard can see *why* a delivery was accepted or
// rejected — this has zero bearing on the actual trust flow, which is decided
// on-chain by approveAndRelease / reclaimAfterTimeout regardless of who's watching.
export const VERDICT_URL = `http://127.0.0.1:${NEGOTIATION_PORT}/verdict`;
