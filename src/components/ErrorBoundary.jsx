import React from 'react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("ErrorBoundary caught an error", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          minHeight: '100vh', background: '#0f172a', color: '#e2e8f0', padding: '24px', textAlign: 'center'
        }}>
          <h1 style={{ fontSize: '2.5rem', marginBottom: '16px', color: '#ef4444' }}>Oops! Something went wrong.</h1>
          <p style={{ fontSize: '1.1rem', color: '#94a3b8', maxWidth: '500px', marginBottom: '24px' }}>
            We've encountered an unexpected error. Please try refreshing the page or contact support if the problem persists.
          </p>
          <button 
            onClick={() => window.location.reload()}
            style={{
              padding: '12px 24px', background: '#3b82f6', color: 'white', border: 'none',
              borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '1rem'
            }}
          >
            Refresh Page
          </button>
          {process.env.NODE_ENV === 'development' && (
            <pre style={{
              marginTop: '24px', padding: '16px', background: '#1e293b', borderRadius: '8px',
              maxWidth: '100%', overflow: 'auto', textAlign: 'left', color: '#f87171'
            }}>
              {this.state.error && this.state.error.toString()}
            </pre>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
