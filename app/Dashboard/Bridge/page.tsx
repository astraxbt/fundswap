"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { ArrowLeft, ChevronDown } from "lucide-react";
import NavBar from "@/components/navBar";
import { useWallet } from '@solana/wallet-adapter-react';
import { PublicKey, Transaction, TransactionMessage, VersionedTransaction, ComputeBudgetProgram } from '@solana/web3.js';
import bs58 from 'bs58';
import {
  createRpc,
  LightSystemProgram,
  selectMinCompressedSolAccountsForTransfer,
  defaultTestStateTreeAccounts,
} from '@lightprotocol/stateless.js';


const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || "https://api.mainnet-beta.solana.com";
const RELAY_WALLET_PUB = new PublicKey("47Sph1rBUk6mopq42butRrjN9rGjWCVdSeeWUAMgteUh");

export default function BridgePage() {
  const wallet = useWallet();
  const { publicKey, sendTransaction } = wallet;
  const [amount, setAmount] = useState('');
  const [selectedChain, setSelectedChain] = useState('');
  const [selectedWalletType, setSelectedWalletType] = useState<'pub' | 'priv'>('pub');
  const [publicBalance, setPublicBalance] = useState<string | null>(null);
  const [privateBalance, setPrivateBalance] = useState<string | null>(null);
  const [destinationAddress, setDestinationAddress] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [transactionStep, setTransactionStep] = useState(0);
  const [showChainDropdown, setShowChainDropdown] = useState(false);
  const [chainSearchQuery, setChainSearchQuery] = useState('');
  const [supportedChains, setSupportedChains] = useState<any[]>([]);
  const [chainsLoading, setChainsLoading] = useState(true);
  const [quote, setQuote] = useState<any>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteError, setQuoteError] = useState('');
  const [status, setStatus] = useState('');
  const [bridgeError, setBridgeError] = useState('');

  useEffect(() => {
    const fetchChains = async () => {
      try {
        setChainsLoading(true);
        const response = await fetch('/api/Bridge/chains');
        const data = await response.json();
        if (data.chains) {
          setSupportedChains(data.chains);
        }
      } catch (error) {
        console.error('Failed to fetch chains:', error);
        setSupportedChains([
          { id: 'bnb', name: 'BNB Chain', icon: '🟡', native: 'BNB' },
          { id: 'ethereum', name: 'Ethereum', icon: '⚪', native: 'ETH' },
          { id: 'polygon', name: 'Polygon', icon: '🟣', native: 'MATIC' },
          { id: 'avalanche', name: 'Avalanche', icon: '🔴', native: 'AVAX' },
        ]);
      } finally {
        setChainsLoading(false);
      }
    };
    fetchChains();
  }, []);

  const checkPrivateBalance = useCallback(async (address: string) => {
    if (!address) return null;
    try {
      const connection = await createRpc(RPC_URL);
      const compressedAccounts = await connection.getCompressedAccountsByOwner(new PublicKey(address));
      const totalLamports = compressedAccounts.items.reduce((sum: bigint, account: any) =>
        BigInt(sum) + BigInt(account.lamports || 0), BigInt(0));
      const solBalance = Number(totalLamports) / 1e9;
      return solBalance.toFixed(3);
    } catch (err) {
      console.error('Error checking private balance:', err);
      return null;
    }
  }, []);

  const checkPublicBalance = useCallback(async (address: string) => {
    if (!address) return null;
    try {
      const connection = await createRpc(RPC_URL);
      const balance = await connection.getBalance(new PublicKey(address));
      return (balance / 1e9).toFixed(3);
    } catch (err) {
      console.error('Error checking public balance:', err);
      return null;
    }
  }, []);

  useEffect(() => {
    if (publicKey) {
      checkPrivateBalance(publicKey.toString()).then(balance => {
        setPrivateBalance(balance);
      });
      checkPublicBalance(publicKey.toString()).then(balance => {
        setPublicBalance(balance);
      });
    }
  }, [publicKey, checkPrivateBalance, checkPublicBalance]);

  const handlePubButtonClick = () => {
    setSelectedWalletType('pub');
    if (publicBalance !== null) {
      const balance = parseFloat(publicBalance);
      const availableAmount = Math.max(0, balance - 0.005);
      setAmount(availableAmount.toFixed(3));
    }
  };

  const handlePrivButtonClick = () => {
    setSelectedWalletType('priv');
    if (privateBalance !== null) {
      const balance = parseFloat(privateBalance);
      const availableAmount = Math.max(0, balance - 0.005);
      setAmount(availableAmount.toFixed(3));
    }
  };

  const calculateNetworkFee = () => {
    const transferAmount = parseFloat(amount) || 0;
    return (transferAmount * 0.01).toFixed(4);
  };

  const fetchQuote = useCallback(async () => {
    if (!amount || !selectedChain || !publicKey || !destinationAddress) {
      setQuote(null);
      return;
    }

    try {
      setQuoteLoading(true);
      setQuoteError('');
      
      const selectedChainData = supportedChains.find(c => c.id === selectedChain);
      if (!selectedChainData) return;

      const response = await fetch('/api/Bridge/quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount,
          destinationChainId: selectedChainData.chainId,
          userAddress: publicKey.toString(),
          destinationAddress,
          destinationCurrency: selectedChainData.currency?.address || '0x0000000000000000000000000000000000000000'
        })
      });

      const quoteData = await response.json();
      if (response.ok) {
        setQuote(quoteData);
      } else {
        setQuoteError(quoteData.error || 'Failed to get quote');
      }
    } catch (error) {
      setQuoteError('Failed to fetch quote');
      console.error('Quote fetch error:', error);
    } finally {
      setQuoteLoading(false);
    }
  }, [amount, selectedChain, publicKey, destinationAddress, supportedChains]);

  useEffect(() => {
    if (!amount || !selectedChain || !publicKey || !destinationAddress) return;

    fetchQuote();
    const interval = setInterval(fetchQuote, 3000);

    return () => clearInterval(interval);
  }, [fetchQuote]);

  const calculateEstimatedOutput = () => {
    if (quote && quote.details?.currencyOut?.amountFormatted) {
      return quote.details.currencyOut.amountFormatted;
    }
    return '0.000000';
  };

  const getSelectedChainNative = () => {
    const chain = supportedChains.find(c => c.id === selectedChain);
    return chain ? chain.native : '';
  };

  const handlePublicBridge = useCallback(async () => {
    console.log('=== STARTING PUBLIC BRIDGE EXECUTION ===');
    console.log('User pressed initiate bridge button');
    console.log('Bridge parameters:', {
      publicKey: publicKey?.toString(),
      destinationAddress,
      amount,
      selectedChain: selectedChain,
      chainId: selectedChain
    });

    if (!wallet || !wallet.connected || !publicKey || !sendTransaction) {
      throw new Error('Please connect your wallet');
    }

    if (!amount || !selectedChain || !destinationAddress) {
      throw new Error('Missing required bridge parameters');
    }

    try {
      setStatus('Getting fresh quote for execution...');
      setTransactionStep(1);
      setBridgeError('');

      console.log('=== GETTING FRESH QUOTE FOR EXECUTION ===');
      const quoteResponse = await fetch('/api/Bridge/quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount,
          destinationChainId: selectedChain,
          userAddress: publicKey.toString(),
          destinationAddress
        })
      });

      if (!quoteResponse.ok) {
        throw new Error('Failed to get execution quote');
      }

      const executionQuote = await quoteResponse.json();
      console.log('Fresh execution quote received:', executionQuote);

      console.log('=== EXECUTING BRIDGE TRANSACTION ===');
      const response = await fetch('/api/Bridge/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'executePublicBridge',
          quote: executionQuote
        })
      });

      if (!response.ok) {
        throw new Error('Failed to prepare bridge transaction');
      }

      const responseData = await response.json();
      console.log('Bridge execute response:', responseData);
      const { instructions } = responseData;
      console.log('Transaction instructions received:', instructions);

      setStatus('Compiling transaction...');
      setTransactionStep(2);

      console.log('=== ANALYZING INSTRUCTIONS FOR LOOKUP TABLES ===');
      instructions.forEach((inst: any, index: number) => {
        console.log(`Instruction ${index}:`, {
          programId: inst.programId,
          keysCount: inst.keys?.length || 0,
          dataLength: inst.data?.length || 0,
          keys: inst.keys?.map((key: any) => ({
            pubkey: key.pubkey,
            isSigner: key.isSigner,
            isWritable: key.isWritable
          }))
        });
      });

      console.log('=== COMPILING TRANSACTION MESSAGE ===');
      const connection = await createRpc(RPC_URL);
      const { context: { slot: minContextSlot }, value: blockhashCtx } =
        await connection.getLatestBlockhashAndContext();

      console.log('Using blockhash:', blockhashCtx.blockhash);
      console.log('Payer key:', publicKey.toString());

      const processedInstructions = instructions.map((inst: any, index: number) => {
        console.log(`Processing instruction ${index}:`, {
          programId: inst.programId,
          dataType: typeof inst.data,
          dataLength: inst.data?.length,
          isString: typeof inst.data === 'string',
          firstFewChars: typeof inst.data === 'string' ? inst.data.substring(0, 20) : 'not string'
        });

        let instructionData;
        if (typeof inst.data === 'string') {
          const hexData = inst.data.startsWith('0x') ? inst.data.slice(2) : inst.data;
          instructionData = Buffer.from(hexData, 'hex');
          console.log(`Converted hex data to Buffer:`, {
            originalHex: inst.data,
            bufferLength: instructionData.length
          });
        } else if (Array.isArray(inst.data)) {
          instructionData = Buffer.from(inst.data);
          console.log(`Converted array data to Buffer:`, {
            arrayLength: inst.data.length,
            bufferLength: instructionData.length
          });
        } else {
          instructionData = Buffer.from(inst.data);
          console.log(`Using data as-is for Buffer conversion`);
        }

        return {
          programId: new PublicKey(inst.programId),
          keys: inst.keys.map((key: any) => ({
            pubkey: new PublicKey(key.pubkey),
            isSigner: key.isSigner,
            isWritable: key.isWritable
          })),
          data: instructionData
        };
      });

      console.log('=== CREATING TRANSACTION MESSAGE ===');
      const transactionMessage = new TransactionMessage({
        payerKey: publicKey,
        recentBlockhash: blockhashCtx.blockhash,
        instructions: processedInstructions
      });

      console.log('=== COMPILING TO V0 MESSAGE (NO LOOKUP TABLES) ===');
      let transaction;
      let signature;
      
      try {
        const messageV0 = transactionMessage.compileToV0Message([]);
        console.log('V0 message compilation successful');
        
        transaction = new VersionedTransaction(messageV0);
        console.log('Transaction created, sending to user for signature...');
        
        signature = await sendTransaction(transaction, connection, { minContextSlot });
        console.log('Transaction signed and sent, signature:', signature);
      } catch (v0Error) {
        console.error('V0 compilation failed, trying legacy transaction:', v0Error);
        
        const legacyTransaction = new Transaction({
          feePayer: publicKey,
          recentBlockhash: blockhashCtx.blockhash
        });
        
        processedInstructions.forEach((instruction: any) => {
          legacyTransaction.add(instruction);
        });
        
        console.log('Legacy transaction created, sending to user for signature...');
        signature = await sendTransaction(legacyTransaction, connection, { minContextSlot });
        console.log('Legacy transaction signed and sent, signature:', signature);
      }

      setStatus('Confirming bridge transaction...');
      setTransactionStep(3);

      console.log('=== CONFIRMING TRANSACTION ===');
      await connection.confirmTransaction(signature, 'confirmed');
      console.log('Transaction confirmed successfully!');

      setStatus('✅ Bridge transaction completed successfully!');
      setTransactionStep(4);

      setTimeout(async () => {
        if (publicKey) {
          const newPublicBalance = await checkPublicBalance(publicKey.toString());
          setPublicBalance(newPublicBalance);
        }
      }, 2000);

    } catch (error: any) {
      console.error('Public bridge error:', error);
      setBridgeError(error.message || 'Public bridge failed');
      setTransactionStep(0);
      throw error;
    }
  }, [wallet, publicKey, sendTransaction, quote, checkPublicBalance]);

  const handlePrivateBridge = useCallback(async () => {
    console.log('=== STARTING PRIVATE BRIDGE EXECUTION ===');
    console.log('User pressed initiate bridge button for private balance');
    console.log('Bridge parameters:', {
      publicKey: publicKey?.toString(),
      destinationAddress,
      amount,
      selectedChain: selectedChain,
      chainId: selectedChain
    });

    if (!wallet || !wallet.connected || !publicKey || !sendTransaction) {
      throw new Error('Please connect your wallet');
    }

    if (!amount || !selectedChain || !destinationAddress) {
      throw new Error('Missing required bridge parameters');
    }

    try {
      setStatus('Starting private bridge...');
      setTransactionStep(1);
      setBridgeError('');

      const transferAmount = parseFloat(amount);
      const lamportsAmount = transferAmount * 1e9;

      console.log('=== STEP 1: UNSHIELDING PRIVATE BALANCE ===');
      setStatus('Getting compressed accounts...');
      const connection = await createRpc(RPC_URL);
      const accounts = await connection.getCompressedAccountsByOwner(publicKey);

      if (!accounts || !accounts.items || accounts.items.length === 0) {
        throw new Error('No compressed accounts found. Please shield some SOL first.');
      }

      const [selectedAccounts, _] = selectMinCompressedSolAccountsForTransfer(
        accounts.items,
        lamportsAmount
      );

      if (!selectedAccounts || selectedAccounts.length === 0) {
        throw new Error('Insufficient private balance for bridge.');
      }

      console.log('Selected compressed accounts:', selectedAccounts.length);

      setStatus('Getting validity proof...');
      const { compressedProof, rootIndices } = await connection.getValidityProof(
        selectedAccounts.map(account => {
          const hashBuffer = Buffer.from(account.hash);
          return hashBuffer;
        })
      );

      console.log('=== CREATING UNSHIELD TRANSACTION ===');
      setStatus('Creating unshield transaction...');
      const unshieldInstruction = await LightSystemProgram.decompress({
        payer: publicKey,
        toAddress: publicKey,
        lamports: lamportsAmount,
        inputCompressedAccounts: selectedAccounts,
        recentValidityProof: compressedProof,
        recentInputStateRootIndices: rootIndices,
      });

      const unshieldInstructions = [
        ComputeBudgetProgram.setComputeUnitLimit({ units: 1_000_000 }),
        unshieldInstruction,
      ];

      const { context: { slot: minContextSlot }, value: blockhashCtx } =
        await connection.getLatestBlockhashAndContext();

      console.log('Using blockhash for unshield:', blockhashCtx.blockhash);

      const messageV0 = new TransactionMessage({
        payerKey: publicKey,
        recentBlockhash: blockhashCtx.blockhash,
        instructions: unshieldInstructions,
      }).compileToV0Message();

      const unshieldTransaction = new VersionedTransaction(messageV0);

      console.log('=== SENDING UNSHIELD TRANSACTION ===');
      setStatus('Sending unshield transaction...');
      const unshieldSignature = await sendTransaction(unshieldTransaction, connection, { minContextSlot });
      console.log('Unshield transaction sent, signature:', unshieldSignature);

      setStatus('Confirming unshield transaction...');
      await connection.confirmTransaction(unshieldSignature, 'confirmed');
      console.log('Unshield transaction confirmed');

      setTransactionStep(2);

      console.log('=== WAITING FOR BALANCE UPDATE ===');
      setStatus('Waiting for balance update...');
      await new Promise(resolve => setTimeout(resolve, 3000));

      const newPublicBalance = await checkPublicBalance(publicKey.toString());
      setPublicBalance(newPublicBalance);
      console.log('Updated public balance after unshield:', newPublicBalance);

      console.log('=== STEP 2: EXECUTING BRIDGE TRANSACTION ===');
      setStatus('Getting fresh quote for bridge execution...');
      setTransactionStep(3);

      const adjustedAmount = (parseFloat(amount) * 0.989).toString();
      console.log('Adjusting quote amount for unshield fee:', { originalAmount: amount, adjustedAmount });

      const quoteResponse = await fetch('/api/Bridge/quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: adjustedAmount,
          destinationChainId: selectedChain,
          userAddress: publicKey.toString(),
          destinationAddress
        })
      });

      if (!quoteResponse.ok) {
        throw new Error('Failed to get bridge quote after unshielding');
      }

      const executionQuote = await quoteResponse.json();
      console.log('Fresh bridge quote received:', executionQuote);

      console.log('=== EXECUTING BRIDGE TRANSACTION ===');
      const response = await fetch('/api/Bridge/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'executePublicBridge',
          quote: executionQuote
        })
      });

      if (!response.ok) {
        throw new Error('Failed to execute bridge transaction');
      }

      const responseData = await response.json();
      console.log('Bridge execute response:', responseData);
      const { instructions } = responseData;

      setStatus('Compiling bridge transaction...');

      const processedInstructions = instructions.map((inst: any, index: number) => {
        console.log(`Processing bridge instruction ${index}:`, {
          programId: inst.programId,
          dataType: typeof inst.data,
          dataLength: inst.data?.length,
          isString: typeof inst.data === 'string'
        });

        let instructionData;
        if (typeof inst.data === 'string') {
          const hexData = inst.data.startsWith('0x') ? inst.data.slice(2) : inst.data;
          instructionData = Buffer.from(hexData, 'hex');
        } else if (Array.isArray(inst.data)) {
          instructionData = Buffer.from(inst.data);
        } else {
          instructionData = Buffer.from(inst.data);
        }

        return {
          programId: new PublicKey(inst.programId),
          keys: inst.keys.map((key: any) => ({
            pubkey: new PublicKey(key.pubkey),
            isSigner: key.isSigner,
            isWritable: key.isWritable
          })),
          data: instructionData
        };
      });

      const { context: { slot: bridgeMinContextSlot }, value: bridgeBlockhashCtx } =
        await connection.getLatestBlockhashAndContext();

      console.log('Using blockhash for bridge:', bridgeBlockhashCtx.blockhash);

      const bridgeTransactionMessage = new TransactionMessage({
        payerKey: publicKey,
        recentBlockhash: bridgeBlockhashCtx.blockhash,
        instructions: processedInstructions
      });

      console.log('=== COMPILING BRIDGE TRANSACTION ===');
      try {
        const bridgeMessageV0 = bridgeTransactionMessage.compileToV0Message([]);
        const bridgeTransaction = new VersionedTransaction(bridgeMessageV0);
        
        console.log('=== SENDING BRIDGE TRANSACTION ===');
        setStatus('Sending bridge transaction...');
        const bridgeSignature = await sendTransaction(bridgeTransaction, connection, { minContextSlot: bridgeMinContextSlot });
        console.log('Bridge transaction sent, signature:', bridgeSignature);

        setStatus('Confirming bridge transaction...');
        await connection.confirmTransaction(bridgeSignature, 'confirmed');
        console.log('Bridge transaction confirmed');

      } catch (v0Error) {
        console.error('V0 compilation failed, trying legacy transaction:', v0Error);
        
        const legacyTransaction = new Transaction({
          feePayer: publicKey,
          recentBlockhash: bridgeBlockhashCtx.blockhash
        });
        
        processedInstructions.forEach((instruction: any) => {
          legacyTransaction.add(instruction);
        });
        
        console.log('Legacy bridge transaction created, sending...');
        const bridgeSignature = await sendTransaction(legacyTransaction, connection, { minContextSlot: bridgeMinContextSlot });
        console.log('Legacy bridge transaction sent, signature:', bridgeSignature);

        setStatus('Confirming bridge transaction...');
        await connection.confirmTransaction(bridgeSignature, 'confirmed');
        console.log('Legacy bridge transaction confirmed');
      }

      setStatus('✅ Private bridge completed successfully!');
      setTransactionStep(4);

      console.log('=== UPDATING BALANCES AFTER BRIDGE ===');
      setTimeout(async () => {
        if (publicKey) {
          const newPrivateBalance = await checkPrivateBalance(publicKey.toString());
          const newPublicBalance = await checkPublicBalance(publicKey.toString());
          setPrivateBalance(newPrivateBalance);
          setPublicBalance(newPublicBalance);
          console.log('Final balances - Private:', newPrivateBalance, 'Public:', newPublicBalance);
        }
      }, 2000);

    } catch (error: any) {
      console.error('Private bridge error:', error);
      setBridgeError(error.message || 'Private bridge failed');
      setTransactionStep(0);
      throw error;
    }
  }, [wallet, publicKey, sendTransaction, amount, selectedChain, destinationAddress, checkPrivateBalance, checkPublicBalance]);

  const handleTransfer = useCallback(async () => {
    if (!amount || !selectedChain || !destinationAddress || !publicKey) {
      setBridgeError('Please fill in all required fields');
      return;
    }

    setIsLoading(true);
    setBridgeError('');
    setTransactionStep(0);
    setStatus('');

    try {
      await fetch('/api/analytics/track', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          operation: selectedWalletType === 'pub' ? 'bridge_public' : 'bridge_private',
          amount_sol: parseFloat(amount),
          token_symbol: getSelectedChainNative(),
          user_wallet: publicKey?.toString() || ''
        }),
      });
    } catch (trackingError) {
      console.error('Analytics tracking failed:', trackingError);
    }

    try {
      if (selectedWalletType === 'pub') {
        await handlePublicBridge();
      } else {
        await handlePrivateBridge();
      }
    } catch (error: any) {
      console.error('Bridge transfer error:', error);
      setBridgeError(error.message || 'Bridge transfer failed');
    } finally {
      setIsLoading(false);
      setTimeout(() => {
        setStatus('');
      }, 10000);
    }
  }, [amount, selectedChain, destinationAddress, publicKey, selectedWalletType, handlePublicBridge, handlePrivateBridge]);

  const filteredChains = supportedChains.filter(chain =>
    chain.name.toLowerCase().includes(chainSearchQuery.toLowerCase()) ||
    chain.native.toLowerCase().includes(chainSearchQuery.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-gradient-to-b from-zinc-950 to-[#16151E] text-white">
      <NavBar />
      <div className="pt-16 pb-8 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">

        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold mb-2">
            {" "}
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-indigo-300">
              Private Cross-Chain Bridge
            </span>
          </h1>
          <p className="text-white/70 text-sm">
            Bridge funds across chains with complete anonymity in under 10 seconds
          </p>
        </div>

        {/* Centered Cards */}
        <div className="max-w-2xl mx-auto space-y-4">
          {/* Progress Bar */}
          <div className="bg-zinc-800/40 backdrop-blur-sm border border-zinc-600/30 rounded-lg p-2">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium text-white/80">Transaction Progress</span>
              <span className="text-xs text-white/60">
                {transactionStep}/4 steps
              </span>
            </div>
            <div className="w-full bg-zinc-700/50 rounded-full h-1.5">
              <div
                className="bg-gradient-to-r from-purple-500 to-indigo-400 h-1.5 rounded-full transition-all duration-500"
                style={{
                  width: `${(transactionStep / 4) * 100}%`
                }}
              ></div>
            </div>
            <div className="flex justify-between mt-1 text-xs text-white/50">
              <span className={transactionStep >= 1 ? "text-purple-400" : ""}>Sign</span>
              <span className={transactionStep >= 2 ? "text-purple-400" : ""}>Bridge Out</span>
              <span className={transactionStep >= 3 ? "text-purple-400" : ""}>Cross-Chain</span>
              <span className={transactionStep >= 4 ? "text-purple-400" : ""}>Confirmed</span>
            </div>
          </div>

          {/* Transfer Details Card */}
          <div className="bg-zinc-800/60 backdrop-blur-sm border border-zinc-600/40 rounded-lg p-4">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h2 className="text-base font-semibold text-white">Transfer Details</h2>
                <p className="text-white/60 text-xs">Configure your cross-chain bridge</p>
              </div>
              {/* Balance Display - Top Right Stacked */}
              <div className="flex flex-col items-end gap-0.5">
                <div className="flex items-center gap-1">
                  <span className="text-blue-500 text-xs font-medium">Public:</span>
                  <span className="text-blue-500 text-xs font-medium">
                    {publicBalance !== null ? `${publicBalance} SOL` : '...'}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-green-500 text-xs font-medium">Private:</span>
                  <span className="text-green-500 text-xs font-medium">
                    {privateBalance !== null ? `${privateBalance} SOL` : '...'}
                  </span>
                </div>
              </div>
            </div>

            {/* Amount Input with Pub/Priv Buttons */}
            <div>
              <label className="block text-white font-medium mb-2 text-sm">Amount (SOL)</label>
              <div className="flex gap-2">
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="flex-1 px-3 py-2 bg-zinc-800/60 border border-zinc-700/50 rounded-lg text-white placeholder-white/40 focus:outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/50 text-sm"
                  placeholder="Enter amount"
                />
                <button
                  onClick={handlePubButtonClick}
                  className={`px-3 py-2 rounded-lg text-xs font-medium transition-all duration-200 ${
                    selectedWalletType === "pub"
                      ? "bg-blue-500 text-white"
                      : "bg-zinc-700/50 text-white/70 hover:bg-zinc-600/50"
                  }`}
                >
                  PUB
                </button>
                <button
                  onClick={handlePrivButtonClick}
                  className={`px-3 py-2 rounded-lg text-xs font-medium transition-all duration-200 ${
                    selectedWalletType === "priv"
                      ? "bg-green-500 text-white"
                      : "bg-zinc-700/50 text-white/70 hover:bg-zinc-600/50"
                  }`}
                >
                  PRIV
                </button>
              </div>
            </div>
          </div>

          {/* Chain Selector Card */}
          <div className={`bg-zinc-800/60 backdrop-blur-sm border border-zinc-600/40 rounded-lg p-4 ${showChainDropdown ? 'relative z-[1000]' : ''}`}>
            <div>
              <label className="block text-white font-medium mb-2 text-sm">Destination Chain</label>
              <div className="relative">
                <button
                  className="w-full px-3 py-2 bg-[#131320] border border-zinc-800/70 rounded-lg text-white text-left flex items-center justify-between hover:bg-[#1a1a27] transition-colors text-sm"
                  onClick={() => setShowChainDropdown(!showChainDropdown)}
                  disabled={isLoading}
                >
                  <span>{selectedChain ? supportedChains.find(c => c.id === selectedChain)?.name : 'Select destination chain'}</span>
                  <ChevronDown className={`h-4 w-4 transition-transform ${showChainDropdown ? 'rotate-180' : ''}`} />
                </button>

                {showChainDropdown && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-[#131320] border border-zinc-800/70 rounded-lg shadow-lg z-[999] max-h-64 overflow-hidden">
                    {/* Search Input */}
                    <div className="p-2 border-b border-zinc-800/70">
                      <input
                        type="text"
                        value={chainSearchQuery}
                        onChange={(e) => setChainSearchQuery(e.target.value)}
                        className="w-full px-2 py-1.5 bg-zinc-800/60 border border-zinc-700/50 rounded text-white placeholder-white/40 focus:outline-none focus:border-purple-500/50 text-xs"
                        placeholder="Search chains..."
                        autoFocus
                      />
                    </div>

                    {/* Chain Options */}
                    <div className="max-h-48 overflow-y-auto">
                      {chainsLoading ? (
                        <div className="px-3 py-2 text-white/60 text-sm">Loading chains...</div>
                      ) : filteredChains.length > 0 ? (
                        filteredChains.map((chain) => (
                          <button
                            key={chain.id}
                            className="w-full px-3 py-2 text-left hover:bg-[#1a1a27] transition-colors text-white hover:text-white flex items-center justify-between text-sm"
                            onClick={() => {
                              setSelectedChain(chain.id);
                              setShowChainDropdown(false);
                              setChainSearchQuery('');
                            }}
                            disabled={isLoading}
                          >
                            <div>
                              <div className="font-medium">{chain.name}</div>
                              <div className="text-xs text-white/60">Native: {chain.native}</div>
                            </div>
                            <span className="text-lg">{chain.icon}</span>
                          </button>
                        ))
                      ) : (
                        <div className="px-3 py-2 text-white/60 text-xs">
                          No chains found
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Destination Address Card */}
          <div className="bg-zinc-800/60 backdrop-blur-sm border border-zinc-600/40 rounded-lg p-4">
            <div className="space-y-4">
              {/* Destination Address */}
              <div>
                <label className="block text-white font-medium mb-2 text-sm">Destination Wallet Address</label>
                <input
                  type="text"
                  value={destinationAddress}
                  onChange={(e) => setDestinationAddress(e.target.value)}
                  className="w-full px-3 py-2 bg-zinc-800/60 border border-zinc-700/50 rounded-lg text-white placeholder-white/40 focus:outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/50 text-sm"
                  placeholder={selectedChain ? `Enter ${supportedChains.find(c => c.id === selectedChain)?.name} address...` : "Select chain first..."}
                />
              </div>

              {/* Estimated Output Amount */}
              <div>
                <label className="block text-white font-medium mb-2 text-sm">Estimated Amount You'll Receive</label>
                <div className="w-full px-3 py-2 bg-zinc-800/60 border border-zinc-700/50 rounded-lg text-white text-sm">
                  <span className={amount && selectedChain ? "text-white" : "text-white/40"}>
                    {quoteLoading ? "Getting quote..." : 
                     quoteError ? "Quote unavailable, retrying..." :
                     amount && selectedChain ? `${calculateEstimatedOutput()} ${getSelectedChainNative()}` : 
                     "Enter amount and select chain..."}
                  </span>
                </div>
              </div>

              {error && (
                <div className="bg-red-900/20 border border-red-500/30 rounded-lg p-2 text-red-400 text-xs">
                  {error}
                </div>
              )}

              {/* Summary */}
              <div className="bg-zinc-800/40 rounded-lg p-3 space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="text-white/60">Transfer Amount</span>
                  <span className="text-white">{amount || '0.00'} SOL</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-white/60">Estimated Amount Received</span>
                  <span className="text-white">
                    {quoteLoading ? "Getting quote..." :
                     quoteError ? "Quote unavailable, retrying..." :
                     amount && selectedChain ? `${calculateEstimatedOutput()} ${getSelectedChainNative()}` : '0.00'}
                  </span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-white/60">Network Fee (1%)</span>
                  <span className="text-white">{calculateNetworkFee()} SOL</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-white/60">Estimated Time</span>
                  <span className="text-white">~10 seconds</span>
                </div>
              </div>

              {/* Action Button */}
              <button
                onClick={handleTransfer}
                disabled={isLoading || !destinationAddress.trim() || !amount || !selectedChain}
                className={`w-full font-semibold py-3 px-4 rounded-lg transition-all duration-300 flex items-center justify-center gap-2 text-sm ${
                  isLoading || !destinationAddress.trim() || !amount || !selectedChain
                    ? 'bg-gray-600 cursor-not-allowed text-gray-400'
                    : 'bg-gradient-to-r from-purple-500 to-indigo-400 hover:from-purple-600 hover:to-indigo-500 text-white'
                }`}
              >
                {isLoading ? 'Processing Bridge...' : `Bridge ${selectedWalletType === 'pub' ? 'Public' : 'Private'} Balance`}
                {!isLoading && <ArrowLeft className="h-3.5 w-3.5 rotate-180" />}
              </button>
            </div>
          </div>

          {/* Bridge Progress */}
          {(transactionStep > 0 || status) && (
            <div className="bg-zinc-800/40 rounded-lg p-3 space-y-2">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium text-white/80">Bridge Progress</span>
                <span className="text-xs text-white/60">{transactionStep}/4 steps</span>
              </div>
              <div className="w-full bg-zinc-700/50 rounded-full h-1.5">
                <div
                  className="bg-gradient-to-r from-purple-500 to-indigo-400 h-1.5 rounded-full transition-all duration-500"
                  style={{ width: `${(transactionStep / 4) * 100}%` }}
                ></div>
              </div>
              <div className="flex justify-between mt-1 text-xs text-white/50">
                <span className={transactionStep >= 1 ? "text-purple-400" : ""}>Prepare</span>
                <span className={transactionStep >= 2 ? "text-purple-400" : ""}>Execute</span>
                <span className={transactionStep >= 3 ? "text-purple-400" : ""}>Confirm</span>
                <span className={transactionStep >= 4 ? "text-purple-400" : ""}>Complete</span>
              </div>
              {status && (
                <div className="mt-2 text-xs text-blue-400 text-center">
                  {status}
                </div>
              )}
              {bridgeError && (
                <div className="mt-2 text-xs text-red-400 text-center">
                  {bridgeError}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
