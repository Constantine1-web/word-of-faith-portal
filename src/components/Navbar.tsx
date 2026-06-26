"use client";

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut } from 'next-auth/react';
import { FiMenu, FiX } from 'react-icons/fi';
import styles from './Navbar.module.css';
import ThemeToggle from './ThemeToggle';
import MobileBackButton from './MobileBackButton';

export default function Navbar() {
  const pathname = usePathname();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  
  const isPortal = pathname?.startsWith('/portal/') && 
                   !pathname.includes('/login') && 
                   !pathname.includes('/register') &&
                   !pathname.includes('/forgot-password');

  const toggleMenu = () => setIsMobileMenuOpen(!isMobileMenuOpen);
  const closeMenu = () => setIsMobileMenuOpen(false);

  return (
    <nav className={styles.navbar}>
      <div className={`container ${styles.navContainer}`}>
        <div className={styles.navLeft}>
          <button className={styles.hamburgerBtn} onClick={toggleMenu}>
            {isMobileMenuOpen ? <FiX size={20} /> : <FiMenu size={20} />}
          </button>
          <MobileBackButton />
          <Link href="/" onClick={closeMenu} className={styles.logoLink}>
            <img src="/logo.jpg" alt="Word of Faith Schools" className={styles.logoImg} />
            <span className="logo-text" style={{ fontWeight: "bold", color: "var(--color-navy-blue)" }}>Word of Faith Schools</span>
          </Link>
        </div>
        <div className={styles.navRight}>
          <div className={styles.navLinksDesktop}>
            <Link href="/about">About Us</Link>
            <Link href="/academics">Academics</Link>
            <Link href="/admissions">Admissions</Link>
            <Link href="/news">News</Link>
          </div>
          <ThemeToggle />
          {isPortal ? (
            <button 
              onClick={() => { closeMenu(); signOut({ callbackUrl: '/portal/login' }); }} 
              className="btn btn-secondary portal-btn-mobile" 
            >
              Log Out
            </button>
          ) : (
            <Link href="/portal/login" onClick={closeMenu} className="btn btn-secondary portal-btn-mobile">
              Portal
            </Link>
          )}
        </div>
      </div>

      {/* Mobile Off-Canvas Menu */}
      <div className={`${styles.mobileMenuOverlay} ${isMobileMenuOpen ? styles.open : ''}`}>
        <div className={styles.mobileMenuContent}>
          <Link href="/" onClick={closeMenu} className={styles.mobileNavLink}>Home</Link>
          <Link href="/about" onClick={closeMenu} className={styles.mobileNavLink}>About Us</Link>
          <Link href="/academics" onClick={closeMenu} className={styles.mobileNavLink}>Academics</Link>
          <Link href="/admissions" onClick={closeMenu} className={styles.mobileNavLink}>Admissions</Link>
          <Link href="/news" onClick={closeMenu} className={styles.mobileNavLink}>News</Link>
        </div>
      </div>
    </nav>
  );
}
