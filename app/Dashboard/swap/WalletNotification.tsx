"use client";

import { toast } from 'sonner';
import { SupportedTransactionVersions } from '@solana/wallet-adapter-base';

export interface IWalletNotification {
  publicKey: string;
  shortAddress: string;
  walletName: string;
  metadata: {
    name: string;
    url: string;
    icon: string;
    supportedTransactionVersions?: SupportedTransactionVersions;
  };
}

export const WalletNotification = {
  onConnect: (props: IWalletNotification) => {
    toast.success(`Wallet ${props.walletName} connected successfully`);
  },
  onConnecting: (props: IWalletNotification) => {
    toast.info(`Connecting wallet ${props.walletName}...`);
  },
  onDisconnect: (props: IWalletNotification) => {
    toast.info(`Wallet ${props.walletName} disconnected`);
  },
  onNotInstalled: (props: IWalletNotification) => {
    toast.error(`Wallet ${props.walletName} is not installed`);
  },
};
