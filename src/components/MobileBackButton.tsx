"use client";

import { useRouter, usePathname } from 'next/navigation';
import styles from './MobileBackButton.module.css';

export default function MobileBackButton() {
  const router = useRouter();
  const pathname = usePathname();

  // Don't show the back button on the home page
  if (pathname === '/') return null;

  return (
    <button className={styles.backBtn} onClick={() => router.back()} aria-label="Go Back">
      <svg 
        xmlns="http://www.w3.org/2000/svg" 
        width="20" 
        height="20" 
        viewBox="0 0 24 24" 
        fill="none" 
        stroke="currentColor" 
        strokeWidth="2.5" 
        strokeLinecap="round" 
        strokeLinejoin="round"
      >
        <path d="M19 12H5M12 19l-7-7 7-7"/>
      </svg>
    </button>
  );
}
