import { useLoan } from '../context/LoanContext';
import { levels, badges } from '../utils/gamification';
import './GamificationDashboard.css';

const GamificationDashboard = () => {
    const { gamification } = useLoan();

    const currentLevel = levels.find(l => l.level === gamification.level);
    const nextLevel = levels.find(l => l.level === gamification.level + 1);
    const progressToNext = nextLevel
        ? ((gamification.points - currentLevel.minPoints) / (nextLevel.minPoints - currentLevel.minPoints)) * 100
        : 100;

    const getTrustScoreColor = (score) => {
        if (score >= 80) return 'linear-gradient(135deg, #10B981, #059669)';
        if (score >= 60) return 'linear-gradient(135deg, #F59E0B, #D97706)';
        return 'linear-gradient(135deg, #EF4444, #DC2626)';
    };

    const getTrustScoreLabel = (score) => {
        if (score >= 80) return 'Excellent';
        if (score >= 60) return 'Good';
        if (score >= 40) return 'Fair';
        return 'Needs Improvement';
    };

    return (
        <div className="gamification-dashboard">
            <div className="gamification-header">
                <h2>Your Progress</h2>
                <p>Keep building your financial reputation!</p>
            </div>

            <div className="gamification-grid">
                {/* Level Card */}
                <div className="gam-card level-card">
                    <div className="card-header">
                        <div className="card-icon" style={{ background: currentLevel?.color }}>
                            🏅
                        </div>
                        <div>
                            <h3>Level {gamification.level}</h3>
                            <p className="card-subtitle">{currentLevel?.title || 'Beginner'}</p>
                        </div>
                    </div>
                    <div className="level-progress">
                        <div className="progress-info">
                            <span>{gamification.points} points</span>
                            {nextLevel && <span>{nextLevel.minPoints} pts to next level</span>}
                        </div>
                        <div className="progress-bar-large">
                            <div
                                className="progress-fill-large"
                                style={{
                                    width: `${Math.min(progressToNext, 100)}%`,
                                    background: currentLevel?.color
                                }}
                            />
                        </div>
                    </div>
                </div>

                {/* Trust Score Card removed */}



                {/* Stats Card */}
                <div className="gam-card stats-card">
                    <div className="card-header">
                        <div className="card-icon" style={{ background: 'linear-gradient(135deg, #3B82F6, #2563EB)' }}>
                            📊
                        </div>
                        <div>
                            <h3>Statistics</h3>
                            <p className="card-subtitle">Your activity summary</p>
                        </div>
                    </div>
                    <div className="stats-list">
                        <div className="stat-item">
                            <span className="stat-label">Total Loans</span>
                            <span className="stat-number">{gamification.stats.totalLoans}</span>
                        </div>
                        <div className="stat-item">
                            <span className="stat-label">Completed</span>
                            <span className="stat-number">{gamification.stats.completedLoans}</span>
                        </div>
                        <div className="stat-item">
                            <span className="stat-label">Total Payments</span>
                            <span className="stat-number">{gamification.stats.totalPayments}</span>
                        </div>
                        <div className="stat-item">
                            <span className="stat-label">On-Time Payments</span>
                            <span className="stat-number">{gamification.stats.onTimePayments}</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Badges Section */}
            <div className="badges-section">
                <h3>Achievements</h3>
                <div className="badges-grid">
                    {badges.map(badge => {
                        const isUnlocked = gamification.badges.includes(badge.id);
                        return (
                            <div
                                key={badge.id}
                                className={`badge-card ${isUnlocked ? 'unlocked' : 'locked'}`}
                                title={badge.description}
                            >
                                <div className="badge-icon">{badge.icon}</div>
                                <div className="badge-name">{badge.name}</div>
                                {isUnlocked && <div className="badge-unlocked-indicator">✓</div>}
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};

export default GamificationDashboard;
