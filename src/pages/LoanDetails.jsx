import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useLoan } from '../context/LoanContext';
import { formatCurrency, formatDate, getDaysUntilDue } from '../utils/loanValidation';
import AddPayment from '../components/AddPayment';
import LoadingSpinner from '../components/LoadingSpinner';
import './LoanDetails.css';

const LoanDetails = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const { user, loans, deleteLoan, updateLoan, addRepayment, getLoanDetails, getRepaymentsByLoan, calculateOutstandingAmount } = useLoan();
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [showPaymentForm, setShowPaymentForm] = useState(false);

    // Reactively compute loan data from context state
    const loan = getLoanDetails(id);
    const outstandingAmount = calculateOutstandingAmount(id);

    useEffect(() => {
        if (!loan && !showDeleteModal) {
            navigate('/loans');
        }
    }, [loan, navigate, showDeleteModal]);

    const handleAddPayment = async (paymentData) => {
        const result = await addRepayment(id, paymentData);
        if (result.success) {
            setShowPaymentForm(false);
        } else {
            throw new Error(result.error);
        }
    };

    const handleDelete = async () => {
        const result = await deleteLoan(id);
        if (result.success) {
            navigate('/loans');
        }
    };

    const markAsCompleted = async () => {
        await updateLoan(id, { status: 'completed', amountPaid: loan.amount });
    };

    const handleApprove = async () => {
        await updateLoan(id, { status: 'active' });
    };

    const handleReject = async () => {
        await updateLoan(id, { status: 'rejected' });
    };

    if (!loan || !user) return <LoadingSpinner />;

    const personName = loan.type === 'lent' ? loan.borrowerName : loan.lenderName;
    const isReceiver = loan.created_by !== user.id; // Did someone else create this?
    const isBorrower = loan.type === 'borrowed';
    const daysRemaining = getDaysUntilDue(loan.dueDate);
    const progress = (loan.amountPaid / loan.amount) * 100;

    return (
        <div className="loan-details">
            <div className="details-header">
                <button onClick={() => navigate('/loans')} className="back-button">
                    ← Back to Loans
                </button>
                <div className="header-actions">
                    {loan.status === 'pending_approval' && isReceiver && (
                        <>
                            <button onClick={handleApprove} className="btn-primary" style={{ marginRight: '0.5rem', background: '#10B981', borderColor: '#10B981' }}>
                                ✅ Approve Loan
                            </button>
                            <button onClick={handleReject} className="btn-secondary" style={{ marginRight: '0.5rem', color: '#EF4444', borderColor: '#EF4444' }}>
                                ❌ Reject
                            </button>
                        </>
                    )}
                    {loan.status === 'pending_approval' && !isReceiver && (
                        <span style={{ marginRight: '1rem', color: '#F59E0B', fontWeight: 'bold' }}>⏳ Waiting for {personName} to approve</span>
                    )}

                    {(loan.status === 'active' || loan.status === 'overdue') && (
                        <button
                            onClick={() => {
                                const message = `Hi ${personName}, just a friendly reminder that the ${loan.type === 'lent' ? 'repayment' : 'payment'} of ${formatCurrency(loan.amount)} is due on ${new Date(loan.dueDate).toLocaleDateString()}. Thank you!`;
                                alert(`✅ Reminder sent to ${personName}!\n\nMessage content:\n${message}`);
                            }}
                            className="btn-secondary"
                            style={{ marginRight: '0.5rem' }}
                        >
                            📨 Remind
                        </button>
                    )}
                    {loan.user_id === user.id && (
                        <Link to={`/loan/${id}/edit`} className="btn-primary">
                            ✏️ Edit
                        </Link>
                    )}
                    {loan.user_id === user.id && (
                        <button onClick={() => setShowDeleteModal(true)} className="btn-danger">
                            🗑️ Delete
                        </button>
                    )}
                </div>
            </div>

            <div className="details-grid">
                {/* Payment Section - Shows for active/overdue loans */}
                {(loan.status === 'active' || loan.status === 'overdue') && (
                    <div className="payment-section-full">
                        {!showPaymentForm ? (
                            <div className="outstanding-card">
                                <div className="outstanding-header">
                                    <h3>Outstanding Balance</h3>
                                    <div className="outstanding-amount-large">
                                        {formatCurrency(outstandingAmount)}
                                    </div>
                                    <div className="outstanding-breakdown">
                                        <span>Total: {formatCurrency(loan.amount)}</span>
                                        <span>Paid: {formatCurrency(loan.amountPaid)}</span>
                                    </div>
                                </div>
                                {isBorrower && (
                                    <button onClick={() => setShowPaymentForm(true)} className="btn-add-payment">
                                        💳 Add Payment
                                    </button>
                                )}
                            </div>
                        ) : (
                            <AddPayment
                                loanId={id}
                                outstandingAmount={outstandingAmount}
                                onPaymentAdded={handleAddPayment}
                                onCancel={() => setShowPaymentForm(false)}
                            />
                        )}
                    </div>
                )}

                {/* Main Info Card */}
                <div className="details-card main-card">
                    <div className="card-header">
                        <div className="loan-person-info">
                            <div className="loan-avatar-large">{personName.charAt(0)}</div>
                            <div>
                                <h2>{personName}</h2>
                                <span className={`loan-type-badge ${loan.type}`}>
                                    {loan.type === 'lent' ? '↗️ Money Lent' : '↙️ Money Borrowed'}
                                </span>
                            </div>
                        </div>
                        <span className={`status-badge-large ${loan.status}`}>{loan.status}</span>
                    </div>

                    <div className="amount-section">
                        <div className="amount-label">Total Amount</div>
                        <div className="amount-value">{formatCurrency(loan.amount)}</div>
                        {loan.interestRate > 0 && (
                            <div className="interest-info">Interest Rate: {loan.interestRate}%</div>
                        )}
                    </div>

                    {loan.metadata && loan.metadata.originalCurrency && (
                        <div className="foreign-currency-info-box">
                            <h4>💱 International Transaction Details</h4>
                            <div className="fc-grid">
                                <div className="fc-item">
                                    <span>Original Amount:</span>
                                    <strong>{loan.metadata.originalAmount} {loan.metadata.originalCurrency}</strong>
                                </div>
                                <div className="fc-item">
                                    <span>Exchange Rate:</span>
                                    <span>1 {loan.metadata.originalCurrency} = ₹{loan.metadata.exchangeRate}</span>
                                </div>
                                <div className="fc-item">
                                    <span>Conversion Fee (2%):</span>
                                    <span>₹{loan.metadata.conversionFee}</span>
                                </div>
                            </div>
                        </div>
                    )}

                    <div className="progress-section">
                        <div className="progress-header">
                            <span>Payment Progress</span>
                            <span>{progress.toFixed(0)}%</span>
                        </div>
                        <div className="progress-bar-large">
                            <div className="progress-fill" style={{ width: `${progress}%` }}></div>
                        </div>
                        <div className="progress-amounts">
                            <span>Paid: {formatCurrency(loan.amountPaid)}</span>
                            <span>Remaining: {formatCurrency(loan.amount - loan.amountPaid)}</span>
                        </div>
                    </div>

                    {loan.description && (
                        <div className="description-section">
                            <h4>Description</h4>
                            <p>{loan.description}</p>
                        </div>
                    )}

                    {loan.status === 'active' && isBorrower && (
                        <div className="finalize-loan-box">
                            <h4>Finalize Loan</h4>
                            <p>To finalize this loan, please add a formal payment record for the remaining balance.</p>
                            <button onClick={() => {
                                setShowPaymentForm(true);
                                window.scrollTo({ top: 0, behavior: 'smooth' });
                            }} className="btn-primary" style={{ width: '100%' }}>
                                ✓ Mark Repayment as Done
                            </button>
                        </div>
                    )}
                </div>

                {/* Sidebar Info */}
                <div className="details-sidebar">
                    <div className="details-card">
                        <h3>Loan Information</h3>
                        <div className="info-list">
                            <div className="info-item">
                                <span className="info-label">Created On</span>
                                <span className="info-value">{formatDate(loan.createdAt)}</span>
                            </div>
                            <div className="info-item">
                                <span className="info-label">Due Date</span>
                                <span className="info-value">{formatDate(loan.dueDate)}</span>
                            </div>
                            {loan.status === 'active' && (
                                <div className="info-item">
                                    <span className="info-label">Days Until Due</span>
                                    <span className={`info-value ${daysRemaining < 0 ? 'overdue' : 'active'}`}>
                                        {daysRemaining < 0 ? `${Math.abs(daysRemaining)} days overdue` : `${daysRemaining} days`}
                                    </span>
                                </div>
                            )}
                            <div className="info-item">
                                <span className="info-label">Repayment Schedule</span>
                                <span className="info-value">{loan.repaymentSchedule}</span>
                            </div>
                            <div className="info-item">
                                <span className="info-label">Loan ID</span>
                                <span className="info-value">#{loan.id}</span>
                            </div>
                        </div>
                    </div>

                    {loan.payments && loan.payments.length > 0 && (
                        <div className="details-card">
                            <h3>Payment History ({loan.payments.length})</h3>
                            <div className="payments-list">
                                {getRepaymentsByLoan(id).map((payment) => (
                                    <div key={payment.id} className="payment-item">
                                        <div className="payment-info">
                                            <div className="payment-amount">{formatCurrency(payment.amount)}</div>
                                            <div className="payment-date">{formatDate(payment.date)}</div>
                                            {payment.method && (
                                                <div className="payment-method">via {payment.method}</div>
                                            )}
                                            {payment.note && (
                                                <div className="payment-note">"{payment.note}"</div>
                                            )}
                                        </div>
                                        <span className="payment-status">✓</span>
                                    </div>
                                ))}
                            </div>
                            <div className="payment-total">
                                <strong>Total Paid:</strong> {formatCurrency(loan.amountPaid)}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Delete Modal */}
            {showDeleteModal && createPortal(
                <div className="modal-overlay fade-in" onClick={() => setShowDeleteModal(false)}>
                    <div className="modal-content scale-in premium-modal" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-warning-icon">
                            ⚠️
                        </div>
                        <h3>Delete Loan Record?</h3>
                        <p className="modal-warning-text">
                            Are you absolutely sure you want to delete this loan? 
                            <br/><br/>
                            <strong style={{ color: '#EF4444' }}>This action is permanent and cannot be undone.</strong> All associated payment history will also be removed.
                        </p>
                        <div className="modal-actions">
                            <button onClick={() => setShowDeleteModal(false)} className="btn-secondary modal-btn cancel-btn">
                                Cancel
                            </button>
                            <button onClick={handleDelete} className="btn-danger modal-btn confirm-btn">
                                Yes, Delete It
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
};

export default LoanDetails;
