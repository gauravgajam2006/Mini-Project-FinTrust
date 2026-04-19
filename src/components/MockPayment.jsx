import React, { useState, useRef, useEffect } from 'react';
import { useLoan } from '../context/LoanContext';
import './MockPayment.css';

const MockPayment = ({ loan, amount, onSuccess, onCancel }) => {
    const { createDemoOrder, verifyDemoPayment } = useLoan();
    
    // initializing, methods, processing, verifying, success, failed
    const [step, setStep] = useState('initializing'); 
    const [selectedMethod, setSelectedMethod] = useState('upi');
    const [orderInfo, setOrderInfo] = useState(null);
    
    // Form Inputs
    const [upiId, setUpiId] = useState('');
    const [cardNumber, setCardNumber] = useState('');
    const [cardExpiry, setCardExpiry] = useState('');
    const [cardCvv, setCardCvv] = useState('');
    
    const [isProcessing, setIsProcessing] = useState(false);
    const [transactionId, setTransactionId] = useState('');
    const [errorMsg, setErrorMsg] = useState('');
    const processingRef = useRef(false);

    useEffect(() => {
        // Initialize Demo Order
        const initOrder = async () => {
            try {
                // If createDemoOrder is not directly available (e.g., if there's no LoanProvider context for some reason), fallback
                const orderGenerator = createDemoOrder || (async (amt) => ({ order_id: `ord_${Date.now()}` }));
                const order = await orderGenerator(amount, 'INR', loan?.id);
                setOrderInfo(order);
                setStep('methods');
            } catch (err) {
                setErrorMsg('Failed to initialize mock payment order');
                setStep('failed');
            }
        };
        initOrder();
        
        return () => {
            processingRef.current = false;
        };
    }, [amount, loan, createDemoOrder]);

    const paymentMethods = [
        { id: 'upi', name: 'UPI', icon: '📱' },
        { id: 'card', name: 'Card', icon: '💳' },
        { id: 'netbanking', name: 'Net Banking', icon: '🏦' },
        { id: 'wallet', name: 'Wallet', icon: '👛' }
    ];

    const upiApps = [
        { id: 'gpay', name: 'GPay', icon: '🔵' },
        { id: 'phonepe', name: 'PhonePe', icon: '🟣' },
        { id: 'paytm', name: 'Paytm', icon: '🔷' },
        { id: 'bhim', name: 'BHIM', icon: '🟢' }
    ];

    const validateInputs = () => {
        if (amount <= 0) return { valid: false, error: "Demo amount cannot be 0" };
        if (selectedMethod === 'upi') {
            const isValidUpi = /^[a-zA-Z0-9.\-_]{2,}@[a-zA-Z]{3,}$/.test(upiId);
            if (!isValidUpi) return { valid: false, error: "Please enter a valid UPI ID (e.g. user@okhdfc)" };
        } else if (selectedMethod === 'card') {
            if (cardNumber.replace(/\s/g, '').length !== 16) return { valid: false, error: "Enter a valid 16-digit card number" };
            if (!/^\d{2}\/\d{2}$/.test(cardExpiry)) return { valid: false, error: "Enter valid expiry (MM/YY)" };
            if (cardCvv.length < 3) return { valid: false, error: "Enter a valid CVV" };
        }
        return { valid: true };
    };

    const handlePayment = async () => {
        if (processingRef.current) return;
        
        setErrorMsg('');
        const validation = validateInputs();
        if (!validation.valid) {
            setErrorMsg(validation.error);
            return;
        }
        
        processingRef.current = true;
        setIsProcessing(true);
        setStep('processing');
        
        const generatedTxnId = window.crypto?.randomUUID?.() || `txn_${Date.now()}`;
        setTransactionId(generatedTxnId);

        // 1. Simulate gateway processing
        setTimeout(async () => {
            // 90% success rate for demo purposes
            const networkSuccess = Math.random() > 0.1;
            
            if (!networkSuccess) {
                setErrorMsg('Simulated network/bank failure. Please try again.');
                setStep('failed');
                processingRef.current = false;
                setIsProcessing(false);
                return;
            }

            // Generate mock payment IDs and signatures
            const mockPaymentId = `pay_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
            const mockSignature = btoa(`${orderInfo.order_id}|${mockPaymentId}`);

            setStep('verifying');

            // 2. Simulate Backend Verification
            try {
                // Wait array to fake delay if verifyDemoPayment is not defined
                const verificationSim = verifyDemoPayment 
                    ? await verifyDemoPayment(orderInfo.order_id, mockPaymentId, mockSignature)
                    : { success: true };
                
                if (verificationSim.success) {
                    setStep('success');
                    
                    const paymentData = {
                        paymentId: mockPaymentId,
                        orderId: orderInfo.order_id,
                        transactionId: generatedTxnId,
                        amount: amount,
                        method: selectedMethod === 'upi' ? `UPI (${upiId || 'App'})` : selectedMethod.toUpperCase(),
                        timestamp: new Date().toISOString(),
                        status: 'success'
                    };

                    // Call success callback
                    setTimeout(() => {
                        if (processingRef.current) {
                            onSuccess(paymentData);
                            processingRef.current = false;
                            setIsProcessing(false);
                        }
                    }, 1500);
                } else {
                    setErrorMsg('Payment verification failed! Security check did not pass.');
                    setStep('failed');
                    processingRef.current = false;
                    setIsProcessing(false);
                }
            } catch (err) {
                setErrorMsg('Internal error during verification');
                setStep('failed');
                processingRef.current = false;
                setIsProcessing(false);
            }
            
        }, 2000);
    };

    // Format card number 0000 0000 0000 0000
    const handleCardNumberChange = (e) => {
        const val = e.target.value.replace(/\D/g, '').substring(0, 16);
        const formatted = val.replace(/(\d{4})(?=\d)/g, '$1 ').trim();
        setCardNumber(formatted);
    };

    const handleExpiryChange = (e) => {
        let val = e.target.value.replace(/\D/g, '').substring(0, 4);
        if (val.length >= 2) {
            val = val.substring(0, 2) + '/' + val.substring(2, 4);
        }
        setCardExpiry(val);
    };

    return (
        <div className="mock-payment-overlay">
            <div className="mock-payment-modal professional-gateway">
                
                {/* Gateway Sidebar (Left) */}
                <div className="gateway-sidebar">
                    <div className="gateway-logo">
                        <h3>FINTRUST</h3>
                        <span className="gateway-badge">TEST MODE</span>
                    </div>
                    
                    <div className="payment-methods-list">
                        {paymentMethods.map(method => (
                            <button 
                                key={method.id}
                                className={`method-tab ${selectedMethod === method.id ? 'active' : ''}`}
                                onClick={() => setSelectedMethod(method.id)}
                                disabled={isProcessing || step !== 'methods'}
                            >
                                <span className="method-icon">{method.icon}</span>
                                {method.name}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Gateway Main Form (Right) */}
                <div className="gateway-content">
                    <div className="gateway-header">
                        <div className="gateway-amount-box">
                            <span className="gateway-amount">₹{(amount || 0).toLocaleString()}</span>
                            <div className="gateway-order-id">
                                {orderInfo ? `Order: ${orderInfo.order_id}` : 'Generating order...'}
                            </div>
                        </div>
                        <button className="gateway-close" onClick={onCancel} disabled={isProcessing}>✕</button>
                    </div>

                    <div className="gateway-body">
                        {step === 'initializing' && (
                            <div className="gateway-loading">
                                <div className="spinner"></div>
                                <p>Initializing Secure Payment...</p>
                            </div>
                        )}

                        {step === 'methods' && (
                            <div className="gateway-form-section fade-in">
                                {errorMsg && <div className="gateway-error">{errorMsg}</div>}
                                
                                {selectedMethod === 'upi' && (
                                    <div className="form-group upi-form">
                                        <label>Pay via UPI</label>
                                        <input 
                                            type="text" 
                                            placeholder="Enter UPI ID (e.g., success@upi)" 
                                            value={upiId}
                                            onChange={(e) => setUpiId(e.target.value)}
                                            className="gateway-input"
                                        />
                                        <div className="upi-apps-row">
                                            {upiApps.map(app => (
                                                <div key={app.id} className="quick-app" onClick={() => setUpiId(`success@${app.id}`)}>
                                                    <span className="quick-app-icon">{app.icon}</span> {app.name}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {selectedMethod === 'card' && (
                                    <div className="form-group card-form">
                                        <label>Card Number</label>
                                        <input 
                                            type="text" 
                                            placeholder="0000 0000 0000 0000" 
                                            value={cardNumber}
                                            onChange={handleCardNumberChange}
                                            className="gateway-input font-mono"
                                        />
                                        <div className="card-row">
                                            <div>
                                                <label>Expiry</label>
                                                <input 
                                                    type="text" 
                                                    placeholder="MM/YY" 
                                                    value={cardExpiry}
                                                    onChange={handleExpiryChange}
                                                    className="gateway-input font-mono"
                                                />
                                            </div>
                                            <div>
                                                <label>CVV</label>
                                                <input 
                                                    type="password" 
                                                    placeholder="123" 
                                                    maxLength="4"
                                                    value={cardCvv}
                                                    onChange={(e) => setCardCvv(e.target.value.replace(/\D/g, ''))}
                                                    className="gateway-input font-mono"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {selectedMethod === 'netbanking' && (
                                    <div className="form-group">
                                        <label>Select Bank</label>
                                        <select className="gateway-input">
                                            <option>State Bank of India</option>
                                            <option>HDFC Bank</option>
                                            <option>ICICI Bank</option>
                                            <option>Axis Bank</option>
                                            <option>Kotak Mahindra Bank</option>
                                        </select>
                                    </div>
                                )}

                                {selectedMethod === 'wallet' && (
                                    <div className="form-group">
                                        <label>Select Mobile Wallet</label>
                                        <select className="gateway-input">
                                            <option>Amazon Pay</option>
                                            <option>Mobikwik</option>
                                            <option>Freecharge</option>
                                            <option>JioMoney</option>
                                        </select>
                                    </div>
                                )}

                                <button className="gateway-pay-btn" onClick={handlePayment}>
                                    Pay ₹{(amount || 0).toLocaleString()}
                                </button>
                            </div>
                        )}

                        {step === 'processing' && (
                            <div className="gateway-status fade-in">
                                <div className="spinner"></div>
                                <h4>Processing Payment</h4>
                                <p>Please don't close this window or press back</p>
                            </div>
                        )}

                        {step === 'verifying' && (
                            <div className="gateway-status fade-in">
                                <div className="spinner verifying-spinner"></div>
                                <h4>Verifying Security Signature</h4>
                                <p>Confirming payment authenticity...</p>
                            </div>
                        )}

                        {step === 'success' && (
                            <div className="gateway-status success fade-in">
                                <div className="success-circle">
                                    <svg viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" fill="currentColor"/></svg>
                                </div>
                                <h4 className="success-text">Payment Successful</h4>
                                <p className="success-subtext">Signature Verified • Txn: {transactionId}</p>
                            </div>
                        )}

                        {step === 'failed' && (
                            <div className="gateway-status failed fade-in">
                                <div className="failed-circle">✕</div>
                                <h4 className="failed-text">Payment Failed</h4>
                                <p className="failed-subtext">{errorMsg || 'Transaction was declined.'}</p>
                                <button className="gateway-retry-btn" onClick={() => { setStep('methods'); setErrorMsg(''); processingRef.current = false; setIsProcessing(false); }}>
                                    Retry Payment
                                </button>
                            </div>
                        )}
                    </div>

                    <div className="gateway-footer">
                        <div className="demo-warning">
                            ⚠️ <strong>Demo Payment Gateway</strong> — No real money is involved
                        </div>
                        <div className="secure-badge">
                            🔒 Secured by FinTrust
                        </div>
                    </div>
                </div>

            </div>
        </div>
    );
};

export default MockPayment;
