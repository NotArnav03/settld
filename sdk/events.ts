import { type Address, type Log } from "viem";
import type { Agent } from "./client.js";
import { settldAbi } from "./abi.js";

const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS as Address | undefined;

export type SettldEventName = "EscrowCreated" | "WorkSubmitted" | "Released" | "Refunded";

export interface SettldEvent {
  name: SettldEventName;
  args: Record<string, unknown>;
  log: Log;
}

/// Self-managed polling loop over `getContractEvents`, rather than viem's
/// `watchContractEvent` abstraction — in testing on Monad testnet, the latter
/// intermittently missed logs on its first poll cycle for reasons that didn't
/// reproduce consistently across otherwise-identical scripts. An explicit
/// fromBlock/toBlock cursor we control ourselves is easier to reason about and
/// verify, which matters more than cleverness for a live demo.
///
/// Deliberately starts from "latest" and never back-scans — public RPCs cap
/// `eth_getLogs` block ranges, so only ever asking for [lastSeenBlock+1, latest]
/// keeps every request cheap regardless of how long the process has been running.
///
/// Returns a stop() function; call it to end the polling loop.
export function watchSettldEvents(
  agent: Agent,
  onEvent: (event: SettldEvent) => void,
  onError?: (error: Error) => void,
  pollingIntervalMs = 1_000,
): () => void {
  if (!CONTRACT_ADDRESS) {
    throw new Error("CONTRACT_ADDRESS is not set in the environment (.env)");
  }
  const address = CONTRACT_ADDRESS;

  // Monad's public RPC hard-caps eth_getLogs at a 100-block range. Discovered
  // live: if a poll times out, fromBlock doesn't advance, so the gap to
  // `latest` keeps growing on every retry until it exceeds this cap — at
  // which point every subsequent attempt fails immediately (not a timeout,
  // a hard rejection) and the loop is permanently stuck, since nothing ever
  // advances fromBlock on an error. Capping the requested span, independent
  // of how far behind `latest` has drifted, means each request is always
  // valid on its own and the loop self-heals by catching up over several
  // poll cycles instead of ever asking for one huge range.
  const MAX_BLOCK_SPAN = 99n; // inclusive fromBlock..fromBlock+99 = 100 blocks

  let stopped = false;
  let fromBlock: bigint | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;

  async function poll() {
    if (stopped) return;
    try {
      const latest = await agent.publicClient.getBlockNumber();

      if (fromBlock === undefined) {
        // First tick: establish the baseline, don't fetch historical logs.
        fromBlock = latest + 1n;
      } else if (latest >= fromBlock) {
        const toBlock = latest - fromBlock > MAX_BLOCK_SPAN ? fromBlock + MAX_BLOCK_SPAN : latest;
        const logs = await agent.publicClient.getContractEvents({
          address,
          abi: settldAbi,
          fromBlock,
          toBlock,
        });
        for (const log of logs) {
          const decoded = log as typeof log & { eventName: SettldEventName; args: Record<string, unknown> };
          onEvent({ name: decoded.eventName, args: decoded.args, log });
        }
        fromBlock = toBlock + 1n;
      }
    } catch (err) {
      onError?.(err as Error);
    } finally {
      if (!stopped) timer = setTimeout(poll, pollingIntervalMs);
    }
  }

  poll();

  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
  };
}
