import { useState, useEffect } from 'react';
import { useLoan } from '../context/LoanContext';
import GamificationWidget from '../components/GamificationWidget';
import './Profile.css';

const Profile = () => {
  const { getDashboardStats, user, gamification } = useLoan();
  const [profileData, setProfileData] = useState({
    name: '',
    email: '',
    phone: '',
    joinDate: ''
  });

  const gamificationData = gamification;


  const getBadges = () => {
    const allBadges = [
      { id: 'first_loan', name: 'First Loan', icon: '📝', description: 'Created your first loan' },
      { id: 'regular_payer', name: 'Regular Payer', icon: '💸', description: 'Made 5 payments' },
      { id: 'responsible', name: 'Responsible', icon: '✅', description: 'Completed a loan' },
      { id: 'streak_7', name: 'Week Streak', icon: '🔥', description: '7 day payment streak' },
      { id: 'streak_30', name: 'Month Streak', icon: '🗓️', description: '30 day payment streak' },
      { id: 'loan_master', name: 'Loan Master', icon: '👑', description: 'Managed 10 loans' },
      { id: 'trust_80', name: 'High Trust', icon: '🛡️', description: 'Reached 80+ Trust Score' },
      { id: 'perfect', name: 'Perfect Record', icon: '⭐', description: '10+ on-time payments, no lates' }
    ];

    return allBadges.map(badge => ({
      ...badge,
      earned: gamificationData.badges.includes(badge.id)
    }));
  };

  useEffect(() => {
    if (user) {
      // Extract name from metadata if available, otherwise email prefix
      const name = user.displayName || user.name || user.email.split('@')[0];
      const creationTime = user.metadata?.creationTime || user.created_at || Date.now();

      setProfileData({
        name: name,
        email: user.email,
        phone: user.phoneNumber || 'Not provided',
        joinDate: new Date(creationTime).toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        })
      });
    }
  }, [user]);

  const stats = getDashboardStats();
  const badges = getBadges();
  const earnedBadgesCount = badges.filter(b => b.earned).length;

  return (
    <div className="profile-page fade-in">
      <div className="profile-header">
        <h1>👤 My Profile</h1>
        <p>Manage your account, view your Trust Score and achievements</p>
      </div>

      <div className="profile-grid">
        {/* Left Column - User Info & Trust Score */}
        <div className="profile-info-column">
          <div className="profile-card user-card neon-border">
            <div className="user-avatar-large">
              {profileData.name.charAt(0).toUpperCase()}
            </div>
            <h2>{profileData.name}</h2>
            <p className="user-email">{profileData.email}</p>

            <div className="user-details-list">
              <div className="detail-item">
                <span className="detail-label">Member Since</span>
                <span className="detail-value">{profileData.joinDate}</span>
              </div>
              <div className="detail-item">
                <span className="detail-label">Phone</span>
                <span className="detail-value">{profileData.phone}</span>
              </div>
            </div>

            <button className="btn-secondary edit-profile-btn" disabled>
              ✏️ Edit Profile (Coming Soon)
            </button>
          </div>

          <div className="profile-card gamification-wrapper">
            <GamificationWidget />
          </div>
        </div>

        {/* Right Column - Stats & Badges */}
        <div className="profile-stats-column">
          <div className="profile-card stats-overview-card">
            <h3>📊 Lending Statistics</h3>
            <div className="stats-grid-small">
              <div className="stat-box">
                <span className="stat-icon">💰</span>
                <div className="stat-info">
                  <span className="stat-value">{stats.overview.activeLoans + stats.overview.completedLoans + stats.overview.overdueLoans}</span>
                  <span className="stat-title">Total Loans</span>
                </div>
              </div>
              <div className="stat-box">
                <span className="stat-icon">✅</span>
                <div className="stat-info">
                  <span className="stat-value">{stats.overview.completedLoans}</span>
                  <span className="stat-title">Completed</span>
                </div>
              </div>
              <div className="stat-box">
                <span className="stat-icon">📈</span>
                <div className="stat-info">
                  <span className="stat-value">{gamificationData.stats.onTimePayments}</span>
                  <span className="stat-title">On-Time Payments</span>
                </div>
              </div>

            </div>
          </div>

          <div className="profile-card badges-card">
            <div className="badges-header">
              <h3>🏆 Achievements ({earnedBadgesCount}/{badges.length})</h3>
            </div>
            <div className="badges-grid-full">
              {badges.map((badge) => (
                <div key={badge.id} className={`badge-item-large ${badge.earned ? 'earned' : 'locked'}`}>
                  <div className="badge-icon">{badge.icon}</div>
                  <div className="badge-info">
                    <span className="badge-name">{badge.name}</span>
                    <span className="badge-desc">{badge.description}</span>
                  </div>
                  {!badge.earned && <div className="lock-icon">🔒</div>}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Profile;
