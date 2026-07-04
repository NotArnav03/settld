# Settld

*An escrow rail for a labor market that has no humans in it.*

---

Every economy eventually needs a moment where trust stops being negotiable and becomes a mechanism instead. For people, that moment was a handshake, then a bank, then a court. For AI agents — which can now write the code, price the work, and do the job, but still cannot be trusted to pay each other — that moment doesn't exist yet.

Settld is that moment. Two agents meet with nothing but a task and a number in mind. They argue over price like professionals. They lock funds in a contract neither of them controls. One delivers. The other lets go of the money. No human approves anything. No human is in the room.

This was built in a single afternoon at Monad Blitz Pune, and every claim in this document is something that actually ran, on real testnet infrastructure, more than once.

## What actually happens, in order

1. A **hirer** agent has a task and a budget it will not name out loud.
2. A **worker** agent has a floor price it will not name out loud either.
3. They negotiate — real back-and-forth over HTTP, each side reasoning independently through Gemini, neither one able to see the other's private number. The negotiation is capped at three rounds; if they haven't converged by the third, the protocol itself splits the difference and moves on. It never stalls, because a negotiation that can stall is a negotiation that can be gamed.
4. The agreed price gets locked in `Settld.sol` on Monad testnet. This is the only moment a human could have intervened, and no human does.
5. The worker does the work and submits a pointer to the result.
6. The hirer verifies delivery happened and releases the funds. If the worker never delivers, the deposit returns to the hirer automatically once the deadline passes — nobody has to ask for their money back.

A real transcript, captured mid-build, escrow #16:

```
[hirer]  round 1 — offering 0.005 MON — "I propose 0.005 MON for this summary."
[worker] round 1 — countering 0.007 MON — "I believe the task complexity warrants a slightly higher rate."
[hirer]  round 2 — offering 0.008 MON — "We've adjusted our offer to reflect the task's complexity."
[worker] round 2 — accepts at 0.008 MON — "This offer is acceptable. I'm ready to proceed."
→ escrow #16 created, 0.008 MON locked
→ worker submits ipfs://bafy-demo-deliverable-summary
→ hirer releases funds
→ worker confirms 0.008 MON received
```

Nobody wrote that dialogue. Two language models with opposing incentives wrote it, live, over a socket, in under ten seconds.

## Why an escrow contract, specifically

The obvious question, once you know Monad shipped agent tooling of its own: why not just use it?

**x402 and the Machine Payments Protocol** are excellent at what they do — instant, metered, pay-per-call settlement. But they only do that. There is no concept of *holding* funds pending a judgment call, which means there is no way to say "pay only if the work is actually good" or "refund automatically if nothing arrives by Tuesday." That's not a gap in their design; it's outside their scope. It's also exactly the problem this project exists to solve.

What was left, once that was ruled out honestly, was the one piece it doesn't claim to solve: a deterministic hold-then-release state machine that two agents can trust without trusting each other. That's `Settld.sol`.

## The contract

Four functions, one state machine, no dispute resolution, no arbitration, no oracle deciding whose fault anything is. Optimistic by design — the hirer's approval *is* the verification, which is an honest limitation rather than a hidden one, and it's the reason the Future Scope section below exists.

```
createEscrow(worker, deadline)  → Created     hirer deposits, task begins
submitWork(escrowId, resultHash) → Submitted   worker records delivery
approveAndRelease(escrowId)      → Released    hirer pays, worker receives
reclaimAfterTimeout(escrowId)    → Refunded    deadline passed, hirer recovers funds
```

Every transition emits an event. Every guard is enforced on-chain — only the worker submits, only the hirer approves or reclaims, and every payout runs checks-effects-interactions behind a reentrancy lock before a single wei moves. Eight tests cover the full happy path, the refund path, and every access-control boundary; all eight were also re-run by hand against the live deployment before anything else was built on top of it.

| Contract | Address | Network |
|---|---|---|
| `Settld` | `0xb774f275b73a02D3E89F58cDb3f48a6e6feA6F39` | Monad **Testnet** (chain id `10143`) |

## What Monad actually taught us, the hard way

A few things about building on Monad don't show up in the docs until they show up in your logs:

- **`watchContractEvent` misses events, intermittently, for reasons that never reproduced consistently.** The fix wasn't a workaround bolted onto the flaky path — it was replacing it entirely with a self-managed poll loop over `getContractEvents` and an explicit block cursor. Three consecutive clean runs later, that's what ships.
- **Newly funded wallets can't transact for about 1.2 seconds.** Monad's consensus checks a gas budget against a state view that lags three blocks behind execution, so an account that was just topped up isn't visible as funded yet. Fund early, not moments before the demo.
- **Gas is billed on the limit you set, not the gas you actually use.** Padding a limit "to be safe" is a direct, unnecessary cost on every transaction.
- **The reserve balance floor is 10 MON.** Drop an account's balance below that and it's rate-limited to one transaction per three blocks. Keep escrow amounts small relative to what each wallet holds, and this never becomes a problem worth solving.

None of these are things you'd guess from a pitch deck. All of them are things that would have broken a live demo if they'd gone unnoticed.

## Running it

Full step-by-step build log, including every command, every gotcha, and every decision made along the way, lives in [`STEP-BY-STEP.md`](./STEP-BY-STEP.md). The short version:

```bash
forge install foundry-rs/forge-std
forge test -vv                    # 8/8, always

npm install
npx tsx sdk/check.ts              # read + write + event-watch against the live deployment

npx tsx agents/worker.ts &        # start the worker first — its negotiation server
npx tsx agents/hirer.ts           # and its block-cursor baseline both need a head start
```

`.env` needs a funded Monad testnet hirer key, a funded worker key, the deployed `CONTRACT_ADDRESS`, and a `GEMINI_API_KEY` for the negotiation calls. None of it touches mainnet. None of it needs to.

## What's next

Everything below is deliberately unbuilt. Each idea is real, each one is honest about what it would take, and none of them made it into tonight's demo because the mandate for tonight's demo was reliability over ambition. They're listed here, not shipped, on purpose.

**Zero-contention shards.** A monolithic escrow contract means every task competes for the same storage slots — fine at hackathon volume, a real bottleneck at the volume Monad's parallel execution is built to handle. Deploying each task to its own deterministic `CREATE2` address turns "many agents transacting" from a contention problem into an embarrassingly parallel one. This is a real architectural change, not a flag to flip, and it deserves to be built properly rather than bolted on under demo pressure.

**A verification layer with teeth.** The honest gap in tonight's contract is the same honest gap in every optimistic escrow: the hirer's approval is the verification. The right next step isn't a human in the loop — it's an LLM judge that scores the delivered work against the original spec before the hirer's agent ever calls `approveAndRelease`, with low-confidence verdicts escalating rather than resolving unilaterally. Call it a fraud proof if you want the pitch to land, but be precise in the whitepaper: it's an oracle with reasoning, not a cryptographic guarantee, and pretending otherwise is the kind of claim a technical judge will find in about four seconds.

**Nested agent economies.** Real agent work isn't always a single hire — it's Agent A hiring Agent B who subcontracts to Agent C. Sharded, single-purpose escrows are what makes that composable: a slash on Agent C's shard can cascade a hold through B's and A's in the same transaction, because atomic composition is already how the EVM works. Nobody's built the callback graph yet. It's the natural continuation of everything above it, once the verification layer exists to trigger it honestly.

**Identity and reputation, once it exists where we live.** ERC-8004's registries are real on Monad mainnet today. The moment they're live on testnet — or the moment this graduates off testnet — wiring each agent's identity and delivery history into the Reputation Registry is a half-day of SDK work, not a research problem. It's already scoped. It's just waiting on the network catching up to the standard.

## Built on

Solidity + Foundry for the contract. viem for the SDK. Two independent Node processes for the agents. Gemini for the negotiation. Monad testnet for the settlement layer underneath all of it.

Forked from [`monad-developers/monad-blitz-pune`](https://github.com/monad-developers/monad-blitz-pune) for Monad Blitz Pune.
