import { useState, useEffect } from 'react';
import CreatableSelect from 'react-select/creatable';
import { useNavigate } from 'react-router-dom';
import { useLoan } from '../context/LoanContext';
import { validateLoanData } from '../utils/loanValidation';
import { supabase } from '../supabase';
import toast from 'react-hot-toast';
import './CreateLoan.css';

const CreateLoan = () => {
    const navigate = useNavigate();
    const { createLoan, user, gamification } = useLoan();

    const [formData, setFormData] = useState({
        type: 'lent',
        amount: '',
        borrowerName: '',
        borrowerEmail: '',
        lenderName: user.name,
        lenderEmail: user.email,
        interestRate: 0,
        dueDate: '',
        description: '',
        repaymentSchedule: 'lump_sum'
    });

    const [errors, setErrors] = useState({});
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isForeignCurrency, setIsForeignCurrency] = useState(false);
    const [currency, setCurrency] = useState('USD');
    const [foreignAmount, setForeignAmount] = useState('');
    const [profiles, setProfiles] = useState([]);
    const [isEmailReadOnly, setIsEmailReadOnly] = useState(false);

    useEffect(() => {
        const fetchProfiles = async () => {
            try {
                const { data, error } = await supabase
                    .from('profiles')
                    .select('name, email');
                if (error) throw error;
                
                // Format for react-select
                const formattedProfiles = data.map(profile => ({
                    value: profile.email,
                    label: `${profile.name} (${profile.email})`,
                    name: profile.name,
                    email: profile.email
                }));
                // Filter out current user from the list
                setProfiles(formattedProfiles.filter(p => p.email !== user?.email));
            } catch (error) {
                console.error('Error fetching profiles:', error);
            }
        };

        if (user) {
            fetchProfiles();
        }
    }, [user]);

    const handleNameSelect = (selectedOption) => {
        if (selectedOption) {
            if (selectedOption.email) {
                // Existing user selected
                setFormData(prev => ({
                    ...prev,
                    borrowerName: selectedOption.name,
                    borrowerEmail: selectedOption.email
                }));
                setIsEmailReadOnly(true);
                setErrors(prev => ({ ...prev, borrowerName: '', borrowerEmail: '' }));
            } else {
                // New custom name created
                setFormData(prev => ({
                    ...prev,
                    borrowerName: selectedOption.value,
                    borrowerEmail: ''
                }));
                setIsEmailReadOnly(false);
                setErrors(prev => ({ ...prev, borrowerName: '' }));
            }
        } else {
            // Cleared
            setFormData(prev => ({
                ...prev,
                borrowerName: '',
                borrowerEmail: ''
            }));
            setIsEmailReadOnly(false);
        }
    };

    const EXCHANGE_RATES = {
        'USD': { rate: 84.5, symbol: '$' },
        'EUR': { rate: 92.1, symbol: '€' },
        'GBP': { rate: 107.5, symbol: '£' },
        'AUD': { rate: 55.2, symbol: 'A$' },
        'CAD': { rate: 62.8, symbol: 'C$' },
        'JPY': { rate: 0.56, symbol: '¥' }
    };

    const handleForeignAmountChange = (e) => {
        const val = e.target.value;
        setForeignAmount(val);

        if (val && !isNaN(val)) {
            const rate = EXCHANGE_RATES[currency].rate;
            const baseAmount = parseFloat(val) * rate;
            const fee = baseAmount * 0.02; // 2% conversion fee
            const totalInr = baseAmount + fee;

            setFormData(prev => ({
                ...prev,
                amount: totalInr.toFixed(2),
                description: prev.description || `Foreign Currency Loan: ${EXCHANGE_RATES[currency].symbol}${val} (${currency}) @ ${rate} INR/Unit + 2% Conversion Fee`
            }));
        } else {
            setFormData(prev => ({ ...prev, amount: '' }));
        }
    };

    const handleCurrencyChange = (e) => {
        const newCurrency = e.target.value;
        setCurrency(newCurrency);
        // Trigger recalculation if amount exists
        if (foreignAmount) {
            const rate = EXCHANGE_RATES[newCurrency].rate;
            const baseAmount = parseFloat(foreignAmount) * rate;
            const fee = baseAmount * 0.02;
            const totalInr = baseAmount + fee;
            setFormData(prev => ({
                ...prev,
                amount: totalInr.toFixed(2),
                description: `Foreign Currency Loan: ${EXCHANGE_RATES[newCurrency].symbol}${foreignAmount} (${newCurrency}) @ ${rate} INR/Unit + 2% Conversion Fee`
            }));
        }
    };

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));

        // Clear error when user types
        if (errors[name]) {
            setErrors(prev => ({ ...prev, [name]: '' }));
        }
    };

    const handleEmailBlur = async (e) => {
        const email = e.target.value;
        if (!email || !email.includes('@')) return;

        try {
            const { data: profile, error } = await supabase
                .from('profiles')
                .select('name')
                .eq('email', email.toLowerCase())
                .single();

            if (profile && profile.name) {
                setFormData(prev => ({ ...prev, borrowerName: profile.name }));
                toast.success('Auto-filled registered user details!');
            }
        } catch (err) {
            // User likely not registered, which is fine
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        // Adjust names based on type
        const loanData = {
            ...formData,
            amount: parseFloat(formData.amount),
            interestRate: parseFloat(formData.interestRate) || 0,
            // Add metadata for foreign currency if applicable
            metadata: isForeignCurrency ? {
                originalCurrency: currency,
                originalAmount: foreignAmount,
                exchangeRate: EXCHANGE_RATES[currency].rate,
                conversionFee: (parseFloat(foreignAmount) * EXCHANGE_RATES[currency].rate * 0.02).toFixed(2)
            } : null
        };

        if (formData.type === 'borrowed') {
            // User is borrowing, so swap the names
            loanData.lenderName = formData.borrowerName;
            loanData.lenderEmail = formData.borrowerEmail;
            loanData.borrowerName = user?.name || user?.email?.split('@')[0] || 'User';
            loanData.borrowerEmail = user?.email || '';
        } else if (formData.type === 'lent') {
            // User is lending, so user becomes the lender
            loanData.lenderName = user?.name || user?.email?.split('@')[0] || 'User';
            loanData.lenderEmail = user?.email || '';
            // borrowerName and borrowerEmail are already in formData
        }


        // Validate
        const validation = validateLoanData(loanData);

        if (!validation.isValid) {
            setErrors(validation.errors);
            return;
        }

        // New User Borrowing Limit
        if (formData.type === 'borrowed' && gamification?.stats?.completedLoans === 0 && parseFloat(formData.amount) > 500) {
            setErrors(prev => ({ ...prev, amount: 'New users (0 completed loans) can borrow a maximum of ₹500.' }));
            return;
        }

        setIsSubmitting(true);
        const result = await createLoan(loanData);

        if (result.success) {
            toast.success('Loan created successfully!');
            navigate('/loans');
        } else {
            console.error('Failed to create loan:', result.error);
            toast.error('Failed to create loan: ' + result.error);
            setIsSubmitting(false);
        }
    };

    return (
        <div className="create-loan">
            <div className="page-header">
                <h1>➕ Create New Loan</h1>
                <p>Add a new loan to track between friends or family</p>
            </div>

            <div className="loan-form-card">
                <form onSubmit={handleSubmit}>
                    {/* Type Selection */}
                    <div className="form-section">
                        <h3>Loan Type</h3>
                        <div className="radio-group">
                            <label className="radio-card">
                                <input
                                    type="radio"
                                    name="type"
                                    value="lent"
                                    checked={formData.type === 'lent'}
                                    onChange={handleChange}
                                />
                                <div className="radio-content">
                                    <span className="radio-icon">↗️</span>
                                    <div>
                                        <div className="radio-title">I Lent Money</div>
                                        <div className="radio-desc">You gave money to someone</div>
                                    </div>
                                </div>
                            </label>

                            <label className="radio-card">
                                <input
                                    type="radio"
                                    name="type"
                                    value="borrowed"
                                    checked={formData.type === 'borrowed'}
                                    onChange={handleChange}
                                />
                                <div className="radio-content">
                                    <span className="radio-icon">↙️</span>
                                    <div>
                                        <div className="radio-title">I Borrowed Money</div>
                                        <div className="radio-desc">You received money from someone</div>
                                    </div>
                                </div>
                            </label>
                        </div>
                    </div>

                    {/* Contact Information */}
                    <div className="form-section">
                        <h3>{formData.type === 'lent' ? 'Borrower' : 'Lender'} Information</h3>
                        <div className="form-row">
                            <div className="form-group">
                                <label>Name *</label>
                                <CreatableSelect
                                    isClearable
                                    options={profiles}
                                    onChange={handleNameSelect}
                                    placeholder="Select or type name..."
                                    className={`react-select-container ${errors.borrowerName ? 'error' : ''}`}
                                    classNamePrefix="react-select"
                                    value={
                                        formData.borrowerName 
                                            ? { 
                                                label: formData.borrowerName, 
                                                value: isEmailReadOnly ? formData.borrowerEmail : formData.borrowerName 
                                              } 
                                            : null
                                    }
                                    styles={{
                                        control: (baseStyles, state) => ({
                                            ...baseStyles,
                                            backgroundColor: 'var(--color-background)',
                                            borderColor: errors.borrowerName ? '#EF4444' : state.isFocused ? 'var(--color-primary)' : 'var(--color-border)',
                                            boxShadow: state.isFocused ? '0 0 0 3px rgba(0, 217, 255, 0.1), 0 0 20px rgba(0, 217, 255, 0.2)' : 'none',
                                            '&:hover': {
                                                borderColor: state.isFocused ? 'var(--color-primary)' : 'var(--color-text-medium)'
                                            },
                                            padding: '2px',
                                            borderRadius: 'var(--radius-md)',
                                            fontFamily: 'var(--font-body)'
                                        }),
                                        menu: (baseStyles) => ({
                                            ...baseStyles,
                                            backgroundColor: 'var(--color-surface)',
                                            zIndex: 100,
                                            border: '1px solid var(--color-border)'
                                        }),
                                        option: (baseStyles, state) => ({
                                            ...baseStyles,
                                            backgroundColor: state.isFocused ? 'rgba(124, 58, 237, 0.1)' : 'transparent',
                                            color: 'var(--color-text-dark)',
                                            cursor: 'pointer',
                                            fontFamily: 'var(--font-body)',
                                            '&:active': {
                                                backgroundColor: 'var(--color-primary)',
                                                color: 'white'
                                            }
                                        }),
                                        singleValue: (baseStyles) => ({
                                            ...baseStyles,
                                            color: 'var(--color-text-dark)',
                                            fontFamily: 'var(--font-body)'
                                        }),
                                        input: (baseStyles) => ({
                                            ...baseStyles,
                                            color: 'var(--color-text-dark)',
                                            fontFamily: 'var(--font-body)'
                                        })
                                    }}
                                />
                                {errors.borrowerName && <span className="error-text">{errors.borrowerName}</span>}
                            </div>

                            <div className="form-group">
                                <label>Email *</label>
                                <input
                                    type="email"
                                    name="borrowerEmail"
                                    value={formData.borrowerEmail}
                                    onChange={handleChange}
                                    onBlur={handleEmailBlur}
                                    readOnly={isEmailReadOnly}
                                    placeholder="email@example.com"
                                    className={`${errors.borrowerEmail ? 'error' : ''} ${isEmailReadOnly ? 'read-only-input' : ''}`}
                                />
                                {errors.borrowerEmail && <span className="error-text">{errors.borrowerEmail}</span>}
                            </div>
                        </div>
                    </div>

                    {/* Loan Details */}
                    <div className="form-section">
                        <h3>Loan Details</h3>

                        {/* Currency Toggle */}
                        <div className="currency-toggle-container">
                            <label className="checkbox-container">
                                <input
                                    type="checkbox"
                                    checked={isForeignCurrency}
                                    onChange={(e) => {
                                        setIsForeignCurrency(e.target.checked);
                                        if (!e.target.checked) {
                                            setFormData(prev => ({ ...prev, amount: '' }));
                                            setForeignAmount('');
                                        }
                                    }}
                                />
                                <span className="checkbox-label">💱 International Transaction (Foreign Currency)</span>
                            </label>
                        </div>

                        {isForeignCurrency && (
                            <div className="foreign-currency-box">
                                <div className="form-row">
                                    <div className="form-group">
                                        <label>Select Currency</label>
                                        <select value={currency} onChange={handleCurrencyChange} className="currency-select">
                                            {Object.keys(EXCHANGE_RATES).map(curr => (
                                                <option key={curr} value={curr}>
                                                    {EXCHANGE_RATES[curr].symbol} {curr} - {EXCHANGE_RATES[curr].rate} INR
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="form-group">
                                        <label>Amount in {currency}</label>
                                        <input
                                            type="number"
                                            value={foreignAmount}
                                            onChange={handleForeignAmountChange}
                                            placeholder="e.g. 100"
                                            min="0"
                                        />
                                    </div>
                                </div>
                                <div className="conversion-breakdown">
                                    <p>Exchange Rate: 1 {currency} = ₹{EXCHANGE_RATES[currency].rate}</p>
                                    <p>Conversion Fee (2%): <span className="fee-text">+ ₹{foreignAmount ? (parseFloat(foreignAmount) * EXCHANGE_RATES[currency].rate * 0.02).toFixed(2) : '0.00'}</span></p>
                                </div>
                            </div>
                        )}

                        <div className="form-row">
                            <div className="form-group">
                                <label>Total Amount (INR) * {isForeignCurrency && <span className="auto-calc-badge">Auto-Calculated</span>}</label>
                                <input
                                    type="number"
                                    name="amount"
                                    value={formData.amount}
                                    onChange={handleChange}
                                    placeholder="0.00"
                                    min="0"
                                    step="0.01"
                                    className={errors.amount ? 'error' : ''}
                                    readOnly={isForeignCurrency} // Lock if auto-calculated
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
                        <button type="button" className="btn-secondary" onClick={() => navigate('/loans')}>
                            Cancel
                        </button>
                        <button type="submit" className="btn-primary" disabled={isSubmitting}>
                            {isSubmitting ? 'Creating...' : '✓ Create Loan'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default CreateLoan;
