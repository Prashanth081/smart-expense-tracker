const sqlite3 = require('sqlite3').verbose();
const crypto = require('crypto');
const db = new sqlite3.Database('./database.sqlite');

const transactions = [];
const today = new Date();

// We'll generate data over the last 60 days.
// The first 53 days will have very low, normal spending.
// The last 7 days will have EXTREME spending to trigger the ML overspending alerts.

for (let i = 60; i >= 0; i--) {
    let loopDate = new Date();
    loopDate.setDate(today.getDate() - i);
    let dateStr = loopDate.toISOString();
    
    // Base case: Historical data before last week
    if (i > 7) {
        // Normal modest spending
        transactions.push({
            txn_id: crypto.randomUUID(),
            date: dateStr,
            merchant: "Daily Needs",
            category: "Lifestyle",
            amount: 15 + Math.random() * 5, // $15 - $20
            type: "expense",
            notes: "Normal ML History"
        });

        if (i % 5 === 0) {
            transactions.push({
                txn_id: crypto.randomUUID(),
                date: dateStr,
                merchant: "Supermarket",
                category: "Groceries",
                amount: 40 + Math.random() * 10, // ~ $45
                type: "expense",
                notes: "Normal ML History"
            });
        }
    } else {
        // OVERSPENDING: Last 7 Days Extreme Outliers
        transactions.push({
            txn_id: crypto.randomUUID(),
            date: dateStr,
            merchant: "Luxury Boutique",
            category: "Lifestyle",
            amount: 150 + Math.random() * 50, // $150 - $200
            type: "expense",
            notes: "Recent Extreme Overspend"
        });
        
        transactions.push({
            txn_id: crypto.randomUUID(),
            date: dateStr,
            merchant: "Michelin Star Restaurant",
            category: "Dining",
            amount: 200 + Math.random() * 100, // $200 - $300
            type: "expense",
            notes: "Recent Extreme Overspend"
        });
    }

    // Bi-weekly consistent income
    if (i === 60 || i === 45 || i === 30 || i === 15 || i === 0) {
        transactions.push({
            txn_id: crypto.randomUUID(),
            date: dateStr,
            merchant: "Employer Inc",
            category: "Salary",
            amount: 2000,
            type: "income",
            notes: "Salary Baseline"
        });
    }
}

db.serialize(() => {
    // Clear old test data
    db.run("DELETE FROM transactions");
    
    const stmt = db.prepare("INSERT INTO transactions (txn_id, date, merchant, category, amount, type, notes) VALUES (?, ?, ?, ?, ?, ?, ?)");
    for (let t of transactions) {
        stmt.run(t.txn_id, t.date, t.merchant, t.category, t.amount, t.type, t.notes);
    }
    stmt.finalize(() => {
        console.log(`Successfully seeded ${transactions.length} rows of new ML test data (specifically designed for overspending).`);
        db.close();
    });
});
