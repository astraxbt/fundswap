import { NextResponse } from 'next/server';
import { PublicKey, Keypair, TransactionMessage, VersionedTransaction, TransactionInstruction } from '@solana/web3.js';
import bs58 from 'bs58';

export async function POST(request: Request) {
  try {
    const { instructions: serializedInstructions, blockhash, userPublicKey } = await request.json();
    
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

    const messageV0 = new TransactionMessage({
      payerKey: feePayer.publicKey,
      recentBlockhash: blockhash,
      instructions,
    }).compileToV0Message();

    const transaction = new VersionedTransaction(messageV0);
    
    transaction.sign([feePayer]);

    return NextResponse.json({
      transaction: bs58.encode(transaction.serialize()),
    });
    
  } catch (error: any) {
    console.error('Gasless relay error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to process gasless relay transaction' },
      { status: 500 }
    );
  }
}
