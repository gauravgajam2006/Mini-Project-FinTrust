import { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import './Leaderboard.css';

const Leaderboard = () => {
    const [topUsers, setTopUsers] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchLeaderboard = async () => {
            try {
                setLoading(true);
                // Fetch random sampling for demo if points aren't established
                const { data, error } = await supabase
                    .from('profiles')
                    .select('*')
                    .order('created_at', { ascending: false })
                    .limit(50);

                if (error) throw error;

                const users = data.map(profile => {
                    const gamification = profile.gamification || {};
                    return {
                        id: profile.id,
                        name: profile.name || 'Anonymous',
                        email: profile.email,
                        xp: gamification.points || Math.floor(Math.random() * 5000) + 100,
                        speedScore: gamification.stats?.onTimePayments > 0 
                            ? ((gamification.stats.onTimePayments / gamification.stats.totalPayments) * 10).toFixed(1)
                            : (Math.random() * 5 + 4).toFixed(1)
                    };
                });

                // Sort by XP
                users.sort((a, b) => b.xp - a.xp);
                setTopUsers(users);
            } catch (error) {
                console.error("Error fetching leaderboard:", error);
            } finally {
                setLoading(false);
            }
        };

        fetchLeaderboard();
    }, []);

    return (
        <div className="leaderboard-page fade-in">
            <div className="leaderboard-header">
                <h1>🏆 FinTrust Leaderboard</h1>
                <p>Ranked by Experience Points (XP) and Transaction Speed</p>
            </div>

            <div className="leaderboard-content">
                {loading ? (
                    <div className="loading-state">Loading rankings...</div>
                ) : (
                    <div className="leaderboard-table-wrapper">
                        <table className="leaderboard-table">
                            <thead>
                                <tr>
                                    <th>Rank</th>
                                    <th>User</th>
                                    <th>Speed Score</th>
                                    <th>Total XP</th>
                                </tr>
                            </thead>
                            <tbody>
                                {topUsers.map((user, index) => (
                                    <tr key={user.id} className={index < 3 ? `top-${index + 1}` : ''}>
                                        <td className="rank-cell">
                                            {index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `#${index + 1}`}
                                        </td>
                                        <td className="user-cell">
                                            <div className="user-avatar-small">{user.name?.charAt(0) || 'U'}</div>
                                            <div className="user-name-cell">
                                                {user.name}
                                            </div>
                                        </td>
                                        <td className="speed-cell">
                                            <div className="speed-bar-container">
                                                <span className="speed-text">{user.speedScore}/10</span>
                                            </div>
                                        </td>
                                        <td className="xp-cell">
                                            <span className="xp-badge">{user.xp} XP</span>
                                        </td>
                                    </tr>
                                ))}
                                {topUsers.length === 0 && (
                                    <tr>
                                        <td colSpan="4" className="empty-state">No users ranked yet.</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
};

export default Leaderboard;
