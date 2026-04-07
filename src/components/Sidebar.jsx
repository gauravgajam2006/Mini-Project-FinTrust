import { NavLink, useNavigate } from 'react-router-dom';
import { useLoan } from '../context/LoanContext';
import './Sidebar.css';

const Sidebar = () => {
    const menuItems = [
        { path: '/dashboard', icon: '📊', label: 'Dashboard' },
        { path: '/loans', icon: '💰', label: 'My Loans' },
        { path: '/create-loan', icon: '➕', label: 'Create Loan' },
        { path: '/loan-agreement', icon: '📄', label: 'Agreements' },
        { path: '/social', icon: '👥', label: 'Social Hub' },
        { path: '/leaderboard', icon: '🏆', label: 'Leaderboard' },
        { path: '/profile', icon: '👤', label: 'Profile' },
    ];

    const { logout } = useLoan();
    const navigate = useNavigate();

    const handleLogout = async () => {
        try {
            await logout();
            navigate('/auth');
        } catch (error) {
            console.error('Failed to log out', error);
        }
    };

    return (
        <aside className="sidebar">
            <ul className="sidebar-menu">
                {menuItems.map((item) => (
                    <li key={item.path} className="sidebar-menu-item">
                        <NavLink
                            to={item.path}
                            className={({ isActive }) =>
                                isActive ? 'sidebar-link active' : 'sidebar-link'
                            }
                        >
                            <span className="sidebar-icon">{item.icon}</span>
                            <span>{item.label}</span>
                        </NavLink>
                    </li>
                ))}
            </ul>

            <div className="sidebar-footer">
                <button onClick={handleLogout} className="sidebar-logout">
                    <span className="sidebar-icon">🚪</span>
                    <span>Sign Out</span>
                </button>
            </div>
        </aside>
    );
};

export default Sidebar;
