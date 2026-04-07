import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useLoan } from '../context/LoanContext';
import SignaturePad from '../components/SignaturePad';
import RiskScoreDisplay from '../components/RiskScoreDisplay';
import {
  createAgreement,
  runFraudDetection,
  saveRiskAssessment,
  saveSignature,
  updateAgreementStatus,
  completeAgreement,
  fetchMyAgreements,
  fetchAgreementDetails,
  generateAgreementPDF,
  getDocumentSignedURL,
} from '../utils/agreementUtils';
import toast from 'react-hot-toast';
import './LoanAgreement.css';

// ============================================================
// STEP DEFINITIONS
// ============================================================
const STEPS = [
  { id: 1, title: 'Loan Details', icon: '📋', desc: 'Define loan terms' },
  { id: 2, title: 'Borrower Info', icon: '👤', desc: 'Your details (auto-filled)' },
  { id: 3, title: 'Guarantor', icon: '🛡️', desc: 'Guarantor details' },
  { id: 4, title: 'Risk Check', icon: '🔍', desc: 'AI fraud analysis' },
  { id: 5, title: 'Sign', icon: '✍️', desc: 'Digital signature' },
  { id: 6, title: 'Review', icon: '✅', desc: 'Final review' },
];

const LoanAgreement = () => {
  const navigate = useNavigate();
  const { user } = useLoan();

  const [currentStep, setCurrentStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [agreementId, setAgreementId] = useState(null);
  const [riskAssessment, setRiskAssessment] = useState(null);
  const [borrowerSignature, setBorrowerSignature] = useState(null);
  const [isRunningFraud, setIsRunningFraud] = useState(false);
  const [myAgreements, setMyAgreements] = useState([]);
  const [showAgreementsList, setShowAgreementsList] = useState(false);
  const [selectedAgreement, setSelectedAgreement] = useState(null);
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);

  // Form data
  const [formData, setFormData] = useState({
    // Loan details
    principalAmount: '',
    interestRate: '',
    tenureMonths: '',
    repaymentSchedule: 'monthly',
    currency: 'INR',
    purpose: '',
    // Lender
    lenderName: '',
    lenderEmail: '',
    lenderPhone: '',
    // Borrower (auto-filled)
    borrowerName: user?.name || '',
    borrowerEmail: user?.email || '',
    borrowerPhone: user?.phone || '',
    borrowerAadhaar: user?.aadhaar || '',
    borrowerAddress: '',
    // Guarantor
    guarantorName: '',
    guarantorEmail: '',
    guarantorPhone: '',
    guarantorAadhaar: '',
    guarantorAddress: '',
  });

  const [errors, setErrors] = useState({});

  // Auto-fill borrower when user loads
  useEffect(() => {
    if (user) {
      setFormData(prev => ({
        ...prev,
        borrowerName: user.name || '',
        borrowerEmail: user.email || '',
        borrowerPhone: user.phone || '',
        borrowerAadhaar: user.aadhaar || '',
      }));
    }
  }, [user]);

  // Fetch existing agreements
  useEffect(() => {
    loadAgreements();
  }, []);

  const loadAgreements = async () => {
    const result = await fetchMyAgreements();
    if (result.success) {
      setMyAgreements(result.data);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: '' }));
    }
  };

  // ============================================================
  // VALIDATION
  // ============================================================
  const validateStep = (step) => {
    const newErrors = {};

    if (step === 1) {
      if (!formData.principalAmount || parseFloat(formData.principalAmount) <= 0) {
        newErrors.principalAmount = 'Enter a valid loan amount';
      }
      if (!formData.tenureMonths || parseInt(formData.tenureMonths) <= 0) {
        newErrors.tenureMonths = 'Enter valid tenure';
      }
      if (!formData.lenderName.trim()) {
        newErrors.lenderName = 'Lender name is required';
      }
      if (!formData.lenderEmail.trim()) {
        newErrors.lenderEmail = 'Lender email is required';
      } else if (!/\S+@\S+\.\S+/.test(formData.lenderEmail)) {
        newErrors.lenderEmail = 'Enter a valid email';
      }
      if (formData.lenderEmail.toLowerCase() === user?.email?.toLowerCase()) {
        newErrors.lenderEmail = 'Lender cannot be yourself';
      }
    }

    if (step === 2) {
      if (!formData.borrowerName.trim()) newErrors.borrowerName = 'Name is required';
      if (!formData.borrowerEmail.trim()) newErrors.borrowerEmail = 'Email is required';
    }

    if (step === 3) {
      if (!formData.guarantorName.trim()) newErrors.guarantorName = 'Guarantor name is required';
      if (!formData.guarantorEmail.trim()) {
        newErrors.guarantorEmail = 'Guarantor email is required';
      } else if (!/\S+@\S+\.\S+/.test(formData.guarantorEmail)) {
        newErrors.guarantorEmail = 'Enter a valid email';
      }
      if (formData.guarantorEmail.toLowerCase() === user?.email?.toLowerCase()) {
        newErrors.guarantorEmail = 'Guarantor cannot be yourself';
      }
      if (formData.guarantorEmail.toLowerCase() === formData.lenderEmail.toLowerCase()) {
        newErrors.guarantorEmail = 'Guarantor cannot be the lender';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // ============================================================
  // STEP NAVIGATION
  // ============================================================
  const nextStep = async () => {
    if (!validateStep(currentStep)) return;

    // After step 3 (guarantor), create agreement + run fraud check
    if (currentStep === 3) {
      setIsRunningFraud(true);
      setCurrentStep(4);

      try {
        // Create agreement in DB
        const createResult = await createAgreement(formData);
        if (!createResult.success) {
          toast.error('Failed to create agreement: ' + createResult.error);
          setCurrentStep(3);
          setIsRunningFraud(false);
          return;
        }

        setAgreementId(createResult.agreement.id);

        // Run fraud detection
        const fraudResult = await runFraudDetection(
          {
            full_name: formData.guarantorName,
            email: formData.guarantorEmail,
            phone: formData.guarantorPhone,
            aadhaar: formData.guarantorAadhaar,
            address: formData.guarantorAddress,
          },
          {
            borrowerEmail: formData.borrowerEmail,
          }
        );

        setRiskAssessment(fraudResult);

        // Save risk assessment
        await saveRiskAssessment(createResult.agreement.id, fraudResult);

        // Update agreement status
        await updateAgreementStatus(createResult.agreement.id, 'pending_borrower_signature');

        setIsRunningFraud(false);
        toast.success('Fraud analysis complete!');
      } catch (error) {
        console.error('Error in fraud detection:', error);
        toast.error('Fraud detection failed');
        setIsRunningFraud(false);
      }
      return;
    }

    setCurrentStep(prev => Math.min(prev + 1, 6));
  };

  const prevStep = () => {
    if (currentStep === 4 && isRunningFraud) return;
    setCurrentStep(prev => Math.max(prev - 1, 1));
  };

  // ============================================================
  // SIGNATURE HANDLING
  // ============================================================
  const handleSignatureCapture = async (sigData) => {
    setBorrowerSignature(sigData);

    if (agreementId) {
      const result = await saveSignature(agreementId, sigData);
      if (result.success) {
        toast.success('Signature saved!');
      } else {
        toast.error('Failed to save signature');
      }
    }
  };

  const handleOTPVerify = async (otpData) => {
    setBorrowerSignature(otpData);
    if (agreementId) {
      await saveSignature(agreementId, otpData);
      toast.success('OTP verification recorded!');
    }
  };

  // ============================================================
  // FINAL SUBMISSION
  // ============================================================
  const handleFinalSubmit = async () => {
    if (!agreementId) {
      toast.error('No agreement created');
      return;
    }
    if (!borrowerSignature) {
      toast.error('Please provide your signature first');
      setCurrentStep(5);
      return;
    }

    setIsSubmitting(true);
    try {
      // Update status to pending lender review
      await updateAgreementStatus(agreementId, 'pending_lender_review');
      toast.success('Agreement submitted for lender review!');
      
      // Reload agreements list
      await loadAgreements();
      setShowAgreementsList(true);
      setCurrentStep(1);
      
      // Reset form
      setFormData(prev => ({
        ...prev,
        principalAmount: '', interestRate: '', tenureMonths: '',
        repaymentSchedule: 'monthly', purpose: '',
        lenderName: '', lenderEmail: '', lenderPhone: '',
        guarantorName: '', guarantorEmail: '', guarantorPhone: '',
        guarantorAadhaar: '', guarantorAddress: '',
      }));
      setAgreementId(null);
      setRiskAssessment(null);
      setBorrowerSignature(null);
    } catch (error) {
      toast.error('Submission failed: ' + error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // ============================================================
  // LENDER ACTIONS
  // ============================================================
  const handleLenderApprove = async (agId) => {
    try {
      setIsGeneratingPDF(true);
      toast.loading('Generating agreement PDF...', { id: 'pdf-gen' });
      
      const result = await completeAgreement(agId);
      
      if (result.success) {
        toast.dismiss('pdf-gen');
        toast.success('Agreement approved! PDF generated & uploaded.');
        
        // Download PDF
        if (result.pdfDoc) {
          result.pdfDoc.save(`FinTrust_Agreement_${agId.slice(0, 8).toUpperCase()}.pdf`);
        }
        
        await loadAgreements();
      } else {
        toast.dismiss('pdf-gen');
        toast.error('Approval failed: ' + result.error);
      }
    } catch (error) {
      toast.dismiss('pdf-gen');
      toast.error('Error: ' + error.message);
    } finally {
      setIsGeneratingPDF(false);
    }
  };

  const handleLenderReject = async (agId) => {
    try {
      await updateAgreementStatus(agId, 'rejected');
      toast.success('Agreement rejected');
      await loadAgreements();
    } catch (error) {
      toast.error('Error: ' + error.message);
    }
  };

  const handleDownloadPDF = async (agId) => {
    try {
      toast.loading('Generating PDF...', { id: 'dl-pdf' });
      const detailsResult = await fetchAgreementDetails(agId);
      if (!detailsResult.success) throw new Error('Failed to fetch agreement');

      const pdfDoc = generateAgreementPDF(detailsResult.data);
      pdfDoc.save(`FinTrust_Agreement_${agId.slice(0, 8).toUpperCase()}.pdf`);
      toast.dismiss('dl-pdf');
      toast.success('PDF downloaded!');
    } catch (error) {
      toast.dismiss('dl-pdf');
      toast.error('PDF generation failed');
    }
  };

  const handleViewDetails = async (agId) => {
    const result = await fetchAgreementDetails(agId);
    if (result.success) {
      setSelectedAgreement(result.data);
    } else {
      toast.error('Failed to load details');
    }
  };

  // ============================================================
  // STATUS HELPERS
  // ============================================================
  const getStatusBadge = (status) => {
    const statusMap = {
      draft: { label: 'Draft', color: '#6b7280', bg: 'rgba(107,114,128,0.1)' },
      pending_guarantor: { label: 'Pending Guarantor', color: '#f59e0b', bg: 'rgba(245,158,11,0.1)' },
      pending_borrower_signature: { label: 'Pending Signature', color: '#f59e0b', bg: 'rgba(245,158,11,0.1)' },
      pending_lender_review: { label: 'Awaiting Lender', color: '#3b82f6', bg: 'rgba(59,130,246,0.1)' },
      pending_lender_signature: { label: 'Lender Signing', color: '#8b5cf6', bg: 'rgba(139,92,246,0.1)' },
      active: { label: 'Active', color: '#10b981', bg: 'rgba(16,185,129,0.1)' },
      completed: { label: 'Completed', color: '#059669', bg: 'rgba(5,150,105,0.1)' },
      rejected: { label: 'Rejected', color: '#ef4444', bg: 'rgba(239,68,68,0.1)' },
      cancelled: { label: 'Cancelled', color: '#6b7280', bg: 'rgba(107,114,128,0.1)' },
    };
    const info = statusMap[status] || statusMap.draft;
    return (
      <span className="agreement-status-badge" style={{ color: info.color, background: info.bg, borderColor: info.color }}>
        {info.label}
      </span>
    );
  };

  const getRiskBadge = (level) => {
    const map = {
      LOW: { icon: '🟢', color: '#10b981' },
      MEDIUM: { icon: '🟡', color: '#f59e0b' },
      HIGH: { icon: '🔴', color: '#ef4444' },
    };
    const info = map[level] || { icon: '⚪', color: '#6b7280' };
    return <span style={{ color: info.color, fontWeight: 700 }}>{info.icon} {level}</span>;
  };

  // Check if current user is the lender for an agreement
  const isLenderForAgreement = (ag) => {
    return ag.lender_id === user?.id ||
      ag.agreement_parties?.some(p => p.role === 'lender' && p.email?.toLowerCase() === user?.email?.toLowerCase());
  };

  // ============================================================
  // RENDER STEPS
  // ============================================================
  const renderStep = () => {
    switch (currentStep) {
      case 1:
        return (
          <motion.div key="step1" initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }}>
            <div className="form-section-ag">
              <h3 className="section-title-ag">💰 Loan Terms</h3>
              <div className="form-grid-ag">
                <div className="form-group-ag">
                  <label>Principal Amount (₹) *</label>
                  <input type="number" name="principalAmount" value={formData.principalAmount} onChange={handleChange}
                    placeholder="e.g. 50000" min="100" className={errors.principalAmount ? 'input-error' : ''} />
                  {errors.principalAmount && <span className="error-msg">{errors.principalAmount}</span>}
                </div>
                <div className="form-group-ag">
                  <label>Interest Rate (% p.a.)</label>
                  <input type="number" name="interestRate" value={formData.interestRate} onChange={handleChange}
                    placeholder="e.g. 12" min="0" max="100" step="0.5" />
                </div>
                <div className="form-group-ag">
                  <label>Tenure (Months) *</label>
                  <input type="number" name="tenureMonths" value={formData.tenureMonths} onChange={handleChange}
                    placeholder="e.g. 12" min="1" max="360" className={errors.tenureMonths ? 'input-error' : ''} />
                  {errors.tenureMonths && <span className="error-msg">{errors.tenureMonths}</span>}
                </div>
                <div className="form-group-ag">
                  <label>Repayment Schedule</label>
                  <select name="repaymentSchedule" value={formData.repaymentSchedule} onChange={handleChange}>
                    <option value="monthly">Monthly</option>
                    <option value="weekly">Weekly</option>
                    <option value="quarterly">Quarterly</option>
                    <option value="emi">EMI</option>
                    <option value="lump_sum">Lump Sum</option>
                  </select>
                </div>
              </div>
              <div className="form-group-ag full-width">
                <label>Purpose / Description</label>
                <textarea name="purpose" value={formData.purpose} onChange={handleChange}
                  placeholder="e.g. Home renovation, Education expenses..." rows="3" />
              </div>
            </div>

            <div className="form-section-ag">
              <h3 className="section-title-ag">🏦 Lender Information</h3>
              <div className="form-grid-ag">
                <div className="form-group-ag">
                  <label>Lender Name *</label>
                  <input type="text" name="lenderName" value={formData.lenderName} onChange={handleChange}
                    placeholder="Full name of lender" className={errors.lenderName ? 'input-error' : ''} />
                  {errors.lenderName && <span className="error-msg">{errors.lenderName}</span>}
                </div>
                <div className="form-group-ag">
                  <label>Lender Email *</label>
                  <input type="email" name="lenderEmail" value={formData.lenderEmail} onChange={handleChange}
                    placeholder="lender@email.com" className={errors.lenderEmail ? 'input-error' : ''} />
                  {errors.lenderEmail && <span className="error-msg">{errors.lenderEmail}</span>}
                </div>
                <div className="form-group-ag">
                  <label>Lender Phone</label>
                  <input type="tel" name="lenderPhone" value={formData.lenderPhone} onChange={handleChange}
                    placeholder="+91 XXXXX XXXXX" />
                </div>
              </div>
            </div>
          </motion.div>
        );

      case 2:
        return (
          <motion.div key="step2" initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }}>
            <div className="form-section-ag">
              <h3 className="section-title-ag">👤 Borrower Details <span className="auto-tag">Auto-filled</span></h3>
              <div className="form-grid-ag">
                <div className="form-group-ag">
                  <label>Full Name *</label>
                  <input type="text" name="borrowerName" value={formData.borrowerName} onChange={handleChange}
                    className={errors.borrowerName ? 'input-error' : ''} />
                  {errors.borrowerName && <span className="error-msg">{errors.borrowerName}</span>}
                </div>
                <div className="form-group-ag">
                  <label>Email *</label>
                  <input type="email" name="borrowerEmail" value={formData.borrowerEmail} onChange={handleChange}
                    className={errors.borrowerEmail ? 'input-error' : ''} readOnly />
                  {errors.borrowerEmail && <span className="error-msg">{errors.borrowerEmail}</span>}
                </div>
                <div className="form-group-ag">
                  <label>Phone</label>
                  <input type="tel" name="borrowerPhone" value={formData.borrowerPhone} onChange={handleChange}
                    placeholder="+91 XXXXX XXXXX" />
                </div>
                <div className="form-group-ag">
                  <label>Aadhaar Number</label>
                  <input type="text" name="borrowerAadhaar" value={formData.borrowerAadhaar} onChange={handleChange}
                    placeholder="XXXX XXXX XXXX" maxLength={14} />
                </div>
              </div>
              <div className="form-group-ag full-width">
                <label>Address</label>
                <textarea name="borrowerAddress" value={formData.borrowerAddress} onChange={handleChange}
                  placeholder="Full residential address" rows="2" />
              </div>
            </div>
          </motion.div>
        );

      case 3:
        return (
          <motion.div key="step3" initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }}>
            <div className="form-section-ag">
              <h3 className="section-title-ag">🛡️ Guarantor Details <span className="required-tag">Mandatory</span></h3>
              <p className="section-desc-ag">A guarantor is required for all loan agreements. This person vouches for the borrower's repayment.</p>
              <div className="form-grid-ag">
                <div className="form-group-ag">
                  <label>Full Name *</label>
                  <input type="text" name="guarantorName" value={formData.guarantorName} onChange={handleChange}
                    placeholder="Guarantor's full name" className={errors.guarantorName ? 'input-error' : ''} />
                  {errors.guarantorName && <span className="error-msg">{errors.guarantorName}</span>}
                </div>
                <div className="form-group-ag">
                  <label>Email *</label>
                  <input type="email" name="guarantorEmail" value={formData.guarantorEmail} onChange={handleChange}
                    placeholder="guarantor@email.com" className={errors.guarantorEmail ? 'input-error' : ''} />
                  {errors.guarantorEmail && <span className="error-msg">{errors.guarantorEmail}</span>}
                </div>
                <div className="form-group-ag">
                  <label>Phone</label>
                  <input type="tel" name="guarantorPhone" value={formData.guarantorPhone} onChange={handleChange}
                    placeholder="+91 XXXXX XXXXX" />
                </div>
                <div className="form-group-ag">
                  <label>Aadhaar Number</label>
                  <input type="text" name="guarantorAadhaar" value={formData.guarantorAadhaar} onChange={handleChange}
                    placeholder="XXXX XXXX XXXX" maxLength={14} />
                </div>
              </div>
              <div className="form-group-ag full-width">
                <label>Address</label>
                <textarea name="guarantorAddress" value={formData.guarantorAddress} onChange={handleChange}
                  placeholder="Full residential address" rows="2" />
              </div>
            </div>
          </motion.div>
        );

      case 4:
        return (
          <motion.div key="step4" initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }}>
            <div className="form-section-ag">
              <h3 className="section-title-ag">🔍 AI Fraud Detection</h3>
              {isRunningFraud ? (
                <div className="fraud-loading">
                  <div className="fraud-spinner">
                    <div className="spinner-ring"></div>
                    <div className="spinner-ring delay-1"></div>
                    <div className="spinner-ring delay-2"></div>
                  </div>
                  <h4>Running AI Fraud Analysis...</h4>
                  <p>Checking guarantor identity, duplicates, and patterns</p>
                  <div className="fraud-checks-anim">
                    {['Checking duplicate guarantors...', 'Validating email patterns...', 'Analyzing phone number...', 'Verifying identity documents...', 'Calculating risk score...'].map((check, i) => (
                      <motion.div
                        key={i}
                        className="fraud-check-item"
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.6 }}
                      >
                        <span className="check-dot"></span> {check}
                      </motion.div>
                    ))}
                  </div>
                </div>
              ) : riskAssessment ? (
                <RiskScoreDisplay assessment={riskAssessment} />
              ) : (
                <p>Risk assessment will appear here after guarantor details are submitted.</p>
              )}
            </div>
          </motion.div>
        );

      case 5:
        return (
          <motion.div key="step5" initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }}>
            <div className="form-section-ag">
              <h3 className="section-title-ag">✍️ Digital Consent & Signature</h3>

              <div className="consent-box">
                <h4>📜 Declaration</h4>
                <p>
                  I, <strong>{formData.borrowerName}</strong>, hereby declare that all the information provided
                  in this loan agreement is true and accurate to the best of my knowledge. I agree to the terms
                  of repayment as outlined, with a principal amount of <strong>₹{Number(formData.principalAmount).toLocaleString('en-IN')}</strong> at
                  an interest rate of <strong>{formData.interestRate || 0}% p.a.</strong> over <strong>{formData.tenureMonths} month(s)</strong>.
                </p>
                <p>
                  I understand that failure to repay may result in legal action and will affect my trust score on the FinTrust platform.
                </p>
              </div>

              <SignaturePad
                signerName={formData.borrowerName}
                onSignatureCapture={handleSignatureCapture}
                onOTPVerify={handleOTPVerify}
                existingSignature={borrowerSignature?.type === 'canvas' ? borrowerSignature.image : null}
              />

              {borrowerSignature && (
                <motion.div className="signature-confirmed" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}>
                  ✅ {borrowerSignature.type === 'canvas' ? 'Signature captured' : 'OTP verified'} successfully
                </motion.div>
              )}
            </div>
          </motion.div>
        );

      case 6:
        return (
          <motion.div key="step6" initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }}>
            <div className="form-section-ag">
              <h3 className="section-title-ag">✅ Review & Submit</h3>

              <div className="review-grid">
                <div className="review-card">
                  <h4>💰 Loan Terms</h4>
                  <div className="review-item"><span>Amount:</span><strong>₹{Number(formData.principalAmount).toLocaleString('en-IN')}</strong></div>
                  <div className="review-item"><span>Interest:</span><strong>{formData.interestRate || 0}% p.a.</strong></div>
                  <div className="review-item"><span>Tenure:</span><strong>{formData.tenureMonths} months</strong></div>
                  <div className="review-item"><span>Schedule:</span><strong>{formData.repaymentSchedule}</strong></div>
                  <div className="review-item"><span>Purpose:</span><strong>{formData.purpose || 'N/A'}</strong></div>
                </div>

                <div className="review-card">
                  <h4>👤 Borrower</h4>
                  <div className="review-item"><span>Name:</span><strong>{formData.borrowerName}</strong></div>
                  <div className="review-item"><span>Email:</span><strong>{formData.borrowerEmail}</strong></div>
                  <div className="review-item"><span>Phone:</span><strong>{formData.borrowerPhone || 'N/A'}</strong></div>
                  <div className="review-item"><span>Signed:</span><strong>{borrowerSignature ? '✅ Yes' : '❌ No'}</strong></div>
                </div>

                <div className="review-card">
                  <h4>🏦 Lender</h4>
                  <div className="review-item"><span>Name:</span><strong>{formData.lenderName}</strong></div>
                  <div className="review-item"><span>Email:</span><strong>{formData.lenderEmail}</strong></div>
                  <div className="review-item"><span>Phone:</span><strong>{formData.lenderPhone || 'N/A'}</strong></div>
                </div>

                <div className="review-card">
                  <h4>🛡️ Guarantor</h4>
                  <div className="review-item"><span>Name:</span><strong>{formData.guarantorName}</strong></div>
                  <div className="review-item"><span>Email:</span><strong>{formData.guarantorEmail}</strong></div>
                  <div className="review-item"><span>Phone:</span><strong>{formData.guarantorPhone || 'N/A'}</strong></div>
                </div>
              </div>

              {riskAssessment && (
                <div className="review-risk-summary">
                  <RiskScoreDisplay assessment={riskAssessment} compact />
                </div>
              )}
            </div>
          </motion.div>
        );

      default:
        return null;
    }
  };

  // ============================================================
  // MAIN RENDER
  // ============================================================
  return (
    <div className="loan-agreement-page">
      <div className="page-header-ag">
        <div className="header-left-ag">
          <h1>📄 Loan Agreements</h1>
          <p>Create verified loan agreements with digital signatures & AI fraud detection</p>
        </div>
        <div className="header-actions-ag">
          <button
            className={`toggle-view-btn ${showAgreementsList ? '' : 'active'}`}
            onClick={() => { setShowAgreementsList(false); setSelectedAgreement(null); }}
          >
            ➕ New Agreement
          </button>
          <button
            className={`toggle-view-btn ${showAgreementsList ? 'active' : ''}`}
            onClick={() => { setShowAgreementsList(true); setSelectedAgreement(null); loadAgreements(); }}
          >
            📋 My Agreements {myAgreements.length > 0 && <span className="count-badge">{myAgreements.length}</span>}
          </button>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {showAgreementsList ? (
          <motion.div key="list" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}>
            {/* AGREEMENT DETAILS MODAL */}
            {selectedAgreement && (
              <div className="agreement-detail-overlay" onClick={() => setSelectedAgreement(null)}>
                <motion.div className="agreement-detail-modal" onClick={e => e.stopPropagation()}
                  initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}>
                  <button className="close-modal-btn" onClick={() => setSelectedAgreement(null)}>✕</button>
                  <h2>Agreement Details</h2>
                  <div className="detail-grid">
                    <div className="detail-row"><span>ID:</span><strong>{selectedAgreement.id?.slice(0, 8).toUpperCase()}</strong></div>
                    <div className="detail-row"><span>Amount:</span><strong>₹{Number(selectedAgreement.principal_amount).toLocaleString('en-IN')}</strong></div>
                    <div className="detail-row"><span>Interest:</span><strong>{selectedAgreement.interest_rate}% p.a.</strong></div>
                    <div className="detail-row"><span>Tenure:</span><strong>{selectedAgreement.tenure_months} months</strong></div>
                    <div className="detail-row"><span>Status:</span>{getStatusBadge(selectedAgreement.status)}</div>
                    <div className="detail-row"><span>Risk:</span><strong>{selectedAgreement.risk_level ? getRiskBadge(selectedAgreement.risk_level) : 'N/A'}</strong></div>
                  </div>
                  <h3 style={{ margin: '1rem 0 0.5rem' }}>Parties</h3>
                  {selectedAgreement.parties?.map((p, i) => (
                    <div key={i} className="detail-party">
                      <span className="party-role-badge">{p.role}</span>
                      <span>{p.full_name}</span>
                      <span className="party-email">{p.email}</span>
                    </div>
                  ))}
                  {selectedAgreement.risk_assessment && (
                    <>
                      <h3 style={{ margin: '1rem 0 0.5rem' }}>Risk Assessment</h3>
                      <RiskScoreDisplay assessment={selectedAgreement.risk_assessment} />
                    </>
                  )}
                  <div className="detail-actions">
                    <button className="btn-primary" onClick={() => handleDownloadPDF(selectedAgreement.id)}>
                      📥 Download PDF
                    </button>
                  </div>
                </motion.div>
              </div>
            )}

            {/* AGREEMENTS LIST */}
            <div className="agreements-list">
              {myAgreements.length === 0 ? (
                <div className="empty-agreements">
                  <span className="empty-icon">📄</span>
                  <h3>No agreements yet</h3>
                  <p>Create your first verified loan agreement</p>
                  <button className="btn-primary" onClick={() => setShowAgreementsList(false)}>
                    ➕ Create Agreement
                  </button>
                </div>
              ) : (
                myAgreements.map((ag, idx) => (
                  <motion.div
                    key={ag.id}
                    className="agreement-card"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.08 }}
                  >
                    <div className="ag-card-header">
                      <div className="ag-card-id">
                        #{ag.id?.slice(0, 8).toUpperCase()}
                        <span className="ag-card-date">
                          {new Date(ag.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </span>
                      </div>
                      {getStatusBadge(ag.status)}
                    </div>
                    <div className="ag-card-body">
                      <div className="ag-card-amount">₹{Number(ag.principal_amount).toLocaleString('en-IN')}</div>
                      <div className="ag-card-details">
                        <span>{ag.interest_rate || 0}% p.a.</span>
                        <span>•</span>
                        <span>{ag.tenure_months} mo</span>
                        <span>•</span>
                        <span>{ag.repayment_schedule}</span>
                      </div>
                      <div className="ag-card-parties">
                        {ag.agreement_parties?.map((p, i) => (
                          <span key={i} className={`party-chip role-${p.role}`}>{p.role}: {p.full_name}</span>
                        ))}
                      </div>
                      {ag.risk_assessments?.[0] && (
                        <div className="ag-card-risk">
                          Risk: {getRiskBadge(ag.risk_assessments[0].risk_level)} ({ag.risk_assessments[0].overall_score}/100)
                        </div>
                      )}
                    </div>
                    <div className="ag-card-actions">
                      <button className="ag-btn ag-btn-view" onClick={() => handleViewDetails(ag.id)}>👁️ Details</button>
                      <button className="ag-btn ag-btn-pdf" onClick={() => handleDownloadPDF(ag.id)}>📥 PDF</button>
                      
                      {/* Lender approve/reject buttons */}
                      {ag.status === 'pending_lender_review' && isLenderForAgreement(ag) && (
                        <>
                          <button className="ag-btn ag-btn-approve" onClick={() => handleLenderApprove(ag.id)} disabled={isGeneratingPDF}>
                            ✅ Approve & Sign
                          </button>
                          <button className="ag-btn ag-btn-reject" onClick={() => handleLenderReject(ag.id)}>
                            ❌ Reject
                          </button>
                        </>
                      )}
                    </div>

                  </motion.div>
                ))
              )}
            </div>
          </motion.div>
        ) : (
          <motion.div key="form" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}>
            {/* STEPPER */}
            <div className="stepper-ag">
              {STEPS.map((step, idx) => (
                <div
                  key={step.id}
                  className={`stepper-item ${currentStep === step.id ? 'active' : ''} ${currentStep > step.id ? 'completed' : ''}`}
                >
                  <div className="stepper-circle">
                    {currentStep > step.id ? '✓' : step.icon}
                  </div>
                  <div className="stepper-info">
                    <span className="stepper-label">{step.title}</span>
                    <span className="stepper-desc">{step.desc}</span>
                  </div>
                  {idx < STEPS.length - 1 && <div className="stepper-line" />}
                </div>
              ))}
            </div>

            {/* FORM CONTENT */}
            <div className="agreement-form-card">
              <AnimatePresence mode="wait">
                {renderStep()}
              </AnimatePresence>
            </div>

            {/* NAVIGATION */}
            <div className="form-nav-ag">
              <button className="btn-secondary" onClick={prevStep} disabled={currentStep === 1}>
                ← Previous
              </button>
              <div className="step-indicator">
                Step {currentStep} of {STEPS.length}
              </div>
              {currentStep < 6 ? (
                <button
                  className="btn-primary"
                  onClick={nextStep}
                  disabled={isRunningFraud || (currentStep === 4 && isRunningFraud)}
                >
                  {currentStep === 3 ? '🔍 Run Fraud Check & Continue' : 'Next →'}
                </button>
              ) : (
                <button
                  className="btn-primary submit-final-btn"
                  onClick={handleFinalSubmit}
                  disabled={isSubmitting || !borrowerSignature}
                >
                  {isSubmitting ? '⏳ Submitting...' : '🚀 Submit for Lender Review'}
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default LoanAgreement;
