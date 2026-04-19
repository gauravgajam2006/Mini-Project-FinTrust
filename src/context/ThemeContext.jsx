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
        const overlay = document.getElementById("theme-transition-overlay");
        
        if (overlay) {
            // Step 1: Show overlay (blur in)
            overlay.style.opacity = "1";
            overlay.style.transform = "scale(1.02)";
            
            // Step 2: Switch theme behind overlay
            setTimeout(() => {
                setTheme(prevTheme => prevTheme === 'day' ? 'night' : 'day');
            }, 150);
            
            // Step 3: Fade overlay out
            setTimeout(() => {
                overlay.style.opacity = "0";
                overlay.style.transform = "scale(1)";
            }, 350);
        } else {
            // Fallback
            setTheme(prevTheme => prevTheme === 'day' ? 'night' : 'day');
        }
    };

    return (
        <ThemeContext.Provider value={{ theme, toggleTheme }}>
            <div id="theme-transition-overlay"></div>
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
