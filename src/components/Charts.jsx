import React from 'react';
import {
    Chart as ChartJS,
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    BarElement,
    ArcElement,
    Title,
    Tooltip,
    Legend,
    Filler
} from 'chart.js';
import { Line, Bar, Doughnut, Pie } from 'react-chartjs-2';
import { useLoan } from '../context/LoanContext';
import './Charts.css';

// Register Chart.js components
ChartJS.register(
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    BarElement,
    ArcElement,
    Title,
    Tooltip,
    Legend,
    Filler
);

// Theme-aware chart configuration
const getChartOptions = (title, isDarkTheme, chartType = '') => ({
    responsive: true,
    maintainAspectRatio: false,
    layout: {
        padding: {
            top: 10,
            bottom: 10
        }
    },
    plugins: {
        legend: {
            position: 'bottom',
            labels: {
                color: isDarkTheme ? '#e2e8f0' : '#495057',
                padding: 20,
                usePointStyle: true,
                pointStyle: 'circle',
                font: {
                    size: 13,
                    family: 'Inter',
                    weight: '500'
                }
            }
        },
        title: {
            display: !!title,
            text: title,
            color: isDarkTheme ? '#FFFFFF' : '#1e293b',
            font: {
                size: 18,
                weight: '700',
                family: 'Poppins'
            },
            padding: {
                bottom: 30
            }
        },
        tooltip: {
            backgroundColor: isDarkTheme ? 'rgba(15, 23, 42, 0.9)' : 'rgba(255, 255, 255, 0.9)',
            titleColor: isDarkTheme ? '#FFFFFF' : '#1e293b',
            bodyColor: isDarkTheme ? '#e2e8f0' : '#495057',
            borderColor: isDarkTheme ? '#6366f1' : '#e2e8f0',
            borderWidth: 1,
            padding: 12,
            cornerRadius: 10,
            displayColors: true,
            boxPadding: 6,
            callbacks: {
                label: function(context) {
                    let label = context.label || '';
                    if (label) {
                        label += ': ';
                    }
                    if (context.parsed !== undefined) {
                        if (chartType === 'amount') {
                            label += new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(context.parsed);
                        } else {
                            label += context.parsed;
                        }
                    }
                    return label;
                }
            }
        }
    },
    scales: (chartType === 'doughnut' || chartType === 'pie') ? {} : {
        x: {
            grid: {
                display: false,
                drawBorder: false
            },
            ticks: {
                color: isDarkTheme ? '#94a3b8' : '#64748b',
                font: { family: 'Inter', size: 11 }
            }
        },
        y: {
            grid: {
                color: isDarkTheme ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)',
                drawBorder: false
            },
            ticks: {
                color: isDarkTheme ? '#94a3b8' : '#64748b',
                font: { family: 'Inter', size: 11 },
                callback: function(value) {
                    if (value >= 1000) return '₹' + (value / 1000) + 'k';
                    return '₹' + value;
                }
            }
        }
    }
});

// Loan Distribution Chart (Doughnut)
export const LoanDistributionChart = () => {
    const { loans } = useLoan();
    const isDarkTheme = document.documentElement.getAttribute('data-theme') === 'night';

    const lentLoans = loans.filter(l => l.type === 'lent');
    const borrowedLoans = loans.filter(l => l.type === 'borrowed');

    const lentAmount = lentLoans.reduce((sum, l) => sum + (l.amount - l.amountPaid), 0);
    const borrowedAmount = borrowedLoans.reduce((sum, l) => sum + (l.amount - l.amountPaid), 0);

    const data = {
        labels: ['Lent Out', 'Borrowed'],
        datasets: [{
            data: [lentAmount, borrowedAmount],
            backgroundColor: [
                'rgba(0, 217, 255, 0.8)',  // Neon cyan
                'rgba(0, 255, 163, 0.8)'   // Neon green
            ],
            borderColor: [
                'rgba(0, 217, 255, 1)',
                'rgba(0, 255, 163, 1)'
            ],
            borderWidth: 2,
            hoverOffset: 10
        }]
    };

    const options = {
        ...getChartOptions('Loan Distribution', isDarkTheme, 'doughnut'),
        cutout: '70%',
        plugins: {
            ...getChartOptions('Loan Distribution', isDarkTheme, 'doughnut').plugins,
            tooltip: {
                ...getChartOptions('Loan Distribution', isDarkTheme, 'amount').plugins.tooltip
            }
        }
    };

    const hasData = lentAmount > 0 || borrowedAmount > 0;
    
    if (!hasData) {
        return (
            <div className="chart-container empty-chart">
                <div className="chart-title-fallback">Loan Distribution</div>
                <div className="empty-chart-content">
                    <div className="empty-chart-icon">⭕</div>
                    <p>No active loans found</p>
                    <span>Create a loan to see your distribution</span>
                </div>
            </div>
        );
    }

    return (
        <div className="chart-container">
            <Doughnut data={data} options={options} />
            <div className="chart-center-text">
                <div className="chart-total">₹{(lentAmount + borrowedAmount).toLocaleString()}</div>
                <div className="chart-label">Total Active</div>
            </div>
        </div>
    );
};

// Payment Trend Chart (Line)
export const PaymentTrendChart = () => {
    const { loans, activities } = useLoan();
    const isDarkTheme = document.documentElement.getAttribute('data-theme') === 'night';

    // Get payment activities from last 6 months
    const getMonthlyPayments = () => {
        const months = [];
        const now = new Date();

        for (let i = 5; i >= 0; i--) {
            const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const monthName = date.toLocaleDateString('en-US', { month: 'short' });
            months.push({
                name: monthName,
                amount: 0
            });
        }

        // Aggregate payment amounts by month
        const paymentActivities = activities.filter(a => a.type === 'PAYMENT_MADE');
        paymentActivities.forEach(activity => {
            const date = new Date(activity.timestamp);
            const monthsAgo = (now.getMonth() - date.getMonth()) + (12 * (now.getYear() - date.getYear()));

            if (monthsAgo >= 0 && monthsAgo < 6) {
                const index = 5 - monthsAgo;
                months[index].amount += activity.metadata?.amount || 0;
            }
        });

        return months;
    };

    const monthlyData = getMonthlyPayments();

    const data = {
        labels: monthlyData.map(m => m.name),
        datasets: [{
            label: 'Payments',
            data: monthlyData.map(m => m.amount),
            fill: true,
            borderColor: 'rgb(0, 217, 255)',
            backgroundColor: isDarkTheme
                ? 'rgba(0, 217, 255, 0.1)'
                : 'rgba(0, 217, 255, 0.2)',
            tension: 0.4,
            borderWidth: 3,
            pointBackgroundColor: 'rgb(0, 217, 255)',
            pointBorderColor: isDarkTheme ? '#000' : '#fff',
            pointBorderWidth: 2,
            pointRadius: 5,
            pointHoverRadius: 7
        }]
    };

    const options = getChartOptions('Payment Trends (Last 6 Months)', isDarkTheme, 'amount');

    const hasData = monthlyData.some(m => m.amount > 0);

    if (!hasData) {
        return (
            <div className="chart-container empty-chart chart-full-width">
                <div className="chart-title-fallback">Payment Trends</div>
                <div className="empty-chart-content">
                    <div className="empty-chart-icon">📈</div>
                    <p>No payment history available</p>
                    <span>Your payment trends will appear here over time</span>
                </div>
            </div>
        );
    }

    return (
        <div className="chart-container">
            <Line data={data} options={options} />
        </div>
    );
};

// Monthly Analytics Chart (Bar)
export const MonthlyAnalyticsChart = () => {
    const { loans } = useLoan();
    const isDarkTheme = document.documentElement.getAttribute('data-theme') === 'night';

    // Get data for current month
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    const monthlyLoans = loans.filter(loan => {
        const loanDate = new Date(loan.createdAt || loan.dueDate);
        return loanDate.getMonth() === currentMonth && loanDate.getFullYear() === currentYear;
    });

    const activeLoans = monthlyLoans.filter(l => l.status === 'active').length;
    const completedLoans = monthlyLoans.filter(l => l.status === 'completed').length;
    const overdueLoans = monthlyLoans.filter(l => l.status === 'overdue').length;

    const data = {
        labels: ['Active', 'Completed', 'Overdue'],
        datasets: [{
            label: 'Count',
            data: [activeLoans, completedLoans, overdueLoans],
            backgroundColor: [
                'rgba(0, 217, 255, 0.8)',
                'rgba(0, 255, 136, 0.8)',
                'rgba(255, 0, 229, 0.8)'
            ],
            borderColor: [
                'rgba(0, 217, 255, 1)',
                'rgba(0, 255, 136, 1)',
                'rgba(255, 0, 229, 1)'
            ],
            borderWidth: 2,
            borderRadius: 8
        }]
    };

    const options = {
        ...getChartOptions('This Month\'s Loans', isDarkTheme, 'bar'),
        scales: {
            ...getChartOptions('', isDarkTheme, 'bar').scales,
            y: {
                ...getChartOptions('', isDarkTheme, 'bar').scales.y,
                beginAtZero: true,
                ticks: {
                    ...getChartOptions('', isDarkTheme, 'bar').scales.y.ticks,
                    stepSize: 1,
                    callback: (value) => value
                }
            }
        }
    };

    const hasData = activeLoans > 0 || completedLoans > 0 || overdueLoans > 0;

    if (!hasData) {
        return (
            <div className="chart-container empty-chart">
                <div className="chart-title-fallback">This Month's Activity</div>
                <div className="empty-chart-content">
                    <div className="empty-chart-icon">📊</div>
                    <p>No activity this month</p>
                    <span>Start tracking your monthly goals</span>
                </div>
            </div>
        );
    }

    return (
        <div className="chart-container">
            <Bar data={data} options={options} />
        </div>
    );
};

// Status Overview Chart (Pie)
export const StatusOverviewChart = () => {
    const { loans } = useLoan();
    const isDarkTheme = document.documentElement.getAttribute('data-theme') === 'night';

    const activeLoans = loans.filter(l => l.status === 'active');
    const completedLoans = loans.filter(l => l.status === 'completed');
    const overdueLoans = loans.filter(l => l.status === 'overdue');

    const data = {
        labels: ['Active', 'Completed', 'Overdue'],
        datasets: [{
            data: [activeLoans.length, completedLoans.length, overdueLoans.length],
            backgroundColor: [
                'rgba(0, 217, 255, 0.8)',
                'rgba(0, 255, 136, 0.8)',
                'rgba(255, 0, 229, 0.8)'
            ],
            borderColor: [
                'rgba(0, 217, 255, 1)',
                'rgba(0, 255, 136, 1)',
                'rgba(255, 0, 229, 1)'
            ],
            borderWidth: 2,
            hoverOffset: 10
        }]
    };

    const options = getChartOptions('Loan Status Overview', isDarkTheme, 'pie');

    const hasData = activeLoans.length > 0 || completedLoans.length > 0 || overdueLoans.length > 0;

    if (!hasData) {
       return (
           <div className="chart-container empty-chart">
               <div className="chart-title-fallback">Loan Status Overview</div>
               <div className="empty-chart-content">
                   <div className="empty-chart-icon">🥧</div>
                   <p>No status data available</p>
                   <span>All your loans will be categorized here</span>
               </div>
           </div>
       );
    }

    return (
        <div className="chart-container">
            <Pie data={data} options={options} />
        </div>
    );
};
