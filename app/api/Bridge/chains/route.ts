import { NextRequest, NextResponse } from 'next/server';
import { RelayLinkAPI } from '../../../../lib/relayLink';

export async function GET(request: NextRequest) {
  try {
    const chains = await RelayLinkAPI.getChains();
    
    const transformedChains = chains.chains?.map((chain: any) => ({
      id: chain.id.toString(),
      name: chain.displayName || chain.name,
      icon: '🔗',
      native: chain.currency?.symbol || 'UNKNOWN',
      chainId: chain.id,
      currency: chain.currency
    })) || [];

    return NextResponse.json({ chains: transformedChains });
  } catch (error: any) {
    console.error('Chains API error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch chains' },
      { status: 500 }
    );
  }
}
