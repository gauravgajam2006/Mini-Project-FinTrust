import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useLoan } from '../context/LoanContext';
import { validateLoanData } from '../utils/loanValidation';
import LoadingSpinner from '../components/LoadingSpinner';
import '../pages/CreateLoan.css';

const UpdateLoan = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const { getLoanDetails, updateLoan, user } = useLoan();

    const [formData, setFormData] = useState(null);
    const [errors, setErrors] = useState({});
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        const loanData = getLoanDetails(id);
        if (loanData) {
            // Pre-fill form with existing loan data
            setFormData({
                type: loanData.type,
                amount: loanData.amount,
                borrowerName: loanData.type === 'lent' ? loanData.borrowerName : loanData.lenderName,
                borrowerEmail: loanData.type === 'lent' ? loanData.borrowerEmail : loanData.lenderEmail,
                lenderName: user.name,
                lenderEmail: user.email,
                interestRate: loanData.interestRate,
                dueDate: loanData.dueDate,
                description: loanData.description,
                repaymentSchedule: loanData.repaymentSchedule,
                status: loanData.status
            });
        } else {
            navigate('/loans');
        }
    }, [id, getLoanDetails, navigate, user]);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));

        if (errors[name]) {
            setErrors(prev => ({ ...prev, [name]: '' }));
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        const loanData = {
            ...formData,
            amount: parseFloat(formData.amount),
            interestRate: parseFloat(formData.interestRate) || 0,
        };

        if (formData.type === 'borrowed') {
            loanData.lenderName = formData.borrowerName;
            loanData.lenderEmail = formData.borrowerEmail;
            loanData.borrowerName = user.name;
            loanData.borrowerEmail = user.email;
        }

        const validation = validateLoanData(loanData);

        if (!validation.isValid) {
            setErrors(validation.errors);
            return;
        }

        setIsSubmitting(true);
        const result = await updateLoan(id, loanData);

        if (result.success) {
            navigate(`/loan/${id}`);
        } else {
            alert('Failed to update loan: ' + result.error);
            setIsSubmitting(false);
        }
    };

    if (!formData) return <LoadingSpinner />;

    return (
        <div className="create-loan">
            <div className="page-header">
                <h1>✏️ Edit Loan</h1>
                <p>Update loan information</p>
            </div>

            <div className="loan-form-card">
                <form onSubmit={handleSubmit}>
                    {/* Contact Information */}
                    <div className="form-section">
                        <h3>{formData.type === 'lent' ? 'Borrower' : 'Lender'} Information</h3>
                        <div className="form-row">
                            <div className="form-group">
                                <label>Name *</label>
                                <input
                                    type="text"
                                    name="borrowerName"
                                    value={formData.borrowerName}
                                    onChange={handleChange}
                                    placeholder="Enter name"
                                    className={errors.borrowerName ? 'error' : ''}
                                />
                                {errors.borrowerName && <span className="error-text">{errors.borrowerName}</span>}
                            </div>

                            <div className="form-group">
                                <label>Email</label>
                                <input
                                    type="email"
                                    name="borrowerEmail"
                                    value={formData.borrowerEmail}
                                    onChange={handleChange}
                                    placeholder="email@example.com"
                                    className={errors.borrowerEmail ? 'error' : ''}
                                />
                                {errors.borrowerEmail && <span className="error-text">{errors.borrowerEmail}</span>}
                            </div>
                        </div>
                    </div>

                    {/* Loan Details */}
                    <div className="form-section">
                        <h3>Loan Details</h3>
                        <div className="form-row">
                            <div className="form-group">
                                <label>Amount (₹) *</label>
                                <input
                                    type="number"
                                    name="amount"
                                    value={formData.amount}
                                    onChange={handleChange}
                                    placeholder="0.00"
                                    min="0"
                                    step="0.01"
                                    className={errors.amount ? 'error' : ''}
                                />
                                {errors.amount && <span className="error-text">{errors.amount}</span>}
                            </div>

                            <div className="form-group">
                                <label>Interest Rate (%)</label>
                                <input
                                    type="number"
                                    name="interestRate"
                                    value={formData.interestRate}
                                    onChange={handleChange}
                                    placeholder="0"
                                    min="0"
                                    max="100"
                                    step="0.1"
                                />
                            </div>
                        </div>

                        <div className="form-row">
                            <div className="form-group">
                                <label>Due Date *</label>
                                <input
                                    type="date"
                                    name="dueDate"
                                    value={formData.dueDate}
                                    onChange={handleChange}
                                    className={errors.dueDate ? 'error' : ''}
                                />
                                {errors.dueDate && <span className="error-text">{errors.dueDate}</span>}
                            </div>

                            <div className="form-group">
                                <label>Repayment Schedule *</label>
                                <select
                                    name="repaymentSchedule"
                                    value={formData.repaymentSchedule}
                                    onChange={handleChange}
                                >
                                    <option value="lump_sum">Lump Sum (One-time payment)</option>
                                    <option value="emi">EMI (Equated Monthly Installment)</option>
                                    <option value="monthly">Monthly</option>
                                    <option value="weekly">Weekly</option>
                                </select>
                            </div>
                        </div>

                        <div className="form-row">
                            <div className="form-group">
                                <label>Status</label>
                                <select
                                    name="status"
                                    value={formData.status}
                                    onChange={handleChange}
                                >
                                    <option value="active">Active</option>
                                    <option value="completed">Completed</option>
                                    <option value="overdue">Overdue</option>
                                </select>
                            </div>
                        </div>

                        <div className="form-group">
                            <label>Description / Notes</label>
                            <textarea
                                name="description"
                                value={formData.description}
                                onChange={handleChange}
                                placeholder="Add any notes about this loan..."
                                rows="4"
                            />
                        </div>
                    </div>

                    <div className="form-actions">
                        <button type="button" className="btn-secondary" onClick={() => navigate(`/loan/${id}`)}>
                            Cancel
                        </button>
                        <button type="submit" className="btn-primary" disabled={isSubmitting}>
                            {isSubmitting ? 'Saving...' : '✓ Save Changes'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default UpdateLoan;
