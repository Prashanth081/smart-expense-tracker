document.addEventListener('DOMContentLoaded', async () => {
    // Show loading state
    // Show loading state
    const pfContainer = document.getElementById('predictiveForecastsContainer');
    const psContainer = document.getElementById('predictiveProjectionStatusContainer');
    if(pfContainer) {
        pfContainer.innerHTML = `<div class="p-4 text-center text-slate-500 sm:col-span-2"><span class="material-symbols-outlined animate-spin text-2xl text-primary">data_usage</span><p class="text-xs font-bold mt-1">Initializing ML Engine...</p></div>`;
    }

    try {
        const response = await fetch(`${API_BASE}/api/ml-insights`);
        const mlData = await response.json();

        if (mlData.status === 'success') {
            window.globalMlData = mlData; // Make it accessible globally for secondary logic
            const formatDelta = (pct) => {
                if (!pct || pct === 0) return `<span class="text-slate-500 font-bold text-xs mt-2 block">~0% vs last period</span>`;
                const isInc = pct > 0;
                const color = isInc ? 'text-error' : 'text-secondary';
                const icon = isInc ? 'trending_up' : 'trending_down';
                const sign = isInc ? '+' : '';
                return `<div class="mt-2 flex items-center gap-1.5"><span class="inline-flex items-center gap-1 ${color} font-bold text-xs"><span class="material-symbols-outlined text-[14px]">${icon}</span>${sign}${pct.toFixed(1)}%</span> <span class="text-xs text-on-surface-variant font-medium">vs last period</span></div>`;
            };

            // 1. Expenses Prediction (linear regression)
            if (pfContainer) {
                pfContainer.innerHTML = `
                    <div class="flex items-start gap-4 p-4 bg-white/50 rounded-2xl border border-primary/5">
                        <div class="w-10 h-10 rounded-full bg-primary-fixed flex items-center justify-center flex-shrink-0 shadow-inner">
                            <span class="material-symbols-outlined text-primary text-xl">calendar_month</span>
                        </div>
                        <div class="w-full">
                            <p class="text-xs font-bold text-on-surface">Next 7 Days</p>
                            <p class="text-xl font-extrabold text-primary font-headline">${formatCurrency(mlData.prediction.next_week)}</p>
                            ${formatDelta(mlData.prediction.next_week_delta_pct)}
                        </div>
                    </div>
                    <div class="flex items-start gap-4 p-4 bg-white/50 rounded-2xl border border-secondary/5">
                        <div class="w-10 h-10 rounded-full bg-secondary-container flex items-center justify-center flex-shrink-0 shadow-inner">
                            <span class="material-symbols-outlined text-secondary text-xl">event_upcoming</span>
                        </div>
                        <div class="w-full">
                            <p class="text-xs font-bold text-on-surface">Next 30 Days</p>
                            <p class="text-xl font-extrabold text-secondary font-headline">${formatCurrency(mlData.prediction.next_month)}</p>
                            ${formatDelta(mlData.prediction.next_month_delta_pct)}
                        </div>
                    </div>
                `;
            }

            // 2. Budget Suggestion
            const optText = document.getElementById('optimizationText');
            if (optText) {
                const insightSettings = await getUserSettings();
                const storedBudgetStr = insightSettings.monthly_budget;
                optText.classList.remove('hidden');
                if (storedBudgetStr) {
                    const budgetCap = parseFloat(storedBudgetStr);
                    const overspend = mlData.prediction.next_month - budgetCap;
                    if (overspend > 0) {
                        optText.className = "mt-4 p-5 bg-error text-white rounded-2xl shadow-lg luxury-curve";
                        optText.innerHTML = `<div class="flex items-center gap-3"><span class="material-symbols-outlined text-3xl">warning</span><div><p class="font-bold">Overspending Warning</p><p class="text-sm">Master Budget: <strong>${formatCurrency(budgetCap)}</strong>. ML predicts you will break this by <strong>${formatCurrency(overspend)}</strong>!</p></div></div>`;
                    } else {
                        optText.className = "mt-4 p-5 bg-secondary text-white rounded-2xl shadow-lg luxury-curve";
                        optText.innerHTML = `<div class="flex items-center gap-3"><span class="material-symbols-outlined text-3xl">check_circle</span><div><p class="font-bold">Budget On Track</p><p class="text-sm">You are tracking securely under your <strong>${formatCurrency(budgetCap)}</strong> ceiling.</p></div></div>`;
                    }
                } else {
                    optText.innerHTML = `<div class="flex items-center gap-3"><span class="material-symbols-outlined text-3xl">tips_and_updates</span><div><p class="font-bold">AI Suggestion</p><p class="text-sm">Based on your activity, we suggest a safe cap of <strong>${formatCurrency(mlData.budget.suggested_monthly)}</strong> this month.</p></div></div>`;
                }
                
                // Hide manual buttons
                const applyBtn = document.getElementById('applyStrategyBtn');
                if(applyBtn) applyBtn.style.display = 'none';
                const dismissBtn = document.getElementById('dismissStrategyBtn');
                if(dismissBtn) dismissBtn.style.display = 'none';
                
                // Update header
                const optHeader = document.querySelector('.bg-primary.p-8.luxury-curve.text-white h4');
                if(optHeader) optHeader.textContent = "AI Budget Suggestion";
            }

            // 3. Spending Alerts
            const miContainer = document.getElementById('merchantIntelligenceContainer');
            if (miContainer) {
                const miHeader = miContainer.previousElementSibling;
                if (miHeader) miHeader.textContent = "Machine Learning Alerts";
                
                let alertsHTML = '';
                mlData.alerts.forEach((alert, index) => {
                    const isWarn = alert.includes('Warning') || alert.includes('⚠️');
                    const isGood = alert.includes('Great') || alert.includes('✅');
                    const iconColor = isWarn ? 'text-error' : (isGood ? 'text-secondary' : 'text-primary');
                    const bgColor = isWarn ? 'bg-error-container' : (isGood ? 'bg-secondary-fixed' : 'bg-primary-fixed');
                    const icon = isWarn ? 'warning' : (isGood ? 'check_circle' : 'insights');
                    
                    alertsHTML += `
                    <div class="p-6 bg-white rounded-3xl luxury-shadow border border-primary/5 flex items-start gap-5 group hover:bg-surface-container-low transition-all duration-500 relative overflow-hidden">
                        <!-- Dynamic Background Glow -->
                        <div class="absolute -top-10 -right-10 w-24 h-24 ${bgColor.replace('bg-', 'bg-')}/10 rounded-full blur-2xl group-hover:scale-150 transition-transform duration-1000"></div>
                        
                        <div class="w-12 h-12 rounded-2xl ${bgColor} flex items-center justify-center shrink-0 shadow-inner">
                            <span class="material-symbols-outlined ${iconColor} text-2xl" style="font-variation-settings: 'FILL' 1;">${icon}</span>
                        </div>
                        
                        <div class="space-y-1 relative z-10">
                            <div class="flex items-center gap-2">
                                <span class="text-[9px] font-black uppercase tracking-widest ${iconColor} bg-white/50 px-2 py-0.5 rounded-full border border-${iconColor.replace('text-', '')}/10">
                                    ${isWarn ? 'Critical Alert' : (isGood ? 'Stability' : 'Behavioral')}
                                </span>
                            </div>
                            <p class="text-sm font-bold leading-relaxed text-on-surface tracking-tight">${alert}</p>
                        </div>
                    </div>`;
                });
                miContainer.innerHTML = alertsHTML;
            }

            // 4. Trend Analysis
            window.globalMlNextMonth = mlData.prediction.next_month;

            const trendDeltaVal = document.getElementById('trendDeltaVal');
            const trendIconTop = document.getElementById('trendIconTop');
            
            if (trendDeltaVal) {
                let pctIncr = 0;
                const months = Object.keys(mlData.trend.monthly_data || {}).sort();
                if (months.length > 0) {
                    const lastMonthVal = mlData.trend.monthly_data[months[months.length - 1]];
                    const predVal = mlData.prediction.next_month;
                    if (lastMonthVal && lastMonthVal > 0) {
                        pctIncr = ((predVal - lastMonthVal) / lastMonthVal) * 100;
                    }
                }
                
                const isWorse = pctIncr > 0; 
                const color = isWorse ? 'text-error' : 'text-secondary';
                const sign = pctIncr > 0 ? '+' : '';
                
                trendDeltaVal.className = color;
                trendDeltaVal.textContent = `${sign}${pctIncr.toFixed(1)}%`;
                
                if (trendIconTop) {
                    trendIconTop.className = `material-symbols-outlined ${color}`;
                    trendIconTop.textContent = isWorse ? 'trending_up' : 'trending_down';
                }
            }
            
            // Draw Time Series
            const graphContainer = document.getElementById('insightsGraphContainer');
            if (graphContainer) {
                const orderedMonths = Object.keys(mlData.trend.monthly_data).sort().slice(-3);
                let html = '<div class="absolute inset-0 flex flex-col justify-between opacity-10 pointer-events-none"><div class="border-b border-outline"></div><div class="border-b border-outline"></div><div class="border-b border-outline"></div><div class="border-b border-outline"></div></div>';
                
                // Update the subtitle text to reflect 3 months
                const subtitle = graphContainer.parentElement.querySelector('p.text-sm');
                if (subtitle) {
                    subtitle.textContent = "Monthly expenditure tracking over the last 3 months";
                }
                
                const maxVal = Math.max(...Object.values(mlData.trend.monthly_data), mlData.prediction.next_month, 1);
                
                orderedMonths.forEach((m, idx) => {
                    const val = mlData.trend.monthly_data[m];
                    const prevVal = idx > 0 ? mlData.trend.monthly_data[orderedMonths[idx-1]] : val;
                    const isIncrease = val > prevVal;
                    const barColor = isIncrease ? 'from-error to-red-400' : 'from-primary-container to-primary';
                    const height = Math.max((val / maxVal) * 100, 5);
                    const dateSplit = m.split('-');
                    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
                    const label = monthNames[parseInt(dateSplit[1])-1]; 
                    
                    html += `
                    <div class="flex-1 flex flex-col gap-1 h-full items-center justify-end relative group">
                        <div class="w-full bg-gradient-to-t ${barColor} rounded-t-md shadow-md transition-all duration-700 relative z-10" style="height: ${height}%;">
                            <div class="absolute -top-10 left-1/2 -translate-x-1/2 bg-inverse-surface text-white px-3 py-1.5 rounded-lg text-xs font-bold opacity-0 group-hover:opacity-100 whitespace-nowrap z-20 transition-opacity shadow-xl">
                                <span>${formatCurrency(val)}</span>
                            </div>
                        </div>
                        <span class="absolute -bottom-8 left-1/2 -translate-x-1/2 text-[10px] font-extrabold text-outline uppercase tracking-widest whitespace-nowrap">${label}</span>
                    </div>`;
                });
                
                // Add the prediction node dynamically
                const predHeightW = Math.max((mlData.prediction.next_month / maxVal) * 100, 5);
                html += `
                <div class="flex-1 flex flex-col gap-1 h-full items-center justify-end relative group ml-4 pl-4 border-l-2 border-dashed border-outline-variant/50">
                    <div class="w-full bg-gradient-to-t from-error-container to-error rounded-t-md shadow-md transition-all duration-700 relative z-10 opacity-70" style="height: ${predHeightW}%;">
                        <div class="absolute -top-10 left-1/2 -translate-x-1/2 bg-inverse-surface text-white px-3 py-1.5 rounded-lg text-xs font-bold opacity-0 group-hover:opacity-100 whitespace-nowrap z-20 transition-opacity shadow-xl">
                            Est: ${formatCurrency(mlData.prediction.next_month)}
                        </div>
                    </div>
                    <span class="absolute -bottom-8 left-1/2 -translate-x-1/2 text-[10px] font-extrabold text-error uppercase tracking-widest whitespace-nowrap">PREDICTED</span>
                </div>`;

                graphContainer.innerHTML = html;
                
                // We removed the title override to keep it as "Spending Velocity" as requested by user.
                
                const legendBox = graphContainer.parentElement.querySelector('.flex.justify-between.items-start.mb-10 .flex.gap-2');
                if (legendBox) {
                    legendBox.innerHTML = ''; // clear top
                }
                
                let bottomLegend = graphContainer.parentElement.querySelector('#bottomLegendModel');
                if (!bottomLegend) {
                    bottomLegend = document.createElement('div');
                    bottomLegend.id = 'bottomLegendModel';
                    bottomLegend.className = 'w-full flex justify-center gap-6 mt-14 border-t border-slate-100 pt-6';
                    graphContainer.parentElement.appendChild(bottomLegend);
                }
                
                bottomLegend.innerHTML = `
                    <span class="flex items-center gap-2 text-xs font-bold text-slate-600 bg-slate-50 px-4 py-1.5 rounded-full border border-slate-200 shadow-sm"><div class="w-3 h-3 rounded-full bg-primary"></div> Historical Data</span>
                    <span class="flex items-center gap-2 text-xs font-bold text-slate-600 bg-slate-50 px-4 py-1.5 rounded-full border border-slate-200 shadow-sm"><div class="w-3 h-3 rounded-full bg-error opacity-60"></div> ML Prediction (Expense)</span>
                `;
            }
            
        } else {
            if(psContainer) psContainer.innerHTML = `<div class="p-6 bg-error-container text-error rounded-2xl border border-error/20"><p class="font-bold mb-2">Insufficient Data</p><p class="text-sm opacity-80">${mlData.message}</p></div>`;
        }
    } catch (e) {
        if(pfContainer) pfContainer.innerHTML = `<div class="p-6 bg-error-container text-error rounded-2xl border border-error/20 sm:col-span-2"><p class="font-bold">ML Engine Offline</p><p class="text-sm opacity-80 mt-1">Failed to fetch ML insights.</p></div>`;
        console.error(e);
    }
    
    // Remaining UI Setup
    try {
        const portfolioCategoryList = document.getElementById('portfolioCategoryList');
        const predictSpendText = document.getElementById('portfolioTotalSpendPredict');
        
        if (window.globalMlData && window.globalMlData.prediction) {
            const pred = window.globalMlData.prediction;
            const totalProj = pred.next_month;
            
            if (predictSpendText) predictSpendText.textContent = formatCurrency(totalProj);
            
            // 1. Render Categories
            if (portfolioCategoryList && pred.category_projections) {
                portfolioCategoryList.innerHTML = '';
                const sortedCats = Object.entries(pred.category_projections).sort((a, b) => b[1] - a[1]);
                const colors = ['bg-primary', 'bg-secondary', 'bg-error', 'bg-blue-400', 'bg-emerald-400', 'bg-amber-400', 'bg-purple-400', 'bg-pink-400'];
                
                sortedCats.forEach(([cat, amt], idx) => {
                    const pct = totalProj > 0 ? (amt / totalProj) * 100 : 0;
                    const colorClass = colors[idx % colors.length];
                    const row = document.createElement('div');
                    row.className = "flex items-center justify-between p-3 rounded-xl bg-surface-container-low border border-outline-variant/10 transition-all hover:bg-surface-container-highest cursor-default";
                    row.innerHTML = `
                        <div class="flex items-center gap-3">
                            <div class="w-3 h-3 rounded-full ${colorClass}"></div>
                            <span class="text-sm font-medium text-on-surface">${cat} <span class="text-[11px] text-on-surface-variant ml-2 font-bold bg-surface-container px-2 py-0.5 rounded-full border border-outline-variant/30">${formatCurrency(amt)}</span></span>
                        </div>
                        <span class="text-sm font-bold text-on-surface">${pct.toFixed(0)}%</span>
                    `;
                    portfolioCategoryList.appendChild(row);
                });
            }

            // 2. Update SVG Chart
            const paths = document.querySelectorAll('svg.w-48.h-48 path');
            if (paths && paths.length > 0 && pred.category_projections) {
                let offset = 100;
                const sortedCats = Object.entries(pred.category_projections).sort((a, b) => b[1] - a[1]);
                paths.forEach((p, i) => { if (i > 0) p.setAttribute('stroke-dasharray', '0, 100'); });
                sortedCats.forEach(([cat, amt], idx) => {
                    if (idx < paths.length - 1) {
                        const pct = totalProj > 0 ? (amt / totalProj) * 100 : 0;
                        const path = paths[idx + 1];
                        if (path) {
                            path.setAttribute('stroke-dasharray', `${pct}, 100`);
                            path.setAttribute('stroke-dashoffset', `-${100 - offset}`);
                            offset -= pct;
                        }
                    }
                });
            }
        }

        // Fetch fundamental data
        const summaryData = await getDashboardSummary();
        const txns = await getTransactions();

        // 1. Update Safe To Spend (Respecting Custom Budget)
        const safeToSpendEl = document.getElementById('insightSafeToSpend');
        if (safeToSpendEl) {
            let finalSafeToSpend = summaryData.safeToSpend;
            try {
                const sts = await getUserSettings();
                const storedBudgetStr = sts.monthly_budget;
                
                if (storedBudgetStr) {
                    const budgetCap = parseFloat(storedBudgetStr);
                    const now = new Date();
                    const currentMonthExps = txns.filter(t => {
                        if(t.type !== 'expense') return false;
                        const checkDate = new Date(t.date);
                        return checkDate.getMonth() === now.getMonth() && checkDate.getFullYear() === now.getFullYear();
                    });
                    const spentThisMonth = currentMonthExps.reduce((acc, t) => acc + Math.abs(t.amount), 0);
                    finalSafeToSpend = Math.max(0, budgetCap - spentThisMonth);
                }
            } catch (e) {}
            safeToSpendEl.textContent = formatCurrency(finalSafeToSpend);
        }

        // Burn Rate Calculation
        const burnRateEl = document.getElementById('insightBurnRate');
        if (burnRateEl) {
            const now = new Date();
            const currentMonthExps = txns.filter(t => {
                if(t.type !== 'expense') return false;
                const checkDate = new Date(t.date);
                return checkDate.getMonth() === now.getMonth() && checkDate.getFullYear() === now.getFullYear();
            });
            const spentThisMonth = currentMonthExps.reduce((acc, t) => acc + Math.abs(t.amount), 0);
            const daysPassed = Math.max(1, now.getDate());
            const burnRate = spentThisMonth / daysPassed;
            burnRateEl.textContent = `${formatCurrency(burnRate)}/day`;
        }

        // 30-Day Wealth Projection (Dynamic Savings Customization)
        const ppTargetSavingsEl = document.getElementById('ppTargetSavings');
        const ppSpendLimitEl = document.getElementById('ppSpendLimit');
        const ppBarPrimary = document.getElementById('ppBarPrimary');
        const savingsGoalPctText = document.getElementById('savingsGoalPctText');
        const targetSavingsLabel = document.getElementById('targetSavingsLabel');
        const editSavingsGoalBtn = document.getElementById('editSavingsGoalBtn');
        const editSpendLimitBtn = document.getElementById('editSpendLimitBtn');
        const ppProjectedSavingsRate = document.getElementById('ppProjectedSavingsRate');
        const ppSavingsComparisonText = document.getElementById('ppSavingsComparisonText');
        
        let pGlobalBudgetCap = 5000;
        let pSavedGoalPct = 5;

        // Use the globally saved mlData
        const currentMlData = window.globalMlData;

        let globalMlNextMonth = 0;
        let globalMlNextMonthIncome = 0;
        let globalMlNextWeek = 0;

        if (currentMlData && currentMlData.prediction) {
            globalMlNextWeek = currentMlData.prediction.next_week;
            globalMlNextMonthIncome = currentMlData.prediction.next_month_income;
            globalMlNextMonth = currentMlData.prediction.next_month;
        }
        
        try {
            const wSettings = await getUserSettings();
            if (wSettings.monthly_budget) pGlobalBudgetCap = parseFloat(wSettings.monthly_budget);
            if (wSettings.savings_goal_pct) pSavedGoalPct = parseFloat(wSettings.savings_goal_pct);
        } catch(e) {}
        


        function renderWealthProjection() {
            let goalPct = pSavedGoalPct;

            if (savingsGoalPctText) savingsGoalPctText.textContent = goalPct.toFixed(1);
            if (targetSavingsLabel) targetSavingsLabel.textContent = goalPct.toFixed(1);

            // Use Income as the base for targeted savings if available, otherwise use budget cap
            const baseAmount = globalMlNextMonthIncome > 0 ? globalMlNextMonthIncome : pGlobalBudgetCap;
            
            const targetExtraSavings = baseAmount * (goalPct / 100);
            const spendLimit = baseAmount - targetExtraSavings;
            const predSpend = globalMlNextMonth;

            if (ppTargetSavingsEl) ppTargetSavingsEl.textContent = formatCurrency(targetExtraSavings);
            if (ppSpendLimitEl) ppSpendLimitEl.textContent = formatCurrency(spendLimit);

            // Projected Savings Rate calculation based on income
            const projSavings = baseAmount - predSpend;
            const projSavingsRate = baseAmount > 0 ? (projSavings / baseAmount) * 100 : 0;
            if (ppProjectedSavingsRate) {
                ppProjectedSavingsRate.textContent = `${projSavingsRate.toFixed(1)}%`;
                ppProjectedSavingsRate.className = `text-2xl font-black font-headline ${projSavingsRate >= goalPct ? 'text-secondary' : 'text-error'}`;
            }

            // Comparison Text (7-day vs 30-day velocity)
            if (ppSavingsComparisonText && globalMlNextWeek > 0) {
                const weeklyPace = globalMlNextWeek * (30/7);
                const isWeeklyHigher = weeklyPace > predSpend;
                const diff = Math.abs(weeklyPace - predSpend);
                ppSavingsComparisonText.innerHTML = isWeeklyHigher 
                    ? `⚠️ Your <strong>7-day velocity</strong> (₹${Math.round(weeklyPace)}) is higher than your monthly average. Spending is accelerating.` 
                    : `✅ Your <strong>7-day velocity</strong> (₹${Math.round(weeklyPace)}) is lower than your monthly average. Habit is improving!`;
            }

            let statusHTML = '';
            if (predSpend > spendLimit) {
                const overage = predSpend - spendLimit;
                statusHTML = `
                <div class="flex items-start gap-4 p-5 bg-error-container/20 rounded-2xl border border-error/10">
                    <div class="w-10 h-10 rounded-full bg-error flex items-center justify-center flex-shrink-0">
                        <span class="material-symbols-outlined text-white">warning</span>
                    </div>
                    <div>
                        <p class="font-bold text-error">Projection: Budget Breach</p>
                        <p class="text-[11px] text-on-surface-variant mt-2 leading-relaxed">
                            Your projected spend (${formatCurrency(predSpend)}) exceeds your limit of ${formatCurrency(spendLimit)} by <strong>${formatCurrency(overage)}</strong>. 
                            To save ${goalPct.toFixed(1)}%, you must reduce spending by <strong>${formatCurrency(overage/30)}/day</strong> starting now.
                        </p>
                    </div>
                </div>`;
                if(ppBarPrimary) {
                    ppBarPrimary.className = "h-full bg-error relative z-10 transition-all duration-1000 rounded-full shadow-[0px_0px_10px_rgba(239,68,68,0.5)]";
                    ppBarPrimary.style.width = "100%"; 
                }
            } else {
                const buffer = spendLimit - predSpend;
                statusHTML = `
                <div class="flex items-start gap-4 p-5 bg-secondary-container/20 rounded-2xl border border-secondary/10">
                    <div class="w-10 h-10 rounded-full bg-secondary flex items-center justify-center flex-shrink-0">
                        <span class="material-symbols-outlined text-white">task_alt</span>
                    </div>
                    <div>
                        <p class="font-bold text-secondary">Projection: Goal Attainable</p>
                        <p class="text-[11px] text-on-surface-variant mt-2 leading-relaxed">
                            You are on track to save <strong>${projSavingsRate.toFixed(1)}%</strong>, which beats your ${goalPct.toFixed(1)}% target! 
                            You have a spending buffer of <strong>${formatCurrency(buffer)}</strong> remaining for the month.
                        </p>
                    </div>
                </div>`;
                if(ppBarPrimary) {
                    ppBarPrimary.className = "h-full bg-secondary relative z-10 transition-all duration-1000 rounded-full";
                    let wPct = 0;
                    if (spendLimit > 0) wPct = Math.min((predSpend / spendLimit) * 70, 70); 
                    ppBarPrimary.style.width = `${Math.max(wPct, 5)}%`; 
                }
            }
            if (psContainer) psContainer.innerHTML = statusHTML;
        }

        if (window.globalMlData) {
            renderWealthProjection();
        } else {
            if (psContainer) psContainer.innerHTML = `<div class="p-4 text-center text-slate-400 bg-surface-container rounded-2xl border border-outline-variant/30"><p class="text-xs font-bold">Waiting for ML Insights...</p></div>`;
        }

        if (editSavingsGoalBtn) {
            editSavingsGoalBtn.addEventListener('click', async (e) => {
                e.preventDefault();
                let currentGoal = pSavedGoalPct;
                
                const newGoalStr = prompt("Enter your new 30-Day Savings Goal Percentage (e.g., 5 for 5%, 15 for 15%):", currentGoal);
                if (newGoalStr !== null && newGoalStr.trim() !== '') {
                    let newGoal = parseFloat(newGoalStr);
                    if (isNaN(newGoal) || newGoal < 0 || newGoal > 100) {
                        alert("Please enter a valid percentage between 0 and 100.");
                        return;
                    }
                    pSavedGoalPct = newGoal;
                    await saveUserSettings({ savings_goal_pct: newGoal });
                    renderWealthProjection();
                }
            });
        }

        if (editSpendLimitBtn) {
            editSpendLimitBtn.addEventListener('click', async (e) => {
                e.preventDefault();
                const baseForLimit = globalMlNextMonthIncome > 0 ? globalMlNextMonthIncome : pGlobalBudgetCap;
                const currentLimit = baseForLimit * (1 - pSavedGoalPct / 100);
                const newLimitStr = prompt(`Enter your new Maximum Spend Limit for the next 30 days (Income: ${formatCurrency(baseForLimit)}):`, Math.round(currentLimit));
                
                if (newLimitStr !== null && newLimitStr.trim() !== '') {
                    const newLimit = parseFloat(newLimitStr);
                    if (isNaN(newLimit) || newLimit <= 0) {
                        alert("Please enter a valid numeric limit.");
                        return;
                    }
                    
                    // Convert new limit back to savings goal % relative to income/base
                    const newGoal = (1 - newLimit / baseForLimit) * 100;
                    pSavedGoalPct = newGoal;
                    await saveUserSettings({ savings_goal_pct: newGoal });
                    renderWealthProjection();
                }
            });
        }

    } catch(err) {
        console.warn("Could not load secondary widgets", err);
    }
});
