import { useTheme } from '../context/ThemeContext';
import './ThemeToggle.css';

const ThemeToggle = () => {
    const { theme, toggleTheme } = useTheme();

    return (
        <div className="theme-toggle">
            <button
                className="theme-toggle-button"
                onClick={toggleTheme}
                aria-label={`Switch to ${theme === 'day' ? 'night' : 'day'} mode`}
                title={`Switch to ${theme === 'day' ? 'night' : 'day'} mode`}
            >
                <div className="theme-icon-container">
                    <span className="theme-icon" key={theme}>
                        {theme === 'day' ? '🌙' : '☀️'}
                    </span>
                </div>
            </button>
        </div>
    );
};

export default ThemeToggle;
