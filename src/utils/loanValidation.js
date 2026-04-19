// Validation utility for loan data
export const validateLoanData = (loanData) => {
    const errors = {};

    // Validate amount
    if (!loanData.amount || loanData.amount <= 0) {
        errors.amount = 'Amount must be greater than 0';
    }
    if (loanData.amount > 1000000) {
        errors.amount = 'Amount cannot exceed ₹1,000,000';
    }

    // Validate borrower name
    if (!loanData.borrowerName || loanData.borrowerName.trim() === '') {
        errors.borrowerName = 'Borrower name is required';
    }

    // Validate lender name
    if (!loanData.lenderName || loanData.lenderName.trim() === '') {
        errors.lenderName = 'Lender name is required';
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (loanData.borrowerEmail && !emailRegex.test(loanData.borrowerEmail)) {
        errors.borrowerEmail = 'Invalid email format';
    }
    if (loanData.lenderEmail && !emailRegex.test(loanData.lenderEmail)) {
        errors.lenderEmail = 'Invalid email format';
    }

    // Validate due date
    if (!loanData.dueDate) {
        errors.dueDate = 'Due date is required';
    } else {
        const dueDate = new Date(loanData.dueDate);
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        if (dueDate < today) {
            errors.dueDate = 'Due date cannot be in the past';
        }
    }

    // Validate interest rate
    if (loanData.interestRate && (loanData.interestRate < 0 || loanData.interestRate > 100)) {
        errors.interestRate = 'Interest rate must be between 0 and 100';
    }

    // Validate type
    if (!loanData.type || !['lent', 'borrowed'].includes(loanData.type)) {
        errors.type = 'Type must be either "lent" or "borrowed"';
    }

    // Validate repayment schedule
    if (!loanData.repaymentSchedule || !['monthly', 'weekly', 'lump_sum', 'emi'].includes(loanData.repaymentSchedule)) {
        errors.repaymentSchedule = 'Please select a valid repayment schedule';
    }

    return {
        isValid: Object.keys(errors).length === 0,
        errors
    };
};

// Format currency
export const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        minimumFractionDigits: (amount % 1 === 0) ? 0 : 2,
        maximumFractionDigits: 2
    }).format(amount);
};

// Format date
export const formatDate = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    }).format(date);
};

// Calculate days until due
export const getDaysUntilDue = (dueDate) => {
    const due = new Date(dueDate);
    const today = new Date();
    const diffTime = due - today;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
};

// Get status badge color
export const getStatusColor = (status) => {
    switch (status) {
        case 'active':
            return '#10B981'; // green
        case 'completed':
            return '#6B7280'; // gray
        case 'overdue':
            return '#EF4444'; // red
        default:
            return '#6B7280';
    }
};

// Validate payment data
export const validatePayment = (paymentData, outstandingAmount) => {
    const errors = {};

    // Validate amount
    if (!paymentData.amount || paymentData.amount <= 0) {
        errors.amount = 'Amount must be greater than 0';
    }

    if (paymentData.amount > outstandingAmount) {
        errors.amount = `Amount cannot exceed outstanding balance of ${formatCurrency(outstandingAmount)}`;
    }

    // Validate date
    if (!paymentData.date) {
        errors.date = 'Payment date is required';
    }

    // Validate method
    if (!paymentData.method) {
        errors.method = 'Payment method is required';
    }

    return {
        isValid: Object.keys(errors).length === 0,
        errors
    };
};
