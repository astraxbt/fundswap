"use client";

import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Wallet, ArrowRightLeft, LayoutGrid, Send, ArrowLeft, Loader2 } from "lucide-react";
import Link from "next/link";
import NavBar from "@/components/navBar";
import WalletManagement from "./walletmanagement";
import dynamic from "next/dynamic";
import { useWallet } from '@solana/wallet-adapter-react';
import { PublicKey, Keypair, ComputeBudgetProgram, VersionedTransaction } from '@solana/web3.js';
import { toast } from 'sonner';
import { getAllTradingAddresses, checkPrivateBalance, checkPublicBalance, TRADING_BASE_CHALLENGE } from './utils';
import { keccak_256 } from '@noble/hashes/sha3';
import { createRpc, LightSystemProgram, defaultTestStateTreeAccounts, bn, selectMinCompressedSolAccountsForTransfer } from '@lightprotocol/stateless.js';
import bs58 from 'bs58';
import { getQuote, formatAmount } from './jupiterApi';

const TRADING_WALLET_RESERVE = 4000000; // 0.004 SOL reserve for trading wallet
const RENT_EXEMPT_THRESHOLD = 8900000; // 0.0089 SOL threshold for shielding

const CustomSwapInterface = dynamic(
  () => import("./CustomSwapInterface"),
  { ssr: false }
);

interface Position {
  id: string;
  tradingAddress: string;
  tokenSymbol: string;
  tokenPair: string;
  amount: number;
  value: number;
  pnl: number;
  pnlPercentage: number;
  createdAt: Date;
  lastUpdated: Date;
}

const PositionManagement = () => {
  const { publicKey, signMessage } = useWallet();
  const [positions, setPositions] = useState<Position[]>([]);
  const [tradingAddresses, setTradingAddresses] = useState<Array<{ address: string, index: number, balance: string }>>([]);
  const [loading, setLoading] = useState(false);
  const [balanceManager, setBalanceManager] = useState<any>(null);
  const [selectedAddress, setSelectedAddress] = useState<string>('all');

  useEffect(() => {
    if (publicKey && signMessage) {
      loadTradingAddresses();
      
      const priceRefreshInterval = setInterval(() => {
        if (tradingAddresses.length > 0 && balanceManager) {
          balanceManager.refreshBalances(tradingAddresses);
        }
      }, 30000);
      
      return () => clearInterval(priceRefreshInterval);
    }
  }, [publicKey, signMessage, tradingAddresses.length]);

  const loadTradingAddresses = async () => {
    if (!publicKey || !signMessage) return;
    
    setLoading(true);
    try {
      const addresses = await getAllTradingAddresses(publicKey, signMessage, 5);
      
      const manager = new (await import('./balanceManager')).BalanceManager({
        onBalanceUpdate: (balances: Record<string, any>) => {
          const addressesWithBalances = addresses.map(addr => ({
            address: addr.publicKey.toString(),
            index: addr.index,
            balance: balances[addr.publicKey.toString()]?.total || '0.0000'
          }));
          setTradingAddresses(addressesWithBalances);
          updatePositionsFromBalances(addressesWithBalances, balances);
        }
      });
      
      setBalanceManager(manager);
      
      const formattedAddresses = addresses.map(addr => ({
        address: addr.publicKey.toString(),
        index: addr.index
      }));
      
      await manager.refreshBalances(formattedAddresses);
      
    } catch (error) {
      console.error('Error loading trading addresses:', error);
    } finally {
      setLoading(false);
    }
  };

  const updatePositionsFromBalances = async (addresses: Array<{ address: string, index: number, balance: string }>, balances: Record<string, any>) => {
    const storedPositions = getStoredPositions();
    const activePositions: Position[] = [];

    for (const addr of addresses) {
      const balance = balances[addr.address];
      if (balance && (parseFloat(balance.total) > 0.001 || balance.tokenBalances)) {
        
        if (parseFloat(balance.total) > 0.001) {
          let solPrice = 240;
          try {
            const quote = await getQuote(
              'So11111111111111111111111111111111111111112',
              'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
              '1000000000',
              50
            );
            if (quote) {
              solPrice = parseFloat(formatAmount(quote.outAmount, 6));
            }
          } catch (error) {
            console.error('Error fetching SOL price:', error);
          }

          const solPosition: Position = {
            id: `${addr.address}-SOL`,
            tradingAddress: addr.address,
            tokenSymbol: 'SOL',
            tokenPair: 'SOL/USDC',
            amount: parseFloat(balance.total),
            value: parseFloat(balance.total) * solPrice,
            pnl: 0,
            pnlPercentage: 0,
            createdAt: new Date(),
            lastUpdated: new Date()
          };
          activePositions.push(solPosition);
        }

        if (balance.tokenBalances) {
          for (const [tokenMint, amount] of Object.entries(balance.tokenBalances)) {
            if ((amount as number) > 0.001) {
              let tokenPrice = 1;
              try {
                const quote = await getQuote(
                  tokenMint,
                  'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
                  '1000000',
                  50
                );
                if (quote) {
                  tokenPrice = parseFloat(formatAmount(quote.outAmount, 6));
                }
              } catch (error) {
                console.error(`Error fetching price for ${tokenMint}:`, error);
              }

              const tokenPosition: Position = {
                id: `${addr.address}-${tokenMint}`,
                tradingAddress: addr.address,
                tokenSymbol: getTokenSymbol(tokenMint),
                tokenPair: `${getTokenSymbol(tokenMint)}/USDC`,
                amount: amount as number,
                value: (amount as number) * tokenPrice,
                pnl: 0,
                pnlPercentage: 0,
                createdAt: new Date(),
                lastUpdated: new Date()
              };
              activePositions.push(tokenPosition);
            }
          }
        }
      }
    }

    setPositions(activePositions);
    storePositions(activePositions);
  };

  const getTokenSymbol = (tokenMint: string): string => {
    const tokenMap: Record<string, string> = {
      'So11111111111111111111111111111111111111112': 'SOL',
      'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v': 'USDC',
      'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB': 'USDT',
      '4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R': 'RAY',
      'mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So': 'mSOL',
      'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263': 'BONK',
      'orcaEKTdK7LKz57vaAYr9QeNsVEPfiu6QeMU1kektZE': 'ORCA',
      'kinXdEcpDQeHPEuQnqmUgtYykqKGVFq6CeVX5iAHJq6': 'KIN'
    };
    return tokenMap[tokenMint] || tokenMint.slice(0, 4).toUpperCase();
  };

  const getStoredPositions = (): Position[] => {
    try {
      const stored = localStorage.getItem('lethe-positions');
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  };

  const storePositions = (positions: Position[]) => {
    try {
      localStorage.setItem('lethe-positions', JSON.stringify(positions));
    } catch (error) {
      console.error('Error storing positions:', error);
    }
  };

  const refreshPositions = async () => {
    if (balanceManager && tradingAddresses.length > 0) {
      setLoading(true);
      await balanceManager.refreshBalances(tradingAddresses);
      setLoading(false);
    }
  };

  const formatValue = (value: number): string => {
    return value < 1000 ? `$${value.toFixed(2)}` : `$${(value / 1000).toFixed(1)}k`;
  };

  const formatPnL = (pnl: number, percentage: number): { text: string, color: string } => {
    const isPositive = pnl >= 0;
    return {
      text: `${isPositive ? '+' : ''}${percentage.toFixed(1)}%`,
      color: isPositive ? 'text-green-400' : 'text-red-400'
    };
  };

  const filteredPositions = selectedAddress === 'all' 
    ? positions 
    : positions.filter(position => position.tradingAddress === selectedAddress);

  const getUniqueAddresses = () => {
    const addresses = [...new Set(positions.map(p => p.tradingAddress))];
    return addresses.map(addr => ({
      address: addr,
      label: `${addr.slice(0, 8)}...${addr.slice(-4)}`
    }));
  };

  const handleAddPosition = async (position: Position) => {
    try {
      const swapUrl = `/Dashboard/swap?` + new URLSearchParams({
        inputToken: 'So11111111111111111111111111111111111111112',
        outputToken: position.tokenSymbol === 'SOL' ? 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' : position.id.split('-')[1],
        tradingAddress: position.tradingAddress,
        action: 'add'
      }).toString();
      
      toast.info(`Navigate to swap interface to add to ${position.tokenSymbol} position`, {
        description: `Trading address: ${position.tradingAddress.slice(0, 8)}...`,
        duration: 5000
      });
    } catch (error) {
      console.error('Error adding to position:', error);
      toast.error('Failed to add to position');
    }
  };

  const handleClosePosition = async (position: Position) => {
    try {
      const swapUrl = `/Dashboard/swap?` + new URLSearchParams({
        inputToken: position.tokenSymbol === 'SOL' ? 'So11111111111111111111111111111111111111112' : position.id.split('-')[1],
        outputToken: 'So11111111111111111111111111111111111111112',
        tradingAddress: position.tradingAddress,
        amount: position.amount.toString(),
        action: 'close'
      }).toString();
      
      toast.info(`Navigate to swap interface to close ${position.tokenSymbol} position`, {
        description: `Amount: ${position.amount.toFixed(4)} ${position.tokenSymbol}`,
        duration: 5000
      });
    } catch (error) {
      console.error('Error closing position:', error);
      toast.error('Failed to close position');
    }
  };

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-indigo-300">Position Management</h2>
      <p className="text-white/70">Monitor and manage your trading positions across all trading addresses.</p>
      
      <Card className="bg-zinc-900/40 backdrop-blur-sm border border-zinc-800/50 mt-6">
        <CardContent className="pt-6">
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-medium text-white">Active Positions</h3>
              <div className="flex gap-2">
                <select
                  value={selectedAddress}
                  onChange={(e) => setSelectedAddress(e.target.value)}
                  className="px-3 py-1 text-sm bg-zinc-800 border border-zinc-700 rounded text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                >
                  <option value="all">All Addresses</option>
                  {getUniqueAddresses().map((addr) => (
                    <option key={addr.address} value={addr.address}>
                      {addr.label}
                    </option>
                  ))}
                </select>
                <Button 
                  size="sm" 
                  variant="outline" 
                  onClick={refreshPositions}
                  disabled={loading}
                >
                  {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <LayoutGrid className="h-4 w-4 mr-2" />}
                  {loading ? 'Loading...' : 'Refresh'}
                </Button>
              </div>
            </div>
            
            {!publicKey ? (
              <div className="text-center py-8">
                <Wallet className="h-12 w-12 mx-auto text-white/40 mb-4" />
                <p className="text-white/60">Connect your wallet to view positions</p>
              </div>
            ) : filteredPositions.length === 0 ? (
              <div className="text-center py-8">
                <div className="text-center py-3">
                  <span className="text-sm text-white/60">
                    {loading ? 'Loading positions...' : selectedAddress === 'all' ? 'No active positions found' : 'No positions found for selected address'}
                  </span>
                  {!loading && (
                    <p className="text-xs text-white/40 mt-2">
                      {selectedAddress === 'all' 
                        ? 'Positions will appear here when you have token balances in your trading addresses'
                        : 'Try selecting a different address or "All Addresses" to see more positions'
                      }
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredPositions.map((position) => {
                  const pnlData = formatPnL(position.pnl, position.pnlPercentage);
                  return (
                    <Card key={position.id} className="bg-zinc-800/50 p-4 hover:bg-zinc-800/70 transition-colors">
                      <div className="flex justify-between items-center mb-2">
                        <div className="flex items-center gap-2">
                          <div>
                            <div className="font-medium text-white">{position.tokenPair}</div>
                            <div className="text-xs text-white/60">
                              {position.amount.toFixed(4)} {position.tokenSymbol}
                            </div>
                            <div className="text-xs text-white/40">
                              Address: {position.tradingAddress.slice(0, 8)}...
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-medium text-white">{formatValue(position.value)}</div>
                          <div className={`text-xs ${pnlData.color}`}>
                            {pnlData.text}
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-2 mt-3">
                        <Button 
                          variant="outline" 
                          size="sm" 
                          className="flex-1 hover:bg-purple-500/20 transition-colors"
                          onClick={() => handleAddPosition(position)}
                        >
                          Add
                        </Button>
                        <Button 
                          variant="outline" 
                          size="sm" 
                          className="flex-1 hover:bg-purple-500/20 transition-colors"
                          onClick={() => handleClosePosition(position)}
                        >
                          Close
                        </Button>
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

const SendFunds = () => {
  const { publicKey, signMessage, sendTransaction } = useWallet();
  const [tradingAddresses, setTradingAddresses] = useState<Array<{ address: string, index: number }>>([]);
  const [selectedAddress, setSelectedAddress] = useState<string>('');
  const [recipientAddress, setRecipientAddress] = useState<string>('');
  const [amount, setAmount] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [addressBalances, setAddressBalances] = useState<{[key: string]: {public: string, private: string, total: string}}>({});

  useEffect(() => {
    if (publicKey && !recipientAddress) {
      setRecipientAddress(publicKey.toString());
    }
  }, [publicKey, recipientAddress]);

  useEffect(() => {
    const generateAddresses = async () => {
      if (!publicKey || !signMessage) return;
      
      try {
        const message = new TextEncoder().encode(TRADING_BASE_CHALLENGE);
        await signMessage(message);
        const addresses = await getAllTradingAddresses(publicKey, signMessage, 3);
        const formattedAddresses = addresses.map((addr) => ({
          address: addr.publicKey.toString(),
          index: addr.index
        }));
        setTradingAddresses(formattedAddresses);
        if (formattedAddresses.length > 0) {
          setSelectedAddress(formattedAddresses[0].address);
        }
        await queryBalances(formattedAddresses);
      } catch (err) {
        console.error('Error generating trading addresses:', err);
        setError('Failed to load trading addresses');
      }
    };

    generateAddresses();
  }, [publicKey, signMessage]);

  const queryBalances = async (addresses: Array<{ address: string, index: number }>) => {
    const balances: {[key: string]: {public: string, private: string, total: string}} = {};
    for (const addr of addresses) {
      try {
        const publicBalance = await checkPublicBalance(addr.address);
        const privateBalance = await checkPrivateBalance(addr.address);
        const total = (parseFloat(publicBalance) + parseFloat(privateBalance)).toFixed(4);
        balances[addr.address] = { public: publicBalance, private: privateBalance, total };
      } catch (err) {
        console.error(`Error checking balance for ${addr.address}:`, err);
        balances[addr.address] = { public: "0.0000", private: "0.0000", total: "0.0000" };
      }
    }
    setAddressBalances(balances);
  };

  const handleSend = async () => {
    if (!publicKey || !signMessage || !selectedAddress || !recipientAddress || !amount) {
      setError('Please fill in all required fields');
      return;
    }

    const transferAmount = parseFloat(amount);
    if (transferAmount <= 0) {
      setError('Please enter a valid amount');
      return;
    }

    setLoading(true);
    setError('');
    setStatus('Initializing private transfer...');

    try {
      const selectedAddressInfo = tradingAddresses.find(addr => addr.address === selectedAddress);
      if (!selectedAddressInfo) {
        throw new Error('Selected trading address not found');
      }

      const message = new TextEncoder().encode(TRADING_BASE_CHALLENGE);
      const signature = await signMessage(message);
      const indexBytes = new Uint8Array(4);
      new DataView(indexBytes.buffer).setUint32(0, selectedAddressInfo.index, false);
      const combinedEntropy = new Uint8Array([...signature.slice(0, 32), ...indexBytes]);
      const seedMaterial = keccak_256(combinedEntropy);
      const tradingKeypair = Keypair.fromSeed(new Uint8Array(seedMaterial));

      const connection = await createRpc(process.env.NEXT_PUBLIC_RPC_URL || "https://api.mainnet-beta.solana.com");
      const transferLamports = transferAmount * 1e9;

      const publicBalance = parseFloat(addressBalances[selectedAddress]?.public || '0');
      const privateBalance = parseFloat(addressBalances[selectedAddress]?.private || '0');
      const publicLamports = publicBalance * 1e9;
      const privateLamports = privateBalance * 1e9;

      if (publicBalance + privateBalance < transferAmount) {
        throw new Error(`Insufficient balance. Available: ${(publicBalance + privateBalance).toFixed(4)} SOL`);
      }

      if (publicLamports > RENT_EXEMPT_THRESHOLD && privateLamports < transferLamports) {
        setStatus('Shielding public funds...');
        const shieldAmount = publicLamports - TRADING_WALLET_RESERVE;
        
        const shieldInstruction = await LightSystemProgram.compress({
          payer: tradingKeypair.publicKey,
          toAddress: tradingKeypair.publicKey,
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
            userPublicKey: tradingKeypair.publicKey.toString()
          }),
        });

        if (!shieldResponse.ok) {
          const errorData = await shieldResponse.json();
          throw new Error(`Shield failed: ${errorData.error || 'Unknown error'}`);
        }

        const { transaction: signedTx } = await shieldResponse.json();
        const transaction = VersionedTransaction.deserialize(bs58.decode(signedTx));
        transaction.sign([tradingKeypair]);
        
        const txSignature = await connection.sendTransaction(transaction, { skipPreflight: true });
        await connection.confirmTransaction(txSignature);
        
        setStatus('Waiting for shield confirmation...');
        await new Promise(resolve => setTimeout(resolve, 3000));
      }

      setStatus('Preparing private transfer...');
      const compressedAccounts = await connection.getCompressedAccountsByOwner(tradingKeypair.publicKey);
      
      if (!compressedAccounts?.items?.length) {
        throw new Error('No compressed accounts found for private transfer');
      }

      const totalCompressedBalance = compressedAccounts.items.reduce((sum, acc) => sum + Number(acc.lamports || 0), 0);
      
      const actualTransferAmount = Math.min(transferLamports, totalCompressedBalance - 10000);
      
      if (actualTransferAmount <= 0) {
        throw new Error(`Insufficient compressed balance for transfer. Available: ${totalCompressedBalance}, minimum required: 10000`);
      }

      if (actualTransferAmount < transferLamports) {
        setStatus(`Adjusting transfer amount to ${(actualTransferAmount / 1e9).toFixed(4)} SOL based on available balance`);
      }

      const [selectedAccounts, _] = selectMinCompressedSolAccountsForTransfer(
        compressedAccounts.items,
        actualTransferAmount
      );

      if (!selectedAccounts.length) {
        throw new Error('No suitable compressed accounts found for transfer');
      }

      const { compressedProof, rootIndices } = await connection.getValidityProof(
        selectedAccounts.map(account => {
          const hashBuffer = Buffer.from(account.hash);
          return bn(hashBuffer, 'be');
        })
      );

      const transferInstruction = await LightSystemProgram.transfer({
        payer: tradingKeypair.publicKey,
        toAddress: new PublicKey(recipientAddress),
        lamports: actualTransferAmount,
        inputCompressedAccounts: selectedAccounts,
        outputStateTrees: [defaultTestStateTreeAccounts().merkleTree],
        recentValidityProof: compressedProof,
        recentInputStateRootIndices: rootIndices,
      });

      const transferInstructions = [
        ComputeBudgetProgram.setComputeUnitLimit({ units: 1_000_000 }),
        transferInstruction,
      ];

      const { blockhash: transferBlockhash } = await connection.getLatestBlockhash();
      
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
          blockhash: transferBlockhash,
          userPublicKey: tradingKeypair.publicKey.toString()
        }),
      });

      if (!transferResponse.ok) {
        const errorData = await transferResponse.json();
        throw new Error(`Transfer failed: ${errorData.error || 'Unknown error'}`);
      }

      const { transaction: signedTransferTx } = await transferResponse.json();
      const transferTransaction = VersionedTransaction.deserialize(bs58.decode(signedTransferTx));
      transferTransaction.sign([tradingKeypair]);
      
      setStatus('Sending private transfer...');
      const transferSig = await connection.sendTransaction(transferTransaction, { skipPreflight: true });
      await connection.confirmTransaction(transferSig);

      toast.success('Private transfer completed successfully!');
      setAmount('');
      await queryBalances(tradingAddresses);
      
    } catch (err: any) {
      console.error('Transfer error:', err);
      setError(err.message || 'Failed to complete transfer');
      toast.error('Transfer failed: ' + (err.message || 'Unknown error'));
    } finally {
      setLoading(false);
      setStatus('');
    }
  };

  const handleMaxClick = () => {
    if (selectedAddress && addressBalances[selectedAddress]) {
      const maxAmount = parseFloat(addressBalances[selectedAddress].total);
      setAmount(Math.max(0, maxAmount - 0.001).toFixed(4));
    }
  };

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-indigo-300">Private Transfer</h2>
      <p className="text-white/70">Send SOL privately from trading addresses back to your main wallet.</p>
      
      <Card className="bg-zinc-900/40 backdrop-blur-sm border border-zinc-800/50 mt-6">
        <CardContent className="pt-6">
          <div className="space-y-6">
            {status && (
              <div className="p-3 bg-blue-900/20 border border-blue-800/30 rounded-lg text-sm text-blue-300">
                {status}
              </div>
            )}
            
            {error && (
              <div className="p-3 bg-red-900/20 border border-red-800/30 rounded-lg text-sm text-red-300">
                {error}
              </div>
            )}

            <div>
              <label className="block text-sm text-white/60 mb-2">
                From Trading Address
              </label>
              <div className="relative">
                <select 
                  value={selectedAddress}
                  onChange={(e) => setSelectedAddress(e.target.value)}
                  className="w-full rounded-md border border-zinc-800/50 bg-zinc-800/30 p-3 text-sm appearance-none text-white"
                  disabled={loading}
                >
                  <option value="">Select trading address</option>
                  {tradingAddresses.map((addr, index) => (
                    <option key={addr.address} value={addr.address}>
                      Trading Address {index + 1} ({addressBalances[addr.address]?.total || '0.0000'} SOL)
                    </option>
                  ))}
                </select>
                <div className="absolute right-3 top-1/2 transform -translate-y-1/2 pointer-events-none">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>
                </div>
              </div>
            </div>
            
            <div>
              <label className="block text-sm text-white/60 mb-2">
                To Address
              </label>
              <input 
                type="text" 
                value={recipientAddress}
                onChange={(e) => setRecipientAddress(e.target.value)}
                placeholder="Recipient wallet address" 
                className="w-full rounded-md border border-zinc-800/50 bg-zinc-800/30 p-3 text-sm focus:border-purple-500/50 focus:ring-purple-500/50 text-white"
                disabled={loading}
              />
            </div>
            
            <div>
              <label className="block text-sm text-white/60 mb-2">
                Amount (SOL only)
              </label>
              <div className="relative">
                <input 
                  type="text" 
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.0" 
                  className="w-full rounded-md border border-zinc-800/50 bg-zinc-800/30 p-3 text-sm focus:border-purple-500/50 focus:ring-purple-500/50 text-white"
                  disabled={loading}
                />
                <button 
                  onClick={handleMaxClick}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-xs text-purple-400 hover:text-purple-300 transition-colors"
                  disabled={loading || !selectedAddress}
                >
                  MAX
                </button>
              </div>
              <div className="flex justify-between mt-1">
                <span className="text-xs text-white/60">Fee: ~0.001 SOL</span>
                <span className="text-xs text-white/60">
                  Balance: {selectedAddress ? (addressBalances[selectedAddress]?.total || '0.0000') : '0.0000'} SOL
                </span>
              </div>
            </div>
            
            <Button 
              onClick={handleSend}
              disabled={loading || !selectedAddress || !recipientAddress || !amount || parseFloat(amount) <= 0}
              className="w-full bg-gradient-to-r from-purple-500 to-indigo-400 hover:from-purple-600 hover:to-indigo-500 shadow-[0_4px_14px_0_rgb(156,103,255,0.39)]" 
              size="lg"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {status || 'Processing...'}
                </>
              ) : (
                'Send Privately'
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default function SwapPage() {
  const [activeTab, setActiveTab] = useState("swap");

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0a0a0e] to-[#16151E] text-white">
      <NavBar />
      <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-7 pb-16 mt-16">
        <div className="mb-10">
          <div className="flex items-center justify-center mb-2">
            <h1 className="text-3xl font-bold">
              <span className="bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-indigo-300">Private Swap</span>
            </h1>
          </div>
          <div className="text-center">
            <p className="text-white/70">
              Trade tokens privately without revealing your activity
            </p>
          </div>
        </div>

        <div className="flex justify-center mb-4">
          <div className="inline-flex items-center justify-center rounded-lg border border-zinc-700 bg-zinc-900/50 backdrop-blur-sm p-1.5 gap-1.5 shadow-[0_4px_14px_0_rgba(0,0,0,0.25)]">
            <Button
              variant={activeTab === "wallet" ? "default" : "ghost"}
              className={`gap-2 ${activeTab === "wallet" ? "bg-purple-500/10 text-white" : "opacity-70 hover:bg-green-500/20 hover:text-white"} transition-all`}
              onClick={() => setActiveTab("wallet")}
            >
              <Wallet className="h-4 w-4" />
              <span className="hidden sm:inline">Wallet</span>
            </Button>
            <Button
              variant={activeTab === "swap" ? "default" : "ghost"}
              className={`gap-2 ${activeTab === "swap" ? "bg-purple-500/10 text-white" : "opacity-70 hover:bg-green-500/20 hover:text-white"} transition-all`}
              onClick={() => setActiveTab("swap")}
            >
              <ArrowRightLeft className="h-4 w-4" />
              <span className="hidden sm:inline">Swap</span>
            </Button>
            <Button
              variant={activeTab === "positions" ? "default" : "ghost"}
              className={`gap-2 ${activeTab === "positions" ? "bg-purple-500/10 text-white" : "opacity-70 hover:bg-green-500/20 hover:text-white"} transition-all`}
              onClick={() => setActiveTab("positions")}
            >
              <LayoutGrid className="h-4 w-4" />
              <span className="hidden sm:inline">Positions</span>
            </Button>
            <Button
              variant={activeTab === "send" ? "default" : "ghost"}
              className={`gap-2 ${activeTab === "send" ? "bg-purple-500/10 text-white" : "opacity-70 hover:bg-green-500/20 hover:text-white"} transition-all`}
              onClick={() => setActiveTab("send")}
            >
              <Send className="h-4 w-4" />
              <span className="hidden sm:inline">Send</span>
            </Button>
          </div>
        </div>

        <div className="max-w-xl mx-auto bg-zinc-900/30 backdrop-blur-md border border-zinc-800/50 rounded-xl p-6 shadow-[0_8px_30px_rgb(0,0,0,0.12)]">
          {activeTab === "wallet" && <WalletManagement />}
          {activeTab === "swap" && <CustomSwapInterface />}
          {activeTab === "positions" && <PositionManagement />}
          {activeTab === "send" && <SendFunds />}
        </div>
      </div>
    </div>
  );
}
