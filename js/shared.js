// Auth Enforcement
const _auth_user_token = localStorage.getItem('smart_tracker_user');
const _auth_is_auth_page = window.location.pathname.endsWith('index.html') || window.location.pathname.endsWith('/');
if (!_auth_user_token && !_auth_is_auth_page) {
    window.location.href = 'index.html';
}

// shared formatting and UI navigation logic
function formatCurrency(amount) {
    const isNegative = amount < 0;
    const formatted = Math.abs(amount).toLocaleString('en-IN', {
        style: 'currency',
        currency: 'INR'
    });
    return isNegative ? `-${formatted}` : formatted;
}

function formatDateToReadable(dateStr) {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatTimeToReadable(dateStr) {
    const date = new Date(dateStr);
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

function setupNavigation() {
    // Add links to navigation
    const navLinks = [
        { label: 'Dashboard', icon: 'dashboard', url: 'dashboard.html' },
        { label: 'History', icon: 'receipt_long', url: 'history.html' },
        { label: 'Insights', icon: 'query_stats', url: 'insights.html' },
        { label: 'Planning', icon: 'auto_graph', url: 'planning.html' }
    ];

    // We will find all <nav> elements and replace their a tags to ensure proper routing
    const navs = document.querySelectorAll('aside nav, nav.md\\:hidden');

    let path = window.location.pathname;
    let page = path.split('/').pop() || 'dashboard.html';

    navs.forEach(nav => {
        const isMobile = nav.classList.contains('md:hidden');
        nav.innerHTML = ''; // clear existing

        navLinks.forEach(link => {
            const isActive = page === link.url;
            const a = document.createElement('a');
            a.href = link.url;

            if (isMobile) {
                // Mobile layout
                a.className = `flex flex-col items-center gap-1 ${isActive ? 'text-blue-900 font-bold dark:text-blue-400' : 'text-slate-400'}`;
                a.innerHTML = `
                    <span class="material-symbols-outlined" ${isActive ? 'style="font-variation-settings: \'FILL\' 1;"' : ''}>${link.icon}</span>
                    <span class="text-[10px] uppercase font-bold">${link.label === 'Dashboard' ? 'Home' : (link.label === 'History' ? 'Bills' : (link.label === 'Planning' ? 'Plan' : link.label))}</span>
                `;
            } else {
                // Desktop layout
                if (isActive) {
                    a.className = `flex items-center gap-3 px-4 py-3 rounded-xl text-blue-900 dark:text-blue-400 font-bold border-r-2 border-blue-900 dark:border-blue-400 bg-slate-100 dark:bg-slate-800/50 transition-colors`;
                } else {
                    a.className = `flex items-center gap-3 px-4 py-3 rounded-xl text-slate-500 dark:text-slate-400 font-medium hover:bg-slate-200/50 dark:hover:bg-slate-800/80 transition-colors`;
                }
                a.innerHTML = `
                    <span class="material-symbols-outlined" data-icon="${link.icon}">${link.icon}</span>
                    <span class="font-body text-sm">${link.label}</span>
                `;
            }
            nav.appendChild(a);
        });
    });

    const logExpenseBtns = Array.from(document.querySelectorAll('button')).filter(btn =>
        (btn.textContent.includes('Log Expense') ||
        btn.textContent.includes('add') ||
        btn.textContent.includes('add_circle')) &&
        btn.id !== 'addEventBtn' // Exclude calendar event button
    );
    logExpenseBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            window.location.href = 'planning.html';
        });
    });
}

// custom select for finding elements containing text
// Polyfill for simple contains selector behavior
HTMLElement.prototype.matchesText = function (text) {
    return this.textContent.toLowerCase().includes(text.toLowerCase());
};

document.addEventListener('DOMContentLoaded', () => {
    // Replace User Name
    if (_auth_user_token && !_auth_is_auth_page) {
        try {
            const user = JSON.parse(_auth_user_token);
            const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
            let node;
            while (node = walker.nextNode()) {
                if (node.nodeValue.includes('Arthur Sterling') || node.nodeValue.includes('Alex Sterling')) {
                    node.nodeValue = node.nodeValue.replace(/Arthur Sterling|Alex Sterling/g, user.name);
                }
            }
        } catch (e) { }
    }

    setupNavigation();
});
