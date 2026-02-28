"use client";

import React, { useState, useCallback, useEffect, useRef, useMemo } from "react";
import Link from "next/link";
import { ArrowLeft, Shield, ChevronDown, ChevronUp, Lock, Eye, Loader2 } from "lucide-react";
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
import { getAssociatedTokenAddress, createAssociatedTokenAccountInstruction, createTransferInstruction, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { searchTokensFromJupiter, Token as JupiterToken } from '../vault/jupiterApi';
import bs58 from 'bs58';

const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL;

const shieldBalanceCache = new Map<string, { balance: string; timestamp: number }>();
const shieldTokenCache = new Map<string, { tokens: Token[]; timestamp: number }>();

const unshieldBalanceCache = new Map<string, { balance: string; timestamp: number }>();
const unshieldTokenCache = new Map<string, { tokens: Token[]; timestamp: number }>();

const tokenMetadataCache = new Map<string, { token: JupiterToken | null; timestamp: number }>();

const SHIELD_BALANCE_CACHE_TTL = 60000; // 1 minute for balances
const SHIELD_TOKEN_CACHE_TTL = 600000; // 10 minutes for token list
const UNSHIELD_BALANCE_CACHE_TTL = 60000; // 1 minute for private balances
const UNSHIELD_TOKEN_CACHE_TTL = 600000; // 10 minutes for private token list
const TOKEN_METADATA_CACHE_TTL = 600000;

interface Token {
  address: string;
  mint: string;
  symbol: string;
  name: string;
  decimals: number;
  logoURI?: string;
}

export default function Vault2Page() {
  const { publicKey, connected, sendTransaction } = useWallet();
  const [activeTab, setActiveTab] = useState("shield");
  const [showInstructions, setShowInstructions] = useState(false);
  const [shieldAmount, setShieldAmount] = useState("");
  const [unshieldAmount, setUnshieldAmount] = useState("");
  const [showTokenDropdown, setShowTokenDropdown] = useState(false);
  const [isGasless, setIsGasless] = useState(false);

  const [shieldLoading, setShieldLoading] = useState(false);
  const [shieldStatus, setShieldStatus] = useState('');
  const [shieldError, setShieldError] = useState('');
  const [transactionStep, setTransactionStep] = useState(0);
  const FEE_RECIPIENT = new PublicKey("J9DYC1986DWakvDbns1yLtdnvKm7krWbuvKQmutz7i4K");
  const MIN_FEE_LAMPORTS = 10000;

  const [shieldTokens, setShieldTokens] = useState<Token[]>([]);
  const [shieldBalances, setShieldBalances] = useState<Record<string, string>>({});
  const [loadingShieldBalances, setLoadingShieldBalances] = useState(false);

  const [unshieldTokens, setUnshieldTokens] = useState<Token[]>([]);
  const [unshieldBalances, setUnshieldBalances] = useState<Record<string, string>>({});
  const [loadingUnshieldBalances, setLoadingUnshieldBalances] = useState(false);

  const [selectedToken, setSelectedToken] = useState<Token>({
    symbol: 'SOL',
    name: 'Solana',
    address: 'So11111111111111111111111111111111111111112',
    mint: 'So11111111111111111111111111111111111111112',
    decimals: 9
  });


  const getTokenMetadata = useCallback(async (tokenMint: string): Promise<JupiterToken | null> => {
    const cacheKey = `shield_token_${tokenMint}`;
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

  const checkShieldBalance = useCallback(async (address: string, tokenMint?: string): Promise<string> => {
    if (!address) return "0.0000";

    const cacheKey = `shield_balance_${address}_${tokenMint || 'SOL'}`;
    const cached = shieldBalanceCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < SHIELD_BALANCE_CACHE_TTL) {
      return cached.balance;
    }

    try {
      const connection = await createRpc(RPC_URL);
      let result = "0.0000";

      if (!tokenMint || tokenMint === 'So11111111111111111111111111111111111111112') {
        const balance = await connection.getBalance(new PublicKey(address));
        result = (balance / 1e9).toFixed(4);
      } else {
        const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
          new PublicKey(address),
          { mint: new PublicKey(tokenMint) }
        );

        if (tokenAccounts.value.length > 0) {
          const account = tokenAccounts.value.reduce((prev, curr) => {
            const prevAmount = (prev.account.data as any).parsed.info.tokenAmount.uiAmount || 0;
            const currAmount = (curr.account.data as any).parsed.info.tokenAmount.uiAmount || 0;
            return prevAmount > currAmount ? prev : curr;
          });

          const balance = (account.account.data as any).parsed.info.tokenAmount.uiAmount || 0;
          result = balance.toFixed(4);
        }
      }

      shieldBalanceCache.set(cacheKey, { balance: result, timestamp: Date.now() });
      return result;
    } catch (error) {
      console.error('Error checking shield balance:', error);
      return "0.0000";
    }
  }, []);

  const checkUnshieldBalance = useCallback(async (address: string, tokenMint?: string): Promise<string> => {
    if (!address) return "0.000";

    const cacheKey = `unshield_balance_${address}_${tokenMint || 'SOL'}`;
    const cached = unshieldBalanceCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < UNSHIELD_BALANCE_CACHE_TTL) {
      return cached.balance;
    }

    try {
      const connection = await createRpc(RPC_URL);
      let result = "0.000";

      if (!tokenMint || tokenMint === 'So11111111111111111111111111111111111111112') {
        const compressedAccounts = await connection.getCompressedAccountsByOwner(new PublicKey(address));
        const totalLamports = compressedAccounts.items.reduce((sum, account) =>
          BigInt(sum) + BigInt(account.lamports || 0), BigInt(0));
        const solBalance = Number(totalLamports) / 1e9;
        result = (Math.floor(solBalance * 1000) / 1000).toFixed(3);
      } else {
        const compressedTokenAccounts = await connection.getCompressedTokenAccountsByOwner(
          new PublicKey(address),
          { mint: new PublicKey(tokenMint) }
        );

        if (compressedTokenAccounts.items.length > 0) {
          const totalAmount = compressedTokenAccounts.items.reduce((sum, account) =>
            BigInt(sum) + BigInt(account.parsed.amount || 0), BigInt(0));

          const tokenMetadata = await getTokenMetadata(tokenMint);
          const decimals = tokenMetadata?.decimals || 9;
          const tokenBalance = Number(totalAmount) / Math.pow(10, decimals);
          result = (Math.floor(tokenBalance * 1000) / 1000).toFixed(3);
        }
      }

      unshieldBalanceCache.set(cacheKey, { balance: result, timestamp: Date.now() });
      return result;
    } catch (error) {
      console.error('Error checking unshield balance:', error);
      return "0.000";
    }
  }, [getTokenMetadata]);

  const fetchShieldTokens = useCallback(async (forceRefresh = false) => {
    if (!publicKey || !connected) return;

    const cacheKey = `shield_tokens_${publicKey.toString()}`;
    const cached = shieldTokenCache.get(cacheKey);
    if (!forceRefresh && cached && Date.now() - cached.timestamp < SHIELD_TOKEN_CACHE_TTL) {
      setShieldTokens(cached.tokens);
      return;
    }

    try {
      setLoadingShieldBalances(true);
      const connection = await createRpc(RPC_URL);

      const [solBalance, tokenAccountsResult] = await Promise.allSettled([
        checkShieldBalance(publicKey.toString()),
        connection.getParsedTokenAccountsByOwner(
          publicKey,
          { programId: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA') }
        )
      ]);

      const tokens: Token[] = [];
      const balances: Record<string, string> = {};

      if (solBalance.status === 'fulfilled' && parseFloat(solBalance.value) >= 0.003) {
        tokens.push({
          address: 'So11111111111111111111111111111111111111112',
          mint: 'So11111111111111111111111111111111111111112',
          symbol: 'SOL',
          name: 'Solana',
          decimals: 9
        });
        balances['So11111111111111111111111111111111111111112'] = solBalance.value;
      }

      if (tokenAccountsResult.status === 'fulfilled') {
        const tokenAccounts = tokenAccountsResult.value;

        const tokenPromises = tokenAccounts.value
          .filter(tokenAccount => {
            const tokenInfo = (tokenAccount.account.data as any).parsed.info;
            return tokenInfo.tokenAmount.uiAmount >= 0.003;
          })
          .map(async (tokenAccount) => {
            const tokenInfo = (tokenAccount.account.data as any).parsed.info;
            const mint = tokenInfo.mint;
            const balance = tokenInfo.tokenAmount.uiAmount || 0;
            const decimals = tokenInfo.tokenAmount.decimals;

            const [metadata, tokenBalance] = await Promise.allSettled([
              getTokenMetadata(mint),
              checkShieldBalance(publicKey.toString(), mint)
            ]);

            if (metadata.status === 'fulfilled' && tokenBalance.status === 'fulfilled') {
              const token = metadata.value;
              if (token && parseFloat(tokenBalance.value) >= 0.003) {
                return {
                  token: {
                    address: mint,
                    mint: mint,
                    symbol: token.symbol,
                    name: token.name,
                    decimals: decimals,
                    logoURI: token.logoURI
                  },
                  balance: tokenBalance.value
                };
              }
            }
            return null;
          });

        const tokenResults = await Promise.allSettled(tokenPromises);

        tokenResults.forEach(result => {
          if (result.status === 'fulfilled' && result.value) {
            tokens.push(result.value.token);
            balances[result.value.token.address] = result.value.balance;
          }
        });
      }

      shieldTokenCache.set(cacheKey, { tokens, timestamp: Date.now() });
      setShieldTokens(tokens);
      setShieldBalances(balances);
    } catch (error) {
      console.error('Error fetching shield tokens:', error);
    } finally {
      setLoadingShieldBalances(false);
    }
  }, [publicKey, connected, checkShieldBalance, getTokenMetadata]);

  const fetchUnshieldTokens = useCallback(async (forceRefresh = false) => {
    if (!publicKey || !connected) return;

    const cacheKey = `unshield_tokens_${publicKey.toString()}`;
    const cached = unshieldTokenCache.get(cacheKey);
    if (!forceRefresh && cached && Date.now() - cached.timestamp < UNSHIELD_TOKEN_CACHE_TTL) {
      setUnshieldTokens(cached.tokens);
      return;
    }

    try {
      setLoadingUnshieldBalances(true);
      const connection = await createRpc(RPC_URL);

      const [solBalance, compressedTokenAccountsResult] = await Promise.allSettled([
        checkUnshieldBalance(publicKey.toString()),
        connection.getCompressedTokenAccountsByOwner(publicKey)
      ]);

      const tokens: Token[] = [];
      const balances: Record<string, string> = {};

      if (solBalance.status === 'fulfilled' && parseFloat(solBalance.value) >= 0.003) {
        tokens.push({
          address: 'So11111111111111111111111111111111111111112',
          mint: 'So11111111111111111111111111111111111111112',
          symbol: 'SOL',
          name: 'Solana',
          decimals: 9
        });
        balances['So11111111111111111111111111111111111111112'] = solBalance.value;
      }

      if (compressedTokenAccountsResult.status === 'fulfilled') {
        const compressedTokenAccounts = compressedTokenAccountsResult.value;

        const uniqueMints = new Set<string>();
        const filteredAccounts = compressedTokenAccounts.items.filter(tokenAccount => {
          const amount = BigInt(tokenAccount.parsed.amount || 0);
          const mint = tokenAccount.parsed.mint.toString();

          if (amount > 0 && !uniqueMints.has(mint)) {
            uniqueMints.add(mint);
            return true;
          }
          return false;
        });

        const tokenPromises = filteredAccounts.map(async (tokenAccount) => {
          const mint = tokenAccount.parsed.mint.toString();

          const [metadata, tokenBalance] = await Promise.allSettled([
            getTokenMetadata(mint),
            checkUnshieldBalance(publicKey.toString(), mint)
          ]);

          if (metadata.status === 'fulfilled' && tokenBalance.status === 'fulfilled') {
            const token = metadata.value;
            if (token && parseFloat(tokenBalance.value) >= 0.003) {
              return {
                token: {
                  address: mint,
                  mint: mint,
                  symbol: token.symbol,
                  name: token.name,
                  decimals: token.decimals,
                  logoURI: token.logoURI
                },
                balance: tokenBalance.value
              };
            }
          }
          return null;
        });

        const tokenResults = await Promise.allSettled(tokenPromises);

        tokenResults.forEach(result => {
          if (result.status === 'fulfilled' && result.value) {
            tokens.push(result.value.token);
            balances[result.value.token.address] = result.value.balance;
          }
        });
      }

      unshieldTokenCache.set(cacheKey, { tokens, timestamp: Date.now() });
      setUnshieldTokens(tokens);
      setUnshieldBalances(balances);
    } catch (error) {
      console.error('Error fetching unshield tokens:', error);
    } finally {
      setLoadingUnshieldBalances(false);
    }
  }, [publicKey, connected, checkUnshieldBalance, getTokenMetadata]);

  useEffect(() => {
    if (activeTab === "shield" && publicKey && connected) {
      fetchShieldTokens();
    }
  }, [activeTab, publicKey, connected, fetchShieldTokens]);

  useEffect(() => {
    if (activeTab === "unshield" && publicKey && connected) {
      fetchUnshieldTokens();
    }
  }, [activeTab, publicKey, connected, fetchUnshieldTokens]);

  useEffect(() => {
    if (publicKey && connected && activeTab === "shield") {
      fetchShieldTokens(true);
    }
  }, [publicKey, connected, fetchShieldTokens, activeTab]);

  useEffect(() => {
    if (publicKey && connected && activeTab === "unshield") {
      fetchUnshieldTokens(true);
    }
  }, [publicKey, connected, fetchUnshieldTokens, activeTab]);

  const handleShield = useCallback(async () => {
    if (!connected || !publicKey || !sendTransaction) {
      setShieldError('Please connect your wallet');
      return;
    }

    if (!shieldAmount || parseFloat(shieldAmount) <= 0) {
      setShieldError('Please enter a valid amount');
      return;
    }

    setShieldLoading(true);
    setShieldError('');
    setShieldStatus('Initializing shield...');
    setTransactionStep(0);

    const amountInSol = selectedToken.address === 'So11111111111111111111111111111111111111112' 
      ? parseFloat(shieldAmount)
      : parseFloat(shieldAmount); // For tokens, we'll track the raw amount for now
    
    try {
      await fetch('/api/analytics/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operation: 'shield',
          amount_sol: amountInSol,
          token_symbol: selectedToken.symbol
        })
      });
    } catch (error) {
      console.error('Failed to track shield transaction:', error);
    }

    try {
      const connection = await createRpc(RPC_URL);

      if (selectedToken.address === 'So11111111111111111111111111111111111111112') {
        const lamportsAmount = parseFloat(shieldAmount) * 1e9;

        const feeAmount = Math.max(
          Math.floor(lamportsAmount * 0.01),
          MIN_FEE_LAMPORTS
        );
        const netAmount = lamportsAmount - feeAmount;

        const instructions = [
          ComputeBudgetProgram.setComputeUnitLimit({ units: 1_000_000 }),
          SystemProgram.transfer({
            fromPubkey: publicKey,
            toPubkey: FEE_RECIPIENT,
            lamports: feeAmount,
          }),
          await LightSystemProgram.compress({
            payer: publicKey,
            toAddress: publicKey,
            lamports: netAmount,
            outputStateTree: defaultTestStateTreeAccounts().merkleTree,
          })
        ];

        const { context: { slot: minContextSlot }, value: blockhashCtx } =
          await connection.getLatestBlockhashAndContext();

        const messageV0 = new TransactionMessage({
          payerKey: publicKey,
          recentBlockhash: blockhashCtx.blockhash,
          instructions,
        }).compileToV0Message();

        const transaction = new VersionedTransaction(messageV0);

        setShieldStatus('Sending shield transaction...');
        setTransactionStep(1);
        const signature = await sendTransaction(transaction, connection, {
          minContextSlot,
        });

        setShieldStatus('Confirming transaction...');
        setTransactionStep(2);
        await connection.confirmTransaction({
          signature,
          blockhash: blockhashCtx.blockhash,
          lastValidBlockHeight: blockhashCtx.lastValidBlockHeight,
        });

        setShieldStatus(`✅ Successfully shielded ${(netAmount / 1e9).toFixed(4)} SOL (Fee: ${(feeAmount / 1e9).toFixed(4)} SOL)!`);
        setTransactionStep(3);
      } else {
        const tokenAmount = parseFloat(shieldAmount);
        const amount = BigInt(Math.floor(tokenAmount * Math.pow(10, selectedToken.decimals)));
        const mint = new PublicKey(selectedToken.address);

        setShieldStatus('Checking token pool...');
        const tokenPoolPda = CompressedTokenProgram.deriveTokenPoolPda(mint);
        const tokenPoolInfo = await connection.getAccountInfo(tokenPoolPda);

        if (!tokenPoolInfo) {
          setShieldStatus('Creating token pool...');
          const createTokenPoolInstruction = await CompressedTokenProgram.createTokenPool({
            feePayer: publicKey,
            mint: mint,
          });

          const tokenPoolInstructions = [
            ComputeBudgetProgram.setComputeUnitLimit({ units: 1_000_000 }),
            createTokenPoolInstruction
          ];

          const { context: { slot: minContextSlot }, value: blockhashCtx } =
            await connection.getLatestBlockhashAndContext();

          const tokenPoolMessageV0 = new TransactionMessage({
            payerKey: publicKey,
            recentBlockhash: blockhashCtx.blockhash,
            instructions: tokenPoolInstructions,
          }).compileToV0Message();

          const tokenPoolTransaction = new VersionedTransaction(tokenPoolMessageV0);

          setShieldStatus('Sending token pool creation transaction...');
          const tokenPoolSignature = await sendTransaction(tokenPoolTransaction, connection, {
            minContextSlot,
          });

          setShieldStatus('Confirming token pool creation...');
          await connection.confirmTransaction({
            signature: tokenPoolSignature,
            blockhash: blockhashCtx.blockhash,
            lastValidBlockHeight: blockhashCtx.lastValidBlockHeight,
          });

          setShieldStatus('Token pool created successfully!');
        }

        setShieldStatus('Getting source token account...');
        const sourceTokenAccount = await getAssociatedTokenAddress(mint, publicKey);

        setShieldStatus('Checking if token account exists...');
        const accountInfo = await connection.getAccountInfo(sourceTokenAccount);

        if (!accountInfo) {
          setShieldStatus('Creating associated token account...');
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

          setShieldStatus('Sending ATA creation transaction...');
          const ataSignature = await sendTransaction(ataTransaction, connection, {
            minContextSlot,
          });

          setShieldStatus('Confirming ATA creation...');
          await connection.confirmTransaction({
            signature: ataSignature,
            blockhash: blockhashCtx.blockhash,
            lastValidBlockHeight: blockhashCtx.lastValidBlockHeight,
          });

          setShieldStatus('ATA created successfully! Proceeding with shield...');
        }

        setShieldStatus('Calculating fee...');
        const feeAmount = Math.max(
          Math.floor(Number(amount) * 0.01),
          Math.floor(MIN_FEE_LAMPORTS * Math.pow(10, selectedToken.decimals) / 1e9)
        );
        const netAmount = amount - BigInt(feeAmount);

        setShieldStatus('Creating compress instruction...');
        const compressInstruction = await CompressedTokenProgram.compress({
          payer: publicKey,
          owner: publicKey,
          source: sourceTokenAccount,
          toAddress: publicKey,
          mint: mint,
          amount: netAmount,
          outputStateTree: defaultTestStateTreeAccounts().merkleTree,
        });

        setShieldStatus('Creating fee transfer instruction...');
        const feeRecipientTokenAccount = await getAssociatedTokenAddress(mint, FEE_RECIPIENT);
        const feeTransferInstruction = createTransferInstruction(
          sourceTokenAccount,
          feeRecipientTokenAccount,
          publicKey,
          BigInt(feeAmount),
          [],
          TOKEN_PROGRAM_ID
        );

        const instructions = [
          ComputeBudgetProgram.setComputeUnitLimit({ units: 1_000_000 }),
          feeTransferInstruction,
          compressInstruction
        ];

        const { context: { slot: minContextSlot }, value: blockhashCtx } =
          await connection.getLatestBlockhashAndContext();

        const messageV0 = new TransactionMessage({
          payerKey: publicKey,
          recentBlockhash: blockhashCtx.blockhash,
          instructions,
        }).compileToV0Message();

        const transaction = new VersionedTransaction(messageV0);

        setShieldStatus('Sending shield transaction...');
        setTransactionStep(1);
        const signature = await sendTransaction(transaction, connection, {
          minContextSlot,
        });

        setShieldStatus('Confirming transaction...');
        setTransactionStep(2);
        await connection.confirmTransaction({
          signature,
          blockhash: blockhashCtx.blockhash,
          lastValidBlockHeight: blockhashCtx.lastValidBlockHeight,
        });

        setShieldStatus(`✅ Successfully shielded ${(Number(netAmount) / Math.pow(10, selectedToken.decimals)).toFixed(4)} ${selectedToken.symbol} (Fee: ${(feeAmount / Math.pow(10, selectedToken.decimals)).toFixed(4)} ${selectedToken.symbol})!`);
        setTransactionStep(3);
      }

      await new Promise(resolve => setTimeout(resolve, 2000));

      setShieldStatus('Refreshing balances...');

      shieldBalanceCache.clear();
      unshieldBalanceCache.clear();

      await Promise.all([
        fetchShieldTokens(true),
        fetchUnshieldTokens(true)
      ]);

      setShieldStatus('✅ Shield completed successfully!');
      setShieldAmount('');

    } catch (error) {
      console.error('Shield error:', error);
      setShieldError(error instanceof Error ? error.message : 'Shield transaction failed');
      setShieldStatus('');
      setTransactionStep(0);
    } finally {
      setShieldLoading(false);
    }
  }, [publicKey, connected, selectedToken, shieldAmount, fetchShieldTokens, fetchUnshieldTokens, sendTransaction]);

  useEffect(() => {
    setTransactionStep(0);
    setShieldError('');
    setShieldStatus('');
  }, [activeTab]);

  const handleUnshield = useCallback(async () => {
    if (!connected || !publicKey || !sendTransaction) {
      setShieldError('Please connect your wallet');
      return;
    }

    if (!unshieldAmount || parseFloat(unshieldAmount) <= 0) {
      setShieldError('Please enter a valid amount');
      return;
    }

    setShieldLoading(true);
    setShieldError('');
    setShieldStatus('Initializing unshield...');
    setTransactionStep(0);

    const amountInSol = selectedToken.address === 'So11111111111111111111111111111111111111112'
      ? parseFloat(unshieldAmount)
      : parseFloat(unshieldAmount); // For tokens, we'll track the raw amount for now
    
    try {
      await fetch('/api/analytics/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operation: 'unshield',
          amount_sol: amountInSol,
          token_symbol: selectedToken.symbol
        })
      });
    } catch (error) {
      console.error('Failed to track unshield transaction:', error);
    }

    try {
      const connection = await createRpc(RPC_URL);

      if (selectedToken.address === 'So11111111111111111111111111111111111111112') {
        const lamportsAmount = parseFloat(unshieldAmount) * 1e9;

        const feeAmount = Math.max(
          Math.floor(lamportsAmount * (isGasless ? 0.02 : 0.01)),
          MIN_FEE_LAMPORTS
        );

        setShieldStatus('Getting compressed accounts...');
        const accounts = await connection.getCompressedAccountsByOwner(publicKey);

        const [selectedAccounts] = selectMinCompressedSolAccountsForTransfer(
          accounts.items,
          lamportsAmount
        );

        setShieldStatus('Getting validity proof...');
        const proof = await connection.getValidityProof(
          selectedAccounts.map(acc => acc.hash)  // use the raw hash of each account
        );


        setShieldStatus('Creating unshield transaction...');
        const unshieldInstruction = await LightSystemProgram.decompress({
          payer: publicKey,
          toAddress: publicKey,
          lamports: lamportsAmount,
          inputCompressedAccounts: selectedAccounts,
          recentValidityProof: proof.compressedProof,
          recentInputStateRootIndices: proof.rootIndices,
        });

        const instructions = [
          ComputeBudgetProgram.setComputeUnitLimit({ units: 1_000_000 }),
          unshieldInstruction,
          SystemProgram.transfer({
            fromPubkey: publicKey,
            toPubkey: FEE_RECIPIENT,
            lamports: feeAmount,
          })
        ];

        if (isGasless) {
          setShieldStatus('Getting fee payer signature...');
          const { context: { slot: minContextSlot }, value: blockhashCtx } =
            await connection.getLatestBlockhashAndContext();

          const response = await fetch('/api/gasless-unshield', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              blockhash: blockhashCtx.blockhash,
              instructions: instructions.map(inst => ({
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
          const transaction = VersionedTransaction.deserialize(bs58.decode(serializedTx));

          setShieldStatus('Signing gasless transaction...');
          setTransactionStep(1);
          const signature = await sendTransaction(transaction, connection, {
            minContextSlot,
            skipPreflight: true,
          });

          setShieldStatus('Confirming gasless transaction...');
          setTransactionStep(2);
          await connection.confirmTransaction({
            signature,
            blockhash: blockhashCtx.blockhash,
            lastValidBlockHeight: blockhashCtx.lastValidBlockHeight,
          });
        } else {
          const { context: { slot: minContextSlot }, value: blockhashCtx } =
            await connection.getLatestBlockhashAndContext();

          const messageV0 = new TransactionMessage({
            payerKey: publicKey,
            recentBlockhash: blockhashCtx.blockhash,
            instructions,
          }).compileToV0Message();

          const transaction = new VersionedTransaction(messageV0);

          setShieldStatus('Sending unshield transaction...');
          setTransactionStep(1);
          const signature = await sendTransaction(transaction, connection, {
            minContextSlot,
          });

          setShieldStatus('Confirming transaction...');
          setTransactionStep(2);
          await connection.confirmTransaction({
            signature,
            ...blockhashCtx
          });
        }

        setShieldStatus(`✅ Successfully unshielded ${(lamportsAmount - feeAmount) / 1e9} SOL (Fee: ${feeAmount / 1e9} SOL)!`);
        setTransactionStep(3);
      } else {
        const tokenAmount = parseFloat(unshieldAmount);
        const amount = BigInt(Math.floor(tokenAmount * Math.pow(10, selectedToken.decimals)));
        const mint = new PublicKey(selectedToken.address);

        setShieldStatus('Calculating fee...');
        const feeAmount = Math.max(
          Math.floor(Number(amount) * 0.01),
          Math.floor(MIN_FEE_LAMPORTS * Math.pow(10, selectedToken.decimals) / 1e9)
        );
        const netAmount = amount - BigInt(feeAmount);

        setShieldStatus('Getting compressed token accounts...');
        const compressedTokenAccounts = await connection.getCompressedTokenAccountsByOwner(publicKey, {
          mint: mint
        });

        if (!compressedTokenAccounts.items.length) {
          throw new Error('No compressed token accounts found');
        }

        const [selectedAccounts, _] = selectMinCompressedTokenAccountsForTransfer(
          compressedTokenAccounts.items,
          bn(amount.toString())
        );

        setShieldStatus('Getting validity proof...');
        const { compressedProof: recentValidityProof, rootIndices: recentInputStateRootIndices } =
          await connection.getValidityProof(selectedAccounts.map(account => bn(account.compressedAccount.hash)));

        setShieldStatus('Getting destination token account...');
        const destinationTokenAccount = await getAssociatedTokenAddress(mint, publicKey);

        const accountInfo = await connection.getAccountInfo(destinationTokenAccount);
        const instructions = [ComputeBudgetProgram.setComputeUnitLimit({ units: 1_000_000 })];

        if (!accountInfo) {
          setShieldStatus('Creating destination token account...');
          const createATAInstruction = createAssociatedTokenAccountInstruction(
            publicKey, // payer
            destinationTokenAccount, // associatedToken
            publicKey, // owner
            mint, // mint
            TOKEN_PROGRAM_ID,
            ASSOCIATED_TOKEN_PROGRAM_ID
          );
          instructions.push(createATAInstruction);
        }

        setShieldStatus('Creating decompress instruction...');
        const decompressInstruction = await CompressedTokenProgram.decompress({
          payer: publicKey,
          inputCompressedTokenAccounts: selectedAccounts,
          toAddress: destinationTokenAccount,
          amount: bn(netAmount.toString()),
          recentInputStateRootIndices,
          recentValidityProof,
          outputStateTree: defaultTestStateTreeAccounts().merkleTree,
        });

        setShieldStatus('Creating fee transfer instruction...');
        const feeRecipientTokenAccount = await getAssociatedTokenAddress(mint, FEE_RECIPIENT);
        const feeTransferInstruction = createTransferInstruction(
          destinationTokenAccount,
          feeRecipientTokenAccount,
          publicKey,
          BigInt(feeAmount),
          [],
          TOKEN_PROGRAM_ID
        );

        instructions.push(decompressInstruction);
        instructions.push(feeTransferInstruction);

        if (isGasless) {
          setShieldStatus('Getting fee payer signature...');
          const { context: { slot: minContextSlot }, value: blockhashCtx } =
            await connection.getLatestBlockhashAndContext();

          const response = await fetch('/api/gasless-unshield', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              blockhash: blockhashCtx.blockhash,
              instructions: instructions.map(inst => ({
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
          const transaction = VersionedTransaction.deserialize(bs58.decode(serializedTx));

          setShieldStatus('Signing gasless transaction...');
          setTransactionStep(1);
          const signature = await sendTransaction(transaction, connection, {
            minContextSlot,
            skipPreflight: true,
          });

          setShieldStatus('Confirming gasless transaction...');
          setTransactionStep(2);
          await connection.confirmTransaction({
            signature,
            blockhash: blockhashCtx.blockhash,
            lastValidBlockHeight: blockhashCtx.lastValidBlockHeight,
          });
        } else {
          const { context: { slot: minContextSlot }, value: blockhashCtx } =
            await connection.getLatestBlockhashAndContext();

          const messageV0 = new TransactionMessage({
            payerKey: publicKey,
            recentBlockhash: blockhashCtx.blockhash,
            instructions,
          }).compileToV0Message();

          const transaction = new VersionedTransaction(messageV0);

          setShieldStatus('Sending unshield transaction...');
          setTransactionStep(1);
          const signature = await sendTransaction(transaction, connection, {
            minContextSlot,
          });

          setShieldStatus('Confirming transaction...');
          setTransactionStep(2);
          await connection.confirmTransaction({
            signature,
            blockhash: blockhashCtx.blockhash,
            lastValidBlockHeight: blockhashCtx.lastValidBlockHeight,
          });
        }

        setShieldStatus(`✅ Successfully unshielded ${(Number(netAmount) / Math.pow(10, selectedToken.decimals)).toFixed(4)} ${selectedToken.symbol} (Fee: ${(feeAmount / Math.pow(10, selectedToken.decimals)).toFixed(4)} ${selectedToken.symbol})!`);
        setTransactionStep(3);
      }

      await new Promise(resolve => setTimeout(resolve, 2000));

      setShieldStatus('Refreshing balances...');

      shieldBalanceCache.clear();
      unshieldBalanceCache.clear();

      await Promise.all([
        fetchShieldTokens(true),
        fetchUnshieldTokens(true)
      ]);

      setShieldStatus('✅ Unshield completed successfully!');
      setUnshieldAmount(''); // Clear the input

    } catch (error) {
      console.error('Unshield error:', error);
      setShieldError(error instanceof Error ? error.message : 'Unshield transaction failed');
      setShieldStatus('');
      setTransactionStep(0);
    } finally {
      setShieldLoading(false);
    }
  }, [publicKey, connected, selectedToken, unshieldAmount, fetchShieldTokens, fetchUnshieldTokens, sendTransaction, isGasless]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0a0a0e] to-[#16151E] text-white">
      <NavBar />

      <div className="pt-24 pb-16 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Back button and Title */}
        <div className="flex items-center justify-center mb-6 relative">

          <div className="text-center">
            <h1 className="text-2xl font-bold">
              <span className="bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-teal-300">
                Privacy Vault
              </span>
            </h1>
            <p className="text-white text-sm mt-1">
              Shield your assets from blockchain surveillance
            </p>
          </div>
        </div>

        {/* Main Content with Instructions to the side */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-4xl mx-auto mt-8">
          {/* Main Content - 2 columns */}
          <div className="md:col-span-2">
            {/* Tabs */}
            <div className="bg-[#131320] backdrop-blur-sm rounded-lg border border-zinc-800/50 mb-6 overflow-hidden">
              <div className="flex">
                <button
                  className={`flex-1 py-3 text-center ${
                    activeTab === "shield"
                      ? "bg-[#1E1E2D] text-white"
                      : "text-white hover:text-white hover:bg-[#1E1E2D]/50"
                  }`}
                  onClick={() => setActiveTab("shield")}
                >
                  Shield Assets
                </button>
                <button
                  className={`flex-1 py-3 text-center ${
                    activeTab === "unshield"
                      ? "bg-[#1E1E2D] text-white"
                      : "text-white hover:text-white hover:bg-[#1E1E2D]/50"
                  }`}
                  onClick={() => setActiveTab("unshield")}
                >
                  Unshield Assets
                </button>
              </div>
            </div>

            {/* Progress Bar - aligned with tabs */}
            {transactionStep > 0 && (
              <div className="mb-4">
                <div className="bg-zinc-800/40 backdrop-blur-sm border border-zinc-600/30 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-white">
                      {activeTab === "shield" ? "Shield Progress" : "Unshield Progress"}
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

            {/* Shield Assets Content */}
            {activeTab === "shield" && (
              <div className="bg-[#1E1E2D] backdrop-blur-sm p-6 rounded-xl border border-zinc-800/50">
                <div className="flex items-start mb-6">
                  <div className="bg-purple-900/60 p-3 rounded-lg mr-4">
                    <Shield className="h-5 w-5 text-purple-400" />
                  </div>
                  <div>
                    <h2 className="text-xl font-semibold text-white">Shield Assets</h2>
                    <p className="text-white text-sm">
                      Move assets into your private vault for enhanced privacy
                    </p>
                  </div>
                </div>

                {/* Form */}
                <div className="space-y-6 mt-6">
                  <div>
                    <label className="block text-sm font-medium text-white mb-2">
                      Token
                    </label>
                    <div className="relative">
                      <button
                        className="w-full px-4 py-3 bg-[#131320] border border-zinc-800/70 rounded-lg text-white text-left flex items-center justify-between hover:bg-[#1a1a27] transition-colors"
                        onClick={() => setShowTokenDropdown(!showTokenDropdown)}
                      >
                        <span>{selectedToken.symbol}</span>
                        <ChevronDown className={`h-4 w-4 transition-transform ${showTokenDropdown ? 'rotate-180' : ''}`} />
                      </button>

                      {showTokenDropdown && (
                        <div className="absolute top-full left-0 right-0 mt-1 bg-[#131320] border border-zinc-800/70 rounded-lg shadow-lg z-10 max-h-48 overflow-y-auto">
                          {loadingShieldBalances ? (
                            <div className="px-4 py-3 text-center text-white">
                              <Loader2 className="h-4 w-4 animate-spin mx-auto" />
                              <span className="text-xs">Loading balances...</span>
                            </div>
                          ) : (
                            shieldTokens.map((token) => (
                              <button
                                key={token.address}
                                className="w-full px-4 py-3 text-left hover:bg-[#1a1a27] transition-colors text-white hover:text-white flex items-center justify-between"
                                onClick={() => {
                                  setSelectedToken(token);
                                  setShowTokenDropdown(false);
                                }}
                              >
                                <div>
                                  <div className="font-medium">{token.symbol}</div>
                                  <div className="text-xs text-white">{token.name}</div>
                                </div>
                                <span className="text-xs text-white">
                                  {shieldBalances[token.address] || "0.0000"}
                                </span>
                              </button>
                            ))
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-white mb-2">
                      Amount to Shield
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <span className="text-white">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="opacity-70">
                            <path d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        </span>
                      </div>
                      <input
                        type="number"
                        placeholder="0.00"
                        className="w-full pl-10 pr-20 py-3 bg-[#131320] border border-zinc-800/70 rounded-lg text-white placeholder:text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                        value={shieldAmount}
                        onChange={(e) => setShieldAmount(e.target.value)}
                      />
                      <button
                        className="absolute right-3 top-1/2 transform -translate-y-1/2 text-xs bg-zinc-700 hover:bg-zinc-600 px-2 py-1 rounded text-white"
                        onClick={() => setShieldAmount(shieldBalances[selectedToken.address] || "0")}
                      >
                        MAX
                      </button>
                    </div>
                    <div className="mt-2 text-xs text-white">
                      Available: {shieldBalances[selectedToken.address] || "0.0000"} {selectedToken.symbol}
                    </div>
                  </div>


                  {/* Shield Button with refresh capability */}
                  <div className="flex gap-3">
                    <button
                      className="flex-1 bg-purple-600 hover:bg-purple-700 text-white font-medium py-3 px-4 rounded-lg flex items-center justify-center transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
                      disabled={shieldLoading || loadingShieldBalances || !connected || !shieldAmount}
                      onClick={handleShield}
                    >
                      {shieldLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                      {shieldLoading ? 'Shielding...' : 'Shield Now'}
                    </button>
                    <button
                      className="bg-zinc-700 hover:bg-zinc-600 text-white font-medium py-3 px-4 rounded-lg transition-all duration-300"
                      onClick={() => fetchShieldTokens(true)}
                      disabled={loadingShieldBalances}
                    >
                      ↻
                    </button>
                  </div>

                </div>
              </div>
            )}

            {/* Unshield Assets Content */}
            {activeTab === "unshield" && (
              <div className="bg-[#1E1E2D] backdrop-blur-sm p-6 rounded-xl border border-zinc-800/50">
                <div className="flex items-start mb-6">
                  <div className="bg-purple-900/60 p-3 rounded-lg mr-4">
                    <Lock className="h-5 w-5 text-purple-400" />
                  </div>
                  <div>
                    <h2 className="text-xl font-semibold text-white">Unshield Assets</h2>
                    <p className="text-white text-sm">
                      Withdraw assets from your private vault back to your wallet
                    </p>
                  </div>
                </div>

                {/* Form */}
                <div className="space-y-6 mt-6">
                  <div>
                    <label className="block text-sm font-medium text-white mb-2">
                      Token
                    </label>
                    <div className="relative">
                      <button
                        className="w-full px-4 py-3 bg-[#131320] border border-zinc-800/70 rounded-lg text-white text-left flex items-center justify-between hover:bg-[#1a1a27] transition-colors"
                        onClick={() => setShowTokenDropdown(!showTokenDropdown)}
                      >
                        <span>{selectedToken.symbol}</span>
                        <ChevronDown className={`h-4 w-4 transition-transform ${showTokenDropdown ? 'rotate-180' : ''}`} />
                      </button>

                      {showTokenDropdown && (
                        <div className="absolute top-full left-0 right-0 mt-1 bg-[#131320] border border-zinc-800/70 rounded-lg shadow-lg z-10 max-h-48 overflow-y-auto">
                          {loadingUnshieldBalances ? (
                            <div className="px-4 py-3 text-center text-white">
                              <Loader2 className="h-4 w-4 animate-spin mx-auto" />
                              <span className="text-xs">Loading private balances...</span>
                            </div>
                          ) : (
                            unshieldTokens.map((token) => (
                              <button
                                key={token.address}
                                className="w-full px-4 py-3 text-left hover:bg-[#1a1a27] transition-colors text-white hover:text-white flex items-center justify-between"
                                onClick={() => {
                                  setSelectedToken(token);
                                  setShowTokenDropdown(false);
                                }}
                              >
                                <div>
                                  <div className="font-medium">{token.symbol}</div>
                                  <div className="text-xs text-white">{token.name}</div>
                                </div>
                                <span className="text-xs text-white">
                                  {unshieldBalances[token.address] || "0.000"}
                                </span>
                              </button>
                            ))
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Gasless Toggle */}
                  <div className="flex items-center justify-between bg-[#131320] border border-zinc-800/70 rounded-lg px-4 py-3">
                    <div>
                      <div className="text-sm font-medium text-white">Gasless Unshield</div>
                      <div className="text-xs text-white">Higher fee (2%), no gas needed</div>
                    </div>
                    <button
                      onClick={() => setIsGasless(!isGasless)}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                        isGasless ? 'bg-purple-600' : 'bg-zinc-700'
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          isGasless ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-white mb-2">
                      Amount to Unshield
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <span className="text-white">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="opacity-70">
                            <path d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        </span>
                      </div>
                      <input
                        type="number"
                        placeholder="0.00"
                        className="w-full pl-10 pr-20 py-3 bg-[#131320] border border-zinc-800/70 rounded-lg text-white placeholder:text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                        value={unshieldAmount}
                        onChange={(e) => setUnshieldAmount(e.target.value)}
                      />
                      <button
                        className="absolute right-3 top-1/2 transform -translate-y-1/2 text-xs bg-zinc-700 hover:bg-zinc-600 px-2 py-1 rounded text-white"
                        onClick={() => setUnshieldAmount(unshieldBalances[selectedToken.address] || "0")}
                      >
                        MAX
                      </button>
                    </div>
                    <div className="mt-2 text-xs text-white">
                      Available in vault: {unshieldBalances[selectedToken.address] || "0.000"} {selectedToken.symbol}
                    </div>
                  </div>

                  {/* Fee Information */}
                  <div className="text-white text-xs font-medium text-center mt-2">
                    {isGasless ? '2% fee applies' : '1% fee applies'} (minimum {MIN_FEE_LAMPORTS / 1e9} SOL)
                  </div>

                  {/* Unshield Button with refresh capability */}
                  <div className="flex gap-3">
                    <button
                      className="flex-1 bg-purple-600 hover:bg-purple-700 text-white font-medium py-3 px-4 rounded-lg flex items-center justify-center transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
                      disabled={shieldLoading || loadingUnshieldBalances || !connected || !unshieldAmount}
                      onClick={handleUnshield}
                    >
                      {shieldLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                      {shieldLoading ? 'Unshielding...' : 'Unshield Now'}
                    </button>
                    <button
                      className="bg-zinc-700 hover:bg-zinc-600 text-white font-medium py-3 px-4 rounded-lg transition-all duration-300"
                      onClick={() => fetchUnshieldTokens(true)}
                      disabled={loadingUnshieldBalances}
                    >
                      ↻
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* View Balances Content */}
            {activeTab === "balances" && (
              <div className="bg-[#1E1E2D] backdrop-blur-sm p-6 rounded-xl border border-zinc-800/50">
                <div className="flex items-start mb-6">
                  <div className="bg-purple-900/60 p-3 rounded-lg mr-4">
                    <Eye className="h-5 w-5 text-purple-400" />
                  </div>
                  <div>
                    <h2 className="text-xl font-semibold text-white">View Balances</h2>
                    <p className="text-white text-sm">
                      Check your shielded and unshielded token balances
                    </p>
                  </div>
                </div>

                {/* Balances */}
                <div className="space-y-6 mt-6">
                  <div className="bg-[#131320] rounded-lg border border-zinc-800/70 p-4">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-sm font-medium text-white">Wallet Balance</span>
                      <span className="text-white">
                        {shieldBalances[selectedToken.address] || "0.0000"} {selectedToken.symbol}
                      </span>
                    </div>
                    <div className="h-1 w-full bg-zinc-800 rounded-full overflow-hidden">
                      <div className="h-full bg-purple-500 rounded-full" style={{
                        width: `30%`
                      }}></div>
                    </div>
                  </div>

                  <div className="bg-[#131320] rounded-lg border border-zinc-800/70 p-4">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-sm font-medium text-white">Vault Balance</span>
                      <span className="text-white">
                        {unshieldBalances[selectedToken.address] || "0.000"} {selectedToken.symbol}
                      </span>
                    </div>
                    <div className="h-1 w-full bg-zinc-800 rounded-full overflow-hidden">
                      <div className="h-full bg-purple-500 rounded-full" style={{
                        width: `70%`
                      }}></div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Instructions - 1 column */}
          <div className="md:col-span-1">
            <div className="bg-[#1E1E2D] backdrop-blur-sm p-5 rounded-xl border border-zinc-800/50">
              <button
                className="w-full flex items-center justify-between text-white hover:text-white"
                onClick={() => setShowInstructions(!showInstructions)}
              >
                <div className="flex items-center">
                  <div className="bg-purple-900/60 p-2 rounded-lg mr-3">
                    <Eye className="h-5 w-5 text-purple-400" />
                  </div>
                  <div>
                    <span className="text-base font-medium">How It Works</span>
                    <p className="text-xs text-white">Understanding the Vault</p>
                  </div>
                </div>
                {showInstructions ? (
                  <ChevronUp className="h-4 w-4 text-white" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-white" />
                )}
              </button>

              {showInstructions && (
                <div className="mt-5 text-sm text-white space-y-4">
                  <div className="flex">
                    <div className="flex-shrink-0 h-6 w-6 rounded-full bg-purple-900/40 flex items-center justify-center text-xs font-medium text-purple-300 mr-3">
                      1
                    </div>
                    <p>Your tokens are moved to a privacy pool</p>
                  </div>

                  <div className="flex">
                    <div className="flex-shrink-0 h-6 w-6 rounded-full bg-purple-900/40 flex items-center justify-center text-xs font-medium text-purple-300 mr-3">
                      2
                    </div>
                    <p>Transaction metadata is encrypted using zero-knowledge proofs</p>
                  </div>

                  <div className="flex">
                    <div className="flex-shrink-0 h-6 w-6 rounded-full bg-purple-900/40 flex items-center justify-center text-xs font-medium text-purple-300 mr-3">
                      3
                    </div>
                    <p>Only you can view or move your funds in the Vault</p>
                  </div>

                  <div className="flex">
                    <div className="flex-shrink-0 h-6 w-6 rounded-full bg-purple-900/40 flex items-center justify-center text-xs font-medium text-purple-300 mr-3">
                      4
                    </div>
                    <p>While in the vault, nobody can connect your vault holdings to you</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
