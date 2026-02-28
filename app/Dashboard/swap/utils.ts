import { PublicKey, Keypair } from '@solana/web3.js';
import { createRpc } from '@lightprotocol/stateless.js';
import { keccak_256 } from '@noble/hashes/sha3';
import bs58 from 'bs58';

const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || "https://geralda-226chf-fast-mainnet.helius-rpc.com";
export const TRADING_BASE_CHALLENGE = "Trading Base Challenge";

export interface TradingAddress {
    address: string;
    timestamp: number;
    index: number;
}

export async function getAllTradingAddresses(
    mainWallet: PublicKey,
    signMessage: (message: Uint8Array) => Promise<Uint8Array>,
    numToCheck: number = 3
): Promise<Array<{ publicKey: PublicKey, index: number }>> {
    const addresses = [];
    
    if (numToCheck === 0) return addresses;
    
    const challenge = TRADING_BASE_CHALLENGE;
    const message = new TextEncoder().encode(challenge);
    const signature = await signMessage(message);
    
    const baseEntropy = signature.slice(0, 32);
    
    for (let index = 0; index < numToCheck; index++) {
        const indexBytes = new Uint8Array(4);
        new DataView(indexBytes.buffer).setUint32(0, index, false);
        const combinedEntropy = new Uint8Array([...baseEntropy, ...indexBytes]);
        
        const seedMaterial = keccak_256(combinedEntropy);
        const tradingKeypair = Keypair.fromSeed(new Uint8Array(seedMaterial));
        
        addresses.push({
            publicKey: tradingKeypair.publicKey,
            index
        });
    }
    
    return addresses;
}

export async function checkPrivateBalance(address: string): Promise<string> {
    if (!address) return "0.0000";
    try {
        const connection = await createRpc(RPC_URL);
        const compressedAccounts = await connection.getCompressedAccountsByOwner(new PublicKey(address));
        
        console.log('checkPrivateBalance - compressedAccounts structure:', 
            compressedAccounts ? (typeof compressedAccounts === 'object' ? Object.keys(compressedAccounts) : typeof compressedAccounts) : 'null');
        
        const items = compressedAccounts?.items ?? compressedAccounts?.accounts ?? compressedAccounts;
        
        if (!items || !Array.isArray(items) || items.length === 0) {
            return "0.0000";
        }
        
        let totalLamports = BigInt(0);
        for (const account of items) {
            if (account.lamports) {
                if (typeof account.lamports === 'string' && account.lamports.startsWith('0x')) {
                    totalLamports += BigInt(parseInt(account.lamports, 16));
                } else {
                    totalLamports += BigInt(account.lamports);
                }
            }
        }
        
        const solBalance = Number(totalLamports) / 1e9;
        return solBalance.toFixed(4);
    } catch (err) {
        console.error('Error checking private balance:', err);
        return "0.0000";
    }
}

export async function checkPublicBalance(address: string): Promise<string> {
    if (!address) return "0.0000";
    try {
        const connection = await createRpc(RPC_URL);
        const balance = await connection.getBalance(new PublicKey(address));
        return (balance / 1e9).toFixed(4); // Convert lamports to SOL
    } catch (err) {
        console.error('Error checking public balance:', err);
        return "0.0000";
    }
}
