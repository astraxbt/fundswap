import { NextResponse } from 'next/server';
import { PublicKey, Keypair, TransactionMessage, VersionedTransaction, TransactionInstruction, Connection, ComputeBudgetProgram } from '@solana/web3.js';
import bs58 from 'bs58';

const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || 'https://api.mainnet-beta.solana.com';

export async function POST(request: Request) {
  try {
    const { instructions: serializedInstructions } = await request.json();
    
    const privateKeyString = process.env.Relay_Wallet_PRV;
    if (!privateKeyString) {
      throw new Error('Relay_Wallet_PRV not configured');
    }
    
    let feePayer;
    try {
      feePayer = Keypair.fromSecretKey(bs58.decode(privateKeyString));
    } catch {
      feePayer = Keypair.fromSecretKey(
        Uint8Array.from(JSON.parse(privateKeyString))
      );
    }

    const instructions = serializedInstructions.map((inst: any) => {
      return new TransactionInstruction({
        programId: new PublicKey(inst.programId),
        keys: inst.keys.map((key: any) => ({
          pubkey: new PublicKey(key.pubkey),
          isSigner: key.isSigner,
          isWritable: key.isWritable
        })),
        data: Buffer.from(inst.data)
      });
    });

    // Add priority fee for better transaction landing
    instructions.unshift(
      ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 50000 })
    );

    const connection = new Connection(RPC_URL, 'confirmed');

    // Get fresh blockhash server-side to minimize staleness
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');

    const messageV0 = new TransactionMessage({
      payerKey: feePayer.publicKey,
      recentBlockhash: blockhash,
      instructions,
    }).compileToV0Message();

    const transaction = new VersionedTransaction(messageV0);
    transaction.sign([feePayer]);

    // Send transaction from server to minimize time between blockhash fetch and send
    const signature = await connection.sendRawTransaction(transaction.serialize(), {
      skipPreflight: false,
      maxRetries: 5,
    });

    console.log(`Fund API: unshield tx sent: ${signature}`);

    return NextResponse.json({
      signature,
      blockhash,
      lastValidBlockHeight,
    });
    
  } catch (error: any) {
    console.error('Fund API error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to process fund transaction' },
      { status: 500 }
    );
  }
}
