document.addEventListener('DOMContentLoaded', () => {
    const calendarGrid = document.getElementById('calendarGrid');
    const monthYearDisplay = document.getElementById('calendarMonthYear');
    const prevMonthBtn = document.getElementById('prevMonth');
    const nextMonthBtn = document.getElementById('nextMonth');
    const dayFocusContent = document.getElementById('dayFocusContent');
    const selectedDateDisplay = document.getElementById('selectedDateDisplay');
    const addEventBtn = document.getElementById('addEventBtn');

    const eventModal = document.getElementById('eventModal');
    const eventForm = document.getElementById('eventForm');
    const closeModal = document.getElementById('closeModal');
    const deleteEventBtn = document.getElementById('deleteEventBtn');

    let currentDate = new Date();
    let selectedDate = new Date();
    let events = [];

    // ─── API Interaction ───
    async function fetchEvents() {
        try {
            const res = await fetch(`${API_BASE}/api/calendar-events`);
            events = await res.json();
            renderCalendar();
            renderDayFocus();
        } catch (e) {
            console.error("Failed to fetch calendar events", e);
        }
    }

    async function saveEvent(event) {
        const url = event.id ? `${API_BASE}/api/calendar-events/${event.id}` : `${API_BASE}/api/calendar-events`;
        const method = event.id ? 'PUT' : 'POST';

        try {
            const res = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(event)
            });
            const result = await res.json();
            console.log("Save Event Result:", result);

            if (result.success || res.ok) {
                hideModal();
                await fetchEvents();
            } else {
                alert("Strategic entry failed: " + (result.error || "Unknown error"));
            }
        } catch (e) {
            console.error("Failed to save event", e);
            alert("Connection error: Could not reach the analytical sanctuary server.");
        }
    }

    async function deleteEvent(id) {
        try {
            await fetch(`${API_BASE}/api/calendar-events/${id}`, { method: 'DELETE' });
            hideModal();
            await fetchEvents();
        } catch (e) {
            console.error("Failed to delete event", e);
        }
    }

    // ─── Calendar Rendering ───
    function renderCalendar() {
        calendarGrid.innerHTML = '';
        const year = currentDate.getFullYear();
        const month = currentDate.getMonth();

        monthYearDisplay.textContent = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(currentDate);

        const firstDay = new Date(year, month, 1).getDay();
        const daysInMonth = new Date(year, month + 1, 0).getDate();

        // Padding for previous month
        for (let i = 0; i < firstDay; i++) {
            const emptyDiv = document.createElement('div');
            emptyDiv.className = 'calendar-day opacity-20';
            calendarGrid.appendChild(emptyDiv);
        }

        const today = new Date();

        for (let day = 1; day <= daysInMonth; day++) {
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const dayEvents = events.filter(e => e.date === dateStr);

            const dayEl = document.createElement('div');
            dayEl.className = 'calendar-day';
            if (day === today.getDate() && month === today.getMonth() && year === today.getFullYear()) {
                dayEl.classList.add('today');
            }
            if (day === selectedDate.getDate() && month === selectedDate.getMonth() && year === selectedDate.getFullYear()) {
                dayEl.classList.add('selected');
            }

            dayEl.innerHTML = `<span>${day}</span>`;

            if (dayEvents.length > 0) {
                const hasExpense = dayEvents.some(e => e.type === 'expense');
                const hasIncome = dayEvents.some(e => e.type === 'income');

                const dot = document.createElement('div');
                dot.className = 'day-dot';

                if (hasExpense && hasIncome) dot.style.background = '#003575'; // Mixed
                else if (hasIncome) dot.style.background = '#70d8c8'; // Income
                else dot.style.background = '#ba1a1a'; // Expense

                dayEl.appendChild(dot);
            }

            dayEl.addEventListener('click', () => {
                selectedDate = new Date(year, month, day);
                renderCalendar();
                renderDayFocus();
            });

            calendarGrid.appendChild(dayEl);
        }
    }

    function renderDayFocus() {
        if (!selectedDate) return;

        const y = selectedDate.getFullYear();
        const m = String(selectedDate.getMonth() + 1).padStart(2, '0');
        const d = String(selectedDate.getDate()).padStart(2, '0');
        const dateStr = `${y}-${m}-${d}`;

        console.log("Day Focus checking for date:", dateStr);

        selectedDateDisplay.textContent = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(selectedDate);

        const dayEvents = (events || []).filter(e => e.date === dateStr);
        const dayStatusBadge = document.getElementById('dayStatusBadge');
        const dayStatusText = document.getElementById('dayStatusText');
        const dayStatusDot = dayStatusBadge.querySelector('span');

        dayFocusContent.innerHTML = '';

        if (dayEvents.length === 0) {
            dayStatusBadge.classList.add('hidden');
            dayFocusContent.innerHTML = `
                <div class="flex flex-col items-center justify-center h-full text-center space-y-4 opacity-40">
                    <span class="material-symbols-outlined text-4xl">event_busy</span>
                    <p class="text-xs font-medium">No strategic events logged for this date.</p>
                </div>
            `;
            return;
        }

        // Calculate Day Status
        const totalExp = dayEvents.filter(e => e.type === 'expense').reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0);
        const totalInc = dayEvents.filter(e => e.type === 'income').reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0);

        dayStatusBadge.classList.remove('hidden');
        if (totalInc > totalExp) {
            dayStatusText.textContent = 'Income Day';
            dayStatusDot.className = 'w-1.5 h-1.5 rounded-full bg-secondary-fixed';
        } else if (totalExp > totalInc) {
            dayStatusText.textContent = 'Expense Day';
            dayStatusDot.className = 'w-1.5 h-1.5 rounded-full bg-error';
        } else {
            dayStatusText.textContent = 'Balanced Day';
            dayStatusDot.className = 'w-1.5 h-1.5 rounded-full bg-primary';
        }

        dayEvents.forEach(event => {
            const amt = Math.abs(parseFloat(event.amount) || 0);
            const isIncome = event.type === 'income';
            const displayAmt = isIncome ? amt : -amt;

            const card = document.createElement('div');
            card.className = 'bg-white border border-slate-100 rounded-3xl p-6 flex flex-col justify-between group cursor-pointer hover:shadow-2xl hover:shadow-slate-200 transition-all duration-500 hover:-translate-y-2';
            card.innerHTML = `
                <div class="flex items-start justify-between mb-6">
                    <div class="w-12 h-12 rounded-2xl ${isIncome ? 'bg-secondary/10 text-secondary' : 'bg-error/10 text-error'} flex items-center justify-center">
                        <span class="material-symbols-outlined text-2xl" style="font-variation-settings: 'FILL' 1;">${isIncome ? 'account_balance_wallet' : 'payments'}</span>
                    </div>
                    <div class="px-3 py-1 rounded-full bg-slate-50 text-[8px] font-black uppercase tracking-widest text-slate-400">Current Focus</div>
                </div>
                <div>
                    <h5 class="font-black text-lg text-slate-900 tracking-tight leading-tight">${event.title || 'Untitled Event'}</h5>
                    <p class="text-[10px] font-bold text-slate-400 mt-1 line-clamp-1">${event.description || 'No additional insights'}</p>
                    
                    <div class="flex items-center justify-between mt-6 pt-6 border-t border-slate-50">
                        <div class="flex flex-col">
                            <span class="text-[9px] font-black uppercase tracking-widest text-slate-300">Transaction</span>
                            <span class="text-sm font-black ${isIncome ? 'text-secondary' : 'text-slate-900'}">${isIncome ? '+' : ''}${typeof formatCurrency === 'function' ? formatCurrency(displayAmt) : '₹' + displayAmt.toFixed(2)}</span>
                        </div>
                        <div class="w-8 h-8 rounded-full bg-slate-50 flex items-center justify-center text-slate-300 group-hover:bg-primary group-hover:text-white transition-all">
                            <span class="material-symbols-outlined text-sm">edit</span>
                        </div>
                    </div>
                </div>
            `;
            card.addEventListener('click', () => showModal(event));
            dayFocusContent.appendChild(card);
        });

        // ─── Upcoming Reminders Logic ───
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const upcomingEvents = (events || []).filter(e => {
            const eDate = new Date(e.date);
            return eDate > today && e.date !== dateStr;
        }).sort((a, b) => new Date(a.date) - new Date(b.date)).slice(0, 3);

        if (upcomingEvents.length > 0) {
            const divider = document.createElement('div');
            divider.className = 'col-span-full pt-10 pb-4 border-t border-slate-100/50 mt-4 flex items-center justify-between';
            divider.innerHTML = `
                <p class="text-[10px] font-black uppercase tracking-[0.4em] text-slate-300">Strategic Projections</p>
                <div class="h-px flex-1 bg-slate-100 mx-8"></div>
            `;
            dayFocusContent.appendChild(divider);

            upcomingEvents.forEach(event => {
                const amt = parseFloat(event.amount) || 0;
                const card = document.createElement('div');
                card.className = 'bg-slate-50/50 border border-slate-100 rounded-[2rem] p-5 flex items-center justify-between group cursor-pointer hover:bg-white hover:shadow-xl hover:shadow-slate-100 transition-all opacity-70 hover:opacity-100';
                card.innerHTML = `
                    <div class="flex items-center gap-4">
                        <div class="w-10 h-10 rounded-xl bg-white shadow-sm flex items-center justify-center text-slate-400">
                            <span class="material-symbols-outlined text-lg" style="font-variation-settings: 'FILL' 1;">notifications_active</span>
                        </div>
                        <div>
                            <h5 class="font-black text-sm text-slate-700 tracking-tight">${event.title}</h5>
                            <p class="text-[9px] font-black uppercase tracking-widest text-secondary">${new Date(event.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</p>
                        </div>
                    </div>
                    <div class="text-right">
                        <p class="font-black text-sm text-slate-900">${typeof formatCurrency === 'function' ? formatCurrency(amt) : '₹' + amt.toFixed(2)}</p>
                    </div>
                `;
                card.addEventListener('click', () => showModal(event));
                dayFocusContent.appendChild(card);
            });
        }
    }

    // ─── Modal Logic ───
    function showModal(event = null) {
        eventModal.classList.remove('hidden');
        setTimeout(() => {
            eventModal.classList.add('opacity-100');
            eventModal.querySelector('.transform').classList.remove('scale-95');
        }, 10);

        if (event) {
            document.getElementById('modalTitle').textContent = 'Edit Event';
            document.getElementById('eventId').value = event.id;
            document.getElementById('eventTitle').value = event.title;
            document.getElementById('eventAmount').value = event.amount;
            document.getElementById('eventType').value = event.type;
            document.getElementById('eventDescription').value = event.description;
            deleteEventBtn.classList.remove('hidden');
        } else {
            document.getElementById('modalTitle').textContent = 'Log Event';
            eventForm.reset();
            document.getElementById('eventId').value = '';
            deleteEventBtn.classList.add('hidden');
        }
    }

    function hideModal() {
        eventModal.classList.remove('opacity-100');
        eventModal.querySelector('.transform').classList.add('scale-95');
        setTimeout(() => {
            eventModal.classList.add('hidden');
        }, 300);
    }

    // ─── Event Listeners ───
    prevMonthBtn.addEventListener('click', () => {
        currentDate.setMonth(currentDate.getMonth() - 1);
        // Sync selected date to the 1st of the new month to avoid confusion
        selectedDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
        renderCalendar();
        renderDayFocus();
    });

    nextMonthBtn.addEventListener('click', () => {
        currentDate.setMonth(currentDate.getMonth() + 1);
        // Sync selected date to the 1st of the new month to avoid confusion
        selectedDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
        renderCalendar();
        renderDayFocus();
    });

    addEventBtn.addEventListener('click', () => showModal());
    closeModal.addEventListener('click', hideModal);

    eventForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const dateStr = `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, '0')}-${String(selectedDate.getDate()).padStart(2, '0')}`;
        const event = {
            id: document.getElementById('eventId').value,
            title: document.getElementById('eventTitle').value,
            amount: parseFloat(document.getElementById('eventAmount').value) || 0,
            type: document.getElementById('eventType').value,
            description: document.getElementById('eventDescription').value,
            date: dateStr
        };
        saveEvent(event);
    });

    deleteEventBtn.addEventListener('click', () => {
        const id = document.getElementById('eventId').value;
        if (id && confirm('Are you sure you want to delete this strategic event?')) {
            deleteEvent(id);
        }
    });

    // Initial Fetch
    fetchEvents();
});
