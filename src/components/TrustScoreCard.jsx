import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Filler,
  Legend,
} from 'chart.js';
import './TrustScoreCard.css';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Filler,
  Legend
);

const TrustScoreCard = ({ score = 0, historyData = [] }) => {
  const [animatedScore, setAnimatedScore] = useState(0);

  // Use the trust score directly from the database — no normalization needed.
  // The backend trigger (calculate_payment_trust_delta) maintains the authoritative score.
  const displayScore = Math.round(Number(score) || 0);

  useEffect(() => {
    // Reset animated score when displayScore changes
    setAnimatedScore(0);

    const end = displayScore;
    if (end <= 0) {
      setAnimatedScore(0);
      return;
    }

    const targetDuration = 1500; // ms
    const incrementTime = Math.max(targetDuration / end, 10); // min 10ms to prevent runaway
    let current = 0;

    const timer = setInterval(() => {
      current += 1;
      if (current >= end) {
        current = end;
        clearInterval(timer);
      }
      setAnimatedScore(current);
    }, incrementTime);

    return () => clearInterval(timer);
  }, [displayScore]);

  const getColor = (s) => {
    if (s <= 40) return "#ff4d4d"; // Red
    if (s <= 70) return "#ffc107"; // Yellow
    return "#00ff99"; // Green
  };

  const getStatusText = (s) => {
    if (s > 70) return "Trusted User";
    if (s > 40) return "Moderate Risk";
    return "High Risk";
  };

  const circumference = 2 * Math.PI * 90; // r=90
  // Clamp progress ring to 100% max, but display the actual number
  const ringPercent = Math.min(displayScore, 100);
  const strokeDashoffset = circumference - (circumference * ringPercent) / 100;

  // Chart data setup
  const defaultHistoryData = historyData.length > 0 ? historyData : [30, 45, 42, 60, 55, displayScore];
  const chartData = {
    labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Current'],
    datasets: [
      {
        fill: true,
        label: 'Trust Score Trends',
        data: defaultHistoryData,
        borderColor: getColor(displayScore),
        backgroundColor: (context) => {
          const ctx = context.chart.ctx;
          const gradient = ctx.createLinearGradient(0, 0, 0, 200);
          gradient.addColorStop(0, `${getColor(displayScore)}88`); // 50% opacity
          gradient.addColorStop(1, `${getColor(displayScore)}00`); // 0% opacity
          return gradient;
        },
        borderWidth: 2,
        pointBackgroundColor: '#121212',
        pointBorderColor: getColor(displayScore),
        pointBorderWidth: 2,
        pointRadius: 4,
        tension: 0.4,
      },
    ],
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: '#1e1e1e',
        titleColor: '#fff',
        bodyColor: '#fff',
        borderColor: 'rgba(255,255,255,0.1)',
        borderWidth: 1,
        padding: 10,
        displayColors: false,
      },
    },
    scales: {
      x: {
        grid: { display: false, drawBorder: false },
        ticks: { color: 'rgba(255,255,255,0.5)', font: { size: 10 } },
      },
      y: {
        min: 0,
        max: 100,
        grid: { color: 'rgba(255,255,255,0.05)', drawBorder: false },
        ticks: { color: 'rgba(255,255,255,0.5)', font: { size: 10 }, stepSize: 25 },
      },
    },
  };

  return (
    <motion.div 
      initial={{ scale: 0.9, opacity: 0, y: 20 }}
      animate={{ scale: 1, opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      className="trust-score-wrapper"
    >
      <div className="trust-card-glass">
        {/* Top Header */}
        <div className="trust-card-header">
          <h2 className="title-glow">Trust Score</h2>
          <span className="info-icon" title="Your trust score determines your borrowing limits and interest rates.">ℹ️</span>
        </div>

        {/* Circular Progress Ring with Score */}
        <div className="score-ring-container">
          <svg width="220" height="220" className="score-ring">
            <defs>
              <linearGradient id="scoreGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor={getColor(displayScore)} />
                <stop offset="100%" stopColor={`${getColor(displayScore)}aa`} />
              </linearGradient>
              <filter id="glow">
                <feGaussianBlur stdDeviation="4" result="coloredBlur"/>
                <feMerge>
                  <feMergeNode in="coloredBlur"/>
                  <feMergeNode in="SourceGraphic"/>
                </feMerge>
              </filter>
            </defs>

            {/* Background Track */}
            <circle
              cx="110" cy="110" r="90"
              className="ring-bg"
            />
            {/* Animated Progress Track */}
            <motion.circle
              cx="110" cy="110" r="90"
              className="ring-progress"
              stroke="url(#scoreGradient)"
              strokeDasharray={circumference}
              initial={{ strokeDashoffset: circumference }}
              animate={{ strokeDashoffset }}
              transition={{ duration: 1.5, ease: "easeOut" }}
              filter="url(#glow)"
            />
          </svg>
          
          <div className="score-content">
            <motion.div 
              style={{
                color: getColor(displayScore),
                textShadow: `0 0 20px ${getColor(displayScore)}`
              }}
              className="score-value"
            >
              {animatedScore}
            </motion.div>
            <div className="score-status">{getStatusText(displayScore)}</div>
          </div>
        </div>

        {/* History Graph */}
        <div className="score-history-chart">
          <Line data={chartData} options={chartOptions} />
        </div>

        {/* Improvement Tips Section */}
        <div className="improvement-tips">
          <h3>💡 How to improve</h3>
          <ul className="tips-list">
            <li><span className="check">✓</span> Repay loans before the due date</li>
            <li><span className="check">✓</span> Maintain a low active debt balance</li>
            <li><span className="check">✓</span> Lend to reputable borrowers</li>
          </ul>
        </div>
      </div>
    </motion.div>
  );
};

export default TrustScoreCard;
