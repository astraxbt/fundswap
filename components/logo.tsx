import Image from "next/image";
import React from 'react'
import { Link } from 'next-view-transitions'

const Logo = () => {
  return (
    <Link href="/">
        <div className="flex flex-col cursor-pointer z-[50] text-xl text-white font-medium font-english pl-3 items-center opacity-90 active:scale-95 justify-center pr-1 pt-1 gap-y-50 pb-2 hover:opacity-100 transition">
            <Image src="/password.svg" alt="logo" width={40} height={40} />
        </div>
    </Link>
  )
}

export default Logo
