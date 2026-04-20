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
            // Safety Check: Double verify that the user accessing this form is the lender.
            if (loanData.type !== 'lent') {
                navigate('/loans');
                return;
            }

            // ONLY prefill what they are allowed to edit
            setFormData({
                interestRate: loanData.interestRate,
                dueDate: loanData.dueDate
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

        const updates = {
            interestRate: parseFloat(formData.interestRate) || 0,
            dueDate: formData.dueDate
        };

        if (!updates.dueDate) {
            setErrors({ dueDate: 'Due Date is required' });
            return;
        }

        setIsSubmitting(true);
        // Only passing the restricted fields.
        const result = await updateLoan(id, updates);

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
                <h1>✏️ Edit Loan Terms</h1>
                <p>Modify specific loan conditions</p>
                <div style={{ padding: '1rem', background: 'rgba(245, 158, 11, 0.1)', border: '1px solid #F59E0B', borderRadius: '8px', marginTop: '1rem', color: '#B45309' }}>
                    <strong>Note:</strong> Due to security and finality rules, lenders can only modify the Interest Rate and the Due Date.
                </div>
            </div>

            <div className="loan-form-card">
                <form onSubmit={handleSubmit}>
                    <div className="form-section">
                        <h3>Adjustable Terms</h3>
                        <div className="form-row">
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
