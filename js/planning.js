document.addEventListener('DOMContentLoaded', () => {
    let commitBtn = null;
    document.querySelectorAll('button').forEach(btn => {
        if (btn.textContent.includes("Commit Entry")) commitBtn = btn;
    });
    const form = document.querySelector('form');
    
    // Quick select merchants
    const merchantInput = form.querySelector('input[placeholder="Where did you spend?"]');
    const quickMerchants = form.querySelectorAll('.chip-btn');
    quickMerchants.forEach(btn => {
        btn.addEventListener('click', () => {
            merchantInput.value = btn.textContent;
            // Visual feedback
            btn.classList.add('bg-primary', 'text-white');
            setTimeout(() => btn.classList.remove('bg-primary', 'text-white'), 500);
        });
    });

    const txnDateObj = document.getElementById('txnDateInput');
    if (txnDateObj) {
        // Set exact local datetime string natively formatting for datetime-local
        const now = new Date();
        now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
        txnDateObj.value = now.toISOString().slice(0,16);
    }

    // Handle Frequency Toggle Logic
    const freqButtons = document.querySelectorAll('.freq-btn');
    freqButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            // Remove active style from all
            freqButtons.forEach(b => {
                b.className = "freq-btn flex-1 py-3 rounded-xl bg-white border border-slate-200 text-slate-600 font-bold text-xs hover:border-secondary/30 transition-all";
            });
            // Apply active style to target
            btn.className = "freq-btn flex-1 py-3 rounded-xl bg-secondary text-white font-bold text-xs shadow-md active-freq";
            
            // Auto-set next billing date based on frequency
            const freq = btn.textContent.trim();
            const nextDateInput = document.getElementById('nextBillingDate');
            if (nextDateInput) {
                const now = new Date();
                if (freq === 'Weekly') now.setDate(now.getDate() + 7);
                else if (freq === 'Monthly') now.setMonth(now.getMonth() + 1);
                else if (freq === 'Yearly') now.setFullYear(now.getFullYear() + 1);
                nextDateInput.value = now.toISOString().split('T')[0];
            }
        });
    });


    if (commitBtn) {
        commitBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            
            // Get values
            const amountInput = document.querySelector('input[placeholder="0.00"]').value;
            const merchant = merchantInput.value || 'Unknown Merchant';
            const date = document.getElementById('txnDateInput') ? document.getElementById('txnDateInput').value : new Date().toISOString();
            const categoryElement = document.getElementById('categorySelect');
            const category = categoryElement ? categoryElement.value : 'Other';
            const notesElement = document.querySelector('textarea');
            const notes = notesElement ? notesElement.value : '';
            
            if (!amountInput || isNaN(amountInput)) {
                alert('Please enter a valid amount.');
                return;
            }
            
            const amount = parseFloat(amountInput);
            
            const txnTypeInput = document.querySelector('input[name="txnType"]:checked');
            const type = txnTypeInput ? txnTypeInput.value : 'expense';
            const finalAmount = type === 'expense' ? -Math.abs(amount) : Math.abs(amount); // positive if income
            
            // Handle recurring check
            const recurringCheckbox = document.querySelector('input[type="checkbox"].peer');
            const isRecurring = recurringCheckbox.checked;
            let frequency = null;
            let nextDate = null;
            if (isRecurring) {
                const freqBtn = document.querySelector('.active-freq') || document.querySelector('.freq-btn');
                frequency = freqBtn ? freqBtn.textContent : 'Monthly';
                const nextDateInput = document.getElementById('nextBillingDate');
                nextDate = nextDateInput ? nextDateInput.value : date;
            }

            // Create transaction object
            const txn = {
                merchant: merchant,
                date: new Date(date).toISOString(),
                category: category,
                amount: finalAmount,
                type: type,
                notes: notes,
                isRecurring,
                frequency,
                nextDate
            };
            
            // Save using API
            commitBtn.innerHTML = '<span>Saving Transaction...</span><span class="material-symbols-outlined text-xl animate-spin">sync</span>';
            
            await addTransaction(txn);
            
            // Success State
            commitBtn.innerHTML = '<span>Transaction Secured!</span><span class="material-symbols-outlined text-xl">verified</span>';
            commitBtn.classList.replace('luxury-gradient', 'bg-emerald-500');
            commitBtn.classList.remove('btn-pulse');

            // Check limits after save
            const settings = await getUserSettings();
            const nowCheck = new Date();
            const currentMonth = nowCheck.getMonth();
            const currentYear = nowCheck.getFullYear();
            const todayCheck = nowCheck.toISOString().slice(0, 10);
            
            if (type === 'expense') {
                try {
                    const allTxns = await getTransactions();
                    let monthlyTotal = 0;
                    let todayTotal = 0;
                    
                    allTxns.forEach(t => {
                        if (t.type === 'expense') {
                            const tDate = new Date(t.date);
                            const tDateStr = tDate.toISOString().slice(0, 10);
                            
                            // Monthly check
                            if (tDate.getMonth() === currentMonth && tDate.getFullYear() === currentYear) {
                                monthlyTotal += Math.abs(t.amount);
                            }
                            // Daily check
                            if (tDateStr === todayCheck) {
                                todayTotal += Math.abs(t.amount);
                            }
                        }
                    });

                    // Monthly Budget Alert
                    if (settings.monthly_budget && settings.monthly_budget > 0 && monthlyTotal > settings.monthly_budget) {
                        alert(`⚠ MONTHLY OVERSPENDING!\n\nTotal spent this month: ${formatCurrency(monthlyTotal)}\nYour monthly budget: ${formatCurrency(settings.monthly_budget)}\n\nYou have exceeded your budget by ${formatCurrency(monthlyTotal - settings.monthly_budget)}!`);
                    }

                    // Daily Limit Alert
                    if (settings.daily_limit && settings.daily_limit > 0 && todayTotal > settings.daily_limit) {
                        alert(`⚠ DAILY LIMIT BREACHED!\n\nYou have spent ${formatCurrency(todayTotal)} today.\nYour daily cap is ${formatCurrency(settings.daily_limit)}.\nOverspent by ${formatCurrency(todayTotal - settings.daily_limit)}!`);
                    }
                } catch(e) {
                    console.error("Budget check failed", e);
                }
                refreshDailyLimitUI();
            }

            setTimeout(() => {
                window.location.href = 'dashboard.html';
            }, 1000);
        });
    }

    // Toggle Recurring Options visibility
    const recurringCheckbox = document.querySelector('input[type="checkbox"].peer');
    const recurringOptions = document.getElementById('recurringOptions');
    if (recurringCheckbox && recurringOptions) {
        // Initial state
        recurringOptions.style.display = recurringCheckbox.checked ? 'grid' : 'none';
        recurringCheckbox.addEventListener('change', () => {
            if (recurringCheckbox.checked) {
                recurringOptions.style.display = 'grid';
                recurringOptions.classList.add('animate-fade-in');
            } else {
                recurringOptions.style.display = 'none';
            }
        });
    }



    // ─── Daily Spending Limit Logic ───
    const dailyLimitInput = document.getElementById('dailyLimitInput');
    const saveDailyLimitBtn = document.getElementById('saveDailyLimitBtn');
    const dailySpentTodayEl = document.getElementById('dailySpentToday');
    const dailyLimitProgressBar = document.getElementById('dailyLimitProgressBar');
    const dailyLimitStatusText = document.getElementById('dailyLimitStatusText');
    const dailyLimitAlert = document.getElementById('dailyLimitAlert');
    const dailyLimitAlertMsg = document.getElementById('dailyLimitAlertMsg');

    // Load saved daily limit from DB
    getUserSettings().then(settings => {
        if (settings.daily_limit && dailyLimitInput) dailyLimitInput.value = settings.daily_limit;
    });

    async function refreshDailyLimitUI() {
        const settings = await getUserSettings();
        const limitVal = settings.daily_limit;
        if (!limitVal || isNaN(limitVal) || limitVal <= 0) {
            if (dailyLimitStatusText) dailyLimitStatusText.textContent = 'No daily limit set yet.';
            if (dailyLimitProgressBar) dailyLimitProgressBar.style.width = '0%';
            if (dailyLimitAlert) dailyLimitAlert.classList.add('hidden');
            return;
        }

        let todayExpense = 0;
        try {
            const txns = await getTransactions();
            const now = new Date();
            const todayStr = now.toISOString().slice(0, 10);
            txns.forEach(t => {
                if (t.type === 'expense') {
                    const tDateStr = new Date(t.date).toISOString().slice(0, 10);
                    if (tDateStr === todayStr) {
                        todayExpense += Math.abs(t.amount);
                    }
                }
            });
        } catch(e) {
            console.warn('Could not fetch transactions for daily limit', e);
        }

        if (dailySpentTodayEl) dailySpentTodayEl.textContent = formatCurrency(todayExpense);

        const pct = Math.min((todayExpense / limitVal) * 100, 100);
        if (dailyLimitProgressBar) {
            dailyLimitProgressBar.style.width = `${pct}%`;
            if (pct >= 100) {
                dailyLimitProgressBar.classList.remove('bg-secondary-fixed', 'bg-yellow-400');
                dailyLimitProgressBar.classList.add('bg-red-400');
            } else if (pct >= 75) {
                dailyLimitProgressBar.classList.remove('bg-secondary-fixed', 'bg-red-400');
                dailyLimitProgressBar.classList.add('bg-yellow-400');
            } else {
                dailyLimitProgressBar.classList.remove('bg-red-400', 'bg-yellow-400');
                dailyLimitProgressBar.classList.add('bg-secondary-fixed');
            }
        }

        const remaining = limitVal - todayExpense;
        if (todayExpense >= limitVal) {
            if (dailyLimitStatusText) dailyLimitStatusText.textContent = `⚠ Limit breached by ${formatCurrency(Math.abs(remaining))}!`;
            if (dailyLimitAlert) {
                dailyLimitAlert.classList.remove('hidden');
                if (dailyLimitAlertMsg) dailyLimitAlertMsg.textContent = `You spent ${formatCurrency(todayExpense)} today against your ${formatCurrency(limitVal)} daily cap. Reduce spending immediately!`;
            }
        } else if (pct >= 75) {
            if (dailyLimitStatusText) dailyLimitStatusText.textContent = `⚡ Warning: Only ${formatCurrency(remaining)} remaining today`;
            if (dailyLimitAlert) dailyLimitAlert.classList.add('hidden');
        } else {
            if (dailyLimitStatusText) dailyLimitStatusText.textContent = `${formatCurrency(remaining)} remaining of ${formatCurrency(limitVal)} daily cap`;
            if (dailyLimitAlert) dailyLimitAlert.classList.add('hidden');
        }
    }

    const clearDailyLimitBtn = document.getElementById('clearDailyLimitBtn');
    if (clearDailyLimitBtn) {
        clearDailyLimitBtn.addEventListener('click', async () => {
            if (confirm("Are you sure you want to remove your daily spending limit?")) {
                await saveUserSettings({ daily_limit: 0 });
                if(dailyLimitInput) dailyLimitInput.value = '';
                alert("Daily limit removed.");
                await refreshDailyLimitUI();
            }
        });
    }

    if (saveDailyLimitBtn && dailyLimitInput) {
        saveDailyLimitBtn.addEventListener('click', async () => {
            const val = parseFloat(dailyLimitInput.value);
            if (isNaN(val) || val <= 0) {
                alert('Please enter a valid daily limit amount.');
                return;
            }
            await saveUserSettings({ daily_limit: val });
            saveDailyLimitBtn.textContent = '✓ Set';
            setTimeout(() => { saveDailyLimitBtn.textContent = 'Set'; }, 1500);
            await refreshDailyLimitUI();
        });
    }

    // ─── Lifestyle 'What-If' Optimizer Logic ───
    const whatIfCategory = document.getElementById('whatIfCategory');
    const whatIfAnnualSave = document.getElementById('whatIfAnnualSave');
    const applyOptimizationBtn = document.getElementById('applyOptimizationBtn');

    const optimizationValues = {
        dining: 18000,
        coffee: 7200,
        streaming: 5988,
        fuel: 12000
    };

    if (whatIfCategory && whatIfAnnualSave) {
        whatIfCategory.addEventListener('change', (e) => {
            const val = optimizationValues[e.target.value] || 0;
            whatIfAnnualSave.textContent = formatCurrency(val);
            
            // Interactive feedback
            whatIfAnnualSave.classList.add('scale-110', 'text-white');
            setTimeout(() => whatIfAnnualSave.classList.remove('scale-110', 'text-white'), 300);
        });
    }

    if (applyOptimizationBtn) {
        applyOptimizationBtn.addEventListener('click', () => {
            applyOptimizationBtn.textContent = "Strategy Updated!";
            applyOptimizationBtn.classList.replace('bg-white', 'bg-secondary-fixed');
            applyOptimizationBtn.classList.replace('text-primary', 'text-on-secondary');
            
            setTimeout(() => {
                applyOptimizationBtn.textContent = "Apply to Strategy";
                applyOptimizationBtn.classList.replace('bg-secondary-fixed', 'bg-white');
                applyOptimizationBtn.classList.replace('text-on-secondary', 'text-primary');
            }, 2000);
        });
    }

    // ─── Financial Goal Milestone Planner Logic ───
    const goalTargetInput = document.getElementById('goalTargetInput');
    const goalMonthlyInput = document.getElementById('goalMonthlyInput');
    const calcGoalBtn = document.getElementById('calcGoalBtn');
    const goalHorizonResult = document.getElementById('goalHorizonResult');
    const goalProgressBar = document.getElementById('goalProgressBar');
    const goalDateEst = document.getElementById('goalDateEst');

    if (calcGoalBtn) {
        calcGoalBtn.addEventListener('click', () => {
            const target = parseFloat(goalTargetInput.value);
            const monthly = parseFloat(goalMonthlyInput.value);

            if (!target || !monthly || target <= 0 || monthly <= 0) {
                alert("Please enter valid positive numbers for target and contribution.");
                return;
            }

            const months = Math.ceil(target / monthly);
            
            // Visual Update
            goalHorizonResult.textContent = `${months} Months`;
            
            // Progress Bar simulation (set to 100% for the calculated goal)
            goalProgressBar.style.width = '100%'; 
            
            // Date Estimate
            const estDate = new Date();
            estDate.setMonth(estDate.getMonth() + months);
            goalDateEst.textContent = estDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
            
            // Feedback effect
            calcGoalBtn.textContent = "Plan Calculated!";
            calcGoalBtn.classList.replace('bg-primary', 'bg-secondary');
            
            setTimeout(() => {
                calcGoalBtn.textContent = "Simulate Timeline";
                calcGoalBtn.classList.replace('bg-secondary', 'bg-primary');
            }, 2000);
        });
    }

    // Initial load
    refreshDailyLimitUI();
});
