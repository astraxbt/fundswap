'use client';
import React, { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Zap, RotateCcw, Clock, DollarSign, Shield, ArrowRight, Copy, ExternalLink, Wallet } from "lucide-react";
import Link from "next/link";
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { Connection, LAMPORTS_PER_SOL } from '@solana/web3.js';

const privacyModes = [
  {
    id: "fast-track",
    name: "Private",
    description: "Private Relay Transfer",
    icon: Zap,
    time: "~20s",
    fee: "1%",
    privacy: "Secure",
    iconColor: "text-yellow-400",
    borderColor: "border-yellow-500/30",
    selectedBg: "bg-yellow-500/5"
  },
  {
    id: "balanced",
    name: "Anonymous",
    description: "Cross-chain privacy routing",
    icon: RotateCcw,
    time: "~1 min",
    fee: "Free",
    privacy: "Enhanced",
    iconColor: "text-blue-400",
    borderColor: "border-blue-500/30",
    selectedBg: "bg-blue-500/5"
  }
];

const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || 'https://api.mainnet-beta.solana.com';

export function LetheHero() {
  const { publicKey, connected } = useWallet();
  const { setVisible: setWalletModalVisible } = useWalletModal();
  const [selectedMode, setSelectedMode] = useState("fast-track");
  const [amount, setAmount] = useState("1.0");
  const [destination, setDestination] = useState("");
  const [copied, setCopied] = useState(false);
  const [solBalance, setSolBalance] = useState<number | null>(null);
  const [loadingBalance, setLoadingBalance] = useState(false);

  const contractAddress = "HEZ6KcNNUKaWvUCBEe4BtfoeDHEHPkCHY9JaDNqrpump";

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(contractAddress);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy: ', err);
    }
  };

  const fetchBalance = useCallback(async () => {
    if (!publicKey) return;
    setLoadingBalance(true);
    try {
      const connection = new Connection(RPC_URL);
      const balance = await connection.getBalance(publicKey);
      setSolBalance(balance / LAMPORTS_PER_SOL);
    } catch (err) {
      console.error('Error fetching balance:', err);
      setSolBalance(null);
    } finally {
      setLoadingBalance(false);
    }
  }, [publicKey]);

  useEffect(() => {
    if (connected && publicKey) {
      fetchBalance();
    } else {
      setSolBalance(null);
    }
  }, [connected, publicKey, fetchBalance]);

  const selectedPrivacy = privacyModes.find(m => m.id === selectedMode);

  return (
    <div className="relative min-h-screen flex items-center px-6 py-20">
      <div className="absolute top-1/4 right-1/4 w-96 h-96 bg-gradient-glow opacity-30 blur-3xl" />
      <div className="absolute bottom-1/4 left-1/4 w-64 h-64 bg-gradient-glow opacity-20 blur-3xl" />
      
      <div className="max-w-7xl mx-auto flex flex-col md:grid md:grid-cols-2 gap-6 md:gap-8 lg:gap-12 items-center">
        {/* Left side: headline + value props */}
        <div className="space-y-4 md:space-y-6 lg:space-y-8 order-2 md:order-1">
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span className="w-2 h-2 bg-primary rounded-full animate-pulse" />
              Live on Solana Mainnet
            </div>
            
            <h1 className="text-2xl sm:text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight">
              <span className="bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-indigo-300">
                Fund Wallets
              </span>
              <br />
              <span className="text-white">Anonymously</span>
            </h1>
            
            <p className="text-sm sm:text-lg md:text-xl text-muted-foreground max-w-md">
              Protect your trading activity from copytraders. Fund destination wallets with no on-chain link to your source.
            </p>
          </div>

          <div className="bg-surface-card border border-border rounded-lg p-2 md:p-3 font-mono text-xs md:text-sm">
            <div className="flex items-center justify-between gap-2">
              <div className="text-muted-foreground text-xs min-w-0">
                Contract: 
                <button 
                  onClick={copyToClipboard}
                  className="text-primary hover:text-primary/80 transition-colors cursor-pointer inline-flex items-center gap-1 bg-transparent border-none px-1 py-0.5 font-mono text-xs rounded hover:bg-primary/10 ml-1"
                  title="Click to copy contract address"
                >
                  <span className="select-none break-all">{contractAddress}</span>
                  <Copy className="h-3 w-3 flex-shrink-0" />
                </button>
                {copied && <span className="text-green-400 text-[10px] ml-1">Copied!</span>}
              </div>
              <a
                href="https://dexscreener.com/solana/amme84klt1yzpz8akyjjtwd26hesaj5fblg6tew2rxcx"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-primary bg-zinc-800/60 hover:bg-zinc-800 px-2 py-1 rounded-md transition-colors whitespace-nowrap flex-shrink-0"
              >
                Chart
                <ExternalLink className="h-2.5 w-2.5" />
              </a>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <Button 
              size="lg" 
              className="bg-primary hover:bg-primary/90 text-primary-foreground shadow-glow transition-all duration-300 hover:shadow-glow/70"
              asChild
            >
              <Link href="/Dashboard">
                Launch App
              </Link>
            </Button>
            <Button 
              variant="outline" 
              size="lg"
              className="bg-black border-primary/50 text-primary hover:bg-black/80 transition-all duration-300"
              asChild
            >
              <Link href="/Dashboard/swap">
                Private Swap
              </Link>
            </Button>
          </div>
        </div>

        {/* Right side: Mini Fund widget */}
        <div className="relative order-1 md:order-2 w-full max-w-sm mx-auto">
          <div className="bg-zinc-900/80 backdrop-blur-xl border border-zinc-700/50 rounded-2xl p-5 shadow-[0_8px_40px_rgba(0,0,0,0.4)]">
            {/* Widget header */}
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-white">Quick Fund</h3>
              <span className="text-xs text-white/40 bg-zinc-800/60 px-2 py-0.5 rounded-full">Solana</span>
            </div>

            {/* Privacy mode toggle */}
            <div className="space-y-2 mb-4">
              {privacyModes.map((mode) => {
                const Icon = mode.icon;
                const isSelected = selectedMode === mode.id;
                return (
                  <button
                    key={mode.id}
                    onClick={() => setSelectedMode(mode.id)}
                    className={`w-full p-2.5 rounded-lg border transition-all duration-200 text-left ${
                      isSelected
                        ? `${mode.borderColor} ${mode.selectedBg} border-opacity-100`
                        : "border-zinc-700/40 bg-zinc-800/30 hover:border-zinc-600/50"
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <div className={`p-1.5 rounded-md bg-zinc-800/80 ${mode.iconColor}`}>
                        <Icon className="h-3.5 w-3.5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium text-white">{mode.name}</span>
                          <div className="flex items-center gap-2 text-[10px] text-white/50">
                            <span className="flex items-center gap-0.5"><Clock className="h-2.5 w-2.5" />{mode.time}</span>
                            <span className="flex items-center gap-0.5"><DollarSign className="h-2.5 w-2.5" />{mode.fee}</span>
                          </div>
                        </div>
                        <p className="text-[11px] text-white/50 mt-0.5">{mode.description}</p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Amount input */}
            <div className="mb-3">
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs text-white/50">Amount (SOL)</label>
                {connected && (
                  <span className="text-[11px] text-white/40">
                    {loadingBalance ? 'Loading...' : solBalance !== null ? `${solBalance.toFixed(4)} SOL` : ''}
                  </span>
                )}
              </div>
              <input
                type="text"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full px-3 py-2 bg-zinc-800/60 border border-zinc-700/40 rounded-lg text-white placeholder-white/30 focus:outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/30 text-sm"
                placeholder="0.0"
              />
            </div>

            {/* Destination input */}
            <div className="mb-4">
              <label className="block text-xs text-white/50 mb-1.5">Destination Wallet</label>
              <input
                type="text"
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
                className="w-full px-3 py-2 bg-zinc-800/60 border border-zinc-700/40 rounded-lg text-white placeholder-white/30 focus:outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/30 text-sm"
                placeholder="Enter Solana address..."
              />
            </div>

            {/* Summary row */}
            {selectedPrivacy && (
              <div className="flex items-center justify-between text-[11px] text-white/40 mb-4 px-1">
                <span className="flex items-center gap-1">
                  <Shield className="h-3 w-3" />
                  {selectedPrivacy.privacy} privacy
                </span>
                <span>{selectedPrivacy.time} estimated</span>
              </div>
            )}

            {/* CTA button — connects wallet or links to full Fund page */}
            {!connected ? (
              <Button
                className="w-full bg-gradient-to-r from-purple-500 to-indigo-400 hover:from-purple-600 hover:to-indigo-500 text-white font-semibold shadow-[0_4px_14px_0_rgb(156,103,255,0.39)]"
                size="lg"
                onClick={() => setWalletModalVisible(true)}
              >
                <Wallet className="mr-2 h-4 w-4" />
                Connect Wallet
              </Button>
            ) : (
              <Button
                className="w-full bg-gradient-to-r from-purple-500 to-indigo-400 hover:from-purple-600 hover:to-indigo-500 text-white font-semibold shadow-[0_4px_14px_0_rgb(156,103,255,0.39)]"
                size="lg"
                asChild
              >
                <Link href="/Dashboard/Fund">
                  Fund Now
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            )}

            {/* Trust line */}
            <p className="text-center text-[10px] text-white/30 mt-3">
              No on-chain link between source and destination
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
