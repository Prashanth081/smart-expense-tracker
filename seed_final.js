const sqlite3 = require('sqlite3').verbose();
const crypto = require('crypto');
const db = new sqlite3.Database('./database.sqlite');

const transactions = [];
const subscriptions = [];

function addTransaction(date, merchant, category, amount, type, notes = "Sample Data") {
    transactions.push({
        txn_id: crypto.randomUUID(),
        date: date.toISOString(),
        merchant,
        category,
        amount: type === 'expense' ? -Math.abs(amount) : Math.abs(amount),
        type,
        notes
    });
}

// 1. Generate Salary (25000) for March, April, May
[3, 4, 5].forEach(month => {
    addTransaction(new Date(2026, month - 1, 1, 10, 0, 0), "Employer Inc", "Salary", 25000, "income", "Monthly Salary");
});

// 2. Generate Daily Expenses for March, April, and May (up to May 7)
function generateDaily(year, month, startDay, endDay) {
    for (let day = startDay; day <= endDay; day++) {
        // Random daily coffee/lunch
        const amt = 15 + Math.random() * 40;
        addTransaction(new Date(year, month - 1, day, 12, 0, 0), "Local Cafe", "Dining", amt, "expense");
        
        // Random transport
        if (Math.random() > 0.3) {
            addTransaction(new Date(year, month - 1, day, 9, 0, 0), "Uber", "Transportation", 10 + Math.random() * 20, "expense");
        }
    }
}

generateDaily(2026, 3, 1, 31); // March
generateDaily(2026, 4, 1, 30); // April
generateDaily(2026, 5, 1, 7);  // May (up to today)

// 3. Add Weekly Recurring Expenses (Historical)
const weeklyExp = [
    { merchant: "Gym Membership", category: "Health", amount: 500 },
    { merchant: "Weekly Groceries", category: "Groceries", amount: 1200 }
];

[3, 4, 5].forEach(month => {
    const days = month === 5 ? 7 : 28;
    for (let day = 7; day <= days; day += 7) {
        weeklyExp.forEach(exp => {
            addTransaction(new Date(2026, month - 1, day, 18, 0, 0), exp.merchant, exp.category, exp.amount, "expense", "Weekly Recurring");
        });
    }
});

// 4. Add Future Subscriptions for the system to track
subscriptions.push({ merchant: "Gym Membership", category: "Health", amount: 500, type: "expense", frequency: "weekly", next_date: "2026-05-14" });
subscriptions.push({ merchant: "Weekly Groceries", category: "Groceries", amount: 1200, type: "expense", frequency: "weekly", next_date: "2026-05-14" });
subscriptions.push({ merchant: "Employer Inc", category: "Salary", amount: 25000, type: "income", frequency: "monthly", next_date: "2026-06-01" });

db.serialize(() => {
    // Clear existing
    db.run("DELETE FROM transactions");
    db.run("DELETE FROM recurring_subscriptions");
    db.run("UPDATE summary SET balance = 0, safeToSpend = 0 WHERE id = 1");

    const stmtTxn = db.prepare("INSERT INTO transactions (txn_id, date, merchant, category, amount, type, notes) VALUES (?, ?, ?, ?, ?, ?, ?)");
    let totalBalance = 0;
    
    transactions.forEach(t => {
        stmtTxn.run(t.txn_id, t.date, t.merchant, t.category, t.amount, t.type, t.notes);
        totalBalance += t.amount;
    });
    stmtTxn.finalize();

    const stmtSub = db.prepare("INSERT INTO recurring_subscriptions (merchant, category, amount, type, frequency, next_date) VALUES (?, ?, ?, ?, ?, ?)");
    subscriptions.forEach(s => {
        stmtSub.run(s.merchant, s.category, s.amount, s.type, s.frequency, s.next_date);
    });
    stmtSub.finalize();

    db.run("UPDATE summary SET balance = ?, safeToSpend = ? WHERE id = 1", [totalBalance, totalBalance > 0 ? totalBalance * 0.8 : 0]);

    console.log(`Successfully seeded ${transactions.length} transactions and ${subscriptions.length} recurring subscriptions.`);
    db.close();
});
