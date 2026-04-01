import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useLoan } from '../context/LoanContext';
import { getDaysUntilDue } from '../utils/loanValidation';
import GamificationWidget from './GamificationWidget';
import ThemeToggle from './ThemeToggle';
import NotificationPanel from './NotificationPanel';
import './Navbar.css';

const Navbar = () => {
    const { user, logout, loans, unreadNotificationCount } = useLoan();
    const navigate = useNavigate();
    const [showNotifications, setShowNotifications] = useState(false);

    const handleLogout = async (e) => {
        e.stopPropagation();
        try {
            await logout();
            navigate('/');
        } catch (error) {
            console.error('Logout failed:', error);
        }
    };

    const handleProfileClick = () => {
        navigate('/profile');
    };

    // Calculate reminders count (due in 3 days or overdue)
    const reminderCount = loans.filter(loan =>
        loan.status !== 'completed' && loan.status !== 'rejected' && getDaysUntilDue(loan.dueDate) <= 3
    ).length;

    // Total badge = unread notifications + reminders
    const totalBadge = unreadNotificationCount + reminderCount;

    return (
        <nav className="navbar">
            <div className="navbar-left">
                <Link to="/dashboard" className="navbar-logo">
                    <div className="navbar-logo-icon">💎</div>
                    <span className="navbar-logo-text">Fintrust</span>
                </Link>
            </div>

            <div className="navbar-right">
                <GamificationWidget />
                <ThemeToggle />

                <button
                    className="navbar-notifications"
                    onClick={() => setShowNotifications(true)}
                >
                    🔔
                    {totalBadge > 0 && (
                        <span className="notification-badge">{totalBadge > 9 ? '9+' : totalBadge}</span>
                    )}
                </button>

                {/* Notification Panel */}
                <NotificationPanel
                    isOpen={showNotifications}
                    onClose={() => setShowNotifications(false)}
                />

                <div className="navbar-profile-wrapper">
                    <div className="navbar-profile" onClick={handleProfileClick} title="View Profile">
                        <div className="navbar-avatar">
                            {user?.name?.charAt(0) || user?.email?.charAt(0) || 'U'}
                        </div>
                        <div className="navbar-user-info">
                            <div className="navbar-user-name">{user?.name || user?.email || 'User'}</div>
                            <div className="navbar-user-email">{user?.email || ''}</div>
                        </div>
                    </div>
                    <button className="navbar-logout-btn" onClick={handleLogout} title="Sign Out">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                            <polyline points="16 17 21 12 16 7"></polyline>
                            <line x1="21" y1="12" x2="9" y2="12"></line>
                        </svg>
                    </button>
                </div>
            </div>
        </nav>
    );
};

export default Navbar;
