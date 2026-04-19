import React, { createContext, useContext, useState, useEffect } from 'react';

const ThemeContext = createContext();

export const ThemeProvider = ({ children }) => {
    const [theme, setTheme] = useState(() => {
        const savedTheme = localStorage.getItem('fintrust-theme');
        return savedTheme || 'night'; // Default to night for premium fintech feel
    });

    useEffect(() => {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('fintrust-theme', theme);
    }, [theme]);

    const toggleTheme = () => {
        document.documentElement.classList.add('theme-changing');
        setTheme(prevTheme => prevTheme === 'day' ? 'night' : 'day');
        setTimeout(() => {
            document.documentElement.classList.remove('theme-changing');
        }, 300);
    };

    return (
        <ThemeContext.Provider value={{ theme, toggleTheme }}>
            {children}
        </ThemeContext.Provider>
    );
};

export const useTheme = () => {
    const context = useContext(ThemeContext);
    if (!context) {
        throw new Error('useTheme must be used within a ThemeProvider');
    }
    return context;
};
