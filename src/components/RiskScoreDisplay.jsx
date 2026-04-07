import { motion } from 'framer-motion';
import './RiskScoreDisplay.css';

const RiskScoreDisplay = ({ assessment, compact = false }) => {
  if (!assessment) return null;

  const { overall_score, risk_level, flags = [], recommendations = [] } = assessment;

  const getRiskColor = (level) => {
    switch (level) {
      case 'LOW': return { main: '#10b981', bg: 'rgba(16, 185, 129, 0.1)', label: 'Low Risk' };
      case 'MEDIUM': return { main: '#f59e0b', bg: 'rgba(245, 158, 11, 0.1)', label: 'Medium Risk' };
      case 'HIGH': return { main: '#ef4444', bg: 'rgba(239, 68, 68, 0.1)', label: 'High Risk' };
      default: return { main: '#6b7280', bg: 'rgba(107, 114, 128, 0.1)', label: 'Pending' };
    }
  };

  const riskInfo = getRiskColor(risk_level);
  const circumference = 2 * Math.PI * 52;
  const strokeDashoffset = circumference - (overall_score / 100) * circumference;

  const getSeverityIcon = (severity) => {
    switch (severity) {
      case 'HIGH': return '🔴';
      case 'MEDIUM': return '🟡';
      case 'LOW': return '🟢';
      default: return '⚪';
    }
  };

  const scoreBreakdown = [
    { label: 'Guarantor Check', score: assessment.guarantor_check_score, icon: '👤' },
    { label: 'Duplicate Check', score: assessment.duplicate_check_score, icon: '🔍' },
    { label: 'Email Pattern', score: assessment.email_pattern_score, icon: '📧' },
    { label: 'Phone Pattern', score: assessment.phone_pattern_score, icon: '📱' },
    { label: 'Identity Score', score: assessment.identity_score, icon: '🆔' },
  ];

  if (compact) {
    return (
      <motion.div
        className="risk-compact"
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        style={{ borderColor: riskInfo.main }}
      >
        <div className="risk-compact-score" style={{ color: riskInfo.main }}>
          {overall_score}
        </div>
        <div className="risk-compact-info">
          <span className="risk-compact-label" style={{ color: riskInfo.main }}>
            {riskInfo.label}
          </span>
          <span className="risk-compact-sub">{flags.length} flag(s) detected</span>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      className="risk-display"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
    >
      <div className="risk-display-header">
        <h3>🛡️ AI Risk Assessment</h3>
        <div className="risk-badge" style={{ background: riskInfo.bg, color: riskInfo.main, borderColor: riskInfo.main }}>
          {riskInfo.label}
        </div>
      </div>

      {/* Main Score Ring */}
      <div className="risk-score-section">
        <div className="risk-ring-container">
          <svg width="130" height="130" viewBox="0 0 120 120">
            <circle
              cx="60" cy="60" r="52"
              fill="none"
              stroke="var(--color-gray-200)"
              strokeWidth="8"
            />
            <motion.circle
              cx="60" cy="60" r="52"
              fill="none"
              stroke={riskInfo.main}
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={circumference}
              initial={{ strokeDashoffset: circumference }}
              animate={{ strokeDashoffset }}
              transition={{ duration: 1.5, ease: 'easeOut' }}
              transform="rotate(-90 60 60)"
            />
          </svg>
          <div className="risk-ring-value">
            <motion.span
              className="risk-ring-number"
              style={{ color: riskInfo.main }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.8 }}
            >
              {overall_score}
            </motion.span>
            <span className="risk-ring-label">/ 100</span>
          </div>
        </div>

        {/* Score Breakdown */}
        <div className="risk-breakdown">
          {scoreBreakdown.map((item, idx) => (
            <motion.div
              key={item.label}
              className="risk-breakdown-item"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.3 + idx * 0.1 }}
            >
              <div className="breakdown-info">
                <span className="breakdown-icon">{item.icon}</span>
                <span className="breakdown-label">{item.label}</span>
              </div>
              <div className="breakdown-bar-container">
                <motion.div
                  className="breakdown-bar"
                  style={{
                    background: item.score >= 75 ? '#10b981' : item.score >= 45 ? '#f59e0b' : '#ef4444',
                  }}
                  initial={{ width: 0 }}
                  animate={{ width: `${item.score}%` }}
                  transition={{ duration: 1, delay: 0.5 + idx * 0.1, ease: 'easeOut' }}
                />
              </div>
              <span className="breakdown-score">{item.score}</span>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Flags */}
      {flags.length > 0 && (
        <div className="risk-flags">
          <h4>⚠️ Detected Flags ({flags.length})</h4>
          <div className="flags-list">
            {flags.map((flag, idx) => (
              <motion.div
                key={idx}
                className={`flag-item flag-${flag.severity?.toLowerCase()}`}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.8 + idx * 0.1 }}
              >
                <span className="flag-icon">{getSeverityIcon(flag.severity)}</span>
                <div className="flag-content">
                  <span className="flag-type">{flag.type?.replace(/_/g, ' ')}</span>
                  <span className="flag-message">{flag.message}</span>
                </div>
                <span className={`flag-severity severity-${flag.severity?.toLowerCase()}`}>
                  {flag.severity}
                </span>
              </motion.div>
            ))}
          </div>
        </div>
      )}

      {/* Recommendations */}
      {recommendations.length > 0 && (
        <div className="risk-recommendations">
          <h4>💡 Recommendations</h4>
          <ul>
            {recommendations.map((rec, idx) => (
              <motion.li
                key={idx}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 1 + idx * 0.15 }}
              >
                {rec}
              </motion.li>
            ))}
          </ul>
        </div>
      )}
    </motion.div>
  );
};

export default RiskScoreDisplay;
