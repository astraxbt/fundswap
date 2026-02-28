declare module '@elusiv/sdk' {
  export class Elusiv {
    static getElusivInstance(
      seed: Uint8Array,
      signer: import('@solana/web3.js').PublicKey,
      connection: import('@solana/web3.js').Connection,
      cluster: string
    ): Promise<Elusiv>;
    
    getLatestPrivateBalance(tokenType: string): Promise<bigint>;
    buildTopUpTx(amount: number, tokenType: string): Promise<any>;
    buildSendTx(amount: number, recipient: import('@solana/web3.js').PublicKey, tokenType: string): Promise<any>;
    sendElusivTx(tx: any): Promise<{ signature: string }>;
  }

  export type TokenType = 'LAMPORTS';
} 