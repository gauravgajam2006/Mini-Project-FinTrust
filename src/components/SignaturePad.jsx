import { useRef, useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import './SignaturePad.css';

const SignaturePad = ({ onSignatureCapture, onOTPVerify, signerName = 'Signer', existingSignature = null }) => {
  const canvasRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);
  const [signatureMode, setSignatureMode] = useState('canvas'); // 'canvas' or 'otp'
  const [otpSent, setOtpSent] = useState(false);
  const [otpValue, setOtpValue] = useState('');
  const [otpTimer, setOtpTimer] = useState(0);
  const [otpVerified, setOtpVerified] = useState(false);
  const [generatedOTP, setGeneratedOTP] = useState('');

  // Initialize canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    const rect = canvas.parentElement.getBoundingClientRect();
    
    canvas.width = rect.width - 4;
    canvas.height = 180;
    
    ctx.fillStyle = '#fafafa';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Draw baseline
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(20, canvas.height - 40);
    ctx.lineTo(canvas.width - 20, canvas.height - 40);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 2.5;
  }, [signatureMode]);

  const getCoordinates = useCallback((e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    if (e.touches) {
      return {
        x: (e.touches[0].clientX - rect.left) * scaleX,
        y: (e.touches[0].clientY - rect.top) * scaleY,
      };
    }
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  }, []);

  const startDrawing = useCallback((e) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const { x, y } = getCoordinates(e);
    
    ctx.beginPath();
    ctx.moveTo(x, y);
    setIsDrawing(true);
  }, [getCoordinates]);

  const draw = useCallback((e) => {
    if (!isDrawing) return;
    e.preventDefault();
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const { x, y } = getCoordinates(e);
    
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 2.5;
    ctx.lineTo(x, y);
    ctx.stroke();
    setHasSignature(true);
  }, [isDrawing, getCoordinates]);

  const stopDrawing = useCallback(() => {
    setIsDrawing(false);
  }, []);

  const clearSignature = () => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    
    ctx.fillStyle = '#fafafa';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Redraw baseline
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(20, canvas.height - 40);
    ctx.lineTo(canvas.width - 20, canvas.height - 40);
    ctx.stroke();
    ctx.setLineDash([]);
    
    setHasSignature(false);
  };

  const confirmSignature = () => {
    const canvas = canvasRef.current;
    const dataUrl = canvas.toDataURL('image/png');
    onSignatureCapture?.({
      type: 'canvas',
      image: dataUrl,
    });
  };

  // OTP Logic
  const sendOTP = () => {
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    setGeneratedOTP(otp);
    setOtpSent(true);
    setOtpTimer(120);

    // In production, this would call an edge function to send SMS/email
    // For demo, show OTP in a toast
    console.log(`[DEV] OTP for ${signerName}: ${otp}`);
    
    // Start countdown
    const interval = setInterval(() => {
      setOtpTimer(prev => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const verifyOTP = () => {
    if (otpValue === generatedOTP) {
      setOtpVerified(true);
      onOTPVerify?.({ type: 'otp', verified: true });
    } else {
      setOtpVerified(false);
      alert('Invalid OTP. Please try again.');
    }
  };

  return (
    <div className="signature-pad-container">
      <div className="signature-header">
        <div className="signature-icon">✍️</div>
        <div>
          <h3 className="signature-title">Digital Signature</h3>
          <p className="signature-subtitle">Sign as: <strong>{signerName}</strong></p>
        </div>
      </div>

      {/* Mode Toggle */}
      <div className="signature-mode-toggle">
        <button
          type="button"
          className={`mode-btn ${signatureMode === 'canvas' ? 'active' : ''}`}
          onClick={() => setSignatureMode('canvas')}
        >
          <span>🖊️</span> Draw Signature
        </button>
        <button
          type="button"
          className={`mode-btn ${signatureMode === 'otp' ? 'active' : ''}`}
          onClick={() => setSignatureMode('otp')}
        >
          <span>🔐</span> OTP Verification
        </button>
      </div>

      <AnimatePresence mode="wait">
        {signatureMode === 'canvas' ? (
          <motion.div
            key="canvas"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="signature-canvas-area"
          >
            {existingSignature ? (
              <div className="existing-signature">
                <img src={existingSignature} alt="Existing Signature" />
                <p className="signed-label">✅ Signature captured</p>
              </div>
            ) : (
              <>
                <div className="canvas-wrapper">
                  <canvas
                    ref={canvasRef}
                    onMouseDown={startDrawing}
                    onMouseMove={draw}
                    onMouseUp={stopDrawing}
                    onMouseLeave={stopDrawing}
                    onTouchStart={startDrawing}
                    onTouchMove={draw}
                    onTouchEnd={stopDrawing}
                    className="signature-canvas"
                  />
                  {!hasSignature && (
                    <div className="canvas-placeholder">
                      <span>Draw your signature here</span>
                    </div>
                  )}
                </div>

                <div className="canvas-actions">
                  <button type="button" className="sig-btn sig-btn-clear" onClick={clearSignature} disabled={!hasSignature}>
                    🗑️ Clear
                  </button>
                  <button type="button" className="sig-btn sig-btn-confirm" onClick={confirmSignature} disabled={!hasSignature}>
                    ✅ Confirm Signature
                  </button>
                </div>
              </>
            )}
          </motion.div>
        ) : (
          <motion.div
            key="otp"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="signature-otp-area"
          >
            {otpVerified ? (
              <div className="otp-verified">
                <div className="verified-icon">✅</div>
                <h4>OTP Verified Successfully</h4>
                <p>Your identity has been digitally verified</p>
              </div>
            ) : (
              <>
                <p className="otp-info">
                  A 6-digit OTP will be generated for identity verification. 
                  In production, this will be sent to the registered phone/email.
                </p>

                {!otpSent ? (
                  <button type="button" className="sig-btn sig-btn-send-otp" onClick={sendOTP}>
                    📩 Generate OTP
                  </button>
                ) : (
                  <div className="otp-input-area">
                    <div className="otp-timer">
                      {otpTimer > 0 ? (
                        <span>⏱️ OTP valid for: {Math.floor(otpTimer / 60)}:{(otpTimer % 60).toString().padStart(2, '0')}</span>
                      ) : (
                        <span className="otp-expired">OTP expired. <button type="button" onClick={sendOTP}>Resend</button></span>
                      )}
                    </div>
                    
                    <p className="otp-dev-hint">
                      🔑 Dev OTP: <strong>{generatedOTP}</strong>
                    </p>

                    <div className="otp-input-group">
                      <input
                        type="text"
                        value={otpValue}
                        onChange={(e) => setOtpValue(e.target.value.replace(/\D/g, '').slice(0, 6))}
                        placeholder="Enter 6-digit OTP"
                        maxLength={6}
                        className="otp-input"
                      />
                      <button
                        type="button"
                        className="sig-btn sig-btn-verify"
                        onClick={verifyOTP}
                        disabled={otpValue.length !== 6 || otpTimer === 0}
                      >
                        Verify ✓
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default SignaturePad;
