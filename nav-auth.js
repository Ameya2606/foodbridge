document.addEventListener('DOMContentLoaded', () => {
    const role = localStorage.getItem('fb_role');
    const token = localStorage.getItem('fb_token');
    
    const dashboardLink = document.getElementById('nav-dashboard');
    const loginLink = document.getElementById('nav-login');
    const logoutLink = document.getElementById('nav-logout');

    if (token) {
        if (loginLink) loginLink.style.display = 'none';
        if (logoutLink) logoutLink.style.display = 'inline-block';
        if (role === 'admin' && dashboardLink) {
            dashboardLink.style.display = 'inline-block';
        }
    }
});

function logoutUser() {
    localStorage.removeItem('fb_token');
    localStorage.removeItem('fb_role');
    window.location.href = 'auth.html';
}
