'use client';

import { WalletAdapterNetwork } from '@solana/wallet-adapter-base';
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import {
    AlphaWalletAdapter,
    AvanaWalletAdapter,
    BitpieWalletAdapter,
    CloverWalletAdapter,
    Coin98WalletAdapter,
    CoinbaseWalletAdapter,
    CoinhubWalletAdapter,
    FractalWalletAdapter,
    HuobiWalletAdapter,
    HyperPayWalletAdapter,
    KeystoneWalletAdapter,
    KrystalWalletAdapter,
    LedgerWalletAdapter,
    MathWalletAdapter,
    NekoWalletAdapter,
    NightlyWalletAdapter,
    NufiWalletAdapter,
    OntoWalletAdapter,
    ParticleAdapter,
    PhantomWalletAdapter,
    SafePalWalletAdapter,
    SaifuWalletAdapter,
    SalmonWalletAdapter,
    SkyWalletAdapter,
    SolflareWalletAdapter,
    SolongWalletAdapter,
    SpotWalletAdapter,
    TokenaryWalletAdapter,
    TokenPocketWalletAdapter,
    TorusWalletAdapter,
    TrustWalletAdapter,
    WalletConnectWalletAdapter,
    XDEFIWalletAdapter,
  } from "@solana/wallet-adapter-wallets";
import { clusterApiUrl } from '@solana/web3.js';
import { useMemo } from 'react';

import '@solana/wallet-adapter-react-ui/styles.css';

export default function WalletContextProvider({ children }: { children: React.ReactNode }) {
  // You can switch to 'devnet' if needed
  const network = WalletAdapterNetwork.Mainnet;
  const endpoint = useMemo(() => clusterApiUrl(network), [network]);

  const wallets = [
    new AlphaWalletAdapter(),
    new AvanaWalletAdapter(),
    new BitpieWalletAdapter(),
    new CloverWalletAdapter(),
    new Coin98WalletAdapter(),
    new CoinbaseWalletAdapter(),
    new CoinhubWalletAdapter(),
    new FractalWalletAdapter(),
    new HuobiWalletAdapter(),
    new HyperPayWalletAdapter(),
    new KeystoneWalletAdapter(),
    new KrystalWalletAdapter(),
    new LedgerWalletAdapter(),
    new MathWalletAdapter(),
    new NekoWalletAdapter(),
    new NightlyWalletAdapter(),
    new NufiWalletAdapter(),
    new OntoWalletAdapter(),
    new ParticleAdapter(),
    new PhantomWalletAdapter(),
    new SafePalWalletAdapter(),
    new SaifuWalletAdapter(),
    new SalmonWalletAdapter(),
    new SkyWalletAdapter(),
    new SolflareWalletAdapter(),
    new SolongWalletAdapter(),
    new SpotWalletAdapter(),
    new TokenaryWalletAdapter(),
    new TokenPocketWalletAdapter(),
    new TorusWalletAdapter(),
    new TrustWalletAdapter(),
    new WalletConnectWalletAdapter({ network, options: [] }),
    new XDEFIWalletAdapter(),
  ];

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          {children}
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}