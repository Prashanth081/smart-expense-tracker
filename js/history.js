document.addEventListener('DOMContentLoaded', async () => {
    const tableBody = document.getElementById('transactionsTableBody');
    const searchInput = document.querySelector('input[placeholder="Search transactions, retailers, or categories..."]');
    
    // UI Filtering Elements
    const filterButtons = document.querySelectorAll('.type-filter-btn');
    let viewFilter = 'All'; // 'All', 'Expenses', 'Income'

    // Modals
    const editModal = document.getElementById('editModal');
    const deleteModal = document.getElementById('deleteModal');
    
    let currentTxns = await getTransactions();
    let globalFiltered = [];
    let currentPage = 1;
    const itemsPerPage = 15;

    window.changePage = (page) => {
        currentPage = page;
        renderTable(globalFiltered);
    };

    function renderPagination(totalItems) {
        const wrapper = document.getElementById('paginationWrapper');
        if (!wrapper) return;
        
        const totalPages = Math.ceil(totalItems / itemsPerPage) || 1;
        if (currentPage > totalPages) currentPage = totalPages;
        if (currentPage < 1) currentPage = 1;

        const startIdx = totalItems === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1;
        const endIdx = Math.min(currentPage * itemsPerPage, totalItems);

        let html = `
        <p class="text-xs font-semibold text-on-surface-variant">Showing ${startIdx}-${endIdx} of ${totalItems} transactions</p>
        <div class="flex items-center gap-2">
            <button onclick="window.changePage(${currentPage - 1})" ${currentPage === 1 ? 'disabled class="w-10 h-10 flex items-center justify-center rounded-full bg-surface-container-lowest border border-outline-variant/10 text-slate-300 pointer-events-none"' : 'class="w-10 h-10 flex items-center justify-center rounded-full bg-surface-container-lowest border border-outline-variant/10 text-slate-400 hover:text-primary transition-all"'}>
                <span class="material-symbols-outlined">chevron_left</span>
            </button>
        `;

        for (let i = 1; i <= totalPages; i++) {
            if (i === currentPage) {
                html += `<button class="w-10 h-10 flex items-center justify-center rounded-full bg-primary text-white font-bold text-xs shadow-md">${i}</button>`;
            } else if (i === 1 || i === totalPages || Math.abs(i - currentPage) <= 1) {
                html += `<button onclick="window.changePage(${i})" class="w-10 h-10 flex items-center justify-center rounded-full bg-surface-container-lowest border border-outline-variant/10 text-on-surface-variant font-bold text-xs hover:bg-surface-container-high">${i}</button>`;
            } else if (Math.abs(i - currentPage) === 2) {
                html += `<span class="text-on-surface-variant text-xs">...</span>`;
            }
        }

        html += `
            <button onclick="window.changePage(${currentPage + 1})" ${currentPage === totalPages ? 'disabled class="w-10 h-10 flex items-center justify-center rounded-full bg-surface-container-lowest border border-outline-variant/10 text-slate-300 pointer-events-none"' : 'class="w-10 h-10 flex items-center justify-center rounded-full bg-surface-container-lowest border border-outline-variant/10 text-slate-400 hover:text-primary transition-all"'}>
                <span class="material-symbols-outlined">chevron_right</span>
            </button>
        </div>`;

        wrapper.innerHTML = html;
    }

    function renderCategoryBreakdown(txns) {
        const graphEl = document.getElementById('expenditureGraph');
        if (!graphEl) return;

        const now = new Date();
        const currentMonth = now.getMonth();
        const currentYear = now.getFullYear();

        // Filter to current month only and type = expense
        let catTotals = {};
        let totalAmount = 0;
        txns.forEach(t => {
            const d = new Date(t.date);
            if (d.getMonth() !== currentMonth || d.getFullYear() !== currentYear) return;
            if (t.type !== 'expense') return; // Show only expenses as requested

            const amt = Math.abs(t.amount);
            const catName = (t.category || 'Other').toUpperCase();
            if (!catTotals[catName]) catTotals[catName] = 0;
            catTotals[catName] += amt;
            totalAmount += amt;
        });

        let sorted = Object.keys(catTotals).map(k => ({
            name: k,
            amount: catTotals[k],
            percent: totalAmount > 0 ? (catTotals[k] / totalAmount) * 100 : 0
        })).sort((a, b) => b.amount - a.amount);

        if (sorted.length === 0) {
            graphEl.innerHTML = `<div class="w-full flex items-center justify-center text-on-surface-variant text-sm font-semibold opacity-50 h-32">No expense activity this month</div>`;
            return;
        }

        const maxVal = sorted[0].amount;
        let html = '<div class="w-full space-y-4 overflow-y-auto max-h-64 pr-2">';
        sorted.forEach(cat => {
            const pct = Math.max((cat.amount / maxVal) * 100, 2);
            html += `
            <div class="w-full group">
                <div class="flex justify-between items-end mb-1">
                    <span class="text-[11px] font-bold text-on-surface uppercase tracking-widest">${cat.name}</span>
                    <span class="text-[11px] font-bold text-primary">${formatCurrency(cat.amount)}</span>
                </div>
                <div class="h-2 w-full bg-surface-container-high rounded-full overflow-hidden">
                    <div class="h-full bg-primary rounded-full transition-all group-hover:brightness-110" style="width: ${pct}%"></div>
                </div>
            </div>`;
        });
        html += '</div>';

        graphEl.className = 'w-full flex flex-col pt-2';
        graphEl.innerHTML = html;

        // Update sub-header to reflect current month and total expenses
        const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
        const subHeader = graphEl.parentElement.querySelector('p.text-xs');
        if (subHeader) {
            subHeader.textContent = `Current month: ${monthNames[currentMonth]} ${currentYear} • Total: ${formatCurrency(totalAmount)}`;
        }
    }

    function renderTable(transactions) {
        if (!tableBody) return;
        tableBody.innerHTML = '';
        
        renderPagination(transactions.length);
        const startIdx = (currentPage - 1) * itemsPerPage;
        const paginatedTxns = transactions.slice(startIdx, startIdx + itemsPerPage);

        if (paginatedTxns.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="5" class="px-8 py-6 text-center text-slate-500 font-medium">No records match your criteria.</td></tr>';
        }
        
        paginatedTxns.forEach(txn => {
            const date = new Date(txn.date);
            const dateFormatted = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
            const timeFormatted = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

            let icon = 'payments';
            let iconColorBg = 'bg-slate-100';
            let iconColorText = 'text-slate-700';
            const catLower = (txn.category || '').toLowerCase();

            if (catLower.includes('dining')) {
                iconColorBg = 'bg-orange-50'; iconColorText = 'text-orange-700'; icon = 'restaurant';
            } else if (catLower.includes('grocer')) {
                iconColorBg = 'bg-blue-50'; iconColorText = 'text-primary'; icon = 'shopping_bag';
            } else if (catLower.includes('income')) {
                iconColorBg = 'bg-green-50'; iconColorText = 'text-secondary'; icon = 'payments';
            } else if (catLower.includes('entertain')) {
                iconColorBg = 'bg-purple-50'; iconColorText = 'text-purple-700'; icon = 'devices';
            } else if (catLower.includes('transport') || catLower.includes('fuel')) {
                iconColorBg = 'bg-slate-100'; iconColorText = 'text-slate-700'; icon = 'local_gas_station';
            }

            const tr = document.createElement('tr');
            tr.className = 'hover:bg-surface-container-low/40 transition-colors group relative';

            const amtSign = txn.amount > 0 ? '+' : '';
            const formattedAmt = formatCurrency(txn.amount);
            const typeBadgeColor = txn.amount > 0 ? 'bg-tertiary-fixed/30 text-tertiary border-tertiary/10' : 'bg-secondary-container/30 text-secondary border-secondary/10';

            tr.innerHTML = `
                <td class="px-8 py-6">
                    <p class="text-sm font-bold text-on-surface">${dateFormatted}</p>
                    <p class="text-xs text-on-surface-variant">${timeFormatted}</p>
                </td>
                <td class="px-8 py-6">
                    <div class="flex items-center gap-4">
                        <div class="w-10 h-10 rounded-full ${iconColorBg} flex items-center justify-center ${iconColorText}">
                            <span class="material-symbols-outlined">${icon}</span>
                        </div>
                        <div>
                            <p class="text-sm font-bold text-on-surface">${txn.merchant || 'Unknown'}</p>
                            <p class="text-xs text-on-surface-variant">Transaction ID: #${(txn.txn_id || 'new').substring(txn.txn_id ? txn.txn_id.length - 6 : 0).toUpperCase()}</p>
                        </div>
                    </div>
                </td>
                <td class="px-8 py-6">
                    <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full ${typeBadgeColor} text-xs font-bold border">
                        <span class="material-symbols-outlined text-[14px]">auto_awesome</span>
                        ${txn.category || 'Other'}
                    </span>
                </td>
                <td class="px-8 py-6 text-right">
                    <p class="text-sm font-bold ${txn.amount > 0 ? 'text-secondary' : 'text-on-surface'} font-headline tracking-tight">${amtSign}${formattedAmt}</p>
                </td>
                <td class="px-8 py-6 text-right relative">
                    <div class="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button class="p-1.5 bg-surface-container-highest rounded-lg text-primary hover:bg-primary hover:text-white transition-colors" onclick="openEditModal('${txn.txn_id}')" title="Edit">
                            <span class="material-symbols-outlined text-sm">edit</span>
                        </button>
                        <button class="p-1.5 bg-error-container/50 rounded-lg text-error hover:bg-error hover:text-white transition-colors" onclick="openDeleteModal('${txn.txn_id}')" title="Delete">
                            <span class="material-symbols-outlined text-sm">delete</span>
                        </button>
                    </div>
                </td>
            `;
            tableBody.appendChild(tr);
        });
    }

    // Attach to window so onclick handlers in HTML string work securely
    window.openEditModal = (id) => {
        const txn = currentTxns.find(t => t.txn_id === id);
        if(!txn) return;
        document.getElementById('editTxnId').value = txn.txn_id;
        document.getElementById('editMerchant').value = txn.merchant;
        document.getElementById('editAmount').value = Math.abs(txn.amount);
        document.getElementById('editTxnType').value = txn.type;
        document.getElementById('editTxnDate').value = txn.date;
        document.getElementById('editTxnCat').value = txn.category;
        document.getElementById('editTxnNotes').value = txn.notes;
        
        editModal.classList.remove('hidden');
        setTimeout(() => {
            editModal.classList.remove('opacity-0');
            editModal.querySelector('div').classList.remove('scale-95');
        }, 10);
    };

    window.openDeleteModal = (id) => {
        document.getElementById('delTxnId').value = id;
        deleteModal.classList.remove('hidden');
        setTimeout(() => {
            deleteModal.classList.remove('opacity-0');
            deleteModal.querySelector('div').classList.remove('scale-95');
        }, 10);
    };

    // Close Modals
    document.getElementById('cancelEditBtn').addEventListener('click', () => { editModal.classList.add('hidden', 'opacity-0'); });
    document.getElementById('cancelDelBtn').addEventListener('click', () => { deleteModal.classList.add('hidden', 'opacity-0'); });

    // Execute Clear All
    const clearAllBtn = document.getElementById('clearAllBtn');
    if (clearAllBtn) {
        clearAllBtn.addEventListener('click', async () => {
            const confirmed = confirm("Are you sure you want to permanently delete ALL history records and zero your balance?");
            if (confirmed) {
                clearAllBtn.innerHTML = '<span class="material-symbols-outlined animate-spin text-lg">sync</span> Wiping...';
                await clearAllTransactions();
                currentTxns = await getTransactions();
                applyFilters();
                render7DayPrediction(currentTxns);
                renderCategoryBreakdown(currentTxns);
                clearAllBtn.innerHTML = '<span class="material-symbols-outlined text-lg">delete_sweep</span> Wipe Ledger';
            }
        });
    }

    // Execute Delete
    document.getElementById('confirmDelBtn').addEventListener('click', async () => {
        const id = document.getElementById('delTxnId').value;
        const btn = document.getElementById('confirmDelBtn');
        btn.innerHTML = '<span class="material-symbols-outlined animate-spin text-sm">sync</span>';
        await deleteTransaction(id);
        deleteModal.classList.add('hidden', 'opacity-0');
        btn.innerHTML = 'Execute Delete';
        currentTxns = await getTransactions();
        applyFilters();
        render7DayPrediction(currentTxns);
        renderCategoryBreakdown(currentTxns);
    });

    // Execute Edit
    document.getElementById('saveEditBtn').addEventListener('click', async () => {
        const id = document.getElementById('editTxnId').value;
        const btn = document.getElementById('saveEditBtn');
        
        const type = document.getElementById('editTxnType').value;
        const rawAmount = parseFloat(document.getElementById('editAmount').value);
        const finalAmount = type === 'expense' ? -Math.abs(rawAmount) : Math.abs(rawAmount);

        const data = {
            merchant: document.getElementById('editMerchant').value,
            amount: finalAmount,
            type: type,
            date: document.getElementById('editTxnDate').value,
            category: document.getElementById('editTxnCat').value,
            notes: document.getElementById('editTxnNotes').value,
        };

        btn.innerHTML = 'Saving...';
        await updateTransaction(id, data);
        editModal.classList.add('hidden', 'opacity-0');
        btn.innerHTML = 'Save Ledger';
        currentTxns = await getTransactions();
        applyFilters();
        render7DayPrediction(currentTxns);
        renderCategoryBreakdown(currentTxns);
    });

    // Execute Export statement (Last 30 days)
    const exportBtn = document.getElementById('exportBtn');
    if (exportBtn) {
        exportBtn.addEventListener('click', () => {
            const cutoff = new Date();
            cutoff.setDate(cutoff.getDate() - 30);
            const exportData = currentTxns.filter(t => new Date(t.date) >= cutoff);
            
            if (exportData.length === 0) {
                alert("No transactions found in the last 30 days to export.");
                return;
            }
            
            let csvContent = "data:text/csv;charset=utf-8,";
            csvContent += "Date,Merchant,Category,Type,Amount\n";
            exportData.forEach(t => {
                const dateStr = new Date(t.date).toLocaleDateString('en-US');
                const safeMerchant = (t.merchant || "Unknown").replace(/,/g, ' ');
                const safeCat = (t.category || "Unknown").replace(/,/g, ' ');
                csvContent += `${dateStr},${safeMerchant},${safeCat},${t.type},${t.amount}\n`;
            });
            
            const encodedUri = encodeURI(csvContent);
            const link = document.createElement("a");
            link.setAttribute("href", encodedUri);
            link.setAttribute("download", "SmartExpenseTracker_30_Days.csv");
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        });
    }

    // Apply Filters Engine
    function applyFilters() {
        let filtered = currentTxns;

        // View filter (Income vs Expenses)
        if (viewFilter === 'Expenses') filtered = filtered.filter(t => (t.type || '').toLowerCase() === 'expense');
        if (viewFilter === 'Income') filtered = filtered.filter(t => (t.type || '').toLowerCase() === 'income');

        // Search query
        // Searching
        if (searchInput && searchInput.value) {
            const q = searchInput.value.toLowerCase();
            filtered = filtered.filter(txn => 
                (txn.merchant || '').toLowerCase().includes(q) || 
                (txn.category || '').toLowerCase().includes(q)
            );
        }

        // Category Filter
        const catFilter = document.getElementById('categoryFilter') ? document.getElementById('categoryFilter').value : 'all';
        if (catFilter !== 'all') {
            filtered = filtered.filter(txn => (txn.category || '') === catFilter);
        }

        // Amount Filter
        const amtFilterObj = document.getElementById('amountFilter');
        if (amtFilterObj) {
            const amtState = amtFilterObj.value;
            filtered = filtered.filter(txn => {
                const absoluteVal = Math.abs(txn.amount);
                if (amtState === '0-50') return absoluteVal >= 0 && absoluteVal <= 50;
                if (amtState === '50-100') return absoluteVal > 50 && absoluteVal <= 100;
                if (amtState === '100-500') return absoluteVal > 100 && absoluteVal <= 500;
                if (amtState === '500+') return absoluteVal > 500;
                return true; // 'all'
            });
        }

        // Date Filter
        const dateFilterObj = document.getElementById('dateFilter');
        if (dateFilterObj) {
            const dateVal = dateFilterObj.value;
            if (dateVal !== 'all') {
                const days = parseInt(dateVal);
                const cutoff = new Date();
                cutoff.setDate(cutoff.getDate() - days);
                filtered = filtered.filter(txn => new Date(txn.date) >= cutoff);
            }
        }

        if (filtered !== globalFiltered) {
            currentPage = 1;
        }
        globalFiltered = filtered;
        renderCategoryBreakdown(globalFiltered);
        renderMonthlyBreakdown(globalFiltered);
        renderTable(globalFiltered);
    }
    
    // Attach Select Listeners
    if (document.getElementById('categoryFilter')) document.getElementById('categoryFilter').addEventListener('change', applyFilters);
    if (document.getElementById('amountFilter')) document.getElementById('amountFilter').addEventListener('change', applyFilters);
    if (document.getElementById('dateFilter')) document.getElementById('dateFilter').addEventListener('change', applyFilters);

    // Attach View Filter Listeners
    filterButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            // Remove active classes
            filterButtons.forEach(b => {
                b.className = "type-filter-btn px-4 py-1.5 bg-surface-container-highest text-on-surface-variant text-xs font-bold rounded-full hover:bg-slate-300 transition-all focus:outline-none";
            });
            
            // Add active to clicked
            const target = e.currentTarget;
            target.className = "type-filter-btn px-4 py-1.5 bg-primary text-white text-xs font-bold rounded-full shadow-sm transition-all focus:outline-none";
            
            viewFilter = target.textContent.trim();
            applyFilters();
        });
    });

    if (searchInput) {
        searchInput.addEventListener('input', applyFilters);
    }
    
    // Subscriptions Logic
    const subContainer = document.getElementById('subscriptionsContainer');
    const subTableBody = document.getElementById('subscriptionsTableBody');
    
    // Monthly Breakdown Logic
    const monthlyContainer = document.getElementById('monthlyBreakdownContainer');
    const monthlyGrid = document.getElementById('monthlyBreakdownGrid');

    function renderMonthlyBreakdown(txns) {
        if (!monthlyContainer || !monthlyGrid) return;
        
        const monthlyData = {};
        
        txns.forEach(t => {
            const d = new Date(t.date);
            if (isNaN(d.getTime())) return;
            
            const monthYear = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
            if (!monthlyData[monthYear]) {
                monthlyData[monthYear] = { expense: 0, income: 0, count: 0 };
            }
            if (t.type === 'expense') monthlyData[monthYear].expense += Math.abs(t.amount);
            else monthlyData[monthYear].income += Math.abs(t.amount);
            monthlyData[monthYear].count += 1;
        });
        
        const keys = Object.keys(monthlyData).sort((a,b) => new Date(b) - new Date(a));
        
        if (keys.length === 0) {
            monthlyContainer.classList.add('hidden');
            return;
        }
        
        monthlyContainer.classList.remove('hidden');
        let gridHtml = '';
        
        keys.forEach(k => {
            const data = monthlyData[k];
            gridHtml += `
            <div class="bg-surface-container-high rounded-xl p-5 border border-outline-variant/10 shadow-sm hover:shadow-md transition-all">
                <div class="flex justify-between items-start mb-4">
                    <h4 class="font-bold text-on-surface">${k}</h4>
                    <span class="px-2 py-1 bg-primary/10 text-primary text-[10px] font-bold rounded uppercase">${data.count} Transactions</span>
                </div>
                <div class="flex justify-between items-end mt-2">
                    <div>
                        <p class="text-[10px] text-on-surface-variant font-medium uppercase tracking-widest mb-1">Expenses</p>
                        <p class="text-lg font-extrabold font-headline text-on-surface">${formatCurrency(data.expense)}</p>
                    </div>
                    <div class="text-right">
                        <p class="text-[10px] text-secondary font-medium uppercase tracking-widest mb-1">Income</p>
                        <p class="text-lg font-extrabold font-headline text-secondary">+${formatCurrency(data.income)}</p>
                    </div>
                </div>
            </div>
            `;
        });
        
        monthlyGrid.innerHTML = gridHtml;
    }
    
    async function renderSubscriptions() {
        if(!subContainer || !subTableBody) return;
        const subs = await getSubscriptions();
        
        if (subs.length === 0) {
            subContainer.classList.add('hidden');
            return;
        }
        
        subContainer.classList.remove('hidden');
        subTableBody.innerHTML = '';
        
        subs.forEach(s => {
            const date = new Date(s.next_date);
            const dateStr = !isNaN(date.getTime()) ? date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : s.next_date;
            
            const tr = document.createElement('tr');
            tr.className = 'hover:bg-surface-container-low/40 transition-colors group relative';
            const amtClass = s.amount > 0 ? 'text-secondary' : 'text-on-surface';
            const amtSign = s.amount > 0 ? '+' : '';
            tr.innerHTML = `
                <td class="px-8 py-4">
                    <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-secondary-container/20 text-secondary text-[11px] font-bold border border-secondary/10">
                        <span class="material-symbols-outlined text-[14px]">event</span>
                        ${dateStr}
                    </span>
                </td>
                <td class="px-8 py-4">
                    <p class="text-sm font-bold text-on-surface">${s.merchant}</p>
                    <p class="text-xs text-on-surface-variant uppercase tracking-widest mt-0.5">${s.category}</p>
                </td>
                <td class="px-8 py-4">
                    <span class="px-3 py-1 rounded bg-surface-container-highest text-on-surface-variant text-[11px] font-bold">${s.frequency}</span>
                </td>
                <td class="px-8 py-4 text-right">
                    <p class="text-sm font-bold ${amtClass} font-headline tracking-tight">${amtSign}${formatCurrency(s.amount)}</p>
                </td>
                <td class="px-8 py-4 text-right flex items-center justify-end gap-2">
                    <button class="px-3 py-1.5 bg-surface-container-high text-on-surface-variant font-bold rounded-lg hover:bg-primary hover:text-white transition-all text-xs" onclick="window.modifySubscription(${s.id}, ${s.amount}, '${s.frequency}', '${s.next_date}')">Modify</button>
                    <button class="px-3 py-1.5 bg-error-container/50 text-error font-bold rounded-lg hover:bg-error hover:text-white transition-all text-xs" onclick="window.cancelSubscription(${s.id})">Cancel</button>
                </td>
            `;
            subTableBody.appendChild(tr);
        });
    }

    window.cancelSubscription = async (id) => {
        if(confirm('Are you sure you want to cancel this recurring subscription?')) {
            await deleteSubscription(id);
            await renderSubscriptions();
        }
    };

    window.modifySubscription = async (id, currentAmt, currentFreq, currentNextDate) => {
        let newAmtStr = prompt("Enter new amount for this subscription:", Math.abs(currentAmt));
        if (newAmtStr === null) return;
        let newAmt = parseFloat(newAmtStr);
        if (isNaN(newAmt)) return alert("Invalid amount.");

        let newFreq = prompt("Enter new frequency (e.g. Monthly, Weekly, Yearly):", currentFreq);
        if (newFreq === null || !newFreq.trim()) return;

        let newNextDate = prompt("Enter new next billing date (YYYY-MM-DD):", currentNextDate.split('T')[0]);
        if (newNextDate === null || !newNextDate.trim()) return;
        
        let finalAmt = currentAmt < 0 ? -newAmt : newAmt;

        await updateSubscription(id, {
            amount: finalAmt,
            frequency: newFreq,
            nextDate: newNextDate
        });
        await renderSubscriptions();
    };

    renderSubscriptions();

    function render7DayPrediction(txns) {
        const dailyAvgEl = document.getElementById('dailyAvgDisplay');
        const next7DaysEl = document.getElementById('next7DaysDisplay');
        if (!dailyAvgEl || !next7DaysEl) return;
        
        const now = new Date();
        const cutoff = new Date(now.getTime() - (7 * 24 * 60 * 60 * 1000));
        
        let total7Days = 0;
        txns.forEach(t => {
            if (t.type === 'expense') {
                const tDate = new Date(t.date);
                if (tDate >= cutoff && tDate <= now) {
                    total7Days += Math.abs(t.amount);
                }
            }
        });
        
        const dailyAvg = total7Days / 7;
        const next7Predict = dailyAvg * 7;
        
        dailyAvgEl.textContent = formatCurrency(dailyAvg);
        next7DaysEl.textContent = formatCurrency(next7Predict);
    }



    function populateCategoryFilter() {
        const filter = document.getElementById('categoryFilter');
        if (!filter) return;
        
        const currentVal = filter.value;
        const categories = [...new Set(currentTxns.map(t => t.category || 'Other'))].sort();
        
        filter.innerHTML = '<option value="all">All Categories</option>';
        categories.forEach(cat => {
            const opt = document.createElement('option');
            opt.value = cat;
            opt.textContent = cat;
            filter.appendChild(opt);
        });
        
        if (categories.includes(currentVal)) {
            filter.value = currentVal;
        }
    }

    // Initial Render
    populateCategoryFilter();
    render7DayPrediction(currentTxns);
    renderCategoryBreakdown(currentTxns);
    applyFilters();
    renderMonthlyBreakdown(currentTxns);
});
