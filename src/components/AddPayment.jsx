import { useState } from 'react';
import { validatePayment, formatCurrency } from '../utils/loanValidation';
import './AddPayment.css';

const AddPayment = ({ loanId, outstandingAmount, onPaymentAdded, onCancel }) => {
    const [formData, setFormData] = useState({
        amount: '',
        date: new Date().toISOString().split('T')[0], // Today's date
        method: 'Bank Transfer',
        note: ''
    });

    const [errors, setErrors] = useState({});
    const [isSubmitting, setIsSubmitting] = useState(false);

    const paymentMethods = ['Bank Transfer', 'UPI', 'Check', 'Other'];

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));

        // Clear error when user types
        if (errors[name]) {
            setErrors(prev => ({ ...prev, [name]: '' }));
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        const generatedTxnId = window.crypto?.randomUUID?.() || `txn_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

        const paymentData = {
            ...formData,
            amount: parseFloat(formData.amount),
            transactionId: generatedTxnId
        };

        // Validate
        const validation = validatePayment(paymentData, outstandingAmount);

        if (!validation.isValid) {
            setErrors(validation.errors);
            return;
        }

        setIsSubmitting(true);

        try {
            await onPaymentAdded(paymentData);
            // Reset form
            setFormData({
                amount: '',
                date: new Date().toISOString().split('T')[0],
                method: 'Bank Transfer',
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
                    <label>Payment Method *</label>
                    <select
                        name="method"
                        value={formData.method}
                        onChange={handleChange}
                    >
                        {paymentMethods.map(method => (
                            <option key={method} value={method}>{method}</option>
                        ))}
                    </select>
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
                    <button type="submit" className="btn-primary" disabled={isSubmitting}>
                        {isSubmitting ? 'Adding...' : '✓ Add Payment'}
                    </button>
                </div>
            </form>
        </div>
    );
};

export default AddPayment;
