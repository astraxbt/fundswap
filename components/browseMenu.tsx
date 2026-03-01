import React from "react";
import { Search } from 'lucide-react';
import { Link } from "next-view-transitions";
import { toast } from "sonner";

// Define the menu item type
interface MenuItem {
  name: string;
  link: string;
  isExternal?: boolean;
  isCopyable?: boolean;
  copyText?: string;
}

// Menu items array
const menuItems: MenuItem[] = [
  { name: "X", link: "https://twitter.com/FundSwapSol", isExternal: true },
  { name: "CA", isCopyable: true, copyText: "HEZ6KcNNUKaWvUCBEe4BtfoeDHEHPkCHY9JaDNqrpump", link: "" }, // Added copyable contract
  { name: "Dex", link: "https://dexscreener.com/solana/amme84klt1yzpz8akyjjtwd26hesaj5fblg6tew2rxcx", isExternal: true},

];

// Menu Component
const Menu: React.FC = () => {
  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Address copied to clipboard');
  };

  return (
    <ul className="flex space-x-7">
      {menuItems.map((item, index) => (
        <li key={index} className="text-gray font-geist text-sm hover:text-white transition-all ease-in-out duration-300">
          {item.isCopyable ? (
            <button 
              onClick={() => handleCopy(item.copyText || item.name)}
              className="hover:cursor-pointer"
            >
              {item.name}
            </button>
          ) : item.isExternal ? (
            <a 
              href={item.link} 
              target="_blank" 
              rel="noopener noreferrer"
            >
              {item.name}
            </a>
          ) : (
            <Link href={item.link}>
              {item.name}
            </Link>
          )}
        </li>
      ))}
    </ul>
  );
};

export default Menu;
