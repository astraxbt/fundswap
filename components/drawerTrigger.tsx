import React, { useState } from 'react'
import { Button } from '@/components/ui/button'
import { RiWalletLine } from '@remixicon/react'
import { TextMorph } from '@/components/ui/text-morph'
import { PublicKey } from '@solana/web3.js'
import { useWallet } from '@solana/wallet-adapter-react'

export const DrawerTrigger = () => {
    const { publicKey, connected, disconnect, connect, wallet, select} = useWallet()
    const [isHovered, setIsHovered] = useState(false)
    const [isCopied, setIsCopied] = useState(false)

    const shortenWalletAddress = (address: string) => {
        if (!address) return '';
        return `${address.slice(0, 4)}...${address.slice(-4)}`;
      };

  return (
    <Button 
              className="relative bg-bitcoin/15 rounded-full px-4 hover:bg-bitcoin/25 hover:text-white active:bg-bitcoin/35 transition-all ease-in-out duration-300"
            >
              <div className="flex items-center justify-center space-x-3 text-inherit">
                <RiWalletLine className="size-5 text-bitcoin" />
                <div     
                onMouseEnter={() => setIsHovered(true)}
                onMouseLeave={() => !isCopied && setIsHovered(false)}
                className="text-sm font-geist text-bitcoin">
                  <TextMorph>
                    {isHovered ? 'open wallet' : publicKey ? shortenWalletAddress(publicKey.toString()) : 'Connect'}
                  </TextMorph>
                </div>
              </div>
            </Button>
  )
}
