'use client';
import React from 'react'
import NavBar from '@/components/navBar';
import { usePathname } from 'next/navigation';

const BrowseLayout = ({ 
    children, 
}: {
    children: React.ReactNode;
}) => {
  const pathname = usePathname();
  const isHomePage = pathname === '/';

  return (
    <>
    {!isHomePage && <NavBar />}
        <div className={`transition-all hidden-scrollbar ${isHomePage ? 'h-full' : 'h-[calc(100%-40px)]'}`}>
                {children}
        </div>
    </>
  )
}

export default BrowseLayout
