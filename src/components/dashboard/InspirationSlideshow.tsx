"use client";

import { useState, useEffect } from "react";
import styles from "./InspirationSlideshow.module.css";

const quotes = [
  {
    text: "Education is the most powerful weapon which you can use to change the world.",
    author: "Nelson Mandela"
  },
  {
    text: "The mind is not a vessel to be filled, but a fire to be kindled.",
    author: "Plutarch"
  },
  {
    text: "Develop a passion for learning. If you do, you will never cease to grow.",
    author: "Anthony J. D'Angelo"
  },
  {
    text: "Education is not the learning of facts, but the training of the mind to think.",
    author: "Albert Einstein"
  },
  {
    text: "One child, one teacher, one book, one pen can change the world.",
    author: "Malala Yousafzai"
  }
];

export default function InspirationSlideshow() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [fade, setFade] = useState(true);

  useEffect(() => {
    const interval = setInterval(() => {
      setFade(false);
      setTimeout(() => {
        setCurrentIndex((prev) => (prev + 1) % quotes.length);
        setFade(true);
      }, 500); // 500ms fade out before changing text
    }, 7000); // Slide changes every 7 seconds

    return () => clearInterval(interval);
  }, []);

  return (
    <div className={styles.slideshowContainer}>
      <div className={styles.header}>
        <h2 className={styles.title}>Inspiration for Greatness</h2>
      </div>
      <div className={styles.quoteWrapper}>
        <div className={`${styles.quoteContent} ${fade ? styles.fadeIn : styles.fadeOut}`}>
          <p className={styles.quoteText}>"{quotes[currentIndex].text}"</p>
          <p className={styles.quoteAuthor}>— {quotes[currentIndex].author}</p>
        </div>
      </div>
      <div className={styles.dots}>
        {quotes.map((_, idx) => (
          <span 
            key={idx} 
            className={`${styles.dot} ${idx === currentIndex ? styles.activeDot : ""}`}
            onClick={() => {
              setFade(false);
              setTimeout(() => {
                setCurrentIndex(idx);
                setFade(true);
              }, 300);
            }}
          />
        ))}
      </div>
    </div>
  );
}
