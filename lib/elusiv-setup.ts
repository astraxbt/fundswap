// utils/elusiv-setup.ts
import * as ed from '@noble/ed25519';
import { sha512 } from '@noble/hashes/sha512';
import { Connection, PublicKey } from '@solana/web3.js';
import { Elusiv } from '@elusiv/sdk';

// Configure ed25519
ed.etc.sha512Sync = (...m) => sha512(ed.etc.concatBytes(...m));

export { ed };

const CLUSTER = "devnet";
const RPC_URL = "https://api.devnet.solana.com";
const WARDEN_URL = "https://warden.devnet.elusiv.io";

export async function getElusivInstance(signature: number[], publicKey: string) {
  const connection = new Connection(RPC_URL, {
    commitment: 'confirmed'
  });

  // Add warden URL to connection
  (connection as any).rpcClient.httpHeaders = {
    'x-warden-url': WARDEN_URL
  };

  return await Elusiv.getElusivInstance(
    Uint8Array.from(signature),
    new PublicKey(publicKey),
    connection,
    CLUSTER
  );
}