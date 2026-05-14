document.addEventListener('DOMContentLoaded', async () => {
    // 1. Initial Data Fetch
    let data;
    try {
        data = await getDashboardSummary();
    } catch (e) {
        console.error("Failed to fetch dashboard summary", e);
        return;
    }
    const txns = data.transactions || [];
    let ml = null;

    // 2. Balance & Savings Logic
    const balanceEl = document.getElementById('dashTotalBalance');
    const lifeBalanceEl = document.getElementById('dashLifetimeBalance');
    const safeToSpendEl = document.querySelector('.bg-tertiary.text-on-tertiary.font-bold');

    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    let cmInc = 0;
    let cmExp = 0;
    let totalInc = 0;
    let totalExp = 0;

    txns.forEach(t => {
        const d = new Date(t.date);
        const amt = Math.abs(t.amount);
        if (t.type === 'expense') totalExp += amt;
        else totalInc += amt;

        if (d.getMonth() === currentMonth && d.getFullYear() === currentYear) {
            if (t.type === 'expense') cmExp += amt;
            else cmInc += amt;
        }
    });

    const totalLiquidity = totalInc - totalExp;
    const monthlySavings = cmInc - cmExp;

    if (lifeBalanceEl) {
        lifeBalanceEl.textContent = formatCurrency(totalLiquidity);
        lifeBalanceEl.classList.toggle('text-error', totalLiquidity < 0);
    }

    // 3. Populate Monthly Remaining (surplus) from ML
    const monthlyRemainingEl = document.getElementById('dashMonthlyRemaining');
    const remainingBar = document.getElementById('dashRemainingBar');
    const remainingStatus = document.getElementById('dashRemainingStatus');

    // 4. AI Projection Logic
    const expVal = document.getElementById('projectedExpenseVal');
    const incVal = document.getElementById('projectedIncomeVal');

    async function updateAIProjection() {
        if (!expVal || !incVal) return;
        expVal.innerHTML = '<span class="material-symbols-outlined animate-spin text-xs">sync</span>';
        incVal.innerHTML = '<span class="material-symbols-outlined animate-spin text-sm">sync</span>';

        try {
            const res = await fetch(`${API_BASE}/api/ml-insights`);
            const result = await res.json();
            if (result.status === 'success') {
                ml = result; // Store full result globally
                const pred = ml.prediction;
                expVal.textContent = formatCurrency(pred.next_month || 0);
                incVal.textContent = formatCurrency(pred.next_month_income || 0);
                renderChart(txns, pred);

                // Update Dashboard Surplus Logic
                const projSurplus = (pred.projected_current_month_income || 0) - (pred.projected_current_month_expense || 0);
                if (monthlyRemainingEl) {
                    monthlyRemainingEl.textContent = formatCurrency(projSurplus);
                    monthlyRemainingEl.classList.toggle('text-error', projSurplus < 0);
                    monthlyRemainingEl.classList.toggle('text-secondary-fixed', projSurplus >= 0);
                }

                if (remainingBar && pred.projected_current_month_income > 0) {
                    const usePct = Math.min((pred.projected_current_month_expense / pred.projected_current_month_income) * 100, 100);
                    remainingBar.style.width = `${usePct}%`;
                    if (remainingStatus) remainingStatus.textContent = `${usePct.toFixed(0)}% DEPLETED`;

                    // Keep base budget-fill class and add color overrides
                    remainingBar.className = 'budget-fill transition-all duration-1000';
                    if (usePct > 90) remainingBar.style.background = 'linear-gradient(90deg, #ba1a1a, #ffdad6)';
                    else if (usePct > 70) remainingBar.style.background = 'linear-gradient(90deg, #f97316, #fdba74)';
                    else remainingBar.style.background = 'linear-gradient(90deg, #70d8c8, #235cb2)';
                }

                // Overspending Warning Banner (Now based on income threshold if no budget set)
                const banner = document.getElementById('mlBudgetAlertBanner');
                if (banner) {
                    const settings = await getUserSettings();
                    const budgetCap = parseFloat(settings.monthly_budget) || pred.projected_current_month_income;
                    if (pred.projected_current_month_expense > budgetCap) {
                        const over = pred.projected_current_month_expense - budgetCap;
                        banner.innerHTML = `
                            <div class="bg-error/10 border border-error/20 rounded-3xl p-6 flex items-center justify-between mb-8 animate-pulse">
                                <div class="flex items-center gap-4">
                                    <div class="w-12 h-12 rounded-full bg-error text-white flex items-center justify-center">
                                        <span class="material-symbols-outlined">warning</span>
                                    </div>
                                    <div>
                                        <h4 class="font-bold text-error">Financial Pressure Detected</h4>
                                        <p class="text-xs text-on-surface-variant">Your current month's projected spend (<strong>${formatCurrency(pred.projected_current_month_expense)}</strong>) exceeds your ${parseFloat(settings.monthly_budget) > 0 ? 'budget' : 'income'} by <strong>${formatCurrency(over)}</strong>.</p>
                                    </div>
                                </div>
                                <button onclick="window.location.href='insights.html'" class="px-6 py-2 bg-error text-white rounded-full text-xs font-bold hover:bg-error-container transition-colors">View Deep Analysis</button>
                            </div>
                        `;
                    } else {
                        banner.innerHTML = '';
                    }
                }
                // AI Money Personality Logic
                const pers = result.personality;
                if (pers) {
                    const personaEl = document.getElementById('personalityPersona');
                    const descEl = document.getElementById('personalityDesc');
                    const scoreEl = document.getElementById('personalityScore');
                    const progressEl = document.getElementById('personalityProgressBar');

                    if (personaEl) personaEl.textContent = pers.persona;
                    if (descEl) descEl.textContent = pers.description;
                    if (scoreEl) scoreEl.textContent = `${pers.score}/100`;
                    if (progressEl) progressEl.style.width = `${pers.score}%`;
                }

            } else {
                expVal.textContent = "N/A";
                incVal.textContent = "N/A";
                renderChart(txns);
            }
        } catch (e) {
            console.error("ML Fetch Failed", e);
            renderChart(txns);
        }
    }

    function renderChart(allTxns, ml = null) {
        const chart = document.getElementById('dashboardProfitChart');
        if (!chart) return;

        const lastMonth = currentMonth === 0 ? 11 : currentMonth - 1;
        const lastYear = currentMonth === 0 ? currentYear - 1 : currentYear;

        let lmExp = 0, lmInc = 0;
        allTxns.forEach(t => {
            const d = new Date(t.date);
            if (d.getMonth() === lastMonth && d.getFullYear() === lastYear) {
                if (t.type === 'expense') lmExp += Math.abs(t.amount);
                else lmInc += Math.abs(t.amount);
            }
        });

        let nextExp = ml ? ml.next_month : (cmExp * 1.1);
        let nextInc = ml ? ml.next_month_income : cmInc;
        let projCmExp = ml ? (ml.projected_current_month_expense || cmExp) : cmExp;
        let projCmInc = ml ? (ml.projected_current_month_income || cmInc) : cmInc;

        const maxV = Math.max(lmExp, lmInc, projCmExp, projCmInc, nextExp, nextInc, 100);
        const getH = (v) => Math.max((Math.abs(v) / maxV) * 100, 5);

        const updateHeader = (exp, inc) => {
            if (expVal) expVal.textContent = formatCurrency(exp);
            if (incVal) incVal.textContent = formatCurrency(inc);
            const prof = inc - exp;
            const deltaEl = document.getElementById('dashboardProfitDelta');
            if (deltaEl) {
                deltaEl.textContent = `Net Profit: ${formatCurrency(prof)}`;
                deltaEl.className = `text-xs font-bold ${prof >= 0 ? 'text-secondary' : 'text-error'}`;
            }
        };

        const resetHeader = () => {
            if (ml) {
                if (expVal) expVal.textContent = formatCurrency(ml.next_month || 0);
                if (incVal) incVal.textContent = formatCurrency(ml.next_month_income || 0);
            }
        };

        const getCompactVal = (v) => v >= 1000 ? (v / 1000).toFixed(1) + 'k' : Math.round(v);

        chart.innerHTML = `
            <div class="flex-1 flex gap-1 items-end h-full relative group cursor-pointer" onmouseover="this.dispatchEvent(new CustomEvent('barhover', {detail: {exp: ${lmExp}, inc: ${lmInc}}}))" onmouseout="this.dispatchEvent(new CustomEvent('barleave'))">
                <div class="absolute -top-6 left-0 right-0 flex text-[8px] font-bold">
                    <span class="w-1/2 text-center text-error">₹${getCompactVal(lmExp)}</span>
                    <span class="w-1/2 text-center text-secondary">₹${getCompactVal(lmInc)}</span>
                </div>
                <div class="w-1/2 bg-error/70 rounded-t-lg transition-all group-hover:bg-error" style="height: ${getH(lmExp)}%"></div>
                <div class="w-1/2 bg-secondary/70 rounded-t-lg transition-all group-hover:bg-secondary" style="height: ${getH(lmInc)}%"></div>
                <span class="absolute -bottom-6 left-1/2 -translate-x-1/2 text-[10px] text-slate-400 font-bold">LAST</span>
            </div>
            <div class="flex-1 flex gap-1 items-end h-full relative group mx-2 cursor-pointer" onmouseover="this.dispatchEvent(new CustomEvent('barhover', {detail: {exp: ${projCmExp}, inc: ${projCmInc}}}))" onmouseout="this.dispatchEvent(new CustomEvent('barleave'))">
                <div class="absolute -top-6 left-0 right-0 flex text-[8px] font-bold">
                    <span class="w-1/2 text-center text-error">₹${getCompactVal(projCmExp)}</span>
                    <span class="w-1/2 text-center text-secondary">₹${getCompactVal(projCmInc)}</span>
                </div>
                <div class="w-1/2 bg-error rounded-t-lg" style="height: ${getH(projCmExp)}%"></div>
                <div class="w-1/2 bg-secondary rounded-t-lg" style="height: ${getH(projCmInc)}%"></div>
                <span class="absolute -bottom-6 left-1/2 -translate-x-1/2 text-[10px] text-slate-500 font-bold">CURR</span>
            </div>
            <div class="flex-1 flex gap-1 items-end h-full relative group border-l border-dashed border-slate-200 pl-2 cursor-pointer" onmouseover="this.dispatchEvent(new CustomEvent('barhover', {detail: {exp: ${nextExp}, inc: ${nextInc}}}))" onmouseout="this.dispatchEvent(new CustomEvent('barleave'))">
                <div class="absolute -top-6 left-0 right-0 flex text-[8px] font-bold">
                    <span class="w-1/2 text-center text-error">₹${getCompactVal(nextExp)}</span>
                    <span class="w-1/2 text-center text-secondary">₹${getCompactVal(nextInc)}</span>
                </div>
                <div class="w-1/2 bg-error/30 border-t border-dashed border-error rounded-t-lg" style="height: ${getH(nextExp)}%"></div>
                <div class="w-1/2 bg-secondary/30 border-t border-dashed border-secondary rounded-t-lg" style="height: ${getH(nextInc)}%"></div>
                <span class="absolute -bottom-6 left-1/2 -translate-x-1/2 text-[10px] text-primary font-bold">PROJ</span>
            </div>
        `;

        chart.querySelectorAll('.group').forEach(group => {
            group.addEventListener('barhover', (e) => updateHeader(e.detail.exp, e.detail.inc));
            group.addEventListener('barleave', () => resetHeader());
        });
    }

    // ─── Smart Spending Radar Logic ───
    // Initial Execution
    await updateAIProjection();
});
