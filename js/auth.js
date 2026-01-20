// Authentication Helper Functions
// Include this file in all protected pages

let currentUser = null;

/**
 * Check if user is authenticated
 * Redirects to login if not authenticated
 * @returns {Promise<Object|null>} User object or null
 */
async function checkAuth() {
    const sessionToken = localStorage.getItem('sessionToken');

    if (!sessionToken) {
        redirectToLogin();
        return null;
    }

    try {
        const response = await fetch('/api/auth?action=session', {
            headers: {
                'Authorization': `Bearer ${sessionToken}`
            }
        });

        if (!response.ok) {
            throw new Error('Session invalid');
        }

        const data = await response.json();

        if (data.user) {
            currentUser = data.user;
            updateUserUI(data.user);
            return data.user;
        } else {
            throw new Error('No user data');
        }
    } catch (error) {
        console.error('Auth check failed:', error);
        localStorage.removeItem('sessionToken');
        localStorage.removeItem('user');
        redirectToLogin();
        return null;
    }
}

/**
 * Redirect to login page
 */
function redirectToLogin() {
    if (window.location.pathname !== '/login.html') {
        window.location.href = '/login.html';
    }
}

/**
 * Logout user
 */
async function logout() {
    const sessionToken = localStorage.getItem('sessionToken');

    if (sessionToken) {
        try {
            await fetch('/api/auth?action=logout', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${sessionToken}`
                }
            });
        } catch (error) {
            console.error('Logout error:', error);
        }
    }

    localStorage.removeItem('sessionToken');
    localStorage.removeItem('user');
    window.location.href = '/login.html';
}

/**
 * Update UI with user information
 * @param {Object} user - User object
 */
function updateUserUI(user) {
    // Update user email display
    const userEmailEl = document.getElementById('userEmail');
    if (userEmailEl) {
        userEmailEl.textContent = user.email;
    }

    // Update user role badge
    const userRoleEl = document.getElementById('userRole');
    if (userRoleEl) {
        userRoleEl.textContent = user.role.toUpperCase();
        userRoleEl.className = `role-badge role-${user.role}`;
    }

    // Update username
    const usernameEl = document.getElementById('username');
    if (usernameEl) {
        usernameEl.textContent = user.username || user.email.split('@')[0];
    }
}

/**
 * Check if user has specific role
 * @param {string} role - Role to check
 * @returns {boolean}
 */
function hasRole(role) {
    if (!currentUser) return false;
    return currentUser.role === role;
}

/**
 * Check if user can edit (contributor or admin)
 * @returns {boolean}
 */
function canEdit() {
    if (!currentUser) return false;
    return currentUser.role === 'admin' || currentUser.role === 'contributor';
}

/**
 * Check if user is admin
 * @returns {boolean}
 */
function isAdmin() {
    return hasRole('admin');
}

/**
 * Make authenticated API request
 * @param {string} url - API endpoint
 * @param {Object} options - Fetch options
 * @returns {Promise<Response>}
 */
async function authFetch(url, options = {}) {
    const sessionToken = localStorage.getItem('sessionToken');

    if (!sessionToken) {
        throw new Error('No session token');
    }

    const headers = {
        ...options.headers,
        'Authorization': `Bearer ${sessionToken}`
    };

    return fetch(url, { ...options, headers });
}
