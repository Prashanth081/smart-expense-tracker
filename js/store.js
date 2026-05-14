const API_BASE = (window.location.protocol === 'file:' || (window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost') && window.location.port !== '3000') ? 'http://localhost:3000' : '';

async function getStoreData() {
    try {
        const response = await fetch(`${API_BASE}/api/summary?t=` + Date.now(), { cache: 'no-store' });
        return await response.json();
    } catch (e) {
        console.error("Could not fetch data from database", e);
        return { balance: 0, safeToSpend: 0, transactions: [] };
    }
}

async function addTransaction(transaction) {
    try {
        const response = await fetch(`${API_BASE}/api/transactions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(transaction)
        });
        return await response.json();
    } catch (e) {
        console.error("Could not save transaction to database", e);
    }
}

async function deleteTransaction(id) {
    try {
        await fetch(`${API_BASE}/api/transactions/${id}`, { method: 'DELETE' });
    } catch (e) {
        console.error("Could not delete", e);
    }
}

async function clearAllTransactions() {
    try {
        await fetch(`${API_BASE}/api/transactions`, { method: 'DELETE' });
    } catch (e) {
        console.error("Could not clear", e);
    }
}

async function updateTransaction(id, data) {
    try {
        await fetch(`${API_BASE}/api/transactions/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
    } catch (e) {
        console.error("Could not update", e);
    }
}

async function getTransactions() {
    try {
        const response = await fetch(`${API_BASE}/api/transactions?t=` + Date.now(), { cache: 'no-store' });
        return await response.json();
    } catch (e) {
        return [];
    }
}

async function getDashboardSummary() {
    return await getStoreData();
}

async function getSubscriptions() {
    try {
        const response = await fetch(`${API_BASE}/api/subscriptions?t=` + Date.now(), { cache: 'no-store' });
        return await response.json();
    } catch (e) {
        return [];
    }
}

async function deleteSubscription(id) {
    try {
        await fetch(`${API_BASE}/api/subscriptions/${id}`, { method: 'DELETE' });
    } catch (e) {
        console.error("Could not delete subscription", e);
    }
}

async function updateSubscription(id, data) {
    try {
        await fetch(`${API_BASE}/api/subscriptions/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
    } catch (e) {
        console.error("Could not update subscription", e);
    }
}

async function getCategoryWeights() {
    const data = await getStoreData();
    let totalExpense = 0;
    let currentCategories = {};
        if (data.transactions) {
            const now = new Date();
            const cm = now.getMonth();
            const cy = now.getFullYear();
            
            data.transactions.forEach(t => {
                if (t.type === 'expense') {
                    const tDate = new Date(t.date);
                    if (tDate.getMonth() !== cm || tDate.getFullYear() !== cy) return;
                    
                    const amt = Math.abs(t.amount);
                    totalExpense += amt;
                    
                    const catName = (t.category || 'Other').toUpperCase();
                    if (!currentCategories[catName]) currentCategories[catName] = 0;
                    currentCategories[catName] += amt;
                }
            });
        }

        if (totalExpense === 0) totalExpense = 1; // avoid division by zero
        
        let sortedCats = Object.keys(currentCategories).map(k => {
            return {
                name: k,
                amount: currentCategories[k],
                percent: (currentCategories[k] / totalExpense) * 100
            };
        }).sort((a,b) => b.amount - a.amount);
        
        // Return top 3, group others into 3rd if necessary, or just return top 4
        while(sortedCats.length < 3) sortedCats.push({name: 'AVAILABLE', amount: 0, percent: 0});
        
        return sortedCats;
    }

// ─── Credit Cards API ───
async function getCreditCards() {
    try {
        const response = await fetch(`${API_BASE}/api/credit-cards?t=` + Date.now(), { cache: 'no-store' });
        return await response.json();
    } catch (e) { return []; }
}

async function addCreditCard(card) {
    try {
        const response = await fetch(`${API_BASE}/api/credit-cards`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(card)
        });
        return await response.json();
    } catch (e) { console.error(e); }
}

async function updateCreditCard(id, card) {
    try {
        await fetch(`${API_BASE}/api/credit-cards/${id}`, {
            method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(card)
        });
    } catch (e) { console.error(e); }
}

async function deleteCreditCard(id) {
    try { await fetch(`${API_BASE}/api/credit-cards/${id}`, { method: 'DELETE' }); } catch (e) { console.error(e); }
}

// ─── Loans API ───
async function getLoans() {
    try {
        const response = await fetch(`${API_BASE}/api/loans?t=` + Date.now(), { cache: 'no-store' });
        return await response.json();
    } catch (e) { return []; }
}

async function addLoan(loan) {
    try {
        const response = await fetch(`${API_BASE}/api/loans`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(loan)
        });
        return await response.json();
    } catch (e) { console.error(e); }
}

async function updateLoan(id, loan) {
    try {
        await fetch(`${API_BASE}/api/loans/${id}`, {
            method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(loan)
        });
    } catch (e) { console.error(e); }
}

async function deleteLoan(id) {
    try { await fetch(`${API_BASE}/api/loans/${id}`, { method: 'DELETE' }); } catch (e) { console.error(e); }
}

// ─── User Settings API ───
function _getUserEmail() {
    try {
        const userJson = localStorage.getItem('smart_tracker_user');
        if (userJson) return JSON.parse(userJson).email || 'default';
    } catch(e) {}
    return 'default';
}

async function getUserSettings() {
    try {
        const email = _getUserEmail();
        const response = await fetch(`${API_BASE}/api/settings/${encodeURIComponent(email)}?t=` + Date.now(), { cache: 'no-store' });
        return await response.json();
    } catch (e) { return { monthly_budget: 5000, daily_limit: 0, savings_goal_pct: 5 }; }
}

async function saveUserSettings(settings) {
    try {
        const email = _getUserEmail();
        await fetch(`${API_BASE}/api/settings/${encodeURIComponent(email)}`, {
            method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(settings)
        });
    } catch (e) { console.error(e); }
}
