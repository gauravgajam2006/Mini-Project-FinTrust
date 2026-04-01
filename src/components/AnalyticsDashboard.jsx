import { useLoan } from '../context/LoanContext';
import { formatCurrency } from '../utils/loanValidation';
import ActivityFeed from './ActivityFeed';
import { LoanDistributionChart, PaymentTrendChart, MonthlyAnalyticsChart, StatusOverviewChart } from './Charts';
import './AnalyticsDashboard.css';

const AnalyticsDashboard = () => {
    const { getDashboardStats, getTotalAmountOwed, getPendingLoans, getOverdueLoans } = useLoan();

    const stats = getDashboardStats();
    const amountOwed = getTotalAmountOwed();
    const pendingLoans = getPendingLoans();
    const overdueLoans = getOverdueLoans();

    return (
        <div className="analytics-dashboard">
            <div className="analytics-header">
                <h2>Analytics & Insights</h2>
                <p>Comprehensive view of your financial activity</p>
            </div>

            {/* Charts Section */}
            <div className="charts-section">
                <h3>Visual Analytics</h3>
                <div className="charts-grid">
                    <LoanDistributionChart />
                    <StatusOverviewChart />
                    <div className="chart-full-width">
                        <PaymentTrendChart />
                    </div>
                    <MonthlyAnalyticsChart />
                </div>
            </div>

            <div className="analytics-grid">
                {/* Net Position Card */}
                <div className="analytics-card net-position">
                    <div className="card-header">
                        <div className="card-icon" style={{ background: stats.overview.netPosition >= 0 ? 'linear-gradient(135deg, #10B981, #059669)' : 'linear-gradient(135deg, #EF4444, #DC2626)' }}>
                            {stats.overview.netPosition >= 0 ? '📈' : '📉'}
                        </div>
                        <div>
                            <h3>Net Position</h3>
                            <p className="card-subtitle">Current financial balance</p>
                        </div>
                    </div>
                    <div className="net-amount" style={{ color: stats.overview.netPosition >= 0 ? '#10B981' : '#EF4444' }}>
                        {formatCurrency(stats.overview.netPosition)}
                    </div>
                    <div className="net-breakdown">
                        <div className="breakdown-item">
                            <span>Owed to You</span>
                            <span className="breakdown-value positive">{formatCurrency(stats.overview.lentOutstanding)}</span>
                        </div>
                        <div className="breakdown-item">
                            <span>You Owe</span>
                            <span className="breakdown-value negative">{formatCurrency(stats.overview.borrowedOutstanding)}</span>
                        </div>
                    </div>
                </div>

                {/* Pending Loans Card */}
                <div className="analytics-card">
                    <div className="card-header">
                        <div className="card-icon" style={{ background: 'linear-gradient(135deg, #3B82F6, #60A5FA)' }}>
                            ⏳
                        </div>
                        <div>
                            <h3>Pending Loans</h3>
                            <p className="card-subtitle">Active & in progress</p>
                        </div>
                    </div>
                    <div className="stat-number">{pendingLoans.length}</div>
                    {pendingLoans.length > 0 && (
                        <div className="mini-list">
                            {pendingLoans.slice(0, 3).map(loan => (
                                <div key={loan.id} className="mini-list-item">
                                    <span className="mini-name">{loan.type === 'lent' ? loan.borrowerName : loan.lenderName}</span>
                                    <span className="mini-amount">{formatCurrency(loan.amount - (loan.amountPaid || 0))}</span>
                                </div>
                            ))}
                            {pendingLoans.length > 3 && (
                                <div className="mini-more">+{pendingLoans.length - 3} more</div>
                            )}
                        </div>
                    )}
                </div>

                {/* Overdue Loans Card */}
                <div className="analytics-card overdue">
                    <div className="card-header">
                        <div className="card-icon" style={{ background: 'linear-gradient(135deg, #EF4444, #F87171)' }}>
                            ⚠️
                        </div>
                        <div>
                            <h3>Overdue Loans</h3>
                            <p className="card-subtitle">Requires attention</p>
                        </div>
                    </div>
                    <div className="stat-number">{overdueLoans.length}</div>
                    {overdueLoans.length > 0 && (
                        <div className="mini-list">
                            {overdueLoans.slice(0, 3).map(loan => {
                                const daysOverdue = Math.max(0, Math.ceil((new Date() - new Date(loan.dueDate)) / (1000 * 60 * 60 * 24)));
                                return (
                                    <div key={loan.id} className="mini-list-item">
                                        <span className="mini-name">{loan.type === 'lent' ? loan.borrowerName : loan.lenderName}</span>
                                        <span className="mini-days">{daysOverdue}d overdue</span>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Payment Stats Card */}
                <div className="analytics-card">
                    <div className="card-header">
                        <div className="card-icon" style={{ background: 'linear-gradient(135deg, #8B5CF6, #A78BFA)' }}>
                            💳
                        </div>
                        <div>
                            <h3>Payment Stats</h3>
                            <p className="card-subtitle">Transaction overview</p>
                        </div>
                    </div>
                    <div className="payment-stats">
                        <div className="payment-stat">
                            <span className="stat-label">Total Payments</span>
                            <span className="stat-value">{stats.payments.totalCount}</span>
                        </div>
                        <div className="payment-stat">
                            <span className="stat-label">Total Amount</span>
                            <span className="stat-value">{formatCurrency(stats.payments.totalAmount)}</span>
                        </div>
                        <div className="payment-stat">
                            <span className="stat-label">Average Payment</span>
                            <span className="stat-value">{formatCurrency(stats.payments.averageAmount)}</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Recent Activity Section */}
            <div className="analytics-section">
                <h3>Recent Activity</h3>
                <ActivityFeed limit={10} />
            </div>
        </div>
    );
};

export default AnalyticsDashboard;
