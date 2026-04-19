import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useLoan } from '../context/LoanContext';
import { formatCurrency, formatDate, getDaysUntilDue } from '../utils/loanValidation';
import { exportLoansToCSV } from '../utils/exportUtils';
import './LoansList.css';

const LoansList = () => {
    const { loans, getLoansByUser } = useLoan();
    const [filter, setFilter] = useState('all');
    const [searchTerm, setSearchTerm] = useState('');

    const filteredByType = getLoansByUser(filter);

    const filteredLoans = filteredByType.filter(loan => {
        const personName = loan.type === 'lent' ? loan.borrowerName : loan.lenderName;
        return personName?.toLowerCase().includes(searchTerm.toLowerCase());
    });

    return (
        <div className="loans-list">
            <div className="page-header">
                <div>
                    <h1>💰 My Loans</h1>
                    <p>Manage all your lending and borrowing activities</p>
                </div>
                <div style={{ display: 'flex', gap: '12px' }}>
                    <button onClick={() => exportLoansToCSV(loans)} className="btn-secondary" title="Export to CSV">
                        📥 Export Data
                    </button>
                    <Link to="/create-loan" className="btn-primary">
                        ➕ Create Loan
                    </Link>
                </div>
            </div>

            {/* Filters */}
            <div className="filters-bar">
                <div className="search-box">
                    <span className="search-icon">🔍</span>
                    <input
                        type="text"
                        placeholder="Search by name..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>

                <div className="filter-tabs">
                    {['all', 'lent', 'borrowed', 'active', 'completed', 'overdue'].map((tab) => (
                        <button
                            key={tab}
                            className={`filter-tab ${filter === tab ? 'active' : ''}`}
                            onClick={() => setFilter(tab)}
                        >
                            {tab.charAt(0).toUpperCase() + tab.slice(1)}
                        </button>
                    ))}
                </div>
            </div>

            {/* Loans Grid */}
            {filteredLoans.length === 0 ? (
                <div className="empty-state">
                    <div className="empty-icon">📭</div>
                    <h3>No loans found</h3>
                    <p>Try adjusting your filters or create a new loan</p>
                </div>
            ) : (
                <div className="loans-grid">
                    {filteredLoans.map((loan) => {
                        const daysRemaining = getDaysUntilDue(loan.dueDate);
                        const personName = loan.type === 'lent' ? loan.borrowerName : loan.lenderName;
                        const progress = (loan.amountPaid / loan.amount) * 100;

                        return (
                            <Link to={`/loan/${loan.id}`} key={loan.id} className="loan-card">
                                <div className="loan-card-header">
                                    <div className="loan-person-info">
                                        <div className="loan-avatar">{personName.charAt(0)}</div>
                                        <div>
                                            <div className="loan-person-name">{personName}</div>
                                            <span className={`loan-type ${loan.type}`}>
                                                {loan.type === 'lent' ? '↗️ Lent' : '↙️ Borrowed'}
                                            </span>
                                        </div>
                                    </div>
                                    <span className={`status-badge ${(loan.amount - loan.amountPaid < 0.01) ? 'completed' : loan.status}`}>
                                        {(loan.amount - loan.amountPaid < 0.01) ? 'completed' : loan.status}
                                    </span>
                                </div>

                                <div className="loan-amount">
                                    {formatCurrency(loan.amount)}
                                </div>

                                <div className="loan-progress">
                                    <div className="progress-info">
                                        <span>Paid: {formatCurrency(loan.amountPaid)}</span>
                                        <span>{progress.toFixed(0)}%</span>
                                    </div>
                                    <div className="progress-bar">
                                        <div className="progress-fill" style={{ width: `${progress}%` }}></div>
                                    </div>
                                </div>

                                <div className="loan-footer">
                                    <div className="loan-meta">
                                        <span>📅 Due: {formatDate(loan.dueDate)}</span>
                                        {loan.status === 'active' && (loan.amount - loan.amountPaid >= 0.01) && (
                                            <span className={daysRemaining < 0 ? 'overdue-text' : 'days-text'}>
                                                {daysRemaining < 0 ? `${Math.abs(daysRemaining)} days overdue` : `${daysRemaining} days left`}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </Link>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

export default LoansList;
