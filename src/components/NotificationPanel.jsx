import { useState, useEffect, useRef } from 'react';
import { useLoan } from '../context/LoanContext';
import { supabase } from '../supabase';
import { getDaysUntilDue, formatCurrency } from '../utils/loanValidation';
import { Link } from 'react-router-dom';
import './NotificationPanel.css';

const NotificationPanel = ({ isOpen, onClose }) => {
    const {
        notifications, unreadNotificationCount, loans, user,
        markNotificationRead, markAllNotificationsRead, deleteNotification,
        respondToLoan, fetchLoans, fetchNotifications
    } = useLoan();

    const [activeTab, setActiveTab] = useState('notifications');
    const [respondingTo, setRespondingTo] = useState(null);
    const [fetchedLoans, setFetchedLoans] = useState({});
    const panelRef = useRef(null);

    // Close on outside click
    useEffect(() => {
        const handleClickOutside = (e) => {
            if (panelRef.current && !panelRef.current.contains(e.target)) {
                onClose();
            }
        };
        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isOpen, onClose]);

    // Close on ESC
    useEffect(() => {
        const handleEsc = (e) => {
            if (e.key === 'Escape') onClose();
        };
        if (isOpen) document.addEventListener('keydown', handleEsc);
        return () => document.removeEventListener('keydown', handleEsc);
    }, [isOpen, onClose]);

    // When panel opens, fetch any missing loan data for loan_created notifications
    useEffect(() => {
        if (!isOpen || !user) return;

        const loanNotifications = notifications.filter(n => n.type === 'loan_created' && n.loan_id);
        
        loanNotifications.forEach(async (notif) => {
            const existsInState = loans.find(l => l.id === notif.loan_id);
            const existsInCache = fetchedLoans[notif.loan_id];
            
            if (!existsInState && !existsInCache) {
                try {
                    const { data, error } = await supabase
                        .from('loans')
                        .select('*')
                        .eq('id', notif.loan_id)
                        .single();
                    
                    if (!error && data) {
                        setFetchedLoans(prev => ({ ...prev, [data.id]: data }));
                    }
                } catch (err) {
                    console.error('Error fetching loan for notification:', err);
                }
            }
        });
    }, [isOpen, notifications, loans, user]);

    // Helper to find a loan either from context state or from our local cache
    const findLoan = (loanId) => {
        const fromState = loans.find(l => l.id === loanId);
        if (fromState) return fromState;

        const fromCache = fetchedLoans[loanId];
        if (fromCache) {
            return {
                id: fromCache.id,
                user_id: fromCache.user_id,
                created_by: fromCache.created_by,
                type: fromCache.type,
                amount: parseFloat(fromCache.amount),
                amountPaid: parseFloat(fromCache.amount_paid) || 0,
                borrowerName: fromCache.borrower_name,
                borrowerEmail: fromCache.borrower_email,
                lenderName: fromCache.lender_name,
                lenderEmail: fromCache.lender_email,
                status: fromCache.status,
                dueDate: fromCache.due_date,
                description: fromCache.description,
            };
        }

        return null;
    };

    // Format time ago
    const timeAgo = (dateStr) => {
        const now = new Date();
        const date = new Date(dateStr);
        const diffMs = now - date;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHrs = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);

        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins}m ago`;
        if (diffHrs < 24) return `${diffHrs}h ago`;
        if (diffDays < 7) return `${diffDays}d ago`;
        return date.toLocaleDateString();
    };

    // Get icon for notification type
    const getNotificationIcon = (type) => {
        switch (type) {
            case 'loan_created': return '📋';
            case 'loan_approved': return '✅';
            case 'loan_rejected': return '❌';
            case 'payment_received': return '💰';
            case 'loan_reminder': return '⏰';
            default: return '🔔';
        }
    };

    // Handle respond to loan
    const handleRespond = async (loanId, response) => {
        setRespondingTo(loanId);
        try {
            const result = await respondToLoan(loanId, response);
            if (result?.success) {
                setFetchedLoans(prev => {
                    if (prev[loanId]) {
                        return { ...prev, [loanId]: { ...prev[loanId], status: response === 'accept' ? 'active' : 'rejected' } };
                    }
                    return prev;
                });
            }
            await fetchLoans();
            await fetchNotifications();
        } catch (err) {
            console.error('Error responding to loan:', err);
        }
        setRespondingTo(null);
    };

    // Get reminders (due-date based)
    const reminders = loans.filter(loan =>
        loan.status !== 'completed' && loan.status !== 'rejected' && getDaysUntilDue(loan.dueDate) <= 3
    );

    const reminderCount = reminders.length;

    if (!isOpen) return null;

    // Render accept/reject actions for a loan_created notification
    const renderLoanActions = (notif) => {
        const loan = findLoan(notif.loan_id);
        
        if (!loan) {
            // Loan not found yet — always show action buttons for the receiver
            return (
                <div className="notif-actions">
                    <button
                        className="notif-action-btn accept"
                        onClick={(e) => {
                            e.stopPropagation();
                            handleRespond(notif.loan_id, 'accept');
                        }}
                        disabled={respondingTo === notif.loan_id}
                    >
                        {respondingTo === notif.loan_id ? '...' : '✓ Accept'}
                    </button>
                    <button
                        className="notif-action-btn reject"
                        onClick={(e) => {
                            e.stopPropagation();
                            handleRespond(notif.loan_id, 'reject');
                        }}
                        disabled={respondingTo === notif.loan_id}
                    >
                        {respondingTo === notif.loan_id ? '...' : '✗ Reject'}
                    </button>
                    <Link
                        to={`/loan/${notif.loan_id}`}
                        className="notif-action-btn view"
                        onClick={(e) => {
                            e.stopPropagation();
                            onClose();
                        }}
                    >
                        View
                    </Link>
                </div>
            );
        }

        if (loan.status === 'pending_approval') {
            const isCreator = loan.created_by === user?.id || loan.user_id === user?.id;

            if (!isCreator) {
                return (
                    <div className="notif-actions">
                        <button
                            className="notif-action-btn accept"
                            onClick={(e) => {
                                e.stopPropagation();
                                handleRespond(notif.loan_id, 'accept');
                            }}
                            disabled={respondingTo === notif.loan_id}
                        >
                            {respondingTo === notif.loan_id ? '...' : '✓ Accept'}
                        </button>
                        <button
                            className="notif-action-btn reject"
                            onClick={(e) => {
                                e.stopPropagation();
                                handleRespond(notif.loan_id, 'reject');
                            }}
                            disabled={respondingTo === notif.loan_id}
                        >
                            {respondingTo === notif.loan_id ? '...' : '✗ Reject'}
                        </button>
                        <Link
                            to={`/loan/${notif.loan_id}`}
                            className="notif-action-btn view"
                            onClick={(e) => {
                                e.stopPropagation();
                                onClose();
                            }}
                        >
                            View
                        </Link>
                    </div>
                );
            } else {
                return (
                    <div className="notif-responded">
                        <span className="notif-status-tag pending">⏳ Awaiting counterpart approval</span>
                    </div>
                );
            }
        }

        // Already responded
        if (loan.status !== 'pending_approval') {
            return (
                <div className="notif-responded">
                    <span className={`notif-status-tag ${loan.status}`}>
                        {loan.status === 'active' ? '✅ Accepted' :
                         loan.status === 'rejected' ? '❌ Rejected' :
                         loan.status}
                    </span>
                    <Link
                        to={`/loan/${notif.loan_id}`}
                        className="notif-action-btn view"
                        onClick={(e) => {
                            e.stopPropagation();
                            onClose();
                        }}
                    >
                        View
                    </Link>
                </div>
            );
        }

        return null;
    };

    return (
        <div className="notif-overlay">
            <div className="notif-panel" ref={panelRef}>
                {/* Header */}
                <div className="notif-header">
                    <h2>
                        <span className="notif-bell-icon">🔔</span>
                        Notifications
                    </h2>
                    <div className="notif-header-actions">
                        {activeTab === 'notifications' && notifications.some(n => !n.is_read) && (
                            <button
                                className="notif-mark-all-btn"
                                onClick={markAllNotificationsRead}
                            >
                                ✓ Mark all read
                            </button>
                        )}
                        <button className="notif-close-btn" onClick={onClose}>×</button>
                    </div>
                </div>

                {/* Tabs */}
                <div className="notif-tabs">
                    <button
                        className={`notif-tab ${activeTab === 'notifications' ? 'active' : ''}`}
                        onClick={() => setActiveTab('notifications')}
                    >
                        Notifications
                        {unreadNotificationCount > 0 && (
                            <span className="notif-tab-badge">{unreadNotificationCount}</span>
                        )}
                    </button>
                    <button
                        className={`notif-tab ${activeTab === 'reminders' ? 'active' : ''}`}
                        onClick={() => setActiveTab('reminders')}
                    >
                        Reminders
                        {reminderCount > 0 && (
                            <span className="notif-tab-badge reminder">{reminderCount}</span>
                        )}
                    </button>
                </div>

                {/* Body */}
                <div className="notif-body">
                    {activeTab === 'notifications' ? (
                        notifications.length === 0 ? (
                            <div className="notif-empty">
                                <span className="notif-empty-icon">📭</span>
                                <p>No notifications yet</p>
                                <span className="notif-empty-sub">When someone creates a loan with you, you'll see it here</span>
                            </div>
                        ) : (
                            <div className="notif-list">
                                {notifications.map(notif => (
                                    <div
                                        key={notif.id}
                                        className={`notif-item ${!notif.is_read ? 'unread' : ''} ${notif.type}`}
                                        onClick={() => {
                                            if (!notif.is_read) markNotificationRead(notif.id);
                                        }}
                                    >
                                        <div className="notif-item-icon">
                                            {getNotificationIcon(notif.type)}
                                        </div>
                                        <div className="notif-item-content">
                                            <div className="notif-item-title">
                                                {notif.title}
                                                {!notif.is_read && <span className="notif-unread-dot"></span>}
                                            </div>
                                            <div className="notif-item-message">{notif.message}</div>
                                            <div className="notif-item-meta">
                                                <span className="notif-item-time">{timeAgo(notif.created_at)}</span>
                                                {notif.from_user_name && (
                                                    <span className="notif-item-from">from {notif.from_user_name}</span>
                                                )}
                                            </div>

                                            {/* Accept/Reject for loan_created notifications */}
                                            {notif.type === 'loan_created' && notif.loan_id && renderLoanActions(notif)}

                                            {/* View link for approval/rejection notifications */}
                                            {(notif.type === 'loan_approved' || notif.type === 'loan_rejected') && notif.loan_id && (
                                                <div className="notif-responded">
                                                    <Link
                                                        to={`/loan/${notif.loan_id}`}
                                                        className="notif-action-btn view"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            onClose();
                                                        }}
                                                    >
                                                        View Loan
                                                    </Link>
                                                </div>
                                            )}
                                        </div>

                                        <button
                                            className="notif-delete-btn"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                deleteNotification(notif.id);
                                            }}
                                            title="Remove notification"
                                        >
                                            🗑
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )
                    ) : (
                        /* Reminders Tab */
                        reminders.length === 0 ? (
                            <div className="notif-empty">
                                <span className="notif-empty-icon">✨</span>
                                <p>All caught up!</p>
                                <span className="notif-empty-sub">No upcoming due dates</span>
                            </div>
                        ) : (
                            <div className="notif-list">
                                {reminders.map(loan => {
                                    const days = getDaysUntilDue(loan.dueDate);
                                    const isOverdue = days < 0;
                                    const personName = loan.type === 'lent' ? loan.borrowerName : loan.lenderName;

                                    return (
                                        <div key={loan.id} className={`notif-item reminder ${isOverdue ? 'overdue' : 'upcoming'}`}>
                                            <div className="notif-item-icon">
                                                {isOverdue ? '⚠️' : '🕒'}
                                            </div>
                                            <div className="notif-item-content">
                                                <div className="notif-item-title">
                                                    {isOverdue
                                                        ? `Overdue by ${Math.abs(days)} days`
                                                        : `Due in ${days} day${days !== 1 ? 's' : ''}`}
                                                </div>
                                                <div className="notif-item-message">
                                                    {loan.type === 'lent' ? 'To receive from' : 'To pay'} {personName} — {formatCurrency(loan.amount)}
                                                </div>
                                                <div className="notif-reminder-actions">
                                                    <Link
                                                        to={`/loan/${loan.id}`}
                                                        className="notif-action-btn view"
                                                        onClick={onClose}
                                                    >
                                                        View Details
                                                    </Link>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )
                    )}
                </div>
            </div>
        </div>
    );
};

export default NotificationPanel;
