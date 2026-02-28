import { NextRequest, NextResponse } from 'next/server';
import { RelayLinkAPI, CHAIN_IDS } from '../../../../lib/relayLink';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { 
      amount, 
      destinationChainId, 
      userAddress, 
      destinationAddress,
      originCurrency = '11111111111111111111111111111111',
      destinationCurrency = '0x0000000000000000000000000000000000000000'
    } = body;

    if (!amount || !destinationChainId || !userAddress || !destinationAddress) {
      return NextResponse.json(
        { error: 'Missing required parameters: amount, destinationChainId, userAddress, destinationAddress' },
        { status: 400 }
      );
    }

    const amountInLamports = (parseFloat(amount) * 1e9).toString();

    const quote = await RelayLinkAPI.getQuote(
      CHAIN_IDS.SOLANA,
      destinationChainId.toString(),
      originCurrency,
      destinationCurrency,
      amountInLamports,
      userAddress,
      destinationAddress,
      true
    );

    return NextResponse.json(quote);
  } catch (error: any) {
    console.error('Quote API error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to get quote' },
      { status: 500 }
    );
  }
}
