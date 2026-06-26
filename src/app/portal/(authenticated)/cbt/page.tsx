"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./page.module.css";
import { EXAM_TYPES, SUBJECTS } from "@/lib/cbt-api";

export default function CBTLandingPage() {
  const router = useRouter();
  const [exam, setExam] = useState(EXAM_TYPES[0]);
  const [subject, setSubject] = useState(SUBJECTS[0]);
  const [amount, setAmount] = useState(10);
  const [isLoading, setIsLoading] = useState(false);

  const handleStart = (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    // Push configuration to quiz page via query params
    router.push(`/portal/cbt/quiz?exam=${exam}&subject=${subject}&amount=${amount}`);
  };

  return (
    <div className={styles.container}>
      <div className={styles.heroSection}>
        <h1 className={styles.title}>CBT Practice Portal</h1>
        <p className={styles.subtitle}>Prepare for your major exams with our automated testing environment.</p>
      </div>

      <div className={styles.card}>
        <h2 className={styles.cardTitle}>Test Configuration</h2>
        <form onSubmit={handleStart} className={styles.form}>
          <div className={styles.formGroup}>
            <label>Exam Type</label>
            <select value={exam} onChange={(e) => setExam(e.target.value)} required>
              {EXAM_TYPES.map(type => (
                <option key={type} value={type}>{type.toUpperCase()}</option>
              ))}
            </select>
          </div>

          <div className={styles.formGroup}>
            <label>Subject</label>
            <select value={subject} onChange={(e) => setSubject(e.target.value)} required>
              {SUBJECTS.map(sub => (
                <option key={sub} value={sub}>{sub.charAt(0).toUpperCase() + sub.slice(1)}</option>
              ))}
            </select>
          </div>

          <div className={styles.formGroup}>
            <label>Number of Questions</label>
            <select value={amount} onChange={(e) => setAmount(Number(e.target.value))} required>
              <option value={10}>10 Questions</option>
              <option value={20}>20 Questions</option>
              <option value={40}>40 Questions</option>
            </select>
          </div>

          <button type="submit" className={styles.startBtn} disabled={isLoading}>
            {isLoading ? "Preparing Exam..." : "Start Practice"}
          </button>
        </form>
      </div>
    </div>
  );
}
