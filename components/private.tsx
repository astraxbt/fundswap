'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2 } from 'lucide-react';
import { useWallet } from '@solana/wallet-adapter-react';
import { ComputeBudgetProgram, TransactionMessage, VersionedTransaction, PublicKey } from '@solana/web3.js';
import {
  LightSystemProgram,
  bn,
  buildTx,
  defaultTestStateTreeAccounts,
  selectMinCompressedSolAccountsForTransfer,
  createRpc,
} from '@lightprotocol/stateless.js';

// Use Helius endpoint
const RPC_URL = 'https://devnet.helius-rpc.com/?api-key=f09cbd78-a0f7-4b52-983c-71880b01240b';

export default function PrivateSolOperations() {
  const { publicKey, sendTransaction } = useWallet();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [privateBalance, setPrivateBalance] = useState(null);
  const [amount, setAmount] = useState('');
  const [recipient, setRecipient] = useState('');
  const [unshieldAmount, setUnshieldAmount] = useState('');

  const checkPrivateBalance = useCallback(async (address) => {
    if (!address) return null;
    try {
      const connection = await createRpc(RPC_URL);
      const compressedAccounts = await connection.getCompressedAccountsByOwner(new PublicKey(address));
      const totalLamports = compressedAccounts.items.reduce((sum, account) => 
        BigInt(sum) + BigInt(account.lamports || 0), BigInt(0));
      // Convert lamports to SOL with proper decimal handling
      const solBalance = Number(totalLamports) / 1e9;
      return solBalance.toFixed(4);
    } catch (err) {
      console.error('Error checking private balance:', err);
      return null;
    }
  }, []);

  // Effect to load private balance when wallet connects
  useEffect(() => {
    if (publicKey) {
      checkPrivateBalance(publicKey.toString()).then(balance => {
        setPrivateBalance(balance);
      });
    }
  }, [publicKey, checkPrivateBalance]);

  const handleTransfer = useCallback(async () => {
    if (!publicKey) {
      setError('Please connect your wallet');
      return;
    }

    setLoading(true);
    setError('');
    setStatus('Initializing transfer...');

    try {
      const connection = await createRpc(RPC_URL);
      const recipientPubKey = new PublicKey(recipient);
      const lamportsAmount = parseFloat(amount) * 1e9;

      setStatus('Compressing SOL...');
      const compressInstruction = await LightSystemProgram.compress({
        payer: publicKey,
        toAddress: publicKey,
        lamports: lamportsAmount,
        outputStateTree: defaultTestStateTreeAccounts().merkleTree,
      });

      const compressInstructions = [
        ComputeBudgetProgram.setComputeUnitLimit({ units: 1_000_000 }),
        compressInstruction,
      ];

      setStatus('Getting blockhash...');
      const { context: { slot: minContextSlot }, value: blockhashCtx } = 
        await connection.getLatestBlockhashAndContext();

      const messageV0 = new TransactionMessage({
        payerKey: publicKey,
        recentBlockhash: blockhashCtx.blockhash,
        instructions: compressInstructions,
      }).compileToV0Message();

      const transaction = new VersionedTransaction(messageV0);

      setStatus('Sending compression transaction...');
      const signature = await sendTransaction(transaction, connection, {
        minContextSlot,
      });

      await connection.confirmTransaction({
        signature,
        ...blockhashCtx
      });

      setStatus('Getting compressed accounts...');
      const accounts = await connection.getCompressedAccountsByOwner(publicKey);

      const [selectedAccounts, _] = selectMinCompressedSolAccountsForTransfer(
        accounts.items,
        lamportsAmount
      );

      setStatus('Getting validity proof...');
      const { compressedProof, rootIndices } = await connection.getValidityProof(
        selectedAccounts.map(account => bn(account.hash))
      );

      setStatus('Creating private transfer...');
      const sendInstruction = await LightSystemProgram.transfer({
        payer: publicKey,
        toAddress: recipientPubKey,
        lamports: lamportsAmount,
        inputCompressedAccounts: selectedAccounts,
        outputStateTrees: [defaultTestStateTreeAccounts().merkleTree],
        recentValidityProof: compressedProof,
        recentInputStateRootIndices: rootIndices,
      });

      const sendInstructions = [
        ComputeBudgetProgram.setComputeUnitLimit({ units: 1_000_000 }),
        sendInstruction,
      ];

      const { context: { slot: minContextSlotSend }, value: blockhashSend } = 
        await connection.getLatestBlockhashAndContext();

      const messageV0Send = new TransactionMessage({
        payerKey: publicKey,
        recentBlockhash: blockhashSend.blockhash,
        instructions: sendInstructions,
      }).compileToV0Message();

      const transactionSend = new VersionedTransaction(messageV0Send);

      setStatus('Sending private transfer...');
      const signatureSend = await sendTransaction(transactionSend, connection, {
        minContextSlot: minContextSlotSend,
      });

      await connection.confirmTransaction({
        signature: signatureSend,
        ...blockhashSend
      });

      // Check recipient's private balance after transfer
      const recipientPrivateBalance = await checkPrivateBalance(recipient);
      setStatus(`Transfer complete!\nSignature: ${signatureSend}\nRecipient's private balance: ${recipientPrivateBalance || 'Unknown'} SOL`);
      
      // Update sender's private balance
      const newBalance = await checkPrivateBalance(publicKey.toString());
      setPrivateBalance(newBalance);

      console.log(`Sent ${amount} SOL to ${recipient}!\nTxId: https://explorer.solana.com/tx/${signatureSend}?cluster=devnet`);
    } catch (err) {
      console.error('Transfer error:', err);
      setError(err.message || 'Failed to process transaction');
    } finally {
      setLoading(false);
    }
  }, [publicKey, sendTransaction, amount, recipient, checkPrivateBalance]);

  const handleUnshield = useCallback(async () => {
    if (!publicKey) {
      setError('Please connect your wallet');
      return;
    }

    setLoading(true);
    setError('');
    setStatus('Initializing unshield...');

    try {
      const connection = await createRpc(RPC_URL);
      const lamportsAmount = parseFloat(unshieldAmount) * 1e9;

      setStatus('Getting compressed accounts...');
      const accounts = await connection.getCompressedAccountsByOwner(publicKey);

      const [selectedAccounts, _] = selectMinCompressedSolAccountsForTransfer(
        accounts.items,
        lamportsAmount
      );

      setStatus('Getting validity proof...');
      const { compressedProof, rootIndices } = await connection.getValidityProof(
        selectedAccounts.map(account => bn(account.hash))
      );

      setStatus('Creating unshield transaction...');
      const unshieldInstruction = await LightSystemProgram.decompress({
        payer: publicKey,
        toAddress: publicKey,
        lamports: lamportsAmount,
        inputCompressedAccounts: selectedAccounts,
        recentValidityProof: compressedProof,
        recentInputStateRootIndices: rootIndices,
      });

      const unshieldInstructions = [
        ComputeBudgetProgram.setComputeUnitLimit({ units: 1_000_000 }),
        unshieldInstruction,
      ];

      const { context: { slot: minContextSlot }, value: blockhashCtx } = 
        await connection.getLatestBlockhashAndContext();

      const messageV0 = new TransactionMessage({
        payerKey: publicKey,
        recentBlockhash: blockhashCtx.blockhash,
        instructions: unshieldInstructions,
      }).compileToV0Message();

      const transaction = new VersionedTransaction(messageV0);

      setStatus('Sending unshield transaction...');
      const signature = await sendTransaction(transaction, connection, {
        minContextSlot,
      });

      await connection.confirmTransaction({
        signature,
        ...blockhashCtx
      });

      // Update private balance
      const newPrivateBalance = await checkPrivateBalance(publicKey.toString());
      setPrivateBalance(newPrivateBalance);
      
      setStatus(`Unshield complete!\nSignature: ${signature}\nRemaining private balance: ${newPrivateBalance || 'Unknown'} SOL`);
      console.log(`Unshielded ${unshieldAmount} SOL!\nTxId: https://explorer.solana.com/tx/${signature}?cluster=devnet`);
    } catch (err) {
      console.error('Unshield error:', err);
      setError(err.message || 'Failed to unshield SOL');
    } finally {
      setLoading(false);
    }
  }, [publicKey, sendTransaction, unshieldAmount, checkPrivateBalance]);

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardContent>
        <Tabs defaultValue="send" className="space-y-4">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="Send">Send</TabsTrigger>
            <TabsTrigger value="Unshield">Unshield</TabsTrigger>
          </TabsList>

          <TabsContent value="Send" className="space-y-4">
            <Input
              placeholder="Recipient Public Key"
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              disabled={loading}
            />
            <Input
              type="number"
              placeholder="Amount SOL"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              min="0"
              step="0.1"
              disabled={loading}
            />
            <Button 
              onClick={handleTransfer}
              disabled={loading || !publicKey}
              className="w-full"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {status || 'Processing'}
                </>
              ) : (
                'Send Private Transaction'
              )}
            </Button>
          </TabsContent>

          <TabsContent value="Unshield" className="space-y-4">
            {publicKey && (
              <Alert>
                <AlertDescription>
                  Available private balance: {loading ? 'Loading...' : privateBalance || '0'} SOL
                </AlertDescription>
              </Alert>
            )}
            <Input
              type="number"
              placeholder="Amount to Unshield"
              value={unshieldAmount}
              onChange={(e) => setUnshieldAmount(e.target.value)}
              min="0"
              step="0.1"
              disabled={loading}
            />
            <Button 
              onClick={handleUnshield}
              disabled={loading || !publicKey}
              className="w-full"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {status || 'Processing'}
                </>
              ) : (
                'Unshield SOL'
              )}
            </Button>
          </TabsContent>
        </Tabs>

        {error && (
          <Alert variant="destructive" className="mt-4">
            <AlertDescription className="break-all">{error}</AlertDescription>
          </Alert>
        )}

        {status && !error && (
          <Alert className="mt-4">
            <AlertDescription className="break-all whitespace-pre-line">{status}</AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
