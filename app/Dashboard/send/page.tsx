"use client";
import React, { useState, useCallback, useEffect } from "react";
import Link from "next/link";
import { ArrowLeft, Eye, Send as SendIcon, Loader2, ChevronDown } from "lucide-react";
import NavBar from "@/components/navBar";
import { useWallet } from '@solana/wallet-adapter-react';
import { ComputeBudgetProgram, TransactionMessage, VersionedTransaction, PublicKey, SystemProgram } from '@solana/web3.js';
import {
  LightSystemProgram,
  bn,
  defaultTestStateTreeAccounts,
  selectMinCompressedSolAccountsForTransfer,
  createRpc,
} from '@lightprotocol/stateless.js';
import { CompressedTokenProgram, selectMinCompressedTokenAccountsForTransfer } from "@lightprotocol/compressed-token";
import { getAssociatedTokenAddress, createAssociatedTokenAccountInstruction, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { searchTokensFromJupiter, Token as JupiterToken } from '../swap/jupiterApi';
import bs58 from 'bs58';

const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || "https://api.mainnet-beta.solana.com";
const FEE_RECIPIENT = new PublicKey("J9DYC1986DWakvDbns1yLtdnvKm7krWbuvKQmutz7i4K");

interface Token {
  address: string;
  mint: string;
  symbol: string;
  name: string;
  decimals: number;
  logoURI?: string;
}

const tokenMetadataCache = new Map<string, { token: JupiterToken | null; timestamp: number }>();
const TOKEN_METADATA_CACHE_TTL = 600000;
const sendTokenCache = new Map<string, { tokens: Token[]; publicBalances: Record<string, string>; privateBalances: Record<string, string>; timestamp: number }>();
const SEND_TOKEN_CACHE_TTL = 600000;
const publicBalanceCache = new Map<string, { balance: string; timestamp: number }>();
const privateBalanceCache = new Map<string, { balance: string; timestamp: number }>();
const BALANCE_CACHE_TTL = 60000;

export default function SendPage() {
  const wallet = useWallet();
  const { publicKey, sendTransaction, connected } = wallet;
  const [amount, setAmount] = useState("");
  const [recipient, setRecipient] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [transactionStep, setTransactionStep] = useState(0);
  const [privateBalance, setPrivateBalance] = useState<string | null>(null);
  const [publicBalance, setPublicBalance] = useState<string | null>(null);
  const [isGasless, setIsGasless] = useState(false);
  const [selectedToken, setSelectedToken] = useState<Token>({
    symbol: 'SOL',
    name: 'Solana',
    address: 'So11111111111111111111111111111111111111112',
    mint: 'So11111111111111111111111111111111111111112',
    decimals: 9
  });
  const [availableTokens, setAvailableTokens] = useState<Token[]>([]);
  const [publicTokenBalances, setPublicTokenBalances] = useState<Record<string, string>>({});
  const [privateTokenBalances, setPrivateTokenBalances] = useState<Record<string, string>>({});
  const [showTokenDropdown, setShowTokenDropdown] = useState(false);
  const [loadingBalances, setLoadingBalances] = useState(false);

  const getTokenMetadata = useCallback(async (tokenMint: string): Promise<JupiterToken | null> => {
    const cacheKey = `send_token_${tokenMint}`;
    const cached = tokenMetadataCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < TOKEN_METADATA_CACHE_TTL) {
      return cached.token;
    }

    try {
      if (tokenMint === 'So11111111111111111111111111111111111111112') {
        const solToken: JupiterToken = {
          address: 'So11111111111111111111111111111111111111112',
          chainId: 101,
          decimals: 9,
          name: 'Solana',
          symbol: 'SOL',
          logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png'
        };
        tokenMetadataCache.set(cacheKey, { token: solToken, timestamp: Date.now() });
        return solToken;
      }

      const jupiterResults = await searchTokensFromJupiter(tokenMint);
      const foundToken = jupiterResults.find((token: JupiterToken) => token.address.toLowerCase() === tokenMint.toLowerCase());

      tokenMetadataCache.set(cacheKey, { token: foundToken || null, timestamp: Date.now() });
      return foundToken || null;
    } catch (error) {
      console.error('Error fetching token metadata:', error);
      tokenMetadataCache.set(cacheKey, { token: null, timestamp: Date.now() });
      return null;
    }
  }, []);

  const checkPrivateBalance = useCallback(async (address: string, tokenMint?: string): Promise<string> => {
    if (!address) return "0.000";

    const cacheKey = `private_${address}_${tokenMint || 'SOL'}`;
    const cached = privateBalanceCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < BALANCE_CACHE_TTL) {
      return cached.balance;
    }

    try {
      const connection = await createRpc(RPC_URL);
      let result = "0.000";

      if (!tokenMint || tokenMint === 'So11111111111111111111111111111111111111112') {
        const compressedAccounts = await connection.getCompressedAccountsByOwner(new PublicKey(address));
        const totalLamports = compressedAccounts.items.reduce((sum: any, account: any) =>
          BigInt(sum) + BigInt(account.lamports || 0), BigInt(0));
        const solBalance = Number(totalLamports) / 1e9;
        result = solBalance.toFixed(4);
      } else {
        const compressedTokenAccounts = await connection.getCompressedTokenAccountsByOwner(
          new PublicKey(address),
          { mint: new PublicKey(tokenMint) }
        );

        if (compressedTokenAccounts.items.length > 0) {
          const totalAmount = compressedTokenAccounts.items.reduce((sum: any, account: any) =>
            BigInt(sum) + BigInt(account.parsed.amount || 0), BigInt(0));

          const tokenMetadata = await getTokenMetadata(tokenMint);
          const decimals = tokenMetadata?.decimals || 9;
          const tokenBalance = Number(totalAmount) / Math.pow(10, decimals);
          result = tokenBalance.toFixed(4);
        }
      }

      privateBalanceCache.set(cacheKey, { balance: result, timestamp: Date.now() });
      return result;
    } catch (err) {
      console.error('Error checking private balance:', err);
      return "0.000";
    }
  }, [getTokenMetadata]);

  const checkPublicBalance = useCallback(async (address: string, tokenMint?: string): Promise<string> => {
    if (!address) return "0.000";

    const cacheKey = `public_${address}_${tokenMint || 'SOL'}`;
    const cached = publicBalanceCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < BALANCE_CACHE_TTL) {
      return cached.balance;
    }

    try {
      const connection = await createRpc(RPC_URL);
      let result = "0.000";

      if (!tokenMint || tokenMint === 'So11111111111111111111111111111111111111112') {
        const balance = await connection.getBalance(new PublicKey(address));
        result = (balance / 1e9).toFixed(4);
      } else {
        const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
          new PublicKey(address),
          { mint: new PublicKey(tokenMint) }
        );

        if (tokenAccounts.value.length > 0) {
          const account = tokenAccounts.value.reduce((prev: any, curr: any) => {
            const prevAmount = (prev.account.data as any).parsed.info.tokenAmount.uiAmount || 0;
            const currAmount = (curr.account.data as any).parsed.info.tokenAmount.uiAmount || 0;
            return prevAmount > currAmount ? prev : curr;
          });

          const balance = (account.account.data as any).parsed.info.tokenAmount.uiAmount || 0;
          result = balance.toFixed(4);
        }
      }

      publicBalanceCache.set(cacheKey, { balance: result, timestamp: Date.now() });
      return result;
    } catch (err) {
      console.error('Error checking public balance:', err);
      return "0.000";
    }
  }, []);

  useEffect(() => {
    if (publicKey) {
      checkPrivateBalance(publicKey.toString()).then(balance => {
        setPrivateBalance(balance);
      });
    }
  }, [publicKey, checkPrivateBalance]);

  useEffect(() => {
    if (publicKey) {
      checkPublicBalance(publicKey.toString()).then(balance => {
        setPublicBalance(balance);
      });
    }
  }, [publicKey, checkPublicBalance]);

  const handleTransfer = useCallback(async () => {
    if (!wallet || !wallet.connected || !publicKey || !sendTransaction) {
      setError('Please connect your wallet');
      return;
    }

    setLoading(true);
    setError('');
    setStatus('Initializing transfer...');
    setTransactionStep(0);

    try {
      const connection = await createRpc(RPC_URL);
      
      if (selectedToken.address === 'So11111111111111111111111111111111111111112') {
        let transferAmount = parseFloat(amount) * 1e9;
      
      setStatus('Checking private balance...');
      const currentPrivateBalance = await checkPrivateBalance(publicKey.toString());
      const currentPrivateLamports = (parseFloat(currentPrivateBalance || '0') * 1e9);
      
      const isMaxAmount = Math.abs(transferAmount - currentPrivateLamports) < 100; // Small threshold for floating point comparison
      if (isMaxAmount) {
        const FEE_RESERVE = 19000;
        transferAmount = Math.max(0, currentPrivateLamports - FEE_RESERVE);
        setStatus(`Adjusting amount to account for transaction fees...`);
      }

      const FEE_BUFFER = 200000; // 0.0002 SOL in lamports
      const neededAdditionalLamports = Math.max(0, transferAmount - currentPrivateLamports + FEE_BUFFER);

      if (neededAdditionalLamports > 0) {
        setStatus(`Shielding additional ${(neededAdditionalLamports / 1e9).toFixed(4)} SOL (includes fee buffer)...`);
        const compressInstruction = await LightSystemProgram.compress({
          payer: publicKey,
          toAddress: publicKey,
          lamports: neededAdditionalLamports,
          outputStateTree: defaultTestStateTreeAccounts().merkleTree,
        });

        const compressInstructions = [
          ComputeBudgetProgram.setComputeUnitLimit({ units: 1_000_000 }),
          compressInstruction,
        ];

        const { context: { slot: minContextSlot }, value: blockhashCtx } =
          await connection.getLatestBlockhashAndContext();

        const messageV0 = new TransactionMessage({
          payerKey: publicKey,
          recentBlockhash: blockhashCtx.blockhash,
          instructions: compressInstructions,
        }).compileToV0Message();

        const transaction = new VersionedTransaction(messageV0);

        setStatus('Sending shield transaction...');
        setTransactionStep(1);
        const signature = await sendTransaction(transaction, connection, {
          minContextSlot,
        });

        await connection.confirmTransaction({
          signature,
          ...blockhashCtx
        });

        await new Promise(resolve => setTimeout(resolve, 2000));
        
        const newPrivateBalance = await checkPrivateBalance(publicKey.toString());
        setPrivateBalance(newPrivateBalance);
        const newPublicBalance = await checkPublicBalance(publicKey.toString());
        setPublicBalance(newPublicBalance);

        setStatus(`✅ Successfully shielded ${(neededAdditionalLamports / 1e9).toFixed(4)} SOL! Continuing with transfer...`);
        setTransactionStep(3);
        
        await new Promise(resolve => setTimeout(resolve, 1000));
        setTransactionStep(0);
      }

      setStatus('Getting compressed accounts...');
      const accounts = await connection.getCompressedAccountsByOwner(publicKey);
      
      if (!accounts || !accounts.items || accounts.items.length === 0) {
        throw new Error('No compressed accounts found. Please shield some SOL first.');
      }

      setStatus('Selecting accounts for transfer...');
      const [selectedAccounts, remaining] = selectMinCompressedSolAccountsForTransfer(
        accounts.items,
        transferAmount
      );
      
      if (!selectedAccounts || selectedAccounts.length === 0) {
        throw new Error('Could not select appropriate accounts for transfer. Please shield more SOL.');
      }

      setStatus('Getting validity proof...');
      const hashes = selectedAccounts.map(account => {
        if (!account.hash || account.hash.length === 0) {
          throw new Error('Invalid account hash found');
        }
        const hashBuffer = Buffer.from(account.hash);
        return bn(hashBuffer);
      });
      
      if (hashes.length === 0) {
        throw new Error('No account hashes available for proof generation');
      }
      
      const { compressedProof, rootIndices } = await connection.getValidityProof(hashes);

      setStatus('Creating private transfer...');
      const sendInstruction = await LightSystemProgram.transfer({
        payer: publicKey,
        toAddress: new PublicKey(recipient),
        lamports: transferAmount,
        inputCompressedAccounts: selectedAccounts,
        outputStateTrees: [defaultTestStateTreeAccounts().merkleTree],
        recentValidityProof: compressedProof,
        recentInputStateRootIndices: rootIndices,
      });

      const sendInstructions = [
        ComputeBudgetProgram.setComputeUnitLimit({ units: 1_000_000 }),
        sendInstruction,
      ];

      const { context: { slot: minContextSlotSend }, value: blockhashSend } =
        await connection.getLatestBlockhashAndContext();

      let transactionSend;
      
      if (isGasless) {
        setStatus('Preparing gasless private transfer...');
        const response = await fetch('/api/gasless-send', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            blockhash: blockhashSend.blockhash,
            instructions: sendInstructions.map(inst => ({
              programId: inst.programId.toString(),
              keys: inst.keys.map(key => ({
                pubkey: key.pubkey.toString(),
                isSigner: key.isSigner,
                isWritable: key.isWritable
              })),
              data: Array.from(inst.data)
            })),
            userPublicKey: publicKey.toString(),
          }),
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || 'Failed to prepare gasless transaction');
        }

        const { transaction: serializedTx } = await response.json();
        transactionSend = VersionedTransaction.deserialize(bs58.decode(serializedTx));
        
        setStatus('Sending gasless private transfer...');
      } else {
        setStatus('Preparing private transfer...');
        const messageV0Send = new TransactionMessage({
          payerKey: publicKey,
          recentBlockhash: blockhashSend.blockhash,
          instructions: sendInstructions,
        }).compileToV0Message();

        transactionSend = new VersionedTransaction(messageV0Send);
        setStatus('Sending private transfer...');
      }
      
      setTransactionStep(1);
      const signatureSend = await sendTransaction(transactionSend, connection, {
        minContextSlot: minContextSlotSend,
        skipPreflight: isGasless, // Only skip preflight for gasless transactions
      });

      setTransactionStep(2);
      await connection.confirmTransaction({
        signature: signatureSend,
        blockhash: blockhashSend.blockhash,
        lastValidBlockHeight: blockhashSend.lastValidBlockHeight,
      });

      setStatus(`✅ Private Transfer Completed Successfully`);
      setTransactionStep(3);
      
      try {
        await fetch('/api/analytics/track', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            operation: 'transfer',
            amount_sol: parseFloat(amount),
            token_symbol: 'SOL',
            user_wallet: publicKey.toString()
          }),
        });
      } catch (trackingError) {
        console.error('Analytics tracking failed:', trackingError);
      }
      
      const newBalance = await checkPrivateBalance(publicKey.toString());
      setPrivateBalance(newBalance);
      const newPublicBalance = await checkPublicBalance(publicKey.toString());
      setPublicBalance(newPublicBalance);

        setAmount('');
      } else {
        const tokenAmount = parseFloat(amount);
        const transferAmount = BigInt(Math.floor(tokenAmount * Math.pow(10, selectedToken.decimals)));
        const mint = new PublicKey(selectedToken.address);

        setStatus('Checking private token balance...');
        const currentPrivateBalance = await checkPrivateBalance(publicKey.toString(), selectedToken.address);
        const currentPrivateAmount = BigInt(Math.floor(parseFloat(currentPrivateBalance || '0') * Math.pow(10, selectedToken.decimals)));

        let actualTransferAmount = transferAmount;
        
        if (currentPrivateAmount < transferAmount) {
          const neededAdditionalAmount = transferAmount - currentPrivateAmount;
          
          setStatus(`Shielding additional ${(Number(neededAdditionalAmount) / Math.pow(10, selectedToken.decimals)).toFixed(4)} ${selectedToken.symbol}...`);
          
          const currentPublicBalance = await checkPublicBalance(publicKey.toString(), selectedToken.address);
          const currentPublicAmount = BigInt(Math.floor(parseFloat(currentPublicBalance || '0') * Math.pow(10, selectedToken.decimals)));
          
          if (currentPublicAmount < neededAdditionalAmount) {
            throw new Error(`Insufficient public balance. Need ${(Number(neededAdditionalAmount) / Math.pow(10, selectedToken.decimals)).toFixed(4)} ${selectedToken.symbol}, but only have ${currentPublicBalance} ${selectedToken.symbol} in public balance.`);
          }
          
          const sourceTokenAccount = await getAssociatedTokenAddress(mint, publicKey);
          
          const sourceAccountInfo = await connection.getAccountInfo(sourceTokenAccount);
          if (!sourceAccountInfo) {
            setStatus('Creating Associated Token Account...');
            const createATAInstruction = createAssociatedTokenAccountInstruction(
              publicKey,
              sourceTokenAccount,
              publicKey,
              mint,
              TOKEN_PROGRAM_ID,
              ASSOCIATED_TOKEN_PROGRAM_ID
            );
            
            const ataInstructions = [
              ComputeBudgetProgram.setComputeUnitLimit({ units: 1_000_000 }),
              createATAInstruction
            ];
            
            const { context: { slot: minContextSlot }, value: blockhashCtx } =
              await connection.getLatestBlockhashAndContext();
              
            const ataMessageV0 = new TransactionMessage({
              payerKey: publicKey,
              recentBlockhash: blockhashCtx.blockhash,
              instructions: ataInstructions,
            }).compileToV0Message();
            
            const ataTransaction = new VersionedTransaction(ataMessageV0);
            
            setStatus('Sending ATA creation transaction...');
            const ataSignature = await sendTransaction(ataTransaction, connection, {
              minContextSlot,
            });
            
            await connection.confirmTransaction({
              signature: ataSignature,
              blockhash: blockhashCtx.blockhash,
              lastValidBlockHeight: blockhashCtx.lastValidBlockHeight,
            });
            
            setStatus('ATA created successfully! Proceeding with shield...');
          }
          
          const compressInstruction = await CompressedTokenProgram.compress({
            payer: publicKey,
            owner: publicKey,
            source: sourceTokenAccount,
            toAddress: publicKey,
            mint: mint,
            amount: bn(neededAdditionalAmount.toString()),
            outputStateTree: defaultTestStateTreeAccounts().merkleTree,
          });
          
          const compressInstructions = [
            ComputeBudgetProgram.setComputeUnitLimit({ units: 1_000_000 }),
            compressInstruction,
          ];
          
          const { context: { slot: minContextSlot }, value: blockhashCtx } =
            await connection.getLatestBlockhashAndContext();
            
          const messageV0 = new TransactionMessage({
            payerKey: publicKey,
            recentBlockhash: blockhashCtx.blockhash,
            instructions: compressInstructions,
          }).compileToV0Message();
          
          const transaction = new VersionedTransaction(messageV0);
          
          setStatus('Sending token shield transaction...');
          setTransactionStep(1);
          const signature = await sendTransaction(transaction, connection, {
            minContextSlot,
          });
          
          await connection.confirmTransaction({
            signature,
            ...blockhashCtx
          });
          
          await new Promise(resolve => setTimeout(resolve, 2000));
          
          const newPrivateBalance = await checkPrivateBalance(publicKey.toString(), selectedToken.address);
          setPrivateTokenBalances(prev => ({
            ...prev,
            [selectedToken.address]: newPrivateBalance
          }));
          const newPublicBalance = await checkPublicBalance(publicKey.toString(), selectedToken.address);
          setPublicTokenBalances(prev => ({
            ...prev,
            [selectedToken.address]: newPublicBalance
          }));
          
          actualTransferAmount = BigInt(Math.floor(Number(transferAmount) * 0.985));
          
          setStatus(`✅ Successfully shielded ${(Number(neededAdditionalAmount) / Math.pow(10, selectedToken.decimals)).toFixed(4)} ${selectedToken.symbol}! Continuing with transfer (${(Number(actualTransferAmount) / Math.pow(10, selectedToken.decimals)).toFixed(4)} ${selectedToken.symbol} after fees)...`);
          setTransactionStep(3);
          
          await new Promise(resolve => setTimeout(resolve, 1000));
          setTransactionStep(0);
        }

        setStatus('Getting compressed token accounts...');
        const compressedTokenAccounts = await connection.getCompressedTokenAccountsByOwner(publicKey, {
          mint: mint
        });

        if (!compressedTokenAccounts.items.length) {
          throw new Error('No compressed token accounts found');
        }

        const [selectedAccounts, _] = selectMinCompressedTokenAccountsForTransfer(
          compressedTokenAccounts.items,
          bn(actualTransferAmount.toString())
        );

        setStatus('Getting validity proof...');
        const { compressedProof: recentValidityProof, rootIndices: recentInputStateRootIndices } =
          await connection.getValidityProof(selectedAccounts.map((account: any) => bn(account.compressedAccount.hash)));

        setStatus('Creating private token transfer...');
        const transferInstruction = await CompressedTokenProgram.transfer({
          payer: publicKey,
          inputCompressedTokenAccounts: selectedAccounts,
          toAddress: new PublicKey(recipient),
          amount: bn(actualTransferAmount.toString()),
          recentInputStateRootIndices,
          recentValidityProof,
          outputStateTrees: [defaultTestStateTreeAccounts().merkleTree],
        });

        const instructions = [
          ComputeBudgetProgram.setComputeUnitLimit({ units: 1_000_000 }),
          transferInstruction,
        ];

        const { context: { slot: minContextSlot }, value: blockhashCtx } =
          await connection.getLatestBlockhashAndContext();

        const messageV0 = new TransactionMessage({
          payerKey: publicKey,
          recentBlockhash: blockhashCtx.blockhash,
          instructions,
        }).compileToV0Message();

        const transaction = new VersionedTransaction(messageV0);

        setStatus('Sending private token transfer...');
        setTransactionStep(1);
        const signature = await sendTransaction(transaction, connection, {
          minContextSlot,
        });

        setTransactionStep(2);
        await connection.confirmTransaction({
          signature,
          blockhash: blockhashCtx.blockhash,
          lastValidBlockHeight: blockhashCtx.lastValidBlockHeight,
        });

        setStatus(`✅ Private Token Transfer Completed Successfully`);
        setTransactionStep(3);
        
        try {
          await fetch('/api/analytics/track', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              operation: 'transfer',
              amount_sol: tokenAmount,
              token_symbol: selectedToken.symbol,
              user_wallet: publicKey.toString()
            }),
          });
        } catch (trackingError) {
          console.error('Analytics tracking failed:', trackingError);
        }
        
        const newPrivateBalance = await checkPrivateBalance(publicKey.toString(), selectedToken.address);
        setPrivateTokenBalances(prev => ({
          ...prev,
          [selectedToken.address]: newPrivateBalance
        }));

        setAmount('');
      }
    } catch (err) {
      console.error('Transfer error:', err);
      setError(err instanceof Error ? err.message : 'Failed to process transaction');
      setTransactionStep(0);
    } finally {
      setLoading(false);
    }
  }, [wallet, publicKey, sendTransaction, amount, recipient, selectedToken, isGasless, checkPrivateBalance, checkPublicBalance]);

  const fetchAvailableTokens = useCallback(async (forceRefresh = false) => {
    if (!publicKey || !connected) return;

    const cacheKey = `send_tokens_${publicKey.toString()}`;
    const cached = sendTokenCache.get(cacheKey);
    if (!forceRefresh && cached && Date.now() - cached.timestamp < SEND_TOKEN_CACHE_TTL) {
      setAvailableTokens(cached.tokens);
      setPublicTokenBalances(cached.publicBalances);
      setPrivateTokenBalances(cached.privateBalances);
      return;
    }

    try {
      setLoadingBalances(true);
      const connection = await createRpc(RPC_URL);

      const tokens: Token[] = [];
      const publicBalances: Record<string, string> = {};
      const privateBalances: Record<string, string> = {};

      const [solPrivateBalance, solPublicBalance] = await Promise.allSettled([
        checkPrivateBalance(publicKey.toString()),
        checkPublicBalance(publicKey.toString())
      ]);

      tokens.push({
        address: 'So11111111111111111111111111111111111111112',
        mint: 'So11111111111111111111111111111111111111112',
        symbol: 'SOL',
        name: 'Solana',
        decimals: 9
      });

      if (solPrivateBalance.status === 'fulfilled') {
        privateBalances['So11111111111111111111111111111111111111112'] = solPrivateBalance.value;
      }
      if (solPublicBalance.status === 'fulfilled') {
        publicBalances['So11111111111111111111111111111111111111112'] = solPublicBalance.value;
      }

      try {
        const tokenAccountsResult = await connection.getParsedTokenAccountsByOwner(
          publicKey,
          { programId: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA') }
        );

        if (tokenAccountsResult.value.length > 0) {
          const tokenPromises = tokenAccountsResult.value
            .filter(tokenAccount => {
              const tokenInfo = (tokenAccount.account.data as any).parsed.info;
              return tokenInfo.tokenAmount.uiAmount > 0;
            })
            .map(async (tokenAccount) => {
              const tokenInfo = (tokenAccount.account.data as any).parsed.info;
              const mint = tokenInfo.mint;
              const decimals = tokenInfo.tokenAmount.decimals;

              try {
                const [metadata, publicBalance, privateBalance] = await Promise.allSettled([
                  getTokenMetadata(mint),
                  checkPublicBalance(publicKey.toString(), mint),
                  checkPrivateBalance(publicKey.toString(), mint)
                ]);

                if (metadata.status === 'fulfilled' && metadata.value) {
                  const token = metadata.value;
                  return {
                    token: {
                      address: mint,
                      mint: mint,
                      symbol: token.symbol,
                      name: token.name,
                      decimals: decimals,
                      logoURI: token.logoURI
                    },
                    publicBalance: publicBalance.status === 'fulfilled' ? publicBalance.value : '0.000',
                    privateBalance: privateBalance.status === 'fulfilled' ? privateBalance.value : '0.000'
                  };
                }
              } catch (error) {
                console.error(`Error processing public token ${mint}:`, error);
              }
              return null;
            });

          const tokenResults = await Promise.allSettled(tokenPromises);

          tokenResults.forEach(result => {
            if (result.status === 'fulfilled' && result.value) {
              const { token, publicBalance, privateBalance } = result.value;
              tokens.push(token);
              publicBalances[token.address] = publicBalance;
              privateBalances[token.address] = privateBalance;
            }
          });
        }
      } catch (error) {
        console.error('Error fetching public tokens:', error);
      }

      try {
        const compressedTokenAccountsResult = await connection.getCompressedTokenAccountsByOwner(publicKey);

        if (compressedTokenAccountsResult.items.length > 0) {
          const uniqueMints = new Set<string>();
          const processedMints = new Set(tokens.map(token => token.address));
          
          const filteredAccounts = compressedTokenAccountsResult.items.filter(tokenAccount => {
            const amount = BigInt(tokenAccount.parsed.amount || 0);
            const mint = tokenAccount.parsed.mint.toString();

            if (amount > 0 && !processedMints.has(mint) && !uniqueMints.has(mint)) {
              uniqueMints.add(mint);
              return true;
            }
            return false;
          });

          const tokenPromises = filteredAccounts.map(async (tokenAccount) => {
            const mint = tokenAccount.parsed.mint.toString();

            try {
              const [metadata, publicBalance, privateBalance] = await Promise.allSettled([
                getTokenMetadata(mint),
                checkPublicBalance(publicKey.toString(), mint),
                checkPrivateBalance(publicKey.toString(), mint)
              ]);

              if (metadata.status === 'fulfilled' && metadata.value) {
                const token = metadata.value;
                const privBalance = privateBalance.status === 'fulfilled' ? privateBalance.value : '0.000';
                
                if (parseFloat(privBalance) > 0) {
                  return {
                    token: {
                      address: mint,
                      mint: mint,
                      symbol: token.symbol,
                      name: token.name,
                      decimals: token.decimals,
                      logoURI: token.logoURI
                    },
                    publicBalance: publicBalance.status === 'fulfilled' ? publicBalance.value : '0.000',
                    privateBalance: privBalance
                  };
                }
              }
            } catch (error) {
              console.error(`Error processing private token ${mint}:`, error);
            }
            return null;
          });

          const tokenResults = await Promise.allSettled(tokenPromises);

          tokenResults.forEach(result => {
            if (result.status === 'fulfilled' && result.value) {
              const { token, publicBalance, privateBalance } = result.value;
              tokens.push(token);
              publicBalances[token.address] = publicBalance;
              privateBalances[token.address] = privateBalance;
            }
          });
        }
      } catch (error) {
        console.error('Error fetching compressed tokens:', error);
      }

      sendTokenCache.set(cacheKey, {
        tokens,
        publicBalances,
        privateBalances,
        timestamp: Date.now()
      });

      setAvailableTokens(tokens);
      setPublicTokenBalances(publicBalances);
      setPrivateTokenBalances(privateBalances);
    } catch (error) {
      console.error('Error fetching available tokens:', error);
    } finally {
      setLoadingBalances(false);
    }
  }, [publicKey, connected, checkPrivateBalance, checkPublicBalance, getTokenMetadata]);

  useEffect(() => {
    if (publicKey && connected) {
      fetchAvailableTokens();
    }
  }, [publicKey, connected, fetchAvailableTokens]);

  useEffect(() => {
    if (publicKey) {
      const updateBalances = async () => {
        const newPrivateBalance = await checkPrivateBalance(publicKey.toString(), selectedToken.address);
        const newPublicBalance = await checkPublicBalance(publicKey.toString(), selectedToken.address);
        
        setPrivateTokenBalances(prev => ({
          ...prev,
          [selectedToken.address]: newPrivateBalance
        }));
        setPublicTokenBalances(prev => ({
          ...prev,
          [selectedToken.address]: newPublicBalance
        }));

        if (selectedToken.address === 'So11111111111111111111111111111111111111112') {
          setPrivateBalance(newPrivateBalance);
          setPublicBalance(newPublicBalance);
        }
      };
      updateBalances();
    }
  }, [publicKey, selectedToken, checkPrivateBalance, checkPublicBalance]);


  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0a0a0e] to-[#16151E] text-white">
      <NavBar />
      
      <div className="pt-24 pb-16 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Centered Title */}
        <div className="flex items-center justify-center mb-6">
          <h1 className="text-center text-2xl font-bold">
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-teal-300">
              Private Transfer
            </span>
          </h1>
        </div>
        
        {/* Subtitle */}
        <div className="text-center mb-8">
          <p className="text-white/70">
            Send tokens without revealing transaction details
          </p>
        </div>
        
        {/* Status and Error Messages */}
        {status && (
          <div className="mb-6 max-w-4xl mx-auto">
            <div className="bg-purple-900/20 border border-purple-500/30 text-white/90 px-4 py-3 rounded-lg">
              {status}
            </div>
          </div>
        )}
        
        {/* Progress Bar */}
        {transactionStep > 0 && (
          <div className="mb-6 max-w-4xl mx-auto">
            <div className="bg-zinc-800/40 backdrop-blur-sm border border-zinc-600/30 rounded-lg p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-white">
                  Send Progress
                </span>
                <span className="text-sm text-white">
                  {transactionStep}/3 steps
                </span>
              </div>
              <div className="w-full bg-zinc-700/50 rounded-full h-2">
                <div
                  className="bg-gradient-to-r from-purple-500 to-indigo-400 h-2 rounded-full transition-all duration-500"
                  style={{
                    width: `${(transactionStep / 3) * 100}%`
                  }}
                ></div>
              </div>
              <div className="flex justify-between mt-2 text-sm text-white">
                <span className={transactionStep >= 1 ? "text-purple-400" : ""}>Sign</span>
                <span className={transactionStep >= 2 ? "text-purple-400" : ""}>In Process</span>
                <span className={transactionStep >= 3 ? "text-purple-400" : ""}>Confirmed</span>
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="mb-6 max-w-4xl mx-auto">
            <div className="bg-red-900/20 border border-red-500/30 text-red-400 px-4 py-3 rounded-lg">
              {error}
            </div>
          </div>
        )}
        
        {/* Main Content */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-8 max-w-4xl mx-auto">
          {/* Send Private Payment Card */}
          <div className="bg-zinc-900/40 backdrop-blur-sm p-6 rounded-xl border border-zinc-800/50 md:col-span-3">
            <div className="flex flex-col items-center mb-6">
              <div className="bg-purple-900/60 p-3 rounded-lg mb-3">
                <SendIcon className="h-5 w-5 text-purple-400" />
              </div>
              <h2 className="text-lg font-semibold text-white">Send Private Payment</h2>
            </div>
            <p className="text-white/70 text-xs mb-6 text-center">
              Transfer funds with complete privacy protection
            </p>
            
            {/* Form */}
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-white/80 mb-2">
                  Recipient Address
                </label>
                <input
                  type="text"
                  placeholder="Enter Solana address"
                  className="w-full px-4 py-3 bg-zinc-800/50 border border-zinc-700/50 rounded-lg text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                  value={recipient}
                  onChange={(e) => setRecipient(e.target.value)}
                  disabled={loading}
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-white/80 mb-2">
                  Token
                </label>
                <div className="relative">
                  <button
                    className="w-full px-4 py-3 bg-[#131320] border border-zinc-800/70 rounded-lg text-white text-left flex items-center justify-between hover:bg-[#1a1a27] transition-colors"
                    onClick={() => setShowTokenDropdown(!showTokenDropdown)}
                    disabled={loading}
                  >
                    <span>{selectedToken.symbol}</span>
                    <ChevronDown className={`h-4 w-4 transition-transform ${showTokenDropdown ? 'rotate-180' : ''}`} />
                  </button>

                  {showTokenDropdown && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-[#131320] border border-zinc-800/70 rounded-lg shadow-lg z-50 max-h-48 overflow-y-auto">
                      {loadingBalances ? (
                        <div className="px-4 py-3 text-center text-white/60">
                          <Loader2 className="h-4 w-4 animate-spin mx-auto mb-1" />
                          <span className="text-xs">Loading balances...</span>
                        </div>
                      ) : (
                        availableTokens.map((token) => (
                          <button
                            key={token.address}
                            className="w-full px-4 py-3 text-left hover:bg-[#1a1a27] transition-colors text-white hover:text-white flex items-center justify-between"
                            onClick={() => {
                              setSelectedToken(token);
                              setShowTokenDropdown(false);
                            }}
                            disabled={loading}
                          >
                            <div>
                              <div className="font-medium">{token.symbol}</div>
                              <div className="text-xs text-white/60">{token.name}</div>
                            </div>
                            <div className="text-right text-xs">
                              <div className="text-white/60">
                                Pub: {publicTokenBalances[token.address] || "0.000"}
                              </div>
                              <div className="text-purple-400">
                                Prv: {privateTokenBalances[token.address] || "0.000"}
                              </div>
                            </div>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="block text-sm font-medium text-white/80">
                    Amount ({selectedToken.symbol})
                  </label>
                  <div className="text-xs text-white/60">
                    <div>Public: {publicTokenBalances[selectedToken.address] || '0.000'} {selectedToken.symbol}</div>
                    <div>Private: {privateTokenBalances[selectedToken.address] || '0.000'} {selectedToken.symbol}</div>
                  </div>
                </div>
                <div className="relative">
                  <input
                    type="number"
                    placeholder="0.0"
                    className="w-full px-4 py-3 bg-zinc-800/50 border border-zinc-700/50 rounded-lg text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    disabled={loading}
                  />
                  <button 
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-xs bg-zinc-700 hover:bg-zinc-600 px-2 py-1 rounded text-white/80"
                    onClick={() => {
                      const maxBalance = privateTokenBalances[selectedToken.address] || '0.000';
                      const maxBalanceNum = parseFloat(maxBalance);
                      
                      let bufferedAmount;
                      if (selectedToken.address === 'So11111111111111111111111111111111111111112') {
                        bufferedAmount = Math.max(0, maxBalanceNum - 0.02);
                      } else {
                        bufferedAmount = Math.max(0, maxBalanceNum - (1 / Math.pow(10, selectedToken.decimals)));
                      }
                      
                      setAmount(bufferedAmount.toFixed(selectedToken.decimals));
                    }}
                    disabled={loading}
                  >
                    MAX
                  </button>
                </div>
              </div>
              
              {/* Gasless Toggle */}
              <div className="flex items-center justify-between p-4 bg-zinc-800/30 rounded-lg border border-zinc-700/30">
                <div className="flex items-center">
                  <div className="mr-3">
                    <Eye className="h-4 w-4 text-purple-400" />
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-white/90">Gasless Transfer</h3>
                    <p className="text-xs text-white/70">Let us cover your transaction fees</p>
                  </div>
                </div>
                <button
                  type="button"
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                    isGasless ? 'bg-purple-600' : 'bg-zinc-700'
                  }`}
                  onClick={() => setIsGasless(!isGasless)}
                  disabled={loading}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      isGasless ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
              
              {/* Privacy Protection Info */}
              <div className="mt-4 p-4 bg-zinc-800/30 rounded-lg border border-zinc-700/30">
                <div className="flex items-center mb-2">
                  <Eye className="h-4 w-4 text-purple-400 mr-2" />
                  <h3 className="text-sm font-medium text-white/90">Privacy Protection</h3>
                </div>
                <p className="text-xs text-white/70 leading-relaxed">
                  Your transaction will be processed through our privacy protocol, 
                  hiding the amount and breaking the link between sender and 
                  receiver.
                </p>
              </div>
              
              {/* Send Button */}
              <button 
                className="w-full bg-gradient-to-r from-purple-500 to-indigo-400 hover:from-purple-600 hover:to-indigo-500 text-white font-medium py-3 px-4 rounded-lg flex items-center justify-center transition-all duration-300"
                onClick={handleTransfer}
                disabled={loading || !amount || !recipient || !publicKey}
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <SendIcon className="mr-2 h-4 w-4" />
                    Send Privately
                  </>
                )}
              </button>
            </div>
          </div>
          
          {/* How It Works Card */}
          <div className="bg-zinc-900/40 backdrop-blur-sm p-6 rounded-xl border border-zinc-800/50 md:col-span-2">
            <div className="flex flex-col items-center mb-6">
              <div className="bg-purple-900/60 p-3 rounded-lg mb-3">
                <Eye className="h-5 w-5 text-purple-400" />
              </div>
              <h2 className="text-lg font-semibold text-white">How It Works</h2>
            </div>
            <p className="text-white/70 text-xs mb-6 text-center">
              Understanding private transfers
            </p>
            
            {/* Steps */}
            <div className="space-y-6">
              <div className="flex">
                <div className="flex-shrink-0 h-7 w-7 rounded-full bg-purple-900/40 flex items-center justify-center text-xs font-medium text-purple-300 mr-3">
                  1
                </div>
                <div>
                  <p className="text-sm text-white/90 leading-relaxed">
                    Funds are sent through a zk private pool 
                  </p>
                </div>
              </div>
              
              <div className="flex">
                <div className="flex-shrink-0 h-7 w-7 rounded-full bg-purple-900/40 flex items-center justify-center text-xs font-medium text-purple-300 mr-3">
                  2
                </div>
                <div>
                  <p className="text-sm text-white/90 leading-relaxed">
                     Funds are sent to the recipient's 'Private Balance', allowing them to withdraw their funds at their convenience.
                  </p>
                </div>
              </div>
              
              <div className="flex">
                <div className="flex-shrink-0 h-7 w-7 rounded-full bg-purple-900/40 flex items-center justify-center text-xs font-medium text-purple-300 mr-3">
                  3
                </div>
                <div>
                  <p className="text-sm text-white/90 leading-relaxed">
                    This adds another layer of security-  the recipient can choose to wait to withdraw or only withdraw part of their private balance. 
                  </p>
                </div>
              </div>
              
              <div className="flex">
                <div className="flex-shrink-0 h-7 w-7 rounded-full bg-purple-900/40 flex items-center justify-center text-xs font-medium text-purple-300 mr-3">
                  4
                </div>
                <div>
                  <p className="text-sm text-white/90 leading-relaxed">
                    No on-chain link between sender and recipient can be established, safeguarding the privacy of both parties
                  </p>
                </div>
              </div>
            </div>
            
            {/* No View Recent Transfers Button as requested */}
          </div>
        </div>
      </div>
    </div>
  );
}
