import { checkPrivateBalance, checkPublicBalance } from './utils';
import { Connection, PublicKey } from '@solana/web3.js';

export interface AddressBalance {
  public: string;
  private: string;
  total: string;
  solBalance: string; // SOL-only balance for dropdown display
  tokenBalances?: Record<string, number>;
}

export interface BalanceManagerProps {
  onBalanceUpdate: (balances: Record<string, AddressBalance>) => void;
  connection?: Connection;
}

export class BalanceManager {
  private onBalanceUpdate: (balances: Record<string, AddressBalance>) => void;
  private isRefreshing: boolean = false;
  private pendingRefresh: boolean = false;
  private connection: Connection;

  constructor(props: BalanceManagerProps) {
    this.onBalanceUpdate = props.onBalanceUpdate;
    this.connection = props.connection || new Connection(
      process.env.NEXT_PUBLIC_RPC_URL || "https://geralda-226chf-fast-mainnet.helius-rpc.com",
      'confirmed'
    );
  }

  /**
   * Check SPL token balance for a specific address and token
   */
  private async checkTokenBalance(walletAddress: string, tokenMint: string): Promise<string> {
    try {
      const walletPublicKey = new PublicKey(walletAddress);
      const tokenMintPublicKey = new PublicKey(tokenMint);
      
      const tokenAccounts = await this.connection.getParsedTokenAccountsByOwner(
        walletPublicKey,
        { mint: tokenMintPublicKey }
      );
      
      if (tokenAccounts.value.length === 0) {
        return '0.0000';
      }
      
      const account = tokenAccounts.value.reduce((prev, curr) => {
        const prevAmount = (prev.account.data as any).parsed.info.tokenAmount.uiAmount || 0;
        const currAmount = (curr.account.data as any).parsed.info.tokenAmount.uiAmount || 0;
        return prevAmount > currAmount ? prev : curr;
      });
      
      const balance = (account.account.data as any).parsed.info.tokenAmount.uiAmount || 0;
      return balance.toFixed(4);
    } catch (error) {
      console.error('Error checking token balance:', error);
      return '0.0000';
    }
  }

  private addressBalances: Record<string, AddressBalance> = {};

  /**
   * Refresh balances for all provided trading addresses
   * Uses a queueing mechanism to prevent multiple simultaneous requests
   */
  public async refreshBalances(
    addresses: Array<{ address: string, index: number }>,
    tokenMint?: string
  ) {
    if (addresses.length === 0) return;
    
    if (this.isRefreshing) {
      this.pendingRefresh = true;
      return;
    }
    
    this.isRefreshing = true;
    
    try {
      for (const addr of addresses) {
        try {
          const existingBalance = this.addressBalances[addr.address] || {
            public: '0.0000',
            private: '0.0000',
            total: '0.0000',
            solBalance: '0.0000',
            tokenBalances: {}
          };

          const solPublicBalance = await checkPublicBalance(addr.address);
          const solPrivateBalance = await checkPrivateBalance(addr.address);
          const solBalance = (parseFloat(solPublicBalance) + parseFloat(solPrivateBalance)).toFixed(4);

          const tokenBalances = existingBalance.tokenBalances || {};

          if (tokenMint && tokenMint !== 'So11111111111111111111111111111111111111112') {
            const tokenBalance = await this.checkTokenBalance(addr.address, tokenMint);
            tokenBalances[tokenMint] = parseFloat(tokenBalance);
            
            console.log(`Updated token balance for ${tokenMint}: ${tokenBalance}`);
          }

          this.addressBalances[addr.address] = {
            public: solPublicBalance,  // For SOL, this is the public SOL balance
            private: solPrivateBalance, // For SOL, this is the private SOL balance
            total: solBalance,         // Total SOL balance
            solBalance: solBalance,    // Explicit SOL-only balance for dropdown
            tokenBalances: Object.keys(tokenBalances).length > 0 ? tokenBalances : undefined
          };

        } catch (err) {
          console.error(`Error checking balances for ${addr.address}:`, err);
          if (!this.addressBalances[addr.address]) {
            this.addressBalances[addr.address] = {
              public: "0.0000",
              private: "0.0000",
              total: "0.0000",
              solBalance: "0.0000"
            };
          }
        }
      }
      
      this.onBalanceUpdate({ ...this.addressBalances });
    } catch (err) {
      console.error('Error refreshing balances:', err);
    } finally {
      this.isRefreshing = false;
      
      if (this.pendingRefresh) {
        this.pendingRefresh = false;
        this.refreshBalances(addresses, tokenMint);
      }
    }
  }
}
