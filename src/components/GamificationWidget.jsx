import { useLoan } from '../context/LoanContext';
import { levels } from '../utils/gamification';
import './GamificationWidget.css';

const GamificationWidget = () => {
    const { gamification } = useLoan();

    const currentLevel = levels.find(l => l.level === gamification.level);
    const nextLevel = levels.find(l => l.level === gamification.level + 1);
    const progressToNext = nextLevel
        ? ((gamification.points - currentLevel.minPoints) / (nextLevel.minPoints - currentLevel.minPoints)) * 100
        : 100;

    return (
        <div className="gamification-widget">
            <div className="widget-level">
                <div className="level-icon" style={{ background: currentLevel?.color || '#9CA3AF' }}>
                    {gamification.level}
                </div>
                <div className="level-info">
                    <div className="level-title">{currentLevel?.title || 'Beginner'}</div>
                    <div className="level-points">{gamification.points} pts</div>
                </div>
            </div>
            <div className="widget-stats">

                <div className="widget-stat">
                    <span className="stat-icon">⭐</span>
                    <span className="stat-value">{Math.round(Number(gamification.trustScore || 0))}</span>
                </div>
            </div>
            <div className="widget-progress">
                <div className="progress-bar">
                    <div
                        className="progress-fill"
                        style={{
                            width: `${Math.min(progressToNext, 100)}%`,
                            background: currentLevel?.color || '#9CA3AF'
                        }}
                    />
                </div>
            </div>
        </div>
    );
};

export default GamificationWidget;
