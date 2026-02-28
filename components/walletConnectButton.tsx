'use client';

import { useWallet } from '@solana/wallet-adapter-react';
import { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { QRCodeSVG } from 'qrcode.react';
import * as Dropdown from '@/components/ui/dropdown';
import * as Drawer from '@/components/ui/drawer';
import { RiWalletLine, RiQrCodeLine, RiCloseLine, RiLogoutCircleLine, RiExternalLinkLine } from '@remixicon/react';
import DisconnectButton from '@/components/disconnectButton';
import PowerButton from '@/components/powerButton';
import { Connection, clusterApiUrl, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { toast } from 'sonner';
import { TextMorph } from '@/components/ui/text-morph';

const RPC_URL = 'https://mainnet.helius-rpc.com/?api-key=89acb127-21f1-48fd-a752-77abb2a7fd78';

const WalletConnectButton = () => {
  const { wallet, connect, connected, disconnect, select, publicKey } = useWallet();
  
  const shortenWalletAddress = (address: string) => {
    if (!address) return '';
    return `${address.slice(0, 4)}...${address.slice(-4)}`;
  };

  const [showQR, setShowQR] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [balance, setBalance] = useState<number | null>(null);
  const [usdBalance, setUsdBalance] = useState<number | null>(null);
  const [isHovered, setIsHovered] = useState(false);
  const [text, setText] = useState(shortenWalletAddress(publicKey?.toString() ?? ''));
  const [isCopied, setIsCopied] = useState(false);
  const [isHovered2, setIsHovered2] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setIsCopied(true);
      toast.success('Copied to clipboard');
      // Reset after 2 seconds
      setTimeout(() => {
        setIsCopied(false);
        setIsHovered(false);
      }, 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  };

  const generatePhantomDeepLink = () => {
    const encodedUrl = encodeURIComponent(window.location.href);
    const phantomUrl = `https://phantom.app/ul/v1/connect?app_url=${encodedUrl}&dapp_encryption_public_key=${encodedUrl}`;
    return phantomUrl;
  };

  const handlePhantomConnect = async () => {
    try {
      if (!wallet) {
        const phantomWallet = window?.phantom?.solana;
        if (phantomWallet?.isPhantom) {
          await select('Phantom');
          await new Promise(resolve => setTimeout(resolve, 500));
        } else {
          console.error('Phantom wallet not found!');
          return;
        }
      }
      
      if (wallet && !connected) {
        await connect();
      }
    } catch (error) {
      if (error instanceof Error) {
        console.error('Connection error:', error.message);
      } else {
        console.error('Unknown connection error:', error);
      }
    }
  };

  useEffect(() => {
    const getBalance = async () => {
      if (publicKey) {
        try {
          const connection = new Connection(RPC_URL);
          const balance = await connection.getBalance(publicKey);
          setBalance(balance / LAMPORTS_PER_SOL);
        } catch (error) {
          console.error('Error fetching balance:', error);
          setBalance(null);
        }
      }
    };
  
    getBalance();
  }, [publicKey]);

  const getUSDValue = async (solBalance: number) => {
    try {
      // Convert SOL to lamports
      const amountInLamports = Math.floor(solBalance * LAMPORTS_PER_SOL); // Ensure whole number
      
      // SOL and USDC mint addresses
      const SOL_MINT = 'So11111111111111111111111111111111111111112';
      const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
      
      const response = await fetch(
        `https://quote-api.jup.ag/v6/quote?inputMint=${SOL_MINT}&outputMint=${USDC_MINT}&amount=${amountInLamports}&slippageBps=50`
      );
  
      if (!response.ok) {
        console.error('Jupiter API Error:', response.status, response.statusText);
        return null;
      }
  
      const data = await response.json();
      
      if (!data.outAmount) {
        console.error('Invalid response from Jupiter:', data);
        return null;
      }
  
      // Jupiter returns the USDC amount with 6 decimals
      const usdValue = parseFloat(data.outAmount) / 10**6;
      return usdValue;
    } catch (error) {
      console.error('Error getting USD value from Jupiter:', error);
      return null;
    }
  };

  useEffect(() => {
    const getBalanceAndValue = async () => {
      if (publicKey) {
        try {
          // Get SOL balance using Helius RPC
          const connection = new Connection(RPC_URL);
          const balance = await connection.getBalance(publicKey);
          const solBalance = balance / LAMPORTS_PER_SOL;
          setBalance(solBalance);
  
          // Get USD value from Jupiter
          if (solBalance > 0) {
            const usdValue = await getUSDValue(solBalance);
            setUsdBalance(usdValue);
          } else {
            setUsdBalance(0);
          }
        } catch (error) {
          console.error('Error fetching balance:', error);
          setBalance(null);
          setUsdBalance(null);
        }
      }
    };
  
    getBalanceAndValue();
    
    // Refresh every 30 seconds
    const interval = setInterval(getBalanceAndValue, 30000);
    
    return () => clearInterval(interval);
  }, [publicKey]);

  const handleDisconnect = () => {
    disconnect();
    setIsDrawerOpen(false);
  };

  if (!mounted) return null;

  return (
    <>
      {!connected ? (
        <Dropdown.Root>
          <Dropdown.Trigger asChild>
            <Button className="relative bg-slate-900 rounded-full px-4 hover:bg-slate-800 hover:text-white active:bg-slate-700 active:ring-0 active:ring-offset-0 active:ring-offset-transparent focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:ring-offset-transparent transition-all ease-in-out duration-300" style={{backgroundColor: '#1a0d2e'}}>
              <div className="flex items-center justify-center text-inherit">
                <p className="text-sm font-geist font-medium text-white">
                  connect
                </p>
              </div>
            </Button>
          </Dropdown.Trigger>
          <Dropdown.Content className="w-[400px]">
            <div className="bg-zinc-950 flex items-start justify-between p-2 pl-3">
              <div className="text-amber-50 font-semibold">connect a wallet</div>
            </div>
            <Dropdown.Group className="flex flex-col items-center justify-center mb-3">
              <Dropdown.Item onSelect={handlePhantomConnect}>
                <div className="inline-flex items-center space-x-3 p-5 w-full text-white rounded-2xl bg-primary/80 hover:bg-primary justify-start transition-all duration-300 ease-in-out">
                  <div className="h-12 w-12 bg-zinc-950 rounded-xl p-1.5">
                    <img src="/password.svg" alt="phantom" className="w-full h-full" />
                  </div>
                  <div className='text-sm font-medium text-blue-950'>
                    <p className='text-base font-semibold text-zinc-950'>Connect with Phantom</p>
                    <p className='text-xs font-medium text-blue-950'>Click to connect</p>
                  </div>
                </div>
              </Dropdown.Item>
            </Dropdown.Group>
            <div className="p-3 text-sm font-medium text-gray">
              By connecting a wallet, you agree to the Lethe Terms of Service and Privacy Policy. 
              Additionally, you confirm that all funds being deposited and withdrawn are obtained legitimately. 
            </div>
          </Dropdown.Content>
        </Dropdown.Root>
      ) : (
        <Drawer.Root open={isDrawerOpen} onOpenChange={setIsDrawerOpen}>
          <Drawer.Trigger asChild>
            <Button 
              className="relative bg-slate-900 rounded-full px-4 hover:bg-slate-800 hover:text-white active:bg-slate-700 transition-all ease-in-out duration-300"
              style={{backgroundColor: '#1a0d2e'}}
            >
              <div className="flex items-center justify-center space-x-3 text-inherit">
                <RiWalletLine className="size-5 text-white" />
                <div 
                onMouseEnter={() => setIsHovered2(true)}
                onMouseLeave={() => setIsHovered2(false)}
                className="text-sm font-geist text-white">
                  <TextMorph>
                    {isHovered2 ? 'open wallet' : publicKey ? shortenWalletAddress(publicKey.toString()) : 'Connect'}
                  </TextMorph>
                </div>
              </div>
            </Button>
          </Drawer.Trigger>

          <Drawer.Content>
            <Drawer.Header>
              <Drawer.Title className="text-black">
              <div 
              onClick={() => copyToClipboard(publicKey?.toString() ?? '')}
              onMouseEnter={() => setIsHovered(true)}
              onMouseLeave={() => !isCopied && setIsHovered(false)}
              className="flex w-fit items-center hover:cursor-pointer justify-between bg-white/5 hover:bg-white/15 transition-all duration-300 ease-in-out p-3 rounded-full px-3">
              <div className="text-sm font-semibold text-white/85 hover:text-white/95 transition-all duration-300 ease-in-out break-all">
              <TextMorph>
                {isCopied 
                  ? 'copied' 
                  : isHovered 
                    ? 'copy address' 
                    : shortenWalletAddress(publicKey?.toString() ?? '')
                }
              </TextMorph>
              </div>
            </div>
              </Drawer.Title>
              <PowerButton handleDisconnect={handleDisconnect} />
            </Drawer.Header>
            
            <Drawer.Body>
              <div className="px-4 space-y-3 py-2 bg-white/0 rounded-2xl">

                <div className="space-y-2 p-3 bg-white/0 rounded-2xl">
                  <div className="flex items-center justify-between">
                    <div className="text-white/85 text-3xl font-semibold">
                      ${usdBalance !== null ? usdBalance.toFixed(2) : '0.00'}
                    </div>
                  </div>
                </div>


              </div>
            </Drawer.Body>
            <Drawer.Close>
              <div className="h-10 px-4 py-2 absolute right-4 bottom-4 rounded-full bg-white/5 hover:bg-white/15 transition-all duration-300 ease-in-out flex items-center justify-center text-white/85">close</div>
            </Drawer.Close>
          </Drawer.Content>
        </Drawer.Root>
      )}

      {/* QR Code Modal */}
      {showQR && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-bg-white-0 p-6 rounded-2xl shadow-regular-md">
            <div className="flex justify-between items-center mb-4">
              <div className="text-label-sm text-text-strong-950">Scan with Phantom App</div>
              <Button 
                onClick={() => setShowQR(false)}
                className="p-1 hover:bg-bg-weak-50 rounded-lg transition-colors"
              >
                <RiCloseLine className="size-5 text-text-sub-600" />
              </Button>
            </div>
            <QRCodeSVG value={generatePhantomDeepLink()} size={256} />
            <p className="mt-4 text-paragraph-sm text-text-sub-600 text-center">
              Scan this QR code with your phone's camera
            </p>
          </div>
        </div>
      )}
    </>
  );
};

export default WalletConnectButton;
