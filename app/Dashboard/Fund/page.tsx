"use client";

import React, { useState, useCallback, useEffect } from "react";
import { ArrowLeft, Clock, DollarSign, Shield, Zap, RotateCcw } from "lucide-react";
import NavBar from "@/components/navBar";
import { useWallet } from '@solana/wallet-adapter-react';
import { ComputeBudgetProgram, TransactionMessage, VersionedTransaction, PublicKey, SystemProgram } from '@solana/web3.js';
import bs58 from 'bs58';
import {
  createRpc,
  LightSystemProgram,
  selectMinCompressedSolAccountsForTransfer,
  defaultTestStateTreeAccounts,
  bn,
} from '@lightprotocol/stateless.js';

interface PrivacyLevel {
  id: string;
  name: string;
  description: string;
  icon: React.ElementType;
  time: string;
  fee: string;
  privacyLevel: string;
  iconColor: string;
  borderColor: string;
}

const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || "https://api.mainnet-beta.solana.com";

const FEE_RECIPIENT = new PublicKey("47Sph1rBUk6mopq42butRrjN9rGjWCVdSeeWUAMgteUh");
const RELAY_WALLET_PUB = new PublicKey("47Sph1rBUk6mopq42butRrjN9rGjWCVdSeeWUAMgteUh");
const RELAY_BNB_WALLET = "0x1F842d9E53e20a2Bee70BE887581cfaBEF7f7b63";

const privacyLevels: PrivacyLevel[] = [
  {
    id: "fast-track",
    name: "Private",
    description: "Private Relay Transfer",
    icon: Zap,
    time: "~20 seconds",
    fee: "1%",
    privacyLevel: "Secure",
    iconColor: "text-yellow-400",
    borderColor: "border-yellow-500/30"
  },
  {
    id: "balanced",
    name: "Anonymous",
    description: "Cross-chain privacy routing",
    icon: RotateCcw,
    time: "~1 minute",
    fee: "None",
    privacyLevel: "Enhanced",
    iconColor: "text-blue-400",
    borderColor: "border-blue-500/30"
  }
];

export default function FundPage() {
  const wallet = useWallet();
  const { publicKey, sendTransaction } = wallet;
  const [selectedLevel, setSelectedLevel] = useState("fast-track");
  const [amount, setAmount] = useState("10");
  const [destinationAddress, setDestinationAddress] = useState("");
  const [publicBalance, setPublicBalance] = useState<string | null>(null);
  const [transactionStep, setTransactionStep] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [crossChainStatus, setCrossChainStatus] = useState<string>('');

  const selectedPrivacyLevel = privacyLevels.find(level => level.id === selectedLevel);

  const calculateNetworkFee = () => {
    const transferAmount = parseFloat(amount) || 0;
    if (selectedLevel === "balanced") {
      return "0.0200";
    }
    const baseFee = transferAmount * 0.01;
    return baseFee.toFixed(4);
  };

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
      checkPublicBalance(publicKey.toString()).then(balance => {
        setPublicBalance(balance);
      });
    }
  }, [publicKey, checkPublicBalance]);

  const validateDestinationAddress = (address: string): boolean => {
    if (!address || address.trim().length === 0) return false;
    try {
      new PublicKey(address);
      return true;
    } catch {
      return false;
    }
  };

  // Fast-track: Shield (compress) user public SOL to relay wallet + extract 1% fee
  // This is the ONE user signature in the entire fast-track flow
  const executeShieldToRelay = useCallback(async (): Promise<number> => {
    if (!wallet || !wallet.connected || !publicKey || !sendTransaction) {
      throw new Error('Please connect your wallet');
    }

    if (!validateDestinationAddress(destinationAddress)) {
      throw new Error('Please enter a valid destination wallet address');
    }

    const transferAmount = parseFloat(amount);
    if (isNaN(transferAmount) || transferAmount <= 0) {
      throw new Error('Please enter a valid amount');
    }

    const connection = await createRpc(RPC_URL);
    const lamportsAmount = transferAmount * 1e9;
    const feeAmount = Math.floor(lamportsAmount * 0.01);
    const shieldAmount = lamportsAmount - feeAmount;

    setStatus('Checking balance...');
    const userBalance = await connection.getBalance(publicKey);
    const totalRequired = lamportsAmount + 5000;

    if (userBalance < totalRequired) {
      throw new Error(`Insufficient balance. Need ${(totalRequired / 1e9).toFixed(4)} SOL but only have ${(userBalance / 1e9).toFixed(4)} SOL`);
    }

    setStatus('Creating shield transaction...');
    const shieldInstruction = await LightSystemProgram.compress({
      payer: publicKey,
      toAddress: RELAY_WALLET_PUB,
      lamports: shieldAmount,
      outputStateTree: defaultTestStateTreeAccounts().merkleTree,
    });

    const shieldInstructions = [
      ComputeBudgetProgram.setComputeUnitLimit({ units: 1_000_000 }),
      SystemProgram.transfer({
        fromPubkey: publicKey,
        toPubkey: FEE_RECIPIENT,
        lamports: feeAmount,
      }),
      shieldInstruction,
    ];

    const { context: { slot: minContextSlot }, value: blockhashCtx } =
      await connection.getLatestBlockhashAndContext();

    const messageV0 = new TransactionMessage({
      payerKey: publicKey,
      recentBlockhash: blockhashCtx.blockhash,
      instructions: shieldInstructions,
    }).compileToV0Message();

    const transaction = new VersionedTransaction(messageV0);

    setStatus('Please approve the transaction in your wallet...');
    const signature = await sendTransaction(transaction, connection, {
      minContextSlot,
    });

    setTransactionStep(1);
    setStatus('Confirming shield transaction...');

    // Confirm with retry
    for (let i = 0; i < 3; i++) {
      try {
        const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
        const confirmation = await connection.confirmTransaction({
          signature,
          blockhash,
          lastValidBlockHeight
        }, 'confirmed');

        if (confirmation.value.err) {
          throw new Error(`Transaction failed: ${confirmation.value.err}`);
        }

        const tx = await connection.getTransaction(signature, {
          maxSupportedTransactionVersion: 0
        });

        if (!tx) {
          throw new Error('Transaction not found');
        }

        console.log(`Shield transaction confirmed: ${signature}`);
        break;
      } catch (error) {
        console.log(`Shield confirmation attempt ${i + 1} failed:`, error);
        if (i === 2) throw error;
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

    setStatus('Funds shielded to relay wallet');
    setTransactionStep(2);

    return transferAmount - (transferAmount * 0.01);
  }, [wallet, publicKey, sendTransaction, amount, destinationAddress]);

  // Wait for relay wallet to have compressed accounts
  const waitForCompressedAccounts = async (connection: any, maxRetries = 5, delayMs = 2000) => {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        setStatus(`Checking relay wallet accounts (attempt ${attempt}/${maxRetries})...`);

        if (attempt > 1) {
          await new Promise(resolve => setTimeout(resolve, delayMs));
        }

        const compressedAccountsResponse = await connection.getCompressedAccountsByOwner(RELAY_WALLET_PUB);
        const compressedAccounts = compressedAccountsResponse.items;

        if (compressedAccounts && compressedAccounts.length > 0) {
          return compressedAccounts;
        }

        if (attempt === maxRetries) {
          throw new Error(`No compressed accounts found in relay wallet after ${maxRetries} attempts.`);
        }
      } catch (error) {
        if (attempt === maxRetries) {
          throw error;
        }
      }
    }
  };

  // Relay wallet unshields (decompresses) to destination - server-side, no user signature needed
  const handleRelayWalletUnshield = useCallback(async (transferAmount: number, bridgeAddress?: string) => {
    try {
      setStatus('Preparing relay wallet unshield...');
      setTransactionStep(3);

      await new Promise(resolve => setTimeout(resolve, 2000));

      const connection = await createRpc(RPC_URL);
      const lamportsAmount = transferAmount * 1e9;
      const targetAddress = bridgeAddress || destinationAddress;

      const compressedAccounts = await waitForCompressedAccounts(connection);

      const [selectedAccounts, _] = selectMinCompressedSolAccountsForTransfer(
        compressedAccounts,
        lamportsAmount
      );

      if (!selectedAccounts || selectedAccounts.length === 0) {
        throw new Error('Insufficient compressed balance in relay wallet');
      }

      const { compressedProof, rootIndices } = await connection.getValidityProof(
        selectedAccounts.map((account: any) => {
          const hashBuffer = Buffer.from(account.hash);
          return bn(hashBuffer);
        })
      );

      const unshieldInstruction = await LightSystemProgram.decompress({
        payer: RELAY_WALLET_PUB,
        inputCompressedAccounts: selectedAccounts,
        toAddress: new PublicKey(targetAddress),
        lamports: lamportsAmount,
        outputStateTree: defaultTestStateTreeAccounts().merkleTree,
        recentInputStateRootIndices: rootIndices,
        recentValidityProof: compressedProof,
      });

      const unshieldInstructions = [
        ComputeBudgetProgram.setComputeUnitLimit({ units: 1_000_000 }),
        unshieldInstruction,
      ];

      const { value: blockhashCtx } =
        await connection.getLatestBlockhashAndContext();

      // Send to server - relay wallet signs (no user signature needed)
      const response = await fetch('/api/fund', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instructions: unshieldInstructions.map((inst: any) => ({
            programId: inst.programId.toString(),
            keys: inst.keys.map((key: any) => ({
              pubkey: key.pubkey.toString(),
              isSigner: key.isSigner,
              isWritable: key.isWritable
            })),
            data: Array.from(inst.data)
          })),
          blockhash: blockhashCtx.blockhash,
          userPublicKey: publicKey?.toString()
        })
      });

      if (!response.ok) {
        throw new Error('Failed to process relay wallet unshield transaction');
      }

      const { transaction: serializedTransaction } = await response.json();
      const transaction = VersionedTransaction.deserialize(bs58.decode(serializedTransaction));

      setStatus('Sending funds to destination...');
      const signature = await connection.sendTransaction(transaction);

      // Confirm with retry
      for (let i = 0; i < 3; i++) {
        try {
          const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
          const confirmation = await connection.confirmTransaction({
            signature,
            blockhash,
            lastValidBlockHeight
          }, 'confirmed');

          if (confirmation.value.err) {
            throw new Error(`Transaction failed: ${confirmation.value.err}`);
          }

          const tx = await connection.getTransaction(signature, {
            maxSupportedTransactionVersion: 0
          });

          if (!tx) {
            throw new Error('Transaction not found');
          }

          console.log(`Relay unshield confirmed: ${signature}`);
          break;
        } catch (error) {
          console.log(`Confirmation attempt ${i + 1} failed:`, error);
          if (i === 2) throw error;
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }

      setStatus('Transfer complete!');
      setTransactionStep(4);

    } catch (err) {
      console.error('Relay unshield error:', err);
      throw err;
    }
  }, [destinationAddress, publicKey]);

  // ==========================================
  // Cross-chain (Anonymous) mode - kept as-is
  // ==========================================

  const getSolToBnbQuoteWithRetry = async (amountStr: string, maxRetries: number = 3) => {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        setCrossChainStatus(`Getting SOL to BNB quote... (attempt ${attempt}/${maxRetries})`);
        
        const solToBnbResponse = await fetch('/api/fund-crosschain', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'getSOLToBNBQuote',
            amount: (parseFloat(amountStr) * 1e9).toString(),
            userAddress: '47Sph1rBUk6mopq42butRrjN9rGjWCVdSeeWUAMgteUh',
            relayBNBAddress: RELAY_BNB_WALLET
          })
        });

        if (!solToBnbResponse.ok) {
          throw new Error('Failed to get SOL to BNB quote');
        }

        const solToBnbQuoteData = await solToBnbResponse.json();
        console.log(`SOL-to-BNB quote successful on attempt ${attempt}`);
        return solToBnbQuoteData;

      } catch (error: any) {
        console.error(`SOL-to-BNB quote attempt ${attempt} failed:`, error);
        if (attempt === maxRetries) {
          throw new Error(`Failed to get SOL-to-BNB quote after ${maxRetries} attempts: ${error.message}`);
        }
        const delayMs = Math.pow(2, attempt) * 1000;
        setCrossChainStatus(`Quote failed, retrying in ${delayMs/1000}s... (attempt ${attempt + 1}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }
  };

  const fetchBnbToSolQuoteWithRetry = async (recalculatedBnbAmount: string, maxRetries = 3): Promise<any> => {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        setCrossChainStatus(`Fetching BNB-to-SOL quote (attempt ${attempt}/${maxRetries})...`);

        const freshBnbToSolResponse = await fetch('/api/fund-crosschain', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'getBNBToSOLQuote',
            bnbAmount: recalculatedBnbAmount,
            relayBNBAddr: RELAY_BNB_WALLET,
            destinationAddress: destinationAddress
          })
        });

        if (!freshBnbToSolResponse.ok) {
          const errorText = await freshBnbToSolResponse.text();
          throw new Error(`API request failed: ${freshBnbToSolResponse.status} ${errorText}`);
        }

        const freshBnbToSolQuote = await freshBnbToSolResponse.json();

        if (!freshBnbToSolQuote.steps || !freshBnbToSolQuote.steps[0] || !freshBnbToSolQuote.steps[0].items || !freshBnbToSolQuote.steps[0].items[0]) {
          throw new Error('Invalid quote structure - missing required data');
        }

        console.log(`BNB-to-SOL quote successful on attempt ${attempt}`);
        return freshBnbToSolQuote;

      } catch (error: any) {
        console.error(`BNB-to-SOL quote attempt ${attempt} failed:`, error);
        if (attempt === maxRetries) {
          throw new Error(`Failed to get BNB-to-SOL quote after ${maxRetries} attempts: ${error.message}`);
        }
        const delayMs = Math.pow(2, attempt) * 1000;
        setCrossChainStatus(`Quote failed, retrying in ${delayMs/1000}s... (attempt ${attempt + 1}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }
  };

  const refundToUser = async (refundAmount: number) => {
    try {
      console.log('=== INITIATING REFUND TO USER ===');
      setCrossChainStatus('Refunding SOL to your wallet...');
      
      const connection = await createRpc(RPC_URL);
      
      const refundInstruction = SystemProgram.transfer({
        fromPubkey: RELAY_WALLET_PUB,
        toPubkey: publicKey!,
        lamports: Math.floor(refundAmount * 1e9)
      });

      const { value: blockhashCtx } = await connection.getLatestBlockhashAndContext();

      const response = await fetch('/api/fund', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instructions: [{
            programId: refundInstruction.programId.toString(),
            keys: refundInstruction.keys.map((key: any) => ({
              pubkey: key.pubkey.toString(),
              isSigner: key.isSigner,
              isWritable: key.isWritable
            })),
            data: Array.from(refundInstruction.data)
          }],
          blockhash: blockhashCtx.blockhash,
          userPublicKey: RELAY_WALLET_PUB.toString()
        })
      });

      if (!response.ok) {
        throw new Error('Failed to execute refund transaction');
      }

      const { transaction: serializedTransaction } = await response.json();
      const transaction = VersionedTransaction.deserialize(bs58.decode(serializedTransaction));

      const signature = await connection.sendTransaction(transaction);
      console.log('Refund transaction signature:', signature);

      await connection.confirmTransaction({
        signature,
        blockhash: blockhashCtx.blockhash,
        lastValidBlockHeight: blockhashCtx.lastValidBlockHeight,
      }, 'confirmed');

      console.log('Refund completed successfully:', signature);
      setCrossChainStatus('Refund completed successfully!');
      
    } catch (error: any) {
      console.error('Refund failed:', error);
      setCrossChainStatus('Refund failed - please contact support');
    }
  };

  const executeBnbTransactionWithRetry = async (bnbToSolQuote: any, maxRetries: number = 3) => {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        setCrossChainStatus(`Executing BNB to SOL bridge... (attempt ${attempt}/${maxRetries})`);

        const bnbTxData = bnbToSolQuote.steps?.[0]?.items?.[0]?.data;
        if (!bnbTxData) {
          throw new Error('No BNB transaction data found in quote');
        }

        const bnbResponse = await fetch('/api/fund-bnb', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            txData: bnbTxData.data || '0x',
            to: bnbTxData.to || bnbToSolQuote.details?.sender,
            value: bnbToSolQuote.details?.currencyIn?.amountFormatted || '0',
            gasLimit: bnbTxData.gasLimit || '21000'
          }),
        });

        if (!bnbResponse.ok) {
          const errorData = await bnbResponse.json();
          throw new Error(`Failed to execute BNB transaction: ${errorData.error || 'Unknown error'}`);
        }

        const bnbResult = await bnbResponse.json();
        console.log('BNB transaction successful:', bnbResult);

        setCrossChainStatus('Waiting for BNB to SOL bridge completion...');

        const bnbToSolCompletion = await fetch('/api/fund-crosschain', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'waitForCompletion',
            requestId: bnbToSolQuote.steps?.[0]?.requestId
          }),
        });

        if (!bnbToSolCompletion.ok) {
          console.warn('BNB to SOL bridge completion polling failed, but BNB transaction was sent');
        }

        console.log('BNB to SOL bridge completed successfully');
        return bnbResult;

      } catch (error: any) {
        console.error(`BNB transaction attempt ${attempt} failed:`, error);
        if (attempt === maxRetries) {
          throw error;
        }
        setCrossChainStatus(`BNB transaction failed, waiting for refund... (attempt ${attempt + 1}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, 10000));
        const recalculatedBnbAmount = bnbToSolQuote.details?.currencyIn?.amount || '0';
        bnbToSolQuote = await fetchBnbToSolQuoteWithRetry(recalculatedBnbAmount);
        const delayMs = Math.pow(2, attempt) * 1000;
        setCrossChainStatus(`Retrying in ${delayMs/1000}s... (attempt ${attempt + 1}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }
    
    throw new Error('BNB transaction failed after all retries');
  };

  const executeSolToBnbBridgeWithRetry = async (solToBnbQuote: any, maxRetries: number = 3) => {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        setCrossChainStatus(`Executing SOL to BNB bridge... (attempt ${attempt}/${maxRetries})`);

        const instructions = solToBnbQuote.steps?.[0]?.items?.[0]?.data?.instructions;

        if (!instructions || !Array.isArray(instructions)) {
          throw new Error('No valid instructions found in SOL to BNB quote');
        }

        const connection = await createRpc(RPC_URL);

        const transactionInstructions = instructions.map((inst: any) => ({
          keys: inst.keys.map((key: any) => ({
            pubkey: new PublicKey(key.pubkey),
            isSigner: key.isSigner,
            isWritable: key.isWritable
          })),
          programId: new PublicKey(inst.programId),
          data: Buffer.from(inst.data, 'hex')
        }));

        const { value: blockhashCtx } = await connection.getLatestBlockhashAndContext();

        const response = await fetch('/api/fund', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            instructions: transactionInstructions.map((inst: any) => ({
              programId: inst.programId.toString(),
              keys: inst.keys.map((key: any) => ({
                pubkey: key.pubkey.toString(),
                isSigner: key.isSigner,
                isWritable: key.isWritable
              })),
              data: Array.from(inst.data)
            })),
            blockhash: blockhashCtx.blockhash,
            userPublicKey: RELAY_WALLET_PUB.toString()
          })
        });

        if (!response.ok) {
          throw new Error('Failed to execute SOL to BNB bridge transaction');
        }

        const { transaction: serializedTransaction } = await response.json();
        const transaction = VersionedTransaction.deserialize(bs58.decode(serializedTransaction));

        const signature = await connection.sendTransaction(transaction);
        console.log('SOL to BNB bridge transaction signature:', signature);

        // Confirm with retry
        for (let i = 0; i < 3; i++) {
          try {
            const confirmation = await connection.confirmTransaction({
              signature,
              blockhash: blockhashCtx.blockhash,
              lastValidBlockHeight: blockhashCtx.lastValidBlockHeight,
            }, 'confirmed');

            const tx = await connection.getTransaction(signature, {
              commitment: 'confirmed',
              maxSupportedTransactionVersion: 0
            });

            if (!tx) {
              throw new Error('Transaction not found');
            }

            console.log(`SOL to BNB bridge transaction confirmed: ${signature}`);
            return signature;

          } catch (error: any) {
            console.log(`Bridge confirmation attempt ${i + 1} failed:`, error);
            if (i === 2) {
              if (error.message?.includes('expired') || error.message?.includes('blockhash')) {
                if (attempt < maxRetries) {
                  setCrossChainStatus(`Transaction expired, getting fresh quote... (attempt ${attempt + 1}/${maxRetries})`);
                  await new Promise(resolve => setTimeout(resolve, 3000));
                  solToBnbQuote = await getSolToBnbQuoteWithRetry(amount, 3);
                  continue;
                }
              }
              throw error;
            }
            await new Promise(resolve => setTimeout(resolve, 2000));
          }
        }

      } catch (error: any) {
        console.error(`SOL to BNB bridge attempt ${attempt} failed:`, error);
        if (attempt === maxRetries) {
          throw error;
        }
        const delayMs = Math.pow(2, attempt) * 1000;
        setCrossChainStatus(`Bridge failed, retrying in ${delayMs/1000}s... (attempt ${attempt + 1}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }
    
    throw new Error('SOL to BNB bridge failed after all retries');
  };

  // Cross-chain: shield to relay -> unshield to relay public -> SOL->BNB -> BNB->SOL -> destination
  const handleCrossChainTransfer = async () => {
    try {
      setTransactionStep(1);
      setCrossChainStatus('Shielding to relay wallet...');

      const transferAmount = await executeShieldToRelay();

      setTransactionStep(2);
      setCrossChainStatus('Unshielding to relay wallet public address...');

      await handleRelayWalletUnshield(transferAmount, RELAY_WALLET_PUB.toString());

      setCrossChainStatus('Waiting before getting bridge quotes...');
      await new Promise(resolve => setTimeout(resolve, 3000));

      setTransactionStep(3);
      
      try {
        const solToBnbQuote = await getSolToBnbQuoteWithRetry(amount, 3);

        const signature = await executeSolToBnbBridgeWithRetry(solToBnbQuote, 3);

        setTransactionStep(5);
        setCrossChainStatus('Waiting for bridge, then fetching BNB-to-SOL quote...');

        await new Promise(resolve => setTimeout(resolve, 5000));

        const recalculatedBnbAmount = Math.floor(parseFloat(solToBnbQuote.details.currencyOut.amount) * 0.995).toString();

        const freshBnbToSolQuote = await fetchBnbToSolQuoteWithRetry(recalculatedBnbAmount);

        setTransactionStep(5);
        
        await executeBnbTransactionWithRetry(freshBnbToSolQuote, 3);

        setTransactionStep(6);
        setCrossChainStatus('Cross-chain transfer completed successfully!');

      } catch (bridgeError: any) {
        console.error('Bridge process failed:', bridgeError);
        await refundToUser(transferAmount);
        throw new Error(`Bridge failed. Refund initiated: ${bridgeError.message}`);
      }

    } catch (err: any) {
      console.error('Cross-chain transfer error:', err);
      throw err;
    }
  };

  // Main transfer handler - one signature for fast-track, more for cross-chain
  const handleTransfer = async () => {
    try {
      setIsLoading(true);
      setError('');
      setTransactionStep(0);
      setCrossChainStatus('');

      if (selectedLevel === "balanced") {
        await handleCrossChainTransfer();
      } else {
        // Fast-track: user signs once (shield to relay) -> relay unshields to destination (no user sig)
        const netAmount = await executeShieldToRelay();
        await handleRelayWalletUnshield(netAmount);
      }

      // Refresh balance after transfer
      if (publicKey) {
        const newBalance = await checkPublicBalance(publicKey.toString());
        setPublicBalance(newBalance);
      }

    } catch (err: any) {
      console.error('Transfer error:', err);
      setError(err.message || 'Transfer failed');
      setTransactionStep(0);
      setCrossChainStatus('');
    } finally {
      setIsLoading(false);
      setTimeout(() => {
        setStatus('');
      }, 5000);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-zinc-950 to-[#16151E] text-white">
      <NavBar />
      <div className="pt-16 pb-8 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">

        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold mb-2 bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-indigo-300">
            Fund Privately
          </h1>
          <p className="text-white/70 text-sm">
            Choose your privacy level and fund your trading wallets with complete anonymity
          </p>
        </div>

        <div className="max-w-5xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Privacy Level Selection */}
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-white mb-3">Choose Privacy Level</h2>

            <div className="space-y-3">
              {privacyLevels.map((level) => {
                const Icon = level.icon;
                const isSelected = selectedLevel === level.id;

                return (
                  <button
                    key={level.id}
                    onClick={() => {
                      setSelectedLevel(level.id);
                      setTransactionStep(0);
                      setCrossChainStatus('');
                      setError('');
                    }}
                    className={`w-full p-3 rounded-lg border-2 transition-all duration-300 text-left ${
                      isSelected
                        ? `${level.borderColor} bg-zinc-800/60`
                        : "border-zinc-700/50 bg-zinc-900/40 hover:border-zinc-600/50"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`p-1.5 rounded-lg bg-zinc-800/60 ${level.iconColor}`}>
                        <Icon className="h-4 w-4" />
                      </div>

                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-1">
                          <h3 className="text-sm font-semibold text-white">{level.name}</h3>
                          {isSelected && (
                            <RotateCcw className="h-4 w-4 text-blue-400" />
                          )}
                        </div>
                        <p className="text-white/70 text-xs mb-2">{level.description}</p>

                        <div className="flex items-center gap-4 text-xs">
                          <div className="flex items-center gap-1 text-white/60">
                            <Clock className="h-3 w-3" />
                            <span>{level.time}</span>
                          </div>
                          <div className="flex items-center gap-1 text-white/60">
                            <DollarSign className="h-3 w-3" />
                            <span>{level.fee}</span>
                          </div>
                          <div className="flex items-center gap-1 text-white/60">
                            <Shield className="h-3 w-3" />
                            <span>{level.privacyLevel}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Transfer Details Panel */}
          <div className="space-y-2">
            {/* Progress Bar */}
            <div className="bg-zinc-800/40 backdrop-blur-sm border border-zinc-600/30 rounded-lg p-2">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium text-white/80">Transaction Progress</span>
                <span className="text-xs text-white/60">
                  {transactionStep}/{selectedLevel === "balanced" ? "6" : "4"} steps
                </span>
              </div>
              <div className="w-full bg-zinc-700/50 rounded-full h-1.5">
                <div
                  className="bg-gradient-to-r from-purple-500 to-indigo-400 h-1.5 rounded-full transition-all duration-500"
                  style={{
                    width: `${(transactionStep / (selectedLevel === "balanced" ? 6 : 4)) * 100}%`
                  }}
                ></div>
              </div>
              {selectedLevel === "balanced" ? (
                <div className="flex justify-between mt-1 text-xs text-white/50">
                  <span className={transactionStep >= 1 ? "text-purple-400" : ""}>Sign</span>
                  <span className={transactionStep >= 2 ? "text-purple-400" : ""}>Bridge Out</span>
                  <span className={transactionStep >= 3 ? "text-purple-400" : ""}>Cross-Chain</span>
                  <span className={transactionStep >= 4 ? "text-purple-400" : ""}>Bridge Back</span>
                  <span className={transactionStep >= 5 ? "text-purple-400" : ""}>Finalizing</span>
                  <span className={transactionStep >= 6 ? "text-purple-400" : ""}>Confirmed</span>
                </div>
              ) : (
                <div className="flex justify-between mt-1 text-xs text-white/50">
                  <span className={transactionStep >= 1 ? "text-purple-400" : ""}>Sign</span>
                  <span className={transactionStep >= 2 ? "text-purple-400" : ""}>Routing</span>
                  <span className={transactionStep >= 3 ? "text-purple-400" : ""}>Finalizing</span>
                  <span className={transactionStep >= 4 ? "text-purple-400" : ""}>Confirmed</span>
                </div>
              )}
              {crossChainStatus && (
                <div className="mt-2 text-xs text-blue-400 text-center">
                  {crossChainStatus}
                </div>
              )}
              {status && !crossChainStatus && (
                <div className="mt-2 text-xs text-purple-400 text-center">
                  {status}
                </div>
              )}
            </div>

            {/* Transfer Details Card */}
            <div className="bg-zinc-800/60 backdrop-blur-sm border border-zinc-600/40 rounded-lg p-2">
              <div className="flex items-start justify-between mb-1">
                <div>
                  <h2 className="text-base font-semibold text-white">Transfer Details</h2>
                  <p className="text-white/60 text-xs">Configure your private transfer</p>
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-blue-500 text-xs font-medium">Balance:</span>
                  <span className="text-blue-500 text-xs font-medium">
                    {publicBalance !== null ? `${publicBalance} SOL` : '...'}
                  </span>
                </div>
              </div>

              <div className="mt-2">
                <label className="block text-white font-medium mb-1 text-sm">Amount (SOL)</label>
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-zinc-800/60 border border-zinc-700/50 rounded-lg text-white placeholder-white/40 focus:outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/50 text-sm"
                  placeholder="Enter amount"
                />
              </div>
            </div>

            {/* Destination & Summary Card */}
            <div className="bg-zinc-800/60 backdrop-blur-sm border border-zinc-600/40 rounded-lg p-2">
              <div className="space-y-2">
                <div>
                  <label className="block text-white font-medium mb-1 text-sm">Destination Wallet Address</label>
                  <input
                    type="text"
                    value={destinationAddress}
                    onChange={(e) => setDestinationAddress(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-zinc-800/60 border border-zinc-700/50 rounded-lg text-white placeholder-white/40 focus:outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/50 text-sm"
                    placeholder="Enter Solana wallet address..."
                  />
                </div>

                {selectedPrivacyLevel && (
                  <div className="bg-zinc-800/40 rounded-lg p-2 space-y-1.5">
                    <div className="flex justify-between text-xs">
                      <span className="text-white/60">Transfer Amount</span>
                      <span className="text-white">{amount} SOL</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-white/60">
                        {selectedLevel === "balanced" ? "Network Fee" : "Network Fee (1%)"}
                      </span>
                      <span className="text-white">
                        {selectedLevel === "balanced" ? "FREE" : `${calculateNetworkFee()} SOL`}
                      </span>
                    </div>
                    {selectedLevel === "balanced" && (
                      <div className="flex justify-between text-xs">
                        <span className="text-white/60">Bridge Fee</span>
                        <span className="text-white">~0.02 SOL</span>
                      </div>
                    )}
                    <div className="flex justify-between text-xs">
                      <span className="text-white/60">Estimated Time</span>
                      <span className="text-white">{selectedPrivacyLevel.time}</span>
                    </div>
                    {selectedLevel === "balanced" && (
                      <div className="text-xs text-blue-400 mt-1">
                        Cross-chain routing provides enhanced privacy
                      </div>
                    )}
                  </div>
                )}

                {error && (
                  <div className="p-2 bg-red-900/20 border border-red-800/30 rounded-lg text-xs text-red-300">
                    {error}
                  </div>
                )}

                <button
                  onClick={handleTransfer}
                  disabled={isLoading || !destinationAddress.trim()}
                  className={`w-full font-semibold py-2 px-3 rounded-lg transition-all duration-300 flex items-center justify-center gap-2 text-sm ${
                    isLoading || !destinationAddress.trim()
                      ? 'bg-gray-600 cursor-not-allowed text-gray-400'
                      : 'bg-gradient-to-r from-purple-500 to-indigo-400 hover:from-purple-600 hover:to-indigo-500 text-white'
                  }`}
                >
                  {isLoading ? 'Processing...' : 'Initiate Private Transfer'}
                  {!isLoading && <ArrowLeft className="h-3.5 w-3.5 rotate-180" />}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
