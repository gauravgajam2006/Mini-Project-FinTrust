import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../supabase';
import './LandingPage.css';

const LandingPage = () => {
    const navigate = useNavigate();
    const [displayUsers, setDisplayUsers] = useState([]);

    useEffect(() => {
        const fetchDisplayUsers = async () => {
            try {
                const { data, error } = await supabase
                    .from('profiles')
                    .select('name, avatar_url')
                    .limit(5);
                
                if (error) throw error;
                if (data && data.length > 0) {
                    setDisplayUsers(data);
                }
            } catch (err) {
                console.error("Error fetching display users:", err);
            }
        };
        fetchDisplayUsers();
    }, []);

    // Animation variants
    const fadeIn = {
        hidden: { opacity: 0, y: 20 },
        visible: { opacity: 1, y: 0, transition: { duration: 0.6 } }
    };

    const staggerContainer = {
        hidden: { opacity: 0 },
        visible: {
            opacity: 1,
            transition: { staggerChildren: 0.2 }
        }
    };

    return (
        <div className="landing-page">
            {/* Navbar for Landing Page */}
            <nav className="landing-nav">
                <div className="logo-container">
                    <div className="logo-icon glow-effect">🤝</div>
                    <span className="logo-text gradient-text">FinTrust</span>
                </div>
                <div className="nav-actions">
                    <button className="btn-secondary" onClick={() => navigate('/auth')}>Log In</button>
                    <button className="btn-primary" onClick={() => navigate('/auth')}>Sign Up Free</button>
                </div>
            </nav>

            {/* Hero Section */}
            <section className="hero-section">
                <div className="hero-background">
                    <div className="gradient-blob top-right"></div>
                    <div className="gradient-blob bottom-left"></div>
                </div>

                <motion.div
                    className="hero-content"
                    initial="hidden"
                    animate="visible"
                    variants={staggerContainer}
                >
                    <motion.div className="badge-pill" variants={fadeIn}>
                        <span className="badge-icon">✨</span> The New Way to Track Informal Loans
                    </motion.div>

                    <motion.h1 variants={fadeIn}>
                        Manage lending between <br />
                        <span className="primary-text">friends & family</span> with trust.
                    </motion.h1>

                    <motion.p className="hero-subtitle" variants={fadeIn}>
                        FinTrust takes the awkwardness out of personal loans. Track who owes you,
                        what you owe, and build your reliable Trust Score—all in one place.
                    </motion.p>

                    <motion.div className="hero-buttons" variants={fadeIn}>
                        <button className="btn-primary btn-large" onClick={() => navigate('/auth')}>
                            Get Started Now <span className="arrow">→</span>
                        </button>
                        <a href="#features" className="btn-secondary btn-large">
                            See How It Works
                        </a>
                    </motion.div>

                    <motion.div className="social-proof" variants={fadeIn}>
                        <div className="avatars-group">
                            {displayUsers.length > 0 ? (
                                displayUsers.map((u, i) => (
                                    <div key={i} className="avatar">
                                        {u.avatar_url ? (
                                            <img src={u.avatar_url} alt={u.name} className="avatar-img" />
                                        ) : (
                                            u.name?.charAt(0) || 'U'
                                        )}
                                    </div>
                                ))
                            ) : (
                                <>
                                    <div className="avatar">A</div>
                                    <div className="avatar">K</div>
                                    <div className="avatar">P</div>
                                </>
                            )}
                        </div>
                        <span>Join 10,000+ users tracking loans peacefully</span>
                    </motion.div>
                </motion.div>
            </section>

            {/* Features Section */}
            <section id="features" className="features-section">
                <div className="section-header">
                    <h2>Everything you need for personal lending</h2>
                    <p>Simple tools to make tracking money stress-free</p>
                </div>

                <div className="features-grid">
                    <motion.div
                        className="feature-card neon-border"
                        initial="hidden"
                        whileInView="visible"
                        viewport={{ once: true }}
                        variants={fadeIn}
                    >
                        <div className="feature-icon">📊</div>
                        <div className="feature-content">
                            <h3>Clear Dashboard</h3>
                            <p>Track loans and repayments at a single glance with intuitive visual charts.</p>
                        </div>
                    </motion.div>

                    <motion.div
                        className="feature-card neon-border"
                        initial="hidden"
                        whileInView="visible"
                        viewport={{ once: true }}
                        variants={fadeIn}
                    >
                        <div className="feature-icon">🛡️</div>
                        <div className="feature-content">
                            <h3>Trust Score System</h3>
                            <p>Build your reputation with on-time payments and gamified finance features.</p>
                        </div>
                    </motion.div>

                    <motion.div
                        className="feature-card neon-border"
                        initial="hidden"
                        whileInView="visible"
                        viewport={{ once: true }}
                        variants={fadeIn}
                    >
                        <div className="feature-icon">⏰</div>
                        <div className="feature-content">
                            <h3>Smart Reminders</h3>
                            <p>Automated, polite notifications that take the awkwardness out of repayment.</p>
                        </div>
                    </motion.div>

                    <motion.div
                        className="feature-card neon-border"
                        initial="hidden"
                        whileInView="visible"
                        viewport={{ once: true }}
                        variants={fadeIn}
                    >
                        <div className="feature-icon">🌍</div>
                        <div className="feature-content">
                            <h3>Multi-Currency</h3>
                            <p>Manage international loans with auto-calculated exchange rates and conversion tracking.</p>
                        </div>
                    </motion.div>
                </div>
            </section>

            {/* How it Works */}
            <section className="how-it-works">
                <div className="section-header">
                    <h2>How FinTrust Works</h2>
                </div>

                <div className="steps-container">
                    <div className="step">
                        <div className="step-number">🤝</div>
                        <div className="step-content">
                            <h3>Create a Loan</h3>
                            <p>Add the lender, borrower, amount, and due date. It takes less than 30 seconds.</p>
                        </div>
                    </div>
                    <div className="step-connector"></div>
                    <div className="step">
                        <div className="step-number">💳</div>
                        <div className="step-content">
                            <h3>Track Repayments</h3>
                            <p>Log partial or full payments. Both parties see the updated remaining balance.</p>
                        </div>
                    </div>
                    <div className="step-connector"></div>
                    <div className="step">
                        <div className="step-number">💎</div>
                        <div className="step-content">
                            <h3>Earn Badges</h3>
                            <p>Complete loans successfully to earn badges, level up, and boost your Trust Score.</p>
                        </div>
                    </div>
                </div>
            </section>

            {/* CTA Section */}
            <section className="cta-section">
                <h2>Ready to organize your personal loans?</h2>
                <p>Create your free account today and start tracking in minutes.</p>
                <button className="btn-primary btn-large cta-bump" onClick={() => navigate('/auth')}>
                    Create Free Account
                </button>
            </section>

            {/* Footer */}
            <footer className="landing-footer">
                <div className="footer-content">
                    <div className="footer-brand">
                        <div className="logo-container">
                            <div className="logo-icon small">🤝</div>
                            <span className="logo-text gradient-text">FinTrust</span>
                        </div>
                        <p>Building trust in personal finance.</p>
                    </div>
                    <div className="footer-links">
                        <a href="#">Privacy Policy</a>
                        <a href="#">Terms of Service</a>
                        <a href="#">Contact Support</a>
                    </div>
                </div>
                <div className="footer-bottom">
                    <p>&copy; {new Date().getFullYear()} FinTrust. All rights reserved.</p>
                </div>
            </footer>
        </div>
    );
};

export default LandingPage;
