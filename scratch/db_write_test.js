const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./database.sqlite');

db.run("INSERT INTO transactions (txn_id, date, merchant, category, amount, type, notes) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ['test-' + Date.now(), new Date().toISOString(), 'Test Merchant', 'Test', 10.0, 'expense', 'Test Note'],
    function(err) {
        if (err) {
            console.error('Insert failed:', err);
        } else {
            console.log('Insert successful, ID:', this.lastID);
        }
        db.close();
    }
);
