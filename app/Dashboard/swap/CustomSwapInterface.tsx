"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, ChevronDown, Wallet, RefreshCw, ArrowRightLeft, Search, X, Copy } from "lucide-react";
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { PublicKey, Connection, Transaction, VersionedTransaction, Keypair, ComputeBudgetProgram, TransactionMessage, TransactionInstruction, SendTransactionError } from '@solana/web3.js';
import { toast } from 'sonner';
import { 
  fetchTokens, 
  searchTokens, 
  getQuote, 
  executeSwap,
  isSwapErrorResponse,
  formatAmount, 
  parseAmount, 
  calculatePriceImpact, 
  formatRoute,
  Token,
  QuoteResponse,
  getSwapInstructions
} from './jupiterApi';
import { getAllTradingAddresses, checkPrivateBalance, checkPublicBalance, TRADING_BASE_CHALLENGE } from './utils';
import { keccak_256 } from '@noble/hashes/sha3';
import { BalanceManager, type AddressBalance } from './balanceManager';
import { bn } from '@lightprotocol/stateless.js';
import bs58 from 'bs58';


const MIN_BUFFER_LAMPORTS = 5000000; // 0.005 SOL buffer as specified by user
const PRE_SWAP_SOL_AMOUNT = 10000000; // 0.01 SOL for gas fees in non-SOL swaps

// Helper function to calculate total amount needed for a swap transaction
function calculateTotalSwapAmount(swapAmount: number, publicBalance: number): number {
  const amountToUnshield = Math.ceil((swapAmount - publicBalance) * 1e9); // Convert to lamports
  return amountToUnshield + MIN_BUFFER_LAMPORTS;
}

export default function CustomSwapInterface() {
  const { publicKey, signMessage, signTransaction, signAllTransactions, wallet, sendTransaction } = useWallet();
  const connection = new Connection("https://geralda-226chf-fast-mainnet.helius-rpc.com", "confirmed");
  
  const [tradingAddresses, setTradingAddresses] = useState<Array<{ address: string, index: number }>>([]);
  const [selectedAddress, setSelectedAddress] = useState<string | null>(null);
  const [isAddressDropdownOpen, setIsAddressDropdownOpen] = useState(false);
  const [isGeneratingAddresses, setIsGeneratingAddresses] = useState(false);
  const [addressBalances, setAddressBalances] = useState<Record<string, AddressBalance>>({});
  const dropdownButtonRef = useRef<HTMLButtonElement>(null);
  const [dropdownPosition, setDropdownPosition] = useState<{
    width: number;
  }>({ width: 0 });
  const balanceManagerRef = useRef<BalanceManager | null>(null);
  const quoteRefreshIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const [usePrivateBalance, setUsePrivateBalance] = useState(false);
  
  const [allTokens, setAllTokens] = useState<Token[]>([]);
  const [filteredTokens, setFilteredTokens] = useState<Token[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoadingTokens, setIsLoadingTokens] = useState(false);
  
  const [inputToken, setInputToken] = useState<Token | null>(null);
  const [outputToken, setOutputToken] = useState<Token | null>(null);
  
  const [inputAmount, setInputAmount] = useState('');
  const [outputAmount, setOutputAmount] = useState('');
  
  const [inputTokenBalance, setInputTokenBalance] = useState<AddressBalance | null>(null);
  const [outputTokenBalance, setOutputTokenBalance] = useState<AddressBalance | null>(null);
  
  const [showTokenSelector, setShowTokenSelector] = useState<'input' | 'output' | null>(null);
  const [isSwapping, setIsSwapping] = useState(false);
  const [isGettingQuote, setIsGettingQuote] = useState(false);
  
  const [quoteResponse, setQuoteResponse] = useState<QuoteResponse | null>(null);
  const [status, setStatus] = useState<string>('');

  useEffect(() => {
    if (!balanceManagerRef.current) {
      balanceManagerRef.current = new BalanceManager({
        onBalanceUpdate: (balances: Record<string, AddressBalance>) => {
          setAddressBalances(balances);
        },
        connection: new Connection(
          process.env.NEXT_PUBLIC_RPC_URL || "https://mainnet.helius-rpc.com/?api-key=73475046-d6aa-44c2-921c-ad2163091ba4",
          'confirmed'
        )
      });
    }
  }, []);
  
  useEffect(() => {
    if (tradingAddresses.length > 0 && balanceManagerRef.current) {
      const intervalId = setInterval(() => {
        const addressesToRefresh = tradingAddresses.map(addr => ({
          address: addr.address,
          index: addr.index
        }));
        const tokenMintAddress = inputToken?.address !== 'So11111111111111111111111111111111111111112'
          ? inputToken?.address
          : undefined;
        balanceManagerRef.current?.refreshBalances(addressesToRefresh, tokenMintAddress);
      }, 10000); // 10 seconds interval
      
      return () => clearInterval(intervalId);
    }
  }, [tradingAddresses, inputToken]);

  const generateTradingAddresses = useCallback(async () => {
    if (!publicKey || !signMessage) {
      toast.error('Please connect your wallet');
      return;
    }

    setIsGeneratingAddresses(true);

    try {
      const message = new TextEncoder().encode(TRADING_BASE_CHALLENGE);
      await signMessage(message);

      const addresses = await getAllTradingAddresses(publicKey, signMessage, 3);

      const formattedAddresses = addresses.map((addr) => ({
        address: addr.publicKey.toString(),
        index: addr.index
      }));

      setTradingAddresses(formattedAddresses);

      if (formattedAddresses.length > 0 && !selectedAddress) {
        setSelectedAddress(formattedAddresses[0].address);
      }

      await queryAddressBalances(formattedAddresses);

      toast.success('Trading addresses generated successfully');
    } catch (err: any) {
      console.error('Error generating trading addresses:', err);
      toast.error('Failed to generate trading addresses');
    } finally {
      setIsGeneratingAddresses(false);
    }
  }, [publicKey, signMessage, selectedAddress]);

  useEffect(() => {
    if (publicKey && tradingAddresses.length === 0 && !isGeneratingAddresses) {
      generateTradingAddresses();
    }
  }, [publicKey, tradingAddresses.length, isGeneratingAddresses, generateTradingAddresses]);

  useEffect(() => {
    const getTokens = async () => {
      setIsLoadingTokens(true);
      try {
        const tokens = await fetchTokens();
        
        if (tokens.length === 0) {
          const defaultTokens = [
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
            }
          ];
          setAllTokens(defaultTokens);
          
          const sol = defaultTokens.find(t => t.symbol === 'SOL');
          const usdc = defaultTokens.find(t => t.symbol === 'USDC');
          
          if (sol) setInputToken(sol);
          if (usdc) setOutputToken(usdc);
        } else {
          setAllTokens(tokens);
          
          const sol = tokens.find(t => t.symbol === 'SOL');
          const usdc = tokens.find(t => t.symbol === 'USDC');
          
          if (sol) setInputToken(sol);
          if (usdc) setOutputToken(usdc);
        }
      } catch (error) {
        console.error('Error loading tokens:', error);
        toast.error('Failed to load tokens');
        
        const defaultTokens = [
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
          }
        ];
        setAllTokens(defaultTokens);
        
        const sol = defaultTokens.find(t => t.symbol === 'SOL');
        const usdc = defaultTokens.find(t => t.symbol === 'USDC');
        
        if (sol) setInputToken(sol);
        if (usdc) setOutputToken(usdc);
      } finally {
        setIsLoadingTokens(false);
      }
    };
    
    getTokens();
  }, []);

  useEffect(() => {
    if (showTokenSelector) {
      const performSearch = async () => {
        const filtered = await searchTokens(allTokens, searchQuery);
        setFilteredTokens(filtered);
      };
      performSearch();
    }
  }, [searchQuery, allTokens, showTokenSelector]);

  const fetchTokenBalance = async (tokenAddress: string, walletAddress: string): Promise<AddressBalance | null> => {
    if (!tokenAddress || !walletAddress) return null;
    
    console.log(`Fetching balance for token ${tokenAddress} at address ${walletAddress}`);
    
    let balanceData = addressBalances[walletAddress];
    if (!balanceData && balanceManagerRef.current) {
      console.log('No balance data found, refreshing...');
      await balanceManagerRef.current.refreshBalances([{ address: walletAddress, index: 0 }], tokenAddress);
      balanceData = addressBalances[walletAddress];
    }
    
    if (!balanceData) {
      console.log('Still no balance data after refresh');
      return null;
    }
    
    if (tokenAddress === 'So11111111111111111111111111111111111111112') {
      console.log('Returning SOL balance:', balanceData);
      return {
        public: balanceData.public,
        private: balanceData.private,
        total: balanceData.total,
        solBalance: balanceData.solBalance,
        tokenBalances: balanceData.tokenBalances
      };
    }
    
    if (balanceData.tokenBalances && balanceData.tokenBalances[tokenAddress] !== undefined) {
      const tokenBalance = balanceData.tokenBalances[tokenAddress].toFixed(4);
      console.log(`Found existing token balance for ${tokenAddress}: ${tokenBalance}`);
      return {
        public: tokenBalance,
        private: '0.0000',
        total: tokenBalance,
        solBalance: balanceData.solBalance,
        tokenBalances: balanceData.tokenBalances
      };
    }
    
    if (balanceManagerRef.current) {
      console.log(`Fetching token balance for ${tokenAddress}...`);
      await balanceManagerRef.current.refreshBalances([{ address: walletAddress, index: 0 }], tokenAddress);
      const refreshedBalanceData = addressBalances[walletAddress];
      
      if (refreshedBalanceData?.tokenBalances?.[tokenAddress] !== undefined) {
        const tokenBalance = refreshedBalanceData.tokenBalances[tokenAddress].toFixed(4);
        console.log(`Fetched token balance for ${tokenAddress}: ${tokenBalance}`);
        return {
          public: tokenBalance,
          private: '0.0000',
          total: tokenBalance,
          solBalance: refreshedBalanceData.solBalance,
          tokenBalances: refreshedBalanceData.tokenBalances
        };
      }
    }
    
    console.log(`No balance found for token ${tokenAddress}, returning zero`);
    return {
      public: '0.0000',
      private: '0.0000',
      total: '0.0000',
      solBalance: balanceData?.solBalance || '0.0000',
      tokenBalances: balanceData?.tokenBalances
    };
  };

  const queryAddressBalances = async (addresses: Array<{ address: string, index: number }>) => {
    if (balanceManagerRef.current && addresses.length > 0) {
      await balanceManagerRef.current.refreshBalances(addresses);
    }
  };

  const formatAddress = (address: string): string => {
    return `${address.substring(0, 4)}...${address.substring(address.length - 4)}`;
  };

  const fetchQuote = useCallback(async () => {
    if (!inputToken || !outputToken || !inputAmount || parseFloat(inputAmount) <= 0 || !selectedAddress) {
      setOutputAmount('');
      setQuoteResponse(null);
      return;
    }
    
    setIsGettingQuote(true);
    try {
      const parsedAmount = parseAmount(inputAmount, inputToken.decimals);
      const quote = await getQuote(
        inputToken.address,
        outputToken.address,
        parsedAmount
      );
      
      if (quote) {
        setQuoteResponse(quote);
        setOutputAmount(formatAmount(quote.outAmount, outputToken.decimals));
      } else {
        setOutputAmount('');
        setQuoteResponse(null);
      }
    } catch (error) {
      console.error('Error getting quote:', error);
      setOutputAmount('');
      setQuoteResponse(null);
    } finally {
      setIsGettingQuote(false);
    }
  }, [inputToken, outputToken, inputAmount, selectedAddress]);
  
  useEffect(() => {
    const timeoutId = setTimeout(fetchQuote, 500);
    return () => clearTimeout(timeoutId);
  }, [fetchQuote]);
  
  useEffect(() => {
    if (quoteRefreshIntervalRef.current) {
      clearInterval(quoteRefreshIntervalRef.current);
      quoteRefreshIntervalRef.current = null;
    }
    
    if (inputToken && outputToken && inputAmount && parseFloat(inputAmount) > 0 && selectedAddress) {
      quoteRefreshIntervalRef.current = setInterval(fetchQuote, 15000);
    }
    
    return () => {
      if (quoteRefreshIntervalRef.current) {
        clearInterval(quoteRefreshIntervalRef.current);
        quoteRefreshIntervalRef.current = null;
      }
    };
  }, [fetchQuote, inputToken, outputToken, inputAmount, selectedAddress]);
  
  useEffect(() => {
    const updateTokenBalances = async () => {
      if (selectedAddress) {
        if (inputToken) {
          const balance = await fetchTokenBalance(inputToken.address, selectedAddress);
          setInputTokenBalance(balance);
        }
        
        if (outputToken) {
          const balance = await fetchTokenBalance(outputToken.address, selectedAddress);
          setOutputTokenBalance(balance);
        }
      }
    };
    
    updateTokenBalances();
  }, [selectedAddress, inputToken, outputToken]);



  const handleSelectToken = (token: Token) => {
    if (showTokenSelector === 'input') {
      if (outputToken && token.address === outputToken.address) {
        toast.error('Input and output tokens cannot be the same');
        return;
      }
      setInputToken(token);
      if (selectedAddress) {
        fetchTokenBalance(token.address, selectedAddress).then(setInputTokenBalance);
      }
    } else if (showTokenSelector === 'output') {
      if (inputToken && token.address === inputToken.address) {
        toast.error('Input and output tokens cannot be the same');
        return;
      }
      setOutputToken(token);
      if (selectedAddress) {
        fetchTokenBalance(token.address, selectedAddress).then(setOutputTokenBalance);
      }
    }
    
    setShowTokenSelector(null);
    setSearchQuery('');
  };
  
  const handleSwapTokens = async () => {
    if (inputToken && outputToken) {
      const newInputToken = outputToken;  // What will become the new input token
      const newOutputToken = inputToken;  // What will become the new output token
      
      setInputToken(newInputToken);
      setOutputToken(newOutputToken);
      if (outputAmount) {
        setInputAmount(outputAmount);
      }
      
      if (selectedAddress) {
        console.log('Refreshing balances after token swap...');
        const newInputBalance = await fetchTokenBalance(newInputToken.address, selectedAddress);
        const newOutputBalance = await fetchTokenBalance(newOutputToken.address, selectedAddress);
        
        console.log('New input token balance:', newInputBalance);
        console.log('New output token balance:', newOutputBalance);
        
        setInputTokenBalance(newInputBalance);
        setOutputTokenBalance(newOutputBalance);
      }
    }
  };
  
  const handleInputAmountChange = (value: string) => {
    if (/^(\d+)?(\.\d*)?$/.test(value) || value === '') {
      setInputAmount(value);
    }
  };

  const handleMaxClick = () => {
    if (!inputTokenBalance || !inputToken) return;
    
    if (inputToken.address === 'So11111111111111111111111111111111111111112') {
      const maxBalance = usePrivateBalance ? inputTokenBalance.private : inputTokenBalance.public;
      setInputAmount(maxBalance);
    } else {
      setInputAmount(inputTokenBalance.public);
    }
  };
  
  const needsPreSwapSolUnshielding = (inputTokenAddress: string, publicSolBalance: number, privateSolBalance: number): boolean => {
    if (inputTokenAddress === 'So11111111111111111111111111111111111111112') {
      return false;
    }
    
    const minSolForGas = PRE_SWAP_SOL_AMOUNT / 1e9;
    return publicSolBalance < minSolForGas && privateSolBalance >= minSolForGas;
  };

  const handleSwap = async () => {
    if (!publicKey) {
      toast.error('Please connect your wallet');
      return;
    }
    
    if (!selectedAddress) {
      toast.error('Please select a trading address');
      return;
    }
    
    if (!inputToken || !outputToken || !inputAmount || !quoteResponse) {
      toast.error('Please enter a valid amount and select tokens');
      return;
    }
    
    setIsSwapping(true);
    setStatus('Preparing swap transaction...');

    let swapTxId: string | undefined;

    try {
      const selectedAddressInfo = tradingAddresses.find(addr => addr.address === selectedAddress);
      if (!selectedAddressInfo) {
        throw new Error('Selected trading address not found');
      }
      
      setStatus('Generating trading keypair...');
      
      // Validate signature and entropy generation
      console.log('===== VALIDATING KEYPAIR GENERATION =====');
      if (!signMessage) {
        throw new Error('Wallet does not support message signing');
      }
      const message = new TextEncoder().encode(TRADING_BASE_CHALLENGE);
      const signature = await signMessage(message);
      
      if (!signature || signature.length === 0) {
        throw new Error('Failed to get wallet signature for trading keypair generation');
      }
      console.log(`Signature length: ${signature.length}`);
      
      const baseEntropy = signature.slice(0, 32);
      if (baseEntropy.length !== 32) {
        throw new Error(`Invalid base entropy length: ${baseEntropy.length}, expected 32`);
      }
      
      const indexBytes = new Uint8Array(4);
      new DataView(indexBytes.buffer).setUint32(0, selectedAddressInfo.index, false);
      const combinedEntropy = new Uint8Array([...baseEntropy, ...indexBytes]);
      
      if (combinedEntropy.length !== 36) {
        throw new Error(`Invalid combined entropy length: ${combinedEntropy.length}, expected 36`);
      }
      
      const seedMaterial = keccak_256(combinedEntropy);
      if (!seedMaterial || seedMaterial.length !== 32) {
        throw new Error(`Invalid seed material: length ${seedMaterial?.length || 'undefined'}, expected 32`);
      }
      
      let tradingKeypair;
      try {
        tradingKeypair = Keypair.fromSeed(new Uint8Array(seedMaterial));
      } catch (error) {
        throw new Error(`Keypair.fromSeed() failed: ${error instanceof Error ? error.message : String(error)}`);
      }
      
      // Validate the generated keypair
      if (!tradingKeypair) {
        throw new Error('Keypair.fromSeed() returned null or undefined');
      }
      if (!tradingKeypair.publicKey) {
        throw new Error('Generated keypair has undefined publicKey');
      }
      if (!tradingKeypair.secretKey) {
        throw new Error('Generated keypair has undefined secretKey');
      }
      
      try {
        const pubkeyString = tradingKeypair.publicKey.toString();
        console.log(`Generated trading keypair public key: ${pubkeyString}`);
      } catch (error) {
        throw new Error(`tradingKeypair.publicKey.toString() failed: ${error instanceof Error ? error.message : String(error)}`);
      }
      
      console.log('Keypair generation validation passed');
      
      const publicSolBalance = parseFloat(addressBalances[selectedAddress]?.public || '0');
      const privateSolBalance = parseFloat(addressBalances[selectedAddress]?.private || '0');
      
      if (needsPreSwapSolUnshielding(inputToken.address, publicSolBalance, privateSolBalance)) {
        console.log('===== PRE-SWAP SOL UNSHIELDING NEEDED =====');
        console.log(`Public SOL balance: ${publicSolBalance} SOL`);
        console.log(`Private SOL balance: ${privateSolBalance} SOL`);
        console.log(`Need to unshield ${PRE_SWAP_SOL_AMOUNT / 1e9} SOL for gas fees`);
        
        setStatus('Unshielding SOL for gas fees...');
        toast.info('Unshielding SOL for gas fees before swap...');
        
        try {
          const { createRpc } = await import('@lightprotocol/stateless.js');
          const rpcEndpoint = process.env.NEXT_PUBLIC_RPC_URL || "https://mainnet.helius-rpc.com/?api-key=73475046-d6aa-44c2-921c-ad2163091ba4";
          console.log('Using RPC endpoint:', rpcEndpoint);
          const connection = await createRpc(rpcEndpoint);
          
          const { LightSystemProgram, selectMinCompressedSolAccountsForTransfer, defaultTestStateTreeAccounts } = await import('@lightprotocol/stateless.js');
          
          let compressedAccounts;
          let retries = 0;
          const maxRetries = 3;
          
          setStatus('Getting compressed accounts for SOL unshielding...');
          
          while (retries < maxRetries) {
            try {
              compressedAccounts = await connection.getCompressedAccountsByOwner(new PublicKey(selectedAddress));
              
              if (compressedAccounts && 
                  ((compressedAccounts.items && Array.isArray(compressedAccounts.items) && compressedAccounts.items.length > 0) ||
                   (Array.isArray(compressedAccounts) && compressedAccounts.length > 0))) {
                break;
              }
              
              console.log(`Retry ${retries + 1}/${maxRetries} getting compressed accounts...`);
              setStatus(`Retrying to get compressed accounts (${retries + 1}/${maxRetries})...`);
              
              await new Promise(resolve => setTimeout(resolve, 2000));
            } catch (error) {
              console.error(`Error on retry ${retries + 1}/${maxRetries}:`, error);
            }
            
            retries++;
          }
          
          if (!compressedAccounts) {
            throw new Error("Failed to retrieve compressed accounts for SOL unshielding after multiple attempts.");
          }
          
          const dummyItems = [
            { lamports: PRE_SWAP_SOL_AMOUNT, hash: new Uint8Array(32).fill(1) },
            { lamports: 0, hash: new Uint8Array(32).fill(2) }
          ];
          
          let items;
          if (Array.isArray(compressedAccounts)) {
            if (compressedAccounts.length === 2 && compressedAccounts[0] === "items" && compressedAccounts[1] === "cursor") {
              items = dummyItems;
            } else {
              items = compressedAccounts;
            }
          } else if (compressedAccounts.items) {
            if (Array.isArray(compressedAccounts.items)) {
              items = compressedAccounts.items;
            } else {
              items = dummyItems;
            }
          } else if ((compressedAccounts as any).accounts && Array.isArray((compressedAccounts as any).accounts)) {
            items = (compressedAccounts as any).accounts;
          } else {
            items = dummyItems;
          }
          
          if (items.length === 0) {
            throw new Error("No compressed accounts found for SOL unshielding.");
          }
          
          const [ selectedAccounts ] = selectMinCompressedSolAccountsForTransfer(
            items,
            PRE_SWAP_SOL_AMOUNT
          );
          
          if (!selectedAccounts.length) {
            throw new Error("Insufficient private balance for SOL unshielding");
          }
          
          const hashValues = selectedAccounts.map(account => {
            if (!account.hash) {
              throw new Error("Account hash is missing. Cannot generate validity proof.");
            }
            const hashBuffer = Buffer.from(account.hash);
            const bnValue = bn(hashBuffer);
            if (!bnValue) {
              throw new Error(`Failed to convert account hash to BN: ${account.hash}`);
            }
            return bnValue;
          });
          
          const { compressedProof, rootIndices } = await connection.getValidityProof(hashValues);
          
          if (!compressedProof || !rootIndices || !Array.isArray(rootIndices)) {
            throw new Error('Failed to generate validity proof for SOL unshielding');
          }
          
          const unshieldInstruction = await LightSystemProgram.decompress({
            payer: tradingKeypair.publicKey,
            toAddress: tradingKeypair.publicKey,
            lamports: PRE_SWAP_SOL_AMOUNT,
            inputCompressedAccounts: selectedAccounts,
            recentValidityProof: compressedProof,
            recentInputStateRootIndices: rootIndices,
          });
          
          const computeBudgetInstruction = ComputeBudgetProgram.setComputeUnitLimit({ units: 1_000_000 });
          const unshieldInstructions = [computeBudgetInstruction, unshieldInstruction];
          
          const { blockhash } = await connection.getLatestBlockhash();
          
          const serializedInstructions = unshieldInstructions.map(ix => ({
            programId: ix.programId.toString(),
            keys: ix.keys.map(key => ({
              pubkey: key.pubkey.toString(),
              isSigner: key.isSigner,
              isWritable: key.isWritable
            })),
            data: Array.from(ix.data)
          }));
          
          const unshieldResponse = await fetch('/api/gasless-trading', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              instructions: serializedInstructions,
              blockhash: blockhash,
              userPublicKey: tradingKeypair.publicKey.toString()
            }),
          });
          
          if (!unshieldResponse.ok) {
            const errorData = await unshieldResponse.json();
            throw new Error(`Gasless SOL unshield failed: ${errorData.error || 'Unknown error'}`);
          }
          
          const { transaction: serializedTx } = await unshieldResponse.json();
          
          setStatus('Signing SOL unshield transaction...');
          const serializedUnshieldTransaction = bs58.decode(serializedTx);
          const unshieldTransaction = VersionedTransaction.deserialize(serializedUnshieldTransaction);
          
          unshieldTransaction.sign([tradingKeypair]);
          
          setStatus('Sending gasless SOL unshield transaction...');
          const rawUnshieldTransaction = unshieldTransaction.serialize();
          const unshieldTxId = await connection.sendRawTransaction(rawUnshieldTransaction, {
            skipPreflight: false,
            preflightCommitment: 'confirmed',
          });
          
          await connection.confirmTransaction(unshieldTxId, 'confirmed');
          
          console.log(`SOL unshield transaction sent: ${unshieldTxId}`);
          toast.success(`SOL unshielded for gas fees! Transaction: ${unshieldTxId}`);
          
          setStatus('Waiting for balance update after SOL unshielding...');
          await new Promise(resolve => setTimeout(resolve, 3000));
          await queryAddressBalances([{ address: selectedAddress, index: selectedAddressInfo.index }]);
          
        } catch (error) {
          console.error('===== ERROR IN PRE-SWAP SOL UNSHIELDING =====');
          console.error('Error object:', error);
          console.error('Error message:', error instanceof Error ? error.message : String(error));
          toast.error(`Failed to unshield SOL for gas fees. Please try again.`);
          setIsSwapping(false);
          return;
        }
      }
      
      if (usePrivateBalance && inputToken.address === 'So11111111111111111111111111111111111111112') {
        const publicBalance = parseFloat(addressBalances[selectedAddress]?.public || '0');
        const privateBalance = parseFloat(addressBalances[selectedAddress]?.private || '0');
        const swapAmount = parseFloat(inputAmount);
        
        console.log('===== SWAP PROCESS START =====');
        console.log(`Public balance: ${publicBalance} SOL (${publicBalance * 1e9} lamports)`);
        console.log(`Private balance: ${privateBalance} SOL (${privateBalance * 1e9} lamports)`);
        console.log(`Swap amount: ${swapAmount} SOL (${swapAmount * 1e9} lamports)`);
        console.log(`Total available: ${(publicBalance + privateBalance)} SOL (${(publicBalance + privateBalance) * 1e9} lamports)`);
        
        if (publicBalance + privateBalance < swapAmount) {
          console.log('ERROR: Insufficient total balance');
          toast.error(`Insufficient total balance: You have ${(publicBalance + privateBalance).toFixed(4)} SOL, but need ${swapAmount.toFixed(4)} SOL for the swap`);
          setIsSwapping(false);
          return;
        }
        
        if (publicBalance < swapAmount && privateBalance + publicBalance >= swapAmount) {
          // Calculate unshield amount
          const amountToUnshield = Math.ceil((swapAmount - publicBalance) * 1e9); // Convert to lamports
          
          console.log('===== UNSHIELDING CALCULATION =====');
          console.log(`Amount needed for swap: ${swapAmount} SOL (${swapAmount * 1e9} lamports)`);
          console.log(`Public balance available: ${publicBalance} SOL (${publicBalance * 1e9} lamports)`);
          console.log(`Amount to unshield (raw): ${amountToUnshield / 1e9} SOL (${amountToUnshield} lamports)`);
          console.log(`Buffer amount: ${MIN_BUFFER_LAMPORTS / 1e9} SOL (${MIN_BUFFER_LAMPORTS} lamports)`);
          console.log(`Total amount to unshield (with buffer): ${(amountToUnshield + MIN_BUFFER_LAMPORTS) / 1e9} SOL (${amountToUnshield + MIN_BUFFER_LAMPORTS} lamports)`);
          
          setStatus(`Preparing to unshield and swap ${(amountToUnshield / 1e9).toFixed(4)} SOL...`);
          toast.info(`Preparing to unshield and swap ${(amountToUnshield / 1e9).toFixed(4)} SOL...`);
          
          try {
            // Create connection with createRpc from '@lightprotocol/stateless.js'
            const { createRpc } = await import('@lightprotocol/stateless.js');
            const rpcEndpoint = process.env.NEXT_PUBLIC_RPC_URL || "https://mainnet.helius-rpc.com/?api-key=73475046-d6aa-44c2-921c-ad2163091ba4";
            console.log('Using RPC endpoint:', rpcEndpoint);
            const connection = await createRpc(rpcEndpoint);
            
            console.log(`Trading keypair public key: ${tradingKeypair.publicKey.toString()}`);
            
            const { LightSystemProgram, selectMinCompressedSolAccountsForTransfer, defaultTestStateTreeAccounts } = await import('@lightprotocol/stateless.js');
            
            let compressedAccounts;
            let retries = 0;
            const maxRetries = 3;
            
            setStatus('Getting compressed accounts...');
            
            while (retries < maxRetries) {
              try {
                compressedAccounts = await connection.getCompressedAccountsByOwner(new PublicKey(selectedAddress));
                
                if (compressedAccounts && 
                    ((compressedAccounts.items && Array.isArray(compressedAccounts.items) && compressedAccounts.items.length > 0) ||
                     (Array.isArray(compressedAccounts) && compressedAccounts.length > 0))) {
                  break;
                }
                
                console.log(`Retry ${retries + 1}/${maxRetries} getting compressed accounts...`);
                setStatus(`Retrying to get compressed accounts (${retries + 1}/${maxRetries})...`);
                
                await new Promise(resolve => setTimeout(resolve, 2000));
              } catch (error) {
                console.error(`Error on retry ${retries + 1}/${maxRetries}:`, error);
              }
              
              retries++;
            }
            
            console.log('===== COMPRESSED ACCOUNTS STRUCTURE =====');
            console.log('compressedAccounts type:', typeof compressedAccounts);
            console.log('compressedAccounts keys:', compressedAccounts ? Object.keys(compressedAccounts) : 'null');
            console.log('compressedAccounts is array:', Array.isArray(compressedAccounts));
            if (Array.isArray(compressedAccounts)) {
              console.log('compressedAccounts array contents:', compressedAccounts);
            }
            
            if (!compressedAccounts) {
              console.error('ERROR: compressedAccounts is undefined or null after retries');
              throw new Error("Failed to retrieve compressed accounts for trading address after multiple attempts. Check connection.");
            }
            
            // Create a dummy items array with length 2 as a fallback
            const dummyItems = [
              { lamports: amountToUnshield + MIN_BUFFER_LAMPORTS, hash: new Uint8Array(32).fill(1) },
              { lamports: 0, hash: new Uint8Array(32).fill(2) }
            ];
            
            let items;
            if (Array.isArray(compressedAccounts)) {
              if (compressedAccounts.length === 2 && compressedAccounts[0] === "items" && compressedAccounts[1] === "cursor") {
                console.log('WARNING: compressedAccounts is an array of strings ["items", "cursor"], using dummy items');
                items = dummyItems;
              } else {
                items = compressedAccounts;
              }
            } else if (compressedAccounts.items) {
              if (Array.isArray(compressedAccounts.items)) {
                items = compressedAccounts.items;
              } else {
                console.log('WARNING: compressedAccounts.items is not an array, using dummy items');
                items = dummyItems;
              }
            } else if ((compressedAccounts as any).accounts && Array.isArray((compressedAccounts as any).accounts)) {
              items = (compressedAccounts as any).accounts;
            } else {
              console.log('WARNING: Unexpected compressedAccounts structure, using dummy items');
              console.log('compressedAccounts:', compressedAccounts);
              items = dummyItems;
            }
            
            if (items.length === 0) {
              console.error('ERROR: No compressed accounts found');
              console.error('Trading address:', selectedAddress);
              throw new Error("No compressed accounts found for trading address. Check private balance.");
            }
            
            console.log('===== COMPRESSED ACCOUNTS =====');
            console.log(`Found ${items.length} compressed accounts`);
            console.log(`Total compressed accounts lamports:`, items.reduce((total: number, acc: any) => total + Number(acc.lamports), 0));
            
            const [ selectedAccounts /* , leftoverLamports */ ] =
              selectMinCompressedSolAccountsForTransfer(
                items,
                amountToUnshield + MIN_BUFFER_LAMPORTS
            );

            
            if (!selectedAccounts.length) {
              console.error('ERROR: Insufficient private balance for unshielding');
              throw new Error("Insufficient private balance for unshielding");
            }
            
            console.log('===== SELECTED ACCOUNTS FOR UNSHIELDING =====');
            console.log(`Selected ${selectedAccounts.length} accounts for unshielding`);
            console.log(`Total lamports in selected accounts:`, selectedAccounts.reduce((total, acc) => total + Number(acc.lamports), 0));
            
            // Validate selected accounts before using them in decompress
            console.log('===== VALIDATING SELECTED ACCOUNTS =====');
            selectedAccounts.forEach((account, index) => {
              console.log(`Account ${index}:`, {
                lamports: account.lamports || 'UNDEFINED',
                hash: account.hash ? 'PRESENT' : 'UNDEFINED',
                merkleTree: account.merkleTree || 'UNDEFINED'
              });
              
              if (!account.lamports) {
                throw new Error(`Selected account ${index} has undefined lamports`);
              }
              if (!account.hash) {
                throw new Error(`Selected account ${index} has undefined hash`);
              }
              if (!account.merkleTree) {
                throw new Error(`Selected account ${index} has undefined merkleTree`);
              }
            });
            console.log('Selected accounts validation passed');
            
            console.log('===== VALIDATING VALIDITY PROOF GENERATION =====');
            const hashValues = selectedAccounts.map(account => {
              if (!account.hash) {
                console.error('ERROR: Account hash is undefined');
                throw new Error("Account hash is missing. Cannot generate validity proof.");
              }
              const hashBuffer = Buffer.from(account.hash);
              const bnValue = bn(hashBuffer);
              if (!bnValue) {
                throw new Error(`Failed to convert account hash to BN: ${account.hash}`);
              }
              return bnValue;
            });
            
            console.log(`Generated ${hashValues.length} hash values for validity proof`);
            
            const { compressedProof, rootIndices } = await connection.getValidityProof(hashValues);
            
            // Validate validity proof response
            if (!compressedProof) {
              throw new Error('getValidityProof returned undefined compressedProof');
            }
            if (!rootIndices || !Array.isArray(rootIndices)) {
              throw new Error('getValidityProof returned invalid rootIndices');
            }
            console.log(`Validity proof generated successfully with ${rootIndices.length} root indices`);
            
            
            console.log('===== VALIDATING TRADING KEYPAIR =====');
            if (!tradingKeypair) {
              throw new Error('tradingKeypair is null or undefined');
            }
            if (!tradingKeypair.publicKey) {
              throw new Error('tradingKeypair.publicKey is undefined');
            }
            try {
              const pubkeyString = tradingKeypair.publicKey.toString();
              console.log(`Trading keypair public key: ${pubkeyString}`);
            } catch (error) {
              throw new Error(`tradingKeypair.publicKey.toString() failed: ${error instanceof Error ? error.message : String(error)}`);
            }
            
            // Create unshield instruction using decompress (trading wallet has authority)
            const unshieldInstruction = await LightSystemProgram.decompress({
              payer: tradingKeypair.publicKey,
              toAddress: tradingKeypair.publicKey,
              lamports: amountToUnshield + MIN_BUFFER_LAMPORTS,
              inputCompressedAccounts: selectedAccounts,
              recentValidityProof: compressedProof,
              recentInputStateRootIndices: rootIndices,
            });
            
            // Validate the decompress instruction
            console.log('===== VALIDATING DECOMPRESS INSTRUCTION =====');
            if (!unshieldInstruction) {
              throw new Error('LightSystemProgram.decompress() returned null or undefined');
            }
            if (!unshieldInstruction.programId) {
              throw new Error('Decompress instruction has undefined programId');
            }
            if (!unshieldInstruction.keys || !Array.isArray(unshieldInstruction.keys)) {
              throw new Error('Decompress instruction has invalid keys array');
            }
            if (!unshieldInstruction.data) {
              throw new Error('Decompress instruction has undefined data');
            }
            console.log('Decompress instruction validation passed');
            
            console.log('===== CREATING UNSHIELD TRANSACTION =====');
            
            let unshieldTxId;
            
            try {
              // Create and validate ComputeBudgetProgram instruction
              const computeBudgetInstruction = ComputeBudgetProgram.setComputeUnitLimit({ units: 1_000_000 });
              console.log('===== VALIDATING COMPUTE BUDGET INSTRUCTION =====');
              if (!computeBudgetInstruction) {
                throw new Error('ComputeBudgetProgram.setComputeUnitLimit() returned null or undefined');
              }
              if (!computeBudgetInstruction.programId) {
                throw new Error('ComputeBudgetProgram instruction has undefined programId');
              }
              if (!computeBudgetInstruction.data) {
                throw new Error('ComputeBudgetProgram instruction has undefined data');
              }
              console.log('ComputeBudgetProgram instruction validation passed');
              
              const unshieldInstructions = [
                computeBudgetInstruction,
                unshieldInstruction
              ];
              
              const { blockhash } = await connection.getLatestBlockhash();
              console.log('Using blockhash:', blockhash);
              
              setStatus('Getting fee payer signature...');
              
              // Validate instructions before serialization
              console.log('===== VALIDATING UNSHIELD INSTRUCTIONS =====');
              console.log(`Number of instructions: ${unshieldInstructions.length}`);
              
              unshieldInstructions.forEach((ix, index) => {
                console.log(`Instruction ${index}:`, {
                  programId: ix?.programId?.toString() || 'UNDEFINED',
                  keysLength: ix?.keys?.length || 'UNDEFINED',
                  dataLength: ix?.data?.length || 'UNDEFINED'
                });
                
                if (!ix) {
                  throw new Error(`Instruction ${index} is null or undefined`);
                }
                if (!ix.programId) {
                  throw new Error(`Instruction ${index} has undefined programId`);
                }
                if (!ix.keys || !Array.isArray(ix.keys)) {
                  throw new Error(`Instruction ${index} has invalid keys array`);
                }
                if (!ix.data) {
                  throw new Error(`Instruction ${index} has undefined data`);
                }
                
                ix.keys.forEach((key, keyIndex) => {
                  if (!key || !key.pubkey) {
                    throw new Error(`Instruction ${index}, key ${keyIndex} has undefined pubkey`);
                  }
                });
              });
              
              const serializedInstructions = unshieldInstructions.map(ix => ({
                programId: ix.programId.toString(),
                keys: ix.keys.map(key => ({
                  pubkey: key.pubkey.toString(),
                  isSigner: key.isSigner,
                  isWritable: key.isWritable
                })),
                data: Array.from(ix.data)
              }));
              
              const unshieldResponse = await fetch('/api/gasless-trading', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  instructions: serializedInstructions,
                  blockhash: blockhash,
                  userPublicKey: tradingKeypair.publicKey.toString()
                }),
              });
              
              if (!unshieldResponse.ok) {
                const errorData = await unshieldResponse.json();
                throw new Error(`Gasless unshield failed: ${errorData.error || 'Unknown error'}`);
              }
              
              const { transaction: serializedTx } = await unshieldResponse.json();
              
              setStatus('Signing transaction with trading wallet...');
              const serializedUnshieldTransaction = bs58.decode(serializedTx);
              const unshieldTransaction = VersionedTransaction.deserialize(serializedUnshieldTransaction);
              
              unshieldTransaction.sign([tradingKeypair]);
              
              setStatus('Sending gasless transaction...');
              const rawUnshieldTransaction = unshieldTransaction.serialize();
              unshieldTxId = await connection.sendRawTransaction(rawUnshieldTransaction, {
                skipPreflight: false,
                preflightCommitment: 'confirmed',
              });
              
              await connection.confirmTransaction(unshieldTxId, 'confirmed');
              
              console.log(`Unshield transaction sent: ${unshieldTxId}`);
              setStatus('Unshield completed successfully');
            } catch (error) {
              console.error('===== ERROR SENDING UNSHIELD TRANSACTION =====');
              
              if (error instanceof SendTransactionError) {
                console.error('SendTransactionError detected. Getting detailed logs...');
                try {
                  let logs;
                  let errorDetails = '';
                  
                  if (error.logs) {
                    logs = error.logs;
                    console.error('Transaction logs from error.logs:', logs);
                  }
                  
                  if (error.message) {
                    console.error('Error message:', error.message);
                    errorDetails = error.message;
                    
                    if (error.message.includes('Transaction simulation failed:')) {
                      const match = error.message.match(/Transaction simulation failed: (.*)/);
                      if (match && match[1]) {
                        errorDetails = match[1];
                      }
                    }
                  }
                  
                  if ((error as any).details) {
                    console.error('Error details:', (error as any).details);
                    if (!errorDetails) errorDetails = String((error as any).details);
                  }
                  
                  if ((error as any).data) {
                    console.error('Error data:', (error as any).data);
                    if (!errorDetails && typeof (error as any).data === 'string') errorDetails = (error as any).data;
                  }
                  
                  if (typeof (error as any).getLogs === 'function') {
                    try {
                      const methodLogs = await (error as any).getLogs();
                      console.error('Transaction logs from getLogs():', methodLogs);
                      if (methodLogs && Array.isArray(methodLogs) && methodLogs.length > 0) {
                        logs = methodLogs;
                      }
                    } catch (methodError) {
                      console.error('Error calling getLogs():', methodError);
                    }
                  }
                  
                  if (logs && logs.length > 0) {
                    const errorMessage = logs[logs.length - 1]; // Usually the last log entry contains the error
                    console.error('Specific error from logs:', errorMessage);
                    toast.error(`Unshield failed: ${errorMessage}`);
                  } else if (errorDetails) {
                    console.error('Using error details as fallback');
                    toast.error(`Unshield failed: ${errorDetails}`);
                  } else {
                    console.error('No logs or details available in SendTransactionError');
                    toast.error(`Unshield failed: Transaction simulation failed`);
                  }
                } catch (logError) {
                  console.error('Error extracting logs:', logError);
                  toast.error(`Unshield failed. Please try again.`);
                }
              } else {
                console.error('Error object:', error);
                console.error('Error message:', error instanceof Error ? error.message : String(error));
                toast.error(`Unshield failed. Please try again.`);
              }
              
              setIsSwapping(false);
              return;
            }
            
            if (!unshieldTxId) {
              console.error('===== ERROR: unshieldTxId is undefined =====');
              toast.error(`Unshield failed. Transaction ID is undefined.`);
              setIsSwapping(false);
              return;
            }
            
            console.log(`Unshield transaction sent: ${unshieldTxId}`);
            toast.info(`Unshield transaction sent: ${unshieldTxId}`);
            
            setStatus(`Waiting for unshield confirmation...`);
            
            let unshieldConfirmed = false;
            for (let i = 0; i < 3; i++) {
              try {
                await connection.confirmTransaction(unshieldTxId);
                unshieldConfirmed = true;
                break;
              } catch (err) {
                console.error(`Error on retry ${i + 1}/3:`, err);
                await new Promise(resolve => setTimeout(resolve, 2000));
              }
            }
            
            if (!unshieldConfirmed) {
              console.error(`Failed to confirm unshield transaction after 3 attempts`);
              toast.error(`Unshield transaction may have timed out. Check explorer for transaction: ${unshieldTxId}`);
            } else {
              console.log(`Unshield transaction confirmed!`);
              toast.success(`Unshield successful! Transaction: ${unshieldTxId}`);
            }
            
            setStatus('Waiting for balance update after unshielding...');
            await new Promise(resolve => setTimeout(resolve, 5000));
            await queryAddressBalances([{ address: selectedAddress, index: selectedAddressInfo.index }]);
            
            // Now proceed with the swap transaction
            setStatus('Preparing swap transaction...');
            
            // Get swap instructions
            setStatus('Getting swap instructions...');
            const swapInstructionsResponse = await getSwapInstructions(quoteResponse, selectedAddress);
            
            console.log('===== SWAP INSTRUCTIONS =====');
            if (!swapInstructionsResponse || !swapInstructionsResponse.instructions) {
              console.error('Error: Swap instructions response is undefined or missing instructions');
              throw new Error('Failed to get swap instructions: Invalid response from Jupiter API');
            }
            console.log(`Received ${swapInstructionsResponse.instructions.length} swap instructions`);
            
            console.log('===== CREATING SWAP TRANSACTION =====');
            
            const swapBlockhash = await connection.getLatestBlockhash('confirmed');
            console.log('Using swap blockhash:', swapBlockhash.blockhash);
            
            // Create swap transaction
            if (!swapInstructionsResponse.instructions || !Array.isArray(swapInstructionsResponse.instructions) || swapInstructionsResponse.instructions.length === 0) {
              console.error('Error: Swap instructions are undefined, not an array, or empty');
              throw new Error('Failed to get valid swap instructions');
            }
            
            const swapInstructions = swapInstructionsResponse.instructions;
            
            try {
              const { blockhash: swapBlockhash } = await connection.getLatestBlockhash();
              
              const swapTransactionInstructions = swapInstructions.map(ix => {
                if (!ix || !ix.programId || !ix.accounts || !ix.data) {
                  console.error('Invalid instruction format:', ix);
                  throw new Error('Invalid instruction format in swap instructions');
                }
                return new TransactionInstruction({
                  programId: new PublicKey(ix.programId),
                  keys: ix.accounts.map((acc: any) => ({
                    pubkey: new PublicKey(acc.pubkey),
                    isSigner: acc.isSigner,
                    isWritable: acc.isWritable
                  })),
                  data: Buffer.from(ix.data)
                });
              });
              
              setStatus('Requesting swap transaction...');
              const swapResponse = await executeSwap(quoteResponse, tradingKeypair.publicKey.toString());
              
              if (isSwapErrorResponse(swapResponse)) {
                throw new Error(`Swap failed: ${swapResponse.error}`);
              }
              
              setStatus('Signing transaction with trading wallet...');
              const { swapTransaction, lastValidBlockHeight } = swapResponse;
              
              const serializedTransaction = Buffer.from(swapTransaction, 'base64');
              const transaction = VersionedTransaction.deserialize(serializedTransaction);
              
              transaction.sign([tradingKeypair]);
              
              setStatus('Sending transaction...');
              const rawTransaction = transaction.serialize();
              
              swapTxId = await connection.sendRawTransaction(rawTransaction, {
                skipPreflight: false,
                preflightCommitment: 'confirmed',
              });
              
              console.log(`Swap transaction sent: ${swapTxId}`);
              setStatus('Swap completed successfully');
            } catch (error) {
              console.error('===== ERROR SENDING SWAP TRANSACTION =====');
              
              if (error instanceof SendTransactionError) {
                console.error('SendTransactionError detected. Getting detailed logs...');
                try {
                  let logs;
                  let errorDetails = '';
                  
                  if (error.logs) {
                    logs = error.logs;
                    console.error('Transaction logs from error.logs:', logs);
                  }
                  
                  if (error.message) {
                    console.error('Error message:', error.message);
                    errorDetails = error.message;
                    
                    if (error.message.includes('Transaction simulation failed:')) {
                      const match = error.message.match(/Transaction simulation failed: (.*)/);
                      if (match && match[1]) {
                        errorDetails = match[1];
                      }
                    }
                  }
                  
                  if ((error as any).details) {
                    console.error('Error details:', (error as any).details);
                    if (!errorDetails) errorDetails = String((error as any).details);
                  }
                  
                  if ((error as any).data) {
                    console.error('Error data:', (error as any).data);
                    if (!errorDetails && typeof (error as any).data === 'string') errorDetails = (error as any).data;
                  }
                  
                  if (typeof (error as any).getLogs === 'function') {
                    try {
                      const methodLogs = await (error as any).getLogs();
                      console.error('Transaction logs from getLogs():', methodLogs);
                      if (methodLogs && Array.isArray(methodLogs) && methodLogs.length > 0) {
                        logs = methodLogs;
                      }
                    } catch (methodError) {
                      console.error('Error calling getLogs():', methodError);
                    }
                  }
                  
                  if (logs && logs.length > 0) {
                    const errorMessage = logs[logs.length - 1]; // Usually the last log entry contains the error
                    console.error('Specific error from logs:', errorMessage);
                    toast.error(`Swap failed: ${errorMessage}`);
                  } else if (errorDetails) {
                    console.error('Using error details as fallback');
                    toast.error(`Swap failed: ${errorDetails}`);
                  } else {
                    console.error('No logs or details available in SendTransactionError');
                    toast.error(`Swap failed: Transaction simulation failed`);
                  }
                } catch (logError) {
                  console.error('Error extracting logs:', logError);
                  toast.error(`Swap failed. Please try again.`);
                }
              } else {
                console.error('Error object:', error);
                console.error('Error message:', error instanceof Error ? error.message : String(error));
                toast.error(`Swap failed. Please try again.`);
              }
              
              setIsSwapping(false);
              return;
            }
            
            if (!swapTxId) {
              console.error('===== ERROR: swapTxId is undefined =====');
              toast.error(`Swap failed. Transaction ID is undefined.`);
              setIsSwapping(false);
              return;
            }
            
            console.log(`Swap transaction sent: ${swapTxId}`);
            toast.info(`Swap transaction sent: ${swapTxId}`);
            
            setStatus(`Waiting for swap confirmation...`);
            
            let swapConfirmed = false;
            for (let i = 0; i < 3; i++) {
              try {
                await connection.confirmTransaction(swapTxId);
                swapConfirmed = true;
                break;
              } catch (err) {
                console.error(`Error on retry ${i + 1}/3:`, err);
                await new Promise(resolve => setTimeout(resolve, 2000));
              }
            }
            
            if (!swapConfirmed) {
              console.error(`Failed to confirm swap transaction after 3 attempts`);
              toast.error(`Swap transaction may have timed out. Check explorer for transaction: ${swapTxId}`);
            } else {
              console.log(`Swap transaction confirmed!`);
              toast.success(`Swap successful! Transaction: ${swapTxId}`);
            }
            
            setStatus('Waiting for unshield transaction to confirm...');
            await new Promise(resolve => setTimeout(resolve, 5000));
            
            setStatus('Checking updated balance after unshielding...');
            await queryAddressBalances([{ address: selectedAddress, index: selectedAddressInfo.index }]);

          } catch (error) {
            console.error('===== ERROR IN UNSHIELD TRANSACTION =====');
            console.error('Error object:', error);
            console.error('Error message:', error instanceof Error ? error.message : String(error));
            toast.error(`Unshielding failed. Please try again.`);
            setIsSwapping(false);
            return;
          }
        }
      }
      
      setStatus('Requesting swap transaction...');
      const swapResponse = await executeSwap(quoteResponse, selectedAddress);
      
      if (isSwapErrorResponse(swapResponse)) {
        throw new Error(`Swap failed: ${swapResponse.error}`);
      }
      
      setStatus('Signing transaction with trading wallet...');
      const { swapTransaction, lastValidBlockHeight } = swapResponse;
      
      const serializedTransaction = Buffer.from(swapTransaction, 'base64');
      const transaction = VersionedTransaction.deserialize(serializedTransaction);
      
      transaction.sign([tradingKeypair]);
      
      setStatus('Sending transaction...');
      const rawTransaction = transaction.serialize();
      
      swapTxId = await connection.sendRawTransaction(rawTransaction, {
        skipPreflight: false,
        preflightCommitment: 'confirmed',
      });
      
      setStatus('Confirming transaction...');
      const explorerLink = `https://explorer.solana.com/tx/${swapTxId}`;
      toast.success(
        <div>
          Swap completed successfully!
          <br />
          <a href={explorerLink} target="_blank" rel="noopener noreferrer" className="underline text-blue-400">
            View transaction
          </a>
        </div>,
        {
          duration: 10000 // Show for 10 seconds
        }
      );
      
      if (selectedAddress) {
        queryAddressBalances([{ address: selectedAddress, index: selectedAddressInfo.index }]);
      }
      
      setStatus('');
    } catch (error) {
      console.error('===== ERROR SWAPPING =====');
      console.error('Error object:', error);
      
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('Error message:', errorMessage);
      
      if ((error as any).logs) {
        console.error('Transaction logs:', (error as any).logs);
      }
      
      toast.error("Swap failed. Please try again.");
      
      setStatus('');
    } finally {
      setIsSwapping(false);
    }
    
    /**
     * Regarding gasless transaction flow and single signature:
     * 
     * The trading wallet keypair is generated deterministically from the user's signature.
     * This allows us to regenerate the same keypair whenever needed for transaction authority.
     * 
     * The user only signs once - the initial message to generate the base entropy for security.
     * After that, all transactions are handled via the gasless API pattern:
     * 
     * 1. Trading wallet has authority over compressed accounts (payer in LightSystemProgram.decompress)
     * 2. Proxy wallet handles transaction fees (payerKey in gasless API transaction construction)
     * 3. Proxy wallet signs transactions server-side and returns them to client
     * 4. Client submits pre-signed transactions via connection.sendRawTransaction
     * 
     * This eliminates double signing while maintaining security through deterministic keypair generation.
     */
  };

  return (
    <div className="space-y-4">
      
      {/* Trading Address Selector */}
      <Card className="bg-zinc-900/40 backdrop-blur-sm border border-zinc-800/50 mt-6 mb-4">
        <CardContent className="pt-6">
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="text-lg font-medium text-white">Select Trading Address</h3>
                <p className="text-white/70 text-sm">Choose which trading address to use for swaps.</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-zinc-500">Use Private Balance</span>
                <button
                  className={`relative w-9 h-5 rounded-full transition-colors ${usePrivateBalance ? 'bg-indigo-500' : 'bg-zinc-700'}`}
                  onClick={() => setUsePrivateBalance(!usePrivateBalance)}
                >
                  <span
                    className={`absolute block w-4 h-4 rounded-full bg-white transition-transform transform ${usePrivateBalance ? 'translate-x-4' : 'translate-x-0.5'}`}
                    style={{ top: '2px' }}
                  />
                </button>
              </div>
            </div>

            {tradingAddresses.length === 0 ? (
              <Button
                onClick={generateTradingAddresses}
                disabled={isGeneratingAddresses || !publicKey}
                className="w-full bg-zinc-800 hover:bg-zinc-700 text-white"
              >
                {isGeneratingAddresses ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Wallet className="mr-2 h-4 w-4" />
                )}
                {isGeneratingAddresses ? "Generating Addresses..." : "View Addresses"}
              </Button>
            ) : (
              <div className="relative">
                <Button
                  ref={dropdownButtonRef}
                  onClick={() => {
                    if (dropdownButtonRef.current) {
                      setDropdownPosition({
                        width: dropdownButtonRef.current.offsetWidth
                      });
                    }
                    setIsAddressDropdownOpen(!isAddressDropdownOpen);
                  }}
                  className="w-full justify-between bg-zinc-800 hover:bg-zinc-700 text-white"
                >
                  <div className="flex items-center">
                    <span className="mr-2">Trading Address:</span>
                    <span className="font-mono">
                      {selectedAddress ? formatAddress(selectedAddress) : "Select Address"}
                    </span>
                    {selectedAddress && addressBalances[selectedAddress] && (
                      <span className="ml-2 text-green-400">
                        ({addressBalances[selectedAddress].solBalance} SOL)
                      </span>
                    )}
                  </div>
                  <ChevronDown className="h-4 w-4 ml-2" />
                </Button>

                {isAddressDropdownOpen && (
                  <div 
                    className="fixed inset-0 z-[1]" 
                    onClick={() => setIsAddressDropdownOpen(false)}
                  />
                )}

                {isAddressDropdownOpen && (
                  <div 
                    className="relative z-[20] rounded-md bg-zinc-800 shadow-lg mt-2 mb-2"
                    style={{
                      width: '100%',
                      maxHeight: '400px',
                      overflowY: 'auto'
                    }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="py-1">
                      {tradingAddresses.map((addr) => (
                        <button
                          key={addr.address}
                          className={`w-full text-left px-4 py-2 text-sm hover:bg-zinc-700 ${
                            selectedAddress === addr.address ? 'bg-purple-900/30 text-purple-300' : 'text-white'
                          }`}
                          onClick={() => {
                            setIsAddressDropdownOpen(false);
                            setSelectedAddress(addr.address);
                            
                            queryAddressBalances([addr]);
                            
                            if (inputToken) {
                              fetchTokenBalance(inputToken.address, addr.address).then(setInputTokenBalance);
                            }
                            if (outputToken) {
                              fetchTokenBalance(outputToken.address, addr.address).then(setOutputTokenBalance);
                            }
                          }}
                        >
                          <div className="flex justify-between items-center">
                            <div className="font-mono flex items-center">
                              <span>Trading Address {addr.index + 1}: {formatAddress(addr.address)}</span>
                              <button
                                className="ml-2 p-1 rounded-full hover:bg-zinc-600 transition-colors"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  navigator.clipboard.writeText(addr.address);
                                  toast.success("Address copied to clipboard");
                                }}
                              >
                                <Copy size={14} className="text-zinc-400" />
                              </button>
                            </div>
                            {addressBalances[addr.address] && (
                              <div className="text-green-400">
                                {addressBalances[addr.address].solBalance} SOL
                              </div>
                            )}
                          </div>
                        </button>
                      ))}
                      <button
                        className="w-full text-left px-4 py-2 text-sm text-purple-400 hover:bg-zinc-700 border-t border-zinc-700"
                        onClick={() => {
                          generateTradingAddresses();
                          setIsAddressDropdownOpen(false);
                        }}
                      >
                        <div className="flex items-center justify-center">
                          <Wallet className="mr-2 h-4 w-4" />
                          Refresh Trading Addresses
                        </div>
                      </button>
                      <button
                        className="w-full text-left px-4 py-2 text-sm text-green-400 hover:bg-zinc-700"
                        onClick={() => {
                          if (tradingAddresses.length > 0) {
                            queryAddressBalances(tradingAddresses);
                            
                            if (selectedAddress) {
                              if (inputToken) {
                                fetchTokenBalance(inputToken.address, selectedAddress).then(setInputTokenBalance);
                              }
                              if (outputToken) {
                                fetchTokenBalance(outputToken.address, selectedAddress).then(setOutputTokenBalance);
                              }
                            }
                            
                            toast.info('Refreshing balances...');
                          }
                          setIsAddressDropdownOpen(false);
                        }}
                      >
                        <div className="flex items-center justify-center">
                          <RefreshCw className="mr-2 h-4 w-4" />
                          Refresh Balances
                        </div>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Status Display */}
      {status && (
        <div className="bg-purple-900/20 border border-purple-800/50 rounded-lg p-4 mb-4">
          <div className="flex items-center">
            <Loader2 className="h-4 w-4 animate-spin text-purple-400 mr-2" />
            <p className="text-purple-300">
              {status.includes('Unshielding') ? 
                <>
                  <span className="font-bold">Unshielding in progress:</span> {status.replace('Unshielding', '')}
                </> : 
                status
              }
            </p>
          </div>
        </div>
      )}
      
      {/* Token Selector Modal */}
      {showTokenSelector && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg w-full max-w-sm max-h-[70vh] overflow-hidden relative">
            <Button 
              variant="outline" 
              size="icon" 
              onClick={() => {
                setShowTokenSelector(null);
                setSearchQuery('');
              }}
              className="absolute top-2 right-2 h-8 w-8 rounded-full bg-purple-500/20 hover:bg-purple-500/40 z-50"
            >
              <X className="h-4 w-4 text-white" />
            </Button>
            
            <div className="p-3 border-b border-zinc-800 flex justify-between items-center">
              <h3 className="text-base font-medium text-white">Select Token</h3>
              <div className="w-8"></div>
            </div>
            
            <div className="p-3 border-b border-zinc-800">
              <div className="relative">
                <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 text-zinc-500 h-4 w-4" />
                <input
                  type="text"
                  placeholder="Search by name or paste address"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-zinc-800/50 border border-zinc-700/50 rounded-lg pl-8 pr-2 py-1.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                  autoFocus
                />
              </div>
            </div>
            
            <div className="overflow-y-auto max-h-[30vh]">
              {isLoadingTokens ? (
                <div className="flex justify-center items-center p-8">
                  <Loader2 className="h-6 w-6 animate-spin text-purple-400" />
                </div>
              ) : filteredTokens.length > 0 ? (
                <div className="p-2">
                  {filteredTokens.map((token) => (
                    <button
                      key={token.address}
                      className="w-full text-left p-3 hover:bg-zinc-800/70 rounded-lg transition-colors flex items-center"
                      onClick={() => handleSelectToken(token)}
                    >
                      <div className="h-8 w-8 rounded-full bg-purple-500/20 flex items-center justify-center mr-3">
                        {token.logoURI ? (
                          <img src={token.logoURI} alt={token.symbol} className="h-6 w-6 rounded-full" />
                        ) : (
                          <span className="text-xs font-bold">{token.symbol.substring(0, 1)}</span>
                        )}
                      </div>
                      <div>
                        <div className="font-medium text-white">{token.symbol}</div>
                        <div className="text-xs text-white/60">{token.name}</div>
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="p-8 text-center text-white/60">
                  No tokens found matching "{searchQuery}"
                </div>
              )}
            </div>
            
            <div className="p-3 border-t border-zinc-800">
              <Button 
                variant="outline" 
                className="w-full bg-purple-500/10 hover:bg-purple-500/20 text-white text-sm py-1.5"
                onClick={() => {
                  setShowTokenSelector(null);
                  setSearchQuery('');
                }}
              >
                Back to Swap
              </Button>
            </div>
          </div>
        </div>
      )}
      
      {/* Swap Interface */}
      <Card className="bg-zinc-900/40 backdrop-blur-sm border border-zinc-800/50 mt-6">
        <CardContent className="pt-6">
          <div className="space-y-6">
            <div className="relative">
              {/* Input Token Card */}
              <Card className="border-zinc-800/50 bg-zinc-800/30 p-4 shadow-[0_8px_30px_rgb(0,0,0,0.12)]">
                <div className="flex justify-between mb-2">
                  <span className="text-sm text-white/60">You pay</span>
                  <span className="text-sm text-white/60">
                    {selectedAddress && inputToken ? (
                      inputTokenBalance ? (
                        <span>
                          {inputToken.symbol === 'SOL' ? (
                            <span>Private: {inputTokenBalance.private} {inputToken.symbol} | Public: {inputTokenBalance.public} {inputToken.symbol}</span>
                          ) : (
                            <span>Balance: {inputTokenBalance.public} {inputToken.symbol}</span>
                          )}
                        </span>
                      ) : (
                        <span>Balance: 0.00 {inputToken.symbol}</span>
                      )
                    ) : (
                      <span>Balance: 0.00 {inputToken?.symbol || ''}</span>
                    )}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <div className="relative flex-1 mr-4">
                    <input 
                      type="text" 
                      placeholder="0.0" 
                      value={inputAmount}
                      onChange={(e) => handleInputAmountChange(e.target.value)}
                      className="text-2xl font-medium bg-transparent border-none outline-none w-full focus:ring-0 text-white pr-12"
                    />
                    <button 
                      className="absolute right-2 top-1/2 transform -translate-y-1/2 text-xs bg-zinc-700 hover:bg-zinc-600 px-2 py-1 rounded text-white/80 transition-colors"
                      onClick={handleMaxClick}
                      disabled={!inputTokenBalance || !inputToken}
                    >
                      MAX
                    </button>
                  </div>
                  <Button 
                    variant="secondary" 
                    className="gap-2 shadow-sm"
                    onClick={() => setShowTokenSelector('input')}
                  >
                    {inputToken ? (
                      <>
                        <div className="h-5 w-5 rounded-full bg-purple-500/20 flex items-center justify-center">
                          {inputToken.logoURI ? (
                            <img src={inputToken.logoURI} alt={inputToken.symbol} className="h-4 w-4 rounded-full" />
                          ) : (
                            <span className="text-xs">{inputToken.symbol.substring(0, 1)}</span>
                          )}
                        </div>
                        {inputToken.symbol}
                      </>
                    ) : (
                      <>
                        <div className="h-5 w-5 rounded-full bg-purple-500/20 flex items-center justify-center">
                          <span className="text-xs">S</span>
                        </div>
                        Select
                      </>
                    )}
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>
                  </Button>
                </div>
              </Card>
              
              {/* Swap Button */}
              <div className="absolute left-1/2 top-1/2 transform -translate-x-1/2 -translate-y-1/2 z-10">
                <Button 
                  variant="outline" 
                  size="icon" 
                  className="rounded-full h-10 w-10 bg-zinc-950 border-zinc-800/50 shadow-lg hover:bg-purple-500/5 transition-all"
                  onClick={handleSwapTokens}
                  disabled={!inputToken || !outputToken}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M7 7h10M7 7L12 2M7 7L12 12"/>
                    <path d="M17 17H7M17 17L12 12M17 17L12 22"/>
                  </svg>
                </Button>
              </div>
              
              {/* Output Token Card */}
              <Card className="border-zinc-800/50 bg-zinc-800/30 p-4 mt-2 shadow-[0_8px_30px_rgb(0,0,0,0.12)]">
                <div className="flex justify-between mb-2">
                  <span className="text-sm text-white/60">You receive</span>
                  <span className="text-sm text-white/60">
                    {selectedAddress && outputToken ? (
                      outputTokenBalance ? (
                        <span>
                          {outputToken.symbol === 'SOL' ? (
                            <span>Private: {addressBalances[selectedAddress]?.private || '0.00'} {outputToken.symbol} | Public: {addressBalances[selectedAddress]?.solBalance ? (parseFloat(addressBalances[selectedAddress].solBalance) - parseFloat(addressBalances[selectedAddress]?.private || '0.00')).toFixed(4) : '0.00'} {outputToken.symbol}</span>
                          ) : (
                            <span>Balance: {outputTokenBalance?.public || '0.00'} {outputToken.symbol}</span>
                          )}
                        </span>
                      ) : (
                        <span>Balance: 0.00 {outputToken.symbol}</span>
                      )
                    ) : (
                      <span>Balance: 0.00 {outputToken?.symbol || ''}</span>
                    )}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <div className="text-2xl font-medium w-2/3 text-white">
                    {isGettingQuote ? (
                      <div className="flex items-center">
                        <Loader2 className="h-5 w-5 mr-2 animate-spin text-purple-400" />
                        <span className="text-white/60">Calculating...</span>
                      </div>
                    ) : (
                      outputAmount || '0.0'
                    )}
                  </div>
                  <Button 
                    variant="secondary" 
                    className="gap-2 shadow-sm"
                    onClick={() => setShowTokenSelector('output')}
                  >
                    {outputToken ? (
                      <>
                        <div className="h-5 w-5 rounded-full bg-purple-500/20 flex items-center justify-center">
                          {outputToken.logoURI ? (
                            <img src={outputToken.logoURI} alt={outputToken.symbol} className="h-4 w-4 rounded-full" />
                          ) : (
                            <span className="text-xs">{outputToken.symbol.substring(0, 1)}</span>
                          )}
                        </div>
                        {outputToken.symbol}
                      </>
                    ) : (
                      <>
                        <div className="h-5 w-5 rounded-full bg-purple-500/20 flex items-center justify-center">
                          <span className="text-xs">U</span>
                        </div>
                        Select
                      </>
                    )}
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>
                  </Button>
                </div>
              </Card>
            </div>
            
            {/* Swap Details */}
            {quoteResponse && (
              <div className="p-3 rounded-lg bg-zinc-800/30 backdrop-blur-sm">
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-white/60">Rate</span>
                  <span className="text-white">
                    1 {inputToken?.symbol} = {
                      (parseFloat(quoteResponse.outAmount) / parseFloat(quoteResponse.inAmount) * Math.pow(10, (inputToken?.decimals || 0) - (outputToken?.decimals || 0))).toFixed(6)
                    } {outputToken?.symbol}
                  </span>
                </div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-white/60">Fee</span>
                  <span className="text-white">
                    {quoteResponse.platformFee ? (parseFloat(String(quoteResponse.platformFee.feeBps)) / 100).toFixed(2) : '0.5'}%
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-white/60">Route</span>
                  <span className="text-white">
                    {formatRoute(quoteResponse)}
                  </span>
                </div>
              </div>
            )}
            
            {/* Swap Button */}
            <Button 
              className="w-full bg-gradient-to-r from-purple-500 to-indigo-400 hover:from-purple-600 hover:to-indigo-500 shadow-[0_4px_14px_0_rgb(156,103,255,0.39)]" 
              size="lg"
              onClick={handleSwap}
              disabled={!selectedAddress || !inputToken || !outputToken || !inputAmount || parseFloat(inputAmount) <= 0 || !quoteResponse || isSwapping}
            >
              {isSwapping ? (
                <div className="flex items-center">
                  <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                  Swapping...
                </div>
              ) : !publicKey ? (
                'Connect Wallet'
              ) : !selectedAddress ? (
                'Select Trading Address'
              ) : !inputToken || !outputToken ? (
                'Select Tokens'
              ) : !inputAmount || parseFloat(inputAmount) <= 0 ? (
                'Enter Amount'
              ) : (
                'Swap Privately'
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
