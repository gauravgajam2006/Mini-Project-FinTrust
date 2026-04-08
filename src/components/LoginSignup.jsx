import { useState } from 'react';
import toast from 'react-hot-toast';
import { useLoan } from '../context/LoanContext';
import './LoginSignup.css';

const LoginSignup = () => {
    const { login, signup, loginWithGoogle, sendOtp, verifyOtp } = useLoan();
    const [isLogin, setIsLogin] = useState(true);
    const [authMode, setAuthMode] = useState('password'); // 'password' or 'otp'
    const [otpStep, setOtpStep] = useState(1); // 1: Input email/phone, 2: Input OTP
    const [signupStep, setSignupStep] = useState(1); // 1: Details, 2: OTP, 3: Aadhaar
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [otpType, setOtpType] = useState('email'); // 'email' or 'phone'

    // Form fields
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [phone, setPhone] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [rememberMe, setRememberMe] = useState(false);
    const [otp, setOtp] = useState('');
    const [aadhaar, setAadhaar] = useState('');

    // Safety check
    if (!login || !signup) {
        return <div style={{ padding: '20px', color: 'white' }}>Loading authentication...</div>;
    }

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError(null);

        if (isLogin) {
            if (authMode === 'password') {
                setLoading(true);
                try {
                    await login(email, password);
                } catch (err) {
                    console.error('Auth error:', err);
                    let errorMessage = err.message || 'An error occurred';
                    if (errorMessage.includes('Invalid login credentials') || errorMessage.includes('auth/invalid-credential')) {
                        errorMessage = 'Invalid email or password. Please try again, or create an account if you don\'t have one.';
                    } else if (errorMessage.includes('auth/email-already-in-use') || errorMessage.includes('User already registered')) {
                        errorMessage = 'This email is already registered. Please sign in instead.';
                        setIsLogin(true);
                    } else if (errorMessage.includes('auth/weak-password')) {
                        errorMessage = 'Password should be at least 6 characters.';
                    }
                    setError(errorMessage);
                } finally {
                    setLoading(false);
                }
            } else {
                // OTP Login Logic
                if (otpStep === 1) {
                    const identifier = otpType === 'email' ? email : phone;
                    if (!identifier) {
                        setError(`Please enter your ${otpType} to receive an OTP.`);
                        return;
                    }
                    setLoading(true);
                    try {
                        await sendOtp(identifier, otpType);
                        setOtpStep(2);
                        toast.success(`OTP sent to your ${otpType}!`);
                    } catch (err) {
                        setError(err.message);
                    } finally {
                        setLoading(false);
                    }
                } else {
                    const identifier = otpType === 'email' ? email : phone;
                    setLoading(true);
                    try {
                        await verifyOtp(identifier, otp, otpType);
                        toast.success('Login successful!');
                    } catch (err) {
                        setError(err.message);
                    } finally {
                        setLoading(false);
                    }
                }
            }
        } else {
            // Sign Up Multi-Step Logic
            if (signupStep === 1) {
                if (!name || !email || !phone || !password) {
                    setError('Please fill in all fields to create an account.');
                    return;
                }
                if (password.length < 6) {
                    setError('Password should be at least 6 characters.');
                    return;
                }
                
                // Real OTP for Signup
                setLoading(true);
                try {
                    // Send OTP to phone or email based on user preference or default
                    // For signup, let's use the provided phone for verification
                    await sendOtp(phone, 'phone');
                    setSignupStep(2);
                    toast.success('Verification code sent to your phone!');
                } catch (err) {
                    setError(err.message);
                } finally {
                    setLoading(false);
                }
            } else if (signupStep === 2) {
                if (otp.length !== 6 || !/^\d+$/.test(otp)) {
                    setError('Please enter a valid 6-digit OTP.');
                    return;
                }
                
                setLoading(true);
                try {
                    // Verify OTP first, then create account
                    await verifyOtp(phone, otp, 'phone');
                    setSignupStep(3);
                    setError(null);
                    toast.success('Phone verified!');
                } catch (err) {
                    setError('Invalid OTP. Please try again.');
                } finally {
                    setLoading(false);
                }
            } else if (signupStep === 3) {
                if (aadhaar.length !== 12 || !/^\d+$/.test(aadhaar)) {
                    setError('Please enter a valid 12-digit Aadhaar number.');
                    return;
                }

                setLoading(true);
                try {
                    await signup(email, password, name, phone, aadhaar);
                    toast.success('Account created successfully!');
                } catch (err) {
                    console.error('Auth error:', err);
                    let errorMessage = err.message || 'An error occurred';
                    if (errorMessage.includes('auth/email-already-in-use')) {
                        errorMessage = 'This email is already registered. Please sign in instead.';
                        setIsLogin(true);
                        setSignupStep(1);
                    }
                    setError(errorMessage);
                } finally {
                    setLoading(false);
                }
            }
        }
    };

    const handleGoogleSignIn = async () => {
        setLoading(true);
        setError(null);
        try {
            await loginWithGoogle();
        } catch (err) {
            console.error('Google Auth error:', err);
            setError(err.message || 'Failed to sign in with Google');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="login-page">
            {/* Left Side - Welcome Section */}
            <div className="welcome-section">
                <div className="welcome-content">
                    <div className="logo">
                        <div className="logo-icon">💎</div>
                        <div className="logo-text">Fintrust</div>
                    </div>

                    <h1 className="welcome-heading">
                        Welcome to Your<br />
                        Financial Dashboard
                    </h1>

                    <p className="welcome-description">
                        Track your informal loans securely. Build trust with your contacts and manage your money transparently.
                    </p>

                    <div className="feature-cards">
                        <div className="feature-card">
                            <div className="feature-icon">🛡️</div>
                            <div className="feature-content">
                                <h3>Trust First</h3>
                                <p>Build a verifiable financial profile</p>
                            </div>
                        </div>

                        <div className="feature-card">
                            <div className="feature-icon">🤝</div>
                            <div className="feature-content">
                                <h3>Social Approvals</h3>
                                <p>Transactions require mutual consent</p>
                            </div>
                        </div>

                        <div className="feature-card">
                            <div className="feature-icon">📈</div>
                            <div className="feature-content">
                                <h3>Grow Your Score</h3>
                                <p>On-time payments build your Trust Score</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Right Side - Sign In/Up Form */}
            <div className="signin-section">
                <div className="signin-container">
                    <div className="signin-card">
                        <div className="signin-header">
                            <h2 className="signin-title">
                                {isLogin ? (authMode === 'password' ? 'Sign In' : 'OTP Login') : (
                                     signupStep === 1 ? 'Create Account' :
                                         signupStep === 2 ? 'Verify Phone' : 'Link Aadhaar'
                                 )}
                            </h2>
                            <p className="signin-subtitle">
                                {isLogin
                                    ? (authMode === 'password' ? 'Welcome back! Please sign in to continue.' : 'Enter your details to receive a 6-digit code.')
                                    : (
                                         signupStep === 1 ? 'Join FinTrust to track informal loans.' :
                                             signupStep === 2 ? `We've sent an SMS to ${phone}` : 'Identity verification is mandatory for a trusted network.'
                                     )}
                            </p>
                        </div>

                        {/* Mode Toggle for Login */}
                        {isLogin && (
                            <div className="auth-mode-toggle">
                                <button 
                                    className={`mode-btn ${authMode === 'password' ? 'active' : ''}`}
                                    onClick={() => { setAuthMode('password'); setError(null); }}
                                >
                                    Password
                                </button>
                                <button 
                                    className={`mode-btn ${authMode === 'otp' ? 'active' : ''}`}
                                    onClick={() => { setAuthMode('otp'); setOtpStep(1); setError(null); }}
                                >
                                    OTP
                                </button>
                            </div>
                        )}

                        {/* Progress Indicators for Signup */}
                        {!isLogin && (
                            <div className="signup-progress">
                                <div className={`progress-step ${signupStep >= 1 ? 'active' : ''}`}></div>
                                <div className={`progress-step ${signupStep >= 2 ? 'active' : ''}`}></div>
                                <div className={`progress-step ${signupStep >= 3 ? 'active' : ''}`}></div>
                            </div>
                        )}

                        {(isLogin || (!isLogin && signupStep === 1)) && (
                            <>
                                <button type="button" className="google-button" onClick={handleGoogleSignIn} disabled={loading}>
                                    <svg className="google-icon" viewBox="0 0 24 24">
                                        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                                        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                                        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                                        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                                    </svg>
                                    {isLogin ? 'Continue with Google' : 'Sign up with Google'}
                                </button>
                                <div className="divider">or</div>
                            </>
                        )}


                        <form onSubmit={handleSubmit}>
                            {error && (
                                <div className={`auth-alert ${error.includes('sent') ? 'alert-success' : 'alert-error'}`}>
                                    {error}
                                </div>
                            )}

                            {/* SIGNIN PASSWORD OR SIGNUP STEP 1 */}
                            {( (isLogin && authMode === 'password') || (!isLogin && signupStep === 1)) && (
                                <>
                                    {!isLogin && (
                                        <div className="form-group">
                                            <label htmlFor="name" className="form-label">Full Name</label>
                                            <input
                                                type="text"
                                                id="name"
                                                className="form-input"
                                                placeholder="Legal Name (Matches Aadhaar)"
                                                value={name}
                                                onChange={(e) => setName(e.target.value)}
                                                required={!isLogin}
                                                autoComplete="name"
                                            />
                                        </div>
                                    )}

                                    <div className="form-group">
                                        <label htmlFor="email" className="form-label">Email Address</label>
                                        <input
                                            type="email"
                                            id="email"
                                            className="form-input"
                                            placeholder="you@example.com"
                                            value={email}
                                            onChange={(e) => setEmail(e.target.value)}
                                            required
                                            autoComplete="email"
                                        />
                                    </div>

                                    {!isLogin && (
                                        <div className="form-group">
                                            <label htmlFor="phone" className="form-label">Phone Number</label>
                                            <input
                                                type="tel"
                                                id="phone"
                                                className="form-input"
                                                placeholder="+91 98765 43210"
                                                value={phone}
                                                onChange={(e) => setPhone(e.target.value)}
                                                required={!isLogin}
                                                autoComplete="tel"
                                            />
                                        </div>
                                    )}

                                    <div className="form-group">
                                        <label htmlFor="password" className="form-label">Password</label>
                                        <div className="password-wrapper">
                                            <input
                                                type={showPassword ? 'text' : 'password'}
                                                id="password"
                                                className="form-input"
                                                placeholder="Enter your password"
                                                value={password}
                                                onChange={(e) => setPassword(e.target.value)}
                                                required
                                                autoComplete={isLogin ? 'current-password' : 'new-password'}
                                            />
                                            <button
                                                type="button"
                                                className="password-toggle"
                                                onClick={() => setShowPassword(!showPassword)}
                                            >
                                                {showPassword ? '👁️' : '👁️‍🗨️'}
                                            </button>
                                        </div>
                                    </div>

                                    {isLogin && (
                                        <div className="form-row">
                                            <div className="checkbox-wrapper">
                                                <input
                                                    type="checkbox"
                                                    id="remember"
                                                    className="checkbox-input"
                                                    checked={rememberMe}
                                                    onChange={(e) => setRememberMe(e.target.checked)}
                                                />
                                                <label htmlFor="remember" className="checkbox-label">Remember me</label>
                                            </div>
                                            <button
                                                type="button"
                                                className="forgot-link"
                                                onClick={() => toast('Password reset coming soon! Contact support for now.', { icon: '🔒' })}
                                                style={{ background: 'none', border: 'none', cursor: 'pointer' }}
                                            >Forgot password?</button>
                                        </div>
                                    )}
                                </>
                            )}

                            {/* LOGIN WITH OTP */}
                            {isLogin && authMode === 'otp' && (
                                <>
                                    {otpStep === 1 ? (
                                        <>
                                            <div className="otp-type-selector">
                                                <label className="type-btn">
                                                    <input 
                                                        type="radio" 
                                                        name="otpType" 
                                                        checked={otpType === 'email'} 
                                                        onChange={() => setOtpType('email')} 
                                                    />
                                                    Email
                                                </label>
                                                <label className="type-btn">
                                                    <input 
                                                        type="radio" 
                                                        name="otpType" 
                                                        checked={otpType === 'phone'} 
                                                        onChange={() => setOtpType('phone')} 
                                                    />
                                                    SMS
                                                </label>
                                            </div>

                                            {otpType === 'email' ? (
                                                <div className="form-group">
                                                    <label className="form-label">Email Address</label>
                                                    <input
                                                        type="email"
                                                        className="form-input"
                                                        placeholder="you@example.com"
                                                        value={email}
                                                        onChange={(e) => setEmail(e.target.value)}
                                                        required
                                                    />
                                                </div>
                                            ) : (
                                                <div className="form-group">
                                                    <label className="form-label">Phone Number</label>
                                                    <input
                                                        type="tel"
                                                        className="form-input"
                                                        placeholder="+91 98765 43210"
                                                        value={phone}
                                                        onChange={(e) => setPhone(e.target.value)}
                                                        required
                                                    />
                                                </div>
                                            )}
                                        </>
                                    ) : (
                                        <div className="form-group">
                                            <label className="form-label">6-Digit OTP</label>
                                            <input
                                                type="text"
                                                maxLength="6"
                                                className="form-input otp-input"
                                                placeholder="······"
                                                value={otp}
                                                onChange={(e) => setOtp(e.target.value)}
                                                required
                                            />
                                            <p className="otp-hint">Enter the code sent to your {otpType}.</p>
                                            <button type="button" className="resend-link" onClick={() => setOtpStep(1)}>
                                                Change {otpType} or Resend
                                            </button>
                                        </div>
                                    )}
                                </>
                            )}

                            {/* SIGNUP STEP 2: REAL OTP */}
                            {!isLogin && signupStep === 2 && (
                                <div className="form-group">
                                    <label htmlFor="otp" className="form-label">6-Digit OTP</label>
                                    <input
                                        type="text"
                                        id="otp"
                                        maxLength="6"
                                        className="form-input otp-input"
                                        placeholder="······"
                                        value={otp}
                                        onChange={(e) => setOtp(e.target.value)}
                                        required
                                    />
                                    <p className="otp-hint">Check your SMS messages for the code.</p>
                                </div>
                            )}

                            {/* SIGNUP STEP 3: AADHAAR */}
                            {!isLogin && signupStep === 3 && (
                                <div className="form-group">
                                    <label htmlFor="aadhaar" className="form-label">Aadhaar Number</label>
                                    <input
                                        type="text"
                                        id="aadhaar"
                                        maxLength="12"
                                        className="form-input"
                                        placeholder="XXXX XXXX XXXX"
                                        style={{ fontSize: '18px', letterSpacing: '4px', textAlign: 'center' }}
                                        value={aadhaar}
                                        onChange={(e) => setAadhaar(e.target.value)}
                                        required
                                    />
                                    <p style={{ marginTop: '8px', fontSize: '12px', color: '#6B7280' }}>
                                        FinTrust requires identity verification to build a trusted peer-to-peer network.
                                    </p>
                                </div>
                            )}

                            <button type="submit" className="signin-button" disabled={loading}>
                                {loading ? 'Processing...' : (
                                    isLogin ? (authMode === 'password' ? 'Sign In' : (otpStep === 1 ? 'Send OTP' : 'Verify OTP')) :
                                        (signupStep === 1 ? 'Next' : signupStep === 2 ? 'Verify & Continue' : 'Create Account')
                                )}
                                <span>→</span>
                            </button>

                            {/* Back button for multi-step */}
                            {((!isLogin && signupStep > 1) || (isLogin && authMode === 'otp' && otpStep > 1)) && (
                                <button
                                    type="button"
                                    className="btn-back"
                                    onClick={() => {
                                        if (!isLogin) setSignupStep(signupStep - 1);
                                        else setOtpStep(1);
                                    }}
                                >
                                    Back
                                </button>
                            )}
                        </form>

                        <div className="signup-link">
                            {isLogin ? "Don't have an account? " : "Already have an account? "}
                            <a href="#" onClick={(e) => {
                                e.preventDefault();
                                setIsLogin(!isLogin);
                                setSignupStep(1);
                                setAuthMode('password');
                                setOtpStep(1);
                                setError(null);
                            }}>
                                {isLogin ? 'Sign Up' : 'Sign In'}
                            </a>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default LoginSignup;
