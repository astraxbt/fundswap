import { PublicKey, Keypair } from '@solana/web3.js';
import { createRpc, LightSystemProgram, defaultTestStateTreeAccounts } from '@lightprotocol/stateless.js';

import bs58 from 'bs58';
import { buildPoseidon } from 'circomlibjs';
import { keccak_256 } from '@noble/hashes/sha3';
import { TransactionMessage, VersionedTransaction, ComputeBudgetProgram } from '@solana/web3.js';

const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL;
export const BASE_CHALLENGE = "Lethe-Stealth-Address-v1";

export interface StealthAddress {
    address: string;
    timestamp: number;
    commitment: string;
    compressInstruction: any; // We'll use proper type from Light Protocol
}

export async function generateStealthAddress(
    mainWallet: PublicKey,
    signature: Uint8Array,
    index: number
): Promise<StealthAddress> {
    try {
        const connection = await createRpc(RPC_URL!);
        
        console.log('Step 1: Creating stealth address with wallet:', mainWallet.toString());
        
        const seedMaterial = new Uint8Array([...signature.slice(0, 32)]);
        const newKeypair = Keypair.fromSeed(seedMaterial);
        const address = newKeypair.publicKey.toString();
        console.log('Generated keypair address:', address);
        
        console.log('Step 2: Generating Poseidon commitment');
        const poseidon = await buildPoseidon();
        const commitment = poseidon.F.toString(
            poseidon([
                poseidon.F.e(Buffer.from(seedMaterial)),
                poseidon.F.e(Buffer.from(newKeypair.publicKey.toBytes()))
            ])
        );

        console.log('Step 3: Getting state tree accounts');
        const stateTreeAccounts = defaultTestStateTreeAccounts();
        console.log('State tree:', {
            merkleTree: stateTreeAccounts.merkleTree.toString(),
            height: stateTreeAccounts.merkleTreeHeight
        });

        return {
            address,
            timestamp: Date.now(),
            commitment: index.toString(),
            compressInstruction: null
        };
    } catch (error) {
        console.error('Error in generateStealthAddress:', error);
        throw error;
    }
}

export async function getStealthAddresses(
    mainWallet: PublicKey,
    startIndex: number = 0,
    endIndex: number = 10
): Promise<StealthAddress[]> {
    const addresses: StealthAddress[] = [];
    
    for (let i = startIndex; i < endIndex; i++) {
        const address = await generateStealthAddress(mainWallet, new Uint8Array([i]), i);
        addresses.push(address);
    }
    
    return addresses;
}

export async function verifyStealthAddress(
    mainWallet: PublicKey,
    stealthAddress: string,
    maxIndex: number = 100
): Promise<boolean> {
    const addresses = await getStealthAddresses(mainWallet, 0, maxIndex);
    return addresses.some(addr => addr.address === stealthAddress);
}

export async function getAllStealthAddresses(
    mainWallet: PublicKey,
    signMessage: (message: Uint8Array) => Promise<Uint8Array>,
    numToCheck: number = 5
): Promise<Array<{ publicKey: PublicKey, index: number }>> {
    const addresses = [];
    
    if (numToCheck === 0) return addresses;
    
    // Sign once for all addresses
    const challenge = BASE_CHALLENGE;
    const message = new TextEncoder().encode(challenge);
    const signature = await signMessage(message);
    
    // Use the signature as base entropy
    const baseEntropy = signature.slice(0, 32);
    
    for (let index = 0; index < numToCheck; index++) {
        // Create unique seed for each index
        const indexBytes = new Uint8Array(4);
        new DataView(indexBytes.buffer).setUint32(0, index, false);
        const combinedEntropy = new Uint8Array([...baseEntropy, ...indexBytes]);
        
        // Use keccak_256 correctly
        const seedMaterial = keccak_256(combinedEntropy);
        const stealthKeypair = Keypair.fromSeed(new Uint8Array(seedMaterial));
        
        addresses.push({
            publicKey: stealthKeypair.publicKey,
            index
        });
    }
    
    return addresses;
}

export async function monitorAndShieldAddress(
    stealthPubkey: PublicKey,
    index: number,
    baseSignature: Uint8Array,
    mainWallet: PublicKey
): Promise<(() => void)> {
    const connection = await createRpc(RPC_URL!);
    
    // Create websocket subscription
    const subscriptionId = connection.onAccountChange(stealthPubkey, async (account) => {
        if (account.lamports > 0) {
            console.log(`Funds detected in ${stealthPubkey.toString()}: ${account.lamports}`);
            
            try {
                // Regenerate stealth keypair
                const indexBytes = new Uint8Array(4);
                new DataView(indexBytes.buffer).setUint32(0, index, false);
                const combinedEntropy = new Uint8Array([...baseSignature.slice(0, 32), ...indexBytes]);
                const seedMaterial = new Uint8Array(keccak_256(combinedEntropy));
                const stealthKeypair = Keypair.fromSeed(seedMaterial);

                // Create shield transaction
                const shieldTx = await LightSystemProgram.compress({
                    payer: stealthPubkey,
                    toAddress: mainWallet,
                    lamports: account.lamports - 10000, // Leave some for fees
                    outputStateTree: defaultTestStateTreeAccounts().merkleTree,
                });

                const { blockhash } = await connection.getLatestBlockhash();
                const messageV0 = new TransactionMessage({
                    payerKey: stealthPubkey,
                    recentBlockhash: blockhash,
                    instructions: [
                        ComputeBudgetProgram.setComputeUnitLimit({ units: 1_000_000 }),
                        shieldTx
                    ],
                }).compileToV0Message();

                const transaction = new VersionedTransaction(messageV0);
                transaction.sign([stealthKeypair]);
                
                const sig = await connection.sendTransaction(transaction);
                console.log(`Auto-shielded! Signature: ${sig}`);
            } catch (error) {
                console.error("Error in auto-shield:", error);
            }
        }
    });

    // Return cleanup function
    return () => {
        connection.removeAccountChangeListener(subscriptionId);
    };
}
