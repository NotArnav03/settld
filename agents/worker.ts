import "dotenv/config";
import http from "node:http";
import { agentFromPrivateKey } from "../sdk/client.js";
import { submitWork } from "../sdk/escrow.js";
import { watchSettldEvents } from "../sdk/events.js";
import { TASK_DESCRIPTION, NEGOTIATION_PORT } from "./config.js";
import { workerRespond, type NegotiateRequest } from "./negotiate.js";
import { generateDeliverable } from "./task.js";

/// One transcript entry per negotiation round, from the worker's vantage
/// point (it sees both the hirer's offer and its own reply each round) —
/// exposed via GET /transcript so a browser dashboard can poll it live.
/// Purely additive for the temporary test dashboard; doesn't affect the
/// negotiation logic itself.
interface TranscriptEntry {
  round: number;
  hirerOfferMon: number;
  workerAccepted: boolean;
  workerCounterOfferMon: number;
  workerMessage: string;
}
const transcript: TranscriptEntry[] = [];

/// One entry per escrow's judge verdict, pushed here by hirer.ts purely so
/// the dashboard can show the task, the delivered content, and *why* the
/// hirer did or didn't approve — none of this reasoning lives on-chain or
/// affects the actual approveAndRelease / reclaimAfterTimeout decision,
/// which hirer.ts has already made by the time it POSTs this.
interface VerdictEntry {
  escrowId: string;
  task: string;
  deliverable: string;
  satisfactory: boolean;
  reasoning: string;
}
const verdicts: VerdictEntry[] = [];

/// Pre-escrow negotiation channel. There's no contract yet at this point, so
/// hirer.ts and worker.ts talk price over a plain local HTTP call instead of
/// on-chain events. Once escrow creation happens, everything below goes back
/// to being purely event-driven, same as Layer 3.
function startNegotiationServer(): void {
  const server = http.createServer((req, res) => {
    if (req.method === "GET" && req.url === "/transcript") {
      res
        .writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" })
        .end(JSON.stringify(transcript));
      return;
    }

    if (req.method === "GET" && req.url === "/verdict") {
      res
        .writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" })
        .end(JSON.stringify(verdicts));
      return;
    }

    if (req.method === "POST" && req.url === "/verdict") {
      let vBody = "";
      req.on("data", (chunk) => (vBody += chunk));
      req.on("end", () => {
        try {
          verdicts.push(JSON.parse(vBody) as VerdictEntry);
          res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }).end("{}");
        } catch (err) {
          res.writeHead(400).end(JSON.stringify({ error: String(err) }));
        }
      });
      return;
    }

    if (req.method !== "POST" || req.url !== "/negotiate") {
      res.writeHead(404).end();
      return;
    }

    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", async () => {
      try {
        const parsed = JSON.parse(body) as NegotiateRequest;
        console.log(`[worker] [negotiation round ${parsed.round}] hirer offers ${parsed.hirerOfferMon} MON`);

        const decision = await workerRespond(parsed);
        console.log(
          `[worker] [negotiation round ${parsed.round}] ${decision.accept ? "accepts" : `counters ${decision.counterOfferMon} MON`} — "${decision.message}"`,
        );

        transcript.push({
          round: parsed.round,
          hirerOfferMon: parsed.hirerOfferMon,
          workerAccepted: decision.accept,
          workerCounterOfferMon: decision.counterOfferMon,
          workerMessage: decision.message,
        });

        res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify(decision));
      } catch (err) {
        console.error("[worker] negotiation handler error:", err);
        res.writeHead(500).end(JSON.stringify({ error: String(err) }));
      }
    });
  });

  server.listen(NEGOTIATION_PORT, () => {
    console.log(`[worker] negotiation server listening on :${NEGOTIATION_PORT}`);
  });
}

/// Worker agent: has a minimum acceptable price (used in negotiation).
/// Watches for an escrow created for it, "does the work" (simulated), submits
/// the result, then watches for its own release to confirm payment landed.
async function main() {
  startNegotiationServer();

  const worker = agentFromPrivateKey(process.env.WORKER_PRIVATE_KEY as `0x${string}`);
  console.log(`[worker] ${worker.address}`);
  console.log("[worker] watching for an escrow addressed to me...");

  const escrowId = await new Promise<bigint>((resolve) => {
    const unwatch = watchSettldEvents(
      worker,
      (event) => {
        if (event.name !== "EscrowCreated") return;
        if ((event.args.worker as string).toLowerCase() !== worker.address.toLowerCase()) return;

        console.log(`[worker] escrow #${event.args.escrowId} created for me, amount ${Number(event.args.amount as bigint) / 1e18} MON`);
        unwatch();
        resolve(event.args.escrowId as bigint);
      },
      (err) => console.error("[worker] watch error:", err.message),
    );
  });

  console.log(`[worker] doing the work — task: "${TASK_DESCRIPTION}"`);
  const deliverable = await generateDeliverable(TASK_DESCRIPTION);
  console.log("[worker] deliverable produced:");
  console.log(`  ${deliverable.replace(/\n/g, "\n  ")}`);

  console.log("[worker] submitting deliverable on-chain...");
  await submitWork(worker, escrowId, deliverable);
  console.log("[worker] submitted, waiting for hirer to release payment...");

  // Watch for either outcome — the hirer's judge may reject the deliverable
  // and let the deadline pass instead of approving. Waiting on Released alone
  // would hang forever in that case.
  await new Promise<void>((resolve) => {
    const unwatch = watchSettldEvents(
      worker,
      (event) => {
        if ((event.args.escrowId as bigint) !== escrowId) return;

        if (event.name === "Released") {
          console.log(`[worker] payment released: ${Number(event.args.amount as bigint) / 1e18} MON received`);
          unwatch();
          resolve();
        } else if (event.name === "Refunded") {
          console.log(`[worker] escrow refunded to hirer instead — the deliverable wasn't approved. No payment received.`);
          unwatch();
          resolve();
        }
      },
      (err) => console.error("[worker] watch error:", err.message),
    );
  });

  console.log("[worker] done.");
  process.exit(0);
}

main().catch((err) => {
  console.error("[worker] FAILED:", err);
  process.exit(1);
});
