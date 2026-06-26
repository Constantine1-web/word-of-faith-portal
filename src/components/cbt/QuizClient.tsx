"use client";

import { useState, useEffect } from "react";
import { CBTQuestion } from "@/lib/cbt-api";
import styles from "./QuizClient.module.css";
import Link from "next/link";
import { FiClock, FiCheckCircle, FiXCircle, FiArrowRight, FiArrowLeft, FiGrid } from "react-icons/fi";

interface QuizClientProps {
  questions: CBTQuestion[];
  subject: string;
  exam: string;
}

export default function QuizClient({ questions, subject, exam }: QuizClientProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [timeLeft, setTimeLeft] = useState(questions.length * 60); // 1 minute per question
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [score, setScore] = useState(0);

  useEffect(() => {
    if (isSubmitted) return;
    
    if (timeLeft <= 0) {
      handleSubmit();
      return;
    }

    const timer = setInterval(() => {
      setTimeLeft(prev => prev - 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [timeLeft, isSubmitted]);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const handleSelectOption = (optionKey: string) => {
    if (isSubmitted) return;
    setAnswers(prev => ({
      ...prev,
      [currentIndex]: optionKey
    }));
  };

  const handleSubmit = () => {
    let calculatedScore = 0;
    questions.forEach((q, idx) => {
      if (answers[idx] === q.answer) {
        calculatedScore++;
      }
    });
    setScore(calculatedScore);
    setIsSubmitted(true);
  };

  if (isSubmitted) {
    const percentage = Math.round((score / questions.length) * 100);
    return (
      <div className={styles.resultsContainer}>
        <div className={styles.scoreCard}>
          <h2>Exam Completed</h2>
          <div className={styles.scoreCircle}>
            <span>{percentage}%</span>
          </div>
          <p>You scored {score} out of {questions.length}</p>
          <div className={styles.resultActions}>
            <button onClick={() => window.location.reload()} className={styles.retakeBtn}>Retake Test</button>
            <Link href="/portal/cbt" className={styles.dashboardBtn}>New Configuration</Link>
          </div>
        </div>

        <div className={styles.correctionsWrapper}>
          <h3>Detailed Corrections</h3>
          {questions.map((q, idx) => {
            const userAnswer = answers[idx];
            const isCorrect = userAnswer === q.answer;
            return (
              <div key={q.id} className={`${styles.correctionItem} ${isCorrect ? styles.correct : styles.wrong}`}>
                <div className={styles.questionText}>
                  <strong>{idx + 1}.</strong> <span dangerouslySetInnerHTML={{ __html: q.question }} />
                </div>
                {q.image && <img src={q.image} alt="Question figure" className={styles.qImage} />}
                
                <div className={styles.optionsList}>
                  {Object.entries(q.option).map(([key, val]) => {
                    if (!val) return null;
                    const isSelected = userAnswer === key;
                    const isActualAnswer = q.answer === key;
                    
                    let itemClass = styles.optionItem;
                    if (isActualAnswer) itemClass += ` ${styles.optionActual}`;
                    else if (isSelected && !isCorrect) itemClass += ` ${styles.optionWrong}`;

                    return (
                      <div key={key} className={itemClass}>
                        <span className={styles.optionLetter}>{key.toUpperCase()}</span>
                        <span dangerouslySetInnerHTML={{ __html: val }} />
                      </div>
                    );
                  })}
                </div>

                {!isCorrect && q.solution && (
                  <div className={styles.solutionBox}>
                    <strong>Solution:</strong>
                    <div dangerouslySetInnerHTML={{ __html: q.solution }} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  const currentQ = questions[currentIndex];

  return (
    <div className={styles.quizLayout}>
      {/* Sidebar Question Map */}
      <div className={styles.questionMap}>
        <div className={styles.mapHeader}>
          <FiGrid /> <span>Questions</span>
        </div>
        <div className={styles.grid}>
          {questions.map((_, idx) => (
            <button
              key={idx}
              className={`${styles.gridBtn} ${currentIndex === idx ? styles.active : ""} ${answers[idx] ? styles.answered : ""}`}
              onClick={() => setCurrentIndex(idx)}
            >
              {idx + 1}
            </button>
          ))}
        </div>
      </div>

      {/* Main Quiz Area */}
      <div className={styles.mainArea}>
        <header className={styles.header}>
          <div className={styles.examInfo}>
            <span className={styles.badge}>{exam.toUpperCase()}</span>
            <span className={styles.subject}>{subject.toUpperCase()}</span>
          </div>
          <div className={`${styles.timer} ${timeLeft < 60 ? styles.timerWarning : ""}`}>
            <FiClock /> {formatTime(timeLeft)}
          </div>
        </header>

        <div className={styles.questionContainer}>
          <h3 className={styles.questionNumber}>Question {currentIndex + 1} of {questions.length}</h3>
          <div className={styles.questionText} dangerouslySetInnerHTML={{ __html: currentQ.question }} />
          {currentQ.image && <img src={currentQ.image} alt="Question figure" className={styles.qImage} />}
          
          <div className={styles.optionsList}>
            {Object.entries(currentQ.option).map(([key, val]) => {
              if (!val) return null;
              const isSelected = answers[currentIndex] === key;
              return (
                <button
                  key={key}
                  className={`${styles.optionBtn} ${isSelected ? styles.selected : ""}`}
                  onClick={() => handleSelectOption(key)}
                >
                  <span className={styles.optionLetter}>{key.toUpperCase()}</span>
                  <span dangerouslySetInnerHTML={{ __html: val }} />
                </button>
              );
            })}
          </div>
        </div>

        <footer className={styles.footer}>
          <button 
            className={styles.navBtn} 
            disabled={currentIndex === 0}
            onClick={() => setCurrentIndex(prev => prev - 1)}
          >
            <FiArrowLeft /> Previous
          </button>
          
          {currentIndex === questions.length - 1 ? (
            <button className={styles.submitBtn} onClick={handleSubmit}>
              Submit Exam <FiCheckCircle />
            </button>
          ) : (
            <button 
              className={styles.navBtn} 
              onClick={() => setCurrentIndex(prev => prev + 1)}
            >
              Next <FiArrowRight />
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}
