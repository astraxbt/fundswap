
import { PublicKey } from '@solana/web3.js';

const JUPITER_API_BASE_URL = 'https://api.jup.ag';

export interface Token {
  address: string;
  chainId: number;
  decimals: number;
  name: string;
  symbol: string;
  logoURI?: string;
  tags?: string[];
}

export interface QuoteResponse {
  inputMint: string;
  outputMint: string;
  inAmount: string;
  outAmount: string;
  otherAmountThreshold: string;
  swapMode: string;
  slippageBps: number;
  platformFee?: {
    amount: string;
    feeBps: number;
  };
  priceImpactPct: string;
  routePlan: Array<{
    swapInfo: {
      amm: {
        id: string;
        label: string;
        inputMint: string;
        outputMint: string;
        inAmount: string;
        outAmount: string;
        feeAmount: string;
        feeMint: string;
      };
    };
    percent: number;
  }>;
  contextSlot: number;
  timeTaken: number;
}

export interface SwapRequestBody {
  quoteResponse: QuoteResponse;
  userPublicKey: string;
  wrapAndUnwrapSol?: boolean;
  dynamicComputeUnitLimit?: boolean;
  prioritizationFee?: number;
  asLegacyTransaction?: boolean;
  feeAccount?: string;
}

export interface SwapTransactionResponse {
  swapTransaction: string;
  lastValidBlockHeight: number;
  prioritizationFee?: number;
  addressLookupTableAddresses?: string[];
}

export interface SwapErrorResponse {
  error: string;
  additionalInfo?: string;
}

export type SwapResponse = SwapTransactionResponse | SwapErrorResponse;

export function isSwapErrorResponse(response: SwapResponse): response is SwapErrorResponse {
  return (response as SwapErrorResponse).error !== undefined;
}

export async function fetchTokens(): Promise<Token[]> {
  try {
    console.log('Loading popular tokens...');

    const popularTokens = [
      {
        address: 'So11111111111111111111111111111111111111112',
        chainId: 101,
        decimals: 9,
        name: 'Wrapped SOL',
        symbol: 'SOL',
        logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png'
      },
      {
        address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
        chainId: 101,
        decimals: 6,
        name: 'USD Coin',
        symbol: 'USDC',
        logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v/logo.png'
      },
      {
        address: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
        chainId: 101,
        decimals: 6,
        name: 'USDT',
        symbol: 'USDT',
        logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB/logo.png'
      },
      {
        address: 'mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So',
        chainId: 101,
        decimals: 9,
        name: 'Marinade staked SOL',
        symbol: 'mSOL',
        logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So/logo.png'
      },
      {
        address: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263',
        chainId: 101,
        decimals: 5,
        name: 'Bonk',
        symbol: 'BONK',
        logoURI: 'https://cdn.jsdelivr.net/gh/solana-labs/token-list@main/assets/mainnet/DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263/logo.png'
      },
      {
        address: '7dHbWXmci3dT8UFYWYZweBLXgycu7Y3iL6trKn1Y7ARj',
        chainId: 101,
        decimals: 9,
        name: 'Raydium',
        symbol: 'RAY',
        logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/7dHbWXmci3dT8UFYWYZweBLXgycu7Y3iL6trKn1Y7ARj/logo.png'
      },
      {
        address: 'orcaEKTdK7LKz57vaAYr9QeNsVEPfiu6QeMU1kektZE',
        chainId: 101,
        decimals: 6,
        name: 'Orca',
        symbol: 'ORCA',
        logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/orcaEKTdK7LKz57vaAYr9QeNsVEPfiu6QeMU1kektZE/logo.png'
      },
      {
        address: 'kinXdEcpDQeHPEuQnqmUgtYykqKGVFq6CeVX5iAHJq6',
        chainId: 101,
        decimals: 5,
        name: 'KIN',
        symbol: 'KIN',
        logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/kinXdEcpDQeHPEuQnqmUgtYykqKGVFq6CeVX5iAHJq6/logo.png'
      }
    ];

    console.log(`Loaded ${popularTokens.length} popular tokens`);
    return popularTokens;
  } catch (error) {
    console.error('Error loading popular tokens:', error);
    return [];
  }
}

export async function searchTokensFromJupiter(query: string): Promise<Token[]> {
  try {
    console.log('Searching Jupiter API for:', query);
    const response = await fetch(`/api/jupiter-proxy?endpoint=/api/v1/tokens/search&domain=fe-api.jup.ag&query=${encodeURIComponent(query)}`);
    if (!response.ok) {
      console.log('Jupiter search failed for:', query);
      return [];
    }
    const data = await response.json();
    
    if (!data.tokens || !Array.isArray(data.tokens)) {
      console.log('Invalid Jupiter search response format');
      return [];
    }
    
    return data.tokens.map((token: any) => ({
      address: token.address,
      chainId: 101,
      decimals: token.decimals,
      name: token.name,
      symbol: token.symbol,
      logoURI: token.icon || 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png'
    }));
  } catch (error) {
    console.error('Error searching Jupiter API:', error);
    return [];
  }
}

export async function searchTokens(tokens: Token[], query: string): Promise<Token[]> {
  if (!query || query.trim() === '') {
    return tokens.slice(0, 20); // Return first 20 tokens if no query
  }

  console.log('Available tokens:', tokens.length);

  const lowerQuery = query.toLowerCase().trim();
  console.log('Searching tokens with query:', query);
  console.log('Searching for:', lowerQuery);



  if (lowerQuery === 'let') {
    const letTokens = tokens.filter(token => 
      token.name.toLowerCase().includes('let') || 
      token.symbol.toLowerCase().includes('let')
    );
    
    if (letTokens.length > 0) {
      console.log('Found tokens matching "let":', letTokens.length);
      return letTokens;
    }
  }

  const exactAddressMatch = tokens.find(token => 
    token.address.toLowerCase() === lowerQuery
  );
  
  if (exactAddressMatch) {
    console.log('Found exact address match:', exactAddressMatch.symbol);
    return [exactAddressMatch];
  }

  const partialMatches = tokens.filter(token => 
    token.name.toLowerCase().includes(lowerQuery) || 
    token.symbol.toLowerCase().includes(lowerQuery) || 
    token.address.toLowerCase().includes(lowerQuery)
  );
  
  console.log('Found partial matches:', partialMatches.length);
  
  if (partialMatches.length > 0) {
    return partialMatches;
  }

  console.log('Searching Jupiter API for query:', query);
  const jupiterResults = await searchTokensFromJupiter(query);
  
  if (jupiterResults.length > 0) {
    console.log('Found tokens from Jupiter search:', jupiterResults.length);
    return jupiterResults;
  }
  
  if (lowerQuery.length <= 3) {
    const popularTokens = tokens.filter(token => 
      ['sol', 'usdc', 'usdt', 'bonk', 'ray', 'msol', 'orca'].includes(token.symbol.toLowerCase())
    );
    
    if (popularTokens.length > 0) {
      console.log('Showing popular tokens for short query:', popularTokens.length);
      return popularTokens;
    }
  }
  
  console.log('No matches found for query:', query);
  return [];
}

export function getTokenByAddress(tokens: Token[], address: string): Token | undefined {
  return tokens.find(token => token.address.toLowerCase() === address.toLowerCase());
}

export async function getQuote(
  inputMint: string,
  outputMint: string,
  amount: string,
  slippageBps: number = 50 // 0.5% default slippage
): Promise<QuoteResponse | null> {
  try {
    const params = new URLSearchParams({
      inputMint,
      outputMint,
      amount,
      slippageBps: slippageBps.toString(),
      onlyDirectRoutes: 'false',
      asLegacyTransaction: 'false'
    });

    const response = await fetch(`/api/jupiter-proxy?endpoint=/swap/v1/quote&domain=lite-api.jup.ag&${params.toString()}`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error getting quote:', error);
    return null;
  }
}

export function formatAmount(amount: string, decimals: number): string {
  const value = parseFloat(amount) / Math.pow(10, decimals);
  return value.toFixed(decimals > 6 ? 6 : decimals);
}

export function parseAmount(amount: string, decimals: number): string {
  const value = parseFloat(amount) * Math.pow(10, decimals);
  return Math.floor(value).toString();
}

export function calculatePriceImpact(quoteResponse: QuoteResponse): string {
  return quoteResponse.priceImpactPct;
}

export function formatRoute(quoteResponse: QuoteResponse): string {
  if (!quoteResponse.routePlan || quoteResponse.routePlan.length === 0) {
    return 'Direct';
  }

  const route = quoteResponse.routePlan.map(plan => {
    if (!plan.swapInfo || !plan.swapInfo.amm) {
      return 'Unknown';
    }
    return plan.swapInfo.amm.label || 'Unknown';
  }).join(' → ');

  return route;
}

export async function getSwapInstructions(
  quoteResponse: QuoteResponse,
  userPublicKey: string
): Promise<{ instructions: any[], lastValidBlockHeight: number, message?: string }> {
  try {
    console.log('===== GET SWAP INSTRUCTIONS API CALL =====');
    console.log(`Input token: ${quoteResponse.inputMint}`);
    console.log(`Output token: ${quoteResponse.outputMint}`);
    console.log(`Input amount: ${quoteResponse.inAmount}`);
    console.log(`Expected output amount: ${quoteResponse.outAmount}`);
    console.log(`User public key: ${userPublicKey}`);
    
    const body: SwapRequestBody = {
      quoteResponse,
      userPublicKey,
      wrapAndUnwrapSol: true,
      dynamicComputeUnitLimit: true,
    };
    
    const response = await fetch(`/api/jupiter-proxy?endpoint=/swap/v1/swap-instructions&domain=lite-api.jup.ag`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body)
    });
    
    if (!response.ok) {
      const errorBody = await response.text();
      console.error('Swap API error response:', errorBody);
      throw new Error(`API request failed: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    console.log('Swap API response data:', data);
    
    const allInstructions = [];
    
    if (data.setupInstructions && Array.isArray(data.setupInstructions)) {
      allInstructions.push(...data.setupInstructions);
    }
    
    if (data.computeBudgetInstructions && Array.isArray(data.computeBudgetInstructions)) {
      allInstructions.push(...data.computeBudgetInstructions);
    }
    
    if (data.swapInstruction) {
      allInstructions.push(data.swapInstruction);
    }
    
    if (data.cleanupInstruction) {
      allInstructions.push(data.cleanupInstruction);
    }
    
    if (data.tokenLedgerInstruction) {
      allInstructions.push(data.tokenLedgerInstruction);
    }
    
    if (allInstructions.length === 0) {
      console.error('Invalid API response format:', data);
      throw new Error('Invalid API response: No valid instructions found');
    }
    
    console.log(`Combined ${allInstructions.length} instructions from Jupiter response`);
    
    return {
      instructions: allInstructions,
      lastValidBlockHeight: data.lastValidBlockHeight,
      message: data.message,
    };
  } catch (error) {
    console.error('Error getting swap instructions:', error);
    throw new Error(`Failed to get swap instructions: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function executeSwap(
  quoteResponse: QuoteResponse,
  userPublicKey: string
): Promise<SwapResponse> {
  try {
    const body: SwapRequestBody = {
      quoteResponse,
      userPublicKey,
      wrapAndUnwrapSol: true,
      dynamicComputeUnitLimit: true,
      asLegacyTransaction: false
    };

    const response = await fetch(`/api/jupiter-proxy?endpoint=/swap/v1/swap&domain=lite-api.jup.ag`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error executing swap:', error);
    return { error: 'Failed to execute swap', additionalInfo: String(error) };
  }
}
