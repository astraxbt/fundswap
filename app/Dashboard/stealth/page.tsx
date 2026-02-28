"use client";

import React, { useState, useCallback, useEffect } from "react";
import Link from "next/link";
import { ArrowLeft, Shield, Eye, RefreshCw, Plus, Copy, Share2, Loader2, ChevronDown, ChevronUp } from "lucide-react";
import NavBar from "@/components/navBar";
import { useWallet } from '@solana/wallet-adapter-react';
import { ComputeBudgetProgram, TransactionMessage, VersionedTransaction, PublicKey, Keypair } from '@solana/web3.js';
import { toast } from 'sonner';
import { generateStealthAddress, getAllStealthAddresses, BASE_CHALLENGE } from './utils';
import { keccak_256 } from '@noble/hashes/sha3';
import { createRpc, LightSystemProgram, defaultTestStateTreeAccounts, bn } from '@lightprotocol/stateless.js';
import { SystemProgram } from '@solana/web3.js';
import bs58 from 'bs58';

const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || "https://api.mainnet-beta.solana.com";
const RENT_EXEMPT_BALANCE = 8908800; // Minimum balance for rent exemption (about 0.0008909 SOL)

export default function StealthPage() {
  const { publicKey, sendTransaction, signMessage } = useWallet();
  const [activeTab, setActiveTab] = useState("generate");
  const [stealthAddresses, setStealthAddresses] = useState<Array<{address: string, index: number, timestamp: number}>>(() => {
    if (typeof window !== 'undefined' && publicKey) {
      const stored = localStorage.getItem(`stealth-addresses-${publicKey.toString()}`);
      return stored ? JSON.parse(stored) : [];
    }
    return [];
  });
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [generatingAddress, setGeneratingAddress] = useState(false);
  const [addressBalances, setAddressBalances] = useState<{[key: string]: {public: string, private: string}}>({});
  const [queryingAddresses, setQueryingAddresses] = useState(false);
  const [expandedAddresses, setExpandedAddresses] = useState<{[key: string]: boolean}>({});

  useEffect(() => {
    if (publicKey && typeof window !== 'undefined') {
      const storedIndex = localStorage.getItem(`stealth-index-${publicKey.toString()}`);
      if (storedIndex) {
        setCurrentIndex(parseInt(storedIndex));
      }
    }
  }, [publicKey]);

  useEffect(() => {
    if (publicKey && typeof window !== 'undefined') {
      const stored = localStorage.getItem(`stealth-addresses-${publicKey.toString()}`);
      if (stored) {
        setStealthAddresses(JSON.parse(stored));
      }
    }
  }, [publicKey]);

  const checkPrivateBalance = useCallback(async (address: string) => {
    if (!address) return "0.0000";
    try {
      const connection = await createRpc(RPC_URL);
      const compressedAccounts = await connection.getCompressedAccountsByOwner(new PublicKey(address));
      
      if (!compressedAccounts || !compressedAccounts.items || compressedAccounts.items.length === 0) {
        return "0.0000";
      }
      
      let totalLamports = BigInt(0);
      for (const account of compressedAccounts.items) {
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
  }, []);

  const checkPublicBalance = useCallback(async (address: string) => {
    if (!address) return "0.0000";
    try {
      const connection = await createRpc(RPC_URL);
      const balance = await connection.getBalance(new PublicKey(address));
      return (balance / 1e9).toFixed(4);
    } catch (err) {
      console.error('Error checking public balance:', err);
      return "0.0000";
    }
  }, []);

  const handleCopyAddress = (address: string) => {
    navigator.clipboard.writeText(address);
    toast.success("Address copied to clipboard");
  };

  const handleShareAddress = (address: string) => {
    navigator.clipboard.writeText(address);
    toast.success("Address copied to clipboard");
  };

  const handleRecoverFunds = async (address: string) => {
    if (!publicKey || !signMessage) {
      toast.error("Please connect your wallet");
      return;
    }

    setLoading(true);
    setError('');
    setStatus('Initializing recovery...');

    try {
      const stealthAddress = stealthAddresses.find(a => a.address === address);
      if (!stealthAddress) {
        throw new Error("Stealth address not found");
      }

      const challenge = BASE_CHALLENGE;
      const message = new TextEncoder().encode(challenge);
      const signature = await signMessage(message);
      
      const indexBytes = new Uint8Array(4);
      new DataView(indexBytes.buffer).setUint32(0, stealthAddress.index, false);
      const combinedEntropy = new Uint8Array([...signature.slice(0, 32), ...indexBytes]);
      const seedMaterial = new Uint8Array(keccak_256(combinedEntropy));
      const stealthKeypair = Keypair.fromSeed(seedMaterial);
      
      if (stealthKeypair.publicKey.toString() !== address) {
        throw new Error("Generated keypair doesn't match the stealth address");
      }
      
      const connection = await createRpc(RPC_URL);
      
      const privateBalance = await checkPrivateBalance(address);
      const privateLamports = parseFloat(privateBalance) * 1e9;
      
      if (privateLamports > 0) {
        toast.info("Recovering private funds...");
        setStatus(`Recovering ${(privateLamports / 1e9).toFixed(4)} SOL from private balance...`);
        
        const compressedAccounts = await connection.getCompressedAccountsByOwner(new PublicKey(address));
        
        if (compressedAccounts.items.length === 0) {
          throw new Error("No compressed accounts found");
        }
        
        const { compressedProof, rootIndices } = await connection.getValidityProof(
          compressedAccounts.items.map(account => {
            const hashBuffer = Buffer.from(account.hash);
            return bn(hashBuffer, 'be');
          })
        );
        
        const transferInstruction = await LightSystemProgram.transfer({
          payer: new PublicKey(address),
          toAddress: publicKey,
          lamports: privateLamports - 10000, // Leave some for fees
          inputCompressedAccounts: compressedAccounts.items,
          outputStateTrees: [defaultTestStateTreeAccounts().merkleTree],
          recentValidityProof: compressedProof,
          recentInputStateRootIndices: rootIndices,
        });
        
        const transferInstructions = [
          ComputeBudgetProgram.setComputeUnitLimit({ units: 1_000_000 }),
          transferInstruction,
        ];
        
        const { blockhash } = await connection.getLatestBlockhash();
        
        const transferResponse = await fetch('/api/gasless-send', {
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
            userPublicKey: new PublicKey(address).toString()
          }),
        });
        
        if (!transferResponse.ok) {
          const errorData = await transferResponse.json();
          throw new Error(`Gasless transfer failed: ${errorData.error || 'Unknown error'}`);
        }
        
        const { transaction: signedTx } = await transferResponse.json();
        const transaction = VersionedTransaction.deserialize(bs58.decode(signedTx));
        transaction.sign([stealthKeypair]);
        
        const signature = await connection.sendTransaction(transaction, {
          skipPreflight: true
        });
        
        await connection.confirmTransaction(signature);
        
        toast.success("Private funds recovered successfully!");
        
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
      
      const publicBalance = await checkPublicBalance(address);
      const publicLamports = parseFloat(publicBalance) * 1e9;
      
      if (publicLamports > RENT_EXEMPT_BALANCE) { // Ensure there's enough to pay for transaction
        toast.info("Shielding public funds...");
        
        const shieldAmount = publicLamports - RENT_EXEMPT_BALANCE; // Leave enough for rent exemption and fees
        setStatus(`Shielding ${(shieldAmount / 1e9).toFixed(4)} SOL...`);
        
        const shieldInstruction = await LightSystemProgram.compress({
          payer: new PublicKey(address),
          toAddress: new PublicKey(address), // Shield to the same address first
          lamports: shieldAmount,
          outputStateTree: defaultTestStateTreeAccounts().merkleTree,
        });
        
        const shieldInstructions = [
          ComputeBudgetProgram.setComputeUnitLimit({ units: 1_000_000 }),
          shieldInstruction,
        ];
        
        const { blockhash } = await connection.getLatestBlockhash();
        
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
            userPublicKey: new PublicKey(address).toString()
          }),
        });
        
        if (!shieldResponse.ok) {
          const errorData = await shieldResponse.json();
          throw new Error(`Gasless shield failed: ${errorData.error || 'Unknown error'}`);
        }
        
        const { transaction: signedTx } = await shieldResponse.json();
        const transaction = VersionedTransaction.deserialize(bs58.decode(signedTx));
        transaction.sign([stealthKeypair]);
        
        const txSignature = await connection.sendTransaction(transaction, {
          skipPreflight: true
        });
        
        await connection.confirmTransaction(txSignature);
        
        toast.success("Funds shielded successfully!");
        
        setStatus("Waiting for shield transaction to be confirmed...");
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        setStatus("Forwarding shielded funds to main wallet...");
        toast.info("Sending funds to main wallet...");
        
        const checkAndForwardShieldedFunds = async (stealthPubkey: PublicKey, stealthKeypair: Keypair) => {
          try {
            let compressedAccounts;
            let retries = 0;
            const maxRetries = 3;
            
            while (retries < maxRetries) {
              compressedAccounts = await connection.getCompressedAccountsByOwner(stealthPubkey);
              
              if (compressedAccounts && compressedAccounts.items && compressedAccounts.items.length > 0) {
                break;
              }
              
              setStatus(`Waiting for shielded funds to be available (attempt ${retries + 1}/${maxRetries})...`);
              await new Promise(resolve => setTimeout(resolve, 3000));
              retries++;
            }
            
            if (!compressedAccounts || !compressedAccounts.items || compressedAccounts.items.length === 0) {
              throw new Error("No compressed accounts found after shielding");
            }
            
            const { compressedProof, rootIndices } = await connection.getValidityProof(
              compressedAccounts.items.map(account => {
                const hashBuffer = Buffer.from(account.hash);
                return bn(hashBuffer, 'be');
              })
            );
            
            const transferTx = await LightSystemProgram.transfer({
              payer: stealthPubkey,
              toAddress: publicKey,
              lamports: shieldAmount - 10000, // Leave some for fees
              inputCompressedAccounts: compressedAccounts.items,
              outputStateTrees: [defaultTestStateTreeAccounts().merkleTree],
              recentValidityProof: compressedProof,
              recentInputStateRootIndices: rootIndices,
            });
            
            const transferInstructions = [
              ComputeBudgetProgram.setComputeUnitLimit({ units: 1_000_000 }),
              transferTx,
            ];
            
            const { blockhash } = await connection.getLatestBlockhash();
            
            const transferResponse = await fetch('/api/gasless-send', {
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
              }),
            });
            
            if (!transferResponse.ok) {
              const errorData = await transferResponse.json();
              throw new Error(`Gasless transfer failed: ${errorData.error || 'Unknown error'}`);
            }
            
            const { transaction: signedTx } = await transferResponse.json();
            const transferTransaction = VersionedTransaction.deserialize(bs58.decode(signedTx));
            transferTransaction.sign([stealthKeypair]);
            
            const transferSig = await connection.sendTransaction(transferTransaction, {
              skipPreflight: true
            });
            
            await connection.confirmTransaction(transferSig);
            return transferSig;
          } catch (error: any) {
            console.error("Error forwarding shielded funds:", error);
            throw error;
          }
        };
        
        await checkAndForwardShieldedFunds(new PublicKey(address), stealthKeypair);
        
        toast.success("Private Transfer Completed Successfully");
      }
      
      queryStealthAddresses();
      
    } catch (err: any) {
      console.error('Error recovering funds:', err);
      setError(err.message || 'Failed to recover funds');
      toast.error("Failed to recover funds: " + (err.message || 'Unknown error'));
    } finally {
      setLoading(false);
      setStatus('');
    }
  };

  const handleGenerateAddress = async () => {
    if (!publicKey || !signMessage) {
      toast.error("Please connect your wallet");
      return;
    }

    setGeneratingAddress(true);
    setError('');
    setStatus('Generating stealth addresses...');

    try {
      const challenge = BASE_CHALLENGE;
      const message = new TextEncoder().encode(challenge);
      const signature = await signMessage(message);
      
      const newAddresses = [];
      const startIndex = 1;
      const endIndex = 6; // Generate addresses with indices 1,2,3,4,5
      
      for (let i = startIndex; i < endIndex; i++) {
        const indexBytes = new Uint8Array(4);
        new DataView(indexBytes.buffer).setUint32(0, i, false);
        const combinedEntropy = new Uint8Array([...signature.slice(0, 32), ...indexBytes]);
        
        const seedMaterial = new Uint8Array(keccak_256(combinedEntropy));
        const newKeypair = Keypair.fromSeed(seedMaterial);
        const newAddress = newKeypair.publicKey.toString();
        
        newAddresses.push({
          address: newAddress,
          index: i,
          timestamp: Date.now()
        });
      }
      
      setStatus('');
      
      if (typeof window !== 'undefined') {
        try {
          localStorage.setItem(`stealth-addresses-${publicKey.toString()}`, JSON.stringify(newAddresses));
          localStorage.setItem(`stealth-index-${publicKey.toString()}`, endIndex.toString());
          setCurrentIndex(endIndex);
        } catch (e) {
          console.warn('Failed to save to localStorage:', e);
        }
      }

      toast.success("Success! Go to 'Your Addresses' to view your stealth addresses");
      
      setActiveTab("addresses");
    } catch (err: any) {
      console.error('Error generating stealth addresses:', err);
      setError(err.message || 'Failed to generate stealth addresses');
      toast.error("Failed to generate stealth addresses");
    } finally {
      setGeneratingAddress(false);
    }
  };

  const displayStealthAddresses = async () => {
    if (!publicKey || !signMessage) {
      toast.error("Please connect your wallet");
      return;
    }
    
    setGeneratingAddress(true);
    setError('');
    setStatus('Generating stealth addresses...');
    
    try {
      const challenge = BASE_CHALLENGE;
      const message = new TextEncoder().encode(challenge);
      const signature = await signMessage(message);
      
      const newAddresses = [];
      const startIndex = 1;
      const endIndex = 6; // Generate addresses with indices 1,2,3,4,5
      
      for (let i = startIndex; i < endIndex; i++) {
        const indexBytes = new Uint8Array(4);
        new DataView(indexBytes.buffer).setUint32(0, i, false);
        const combinedEntropy = new Uint8Array([...signature.slice(0, 32), ...indexBytes]);
        
        const seedMaterial = new Uint8Array(keccak_256(combinedEntropy));
        const newKeypair = Keypair.fromSeed(seedMaterial);
        const newAddress = newKeypair.publicKey.toString();
        
        newAddresses.push({
          address: newAddress,
          index: i,
          timestamp: Date.now()
        });
      }
      
      setStealthAddresses(newAddresses);
      
      if (typeof window !== 'undefined') {
        try {
          localStorage.setItem(`stealth-addresses-${publicKey.toString()}`, JSON.stringify(newAddresses));
          localStorage.setItem(`stealth-index-${publicKey.toString()}`, endIndex.toString());
          setCurrentIndex(endIndex);
        } catch (e) {
          console.warn('Failed to save to localStorage:', e);
        }
      }
      
      toast.success("Stealth addresses displayed");
      setStatus('');
      
      queryStealthAddresses();
    } catch (err: any) {
      console.error('Error displaying stealth addresses:', err);
      setError(err.message || 'Failed to display stealth addresses');
      toast.error("Failed to display stealth addresses");
    } finally {
      setGeneratingAddress(false);
    }
  };
  
  const queryStealthAddresses = async () => {
    if (!publicKey || !signMessage) {
      toast.error("Please connect your wallet");
      return;
    }
    
    setQueryingAddresses(true);
    try {
      const challenge = BASE_CHALLENGE;
      const message = new TextEncoder().encode(challenge);
      const signature = await signMessage(message);
      
      const addressesWithBalances: {[key: string]: {public: string, private: string}} = {};
      
      for (let i = 1; i <= 5; i++) {
        const indexBytes = new Uint8Array(4);
        new DataView(indexBytes.buffer).setUint32(0, i, false);
        const combinedEntropy = new Uint8Array([...signature.slice(0, 32), ...indexBytes]);
        
        const seedMaterial = new Uint8Array(keccak_256(combinedEntropy));
        const stealthKeypair = Keypair.fromSeed(seedMaterial);
        const address = stealthKeypair.publicKey.toString();
        
        console.log(`Checking balance for stealth address ${i}: ${address}`);
        
        try {
          const connection = await createRpc(RPC_URL);
          
          const publicBalance = await connection.getBalance(stealthKeypair.publicKey);
          const formattedPublicBalance = (publicBalance / 1e9).toFixed(4);
          
          let privateBalance = "0.0000";
          try {
            const compressedAccounts = await connection.getCompressedAccountsByOwner(stealthKeypair.publicKey);
            
            if (compressedAccounts && compressedAccounts.items && compressedAccounts.items.length > 0) {
              let totalLamports = BigInt(0);
              for (const account of compressedAccounts.items) {
                if (account.lamports) {
                  if (typeof account.lamports === 'string' && account.lamports.startsWith('0x')) {
                    totalLamports += BigInt(parseInt(account.lamports, 16));
                  } else {
                    totalLamports += BigInt(account.lamports);
                  }
                }
              }
              
              const solBalance = Number(totalLamports) / 1e9;
              privateBalance = solBalance.toFixed(4);
            }
          } catch (err) {
            console.error(`Error checking private balance for ${address}:`, err);
          }
          
          addressesWithBalances[address] = {
            public: formattedPublicBalance,
            private: privateBalance
          };
          
          console.log(`Address ${address} balances:`, {
            public: formattedPublicBalance,
            private: privateBalance
          });
          
        } catch (err) {
          console.error(`Error checking balances for ${address}:`, err);
          addressesWithBalances[address] = {
            public: "0.0000",
            private: "0.0000"
          };
        }
      }
      
      setAddressBalances(addressesWithBalances);
      toast.success("Address balances updated");
    } catch (err: any) {
      console.error('Error querying addresses:', err);
      toast.error("Failed to query addresses");
    } finally {
      setQueryingAddresses(false);
    }
  };

  useEffect(() => {
    if (activeTab === "addresses" && publicKey && stealthAddresses.length > 0 && Object.keys(addressBalances).length === 0) {
      queryStealthAddresses();
    }
  }, [activeTab, publicKey, stealthAddresses]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0a0a0e] to-[#16151E] text-white">
      <NavBar />
      
      <div className="pt-24 pb-16 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Back button and Title */}
        
        {/* Page Title */}
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold">
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-teal-300">
              Stealth Mode
            </span>
          </h1>
          <p className="text-white/70 text-sm mt-1">
            Generate and manage stealth addresses for enhanced privacy
          </p>
        </div>
        
        {/* Main Content */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto">
          {/* Stealth Address Management */}
          <div className="bg-[#1E1E2D] backdrop-blur-sm p-6 rounded-xl border border-zinc-800/50">
            <div className="flex items-start mb-6">
              <div className="bg-purple-900/60 p-3 rounded-lg mr-4">
                <Shield className="h-5 w-5 text-purple-400" />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-white">Stealth Address Management</h2>
                <p className="text-white/70 text-sm">
                  Create and manage your private stealth addresses
                </p>
              </div>
            </div>
            
            {/* Tabs */}
            <div className="bg-[#131320] backdrop-blur-sm rounded-lg border border-zinc-800/50 mb-6 overflow-hidden">
              <div className="flex">
                <button
                  className={`flex-1 py-3 text-center ${
                    activeTab === "generate"
                      ? "bg-[#1E1E2D] text-white"
                      : "text-white/70 hover:text-white hover:bg-[#1E1E2D]/50"
                  }`}
                  onClick={() => setActiveTab("generate")}
                >
                  Generate
                </button>
                <button
                  className={`flex-1 py-3 text-center ${
                    activeTab === "addresses"
                      ? "bg-[#1E1E2D] text-white"
                      : "text-white/70 hover:text-white hover:bg-[#1E1E2D]/50"
                  }`}
                  onClick={() => setActiveTab("addresses")}
                >
                  Your Addresses
                </button>
              </div>
            </div>
            
            {/* Tab Content */}
            {activeTab === "generate" ? (
              <>
                {/* Generate New Button */}
                <button 
                  className="w-full bg-purple-600 hover:bg-purple-700 text-white font-medium py-3 px-4 rounded-lg flex items-center justify-center transition-all duration-300 mb-6"
                  onClick={handleGenerateAddress}
                  disabled={generatingAddress || !publicKey}
                >
                  {generatingAddress ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Plus className="mr-2 h-4 w-4" />
                  )}
                  {generatingAddress ? "Generating..." : "Generate New Stealth Address"}
                </button>
                
                {/* Status and Error Messages */}
                {status && (
                  <div className="mb-4 p-3 bg-blue-900/20 border border-blue-800/30 rounded-lg text-sm text-blue-300">
                    {status}
                  </div>
                )}
                
                {error && (
                  <div className="mb-4 p-3 bg-red-900/20 border border-red-800/30 rounded-lg text-sm text-red-300">
                    {error}
                  </div>
                )}
                
                {/* Privacy Protection Info */}
                <div className="mt-6 p-4 bg-[#131320] rounded-lg border border-zinc-700/30">
                  <div className="flex items-center mb-2">
                    <Eye className="h-4 w-4 text-purple-400 mr-2" />
                    <h3 className="text-sm font-medium text-white/90">Privacy Protection</h3>
                  </div>
                  <p className="text-sm text-white/70 leading-relaxed">
                    Each generated address provides a new layer of anonymity, 
                    breaking the link between your main wallet and transactions.
                  </p>
                </div>
              </>
            ) : (
              /* Your Addresses Tab Content */
              <div className="space-y-4">
                {/* Display Addresses Button */}
                <button 
                  className="w-full mb-4 bg-purple-600 hover:bg-purple-700 text-white font-medium py-2 px-4 rounded-lg flex items-center justify-center transition-all duration-300"
                  onClick={displayStealthAddresses}
                  disabled={generatingAddress || !publicKey}
                >
                  {generatingAddress ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Eye className="mr-2 h-4 w-4" />
                  )}
                  {generatingAddress ? "Generating..." : "Display Addresses"}
                </button>
                
                {/* Refresh Button */}
                <button 
                  className="w-full mb-4 bg-zinc-800 hover:bg-zinc-700 text-white font-medium py-2 px-4 rounded-lg flex items-center justify-center transition-all duration-300"
                  onClick={queryStealthAddresses}
                  disabled={queryingAddresses || !publicKey}
                >
                  {queryingAddresses ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="mr-2 h-4 w-4" />
                  )}
                  {queryingAddresses ? "Updating Balances..." : "Refresh Balances"}
                </button>
                
                {stealthAddresses.length === 0 ? (
                  <div className="p-4 bg-[#131320] rounded-lg border border-zinc-800/50 text-center text-white/70">
                    No stealth addresses generated yet. Go to the Generate tab to create one.
                  </div>
                ) : (
                  stealthAddresses.map((address, index) => (
                    <div key={index} className="bg-[#131320] rounded-lg border border-zinc-800/50 overflow-hidden">
                      {/* Address Header - Always visible */}
                      <button 
                        className="w-full p-4 flex items-center justify-between text-left hover:bg-[#1E1E2D]/30 transition-colors"
                        onClick={() => setExpandedAddresses(prev => ({
                          ...prev,
                          [address.address]: !prev[address.address]
                        }))}
                      >
                        <div className="flex items-center">
                          <div className="flex-shrink-0 h-6 w-6 rounded-full bg-purple-900/40 flex items-center justify-center text-xs font-medium text-purple-300 mr-3">
                            {index + 1}
                          </div>
                          <div>
                            <div className="text-xs text-white/60 mb-1">Stealth Address {index + 1}</div>
                            <div className="font-mono text-sm text-white/90 truncate max-w-[180px] md:max-w-[250px]">
                              {address.address.substring(0, 8)}...{address.address.substring(address.address.length - 8)}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center">
                          {expandedAddresses[address.address] ? (
                            <ChevronUp className="h-4 w-4 text-white/70" />
                          ) : (
                            <ChevronDown className="h-4 w-4 text-white/70" />
                          )}
                        </div>
                      </button>
                      
                      {/* Collapsible Content */}
                      {expandedAddresses[address.address] && (
                        <>
                          {/* Full Address Display */}
                          <div className="px-4 py-3 border-t border-zinc-800/30 flex items-center justify-between">
                            <div className="font-mono text-xs text-white/80 break-all">{address.address}</div>
                            <div className="flex space-x-2 ml-2 flex-shrink-0">
                              <button 
                                onClick={() => handleCopyAddress(address.address)}
                                className="text-white/70 hover:text-white"
                              >
                                <Copy className="h-4 w-4" />
                              </button>
                              <button 
                                onClick={() => handleShareAddress(address.address)}
                                className="text-white/70 hover:text-white"
                              >
                                <Share2 className="h-4 w-4" />
                              </button>
                            </div>
                          </div>
                          
                          {/* Balance Display */}
                          <div className="px-4 py-3 flex justify-between border-t border-zinc-800/30">
                            <div>
                              <div className="text-xs text-white/60">Public</div>
                              <div className="text-sm font-medium">
                                {addressBalances[address.address]?.public || "0.0000"} SOL
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="text-xs text-white/60">Private</div>
                              <div className="text-sm font-medium">
                                {addressBalances[address.address]?.private || "0.0000"} SOL
                              </div>
                            </div>
                          </div>
                          
                          {/* Recover Button */}
                          <button 
                            onClick={() => handleRecoverFunds(address.address)}
                            className="w-full bg-transparent hover:bg-green-900/20 text-green-400 border-t border-zinc-800/30 py-3 flex items-center justify-center transition-colors"
                          >
                            <RefreshCw className="h-4 w-4 mr-2" />
                            Recover Funds to Main Wallet
                          </button>
                        </>
                      )}
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
          
          {/* How Stealth Mode Works */}
          <div className="bg-[#1E1E2D] backdrop-blur-sm p-6 rounded-xl border border-zinc-800/50">
            <div className="flex items-start mb-6">
              <div className="bg-purple-900/60 p-3 rounded-lg mr-4">
                <Eye className="h-5 w-5 text-purple-400" />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-white">How Stealth Mode Works</h2>
                <p className="text-white/70 text-sm">
                  Understanding stealth addresses
                </p>
              </div>
            </div>
            
            {/* Steps */}
            <div className="space-y-6 mt-6">
              <div className="flex">
                <div className="flex-shrink-0 h-7 w-7 rounded-full bg-purple-900/40 flex items-center justify-center text-xs font-medium text-purple-300 mr-3">
                  1
                </div>
                <div>
                  <p className="text-sm text-white/90 leading-relaxed">
                    Generate a unique stealth address for each transaction
                  </p>
                </div>
              </div>
              
              <div className="flex">
                <div className="flex-shrink-0 h-7 w-7 rounded-full bg-purple-900/40 flex items-center justify-center text-xs font-medium text-purple-300 mr-3">
                  2
                </div>
                <div>
                  <p className="text-sm text-white/90 leading-relaxed">
                    Transactions are routed through a privacy pool
                  </p>
                </div>
              </div>
              
              <div className="flex">
                <div className="flex-shrink-0 h-7 w-7 rounded-full bg-purple-900/40 flex items-center justify-center text-xs font-medium text-purple-300 mr-3">
                  3
                </div>
                <div>
                  <p className="text-sm text-white/90 leading-relaxed">
                    No on-chain link between sender and recipient
                  </p>
                </div>
              </div>
              
              <div className="flex">
                <div className="flex-shrink-0 h-7 w-7 rounded-full bg-purple-900/40 flex items-center justify-center text-xs font-medium text-purple-300 mr-3">
                  4
                </div>
                <div>
                  <p className="text-sm text-white/90 leading-relaxed">
                    Complete transaction privacy and anonymity
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
