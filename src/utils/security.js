// Security and Access Control Utilities
// NOTE: Session management is handled by Supabase Auth.
// This file provides helper utilities for role-based authorization.

/**
 * Authorize user - Check if user has permission for certain actions
 * @param {Object} user - Current user object (from Supabase Auth)
 * @param {string} action - Action to authorize (view, create, edit, delete)
 * @param {string} resource - Resource type (loan, payment, user, etc.)
 * @returns {Object} Authorization result
 */
export const authorizeUser = (user, action, resource) => {
    try {
        if (!user || !user.id) {
            return {
                authorized: false,
                reason: 'User not authenticated'
            };
        }

        // Role-based access control (RBAC)
        const userRole = user.role || 'user';

        const permissions = {
            admin: ['view', 'create', 'edit', 'delete'],
            user: ['view', 'create', 'edit'],
            guest: ['view']
        };

        const allowedActions = permissions[userRole] || permissions.guest;

        if (!allowedActions.includes(action)) {
            return {
                authorized: false,
                reason: `User role '${userRole}' does not have permission to ${action} ${resource}`
            };
        }

        return {
            authorized: true,
            user: user.name || user.email,
            action,
            resource
        };
    } catch (error) {
        console.error('Authorization error:', error);
        return {
            authorized: false,
            reason: 'Authorization check failed',
            error: error.message
        };
    }
};

/**
 * Authorize loan access - Check if user can access specific loan
 * @param {Object} user - Current user object
 * @param {Object} loan - Loan object to check access for
 * @param {string} action - Action to perform (view, edit, delete)
 * @returns {Object} Authorization result
 */
export const authorizeLoanAccess = (user, loan, action = 'view') => {
    try {
        const basicAuth = authorizeUser(user, action, 'loan');
        if (!basicAuth.authorized) {
            return basicAuth;
        }

        // Check if user owns this loan (either as creator or via user_id)
        const isOwner = loan.user_id === user.id || loan.userId === user.id;
        const isCreator = loan.created_by === user.id;
        const isAdmin = user.role === 'admin';

        if (!isOwner && !isCreator && !isAdmin) {
            return {
                authorized: false,
                reason: 'User does not have access to this loan'
            };
        }

        // Additional checks for destructive actions
        if (action === 'delete' && loan.amountPaid > 0) {
            return {
                authorized: false,
                reason: 'Cannot delete loan with payments'
            };
        }

        if (action === 'edit' && loan.status === 'completed') {
            return {
                authorized: false,
                reason: 'Cannot edit completed loan'
            };
        }

        return {
            authorized: true,
            loanId: loan.id,
            action
        };
    } catch (error) {
        console.error('Loan authorization error:', error);
        return {
            authorized: false,
            reason: 'Loan access check failed',
            error: error.message
        };
    }
};
