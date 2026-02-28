import { NextRequest, NextResponse } from 'next/server';
import { RelayLinkAPI } from '@/lib/relayLink';

const RELAY_BNB_PRIVATE_KEY = process.env.Relay_BNB_PRV;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, ...params } = body;

    switch (action) {
      case 'getSOLToBNBQuote':
        const { amount, userAddress, relayBNBAddress } = params;
        const solToBnbQuote = await RelayLinkAPI.getSOLToBNBQuote(
          amount,
          userAddress,
          relayBNBAddress
        );
        return NextResponse.json(solToBnbQuote);

      case 'getBNBToSOLQuote':
        const { bnbAmount, relayBNBAddr, destinationAddress } = params;
        const bnbToSolQuote = await RelayLinkAPI.getBNBToSOLQuote(
          bnbAmount,
          relayBNBAddr,
          destinationAddress
        );
        return NextResponse.json(bnbToSolQuote);

      case 'getExecutionStatus':
        const { requestId } = params;
        const status = await RelayLinkAPI.getExecutionStatus(requestId);
        return NextResponse.json(status);

      case 'executeTransaction':
        const { quote } = params;
        try {
          const transactionData = await RelayLinkAPI.executeTransaction(quote);
          
          return NextResponse.json({
            success: true,
            requestId: transactionData.requestId,
            instructions: transactionData.instructions,
            addressLookupTableAddresses: transactionData.addressLookupTableAddresses,
            message: 'Transaction instructions extracted successfully',
          });
        } catch (error: any) {
          console.error('Transaction execution error:', error);
          throw new Error(`Failed to process transaction: ${error.message}`);
        }

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
    console.error('Cross-chain API error:', error);
    return NextResponse.json(
      { error: error.message || 'Cross-chain operation failed' },
      { status: 500 }
    );
  }
}
