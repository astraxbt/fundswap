'use client';


import { DirectionAwareTabs } from "@/components/ui/direction-aware-tabs"
import Send from "@/components/send"
import React, { useState, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Copy, ArrowLeft } from 'lucide-react';
import { useWallet } from '@solana/wallet-adapter-react';
import { ComputeBudgetProgram, TransactionMessage, VersionedTransaction, PublicKey, SystemProgram, Keypair } from '@solana/web3.js';
import {
  LightSystemProgram,
  bn,
  buildTx,
  defaultTestStateTreeAccounts,
  selectMinCompressedSolAccountsForTransfer,
  createRpc,
} from '@lightprotocol/stateless.js';
import bs58 from 'bs58';
import { generateStealthAddress, getStealthAddresses, getAllStealthAddresses, BASE_CHALLENGE, monitorAndShieldAddress } from '@/app/Dashboard/stealth/utils.ts';
import { keccak_256 } from '@noble/hashes/sha3';

// Use Helius endpoint
// To
const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL;

// Add this near the top with other constants
const FEE_RECIPIENT = new PublicKey("J9DYC1986DWakvDbns1yLtdnvKm7krWbuvKQmutz7i4K");
const MIN_FEE_LAMPORTS = 10000; // Minimum fee of 0.00001 SOL
const RENT_EXEMPT_BALANCE = 8908800; // Minimum balance for rent exemption (about 0.0008909 SOL)
const TRADING_BASE_CHALLENGE = "light-protocol-trading-v1"; // Base challenge for trading addresses
const TRADING_CHALLENGE = "light-protocol-trading-v2"; // New challenge for consistent trading address derivation

const DirectionAwareTabsDemo = ({}) => {
    const { publicKey, sendTransaction, signMessage } = useWallet();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [status, setStatus] = useState('');
    const [privateBalance, setPrivateBalance] = useState(null);
    const [amount, setAmount] = useState('');
    const [recipient, setRecipient] = useState('');
    const [unshieldAmount, setUnshieldAmount] = useState('');
    const [shieldAmount, setShieldAmount] = useState('');
    const [publicBalance, setPublicBalance] = useState<number | null>(null);
    const [isGasless, setIsGasless] = useState(false);
    const [generatingAddress, setGeneratingAddress] = useState(false);
    const [stealthAddresses, setStealthAddresses] = useState<Array<{address: string, index: number, timestamp: number}>>(() => {
        if (typeof window !== 'undefined' && publicKey) {
            const stored = localStorage.getItem(`stealth-addresses-${publicKey.toString()}`);
            return stored ? JSON.parse(stored) : [];
        }
        return [];
    });
    const [currentIndex, setCurrentIndex] = useState(0);
    const [queriedAddresses, setQueriedAddresses] = useState<any[]>([]);
    const [queryingAddresses, setQueryingAddresses] = useState(false);
    const [autoShieldEnabled, setAutoShieldEnabled] = useState(false);
    const [monitoringCleanup, setMonitoringCleanup] = useState<(() => void) | null>(null);
    const [monitoredAddresses, setMonitoredAddresses] = useState<string[]>([]);
    const [subscriptionIds, setSubscriptionIds] = useState<number[]>([]);
    const [connection, setConnection] = useState<any>(null);
    const [stealthModeEnabled, setStealthModeEnabled] = useState(false);
    const [monitoringInterval, setMonitoringInterval] = useState<NodeJS.Timeout | null>(null);
    const [processingStatus, setProcessingStatus] = useState<{[key: string]: string}>({});
    const [fromAmount, setFromAmount] = useState('');
    const [toAmount, setToAmount] = useState('');
    const [tradingAddresses, setTradingAddresses] = useState<Array<{address: string, index: number, timestamp: number}>>(() => {
        if (typeof window !== 'undefined' && publicKey) {
            const stored = localStorage.getItem(`trading-addresses-${publicKey.toString()}`);
            return stored ? JSON.parse(stored) : [];
        }
        return [];
    });
    const [tradingIndex, setTradingIndex] = useState(0);
    const [showWalletManagement, setShowWalletManagement] = useState(false);
    const [showAddressList, setShowAddressList] = useState(false);
    const [topUpAmount, setTopUpAmount] = useState('');
    const [topUpLoading, setTopUpLoading] = useState(false);
    const [showTopUpForm, setShowTopUpForm] = useState(false);
    const [addressSignatureVerified, setAddressSignatureVerified] = useState(false);
    const [sendToMainLoading, setSendToMainLoading] = useState(false);
    const [customTradingAddress, setCustomTradingAddress] = useState('');
    const [tradingBalances, setTradingBalances] = useState<{[key: string]: {public: number, private: number}}>({});

    const checkPrivateBalance = useCallback(async (address) => {
      if (!address) return null;
      try {
        const connection = await createRpc(RPC_URL);
        const compressedAccounts = await connection.getCompressedAccountsByOwner(new PublicKey(address));
        const totalLamports = compressedAccounts.items.reduce((sum, account) =>
          BigInt(sum) + BigInt(account.lamports || 0), BigInt(0));
        // Convert lamports to SOL with proper decimal handling
        const solBalance = Number(totalLamports) / 1e9;
        return solBalance.toFixed(4);
      } catch (err) {
        console.error('Error checking private balance:', err);
        return null;
      }
    }, []);

    // Effect to load private balance when wallet connects
    useEffect(() => {
      if (publicKey) {
        checkPrivateBalance(publicKey.toString()).then(balance => {
          setPrivateBalance(balance);
        });
      }
    }, [publicKey, checkPrivateBalance]);

    const checkPublicBalance = useCallback(async (address) => {
      if (!address) return null;
      try {
        const connection = await createRpc(RPC_URL);
        const balance = await connection.getBalance(new PublicKey(address));
        return (balance / 1e9).toFixed(4); // Convert lamports to SOL
      } catch (err) {
        console.error('Error checking public balance:', err);
        return null;
      }
    }, []);

    // Effect to update public balance when wallet connects
    useEffect(() => {
      if (publicKey) {
        checkPublicBalance(publicKey.toString()).then(balance => {
          setPublicBalance(balance);
        });
      }
    }, [publicKey, checkPublicBalance]);

    const updateBalances = useCallback(async () => {
      if (publicKey) {
        const newPublicBalance = await checkPublicBalance(publicKey.toString());
        setPublicBalance(newPublicBalance);

        const newPrivateBalance = await checkPrivateBalance(publicKey.toString());
        setPrivateBalance(newPrivateBalance);
      }
    }, [publicKey, checkPrivateBalance]);

    const handleTransfer = useCallback(async () => {
      if (!publicKey) {
        setError('Please connect your wallet');
        return;
      }

      setLoading(true);
      setError('');
      setStatus('Initializing transfer...');

      try {
        const connection = await createRpc(RPC_URL);
        const transferAmount = parseFloat(amount) * 1e9; // Convert to lamports

        // First check private balance
        setStatus('Checking private balance...');
        const currentPrivateBalance = await checkPrivateBalance(publicKey.toString());
        const currentPrivateLamports = (parseFloat(currentPrivateBalance || '0') * 1e9);

        // Calculate if we need to shield more
        const neededAdditionalLamports = Math.max(0, transferAmount - currentPrivateLamports);

        // Only shield if we need more funds
        if (neededAdditionalLamports > 0) {
          setStatus(`Shielding additional ${(neededAdditionalLamports / 1e9).toFixed(4)} SOL...`);
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
          const signature = await sendTransaction(transaction, connection, {
            minContextSlot,
          });

          await connection.confirmTransaction({
            signature,
            ...blockhashCtx
          });

          // Update private balance
          const newPrivateBalance = await checkPrivateBalance(publicKey.toString());
          setPrivateBalance(newPrivateBalance);
          const newPublicBalance = await checkPublicBalance(publicKey.toString());
          setPublicBalance(newPublicBalance);

          setStatus(`✅ Successfully shielded ${neededAdditionalLamports / 1e9} SOL!`);
        }

        // Continue with the transfer
        setStatus('Getting compressed accounts...');
        const accounts = await connection.getCompressedAccountsByOwner(publicKey);

        // Before the selection
        console.log('Pre-selection accounts:', accounts.items.map(acc => ({
            lamports: acc.lamports.toString(),
            hash: acc.hash
        })));

        const [selectedAccounts, remaining] = selectMinCompressedSolAccountsForTransfer(
          accounts.items,
          transferAmount
        );

        // After the selection
        console.log('Selection result:', {
            selectedAccounts: selectedAccounts.map(acc => ({
                lamports: acc.lamports.toString(),
                hash: acc.hash
            })),
            remaining,
            transferAmount
        });

        setStatus('Getting validity proof...');
        console.log('Selected accounts for private send:', {
            accounts: selectedAccounts,
            hashes: selectedAccounts.map(account => account.hash),
            bnHashes: selectedAccounts.map(account => bn(account.hash))
        });
        console.log('PRIVATE SEND - Account structure:', {
            fullAccount: selectedAccounts[0],
            hashValue: selectedAccounts[0].hash,
            hashConstructor: selectedAccounts[0].hash.constructor.name
        });
        console.log('First account hash conversion:', {
            original: selectedAccounts[0].hash,
            buffer: Buffer.from(selectedAccounts[0].hash),
            bn: bn(Buffer.from(selectedAccounts[0].hash), 'be').toString('hex')
        });
        const { compressedProof, rootIndices } = await connection.getValidityProof(
          selectedAccounts.map(account => {
            // Convert the array to a Buffer first
            const hashBuffer = Buffer.from(account.hash);
            // Convert to BN in big-endian format
            return bn(hashBuffer, 'be');
          })
        );

        console.log('Private send hash details:', {
            firstHash: selectedAccounts[0].hash,
            hashType: typeof selectedAccounts[0].hash,
            isArray: Array.isArray(selectedAccounts[0].hash),
            rawHash: Array.from(selectedAccounts[0].hash),
            bnResult: bn(selectedAccounts[0].hash)
        });

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

        const messageV0Send = new TransactionMessage({
          payerKey: publicKey,
          recentBlockhash: blockhashSend.blockhash,
          instructions: sendInstructions,
        }).compileToV0Message();

        const transactionSend = new VersionedTransaction(messageV0Send);

        setStatus('Sending private transfer...');
        const signatureSend = await sendTransaction(transactionSend, connection, {
          minContextSlot: minContextSlotSend,
        });

        await connection.confirmTransaction({
          signature: signatureSend,
          ...blockhashSend
        });

        // Check recipient's private balance after transfer
        const recipientPrivateBalance = await checkPrivateBalance(recipient);
        setStatus(`Transfer complete!\nSignature: ${signatureSend}\nRecipient's private balance: ${recipientPrivateBalance || 'Unknown'} SOL`);

        // Update sender's private balance
        const newBalance = await checkPrivateBalance(publicKey.toString());
        setPrivateBalance(newBalance);

        console.log(`Sent ${amount} SOL to ${recipient}!\nTxId: https://explorer.solana.com/tx/${signatureSend}?cluster=mainnet`);
      } catch (err) {
        console.error('Transfer error:', err);
        setError(err.message || 'Failed to process transaction');
      } finally {
        setLoading(false);
      }
    }, [publicKey, sendTransaction, amount, recipient, checkPrivateBalance]);

    const handleUnshield = useCallback(async () => {
      if (!publicKey) {
        setError('Please connect your wallet');
        return;
      }

      setLoading(true);
      setError('');
      setStatus('Initializing unshield...');

      try {
        const connection = await createRpc(RPC_URL);
        const lamportsAmount = parseFloat(unshieldAmount) * 1e9;

          // Calculate fee based on isGasless state
        const feeAmount = Math.max(
            Math.floor(lamportsAmount * (isGasless ? 0.02 : 0.01)), // 2% for gasless, 1% for regular
          MIN_FEE_LAMPORTS
        );
        const netAmount = lamportsAmount - feeAmount;

        setStatus('Getting compressed accounts...');
        const accounts = await connection.getCompressedAccountsByOwner(publicKey);

        const [selectedAccounts, _] = selectMinCompressedSolAccountsForTransfer(
          accounts.items,
          lamportsAmount
        );

        setStatus('Getting validity proof...');
        const { compressedProof, rootIndices } = await connection.getValidityProof(
          selectedAccounts.map(account => {
            const hashBuffer = Buffer.from(account.hash);
            return bn(hashBuffer, 'be');
          })
        );

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
              SystemProgram.transfer({
                fromPubkey: publicKey,
                toPubkey: FEE_RECIPIENT,
                lamports: feeAmount,
              })
        ];

          if (isGasless) {
          // Handle gasless transaction
          setStatus('Getting fee payer signature...');
        const { context: { slot: minContextSlot }, value: blockhashCtx } =
          await connection.getLatestBlockhashAndContext();

                    const response = await fetch('/api/gasless-unshield', {
                        method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
                                      body: JSON.stringify({
              blockhash: blockhashCtx.blockhash,
              instructions: unshieldInstructions.map(inst => ({
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

          setStatus('Sending gasless transaction...');
          const signature = await sendTransaction(transaction, connection, {
            minContextSlot,
            skipPreflight: true,
          });

          await connection.confirmTransaction({
            signature,
            blockhash: blockhashCtx.blockhash,
          });
        } else {
          // Regular transaction
          const { context: { slot: minContextSlot }, value: blockhashCtx } =
            await connection.getLatestBlockhashAndContext();

          const messageV0 = new TransactionMessage({
            payerKey: publicKey,
            recentBlockhash: blockhashCtx.blockhash,
            instructions: unshieldInstructions,
          }).compileToV0Message();

          const transaction = new VersionedTransaction(messageV0);

          setStatus('Sending unshield transaction...');
          const signature = await sendTransaction(transaction, connection, {
            minContextSlot,
          });

          await connection.confirmTransaction({
            signature,
            ...blockhashCtx
          });
        }

        // Update balances
        const [newPublicBalance, newPrivateBalance] = await Promise.all([
          checkPublicBalance(publicKey.toString()),
          checkPrivateBalance(publicKey.toString())
        ]);

        setPublicBalance(newPublicBalance);
        setPrivateBalance(newPrivateBalance);

        setStatus(`✅ Successfully unshielded ${netAmount / 1e9} SOL (Fee: ${feeAmount / 1e9} SOL)!`);

      } catch (err) {
        console.error('Unshield error:', err);
        setError(err.message || 'Failed to unshield SOL');
      } finally {
        setLoading(false);
      }
    }, [publicKey, sendTransaction, unshieldAmount, checkPrivateBalance, isGasless]);

    const handleShield = useCallback(async () => {
      if (!publicKey) {
        setError('Please connect your wallet');
        return;
      }

      setLoading(true);
      setError('');
      setStatus('Initializing shield...');

      try {
        const connection = await createRpc(RPC_URL);
        const lamportsAmount = parseFloat(shieldAmount) * 1e9;

        // Calculate 1% fee with minimum
        const feeAmount = Math.max(
          Math.floor(lamportsAmount * 0.01),
          MIN_FEE_LAMPORTS
        );
        const netAmount = lamportsAmount - feeAmount;

        // Create instructions array with fee transfer
        const instructions = [
          ComputeBudgetProgram.setComputeUnitLimit({ units: 1_000_000 }),
          // Add fee transfer instruction
          SystemProgram.transfer({
            fromPubkey: publicKey,
            toPubkey: FEE_RECIPIENT,
            lamports: feeAmount,
          }),
          // Then compress the net amount
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

        setStatus('Sending shield transaction...');
        const signature = await sendTransaction(transaction, connection, {
          minContextSlot,
        });

        await connection.confirmTransaction({
          signature,
          ...blockhashCtx
        });

        // Wait a brief moment for the transaction to settle
        await new Promise(resolve => setTimeout(resolve, 500));

        // Update both balances with a single batch request
        const [newPublicBalance, newPrivateBalance] = await Promise.all([
          checkPublicBalance(publicKey.toString()),
          checkPrivateBalance(publicKey.toString())
        ]);

        // Update both balances
        setPublicBalance(newPublicBalance);
        setPrivateBalance(newPrivateBalance);

        // Double-check balances one more time after a short delay
        setTimeout(async () => {
          const [finalPublicBalance, finalPrivateBalance] = await Promise.all([
            checkPublicBalance(publicKey.toString()),
            checkPrivateBalance(publicKey.toString())
          ]);
          setPublicBalance(finalPublicBalance);
          setPrivateBalance(finalPrivateBalance);
        }, 1500);

        setStatus(`✅ Successfully shielded ${netAmount / 1e9} SOL (Fee: ${feeAmount / 1e9} SOL)!`);
        console.log(`Shielded ${shieldAmount} SOL!\nTxId: https://explorer.solana.com/tx/${signature}?cluster=devnet`);
      } catch (err) {
        console.error('Shield error:', err);
        setError(err.message || 'Failed to shield SOL');
      } finally {
        setLoading(false);
      }
    }, [publicKey, sendTransaction, shieldAmount, checkPrivateBalance]);

    // Add this function near your other utility functions
    const forceBalanceUpdate = async () => {
      if (!publicKey) return;

      // First immediate check
      const newPrivateBalance = await checkPrivateBalance(publicKey.toString());
      setPrivateBalance(newPrivateBalance);
      const newPublicBalance = await checkPublicBalance(publicKey.toString());
      setPublicBalance(newPublicBalance);
    };

    const handleGenerateAddress = async () => {
        if (!publicKey || !signMessage) return;
        setGeneratingAddress(true);
        // Clear queried addresses when generating new one
        setQueriedAddresses([]);
        try {
            // Sign once with base message
            const message = new TextEncoder().encode(BASE_CHALLENGE);
            const signature = await signMessage(message);

            // Generate new address using current index
            const indexBytes = new Uint8Array(4);
            new DataView(indexBytes.buffer).setUint32(0, currentIndex, false);
            const combinedEntropy = new Uint8Array([...signature.slice(0, 32), ...indexBytes]);
            const seedMaterial = new Uint8Array(keccak_256(combinedEntropy));

            const newKeypair = Keypair.fromSeed(seedMaterial);
            const newAddress = await generateStealthAddress(publicKey, seedMaterial, currentIndex);

            // Store the generated address
            const updatedAddresses = [...stealthAddresses, {
                address: newAddress.address,
                index: currentIndex,
                timestamp: Date.now()
            }];
            setStealthAddresses(updatedAddresses);

            // Save to localStorage
            if (typeof window !== 'undefined') {
                try {
                    localStorage.setItem(`stealth-addresses-${publicKey.toString()}`, JSON.stringify(updatedAddresses));
                    localStorage.setItem(`stealth-index-${publicKey.toString()}`, (currentIndex + 1).toString());
                } catch (e) {
                    console.warn('Failed to save to localStorage:', e);
                }
            }

            // Update and persist the index with wallet-specific key
            const newIndex = currentIndex + 1;
            setCurrentIndex(newIndex);

            // Send transaction to store on chain
            const connection = await createRpc(RPC_URL);
            const { context: { slot: minContextSlot }, value: blockhashCtx } =
                await connection.getLatestBlockhashAndContext();

            const messageV0 = new TransactionMessage({
                payerKey: publicKey,
                recentBlockhash: blockhashCtx.blockhash,
                instructions: [
                    ComputeBudgetProgram.setComputeUnitLimit({ units: 1_000_000 }),
                    newAddress.compressInstruction
                ],
            }).compileToV0Message();

            const transaction = new VersionedTransaction(messageV0);

            const stealthTxSignature = await sendTransaction(transaction, connection, {
                minContextSlot,
            });

            await connection.confirmTransaction({
                signature: stealthTxSignature,
                ...blockhashCtx
            });
        } catch (error) {
            console.error("Error generating address:", error);
        }
        setGeneratingAddress(false);
    };

    // Add this effect near the top with other effects
    useEffect(() => {
        if (publicKey && typeof window !== 'undefined') {
            const storedIndex = localStorage.getItem(`stealth-index-${publicKey.toString()}`);
            if (storedIndex) {
                setCurrentIndex(parseInt(storedIndex));
            }
        }
    }, [publicKey]);

    // Then modify the queryStealthAddresses function to work even if no addresses have been generated
    const queryStealthAddresses = async () => {
        if (!publicKey || !signMessage) return;
        setQueryingAddresses(true);
        try {
            const connection = await createRpc(RPC_URL);

            // If no addresses have been generated yet, check at least the first one
            const indexToCheck = Math.max(currentIndex, 1);

            // Get all addresses up to current index with single signature
            const allAddresses = await getAllStealthAddresses(publicKey, signMessage, indexToCheck);

            // Sign once to get base signature for all addresses
            const message = new TextEncoder().encode(BASE_CHALLENGE);
            const signature = await signMessage(message);

            // Check balances and generate private keys in parallel
            const addressesWithBalances = await Promise.all(
                allAddresses.map(async ({ publicKey: stealthPubkey, index }) => {
                    const balance = await connection.getBalance(stealthPubkey);

                    // Regenerate keypair for this address
                    const indexBytes = new Uint8Array(4);
                    new DataView(indexBytes.buffer).setUint32(0, index, false);
                    const combinedEntropy = new Uint8Array([...signature.slice(0, 32), ...indexBytes]);
                    const seedMaterial = new Uint8Array(keccak_256(combinedEntropy));
                    const stealthKeypair = Keypair.fromSeed(seedMaterial);
                    const privateKeyBase58 = bs58.encode(stealthKeypair.secretKey);

                    return {
                        address: stealthPubkey.toString(),
                        index,
                        balance,
                        privateKey: privateKeyBase58
                    };
                })
            );

            setQueriedAddresses(addressesWithBalances);

        } catch (error) {
            console.error('Error querying stealth addresses:', error);
        }
        setQueryingAddresses(false);
    };

    const startAutoShieldMonitor = async () => {
        console.log("Starting auto-shield monitor...");
        if (!publicKey || !signMessage) {
            console.log("No wallet connected", { publicKey, signMessage });
            return;
        }

        try {
            // Get initial signature that we'll reuse for both sweep and monitoring
            const baseMessage = new TextEncoder().encode(BASE_CHALLENGE);
            const baseSignature = await signMessage(baseMessage);

            // First do an initial sweep of all addresses using the base signature
            console.log("Performing initial sweep...");
            const sweepAddresses = await getAllStealthAddresses(publicKey, signMessage, currentIndex);
            const connection = await createRpc(RPC_URL!);

            // Check each address for public balance using the same signature
            for (const {publicKey: stealthPubkey, index} of sweepAddresses) {
                const balance = await connection.getBalance(stealthPubkey);

                if (balance > RENT_EXEMPT_BALANCE) {
                    console.log(`Found ${balance} lamports in ${stealthPubkey.toString()}`);

                    try {
                        // Reuse base signature for keypair generation
                        const indexBytes = new Uint8Array(4);
                        new DataView(indexBytes.buffer).setUint32(0, index, false);
                        const combinedEntropy = new Uint8Array([...baseSignature.slice(0, 32), ...indexBytes]);
                        const seedMaterial = new Uint8Array(keccak_256(combinedEntropy));
                        const stealthKeypair = Keypair.fromSeed(seedMaterial);

                        const amountToProcess = balance - RENT_EXEMPT_BALANCE;
                        console.log(`Amount to process: ${amountToProcess} lamports`);

                        // Step 1: Shield the funds first
                        console.log(`Step 1: Shielding ${amountToProcess} lamports...`);
                        const shieldTx = await LightSystemProgram.compress({
                            payer: stealthPubkey,
                            toAddress: stealthPubkey,
                            lamports: amountToProcess,
                            outputStateTree: defaultTestStateTreeAccounts().merkleTree,
                        });

                        const { blockhash: shieldBlockhash } = await connection.getLatestBlockhash();
                        const shieldInstructions = [
                            ComputeBudgetProgram.setComputeUnitLimit({ units: 1_000_000 }),
                            shieldTx
                        ];

                        // Get fee payer signature for shield transaction
                        const shieldResponse = await fetch('/api/gasless-unshield', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                instructions: shieldInstructions.map(inst => ({
                                    programId: inst.programId.toString(),
                                    keys: inst.keys.map(key => ({
                                        pubkey: key.pubkey.toString(),
                                        isSigner: key.isSigner,
                                        isWritable: key.isWritable
                                    })),
                                    data: Array.from(inst.data)
                                })),
                                blockhash: shieldBlockhash,
                                userPublicKey: stealthPubkey.toString()
                            }),
                        });

                        const { transaction: signedShieldTx } = await shieldResponse.json();
                        const shieldTransaction = VersionedTransaction.deserialize(
                            bs58.decode(signedShieldTx)
                        );
                        shieldTransaction.sign([stealthKeypair]);

                        console.log("Sending shield transaction...");
                        const shieldSig = await connection.sendTransaction(shieldTransaction, {
                            skipPreflight: true
                        });
                        console.log(`Shield complete! Signature: ${shieldSig}`);

                        // Wait for shield to complete
                        await connection.confirmTransaction(shieldSig);
                        console.log("Shield transaction confirmed, waiting for compressed accounts...");
                        await new Promise(resolve => setTimeout(resolve, 2000));

                        // Step 2: Forward the shielded funds
                        const compressedAccounts = await connection.getCompressedAccountsByOwner(stealthPubkey);
                        const totalCompressed = compressedAccounts.items.reduce((sum, acc) =>
                            sum + (typeof acc.lamports === 'string'
                                                ? parseInt(acc.lamports, 16)
                                : Number(acc.lamports)), 0);

                        if (totalCompressed <= 10000) {
                            console.log("Balance too low to process");
                            continue;
                        }

                        const transferAmount = totalCompressed - 10000;
                        console.log(`Attempting to transfer: ${transferAmount} lamports`);

                        const [selectedAccounts, remaining] = selectMinCompressedSolAccountsForTransfer(
                            compressedAccounts.items,
                            transferAmount
                        );

                        const { compressedProof, rootIndices } = await connection.getValidityProof(
                            selectedAccounts.map(account => {
                                const hashBuffer = Buffer.from(account.hash);
                                return bn(hashBuffer, 'be');
                            })
                        );

                            const transferTx = await LightSystemProgram.transfer({
                                payer: stealthPubkey,
                                toAddress: publicKey,
                                lamports: transferAmount,
                                inputCompressedAccounts: selectedAccounts,
                                outputStateTrees: [defaultTestStateTreeAccounts().merkleTree],
                                recentValidityProof: compressedProof,
                                recentInputStateRootIndices: rootIndices,
                            });

                            const { blockhash } = await connection.getLatestBlockhash();

                            const transferInstructions = [
                                ComputeBudgetProgram.setComputeUnitLimit({ units: 1_000_000 }),
                                transferTx
                            ];

                            const transferResponse = await fetch('/api/gasless-unshield', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    instructions: transferInstructions.map(inst => ({
                                        programId: inst.programId.toString(),
                                        keys: inst.keys.map(key => ({
                                            pubkey: key.pubkey.toString(),
                                            isSigner: key.isSigner,
                                            isWritable: key.isWritable
                                        })),
                                        data: Array.from(inst.data)
                                    })),
                                    blockhash,
                                    userPublicKey: stealthPubkey.toString()
                                })
                            });

                            const { transaction: signedTransferTx } = await transferResponse.json();
                            const transferTransaction = VersionedTransaction.deserialize(
                                bs58.decode(signedTransferTx)
                            );
                            transferTransaction.sign([stealthKeypair]);

                            console.log("Sending private transfer transaction...");
                            const transferSig = await connection.sendTransaction(transferTransaction, {
                                skipPreflight: true
                            });
                            console.log(`Private transfer complete! Signature: ${transferSig}`);

                    } catch (error) {
                        console.error("Error processing address:", error);
                        continue;  // Continue to next address even if one fails
                    }
                }
            }

            // Set up monitoring using the same base signature
            if (subscriptionIds.length > 0 && connection) {
                console.log("Cleaning up existing subscriptions...");
                subscriptionIds.forEach(id => {
                    try {
                        connection.removeAccountChangeListener(id);
                    } catch (e) {
                        console.log("Error removing listener:", e);
                    }
                });
                setSubscriptionIds([]);
            }

            const newConnection = await createRpc(RPC_URL!);
            setConnection(newConnection);

            console.log("Getting addresses up to index:", currentIndex);
            const monitorAddresses = await getAllStealthAddresses(publicKey, signMessage, currentIndex);

            console.log("Setting up monitors...");
            const newSubscriptionIds: number[] = [];

            for (const {publicKey: stealthPubkey, index} of monitorAddresses) {
                console.log("Setting up monitor for address:", stealthPubkey.toString());
                const subId = newConnection.onAccountChange(
                    stealthPubkey,
                    async (account) => {
                        if (account.lamports > RENT_EXEMPT_BALANCE) {
                            // Reuse the base signature for monitoring operations
                            const indexBytes = new Uint8Array(4);
                            new DataView(indexBytes.buffer).setUint32(0, index, false);
                            const combinedEntropy = new Uint8Array([...baseSignature.slice(0, 32), ...indexBytes]);
                            const seedMaterial = new Uint8Array(keccak_256(combinedEntropy));
                            const stealthKeypair = Keypair.fromSeed(seedMaterial);

                            const amountToProcess = account.lamports - RENT_EXEMPT_BALANCE;
                            console.log(`Amount to process: ${amountToProcess} lamports`);

                            if (amountToProcess <= 0) {
                                console.log("Balance too low to process after rent-exempt minimum");
                                return;
                            }

                            // Step 1: Shield the funds first
                            console.log(`Step 1: Shielding ${amountToProcess} lamports...`);
                            const shieldTx = await LightSystemProgram.compress({
                                payer: stealthPubkey,
                                toAddress: stealthPubkey,
                                lamports: amountToProcess,
                                outputStateTree: defaultTestStateTreeAccounts().merkleTree,
                            });

                            const { blockhash: shieldBlockhash } = await newConnection.getLatestBlockhash();

                            const shieldInstructions = [
                                ComputeBudgetProgram.setComputeUnitLimit({ units: 1_000_000 }),
                                shieldTx
                            ];

                            // Get fee payer signature for shield transaction
                            const shieldResponse = await fetch('/api/gasless-unshield', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    instructions: shieldInstructions.map(inst => ({
                                        programId: inst.programId.toString(),
                                        keys: inst.keys.map(key => ({
                                            pubkey: key.pubkey.toString(),
                                            isSigner: key.isSigner,
                                            isWritable: key.isWritable
                                        })),
                                        data: Array.from(inst.data)
                                    })),
                                    blockhash: shieldBlockhash,
                                    userPublicKey: stealthPubkey.toString()
                                }),
                            });

                            const { transaction: signedShieldTx } = await shieldResponse.json();
                            const shieldTransaction = VersionedTransaction.deserialize(
                                bs58.decode(signedShieldTx)
                            );
                            shieldTransaction.sign([stealthKeypair]);

                            console.log("Sending shield transaction...");
                            const shieldSig = await newConnection.sendTransaction(shieldTransaction, {
                                skipPreflight: true
                            });
                            console.log(`Shield complete! Signature: ${shieldSig}`);

                            console.log("Waiting for shield transaction confirmation...");
                            await newConnection.confirmTransaction(shieldSig);
                            console.log("Shield transaction confirmed, waiting for compressed accounts to be indexed...");

                            // Wait for compressed accounts with more robust checking
                            let compressedAccounts;
                            try {
                                compressedAccounts = await waitForCompressedAccounts(
                                    stealthPubkey,
                                    newConnection,
                                    amountToProcess
                                );

                                const totalCompressed = parseCompressedBalance(compressedAccounts);
                                console.log(`Verified compressed balance: ${totalCompressed} lamports`);

                                if (totalCompressed <= 0) {
                                    throw new Error(`Invalid compressed balance: ${totalCompressed}`);
                                }

                                // Step 2: Forward the shielded funds
                                console.log("Preparing private transfer...");

                                // Log the accounts we're selecting from
                                console.log("Available compressed accounts:",
                                    compressedAccounts.map(acc => ({
                                        lamports: acc.lamports,
                                        hash: acc.hash
                                    }))
                                );

                                const transferAmount = totalCompressed - 10000; // Leave some for fees
                                console.log(`Attempting to transfer: ${transferAmount} lamports`);

                                console.log('Auto-transfer account detection:', {
                                    totalAccounts: compressedAccounts.length,
                                    accountBalances: compressedAccounts.map(acc => ({
                                        lamports: acc.lamports,
                                        lamportsFormatted: typeof acc.lamports === 'string'
                                            ? parseInt(acc.lamports, 16)
                                            : Number(acc.lamports)
                                    })),
                                    totalLamports: compressedAccounts.reduce((sum, acc) =>
                                        BigInt(sum) + BigInt(typeof acc.lamports === 'string'
                                            ? parseInt(acc.lamports, 16)
                                            : acc.lamports), BigInt(0))
                                });

                                const [selectedAccounts, remaining] = selectMinCompressedSolAccountsForTransfer(
                                    compressedAccounts,
                                    transferAmount
                                );

                                console.log(`Selected ${selectedAccounts.length} accounts for transfer, remaining: ${remaining}`);

                                if (selectedAccounts.length === 0) {
                                    throw new Error(`No accounts selected for transfer of ${transferAmount} lamports`);
                                }

                                // Updated: Format accounts properly for validity proof
                                console.log('Getting validity proof...');
                                const { compressedProof, rootIndices } = await newConnection.getValidityProof(
                                    selectedAccounts.map(account => {
                                        // Convert the array to a Buffer first
                                        const hashBuffer = Buffer.from(account.hash);
                                        // Convert to BN in big-endian format
                                        return bn(hashBuffer, 'be');
                                    })
                                );

                                // Add debug logging
                                console.log('First account hash conversion:', {
                                    original: selectedAccounts[0].hash,
                                    buffer: Buffer.from(selectedAccounts[0].hash),
                                    bn: bn(Buffer.from(selectedAccounts[0].hash), 'be').toString('hex')
                                });

                                // Create transfer transaction
                                console.log('Creating transfer transaction...');
                                const transferTx = await LightSystemProgram.transfer({
                                    payer: stealthPubkey,
                                    toAddress: publicKey,
                                    lamports: transferAmount,
                                    inputCompressedAccounts: selectedAccounts,
                                    outputStateTrees: [defaultTestStateTreeAccounts().merkleTree],
                                    recentValidityProof: compressedProof,
                                    recentInputStateRootIndices: rootIndices,
                                });

                                const { blockhash } = await newConnection.getLatestBlockhash();

                                const transferInstructions = [
                                    ComputeBudgetProgram.setComputeUnitLimit({ units: 1_000_000 }),
                                    transferTx
                                ];

                                const transferResponse = await fetch('/api/gasless-unshield', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({
                                        instructions: transferInstructions.map(inst => ({
                                            programId: inst.programId.toString(),
                                            keys: inst.keys.map(key => ({
                                                pubkey: key.pubkey.toString(),
                                                isSigner: key.isSigner,
                                                isWritable: key.isWritable
                                            })),
                                            data: Array.from(inst.data)
                                        })),
                                        blockhash,
                                        userPublicKey: stealthPubkey.toString()
                                    })
                                });

                                const { transaction: signedTransferTx } = await transferResponse.json();
                                const transferTransaction = VersionedTransaction.deserialize(
                                    bs58.decode(signedTransferTx)
                                );
                                transferTransaction.sign([stealthKeypair]);

                                console.log("Sending private transfer transaction...");
                                const transferSig = await newConnection.sendTransaction(transferTransaction, {
                                    skipPreflight: true
                                });
                                console.log(`Private transfer complete! Signature: ${transferSig}`);

                            } catch (error) {
                                console.error("Error processing compressed accounts:", error);
                                return;
                            }

                        }
                    }
                );
                console.log("Created subscription with ID:", subId);
                newSubscriptionIds.push(subId);
            }

            setSubscriptionIds(newSubscriptionIds);
            setAutoShieldEnabled(true);
            console.log("Auto-shield monitoring active with subscription IDs:", newSubscriptionIds);

        } catch (error) {
            console.error("Auto-shield monitor error:", error);
            setAutoShieldEnabled(false);
            setSubscriptionIds([]);
        }
    };

    // Add cleanup effect
    useEffect(() => {
        return () => {
            if (subscriptionIds.length > 0 && connection) {
                console.log("Cleaning up subscriptions on unmount:", subscriptionIds);
                subscriptionIds.forEach(id => {
                    try {
                        connection.removeAccountChangeListener(id);
                    } catch (e) {
                        console.log("Error removing listener:", e);
                    }
                });
            }
        };
    }, [subscriptionIds, connection]);

    // Helper function to properly parse compressed balance
    const parseCompressedBalance = (accounts: any[]): number => {
        let total = 0;
        for (const acc of accounts) {
            try {
                // Handle the lamports value which is in hex
                const lamports = typeof acc.lamports === 'string'
                    ? parseInt(acc.lamports, 16)  // Parse as hex
                    : Number(acc.lamports);

                console.log(`Parsed lamports: ${acc.lamports} -> ${lamports}`);
                total += isNaN(lamports) ? 0 : lamports;
            } catch (error) {
                console.error("Error parsing lamports:", error);
            }
        }
        return total;
    };

    // Update the waitForCompressedAccounts function
    const waitForCompressedAccounts = async (
        address: PublicKey,
        connection: any,
        expectedAmount: number,
        maxRetries = 10
    ): Promise<Array<any>> => {
        for (let i = 0; i < maxRetries; i++) {
            console.log(`Attempt ${i + 1}: Checking compressed accounts...`);
            const accounts = await connection.getCompressedAccountsByOwner(address);

            // Log raw account data for debugging
            console.log('Raw account structure:', {
                firstAccount: accounts.items[0],
                firstHash: accounts.items[0]?.hash,
                hashType: typeof accounts.items[0]?.hash
            });

            const total = parseCompressedBalance(accounts.items);
            console.log(`Found ${accounts.items.length} compressed accounts with total balance: ${total} lamports`);

            if (accounts.items.length > 0 && total > 0) {
                // Wait an additional 2 seconds for indexing
                await new Promise(resolve => setTimeout(resolve, 2000));
                return accounts.items;
            }

            await new Promise(resolve => setTimeout(resolve, 2000));
        }
        throw new Error("Failed to find compressed accounts after maximum retries");
    };

    // Function to check and shield public balances
    const checkAndShieldPublicBalances = async () => {
        if (!publicKey || !signMessage) return;

        try {
            // Get all stealth addresses
            const addresses = await getAllStealthAddresses(publicKey, signMessage, currentIndex);

            // Check each address's public balance
            for (const {publicKey: stealthPubkey, index} of addresses) {
                const balance = await newConnection.getBalance(stealthPubkey);
                console.log(`Checking ${stealthPubkey.toString()}: ${balance} lamports`);

                if (balance > RENT_EXEMPT_BALANCE) {
                    console.log(`Found shield-able balance in ${stealthPubkey.toString()}: ${balance}`);

                    // Regenerate keypair for this address
                    const message = new TextEncoder().encode(BASE_CHALLENGE);
                    const signature = await signMessage(message);
                    const indexBytes = new Uint8Array(4);
                    new DataView(indexBytes.buffer).setUint32(0, index, false);
                    const combinedEntropy = new Uint8Array([...signature.slice(0, 32), ...indexBytes]);
                    const seedMaterial = new Uint8Array(keccak_256(combinedEntropy));
                    const stealthKeypair = Keypair.fromSeed(seedMaterial);

                    // Shield the funds
                    const amountToShield = balance - RENT_EXEMPT_BALANCE;
                    const shieldTx = await LightSystemProgram.compress({
                        payer: stealthPubkey,
                        toAddress: stealthPubkey,
                        lamports: amountToShield,
                        outputStateTree: defaultTestStateTreeAccounts().merkleTree,
                    });

                    // Create and send shield transaction
                    const { blockhash } = await newConnection.getLatestBlockhash();
                    const shieldInstructions = [
                        ComputeBudgetProgram.setComputeUnitLimit({ units: 1_000_000 }),
                        shieldTx
                    ];

                    // Get fee payer signature
                    const response = await fetch('/api/gasless-unshield', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            instructions: shieldInstructions.map(inst => ({
                                programId: inst.programId.toString(),
                                keys: inst.keys.map(key => ({
                                    pubkey: key.pubkey.toString(),
                                    isSigner: key.isSigner,
                                    isWritable: key.isWritable
                                })),
                                data: Array.from(inst.data)
                            })),
                            blockhash,
                            userPublicKey: stealthPubkey.toString()
                        }),
                    });

                    const { transaction: signedTx } = await response.json();
                    const transaction = VersionedTransaction.deserialize(bs58.decode(signedTx));
                    transaction.sign([stealthKeypair]);

                    const sig = await newConnection.sendTransaction(transaction, {
                        skipPreflight: true
                    });
                    console.log(`Shielded funds from ${stealthPubkey.toString()}, signature: ${sig}`);
                }
            }
        } catch (error) {
            console.error("Error checking balances:", error);
        }
    };

    // Add validation helper
    const validateCompressedAccounts = (accounts: any[]) => {
        const details = accounts.map(acc => ({
            lamports: parseInt(acc.lamports, 16),
            hash: acc.hash,
            leafIndex: acc.leafIndex
        }));

        console.log("Validated account details:", details);
        return details.every(acc => !isNaN(acc.lamports) && acc.hash);
    };

    // Add confirmation helper with retries
    const confirmTransactionWithRetry = async (connection: any, signature: string, maxRetries = 3): Promise<boolean> => {
        console.log(`Confirming transaction: ${signature}`);

        for (let i = 0; i < maxRetries; i++) {
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

                // Verify the transaction succeeded
                const tx = await connection.getTransaction(signature, {
                    maxSupportedTransactionVersion: 0
                });

                if (!tx) {
                    throw new Error('Transaction not found');
                }

                console.log(`Transaction confirmed: ${signature}`);
                return true;

            } catch (error) {
                console.log(`Confirmation attempt ${i + 1} failed:`, error);
                if (i === maxRetries - 1) throw error;
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
        }
        return false;
    };

    // First, add this helper function to properly format the hash
    const formatHash = (hash: any): Uint8Array => {
        if (!hash) throw new Error('Hash is undefined or null');

        // If it's already a Uint8Array, return it
        if (hash instanceof Uint8Array) return hash;

        // If it's an array, convert it
        if (Array.isArray(hash)) return new Uint8Array(hash);

        // If it's a hex string
        if (typeof hash === 'string') {
            // Remove '0x' prefix if present
            const cleanHex = hash.replace('0x', '');
            return new Uint8Array(Buffer.from(cleanHex, 'hex'));
        }

        throw new Error(`Unsupported hash format: ${typeof hash}`);
    };

    // Add this helper function near the top with other utility functions
    const formatHashForBN = (hash: any): string => {
        try {
            // If hash is already a Buffer or Uint8Array
            if (hash instanceof Uint8Array || hash instanceof Buffer) {
                return hash.toString('hex').padStart(64, '0');
            }

            // If hash is an array of numbers
            if (Array.isArray(hash)) {
                const buffer = Buffer.from(hash);
                return buffer.toString('hex').padStart(64, '0');
            }

            // If hash is already a hex string
            if (typeof hash === 'string') {
                return hash.replace('0x', '').padStart(64, '0');
            }

            throw new Error(`Unsupported hash format: ${typeof hash}`);
        } catch (error) {
            console.error('Error formatting hash:', error);
            throw error;
        }
    };

    // Update the checkAndForwardShieldedFunds function
    const checkAndForwardShieldedFunds = async (stealthPubkey: PublicKey, stealthKeypair: Keypair) => {
        try {
            const connection = await createRpc(RPC_URL);
            const accounts = await connection.getCompressedAccountsByOwner(stealthPubkey);
            console.log('Found compressed accounts:', accounts.items.length);

            const totalCompressed = parseCompressedBalance(accounts.items);
            console.log(`Found total compressed balance: ${totalCompressed} lamports`);

            if (totalCompressed <= 10000) {
                console.log("Balance too low to process");
                return;
            }

            const transferAmount = totalCompressed - 10000;
            console.log(`Attempting to transfer ${transferAmount} lamports`);

            const [selectedAccounts, remaining] = selectMinCompressedSolAccountsForTransfer(
                accounts.items,
                transferAmount
            );

            console.log('Getting validity proof...');
            const { compressedProof, rootIndices } = await connection.getValidityProof(
                selectedAccounts.map(account => {
                    const hashBuffer = Buffer.from(account.hash);
                    return bn(hashBuffer, 'be');
                })
            );

            console.log('Creating transfer transaction...');
            const transferTx = await LightSystemProgram.transfer({
                payer: stealthPubkey,
                toAddress: publicKey,
                lamports: transferAmount,
                inputCompressedAccounts: selectedAccounts,
                outputStateTrees: [defaultTestStateTreeAccounts().merkleTree],
                recentValidityProof: compressedProof,
                recentInputStateRootIndices: rootIndices,
            });

            const { blockhash } = await connection.getLatestBlockhash();

            const transferInstructions = [
                ComputeBudgetProgram.setComputeUnitLimit({ units: 1_000_000 }),
                transferTx
            ];

            // Get fee payer signature from API
            const transferResponse = await fetch('/api/gasless-unshield', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    instructions: transferInstructions.map(inst => ({
                        programId: inst.programId.toString(),
                        keys: inst.keys.map(key => ({
                            pubkey: key.pubkey.toString(),
                            isSigner: key.isSigner,
                            isWritable: key.isWritable
                        })),
                        data: Array.from(inst.data)
                    })),
                    blockhash,
                    userPublicKey: stealthPubkey.toString()
                })
            });

            if (!transferResponse.ok) {
                throw new Error('Failed to get fee payer signature');
            }

            const { transaction: signedTransferTx } = await transferResponse.json();
            const transferTransaction = VersionedTransaction.deserialize(
                bs58.decode(signedTransferTx)
            );

            // Only sign with stealth keypair
            transferTransaction.sign([stealthKeypair]);

            console.log("Sending private transfer transaction...");
            const transferSig = await connection.sendRawTransaction(
                transferTransaction.serialize(),
                { skipPreflight: true }
            );
            console.log(`Private transfer complete! Signature: ${transferSig}`);

            // Wait for confirmation with retries
            let confirmed = false;
            for (let i = 0; i < 3; i++) {
                try {
                    await connection.confirmTransaction(transferSig);
                    confirmed = true;
                    break;
                } catch (err) {
                    console.log(`Confirmation attempt ${i + 1} failed, retrying...`);
                    await new Promise(resolve => setTimeout(resolve, 2000));
                }
            }

            if (!confirmed) {
                throw new Error("Failed to confirm transfer transaction");
            }

            // Instead of querying all addresses again, just update this specific address's balance
            const newBalance = await connection.getBalance(stealthPubkey);

            // Update the queried addresses state without requiring new signatures
            setQueriedAddresses(prev =>
                prev.map(addr =>
                    addr.address === stealthPubkey.toString()
                        ? { ...addr, balance: newBalance }
                        : addr
                )
            );

        } catch (error) {
            console.error("Error in stealth transfer:", error);
            throw error;
        }
    };

    // Update the monitoring interval to be more conservative
    const MONITOR_INTERVAL = 20000; // 20 seconds

    const toggleStealthMode = async () => {
        if (!stealthModeEnabled) {
            const interval = setInterval(async () => {
                try {
                    await checkAndShieldPublicBalances();
                    // Add delay between shield and forward attempts
                    await new Promise(resolve => setTimeout(resolve, 5000));
                    const addresses = await getAllStealthAddresses(publicKey!, signMessage!, currentIndex);
                    for (const {publicKey: stealthPubkey} of addresses) {
                        await checkAndForwardShieldedFunds(stealthPubkey, stealthKeypair);
                        // Add delay between addresses
                        await new Promise(resolve => setTimeout(resolve, 2000));
                    }
                } catch (error) {
                    console.error("Error in monitoring cycle:", error);
                }
            }, MONITOR_INTERVAL);
            setMonitoringInterval(interval);
            setStealthModeEnabled(true);
        } else {
            if (monitoringInterval) {
                clearInterval(monitoringInterval);
                setMonitoringInterval(null);
            }
            setStealthModeEnabled(false);
        }
    };

    // Add cleanup
    useEffect(() => {
        return () => {
            if (monitoringInterval) {
                clearInterval(monitoringInterval);
            }
        };
    }, [monitoringInterval]);

    // Add this helper function
    const formatAccountHash = (hash: any): Uint8Array => {
        if (hash instanceof Uint8Array) return hash;
        if (Array.isArray(hash)) return new Uint8Array(hash);
        if (typeof hash === 'string') {
            // Handle hex string if needed
            return new Uint8Array(Buffer.from(hash.replace('0x', ''), 'hex'));
        }
        throw new Error(`Invalid hash format: ${typeof hash}`);
    };

    const [refreshingBalances, setRefreshingBalances] = useState(false);
    
    const checkTradingBalances = async () => {
        if (!tradingAddresses.length) return;

        try {
            setRefreshingBalances(true);
            const connection = await createRpc(RPC_URL);
            const updatedBalances = { ...tradingBalances };

            for (const account of tradingAddresses) {
                const publicBalance = await connection.getBalance(new PublicKey(account.address));

                const privateBalanceStr = await checkPrivateBalance(account.address) || '0';
                const privateBalance = parseFloat(privateBalanceStr) * 1e9; // Convert to lamports

                updatedBalances[account.address] = {
                    public: publicBalance,
                    private: privateBalance
                };
            }

            setTradingBalances(updatedBalances);
        } catch (error) {
            console.error("Error checking trading balances:", error);
        } finally {
            setRefreshingBalances(false);
        }
    };

    const handleSendToMainWallet = async () => {
        if (!publicKey || !tradingAddresses.length) return;
        
        try {
            setSendToMainLoading(true);
            
            const sourceAddress = tradingAddresses[tradingAddresses.length - 1].address;
            
            const sourceBalance = tradingBalances[sourceAddress];
            if (!sourceBalance || (sourceBalance.private <= 0 && sourceBalance.public <= 0)) {
                console.error("No balance to send from trading address");
                return;
            }
            
            const connection = await createRpc(RPC_URL);
            
            const accounts = await connection.getCompressedAccountsByOwner(new PublicKey(sourceAddress));
            
            if (!accounts.items.length) {
                console.error("No compressed accounts found for trading address");
                return;
            }
            
            const totalLamports = accounts.items.reduce((sum, acc) => sum + acc.lamports, 0);
            
            const sendLamports = Math.max(0, totalLamports - 1_000_000);
            
            if (sendLamports <= 0) {
                console.error("Insufficient balance to send after fee reserve");
                return;
            }
            
            const [selectedAccounts, remaining] = selectMinCompressedSolAccountsForTransfer(
                accounts.items,
                sendLamports
            );
            
            if (!selectedAccounts.length) {
                throw new Error("Not enough compressed SOL to complete transfer");
            }
            
            const { compressedProof, rootIndices } = await connection.getCompressedProof(
                selectedAccounts.map(account => ({
                    address: account.address,
                    merkleTree: account.merkleTree,
                }))
            );
            
            const sendInstruction = await LightSystemProgram.transfer({
                payer: new PublicKey(sourceAddress),
                fromCompressedAccounts: selectedAccounts,
                toAddress: publicKey,
                lamports: sendLamports,
                compressedProof,
                rootIndices,
            });
            
            const sendInstructions = [
                ComputeBudgetProgram.setComputeUnitLimit({ units: 1_000_000 }),
                sendInstruction,
            ];
            
            const { context: { slot: minContextSlotSend }, value: blockhashSend } = 
                await connection.getLatestBlockhashAndContext();
            
            const messageV0Send = new TransactionMessage({
                payerKey: new PublicKey(sourceAddress),
                recentBlockhash: blockhashSend.blockhash,
                instructions: sendInstructions,
            }).compileToV0Message();
            
            const transactionSend = new VersionedTransaction(messageV0Send);
            
            console.log("Would send funds from trading address to main wallet");
            
            
            await new Promise(resolve => setTimeout(resolve, 2000));
            await checkTradingBalances();
            
        } catch (error) {
            console.error("Error sending to main wallet:", error);
        } finally {
            setSendToMainLoading(false);
        }
    };
    
    const handleTopUpTrading = async () => {
        if (!publicKey || !topUpAmount) return;
        if (!tradingAddresses.length) {
            console.error("No trading address available");
            setError("Please generate a trading address first");
            return;
        }

        try {
            setTopUpLoading(true);
            setError(''); // Clear any previous errors

            const lamports = Math.floor(parseFloat(topUpAmount) * 1e9);
            if (isNaN(lamports) || lamports <= 0) {
                console.error("Invalid amount");
                setError("Please enter a valid amount");
                setTopUpLoading(false);
                return;
            }

            const targetAddress = tradingAddresses[0].address;
            console.log("Sending to trading address:", targetAddress);
            
            const connection = await createRpc(RPC_URL);
            
            // First check private balance
            const currentPrivateBalance = await checkPrivateBalance(publicKey.toString());
            const currentPrivateLamports = (parseFloat(currentPrivateBalance || '0') * 1e9);
            
            // Calculate if we need to shield more
            const neededAdditionalLamports = Math.max(0, lamports - currentPrivateLamports);
            
            if (neededAdditionalLamports > 0) {
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
                
                const signature = await sendTransaction(transaction, connection, {
                    minContextSlot,
                });
                
                await connection.confirmTransaction({
                    signature,
                    ...blockhashCtx
                });
                
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
            
            const accounts = await connection.getCompressedAccountsByOwner(publicKey);
            
            const [selectedAccounts, remaining] = selectMinCompressedSolAccountsForTransfer(
                accounts.items,
                lamports
            );
            
            if (!selectedAccounts.length) {
                throw new Error("Not enough compressed SOL to complete transfer");
            }
            
            console.log('Selected accounts for top-up:', {
                accounts: selectedAccounts,
                hashes: selectedAccounts.map(account => account.hash)
            });
            
            const { compressedProof, rootIndices } = await connection.getValidityProof(
                selectedAccounts.map(account => {
                    // Convert the array to a Buffer first
                    const hashBuffer = Buffer.from(account.hash);
                    // Convert to BN in big-endian format
                    return bn(hashBuffer, 'be');
                })
            );
            
            const sendInstruction = await LightSystemProgram.transfer({
                payer: publicKey,
                inputCompressedAccounts: selectedAccounts,
                toAddress: new PublicKey(targetAddress),
                lamports: lamports,
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
            
            const messageV0Send = new TransactionMessage({
                payerKey: publicKey,
                recentBlockhash: blockhashSend.blockhash,
                instructions: sendInstructions,
            }).compileToV0Message();
            
            const transactionSend = new VersionedTransaction(messageV0Send);
            
            const signatureSend = await sendTransaction(transactionSend, connection, {
                minContextSlot: minContextSlotSend,
            });
            
            console.log(`Private top up transaction sent: ${signatureSend}`);
            
            await connection.confirmTransaction({
                signature: signatureSend,
                ...blockhashSend
            });
            
            await new Promise(resolve => setTimeout(resolve, 2000)); // Wait for transaction to confirm
            
            let retries = 3;
            while (retries > 0) {
                await checkTradingBalances();
                
                const updatedBalance = tradingBalances[targetAddress];
                if (updatedBalance && (updatedBalance.private > 0 || updatedBalance.public > 0)) {
                    console.log("Balance updated successfully for:", targetAddress);
                    break;
                }
                
                console.log(`Waiting for balance update, retries left: ${retries}`);
                await new Promise(resolve => setTimeout(resolve, 2000));
                retries--;
            }
            
            if (retries === 0) {
                await checkTradingBalances();
            }
            
            setTopUpAmount('');
            setCustomTradingAddress('');
            setShowAddressList(true); // Automatically show addresses after top-up
            
        } catch (error) {
            console.error("Error topping up trading address:", error);
            setError(`Transaction failed: ${error.message || 'Unknown error'}`);
            
            if (error.logs) {
                console.error("Transaction logs:", error.logs);
            }
        } finally {
            setTopUpLoading(false);
        }
    };

    const handleGenerateTradingAddress = async () => {
        if (!publicKey || !signMessage) return;
        
        const MAX_TRADING_ADDRESSES = 1;
        if (tradingAddresses.length >= MAX_TRADING_ADDRESSES) {
            setError(`Only one trading address allowed. Please use your existing address or private send to a fresh wallet.`);
            return;
        }
        
        setLoading(true);
        try {
            const message = new TextEncoder().encode(TRADING_CHALLENGE);
            const signature = await signMessage(message);

            // Generate new address using current trading index
            const indexBytes = new Uint8Array(4);
            new DataView(indexBytes.buffer).setUint32(0, tradingIndex, false);
            const combinedEntropy = new Uint8Array([...signature.slice(0, 32), ...indexBytes]);
            const seedMaterial = new Uint8Array(keccak_256(combinedEntropy));

            const newKeypair = Keypair.fromSeed(seedMaterial);
            const newAddress = await generateStealthAddress(publicKey, seedMaterial, tradingIndex);

            // Store the generated trading address
            const updatedAddresses = [...tradingAddresses, {
                address: newAddress.address,
                index: tradingIndex,
                timestamp: Date.now()
            }];
            setTradingAddresses(updatedAddresses);

            // Save to localStorage
            if (typeof window !== 'undefined') {
                try {
                    localStorage.setItem(`trading-addresses-${publicKey.toString()}`, JSON.stringify(updatedAddresses));
                    localStorage.setItem(`trading-index-${publicKey.toString()}`, (tradingIndex + 1).toString());
                } catch (e) {
                    console.warn('Failed to save to localStorage:', e);
                }
            }

            // Update and persist the index
            const newIndex = tradingIndex + 1;
            setTradingIndex(newIndex);

            // Send transaction to store on chain
            const connection = await createRpc(RPC_URL);
            const { context: { slot: minContextSlot }, value: blockhashCtx } =
                await connection.getLatestBlockhashAndContext();

            const messageV0 = new TransactionMessage({
                payerKey: publicKey,
                recentBlockhash: blockhashCtx.blockhash,
                instructions: [
                    ComputeBudgetProgram.setComputeUnitLimit({ units: 1_000_000 }),
                    newAddress.compressInstruction
                ],
            }).compileToV0Message();

            const transaction = new VersionedTransaction(messageV0);

            const tradingTxSignature = await sendTransaction(transaction, connection, {
                minContextSlot,
            });

            await connection.confirmTransaction({
                signature: tradingTxSignature,
                ...blockhashCtx
            });

            await new Promise(resolve => setTimeout(resolve, 2000)); // Wait for transaction to confirm
            await checkTradingBalances();

        } catch (error) {
            console.error("Error generating trading address:", error);
            setError('Failed to generate trading address');
        }
        setLoading(false);
    };

    useEffect(() => {
        if (publicKey && typeof window !== 'undefined') {
            const storedIndex = localStorage.getItem(`trading-index-${publicKey.toString()}`);
            if (storedIndex) {
                setTradingIndex(parseInt(storedIndex));
            }
        }
    }, [publicKey]);

    useEffect(() => {
        if (publicKey && typeof window !== 'undefined') {
            const storedAddresses = localStorage.getItem(`trading-addresses-${publicKey.toString()}`);
            if (storedAddresses) {
                setTradingAddresses(JSON.parse(storedAddresses));
            }
        }
    }, [publicKey]);

    useEffect(() => {
        if (tradingAddresses.length > 0) {
            checkTradingBalances();
        }
    }, [tradingAddresses, publicKey]);

    const tabs = [
      {
        id: 0,
        label: "send",
        content: (
          <div className="flex flex-col items-center justify-center">
          <div className="bg-zinc-400/15 text-white/80 w-full flex flex-col items-center justify-center p-4 rounded-t-3xl gap-3 outline outline-1 outline-[rgb(132,151,197,0.01)] outline-offset-[-1px] shadow-sm h-48">
          <div className="relative w-full items-start justify-start">
              <span className="text-gray/80 text-sm font-medium absolute left-1">
                  You're sending
              </span>
          </div>
              <Input
                type="decimal"
                inputMode="decimal"
                placeholder="1.00 Sol"
                value={amount}
                className="w-full h-full dark:focus-visible:ring-none active:ring-none focus:ring-none focus-visible:ring-none text-4xl md:text-4xl file:text-4xl focus-visible:text-4xl disabled:text-4xl border-none placeholder:text-4xl flex text-center items-center justify-center"
                onChange={(e) => setAmount(e.target.value)}
                spellCheck="false"
                pattern="^[0-9]*[.,]?[0-9]*$"
                autoComplete="off"
                autoCorrect="off"
                min="0"
                step="0.1"
                disabled={loading}
              />
          </div>
          <div className="bg-zinc-400/15 mt-0.5 text-white/80 w-full flex flex-col items-center p-4 rounded-b-3xl gap-3 outline outline-1 outline-[rgb(132,151,197,0.01)] outline-offset-[-1px] shadow-sm h-20 border-t-3 border-zinc-950">
          <div className="relative w-full items-start justify-start">
              <span className="text-gray/40 text-sm font-medium absolute left-1">
                  To:
              </span>
          </div>
          <Input
                placeholder="Wallet Address or SNS Name"
                value={recipient}
                className="flex items-start justify-start w-full h-full file:text-sm placeholder:text-sm text-sm focus-visible:text-sm disabled:text-sm focus:text-sm font-medium file:font-medium placeholder:font-medium disabled:font-medium focus-visible:font-medium focus:font-medium dark:focus-visible:ring-none active:ring-none focus:ring-none focus-visible:ring-none"
                onChange={(e) => setRecipient(e.target.value)}
                disabled={loading}
              />
          </div>
          <Button
          onClick={handleTransfer}
          disabled={loading || !publicKey}
          className="bg-bitcoin/15 hover:bg-bitcoin/25 active:bg-bitcoin/35 mt-1 text-bitcoin font-medium text-xl w-full flex flex-col items-center p-4 rounded-2xl gap-3 outline outline-1 outline-[rgb(132,151,197,0.01)] outline-offset-[-1px] shadow-sm h-14 border-t-3 border-zinc-950 transition-all duration-300 ease-in-out">
            {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {status || 'Processing'}
                  </>
                ) : (
                  'Send Private Transaction'
                )}
          </Button>
          </div>
        ),
      },
      {
        id: 1,
        label: "shield",
        content: (
          <div className="flex flex-col items-center justify-center">
            <div className="bg-zinc-400/15 text-white/80 w-full flex flex-col items-center p-4 rounded-3xl gap-3 outline outline-1 outline-[rgb(132,151,197,0.01)] outline-offset-[-1px] shadow-sm h-64">
              <div className="relative w-full items-start justify-start">
                <span className="text-gray/80 text-sm font-medium absolute left-1">
                  Amount to Shield
                </span>
                {publicKey && (
                  <span className="text-gray/80 text-xs font-medium absolute right-1">
                    Available public balance: {loading ? 'Loading...' : publicBalance || '0'} SOL
                  </span>
                )}
              </div>
              <Input
                type="decimal"
                inputMode="decimal"
                placeholder="Amount to Shield"
                value={shieldAmount}
                className="w-full h-full dark:focus-visible:ring-none active:ring-none focus:ring-none focus-visible:ring-none text-4xl md:text-4xl file:text-4xl focus-visible:text-4xl disabled:text-4xl border-none placeholder:text-4xl flex text-center items-center justify-center"
                onChange={(e) => setShieldAmount(e.target.value)}
                min="0"
                step="0.1"
                disabled={loading}
              />
            </div>
            <Button
              onClick={handleShield}
              disabled={loading || !publicKey}
              className="w-full bg-bitcoin/15 hover:bg-bitcoin/25 active:bg-bitcoin/35 mt-1 text-bitcoin font-medium text-xl flex flex-col items-center p-4 rounded-2xl gap-3 outline outline-1 outline-[rgb(132,151,197,0.01)] outline-offset-[-1px] shadow-sm h-14 border-t-3 border-zinc-950 transition-all duration-300 ease-in-out"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {status || 'Processing'}
                </>
              ) : (
                'Shield SOL'
              )}
            </Button>
            <div className="text-gray/60 text-xs font-medium text-center mt-2">
              1% fee applies (minimum {MIN_FEE_LAMPORTS / 1e9} SOL)
            </div>
          </div>
        ),
      },
      {
        id: 2,
        label: "unshield",
        content: (
          <div className="flex flex-col items-center justify-center">
            <div className="bg-zinc-400/15 text-white/80 w-full flex flex-col items-center p-4 rounded-3xl gap-3 outline outline-1 outline-[rgb(132,151,197,0.01)] outline-offset-[-1px] shadow-sm h-64">
              <div className="relative w-full items-start justify-start">
                <span className="text-gray/80 text-sm font-medium absolute right-1">
                  Available private balance: {loading ? 'Loading...' : privateBalance || '0'} SOL
                </span>
              </div>
              <Input
                type="decimal"
                inputMode="decimal"
                placeholder="Amount to Unshield"
                value={unshieldAmount}
                className="w-full h-full dark:focus-visible:ring-none active:ring-none focus:ring-none focus-visible:ring-none text-4xl md:text-4xl file:text-4xl focus-visible:text-4xl disabled:text-4xl border-none placeholder:text-4xl flex text-center items-center justify-center"
                onChange={(e) => setUnshieldAmount(e.target.value)}
                min="0"
                step="0.1"
                disabled={loading}
              />
            </div>
            <div className="flex items-center justify-between w-full px-2 mt-2">
              <span className="text-gray/80 text-sm">Gasless Unshield</span>
              <div
                className={`w-12 h-6 rounded-full p-1 cursor-pointer transition-colors duration-200 ease-in-out ${isGasless ? 'bg-bitcoin/30' : 'bg-zinc-700'}`}
                onClick={() => !loading && setIsGasless(!isGasless)}
              >
                <div
                  className={`w-4 h-4 rounded-full bg-white transform transition-transform duration-200 ease-in-out ${isGasless ? 'translate-x-6' : 'translate-x-0'}`}
                />
              </div>
            </div>
            <Button
              onClick={handleUnshield}
              disabled={loading || !publicKey}
              className="w-full bg-bitcoin/15 hover:bg-bitcoin/25 active:bg-bitcoin/35 mt-1 text-bitcoin font-medium text-xl flex flex-col items-center p-4 rounded-2xl gap-3 outline outline-1 outline-[rgb(132,151,197,0.01)] outline-offset-[-1px] shadow-sm h-14 border-t-3 border-zinc-950 transition-all duration-300 ease-in-out"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {status || 'Processing'}
                </>
              ) : (
                'Unshield SOL'
              )}
            </Button>
            <div className="text-gray/60 text-xs font-medium text-center mt-2">
              {isGasless ? '2% fee applies' : '1% fee applies'} (minimum {MIN_FEE_LAMPORTS / 1e9} SOL)
            </div>
          </div>
        ),
      },
      {
        id: 3,
        label: "stealth",
        content: (
          <div className="flex flex-col items-center justify-start">
            <div className="bg-zinc-400/15 text-white/80 w-full flex flex-col items-center p-4 rounded-3xl gap-3 outline outline-1 outline-[rgb(132,151,197,0.01)] outline-offset-[-1px] shadow-sm">
              {/* Top buttons section - stays fixed */}
              <div className="flex w-full gap-2">
                <Button
                  onClick={handleGenerateAddress}
                  disabled={generatingAddress || !publicKey}
                  className="flex-1 bg-bitcoin/15 hover:bg-bitcoin/25 active:bg-bitcoin/35 text-bitcoin font-medium text-sm flex items-center justify-center p-4 rounded-2xl gap-3 outline outline-1 outline-[rgb(132,151,197,0.01)] outline-offset-[-1px] shadow-sm h-12 border-t-3 border-zinc-950 transition-all duration-300 ease-in-out"
                >
                  {generatingAddress ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {'Generating...'}
                    </>
                  ) : (
                    'Generate New Address'
                  )}
                </Button>

                <Button
                  onClick={queryStealthAddresses}
                  disabled={queryingAddresses || !publicKey}
                  className="flex-1 bg-bitcoin/15 hover:bg-bitcoin/25 active:bg-bitcoin/35 text-bitcoin font-medium text-sm flex items-center justify-center p-4 rounded-2xl gap-3 outline outline-1 outline-[rgb(132,151,197,0.01)] outline-offset-[-1px] shadow-sm h-12 border-t-3 border-zinc-950 transition-all duration-300 ease-in-out"
                >
                  {queryingAddresses ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {'Querying...'}
                    </>
                  ) : (
                    'View My Addresses'
                  )}
                </Button>
              </div>

              {/* Scrollable content section - Remove overflow-y-auto and max-h-[400px] from this div */}
              <div className="w-full">
                {/* Loading States */}
                {(queryingAddresses || generatingAddress) && (
                  <div className="w-full mt-4 flex justify-center">
                    <Loader2 className="h-6 w-6 animate-spin text-gray/60" />
                  </div>
                )}

                {/* Single Generated Address */}
                {!queryingAddresses && stealthAddresses.length > 0 && (
                  <div className="w-full mt-4 text-sm">
                    <div className="text-gray/80 mb-2">New Stealth Address:</div>
                    <div className="flex items-center justify-between bg-zinc-800/50 p-2 rounded-lg mb-2 text-xs">
                      <span className="text-gray/40 text-[10px]">
                        {stealthAddresses[stealthAddresses.length - 1].address}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          navigator.clipboard.writeText(stealthAddresses[stealthAddresses.length - 1].address);
                        }}
                        className="h-6 w-6 p-0 hover:bg-zinc-700/50"
                      >
                        <Copy className="h-3 w-3 text-gray/60" />
                      </Button>
                    </div>
                  </div>
                )}

                {/* Queried Addresses List */}
                {!generatingAddress && queriedAddresses.length > 0 && (
                  <div className="w-full mt-4 text-sm">
                    <div className="text-gray/80 mb-2">Your Stealth Addresses:</div>
                    {/* Single scrollable container for all addresses */}
                    <div className="max-h-[144px] overflow-y-auto space-y-2"> {/* Height set to show ~3 addresses */}
                      {queriedAddresses.map((account, i) => (
                        <div
                          key={i}
                          className="flex items-center justify-between bg-zinc-800/50 p-2 rounded-lg text-xs"
                        >
                          <div className="flex flex-col flex-grow">
                            <span className="text-gray/40 text-[10px] break-all">
                              {account.address}
                            </span>
                            <span className="text-gray/60 text-[10px] mt-1">
                              Balance: {(account.balance / 1e9).toFixed(4)} SOL
                            </span>
                          </div>
                          <div className="flex items-center gap-2 ml-2 flex-shrink-0">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={async () => {
                                try {
                                  const addressKey = account.address;
                                  setProcessingStatus(prev => ({...prev, [addressKey]: "Starting process..."}));

                                  // Show loading state for this specific address
                                  const addressElement = document.getElementById(`address-${account.address}`);
                                  if (addressElement) {
                                      addressElement.classList.add('opacity-50');
                                  }

                                  setProcessingStatus(prev => ({...prev, [addressKey]: "Getting signature..."}));
                                  const message = new TextEncoder().encode(BASE_CHALLENGE);
                                  const signature = await signMessage!(message);
                                  const indexBytes = new Uint8Array(4);
                                  new DataView(indexBytes.buffer).setUint32(0, account.index, false);
                                  const combinedEntropy = new Uint8Array([...signature.slice(0, 32), ...indexBytes]);
                                  const seedMaterial = new Uint8Array(keccak_256(combinedEntropy));
                                  const stealthKeypair = Keypair.fromSeed(seedMaterial);
                                  const stealthPubkey = new PublicKey(account.address);

                                  // First shield any public balance
                                  if (account.balance > RENT_EXEMPT_BALANCE) {
                                    const amountToShield = account.balance - RENT_EXEMPT_BALANCE;
                                    setProcessingStatus(prev => ({...prev, [addressKey]: `Shielding ${(amountToShield / 1e9).toFixed(4)} SOL...`}));

                                    const shieldTx = await LightSystemProgram.compress({
                                      payer: stealthPubkey,
                                      toAddress: stealthPubkey,
                                      lamports: amountToShield,
                                      outputStateTree: defaultTestStateTreeAccounts().merkleTree,
                                    });

                                    const connection = await createRpc(RPC_URL);
                                    const { blockhash } = await connection.getLatestBlockhash();
                                    const shieldInstructions = [
                                      ComputeBudgetProgram.setComputeUnitLimit({ units: 1_000_000 }),
                                      shieldTx
                                    ];

                                    // Get fee payer signature
                                    const shieldResponse = await fetch('/api/gasless-unshield', {
                                      method: 'POST',
                                      headers: { 'Content-Type': 'application/json' },
                                      body: JSON.stringify({
                                        instructions: shieldInstructions.map(inst => ({
                                          programId: inst.programId.toString(),
                                          keys: inst.keys.map(key => ({
                                            pubkey: key.pubkey.toString(),
                                            isSigner: key.isSigner,
                                            isWritable: key.isWritable
                                          })),
                                          data: Array.from(inst.data)
                                        })),
                                        blockhash,
                                        userPublicKey: stealthPubkey.toString()
                                      }),
                                    });

                                    const { transaction: signedTx } = await shieldResponse.json();
                                    const transaction = VersionedTransaction.deserialize(bs58.decode(signedTx));
                                    transaction.sign([stealthKeypair]);

                                    await connection.sendTransaction(transaction, {
                                      skipPreflight: true
                                    });

                                    // Wait for shield to complete
                                    await new Promise(resolve => setTimeout(resolve, 2000));
                                  }

                                  // Then forward any shielded funds
                                  setProcessingStatus(prev => ({...prev, [addressKey]: "Forwarding shielded funds..."}));
                                  await checkAndForwardShieldedFunds(stealthPubkey, stealthKeypair);

                                  const connection = await createRpc(RPC_URL);
                                  const newBalance = await connection.getBalance(stealthPubkey);

                                  setQueriedAddresses(prev =>
                                    prev.map(addr =>
                                      addr.address === account.address
                                        ? { ...addr, balance: newBalance }
                                        : addr
                                    )
                                  );

                                  setProcessingStatus(prev => ({...prev, [addressKey]: "Complete!"}));
                                  // Clear status after a delay
                                  setTimeout(() => {
                                    setProcessingStatus(prev => {
                                      const newStatus = {...prev};
                                      delete newStatus[addressKey];
                                      return newStatus;
                                    });
                                  }, 2000);

                                } catch (error) {
                                  console.error("Error processing manual shield/send:", error);
                                  setProcessingStatus(prev => ({...prev, [addressKey]: "Error occurred"}));
                                } finally {
                                  // Remove loading state
                                  const addressElement = document.getElementById(`address-${account.address}`);
                                  if (addressElement) {
                                      addressElement.classList.remove('opacity-50');
                                  }
                                }
                              }}
                              className="h-6 w-6 p-0 hover:bg-zinc-700/50"
                              title="Shield and forward funds"
                            >
                              <Loader2 className="h-3 w-3 text-yellow-500/80" />
                            </Button>
                            {/* Add this right after the buttons to show status */}
                            {processingStatus[account.address] && (
                              <div className="text-[10px] text-yellow-500/80 mt-1">
                                {processingStatus[account.address]}
                              </div>
                            )}
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                navigator.clipboard.writeText(account.address);
                              }}
                              className="h-6 w-6 p-0 hover:bg-zinc-700/50"
                            >
                              <Copy className="h-3 w-3 text-gray/60" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Bottom section - stays fixed */}
              <div className="w-full mt-4">
                <div className="text-gray/60 text-xs font-medium text-center mb-4">
                  Generate a private stealth address linked to your wallet
                </div>

                <Button
                  onClick={async () => {
                    setStealthModeEnabled(!stealthModeEnabled);
                    if (!stealthModeEnabled) {
                      await startAutoShieldMonitor();
                    } else if (monitoringCleanup) {
                      monitoringCleanup();
                      setMonitoringCleanup(null);
                    }
                  }}
                  disabled={!publicKey}
                  className="w-full bg-bitcoin/15 hover:bg-bitcoin/25 active:bg-bitcoin/35 text-bitcoin font-medium text-sm flex items-center justify-center p-4 rounded-2xl gap-3 outline outline-1 outline-[rgb(132,151,197,0.01)] outline-offset-[-1px] shadow-sm h-12 border-t-3 border-zinc-950 transition-all duration-300 ease-in-out"
                >
                  {stealthModeEnabled ? 'Disable Stealth Mode' : 'Enable Stealth Mode'}
                </Button>

                {stealthModeEnabled && (
                  <div className="mt-2 text-gray/60 text-xs text-center">
                    <div className="flex items-center justify-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
                      Stealth Mode Active
                    </div>
                    <div className="mt-1">
                      Incoming funds will be automatically shielded and privately sent to your wallet
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        ),
      },
      {
        label: "swap",
        content: (
          <div className="flex flex-col items-center justify-start">
            <div className="bg-zinc-400/15 text-white/80 w-full flex flex-col items-center p-4 rounded-3xl gap-3 outline outline-1 outline-[rgb(132,151,197,0.01)] outline-offset-[-1px] shadow-sm">
              {/* Conditionally render either main buttons or wallet management */}
              {!showWalletManagement ? (
                <>
                  {/* Top buttons section */}
                  <div className="flex w-full gap-2">
                    <Button
                      variant="ghost"
                      className="flex-1 px-3 py-1 bg-bitcoin/15 hover:bg-bitcoin/25 active:bg-bitcoin/35 text-bitcoin"
                      onClick={() => setShowWalletManagement(true)}
                      disabled={loading || !publicKey}
                    >
                      {loading ? (
                        <div className="flex items-center gap-2">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Loading...
                        </div>
                      ) : (
                        'Wallet Management'
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      className="flex-1 px-3 py-1 bg-zinc-700/50 hover:bg-zinc-700/70"
                      disabled={!tradingAddresses.length || loading}
                    >
                      {loading ? (
                        <div className="flex items-center gap-2">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Loading...
                        </div>
                      ) : (
                        'Swap Interface'
                      )}
                    </Button>
                  </div>
                  <div className="flex w-full gap-2">
                    <Button
                      variant="ghost"
                      className="flex-1 px-3 py-1 bg-zinc-700/50 hover:bg-zinc-700/70"
                      disabled={!tradingAddresses.length || loading}
                    >
                      {loading ? (
                        <div className="flex items-center gap-2">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Loading...
                        </div>
                      ) : (
                        'Position Management'
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      className="flex-1 px-3 py-1 bg-zinc-700/50 hover:bg-zinc-700/70"
                      disabled={!tradingAddresses.length || loading}
                      onClick={handleSendToMainWallet}
                    >
                      {sendToMainLoading ? (
                        <div className="flex items-center gap-2">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Sending...
                        </div>
                      ) : (
                        'Send to Main Wallet'
                      )}
                    </Button>
                  </div>
                </>
              ) : (
                /* Wallet Management Section */
                <div className="w-full bg-zinc-800/30 p-3 rounded-xl max-h-[60vh] overflow-y-auto">
                  <div className="flex items-center justify-between mb-3">
                    <div className="text-gray/80 text-sm font-medium">Wallet Management</div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="p-1 h-7 w-7 rounded-full hover:bg-zinc-700/50"
                      onClick={() => {
                        setShowWalletManagement(false);
                        setShowAddressList(false);
                        setShowTopUpForm(false);
                        setAddressSignatureVerified(false);
                      }}
                    >
                      <ArrowLeft className="h-4 w-4" />
                    </Button>
                  </div>

                  {/* View Addresses Button - Now also handles generation if no address exists */}
                  <Button
                    variant="ghost"
                    className="w-full mb-3 px-3 py-1 bg-bitcoin/15 hover:bg-bitcoin/25 active:bg-bitcoin/35 text-bitcoin"
                    onClick={async () => {
                      if (!publicKey || !signMessage) return;
                      
                      if (tradingAddresses.length === 0) {
                        handleGenerateTradingAddress();
                        return;
                      }
                      
                      if (showAddressList) {
                        setShowAddressList(false);
                        setAddressSignatureVerified(false);
                        return;
                      }
                      
                      try {
                        setLoading(true);
                        const message = new TextEncoder().encode(TRADING_CHALLENGE);
                        const signature = await signMessage(message);
                        
                        if (signature) {
                          setAddressSignatureVerified(true);
                          setShowAddressList(true);
                          setShowTopUpForm(false);
                          
                          await checkTradingBalances();
                        }
                      } catch (error) {
                        console.error("Error verifying signature:", error);
                        setError("Signature required to view trading addresses");
                      } finally {
                        setLoading(false);
                      }
                    }}
                    disabled={loading || !publicKey}
                  >
                    {loading ? (
                      <div className="flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Generating...
                      </div>
                    ) : (
                      'View Trading Address'
                    )}
                  </Button>
                  
                  {/* Trading Addresses List - Moved here to appear under View Trading Address button */}
                  {tradingAddresses.length > 0 && showAddressList && addressSignatureVerified && (
                    <div className="w-full mb-3">
                      <div className="max-h-[144px] overflow-y-auto space-y-2">
                        {tradingAddresses.map((account, i) => (
                          <div
                            key={i}
                            className="flex items-center justify-between bg-zinc-800/50 p-2 rounded-lg text-xs"
                          >
                            <div className="flex flex-col flex-grow">
                              <span className="text-gray/40 text-[10px] break-all">
                                {account.address}
                              </span>
                              <span className="text-gray/60 text-[10px] mt-1">
                                Public: {tradingBalances[account.address]?.public ? (tradingBalances[account.address].public / 1e9).toFixed(4) : '0.0000'} SOL
                              </span>
                              <span className="text-gray/60 text-[10px]">
                                Private: {tradingBalances[account.address]?.private ? (tradingBalances[account.address].private / 1e9).toFixed(4) : '0.0000'} SOL
                              </span>
                            </div>
                            <div className="flex items-center gap-2 ml-2 flex-shrink-0">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  navigator.clipboard.writeText(account.address);
                                }}
                                className="h-6 w-6 p-0 hover:bg-zinc-700/50"
                              >
                                <Copy className="h-3 w-3 text-gray/60" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => checkTradingBalances()}
                                className="h-6 w-6 p-0 hover:bg-zinc-700/50"
                                title="Refresh balance"
                                disabled={refreshingBalances}
                              >
                                <Loader2 className={`h-3 w-3 text-yellow-500/80 ${refreshingBalances ? 'animate-spin' : ''}`} />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Top Up Button */}
                  <Button
                    variant="ghost"
                    className="w-full mb-3 px-3 py-1 bg-bitcoin/15 hover:bg-bitcoin/25 active:bg-bitcoin/35 text-bitcoin"
                    onClick={() => {
                      if (tradingAddresses.length === 0) {
                        setError('Please generate a trading address first');
                        return;
                      }
                      setShowTopUpForm(!showTopUpForm);
                      if (!showTopUpForm) {
                        setShowAddressList(false);
                      }
                    }}
                    disabled={loading || !publicKey}
                  >
                    Top Up Trading Balance
                  </Button>
                  
                  {/* Top Up Form - Only shown when showTopUpForm is true */}
                  {showTopUpForm && (
                    <div className="mb-3">
                      <div className="flex gap-2">
                        <Input
                          type="decimal"
                          inputMode="decimal"
                          placeholder="Amount (SOL)"
                          value={topUpAmount}
                          onChange={(e) => setTopUpAmount(e.target.value)}
                          className="bg-zinc-800/50 border-zinc-700/50 text-sm"
                        />
                        <Button
                          variant="ghost"
                          className="px-3 py-1 bg-zinc-700/50 hover:bg-zinc-700/70"
                          disabled={loading || !topUpAmount || tradingAddresses.length === 0}
                          onClick={handleTopUpTrading}
                        >
                          {topUpLoading ? (
                            <div className="flex items-center gap-2">
                              <Loader2 className="h-4 w-4 animate-spin" />
                              Sending...
                            </div>
                          ) : (
                            'Send'
                          )}
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Trading Addresses List - Moved to appear under View Trading Address button */}
                </div>
              )}

              {/* Trading address is now only visible in the Wallet Management section */}

              <div className="text-gray/60 text-xs font-medium text-center mt-2">
                {!showWalletManagement ? 'Manage your trading addresses to start swapping' : 'Generate and manage your private trading addresses'}
              </div>
            </div>
          </div>
        ),
      }
    ]


    return (
      <div className="min-w-[300px] max-w-[45ch]">
        <DirectionAwareTabs tabs={tabs} />
      </div>
    )
}

export { DirectionAwareTabsDemo }
