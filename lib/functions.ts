import { toast } from 'sonner'

export const shortenWalletAddress = (walletAddress: string, len = 5) => {
  return walletAddress.slice(0, len) + "...." + walletAddress.slice(-len);
};

export const copyToClipboard = (text: string) => {
  navigator.clipboard.writeText(text);
  toast.success('Copied to clipboard');
};
