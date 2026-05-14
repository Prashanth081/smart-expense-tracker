const sqlite3 = require('sqlite3').verbose();
const crypto = require('crypto');
const db = new sqlite3.Database('./database.sqlite');

const transactions = [];

function generateDataForMonth(year, month, days) {
    for (let i = 1; i <= days; i++) {
        let dateStr = new Date(year, month - 1, i, 12, 0, 0).toISOString();
        
        // Random daily expense
        transactions.push({
            txn_id: crypto.randomUUID(),
            date: dateStr,
            merchant: ["Starbucks", "Daily Needs", "Amazon", "Uber", "Local Cafe", "Whole Foods"][Math.floor(Math.random()*6)],
            category: ["Dining", "Lifestyle", "Shopping", "Transportation", "Dining", "Groceries"][Math.floor(Math.random()*6)],
            amount: -(10 + Math.random() * 30),
            type: "expense",
            notes: "Sample Data"
        });

        // Groceries every 5 days
        if (i % 5 === 0) {
            transactions.push({
                txn_id: crypto.randomUUID(),
                date: dateStr,
                merchant: "Supermarket",
                category: "Groceries",
                amount: -(50 + Math.random() * 50),
                type: "expense",
                notes: "Sample Data"
            });
        }
    }
    
    // Income at the start of the month
    transactions.push({
        txn_id: crypto.randomUUID(),
        date: new Date(year, month - 1, 1, 9, 0, 0).toISOString(),
        merchant: "Employer Inc",
        category: "Salary",
        amount: 3500,
        type: "income",
        notes: "Salary Baseline"
    });
}

// Generate for March 2026
generateDataForMonth(2026, 3, 31);

// Generate for April 2026
generateDataForMonth(2026, 4, 30);

db.serialize(() => {
    const stmt = db.prepare("INSERT INTO transactions (txn_id, date, merchant, category, amount, type, notes) VALUES (?, ?, ?, ?, ?, ?, ?)");
    for (let t of transactions) {
        stmt.run(t.txn_id, t.date, t.merchant, t.category, t.amount, t.type, t.notes);
    }
    stmt.finalize(() => {
        console.log(`Successfully added ${transactions.length} rows for March and April 2026.`);
        db.close();
    });
});
