import { NextRequest, NextResponse } from 'next/server';
import { ethers } from 'ethers';

export async function POST(request: NextRequest) {
  try {
    const { txData, to, value, gasLimit } = await request.json();

    const privateKey = process.env.Relay_BNB_PRV;
    if (!privateKey) {
      throw new Error('BNB private key not found in environment variables');
    }

    const provider = new ethers.JsonRpcProvider('https://bsc-dataseed.binance.org/');
    const wallet = new ethers.Wallet(privateKey, provider);

    const gasPrice = await provider.getFeeData();
    const nonce = await wallet.getNonce();

    const transaction = {
      to: to,
      value: ethers.parseEther(value || '0'),
      data: txData,
      gasLimit: 500000, // Fixed gas limit to handle complex contract calls
      gasPrice: gasPrice.gasPrice,
      nonce: nonce,
      chainId: 56
    };

    const signedTx = await wallet.sendTransaction(transaction);
    console.log('BNB transaction sent:', signedTx.hash);
    
    const receipt = await provider.waitForTransaction(signedTx.hash, 1, 30000);
    if (!receipt || receipt.status !== 1) {
      throw new Error('BNB transaction failed on-chain or was reverted');
    }
    
    console.log('BNB transaction confirmed on-chain:', signedTx.hash);
    
    return NextResponse.json({
      success: true,
      txHash: signedTx.hash,
      transaction: signedTx,
      receipt: receipt
    });

  } catch (error: any) {
    console.error('BNB transaction error:', error);
    return NextResponse.json(
      { error: error.message || 'BNB transaction failed' },
      { status: 500 }
    );
  }
}
