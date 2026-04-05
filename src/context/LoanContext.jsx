import { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../supabase';
import toast from 'react-hot-toast';

const LoanContext = createContext();

export const useLoan = () => {
    const context = useContext(LoanContext);
    if (!context) {
        throw new Error('useLoan must be used within a LoanProvider');
    }
    return context;
};

export const LoanProvider = ({ children }) => {
    const [loans, setLoans] = useState([]);
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [gamification, setGamification] = useState({
        points: 0,
        level: 1,
        badges: [],
        streak: 0,
        trustScore: 500,
        stats: {
            totalLoans: 0,
            completedLoans: 0,
            totalPayments: 0,
            onTimePayments: 0,
            lastPaymentDate: null
        }
    });
    const [activities, setActivities] = useState([]);
    const [notifications, setNotifications] = useState([]);
    const [unreadNotificationCount, setUnreadNotificationCount] = useState(0);

    // Auth state listener
    useEffect(() => {
        const getInitialSession = async () => {
            const { data: { session } } = await supabase.auth.getSession();
            handleAuthStateChange(session?.user || null);
            setLoading(false);
        };

        getInitialSession();

        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            handleAuthStateChange(session?.user || null);
        });

        return () => subscription.unsubscribe();
    }, []);

    const handleAuthStateChange = async (supabaseUser) => {
        if (supabaseUser) {
            // Fetch profile data including gamification
            const { data: profile, error } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', supabaseUser.id)
                .single();

            if (error) {
                console.error('Error fetching profile:', error);
            }

            setUser({
                id: supabaseUser.id,
                email: supabaseUser.email,
                name: profile?.name || supabaseUser.user_metadata?.name || supabaseUser.email.split('@')[0],
                avatar_url: profile?.avatar_url || supabaseUser.user_metadata?.avatar_url || '',
                phone: profile?.phone || '',
                aadhaar: profile?.aadhaar || '',
                ...supabaseUser
            });

            if (profile?.gamification) {
                setGamification(profile.gamification);
            }
            
            setIsAuthenticated(true);
        } else {
            setUser(null);
            setIsAuthenticated(false);
            setGamification({
                points: 0,
                level: 1,
                badges: [],
                streak: 0,
                trustScore: 500,
                stats: {
                    totalLoans: 0,
                    completedLoans: 0,
                    totalPayments: 0,
                    onTimePayments: 0,
                    lastPaymentDate: null
                }
            });
        }
    };

    // Helper function to map database fields to app format
    const mapLoanFromDB = (dbLoan) => {
        let computedType = dbLoan.type;
        if (user?.email) {
            if (dbLoan.borrower_email?.toLowerCase() === user.email.toLowerCase()) {
                computedType = 'borrowed';
            } else if (dbLoan.lender_email?.toLowerCase() === user.email.toLowerCase()) {
                computedType = 'lent';
            }
        }

        return {
        id: dbLoan.id,
        user_id: dbLoan.user_id,
        created_by: dbLoan.created_by,
        type: computedType,
        amount: parseFloat(dbLoan.amount),
        amountPaid: parseFloat(dbLoan.amount_paid) || 0,
        currency: dbLoan.currency,
        interestRate: parseFloat(dbLoan.interest_rate) || 0,
        borrowerName: dbLoan.borrower_name,
        borrowerEmail: dbLoan.borrower_email,
        lenderName: dbLoan.lender_name,
        lenderEmail: dbLoan.lender_email,
        status: dbLoan.status,
        dueDate: dbLoan.due_date,
        description: dbLoan.description,
        repaymentSchedule: dbLoan.repayment_schedule,
        metadata: dbLoan.metadata,
        createdAt: new Date(dbLoan.created_at),
        payments: dbLoan.payments || []
        };
    };

    // GET SINGLE LOAN DETAILS
    const getLoanDetails = (loanId) => {
        return loans.find(l => l.id === loanId) || null;
    };

    // GET LOANS FILTERED BY TYPE/STATUS
    const getLoansByUser = (filter = 'all') => {
        if (filter === 'all') return loans;
        if (filter === 'lent' || filter === 'borrowed') {
            return loans.filter(l => l.type === filter);
        }
        // status-based filter
        return loans.filter(l => l.status === filter);
    };

    // GET REPAYMENTS FOR A SPECIFIC LOAN
    const getRepaymentsByLoan = (loanId) => {
        const loan = loans.find(l => l.id === loanId);
        return loan?.payments || [];
    };

    // CALCULATE OUTSTANDING AMOUNT
    const calculateOutstandingAmount = (loanId) => {
        const loan = loans.find(l => l.id === loanId);
        if (!loan) return 0;
        return Math.max(0, loan.amount - loan.amountPaid);
    };

    // FETCH LOANS
    const fetchLoans = async () => {
        if (!user) return;
        setLoading(true);
        try {
            // In Supabase SQL, we can use OR in filters directly or use .or()
            const { data, error } = await supabase
                .from('loans')
                .select('*, payments(*)')
                .or(`user_id.eq.${user.id},borrower_email.ilike.${user.email},lender_email.ilike.${user.email}`)
                .order('created_at', { ascending: false });

            if (error) throw error;

            const loadedLoans = data.map(mapLoanFromDB);
            setLoans(loadedLoans);
            checkDueDates(loadedLoans);
        } catch (error) {
            console.error('Error fetching loans:', error.message);
        } finally {
            setLoading(false);
        }
    };

    // FETCH ACTIVITIES
    const fetchActivities = async () => {
        if (!user) return;
        try {
            const { data, error } = await supabase
                .from('activities')
                .select('*')
                .eq('user_id', user.id)
                .order('created_at', { ascending: false })
                .limit(100);

            if (error) throw error;
            setActivities(data);
        } catch (error) {
            console.error('Error fetching activities:', error.message);
        }
    };

    // CHECK DUE DATES
    const checkDueDates = (loadedLoans) => {
        if (!user) return;
        if (sessionStorage.getItem('fintrust_notified_due')) return;

        let notified = false;
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        loadedLoans.forEach(loan => {
            const isBorrower = loan.borrowerEmail === user.email || (loan.type === 'borrowed' && loan.user_id === user.id);
            if (loan.status === 'active' && isBorrower) {
                const dueDate = new Date(loan.dueDate);
                dueDate.setHours(0, 0, 0, 0);
                const timeDiff = dueDate.getTime() - today.getTime();
                const daysDiff = Math.ceil(timeDiff / (1000 * 3600 * 24));

                if (daysDiff === 0) {
                    setTimeout(() => {
                        toast(`🚨 URGENT: Your loan from ${loan.lenderName || 'lender'} is due TODAY!`, {
                            duration: 8000,
                            style: { background: '#EF4444', color: '#fff', fontWeight: 'bold' }
                        });
                    }, 1000);
                    notified = true;
                } else if (daysDiff === 1) {
                    setTimeout(() => {
                        toast(`📅 Friendly reminder: Your loan from ${loan.lenderName || 'lender'} is due tomorrow!`, {
                            duration: 6000,
                            style: { background: '#F59E0B', color: '#fff' }
                        });
                    }, 1500);
                    notified = true;
                }
            }
        });

        if (notified) sessionStorage.setItem('fintrust_notified_due', 'true');
    };

    // FETCH NOTIFICATIONS
    const fetchNotifications = async () => {
        if (!user) return;
        try {
            const { data, error } = await supabase
                .from('notifications')
                .select('*')
                .eq('user_id', user.id)
                .order('created_at', { ascending: false })
                .limit(50);

            if (error) throw error;
            setNotifications(data || []);
            setUnreadNotificationCount((data || []).filter(n => !n.is_read).length);
        } catch (error) {
            console.error('Error fetching notifications:', error.message);
        }
    };

    // MARK NOTIFICATION AS READ
    const markNotificationRead = async (notificationId) => {
        try {
            const { error } = await supabase
                .from('notifications')
                .update({ is_read: true })
                .eq('id', notificationId);

            if (error) throw error;
            setNotifications(prev => prev.map(n => n.id === notificationId ? { ...n, is_read: true } : n));
            setUnreadNotificationCount(prev => Math.max(0, prev - 1));
        } catch (error) {
            console.error('Error marking notification as read:', error);
        }
    };

    // MARK ALL NOTIFICATIONS AS READ
    const markAllNotificationsRead = async () => {
        if (!user) return;
        try {
            const { error } = await supabase
                .from('notifications')
                .update({ is_read: true })
                .eq('user_id', user.id)
                .eq('is_read', false);

            if (error) throw error;
            setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
            setUnreadNotificationCount(0);
        } catch (error) {
            console.error('Error marking all notifications as read:', error);
        }
    };

    // DELETE A NOTIFICATION
    const deleteNotification = async (notificationId) => {
        try {
            const notification = notifications.find(n => n.id === notificationId);
            const { error } = await supabase
                .from('notifications')
                .delete()
                .eq('id', notificationId);

            if (error) throw error;
            setNotifications(prev => prev.filter(n => n.id !== notificationId));
            if (notification && !notification.is_read) {
                setUnreadNotificationCount(prev => Math.max(0, prev - 1));
            }
        } catch (error) {
            console.error('Error deleting notification:', error);
        }
    };

    // SEND NOTIFICATION TO ANOTHER USER
    const sendNotification = async (targetUserId, type, title, message, loanId = null) => {
        if (!user) return;
        try {
            await supabase.from('notifications').insert([{
                user_id: targetUserId,
                type,
                title,
                message,
                loan_id: loanId,
                from_user_id: user.id,
                from_user_name: user.name || user.email?.split('@')[0] || 'User',
                is_read: false
            }]);
        } catch (error) {
            console.error('Error sending notification:', error);
        }
    };

    // RESPOND TO LOAN (ACCEPT/REJECT)
    const respondToLoan = async (loanId, response) => {
        if (!user) return { success: false, error: 'User not authenticated' };
        try {
            // Try local state first, then fetch from DB if not found
            let loan = loans.find(l => l.id === loanId);
            
            if (!loan) {
                // Loan not in local state — fetch directly from database
                const { data: dbLoan, error: fetchError } = await supabase
                    .from('loans')
                    .select('*')
                    .eq('id', loanId)
                    .single();
                
                if (fetchError || !dbLoan) {
                    console.error('Could not find loan:', fetchError);
                    return { success: false, error: 'Loan not found in database' };
                }
                
                // Map DB loan to app format for use below
                loan = {
                    id: dbLoan.id,
                    user_id: dbLoan.user_id,
                    created_by: dbLoan.created_by,
                    type: dbLoan.type,
                    amount: parseFloat(dbLoan.amount),
                    amountPaid: parseFloat(dbLoan.amount_paid) || 0,
                    borrowerName: dbLoan.borrower_name,
                    borrowerEmail: dbLoan.borrower_email,
                    lenderName: dbLoan.lender_name,
                    lenderEmail: dbLoan.lender_email,
                    status: dbLoan.status,
                };
            }

            const newStatus = response === 'accept' ? 'active' : 'rejected';

            const { error } = await supabase
                .from('loans')
                .update({ status: newStatus, updated_at: new Date().toISOString() })
                .eq('id', loanId);

            if (error) throw error;

            // Update local state
            setLoans(prev => prev.map(l => l.id === loanId ? { ...l, status: newStatus } : l));

            // Notify the loan creator
            const creatorId = loan.created_by || loan.user_id;
            if (creatorId && creatorId !== user.id) {
                const userName = user.name || user.email?.split('@')[0] || 'User';
                if (response === 'accept') {
                    await sendNotification(
                        creatorId,
                        'loan_approved',
                        'Loan Accepted! ✅',
                        `${userName} has accepted the ₹${loan.amount} loan.`,
                        loanId
                    );
                    toast.success('Loan accepted successfully!');
                } else {
                    await sendNotification(
                        creatorId,
                        'loan_rejected',
                        'Loan Declined ❌',
                        `${userName} has declined the ₹${loan.amount} loan.`,
                        loanId
                    );
                    toast.success('Loan rejected.');
                }
            }

            logActivity(
                response === 'accept' ? 'LOAN_ACCEPTED' : 'LOAN_REJECTED',
                `${response === 'accept' ? 'Accepted' : 'Rejected'} loan of ₹${loan.amount}`,
                loanId
            );

            return { success: true };
        } catch (error) {
            console.error('Error responding to loan:', error);
            return { success: false, error: error.message };
        }
    };

    // GET PENDING APPROVAL LOANS (loans created by others where current user is counterpart)
    const getPendingApprovalLoans = () => {
        if (!user) return [];
        return loans.filter(l => {
            if (l.status !== 'pending_approval') return false;
            // The loan was not created by the current user
            const createdByOther = l.created_by && l.created_by !== user.id;
            // The current user is the counterpart (borrower or lender)
            const isCounterpart = l.borrowerEmail?.toLowerCase() === user.email?.toLowerCase() || l.lenderEmail?.toLowerCase() === user.email?.toLowerCase();
            return createdByOther && isCounterpart;
        });
    };

    // Initial Load
    useEffect(() => {
        if (user) {
            fetchLoans();
            fetchActivities();
            fetchNotifications();
        } else {
            setLoans([]);
            setActivities([]);
            setNotifications([]);
            setUnreadNotificationCount(0);
        }
    }, [user]);

    // CREATE LOAN
    const createLoan = async (loanData) => {
        if (!user) return { success: false, error: 'User not authenticated' };
        setLoading(true);
        try {
            // --- VALIDATE COUNTERPART USER EXISTS ---
            const counterpartEmail = loanData.type === 'lent'
                ? loanData.borrowerEmail
                : loanData.lenderEmail;

            let counterpartProfile = null;
            if (counterpartEmail) {
                if (counterpartEmail.toLowerCase() === user.email.toLowerCase()) {
                    return { success: false, error: "You cannot lend or borrow money from yourself." };
                }

                const { data: profileData, error: profileError } = await supabase
                    .from('profiles')
                    .select('id, name, email')
                    .eq('email', counterpartEmail.toLowerCase())
                    .single();

                if (profileError || !profileData) {
                    return { success: false, error: 'User does not exist. Please use a registered email address.' };
                }
                
                counterpartProfile = profileData;
                
                // Prevent creating a loan with oneself
                if (counterpartProfile.id === user.id) {
                     return { success: false, error: 'You cannot create a loan with yourself.' };
                }
            } else {
                 return { success: false, error: 'An email is required for the other party.' };
            }

            const newLoan = {
                user_id: user.id,
                type: loanData.type,
                amount: loanData.amount,
                amount_paid: 0,
                currency: loanData.currency || 'INR',
                interest_rate: loanData.interestRate || 0,
                borrower_name: loanData.borrowerName || '',
                borrower_email: loanData.borrowerEmail || '',
                lender_name: loanData.lenderName || '',
                lender_email: loanData.lenderEmail || '',
                status: 'pending_approval',
                created_by: user.id,
                due_date: loanData.dueDate,
                description: loanData.description || '',
                repayment_schedule: loanData.repaymentSchedule || 'monthly',
                metadata: loanData.metadata || {}
            };

            const { data, error } = await supabase
                .from('loans')
                .insert([newLoan])
                .select()
                .single();

            if (error) throw error;

            const mappedLoan = mapLoanFromDB(data);
            setLoans(prev => [mappedLoan, ...prev]);

            logActivity('LOAN_CREATED', `Created ${loanData.type} loan for ₹${loanData.amount}`, data.id);
            updateStatsOnLoanCreate();

            // --- NOTIFY THE COUNTERPART USER ---
            if (counterpartProfile && counterpartProfile.id !== user.id) {
                const userName = user.name || user.email?.split('@')[0] || 'User';
                const loanTypeLabel = loanData.type === 'lent' ? 'lent you' : 'borrowed from you';

                await sendNotification(
                    counterpartProfile.id,
                    'loan_created',
                    'New Loan Request 📋',
                    `${userName} has ${loanTypeLabel} ₹${loanData.amount}. Please review and accept or reject this loan.`,
                    data.id
                );

                // Also log activity for the counterpart
                try {
                    await supabase.from('activities').insert([{
                        user_id: counterpartProfile.id,
                        type: 'LOAN_RECEIVED',
                        description: `${userName} created a ${loanData.type} loan of ₹${loanData.amount} involving you`,
                        loan_id: data.id,
                        metadata: {}
                    }]);
                } catch (actErr) {
                    console.error('Error logging counterpart activity:', actErr);
                }
            }

            return { success: true, loan: mappedLoan };
        } catch (error) {
            console.error('Error creating loan:', error);
            return { success: false, error: error.message };
        } finally {
            setLoading(false);
        }
    };

    // UPDATE LOAN
    const updateLoan = async (loanId, updatedData) => {
        if (!user) return { success: false, error: 'User not authenticated' };
        setLoading(true);
        try {
            const updateObj = {};
            if (updatedData.amount !== undefined) updateObj.amount = updatedData.amount;
            if (updatedData.interestRate !== undefined) updateObj.interest_rate = updatedData.interestRate;
            if (updatedData.borrowerName !== undefined) updateObj.borrower_name = updatedData.borrowerName;
            if (updatedData.borrowerEmail !== undefined) updateObj.borrower_email = updatedData.borrowerEmail;
            if (updatedData.lenderName !== undefined) updateObj.lender_name = updatedData.lenderName;
            if (updatedData.lenderEmail !== undefined) updateObj.lender_email = updatedData.lenderEmail;
            if (updatedData.status !== undefined) updateObj.status = updatedData.status;
            if (updatedData.dueDate !== undefined) updateObj.due_date = updatedData.dueDate;
            if (updatedData.description !== undefined) updateObj.description = updatedData.description;
            if (updatedData.repaymentSchedule !== undefined) updateObj.repayment_schedule = updatedData.repaymentSchedule;
            
            updateObj.updated_at = new Date().toISOString();

            const { error } = await supabase
                .from('loans')
                .update(updateObj)
                .eq('id', loanId);

            if (error) throw error;

            setLoans(prev => prev.map(loan => loan.id === loanId ? { ...loan, ...updatedData } : loan));
            return { success: true };
        } catch (error) {
            console.error('Error updating loan:', error);
            return { success: false, error: error.message };
        } finally {
            setLoading(false);
        }
    };

    // DELETE LOAN
    const deleteLoan = async (loanId) => {
        if (!user) return { success: false, error: 'User not authenticated' };
        setLoading(true);
        try {
            const { data, error } = await supabase.from('loans').delete().eq('id', loanId).select();
            
            if (error) throw error;
            
            if (!data || data.length === 0) {
                // Supabase RLS silently blocked the deletion (0 rows deleted)
                throw new Error("Permission denied: You can only delete loans you created.");
            }
            
            setLoans(prev => prev.filter(loan => loan.id !== loanId));
            return { success: true };
        } catch (error) {
            console.error('Error deleting loan:', error);
            // Revert state just in case, though it shouldn't have changed yet
            toast.error(error.message || 'Failed to delete loan.');
            return { success: false, error: error.message };
        } finally {
            setLoading(false);
        }
    };

    // LOGIN
    const login = async (email, password) => {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        return { user: data.user, error: null };
    };

    // GOOGLE LOGIN
    const loginWithGoogle = async () => {
        try {
            const { data, error } = await supabase.auth.signInWithOAuth({
                provider: 'google',
                options: {
                    redirectTo: window.location.origin + '/dashboard',
                    queryParams: {
                        access_type: 'offline',
                        prompt: 'select_account'
                    }
                }
            });
            if (error) throw error;
            return { success: true, data };
        } catch (error) {
            console.error('Google login error:', error);
            toast.error('Failed to log in with Google');
            return { success: false, error: error.message };
        }
    };

    // SIGNUP
    const signup = async (email, password, name, phone, aadhaar) => {
        const { data, error } = await supabase.auth.signUp({
            email,
            password,
            options: {
                data: { name, phone, aadhaar }
            }
        });
        if (error) throw error;
        return { user: data.user, error: null };
    };

    // LOGOUT
    const logout = async () => {
        const { error } = await supabase.auth.signOut();
        if (error) throw error;
        
        // Reset theme to day on logout
        document.documentElement.setAttribute('data-theme', 'day');
        localStorage.setItem('theme', 'day');
        
        setUser(null);
        setIsAuthenticated(false);
        setLoans([]);
    };

    // ADD REPAYMENT
    const addRepayment = async (loanId, paymentData) => {
        if (!user) return { success: false, error: 'User not authenticated' };
        setLoading(true);
        try {
            const newPayment = {
                loan_id: loanId,
                user_id: user.id,
                amount: parseFloat(paymentData.amount),
                date: paymentData.date,
                status: 'completed'
            };

            const { data, error } = await supabase
                .from('payments')
                .insert([newPayment])
                .select()
                .single();

            if (error) throw error;

            const loan = loans.find(l => l.id === loanId);
            const updatedAmountPaid = (loan.amountPaid || 0) + parseFloat(paymentData.amount);

            await supabase
                .from('loans')
                .update({ amount_paid: updatedAmountPaid, updated_at: new Date().toISOString() })
                .eq('id', loanId);

            setLoans(prev => prev.map(l => l.id === loanId ? {
                ...l,
                payments: [data, ...(l.payments || [])],
                amountPaid: updatedAmountPaid
            } : l));

            updateStatsOnPayment(paymentData.date, loan.dueDate);
            logActivity('PAYMENT_MADE', `Payment of ₹${paymentData.amount} made`, loanId);
            await updateLoanStatus(loanId);

            // --- NOTIFY THE LENDER ---
            try {
                // Note: since only the borrower can make payments now, the counterparty must be the lender.
                const lenderEmail = loan.lenderEmail;
                if (lenderEmail && lenderEmail !== user.email) {
                    const { data: lenderProfile } = await supabase
                        .from('profiles')
                        .select('id, name')
                        .eq('email', lenderEmail)
                        .single();

                    if (lenderProfile && lenderProfile.id !== user.id) {
                        const borrowerName = user.name || user.email?.split('@')[0] || 'User';
                        await sendNotification(
                            lenderProfile.id,
                            'payment_received',
                            'Payment Received 💰',
                            `${borrowerName} has made a payment of ₹${paymentData.amount} towards your loan.`,
                            loanId
                        );
                        
                        // Log activity for lender
                        await supabase.from('activities').insert([{
                            user_id: lenderProfile.id,
                            type: 'PAYMENT_RECEIVED',
                            description: `Received payment of ₹${paymentData.amount} from ${borrowerName}`,
                            loan_id: loanId,
                            metadata: {}
                        }]);
                    }
                }
            } catch (notifyErr) {
                console.error("Error notifying lender about payment:", notifyErr);
            }

            return { success: true, payment: data };
        } catch (error) {
            console.error('Error adding repayment:', error);
            return { success: false, error: error.message };
        } finally {
            setLoading(false);
        }
    };

    // UPDATE LOAN STATUS
    const updateLoanStatus = async (loanId) => {
        // Re-read fresh loan data to avoid stale closure
        const freshLoans = await new Promise(resolve => {
            setLoans(prev => { resolve(prev); return prev; });
        });
        const loan = freshLoans.find(l => l.id === loanId);
        if (!loan) return { success: false };

        let newStatus = loan.status;
        const outstanding = loan.amount - loan.amountPaid;
        const today = new Date();
        const dueDate = new Date(loan.dueDate);

        if (outstanding <= 0) newStatus = 'completed';
        else if (dueDate < today) newStatus = 'overdue';
        else newStatus = 'active';

        if (newStatus !== loan.status) {
            await updateLoan(loanId, { status: newStatus });
            if (newStatus === 'completed') updateStatsOnLoanComplete();
        }
        return { success: true, status: newStatus };
    };

    // ACTIVITY LOGGING
    const logActivity = async (type, description, loan_id = null, metadata = {}) => {
        if (!user) return;
        try {
            await supabase.from('activities').insert([{
                user_id: user.id,
                type,
                description,
                loan_id,
                metadata
            }]);
            fetchActivities();
        } catch (error) {
            console.error('Error logging activity:', error);
        }
    };

    // GAMIFICATION logic (debounced sync with DB)
    useEffect(() => {
        if (!user || !isAuthenticated) return;
        const timer = setTimeout(async () => {
            try {
                await supabase
                    .from('profiles')
                    .update({ gamification })
                    .eq('id', user.id);
            } catch (err) {
                console.error('Failed to save gamification:', err);
            }
        }, 1000); // 1s debounce to avoid rapid writes
        return () => clearTimeout(timer);
    }, [gamification, user, isAuthenticated]);

    const updateStatsOnLoanCreate = () => {
        setGamification(prev => ({
            ...prev,
            stats: { ...prev.stats, totalLoans: prev.stats.totalLoans + 1 },
            points: prev.points + 50
        }));
    };

    const updateStatsOnPayment = (paymentDate, dueDate) => {
        const isOnTime = new Date(paymentDate) <= new Date(dueDate);
        setGamification(prev => ({
            ...prev,
            stats: {
                ...prev.stats,
                totalPayments: prev.stats.totalPayments + 1,
                onTimePayments: isOnTime ? prev.stats.onTimePayments + 1 : prev.stats.onTimePayments
            },
            points: prev.points + (isOnTime ? 75 : 50),
            trustScore: isOnTime ? prev.trustScore + 10 : prev.trustScore
        }));
    };

    const updateStatsOnLoanComplete = () => {
        setGamification(prev => ({
            ...prev,
            stats: { ...prev.stats, completedLoans: prev.stats.completedLoans + 1 },
            points: prev.points + 200
        }));
    };

    const getDashboardStats = () => {
        const lent = loans.filter(l => l.type === 'lent');
        const borrowed = loans.filter(l => l.type === 'borrowed');
        
        const activeLent = lent.filter(l => l.status === 'active');
        const activeBorrowed = borrowed.filter(l => l.status === 'active');
        
        const overdueLoans = loans.filter(l => l.status === 'overdue');
        const completedLoans = loans.filter(l => l.status === 'completed');

        const lentOutstanding = activeLent.reduce((sum, l) => sum + (l.amount - l.amountPaid), 0);
        const borrowedOutstanding = activeBorrowed.reduce((sum, l) => sum + (l.amount - l.amountPaid), 0);

        // Aggregate payments
        const allPayments = loans.flatMap(l => l.payments || []);
        const totalPaymentsAmount = allPayments.reduce((sum, p) => sum + p.amount, 0);

        return {
            overview: {
                totalLent: lent.reduce((sum, l) => sum + l.amount, 0),
                totalBorrowed: borrowed.reduce((sum, l) => sum + l.amount, 0),
                totalLentPaid: lent.reduce((sum, l) => sum + l.amountPaid, 0),
                totalBorrowedPaid: borrowed.reduce((sum, l) => sum + l.amountPaid, 0),
                lentOutstanding,
                borrowedOutstanding,
                netPosition: lentOutstanding - borrowedOutstanding,
                activeLoans: activeLent.length + activeBorrowed.length,
                overdueLoans: overdueLoans.length,
                completedLoans: completedLoans.length
            },
            lending: {
                activeCount: activeLent.length,
                totalAmount: lent.reduce((sum, l) => sum + l.amount, 0)
            },
            borrowing: {
                activeCount: activeBorrowed.length,
                totalAmount: borrowed.reduce((sum, l) => sum + l.amount, 0)
            },
            payments: {
                totalCount: allPayments.length,
                totalAmount: totalPaymentsAmount,
                averageAmount: allPayments.length > 0 ? totalPaymentsAmount / allPayments.length : 0
            }
        };
    };

    const getTotalAmountOwed = () => {
        const borrowed = loans.filter(l => l.type === 'borrowed' && l.status === 'active');
        return borrowed.reduce((sum, l) => sum + (l.amount - l.amountPaid), 0);
    };

    const getPendingLoans = () => {
        return loans.filter(l => l.status === 'pending_approval' || l.status === 'active');
    };

    const getOverdueLoans = () => {
        return loans.filter(l => l.status === 'overdue');
    };

    const getActivityFeed = (limit = 10) => {
        return activities.slice(0, limit);
    };

    const getLoanActivityLog = (loanId) => {
        return activities.filter(a => a.loan_id === loanId);
    };

    return (
        <LoanContext.Provider value={{
            loans, user, loading, isAuthenticated, activities, gamification,
            notifications, unreadNotificationCount,
            fetchLoans, fetchActivities, fetchNotifications,
            createLoan, updateLoan, deleteLoan,
            login, signup, logout, loginWithGoogle, addRepayment, getDashboardStats,
            getLoanDetails, getLoansByUser, getRepaymentsByLoan, calculateOutstandingAmount,
            getTotalAmountOwed, getPendingLoans, getOverdueLoans,
            getActivityFeed, getLoanActivityLog,
            markNotificationRead, markAllNotificationsRead, deleteNotification,
            respondToLoan, getPendingApprovalLoans
        }}>
            {children}
        </LoanContext.Provider>
    );
};
