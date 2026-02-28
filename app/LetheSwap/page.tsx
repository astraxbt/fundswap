"use client";

import React, { useState, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Wallet, ArrowRightLeft, ChevronDown, ChevronUp, TrendingUp, Shield, ArrowLeft, Search, X, Loader2, RefreshCw } from "lucide-react";
import Link from "next/link";
import NavBar from "@/components/navBar";
import { useWallet } from '@solana/wallet-adapter-react';
import { PublicKey, Keypair, ComputeBudgetProgram, SystemProgram, TransactionMessage, VersionedTransaction, TransactionInstruction } from '@solana/web3.js';
import {
  createRpc,
  LightSystemProgram,
  defaultTestStateTreeAccounts,
} from '@lightprotocol/stateless.js';
import bs58 from 'bs58';
import { searchTokensFromJupiter, getQuote, formatAmount, Token as JupiterToken, fetchTokens, searchTokens } from '../Dashboard/swap/jupiterApi';

const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL;

const balanceCache = new Map<string, { balance: string; timestamp: number }>();
const CACHE_TTL = 30000;

const tokenMetadataCache = new Map<string, { token: JupiterToken | null; timestamp: number }>();
const TOKEN_CACHE_TTL = 300000;

const getTokenFromJupiter = async (tokenMint: string): Promise<JupiterToken | null> => {
  const cacheKey = `token_${tokenMint}`;
  const cached = tokenMetadataCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < TOKEN_CACHE_TTL) {
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

    if (foundToken) {
      tokenMetadataCache.set(cacheKey, { token: foundToken, timestamp: Date.now() });
      return foundToken;
    }

    tokenMetadataCache.set(cacheKey, { token: null, timestamp: Date.now() });
    return null;
  } catch (error) {
    console.error('Error fetching token from Jupiter:', error);
    tokenMetadataCache.set(cacheKey, { token: null, timestamp: Date.now() });
    return null;
  }
};

interface Token {
  address: string;
  mint: string;
  symbol: string;
  name: string;
  decimals: number;
  logoURI?: string;
}

export default function LetheSwapPage() {
  const wallet = useWallet();
  const { publicKey } = wallet;
  const [showPrivateHoldings, setShowPrivateHoldings] = useState(false);
  const [availableTokens, setAvailableTokens] = useState<Token[]>([]);
  const [tokenBalances, setTokenBalances] = useState<Record<string, string>>({});
  const [privateTokenBalances, setPrivateTokenBalances] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [inputAmount, setInputAmount] = useState('');
  const [outputAmount, setOutputAmount] = useState('');
  const [isAssetsExpanded, setIsAssetsExpanded] = useState(true);

  const [inputToken, setInputToken] = useState({
    symbol: 'SOL',
    name: 'Solana',
    address: 'So11111111111111111111111111111111111111112',
    decimals: 9
  });
  const [outputToken, setOutputToken] = useState({
    symbol: 'USDC',
    name: 'USD Coin',
    address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    decimals: 6
  });

  const [showTokenSelector, setShowTokenSelector] = useState<'input' | 'output' | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [allTokens, setAllTokens] = useState<Token[]>([]);
  const [filteredTokens, setFilteredTokens] = useState<Token[]>([]);
  const [isLoadingTokens, setIsLoadingTokens] = useState(false);
  const [isSwapping, setIsSwapping] = useState(false);
  const [swapStatus, setSwapStatus] = useState('');
  const [swapError, setSwapError] = useState('');
  const [quoteResponse, setQuoteResponse] = useState<any>(null);
  const [isGettingQuote, setIsGettingQuote] = useState(false);

  const checkPrivateBalance = useCallback(async (address: string, tokenMint?: string) => {
    if (!address) return "0.000";

    const cacheKey = `private_${address}_${tokenMint || 'SOL'}`;
    const cached = balanceCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return cached.balance;
    }

    try {
      const connection = await createRpc(RPC_URL);
      let result: string;

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

        if (compressedTokenAccounts.items.length === 0) {
          result = '0';
        } else {
          const totalAmount = compressedTokenAccounts.items.reduce((sum, account) =>
            BigInt(sum) + BigInt(account.parsed.amount || 0), BigInt(0));

          try {
            const mintInfo = await connection.getParsedAccountInfo(new PublicKey(tokenMint));
            const decimals = (mintInfo.value?.data as any)?.parsed?.info?.decimals || 9;
            const tokenBalance = Number(totalAmount) / Math.pow(10, decimals);

            if (decimals <= 3) {
              result = Math.floor(tokenBalance).toString();
            } else {
              result = tokenBalance.toFixed(Math.min(decimals, 6));
            }
          } catch (err) {
            const tokenBalance = Number(totalAmount) / Math.pow(10, 9);
            result = tokenBalance.toFixed(3);
          }
        }
      }

      balanceCache.set(cacheKey, { balance: result, timestamp: Date.now() });
      return result;
    } catch (err) {
      console.error('Error checking private balance:', err);
      return "0.000";
    }
  }, []);

  const checkPublicBalance = useCallback(async (address: string, tokenMint: string | null = null) => {
    if (!address) return "0.000";

    const cacheKey = `public_${address}_${tokenMint || 'SOL'}`;
    const cached = balanceCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return cached.balance;
    }

    try {
      const connection = await createRpc(RPC_URL);
      let result: string;

      if (!tokenMint || tokenMint === 'So11111111111111111111111111111111111111112') {
        const balanceResult = await connection.getBalance(new PublicKey(address));
        const solBalance = balanceResult / 1e9;
        result = (Math.floor(solBalance * 1000) / 1000).toFixed(3);
      } else {
        const walletPublicKey = new PublicKey(address);
        const tokenMintPublicKey = new PublicKey(tokenMint);

        const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
          walletPublicKey,
          { mint: tokenMintPublicKey }
        );

        if (tokenAccounts.value.length === 0) {
          result = '0';
        } else {
          const account = tokenAccounts.value.reduce((prev, curr) => {
            const prevAmount = (prev.account.data as any).parsed.info.tokenAmount.uiAmount || 0;
            const currAmount = (curr.account.data as any).parsed.info.tokenAmount.uiAmount || 0;
            return prevAmount > currAmount ? prev : curr;
          });

          const tokenInfo = (account.account.data as any).parsed.info.tokenAmount;
          const balanceAmount = tokenInfo.uiAmount || 0;
          const decimals = tokenInfo.decimals || 9;

          if (decimals <= 3) {
            result = Math.floor(balanceAmount).toString();
          } else {
            result = balanceAmount.toFixed(Math.min(decimals, 6));
          }
        }
      }

      balanceCache.set(cacheKey, { balance: result, timestamp: Date.now() });
      return result;
    } catch (err) {
      console.error('Error checking public balance:', err);
      return "0.000";
    }
  }, []);

  const fetchUserTokens = useCallback(async (forceRefresh = false) => {
    if (!publicKey) return;

    const cacheKey = `tokens_${publicKey.toString()}`;
    const cached = balanceCache.get(cacheKey);
    if (!forceRefresh && cached && Date.now() - cached.timestamp < 60000) { // 1 minute cache
      return;
    }

    try {
      setLoading(true);
      const connection = await createRpc(RPC_URL);
      const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
        publicKey,
        { programId: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA') }
      );

      const tokens: Token[] = [{
        address: 'So11111111111111111111111111111111111111112',
        mint: 'So11111111111111111111111111111111111111112',
        symbol: 'SOL',
        name: 'Solana',
        decimals: 9
      }];

      const publicBalances: Record<string, string> = {};
      const privateBalances: Record<string, string> = {};

      if (publicKey) {
        const publicSolBalance = await checkPublicBalance(publicKey.toString());
        const privateSolBalance = await checkPrivateBalance(publicKey.toString());
        publicBalances['So11111111111111111111111111111111111111112'] = publicSolBalance;
        privateBalances['So11111111111111111111111111111111111111112'] = privateSolBalance;
      }

      for (const tokenAccount of tokenAccounts.value) {
        const tokenInfo = (tokenAccount.account.data as any).parsed.info;
        const mint = tokenInfo.mint;
        const balance = tokenInfo.tokenAmount.uiAmount || 0;

        if (balance > 0) {
          try {
            const jupiterToken = await getTokenFromJupiter(mint);

            if (jupiterToken) {
              tokens.push({
                address: mint,
                mint: mint,
                symbol: jupiterToken.symbol,
                name: jupiterToken.name,
                decimals: tokenInfo.tokenAmount.decimals
              });
            } else {
              const fallbackSymbol = mint.slice(0, 4).toUpperCase();
              tokens.push({
                address: mint,
                mint: mint,
                symbol: fallbackSymbol,
                name: `Token ${mint.slice(0, 8)}`,
                decimals: tokenInfo.tokenAmount.decimals
              });
            }

            if (publicKey) {
              const publicTokenBalance = await checkPublicBalance(publicKey.toString(), mint);
              const privateTokenBalance = await checkPrivateBalance(publicKey.toString(), mint);
              publicBalances[mint] = publicTokenBalance;
              privateBalances[mint] = privateTokenBalance;
            }

            if (tokenAccounts.value.indexOf(tokenAccount) < tokenAccounts.value.length - 1) {
              await new Promise(resolve => setTimeout(resolve, 100));
            }
          } catch (err) {
            console.error('Error processing token:', err);
          }
        }
      }

      setAvailableTokens(tokens);
      setTokenBalances(publicBalances);
      setPrivateTokenBalances(privateBalances);
      balanceCache.set(cacheKey, { balance: 'cached', timestamp: Date.now() });
    } catch (err) {
      console.error('Error fetching user tokens:', err);
    } finally {
      setLoading(false);
    }
  }, [publicKey, checkPrivateBalance, checkPublicBalance]);

  useEffect(() => {
    if (publicKey) {
      fetchUserTokens();
    }
  }, [publicKey, fetchUserTokens]);

  const priceCache = new Map<string, { price: number; timestamp: number }>();
  const PRICE_CACHE_TTL = 60000; // 1 minute cache for prices

  const getTokenPriceV3 = async (tokenMint: string): Promise<number> => {
    const cacheKey = `price_${tokenMint}`;
    const cached = priceCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < PRICE_CACHE_TTL) {
      return cached.price;
    }

    try {
      const response = await fetch(`/api/jupiter-proxy?endpoint=/price/v3&domain=api.jup.ag&ids=${tokenMint}`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      const tokenData = data[tokenMint];

      if (tokenData && tokenData.usdPrice) {
        const price = tokenData.usdPrice;
        priceCache.set(cacheKey, { price, timestamp: Date.now() });
        return price;
      }
    } catch (error) {
      console.error(`Error fetching price for ${tokenMint}:`, error);
    }

    const fallbackPrice = tokenMint === 'So11111111111111111111111111111111111111112' ? 240 : 1;
    priceCache.set(cacheKey, { price: fallbackPrice, timestamp: Date.now() });
    return fallbackPrice;
  };

  const getTokenPrice = async (tokenMint: string, decimals: number): Promise<number> => {
    return await getTokenPriceV3(tokenMint);
  };

  const [tokenPrices, setTokenPrices] = useState<Record<string, number>>({});
  const [pricesLoading, setPricesLoading] = useState(false);

  const fetchTokenPrices = useCallback(async () => {
    if (availableTokens.length === 0) return;

    setPricesLoading(true);
    const prices: Record<string, number> = {};

    try {
      for (const token of availableTokens) {
        const price = await getTokenPrice(token.address, token.decimals);
        prices[token.address] = price;

        if (availableTokens.indexOf(token) < availableTokens.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      setTokenPrices(prices);
    } catch (error) {
      console.error('Error fetching token prices:', error);
    } finally {
      setPricesLoading(false);
    }
  }, [availableTokens]);

  useEffect(() => {
    if (availableTokens.length > 0) {
      fetchTokenPrices();
    }
  }, [availableTokens, fetchTokenPrices]);

  const calculatePortfolioTotals = () => {
    let publicTotal = 0;
    let privateTotal = 0;

    for (const token of availableTokens) {
      const publicBalance = parseFloat(tokenBalances[token.address] || '0');
      const privateBalance = parseFloat(privateTokenBalances[token.address] || '0');
      const tokenPrice = tokenPrices[token.address] || 1;

      publicTotal += publicBalance * tokenPrice;
      privateTotal += privateBalance * tokenPrice;
    }

    const total = publicTotal + privateTotal;
    const publicPercentage = total > 0 ? Math.round((publicTotal / total) * 100) : 0;
    const privatePercentage = total > 0 ? Math.round((privateTotal / total) * 100) : 0;

    return {
      total,
      publicTotal,
      privateTotal,
      publicPercentage,
      privatePercentage
    };
  };

  const portfolioTotals = calculatePortfolioTotals();

  const currentAssets = showPrivateHoldings
    ? availableTokens.map(token => ({
        symbol: token.symbol,
        name: token.name,
        amount: parseFloat(privateTokenBalances[token.address] || '0'),
        value: parseFloat(privateTokenBalances[token.address] || '0') * (tokenPrices[token.address] || 1)
      })).filter(asset => asset.amount > 0)
    : availableTokens.map(token => ({
        symbol: token.symbol,
        name: token.name,
        amount: parseFloat(tokenBalances[token.address] || '0'),
        value: parseFloat(tokenBalances[token.address] || '0') * (tokenPrices[token.address] || 1)
      })).filter(asset => asset.amount > 0);

  const handleSwapTokens = () => {
    const temp = inputToken;
    setInputToken(outputToken);
    setOutputToken(temp);
    setOutputAmount('');
    setQuoteResponse(null);
  };

  const handleSelectToken = (token: Token) => {
    if (showTokenSelector === 'input') {
      setInputToken(token);
    } else if (showTokenSelector === 'output') {
      setOutputToken(token);
    }
    setShowTokenSelector(null);
    setSearchQuery('');
    setOutputAmount('');
    setQuoteResponse(null);
  };

  const handleRefreshPortfolio = async () => {
    if (!publicKey) return;

    setLoading(true);
    setPricesLoading(true);

    try {
      await fetchUserTokens();

      await fetchTokenPrices();
    } catch (error) {
      console.error('Error refreshing portfolio:', error);
    } finally {
      setLoading(false);
      setPricesLoading(false);
    }
  };

  const handleInputAmountChange = (value: string) => {
    if (/^(\d+)?(\.\d*)?$/.test(value) || value === '') {
      setInputAmount(value);
    }
  };

  const handleMaxPublicBalance = (tokenType: 'input' | 'output') => {
    const token = tokenType === 'input' ? inputToken : outputToken;
    const balance = tokenBalances[token.address] || '0';
    if (tokenType === 'input') {
      setInputAmount(balance);
    }
  };

  const handleMaxPrivateBalance = (tokenType: 'input' | 'output') => {
    const token = tokenType === 'input' ? inputToken : outputToken;
    const balance = privateTokenBalances[token.address] || '0';
    if (tokenType === 'input') {
      setInputAmount(balance);
    }
  };

  const parseAmount = (amount: string, decimals: number): string => {
    const parsed = parseFloat(amount);
    if (isNaN(parsed) || parsed <= 0) return '0';
    return Math.floor(parsed * Math.pow(10, decimals)).toString();
  };

  const fetchQuote = useCallback(async () => {
    if (!inputToken || !outputToken || !inputAmount || parseFloat(inputAmount) <= 0) {
      setOutputAmount('');
      setQuoteResponse(null);
      return;
    }
    
    setIsGettingQuote(true);
    try {
      const parsedAmount = parseAmount(inputAmount, inputToken.decimals || 9);
      console.log('LetheSwap fetchQuote - Input token:', inputToken.address);
      console.log('LetheSwap fetchQuote - Output token:', outputToken.address);
      console.log('LetheSwap fetchQuote - Parsed amount:', parsedAmount);
      
      const quote = await getQuote(
        inputToken.address,
        outputToken.address,
        parsedAmount
      );
      
      if (quote) {
        console.log('LetheSwap fetchQuote - Quote received:', quote);
        setQuoteResponse(quote);
        setOutputAmount(formatAmount(quote.outAmount, outputToken.decimals || 6));
      } else {
        console.log('LetheSwap fetchQuote - No quote received');
        setOutputAmount('');
        setQuoteResponse(null);
      }
    } catch (error) {
      console.error('LetheSwap fetchQuote - Error getting quote:', error);
      setOutputAmount('');
      setQuoteResponse(null);
    } finally {
      setIsGettingQuote(false);
    }
  }, [inputToken, outputToken, inputAmount]);

  useEffect(() => {
    const timeoutId = setTimeout(fetchQuote, 500);
    return () => clearTimeout(timeoutId);
  }, [fetchQuote]);

  useEffect(() => {
    let intervalId: NodeJS.Timeout | null = null;
    
    if (inputToken && outputToken && inputAmount && parseFloat(inputAmount) > 0) {
      intervalId = setInterval(fetchQuote, 15000);
    }
    
    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [fetchQuote, inputToken, outputToken, inputAmount]);

  const createShieldTransaction = async (ephemeralAddress: PublicKey) => {
    if (!wallet || !wallet.connected || !publicKey || !wallet.sendTransaction) {
      throw new Error('Please connect your wallet');
    }

    const connection = await createRpc(RPC_URL);
    const lamportsAmount = parseFloat(inputAmount) * 1e9;

    const userBalance = await connection.getBalance(publicKey);
    
    const totalRequired = lamportsAmount + 5000;
    
    if (userBalance < totalRequired) {
      throw new Error(`Insufficient balance. Need ${(totalRequired / 1e9).toFixed(4)} SOL but only have ${(userBalance / 1e9).toFixed(4)} SOL`);
    }

    const instructions = [
      ComputeBudgetProgram.setComputeUnitLimit({ units: 1_000_000 }),
      await LightSystemProgram.compress({
        payer: publicKey,
        toAddress: ephemeralAddress,
        lamports: lamportsAmount,
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

    const signature = await wallet.sendTransaction(transaction, connection, {
      minContextSlot,
    });

    return signature;
  };

  const unshieldFromCompressedPool = async (ephemeralKeypair: Keypair, tokenMint: string, amount: string) => {
    const { createRpc, LightSystemProgram, selectMinCompressedSolAccountsForTransfer } = await import('@lightprotocol/stateless.js');
    const connection = await createRpc(RPC_URL);
    
    const lamportsAmount = parseFloat(amount) * 1e9;
    
    console.log('🔍 Querying compressed accounts for ephemeral wallet:', ephemeralKeypair.publicKey.toString());
    const compressedAccounts = await connection.getCompressedAccountsByOwner(ephemeralKeypair.publicKey);
    
    console.log('📊 Compressed accounts response:', compressedAccounts);
    console.log('📊 Compressed accounts items:', compressedAccounts?.items);
    console.log('📊 Items length:', compressedAccounts?.items?.length);
    
    if (!compressedAccounts || !compressedAccounts.items) {
      throw new Error('Compressed accounts response is invalid or missing items array');
    }
    
    if (compressedAccounts.items.length === 0) {
      throw new Error('No compressed accounts found for ephemeral wallet');
    }
    
    const validAccounts = compressedAccounts.items.filter(account => 
      account && typeof account === 'object' && account.lamports !== undefined
    );
    
    console.log('✅ Valid compressed accounts found:', validAccounts.length);
    console.log('💰 Account details:', validAccounts.map(acc => ({ lamports: acc.lamports, merkleTree: acc.merkleTree })));
    
    if (validAccounts.length === 0) {
      throw new Error('No valid compressed accounts found with lamports data');
    }
    
    console.log('🎯 Selecting accounts for amount:', lamportsAmount);
    const [selectedAccounts] = selectMinCompressedSolAccountsForTransfer(
      validAccounts,
      lamportsAmount
    );
    
    console.log('✅ Selected accounts:', selectedAccounts);
    
    console.log('🔐 Generating validity proof...');
    const { bn } = await import('@lightprotocol/stateless.js');
    
    const hashValues = selectedAccounts.map(account => {
      if (!account.hash) {
        throw new Error("Account hash is missing. Cannot generate validity proof.");
      }
      const hashBuffer = Buffer.from(account.hash);
      const bnValue = bn(hashBuffer);
      if (!bnValue) {
        throw new Error(`Failed to convert account hash to BN: ${account.hash}`);
      }
      return bnValue;
    });
    
    console.log(`Generated ${hashValues.length} hash values for validity proof`);
    
    const { compressedProof, rootIndices } = await connection.getValidityProof(hashValues);
    
    if (!compressedProof) {
      throw new Error('getValidityProof returned undefined compressedProof');
    }
    if (!rootIndices || !Array.isArray(rootIndices)) {
      throw new Error('getValidityProof returned invalid rootIndices');
    }
    console.log(`✅ Validity proof generated successfully with ${rootIndices.length} root indices`);
    
    const unshieldInstruction = await LightSystemProgram.decompress({
      payer: ephemeralKeypair.publicKey,
      toAddress: ephemeralKeypair.publicKey,
      lamports: lamportsAmount,
      inputCompressedAccounts: selectedAccounts,
      recentValidityProof: compressedProof,
      recentInputStateRootIndices: rootIndices,
    });
    
    const serializedInstructions = [unshieldInstruction].map(ix => ({
      programId: ix.programId.toString(),
      keys: ix.keys.map(key => ({
        pubkey: key.pubkey.toString(),
        isSigner: key.isSigner,
        isWritable: key.isWritable
      })),
      data: Array.from(ix.data)
    }));
    
    const { context: { slot: minContextSlot }, value: blockhashCtx } = 
      await connection.getLatestBlockhashAndContext();
    
    const gaslessResponse = await fetch('/api/gasless-trading', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        instructions: serializedInstructions,
        blockhash: blockhashCtx.blockhash,
        userPublicKey: ephemeralKeypair.publicKey.toString()
      })
    });
    
    if (!gaslessResponse.ok) {
      throw new Error('Failed to create gasless unshield transaction');
    }
    
    const { transaction: serializedTx } = await gaslessResponse.json();
    const transaction = VersionedTransaction.deserialize(bs58.decode(serializedTx));
    
    transaction.sign([ephemeralKeypair]);
    
    const signature = await connection.sendTransaction(transaction, { minContextSlot });
    await connection.confirmTransaction(signature);
    
    return signature;
  };

  const executeSwapWithEphemeralWallet = async (ephemeralKeypair: Keypair, quote: any) => {
    const { getSwapInstructions } = await import('../Dashboard/swap/jupiterApi');
    
    const originalInputAmount = parseInt(quote.inAmount);
    const adjustedInputAmount = originalInputAmount - 5000000; // Subtract 0.005 SOL
    
    console.log('==== GET SWAP INSTRUCTIONS API CALL =====');
    console.log('Input token:', quote.inputMint);
    console.log('Output token:', quote.outputMint);
    console.log('Original input amount:', originalInputAmount);
    console.log('Adjusted input amount:', adjustedInputAmount);
    console.log('User public key:', ephemeralKeypair.publicKey.toString());
    
    const adjustedQuote = {
      ...quote,
      inAmount: adjustedInputAmount.toString()
    };
    
    const swapInstructions = await getSwapInstructions(
      adjustedQuote,
      ephemeralKeypair.publicKey.toString()
    );
    
    if (!swapInstructions.instructions || swapInstructions.instructions.length === 0) {
      throw new Error('Failed to get swap instructions from Jupiter');
    }
    
    const connection = await createRpc(RPC_URL);
    const { context: { slot: minContextSlot }, value: blockhashCtx } = 
      await connection.getLatestBlockhashAndContext();
    
    const processedInstructions = swapInstructions.instructions.map((ix: any, index: number) => {
      console.log(`Processing instruction ${index}:`, {
        programId: ix.programId,
        accountsLength: ix.accounts?.length,
        dataType: typeof ix.data,
        dataLength: ix.data?.length,
        dataIsArray: Array.isArray(ix.data),
        dataIsString: typeof ix.data === 'string'
      });
      
      if (!ix || !ix.programId || !ix.accounts || !ix.data) {
        console.error('Invalid instruction format:', ix);
        throw new Error('Invalid instruction format in swap instructions');
      }
      
      let instructionData;
      try {
        console.log(`Processing instruction ${index} data:`, {
          type: typeof ix.data,
          value: ix.data,
          isArray: Array.isArray(ix.data),
          isUint8Array: ix.data instanceof Uint8Array,
          length: ix.data?.length
        });
        
        if (ix.data === null || ix.data === undefined) {
          instructionData = new Uint8Array(0);
        } else if (typeof ix.data === 'string') {
          if (ix.data.length === 0) {
            instructionData = new Uint8Array(0);
          } else {
            try {
              instructionData = Buffer.from(ix.data, 'base64');
            } catch (e) {
              console.log(`Base64 decode failed for instruction ${index}, trying as regular string`);
              instructionData = Buffer.from(ix.data);
            }
          }
        } else if (Array.isArray(ix.data)) {
          instructionData = new Uint8Array(ix.data);
        } else if (ix.data instanceof Uint8Array) {
          instructionData = ix.data;
        } else if (typeof ix.data === 'object' && ix.data.type === 'Buffer' && Array.isArray(ix.data.data)) {
          instructionData = new Uint8Array(ix.data.data);
        } else {
          try {
            instructionData = Buffer.from(ix.data);
          } catch (bufferError) {
            console.error(`All conversion methods failed for instruction ${index}:`, bufferError);
            console.error('Data:', ix.data);
            instructionData = new Uint8Array(0);
          }
        }
      } catch (error) {
        console.error(`Failed to convert instruction ${index} data:`, error);
        console.error('Data type:', typeof ix.data);
        console.error('Data value:', ix.data);
        instructionData = new Uint8Array(0);
      }
      
      console.log(`Instruction ${index} data buffer length:`, instructionData.length);
      
      return new TransactionInstruction({
        programId: new PublicKey(ix.programId),
        keys: ix.accounts.map((acc: any) => ({
          pubkey: new PublicKey(acc.pubkey),
          isSigner: acc.isSigner,
          isWritable: acc.isWritable
        })),
        data: instructionData
      });
    });

    const instructions = processedInstructions;
    
    const messageV0 = new TransactionMessage({
      payerKey: ephemeralKeypair.publicKey,
      recentBlockhash: blockhashCtx.blockhash,
      instructions,
    }).compileToV0Message();
    
    const transaction = new VersionedTransaction(messageV0);
    transaction.sign([ephemeralKeypair]);
    
    const signature = await connection.sendTransaction(transaction, { minContextSlot });
    await connection.confirmTransaction(signature);
    
    return {
      signature,
      outputAmount: quote.outAmount
    };
  };

  const shieldOutputTokensToMainWallet = async (ephemeralKeypair: Keypair, outputTokenMint: string, outputAmount: string) => {
    const { createRpc, LightSystemProgram, defaultTestStateTreeAccounts } = await import('@lightprotocol/stateless.js');
    const connection = await createRpc(RPC_URL);
    
    const lamportsAmount = parseInt(outputAmount);
    
    const shieldInstruction = await LightSystemProgram.compress({
      payer: ephemeralKeypair.publicKey,
      toAddress: publicKey,
      lamports: lamportsAmount,
      outputStateTree: defaultTestStateTreeAccounts().merkleTree,
    });
    
    const { context: { slot: minContextSlot }, value: blockhashCtx } = 
      await connection.getLatestBlockhashAndContext();
    
    const instructions = [
      ComputeBudgetProgram.setComputeUnitLimit({ units: 1_000_000 }),
      shieldInstruction
    ];
    
    const messageV0 = new TransactionMessage({
      payerKey: ephemeralKeypair.publicKey,
      recentBlockhash: blockhashCtx.blockhash,
      instructions,
    }).compileToV0Message();
    
    const transaction = new VersionedTransaction(messageV0);
    transaction.sign([ephemeralKeypair]);
    
    const signature = await connection.sendTransaction(transaction, { minContextSlot });
    await connection.confirmTransaction(signature);
    
    return signature;
  };

  const handleEphemeralSwap = async () => {
    if (!publicKey || !quoteResponse || !inputAmount || parseFloat(inputAmount) <= 0) {
      setSwapError('Please ensure all fields are filled and quote is available');
      return;
    }

    setIsSwapping(true);
    setSwapError('');
    setSwapStatus('Generating ephemeral wallet...');

    try {
      const { keccak_256 } = await import('@noble/hashes/sha3');
      const randomEntropy = crypto.getRandomValues(new Uint8Array(32));
      const seedMaterial = keccak_256(randomEntropy);
      const ephemeralKeypair = Keypair.fromSeed(new Uint8Array(seedMaterial.slice(0, 32)));
      
      console.log('🔑 Generated ephemeral address:', ephemeralKeypair.publicKey.toString());
      console.log('🔐 Ephemeral private key (for debugging):', bs58.encode(ephemeralKeypair.secretKey));
      
      setSwapStatus('Please sign the shield transaction...');
      const shieldSignature = await createShieldTransaction(ephemeralKeypair.publicKey);
      
      setSwapStatus('Confirming shield transaction...');
      const connection = await createRpc(RPC_URL);
      await connection.confirmTransaction(shieldSignature);
      
      setSwapStatus('Waiting for compressed accounts to be available...');
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      setSwapStatus('Unshielding tokens from privacy pool...');
      await unshieldFromCompressedPool(ephemeralKeypair, inputToken.address, inputAmount);
      
      setSwapStatus('Executing private swap...');
      const swapResult = await executeSwapWithEphemeralWallet(ephemeralKeypair, quoteResponse);
      
      setSwapStatus('Shielding output tokens back to your wallet...');
      await shieldOutputTokensToMainWallet(ephemeralKeypair, outputToken.address, swapResult.outputAmount);
      
      ephemeralKeypair.secretKey.fill(0);
      
      setSwapStatus(`✅ Swap completed! Output: ${formatAmount(swapResult.outputAmount, outputToken.decimals)} ${outputToken.symbol}`);
      await handleRefreshPortfolio();
      
    } catch (error: any) {
      console.error('Ephemeral swap error:', error);
      setSwapError(error.message || 'Failed to execute ephemeral swap');
      setSwapStatus('');
    } finally {
      setIsSwapping(false);
    }
  };

  useEffect(() => {
    const getTokens = async () => {
      setIsLoadingTokens(true);
      try {
        const tokens = await fetchTokens();
        const mappedTokens: Token[] = tokens.map(token => ({
          ...token,
          mint: token.address
        }));
        setAllTokens(mappedTokens);
      } catch (error) {
        console.error('Error loading tokens:', error);
        const defaultTokens: Token[] = [
          {
            address: 'So11111111111111111111111111111111111111112',
            mint: 'So11111111111111111111111111111111111111112',
            decimals: 9,
            name: 'Wrapped SOL',
            symbol: 'SOL',
            logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png'
          },
          {
            address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
            mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
            decimals: 6,
            name: 'USD Coin',
            symbol: 'USDC',
            logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v/logo.png'
          }
        ];
        setAllTokens(defaultTokens);
      } finally {
        setIsLoadingTokens(false);
      }
    };

    getTokens();
  }, []);

  useEffect(() => {
    if (showTokenSelector) {
      const performSearch = async () => {
        const jupiterTokens = allTokens.map(token => ({
          address: token.address,
          chainId: 101,
          decimals: token.decimals,
          name: token.name,
          symbol: token.symbol,
          logoURI: token.logoURI
        }));
        const filtered = await searchTokens(jupiterTokens, searchQuery);
        const mappedFiltered: Token[] = filtered.map(token => ({
          ...token,
          mint: token.address
        }));
        setFilteredTokens(mappedFiltered);
      };
      performSearch();
    }
  }, [searchQuery, allTokens, showTokenSelector]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0a0a0e] to-[#16151E] text-white" style={{ transform: 'scale(0.65)', transformOrigin: 'top left', width: '153.85%', height: '153.85%' }}>
      <NavBar />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-7 pb-16 mt-16">
        <div className="mb-10">
          <div className="flex items-center justify-between mb-2">
            <Link href="/Dashboard" className="inline-flex items-center text-white/80 hover:text-white transition-colors relative z-10 cursor-pointer">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Dashboard
            </Link>
            <h1 className="text-3xl font-bold">
              <span className="bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-indigo-300">PrivateSwap</span>
            </h1>
            <div className="invisible">
              <Link href="/Dashboard" className="inline-flex items-center">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Dashboard
              </Link>
            </div>
          </div>
          <div className="text-center">
            <p className="text-white/70">
              Trade cryptocurrencies with complete privacy and anonymity. Your transactions remain confidential with zero-knowledge technology.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="space-y-6">
            <Card className="bg-zinc-900/40 backdrop-blur-sm border border-zinc-800/50">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-indigo-300">
                    Portfolio Overview
                  </h2>
                  <Button variant="ghost" size="icon" className="h-6 w-6">
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                </div>

                <div className="mb-6">
                  <div className="text-sm text-white/60 mb-1">Total Portfolio</div>
                  <div className="text-3xl font-bold text-white mb-1">
                    {loading || pricesLoading ? (
                      <div className="animate-pulse bg-zinc-700 h-8 w-32 rounded"></div>
                    ) : (
                      `$${portfolioTotals.total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                    )}
                  </div>
                  <div className="flex items-center text-green-400 text-sm">
                    <TrendingUp className="h-4 w-4 mr-1" />
                    +2.4% (24h)
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 mb-6">
                  <Card
                    className={`cursor-pointer transition-all duration-200 ${
                      !showPrivateHoldings
                        ? 'bg-blue-500/20 border-blue-500/50'
                        : 'bg-zinc-800/30 border-zinc-700 hover:bg-zinc-800/50'
                    }`}
                    onClick={() => setShowPrivateHoldings(false)}
                  >
                    <CardContent className="p-4 text-center">
                      <div className="flex items-center justify-center mb-2">
                        <Wallet className="h-4 w-4 mr-2 text-blue-400" />
                        <span className="text-sm font-medium text-blue-400">Public</span>
                      </div>
                      <div className="text-lg font-bold text-white">
                        {loading || pricesLoading ? (
                          <div className="animate-pulse bg-zinc-700 h-6 w-20 rounded mx-auto"></div>
                        ) : (
                          `$${portfolioTotals.publicTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                        )}
                      </div>
                      <div className="text-xs text-white/60">
                        {portfolioTotals.publicPercentage}% of portfolio
                      </div>
                    </CardContent>
                  </Card>

                  <Card
                    className={`cursor-pointer transition-all duration-200 ${
                      showPrivateHoldings
                        ? 'bg-green-500/20 border-green-500/50'
                        : 'bg-zinc-800/30 border-zinc-700 hover:bg-zinc-800/50'
                    }`}
                    onClick={() => setShowPrivateHoldings(true)}
                  >
                    <CardContent className="p-4 text-center">
                      <div className="flex items-center justify-center mb-2">
                        <Shield className="h-4 w-4 mr-2 text-green-400" />
                        <span className="text-sm font-medium text-green-400">Private</span>
                      </div>
                      <div className="text-lg font-bold text-white">
                        {loading || pricesLoading ? (
                          <div className="animate-pulse bg-zinc-700 h-6 w-20 rounded mx-auto"></div>
                        ) : (
                          `$${portfolioTotals.privateTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                        )}
                      </div>
                      <div className="text-xs text-white/60">
                        {portfolioTotals.privatePercentage}% of portfolio
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-zinc-900/40 backdrop-blur-sm border border-zinc-800/50">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center">
                    <Shield className="h-5 w-5 mr-2 text-green-400" />
                    <h3 className="text-lg font-medium text-white">
                      {showPrivateHoldings ? 'Private' : 'Public'} Assets
                    </h3>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setIsAssetsExpanded(!isAssetsExpanded)}
                      className="ml-2 h-6 w-6 p-0 hover:bg-zinc-800/50"
                    >
                      {isAssetsExpanded ? (
                        <ChevronUp className="h-4 w-4 text-zinc-400" />
                      ) : (
                        <ChevronDown className="h-4 w-4 text-zinc-400" />
                      )}
                    </Button>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleRefreshPortfolio}
                    disabled={!publicKey || loading || pricesLoading}
                    className="h-8 w-8 p-0 bg-zinc-800/50 border-zinc-700/50 hover:bg-zinc-700/50 disabled:opacity-50"
                  >
                    <RefreshCw className={`h-4 w-4 text-white ${(loading || pricesLoading) ? 'animate-spin' : ''}`} />
                  </Button>
                </div>

                {isAssetsExpanded && (
                  <div className="space-y-3">
                    {loading || pricesLoading ? (
                      <div className="space-y-3">
                        {[1, 2].map((i) => (
                          <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-zinc-800/30">
                            <div className="flex items-center">
                              <div className="h-8 w-8 rounded-full bg-zinc-700 animate-pulse mr-3"></div>
                              <div>
                                <div className="h-4 w-12 bg-zinc-700 animate-pulse rounded mb-1"></div>
                                <div className="h-3 w-20 bg-zinc-700 animate-pulse rounded"></div>
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="h-4 w-16 bg-zinc-700 animate-pulse rounded mb-1"></div>
                              <div className="h-3 w-12 bg-zinc-700 animate-pulse rounded"></div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : currentAssets.length > 0 ? (
                      currentAssets.map((asset) => (
                        <div key={asset.symbol} className="flex items-center justify-between p-3 rounded-lg bg-zinc-800/30">
                          <div className="flex items-center">
                            <div className="h-8 w-8 rounded-full bg-purple-500/20 flex items-center justify-center mr-3">
                              <span className="text-sm font-bold">{asset.symbol[0]}</span>
                            </div>
                            <div>
                              <div className="font-medium text-white">{asset.symbol}</div>
                              <div className="text-xs text-white/60">{asset.name}</div>
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="font-medium text-white">{asset.amount.toFixed(3)}</div>
                            <div className="text-xs text-white/60">${asset.value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="text-center py-8 text-white/60">
                        {!publicKey ? 'Connect wallet to view balances' : 'No assets found'}
                      </div>
                    )}
                  </div>
                )}

                <div className="mt-6 p-3 rounded-lg bg-green-900/20 border border-green-800/50">
                  <div className="flex items-center mb-2">
                    <Shield className="h-4 w-4 mr-2 text-green-400" />
                    <span className="text-sm font-medium text-green-400">End-to-End Encryption</span>
                  </div>
                  <p className="text-xs text-white/70">
                    Your private balance data is encrypted locally and never transmitted to external servers. Only you have access to this information.
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            <Card className="bg-zinc-900/40 backdrop-blur-sm border border-zinc-800/50 shadow-[0_8px_30px_rgb(0,0,0,0.12)]">
              <CardContent className="pt-6">
                <div className="flex items-center mb-6">
                  <Shield className="h-5 w-5 mr-2 text-purple-400" />
                  <h2 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-indigo-300">
                    Private Token Swap
                  </h2>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="text-sm text-slate-400 mb-3 block font-medium">From</label>
                    <Card className="bg-zinc-800/30 border-zinc-700 p-5 shadow-[0_4px_20px_rgb(0,0,0,0.15)]">
                      <div className="flex justify-between items-start mb-4">
                        <div className="flex items-center space-x-3">
                          <div className="h-10 w-10 rounded-full bg-gradient-to-br from-purple-500/30 to-blue-500/30 flex items-center justify-center border border-purple-400/20">
                            <span className="text-sm font-bold text-white">{inputToken.symbol[0]}</span>
                          </div>
                          <div>
                            <div className="font-semibold text-white text-lg">{inputToken.symbol}</div>
                            <div className="text-xs text-slate-400">{inputToken.name}</div>
                          </div>
                        </div>
                        <div className="flex items-center space-x-4">
                          {publicKey && (
                            <div className="text-right space-y-1">
                              <div className="flex items-center text-xs text-blue-400">
                                <Wallet className="h-3 w-3 mr-1" />
                                <span>Public: {tokenBalances[inputToken.address] || '0.000'}</span>
                              </div>
                              <div className="flex items-center text-xs text-green-400">
                                <Shield className="h-3 w-3 mr-1" />
                                <span>Private: {privateTokenBalances[inputToken.address] || '0.000'}</span>
                              </div>
                            </div>
                          )}
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setShowTokenSelector('input')}
                            className="bg-slate-700/50 border-slate-600/50 hover:bg-slate-600/50 text-slate-300"
                          >
                            <ChevronDown className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>

                      <div className="flex items-center">
                        <input
                          type="text"
                          placeholder="0.0"
                          value={inputAmount}
                          onChange={(e) => handleInputAmountChange(e.target.value)}
                          className="text-3xl font-bold bg-transparent border-none outline-none flex-1 text-white placeholder-slate-500 min-w-0"
                        />
                        <div className="flex space-x-1 ml-3">
                          <Button
                            size="sm"
                            onClick={() => handleMaxPublicBalance('input')}
                            disabled={!publicKey}
                            className="bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 border border-blue-400/30 text-xs px-2 py-1"
                          >
                            PUB
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => handleMaxPrivateBalance('input')}
                            disabled={!publicKey}
                            className="bg-green-500/20 hover:bg-green-500/30 text-green-300 border border-green-400/30 text-xs px-2 py-1"
                          >
                            PRIV
                          </Button>
                        </div>
                      </div>

                      {!publicKey && (
                        <div className="text-sm text-slate-400 mt-2">
                          <span>Connect wallet to see balances</span>
                        </div>
                      )}
                    </Card>
                  </div>

                  <div className="flex justify-center">
                    <Button
                      variant="outline"
                      size="icon"
                      className="rounded-full h-12 w-12 bg-slate-800/80 border-slate-600/50 text-white hover:bg-slate-700/80 shadow-[0_4px_12px_rgb(0,0,0,0.15)]"
                      onClick={handleSwapTokens}
                    >
                      <ArrowRightLeft className="h-5 w-5" />
                    </Button>
                  </div>

                  <div>
                    <label className="text-sm text-slate-400 mb-3 block font-medium">To</label>
                    <Card className="bg-zinc-800/30 border-zinc-700 p-5 shadow-[0_4px_20px_rgb(0,0,0,0.15)]">
                      <div className="flex justify-between items-start mb-4">
                        <div className="flex items-center space-x-3">
                          <div className="h-10 w-10 rounded-full bg-gradient-to-br from-purple-500/30 to-blue-500/30 flex items-center justify-center border border-purple-400/20">
                            <span className="text-sm font-bold text-white">{outputToken.symbol[0]}</span>
                          </div>
                          <div>
                            <div className="font-semibold text-white text-lg">{outputToken.symbol}</div>
                            <div className="text-xs text-slate-400">{outputToken.name}</div>
                          </div>
                        </div>
                        <div className="flex items-center space-x-4">
                          {publicKey && (
                            <div className="text-right space-y-1">
                              <div className="flex items-center text-xs text-blue-400">
                                <Wallet className="h-3 w-3 mr-1" />
                                <span>Public: {tokenBalances[outputToken.address] || '0.000'}</span>
                              </div>
                              <div className="flex items-center text-xs text-green-400">
                                <Shield className="h-3 w-3 mr-1" />
                                <span>Private: {privateTokenBalances[outputToken.address] || '0.000'}</span>
                              </div>
                            </div>
                          )}
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setShowTokenSelector('output')}
                            className="bg-slate-700/50 border-slate-600/50 hover:bg-slate-600/50 text-slate-300"
                          >
                            <ChevronDown className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>

                      <div className="relative">
                        <input
                          type="text"
                          placeholder="0.0"
                          value={isGettingQuote ? 'Loading...' : outputAmount}
                          className="text-3xl font-bold bg-transparent border-none outline-none w-full text-white placeholder-slate-500 mb-4"
                          readOnly
                        />
                        {isGettingQuote && (
                          <div className="absolute right-0 top-1/2 transform -translate-y-1/2">
                            <Loader2 className="h-6 w-6 animate-spin text-purple-400" />
                          </div>
                        )}
                      </div>

                      <div className="flex justify-between items-center">
                        <div className="text-sm text-slate-400">
                          {!publicKey && <span>Connect wallet to see balances</span>}
                        </div>
                      </div>

                      {/* Quote Details */}
                      {quoteResponse && outputAmount && parseFloat(outputAmount) > 0 && (
                        <div className="mt-4 p-3 bg-slate-800/30 rounded-lg border border-slate-700/50">
                          <div className="flex justify-between items-center text-sm">
                            <span className="text-slate-400">Rate</span>
                            <span className="text-white">
                              1 {inputToken.symbol} ≈ {(parseFloat(outputAmount) / parseFloat(inputAmount || '1')).toFixed(6)} {outputToken.symbol}
                            </span>
                          </div>
                          {quoteResponse.priceImpactPct && (
                            <div className="flex justify-between items-center text-sm mt-1">
                              <span className="text-slate-400">Price Impact</span>
                              <span className={`${parseFloat(quoteResponse.priceImpactPct) > 1 ? 'text-red-400' : 'text-green-400'}`}>
                                {parseFloat(quoteResponse.priceImpactPct).toFixed(2)}%
                              </span>
                            </div>
                          )}
                          {quoteResponse.routePlan && quoteResponse.routePlan.length > 0 && (
                            <div className="flex justify-between items-center text-sm mt-1">
                              <span className="text-slate-400">Route</span>
                              <span className="text-slate-300 text-xs">
                                {quoteResponse.routePlan.length} hop{quoteResponse.routePlan.length > 1 ? 's' : ''}
                              </span>
                            </div>
                          )}
                        </div>
                      )}
                    </Card>
                  </div>

                  <div className="p-4 rounded-lg bg-gradient-to-r from-purple-900/30 to-indigo-900/30 border border-purple-700/50 shadow-[0_4px_12px_rgb(0,0,0,0.1)]">
                    <div className="flex items-center mb-2">
                      <Shield className="h-4 w-4 mr-2 text-purple-400" />
                      <span className="text-sm font-medium text-purple-300">Private & Anonymous</span>
                    </div>
                    <p className="text-xs text-slate-300">
                      This swap uses ephemeral wallets and zero-knowledge proofs. No transaction history is stored or linked to your identity.
                    </p>
                  </div>

                  <Button 
                    className="w-full bg-gradient-to-r from-purple-500 to-indigo-500 hover:from-purple-600 hover:to-indigo-600 shadow-[0_4px_20px_rgb(147,51,234,0.4)] text-white font-semibold py-4" 
                    size="lg"
                    onClick={handleEphemeralSwap}
                    disabled={isSwapping || !quoteResponse || !inputAmount || parseFloat(inputAmount) <= 0}
                  >
                    {isSwapping ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        {swapStatus || 'Swapping...'}
                      </>
                    ) : (
                      'Swap Privately'
                    )}
                  </Button>
                  {swapStatus && (
                    <div className="mt-4 p-3 bg-blue-900/20 border border-blue-500/30 rounded-lg">
                      <p className="text-blue-300 text-sm">{swapStatus}</p>
                    </div>
                  )}
                  {swapError && (
                    <div className="mt-4 p-3 bg-red-900/20 border border-red-500/30 rounded-lg">
                      <p className="text-red-300 text-sm">{swapError}</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* Token Selector Modal */}
      {showTokenSelector && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
          <div className="bg-zinc-900/95 backdrop-blur-sm border border-zinc-700/50 rounded-xl w-full max-w-md max-h-[80vh] overflow-hidden relative shadow-2xl">
            <Button
              variant="outline"
              size="icon"
              onClick={() => {
                setShowTokenSelector(null);
                setSearchQuery('');
              }}
              className="absolute top-3 right-3 h-8 w-8 rounded-full bg-zinc-800/80 hover:bg-zinc-700/80 border-zinc-600/50 z-50"
            >
              <X className="h-4 w-4 text-zinc-300" />
            </Button>

            <div className="p-4 border-b border-zinc-700/50">
              <h3 className="text-lg font-semibold text-white mb-3">Select Token</h3>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-zinc-400 h-4 w-4" />
                <input
                  type="text"
                  placeholder="Search tokens..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-zinc-800/60 border border-zinc-600/50 rounded-lg pl-10 pr-4 py-3 text-sm text-white placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500/50 transition-all"
                  autoFocus
                />
              </div>
            </div>

            <div className="overflow-y-auto max-h-[50vh]">
              {isLoadingTokens ? (
                <div className="flex justify-center items-center p-12">
                  <Loader2 className="h-8 w-8 animate-spin text-purple-400" />
                </div>
              ) : filteredTokens.length > 0 ? (
                <div className="p-2">
                  {filteredTokens.map((token) => (
                    <button
                      key={token.address}
                      className="w-full text-left p-4 hover:bg-zinc-800/60 rounded-xl transition-all duration-200 flex items-center group border border-transparent hover:border-zinc-700/30"
                      onClick={() => handleSelectToken(token)}
                    >
                      <div className="h-10 w-10 rounded-full bg-gradient-to-br from-zinc-700 to-zinc-800 flex items-center justify-center mr-4 group-hover:scale-105 transition-transform">
                        {token.logoURI ? (
                          <img
                            src={token.logoURI}
                            alt={token.symbol}
                            className="h-8 w-8 rounded-full object-cover"
                            onError={(e) => {
                              e.currentTarget.style.display = 'none';
                            }}
                          />
                        ) : null}
                        <span
                          className={`text-sm font-bold text-zinc-300 ${token.logoURI ? 'hidden' : 'flex'} items-center justify-center h-full w-full`}
                        >
                          {token.symbol.substring(0, 2)}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-white text-base group-hover:text-purple-300 transition-colors">
                          {token.symbol}
                        </div>
                        <div className="text-sm text-zinc-400 truncate">
                          {token.name}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              ) : searchQuery.length >= 2 ? (
                <div className="p-12 text-center">
                  <div className="text-zinc-400 mb-2">No tokens found</div>
                  <div className="text-sm text-zinc-500">Try searching with a different term</div>
                </div>
              ) : (
                <div className="p-12 text-center">
                  <div className="text-zinc-400 mb-2">Search for tokens</div>
                  <div className="text-sm text-zinc-500">Type at least 2 characters to search</div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
