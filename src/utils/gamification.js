// Badge and achievement definitions
export const badges = [
    {
        id: 'first_loan',
        name: 'First Steps',
        icon: '🎖️',
        description: 'Create your first loan',
        condition: (gam) => gam.stats.totalLoans >= 1
    },
    {
        id: 'regular_payer',
        name: 'Regular Payer',
        icon: '💰',
        description: 'Make 5 payments',
        condition: (gam) => gam.stats.totalPayments >= 5
    },
    {
        id: 'responsible',
        name: 'Responsible',
        icon: '⭐',
        description: 'Complete your first loan',
        condition: (gam) => gam.stats.completedLoans >= 1
    },
    {
        id: 'streak_7',
        name: 'On Fire',
        icon: '🔥',
        description: '7-day payment streak',
        condition: (gam) => gam.streak >= 7
    },
    {
        id: 'streak_30',
        name: 'Diamond',
        icon: '💎',
        description: '30-day payment streak',
        condition: (gam) => gam.streak >= 30
    },
    {
        id: 'loan_master',
        name: 'Loan Master',
        icon: '🏆',
        description: 'Manage 10 loans',
        condition: (gam) => gam.stats.totalLoans >= 10
    },
    {
        id: 'trust_80',
        name: 'Growth',
        icon: '📈',
        description: 'Reach 80% trust score',
        condition: (gam) => gam.trustScore >= 80
    },
    {
        id: 'perfect',
        name: 'Perfectionist',
        icon: '🎯',
        description: '100% on-time payment rate',
        condition: (gam) => gam.stats.totalPayments >= 10 &&
            gam.stats.onTimePayments === gam.stats.totalPayments
    }
];

// Level definitions
export const levels = [
    { level: 1, minPoints: 0, title: 'Beginner', color: '#9CA3AF' },
    { level: 2, minPoints: 500, title: 'Learner', color: '#60A5FA' },
    { level: 3, minPoints: 1000, title: 'Skilled', color: '#A78BFA' },
    { level: 4, minPoints: 2000, title: 'Expert', color: '#F59E0B' },
    { level: 5, minPoints: 5000, title: 'Master', color: '#10B981' },
    { level: 6, minPoints: 10000, title: 'Legend', color: '#F59E0B' }
];

// Points awarded for various actions
export const pointsConfig = {
    CREATE_FIRST_LOAN: 100,
    CREATE_LOAN: 50,
    MAKE_PAYMENT: 50,
    ON_TIME_PAYMENT: 75,
    COMPLETE_LOAN: 200,
    EARLY_COMPLETION: 250,
    STREAK_7_DAYS: 100,
    STREAK_30_DAYS: 500
};

/**
 * Calculates current level and new badges based on points and stats
 * @param {Object} currentGam Gamification state
 * @returns {Object} Updated gamification state
 */
export const calculateGamificationUpdate = (currentGam) => {
    // Calculate Level
    let newLevel = 1;
    for (let i = levels.length - 1; i >= 0; i--) {
        if (currentGam.points >= levels[i].minPoints) {
            newLevel = levels[i].level;
            break;
        }
    }

    // Identify new badges
    const currentBadges = currentGam.badges || [];
    const unlockedBadges = badges
        .filter(badge => !currentBadges.includes(badge.id))
        .filter(badge => badge.condition(currentGam))
        .map(badge => badge.id);

    return {
        ...currentGam,
        level: newLevel,
        badges: [...currentBadges, ...unlockedBadges]
    };
};
