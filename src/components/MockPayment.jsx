import React, { useState } from 'react';
import './MockPayment.css';

const MockPayment = ({ loan, amount, onSuccess, onCancel }) => {
    const [step, setStep] = useState('methods'); // methods, processing, success, failed
    const [selectedMethod, setSelectedMethod] = useState('upi');
    const [upiId, setUpiId] = useState('');
    const [isProcessing, setIsProcessing] = useState(false); // Prevents duplicate payment triggers

    const paymentMethods = [
        { id: 'upi', name: 'UPI', icon: '📱', description: 'Pay via UPI apps' },
        { id: 'card', name: 'Card', icon: '💳', description: 'Debit/Credit Card' },
        { id: 'netbanking', name: 'Net Banking', icon: '🏦', description: 'Online Banking' },
        { id: 'wallet', name: 'Wallet', icon: '👛', description: 'Digital Wallets' }
    ];

    const upiApps = [
        { id: 'gpay', name: 'Google Pay', icon: '🔵' },
        { id: 'phonepe', name: 'PhonePe', icon: '🟣' },
        { id: 'paytm', name: 'Paytm', icon: '🔷' },
        { id: 'bhim', name: 'BHIM', icon: '🟢' }
    ];

    const handlePayment = () => {
        // Prevent duplicate payment triggers
        if (isProcessing) return;
        setIsProcessing(true);
        setStep('processing');

        // Simulate payment processing (2 seconds)
        setTimeout(() => {
            // 95% success rate for demo
            const success = Math.random() > 0.05;

            if (success) {
                setStep('success');

                // Generate mock payment data with unique transaction_id
                const paymentData = {
                    paymentId: `PAY${Date.now()}`,
                    transactionId: crypto.randomUUID(),
                    amount: amount,
                    method: selectedMethod === 'upi' ? `UPI (${upiId || 'success@upi'})` : selectedMethod,
                    timestamp: new Date().toISOString(),
                    status: 'success'
                };

                // Call success callback after short delay
                setTimeout(() => {
                    onSuccess(paymentData);
                }, 1500);
            } else {
                setStep('failed');
                setIsProcessing(false); // Allow retry on failure
            }
        }, 2000);
    };

    const generateQRCode = () => {
        // Mock QR code data
        const qrData = `upi://pay?pa=fintrust@upi&pn=FINTRUST&am=${amount}&cu=INR&tn=Loan Payment`;
        return qrData;
    };

    return (
        <div className="mock-payment-overlay">
            <div className="mock-payment-modal">
                {/* Header */}
                <div className="payment-header">
                    <h2>💎 FINTRUST Payment</h2>
                    <button className="payment-close" onClick={onCancel}>✕</button>
                </div>

                {/* Amount Display */}
                <div className="payment-amount">
                    <div className="amount-label">Amount to Pay</div>
                    <div className="amount-value">₹{amount.toLocaleString()}</div>
                    <div className="amount-detail">Loan ID: {loan.id}</div>
                </div>

                {/* Payment Methods Step */}
                {step === 'methods' && (
                    <div className="payment-content">
                        <div className="payment-methods">
                            <h3>Select Payment Method</h3>
                            <div className="methods-grid">
                                {paymentMethods.map(method => (
                                    <div
                                        key={method.id}
                                        className={`method-card ${selectedMethod === method.id ? 'selected' : ''}`}
                                        onClick={() => setSelectedMethod(method.id)}
                                    >
                                        <div className="method-icon">{method.icon}</div>
                                        <div className="method-name">{method.name}</div>
                                        <div className="method-desc">{method.description}</div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* UPI Details */}
                        {selectedMethod === 'upi' && (
                            <div className="upi-section">
                                <h4>Pay via UPI</h4>

                                {/* UPI ID Input */}
                                <div className="upi-input-group">
                                    <input
                                        type="text"
                                        placeholder="Enter UPI ID (e.g., yourname@upi)"
                                        value={upiId}
                                        onChange={(e) => setUpiId(e.target.value)}
                                        className="upi-input"
                                    />
                                    <div className="upi-hint">Or scan QR code with any UPI app</div>
                                </div>

                                {/* QR Code */}
                                <div className="qr-code-section">
                                    <div className="qr-code">
                                        <div className="qr-placeholder">
                                            <div className="qr-grid">
                                                {[...Array(9)].map((_, i) => (
                                                    <div key={i} className="qr-dot"></div>
                                                ))}
                                            </div>
                                            <div className="qr-text">SCAN TO PAY</div>
                                        </div>
                                    </div>
                                    <div className="qr-label">Scan with any UPI app</div>
                                </div>

                                {/* UPI Apps */}
                                <div className="upi-apps">
                                    {upiApps.map(app => (
                                        <div key={app.id} className={`upi-app ${isProcessing ? 'disabled' : ''}`} onClick={!isProcessing ? handlePayment : undefined}>
                                            <div className="app-icon">{app.icon}</div>
                                            <div className="app-name">{app.name}</div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Other Methods */}
                        {selectedMethod !== 'upi' && (
                            <div className="other-method-section">
                                <div className="method-form">
                                    <p className="method-info">
                                        {selectedMethod === 'card' && '💳 Enter your card details to proceed'}
                                        {selectedMethod === 'netbanking' && '🏦 Select your bank to continue'}
                                        {selectedMethod === 'wallet' && '👛 Choose your wallet provider'}
                                    </p>
                                    <button className="btn-proceed" onClick={handlePayment} disabled={isProcessing}>
                                        {isProcessing ? 'Processing...' : `Proceed with ${selectedMethod}`}
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* Pay Button for UPI */}
                        {selectedMethod === 'upi' && (
                            <button
                                className="btn-pay"
                                onClick={handlePayment}
                                disabled={isProcessing || (!upiId && selectedMethod === 'upi')}
                            >
                                {isProcessing ? 'Processing...' : `Pay ₹${amount.toLocaleString()}`}
                            </button>
                        )}
                    </div>
                )}

                {/* Processing Step */}
                {step === 'processing' && (
                    <div className="payment-processing">
                        <div className="processing-animation">
                            <div className="spinner"></div>
                        </div>
                        <h3>Processing Payment...</h3>
                        <p>Please wait while we process your payment</p>
                        <div className="processing-dots">
                            <span></span>
                            <span></span>
                            <span></span>
                        </div>
                    </div>
                )}

                {/* Success Step */}
                {step === 'success' && (
                    <div className="payment-success">
                        <div className="success-icon">✓</div>
                        <h3>Payment Successful!</h3>
                        <p>Your payment has been processed successfully</p>
                        <div className="success-amount">₹{amount.toLocaleString()}</div>
                        <div className="success-details">
                            <div className="detail-row">
                                <span>Payment Method:</span>
                                <span>{selectedMethod.toUpperCase()}</span>
                            </div>
                            <div className="detail-row">
                                <span>Transaction ID:</span>
                                <span>TXN{Math.random().toString(36).substr(2, 9).toUpperCase()}</span>
                            </div>
                            <div className="detail-row">
                                <span>Date & Time:</span>
                                <span>{new Date().toLocaleString()}</span>
                            </div>
                        </div>
                    </div>
                )}

                {/* Failed Step */}
                {step === 'failed' && (
                    <div className="payment-failed">
                        <div className="failed-icon">✕</div>
                        <h3>Payment Failed</h3>
                        <p>Unable to process your payment. Please try again.</p>
                        <div className="failed-actions">
                            <button className="btn-retry" onClick={() => { setStep('methods'); setIsProcessing(false); }}>
                                Try Again
                            </button>
                            <button className="btn-cancel-failed" onClick={onCancel}>
                                Cancel
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default MockPayment;
