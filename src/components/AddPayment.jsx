import { useState } from 'react';
import { validatePayment, formatCurrency } from '../utils/loanValidation';
import MockPayment from './MockPayment';
import './AddPayment.css';

const AddPayment = ({ loanId, outstandingAmount, onPaymentAdded, onCancel }) => {
    const [formData, setFormData] = useState({
        amount: '',
        date: new Date().toISOString().split('T')[0], // Today's date
        note: ''
    });

    const [errors, setErrors] = useState({});
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [showGateway, setShowGateway] = useState(false);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));

        // Clear error when user types
        if (errors[name]) {
            setErrors(prev => ({ ...prev, [name]: '' }));
        }
    };

    const handleSubmit = (e) => {
        e.preventDefault();

        const amount = parseFloat(formData.amount);

        if (!amount || amount <= 0) {
            setErrors({ amount: "Enter a valid amount" });
            return;
        }

        const validation = validatePayment({
            ...formData,
            amount
        }, outstandingAmount);

        if (!validation.isValid) {
            setErrors(validation.errors);
            return;
        }

        // 🚀 OPEN FAKE PAYMENT GATEWAY
        setShowGateway(true);
    };

    const handlePaymentSuccess = async (paymentResult) => {
        setShowGateway(false);
        setIsSubmitting(true);

        const paymentData = {
            ...formData,
            amount: parseFloat(formData.amount) || 0,
            transactionId: paymentResult.transactionId
        };

        try {
            await onPaymentAdded(paymentData);
            // Reset form
            setFormData({
                amount: '',
                date: new Date().toISOString().split('T')[0],
                note: ''
            });
            setErrors({});
        } catch (error) {
            setErrors({ submit: error.message });
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="add-payment-card">
            <div className="payment-header">
                <h3>💰 Add Payment</h3>
                <div className="outstanding-badge">
                    Outstanding: {formatCurrency(outstandingAmount)}
                </div>
            </div>

            <form onSubmit={handleSubmit} className="payment-form">
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
                            max={outstandingAmount}
                            className={errors.amount ? 'error' : ''}
                        />
                        {errors.amount && <span className="error-text">{errors.amount}</span>}
                    </div>

                    <div className="form-group">
                        <label>Payment Date *</label>
                        <input
                            type="date"
                            name="date"
                            value={formData.date}
                            onChange={handleChange}
                            className={errors.date ? 'error' : ''}
                        />
                        {errors.date && <span className="error-text">{errors.date}</span>}
                    </div>
                </div>



                <div className="form-group">
                    <label>Note (Optional)</label>
                    <textarea
                        name="note"
                        value={formData.note}
                        onChange={handleChange}
                        placeholder="Add any notes about this payment..."
                        rows="3"
                    />
                </div>

                {errors.submit && <div className="error-text">{errors.submit}</div>}

                <div className="form-actions">
                    <button type="button" className="btn-secondary" onClick={onCancel}>
                        Cancel
                    </button>
                    <button type="submit" className="btn-primary" disabled={isSubmitting || showGateway}>
                        {isSubmitting ? 'Adding...' : '✓ Add Payment'}
                    </button>
                </div>
            </form>

            {showGateway && (
                <MockPayment
                    loan={{ id: loanId }}
                    amount={parseFloat(formData.amount) || 0}
                    onSuccess={handlePaymentSuccess}
                    onCancel={() => setShowGateway(false)}
                />
            )}
        </div>
    );
};

export default AddPayment;
