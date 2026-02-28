import { NextRequest, NextResponse } from 'next/server';
import { RelayLinkAPI } from '../../../../lib/relayLink';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, ...params } = body;

    switch (action) {
      case 'executePublicBridge':
        const { quote } = params;
        try {
          const transactionData = await RelayLinkAPI.executeTransaction(quote);
          
          return NextResponse.json({
            success: true,
            requestId: transactionData.requestId,
            instructions: transactionData.instructions,
            addressLookupTableAddresses: transactionData.addressLookupTableAddresses,
            message: 'Bridge transaction instructions ready',
          });
        } catch (error: any) {
          console.error('Public bridge execution error:', error);
          throw new Error(`Failed to execute public bridge: ${error.message}`);
        }

      case 'executeRelayWalletUnshield':
        const { transferAmount, bridgeAddress, userPublicKey } = params;
        
        const response = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/fund`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'unshieldFromRelay',
            transferAmount,
            bridgeAddress,
            userPublicKey
          })
        });

        if (!response.ok) {
          throw new Error('Failed to execute relay wallet unshield');
        }

        return NextResponse.json(await response.json());

      case 'getExecutionStatus':
        const { requestId } = params;
        const status = await RelayLinkAPI.getExecutionStatus(requestId);
        return NextResponse.json(status);

      case 'waitForCompletion':
        const { requestId: waitRequestId, maxWaitTime, pollInterval } = params;
        const completionStatus = await RelayLinkAPI.waitForCompletion(
          waitRequestId,
          maxWaitTime,
          pollInterval
        );
        return NextResponse.json(completionStatus);

      default:
        return NextResponse.json(
          { error: 'Invalid action' },
          { status: 400 }
        );
    }
  } catch (error: any) {
    console.error('Bridge execution API error:', error);
    return NextResponse.json(
      { error: error.message || 'Bridge execution failed' },
      { status: 500 }
    );
  }
}
