import { createPublicClient, createWalletClient, http, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { monadTestnet } from "./chain.js";

export interface Agent {
  address: Address;
  publicClient: ReturnType<typeof createPublicClient>;
  walletClient: ReturnType<typeof createWalletClient>;
}

/// Builds a public+wallet client pair for one agent from a raw private key.
/// Both hirer and worker processes call this once at startup.
export function agentFromPrivateKey(privateKey: Hex): Agent {
  const account = privateKeyToAccount(privateKey);
  // Monad's public testnet RPC has shown real, repeated flakiness in testing
  // tonight (slow eth_call/eth_sendRawTransaction, occasional full connect
  // failures) — well past viem's 10s/3-retry defaults. Give it more room to
  // recover before an agent process gives up mid-flow.
  const transport = http(process.env.MONAD_RPC_URL ?? "https://testnet-rpc.monad.xyz", {
    timeout: 20_000,
    retryCount: 5,
    retryDelay: 1_000,
  });

  const publicClient = createPublicClient({ chain: monadTestnet, transport });
  const walletClient = createWalletClient({ account, chain: monadTestnet, transport });

  return { address: account.address, publicClient, walletClient };
}
