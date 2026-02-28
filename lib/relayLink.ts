import { PublicKey } from '@solana/web3.js';

export interface RelayLinkQuote {
  intentId: string;
  originChainId: string;
  destinationChainId: string;
  originCurrency: string;
  destinationCurrency: string;
  amount: string;
  recipient: string;
  user: string;
  fee: string;
  estimatedTime: number;
  steps: RelayLinkStep[];
}

export interface RelayLinkStep {
  chainId: string;
  txData: string;
  to: string;
  value: string;
  gasLimit: string;
}

export interface RelayLinkExecutionStatus {
  intentId: string;
  status: 'pending' | 'completed' | 'failed';
  currentStep: number;
  totalSteps: number;
  txHashes: string[];
  error?: string;
}

const RELAY_LINK_API_BASE = 'https://api.relay.link';
const SOLANA_CHAIN_ID = '792703809';
const BNB_CHAIN_ID = '56';
const FEE_RECIPIENT = 'J9DYC1986DWakvDbns1yLtdnvKm7krWbuvKQmutz7i4K';

export class RelayLinkAPI {
  private static async makeRequest(endpoint: string, options: RequestInit = {}) {
    const url = `${RELAY_LINK_API_BASE}${endpoint}`;
    console.log('Making request to:', url);
    
    const response = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      ...options,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Relay.link API error response:', errorText);
      throw new Error(`Relay.link API error: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }

  static async getQuote(
    originChain: string,
    destChain: string,
    originCurrency: string,
    destinationCurrency: string,
    amount: string,
    user: string,
    recipient: string,
    includeFee: boolean = true
  ): Promise<any> {
    const requestBody: any = {
      user,
      originChainId: parseInt(originChain),
      destinationChainId: parseInt(destChain),
      originCurrency,
      destinationCurrency,
      amount,
      recipient,
      tradeType: 'EXACT_INPUT'
    };

    if (includeFee) {
      requestBody.appFees = [{
        recipient: FEE_RECIPIENT,
        fee: "100"
      }];
    }

    console.log('Relay.link quote request:', JSON.stringify(requestBody, null, 2));

    return this.makeRequest('/quote', {
      method: 'POST',
      body: JSON.stringify(requestBody)
    });
  }

  static async executeTransaction(quote: any): Promise<{ requestId: string; txHash: string; instructions: any[]; addressLookupTableAddresses: string[] }> {
    console.log('=== RELAY.LINK EXECUTE TRANSACTION ===');
    console.log('Quote structure:', JSON.stringify(quote, null, 2));
    
    const step = quote.steps[0];
    if (!step || !step.items || !step.items[0]) {
      throw new Error('Invalid quote structure - missing transaction data');
    }

    const item = step.items[0];
    console.log('Step item data:', JSON.stringify(item.data, null, 2));
    
    if (!item.data || !item.data.instructions) {
      throw new Error('Invalid quote structure - missing instructions');
    }

    const addressLookupTableAddresses = item.data.addressLookupTableAddresses;
    console.log('Address lookup table addresses from relay.link:', addressLookupTableAddresses);

    return {
      requestId: step.requestId,
      txHash: '', 
      instructions: item.data.instructions,
      addressLookupTableAddresses: Array.isArray(addressLookupTableAddresses) ? addressLookupTableAddresses : []
    };
  }

  static async getSOLToBNBQuote(
    amount: string,
    userAddress: string,
    relayBNBAddress: string,
    includeFee: boolean = true
  ): Promise<any> {
    return this.getQuote(
      SOLANA_CHAIN_ID,
      BNB_CHAIN_ID,
      '11111111111111111111111111111111',
      '0x0000000000000000000000000000000000000000',
      amount,
      userAddress,
      relayBNBAddress,
      includeFee
    );
  }

  static async getBNBToSOLQuote(
    amount: string,
    relayBNBAddress: string,
    destinationAddress: string,
    includeFee: boolean = true
  ): Promise<any> {
    return this.getQuote(
      BNB_CHAIN_ID,
      SOLANA_CHAIN_ID,
      '0x0000000000000000000000000000000000000000',
      '11111111111111111111111111111111',
      amount,
      relayBNBAddress,
      destinationAddress,
      includeFee
    );
  }

  static async getExecutionStatus(requestId: string): Promise<RelayLinkExecutionStatus> {
    return this.makeRequest(`/intents/status?requestId=${requestId}`);
  }

  static async waitForCompletion(
    requestId: string,
    maxWaitTime: number = 300000,
    pollInterval: number = 5000
  ): Promise<RelayLinkExecutionStatus> {
    const startTime = Date.now();
    
    while (Date.now() - startTime < maxWaitTime) {
      const status = await this.getExecutionStatus(requestId);
      
      if (status.status === 'completed' || status.status === 'failed') {
        return status;
      }
      
      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }
    
    throw new Error('Bridge transaction timeout');
  }

  static async getChains(): Promise<any> {
    return this.makeRequest('/chains');
  }
}

export const CHAIN_IDS = {
  SOLANA: SOLANA_CHAIN_ID,
  BNB: BNB_CHAIN_ID,
} as const;
