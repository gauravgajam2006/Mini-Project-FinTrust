import React from 'react';

const LoadingSpinner = () => (
  <div style={{
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    minHeight: '100vh', backgroundColor: 'var(--color-background)', gap: '24px'
  }}>
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      gap: '8px', height: '60px'
    }}>
      {[0, 1, 2, 3, 4].map((index) => (
        <div 
          key={index} 
          style={{
            width: '6px', backgroundColor: 'var(--color-accent)', borderRadius: '10px',
            animation: 'waveBounce 1.2s cubic-bezier(0.85, 0.25, 0.37, 0.85) infinite',
            animationDelay: `${index * 0.15}s`
          }} 
          className="loading-bar" 
        />
      ))}
    </div>
    <p style={{
      color: 'var(--color-text-medium)', letterSpacing: '8px',
      fontSize: '1rem', fontWeight: '600', textTransform: 'uppercase',
      marginLeft: '8px'
    }}>
      Loading
    </p>
    <style>{`
      .loading-bar { height: 20%; }
      @keyframes waveBounce {
        0%, 100% { height: 20%; background-color: var(--color-primary-dark); opacity: 0.5; }
        50% { height: 100%; background-color: var(--color-accent); opacity: 1; box-shadow: 0 0 15px var(--color-accent); }
      }
    `}</style>
  </div>
);

export default LoadingSpinner;
