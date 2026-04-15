const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const path = require('path');
const { exec } = require('child_process');

const app = express();
app.use(cors());
app.use(express.json());

// Serve static frontend files from current directory
app.use(express.static(__dirname));

// Initialize SQLite Database
const db = new sqlite3.Database('./database.sqlite', (err) => {
    if (err) {
        console.error('Error opening database', err);
    } else {
        console.log('Connected to the SQLite database.');
        
        // Define Database Schema
        db.run(`CREATE TABLE IF NOT EXISTS transactions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            txn_id TEXT UNIQUE,
            date TEXT,
            merchant TEXT,
            category TEXT,
            amount REAL,
            type TEXT,
            notes TEXT
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS recurring_subscriptions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            merchant TEXT,
            category TEXT,
            amount REAL,
            type TEXT,
            frequency TEXT,
            next_date TEXT
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT,
            email TEXT UNIQUE,
            password TEXT
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS summary (
            id INTEGER PRIMARY KEY,
            balance REAL,
            safeToSpend REAL
        )`, () => {
            // Check if summary exists, if not create fresh
            db.get("SELECT * FROM summary WHERE id = 1", (err, row) => {
                if (!row) {
                    db.run("INSERT INTO summary (id, balance, safeToSpend) VALUES (1, 0, 0)");
                }
            });
        });

        // Credit Cards table
        db.run(`CREATE TABLE IF NOT EXISTS credit_cards (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            card_number TEXT,
            cvv TEXT,
            total_limit REAL,
            used_limit REAL,
            access_limit REAL,
            card_name TEXT
        )`);

        // Loans table
        db.run(`CREATE TABLE IF NOT EXISTS loans (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            loan_type TEXT,
            total_amount REAL,
            monthly_emi REAL,
            months_remaining INTEGER,
            loan_name TEXT
        )`);

        // User Settings table (budget, daily limit, savings goal)
        db.run(`CREATE TABLE IF NOT EXISTS user_settings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT UNIQUE,
            monthly_budget REAL DEFAULT 5000,
            daily_limit REAL DEFAULT 0,
            savings_goal_pct REAL DEFAULT 5
        )`);
    }
});

// Utility to process recurring logic
function processRecurringLogic(callback) {
    const todayStr = new Date().toISOString().split('T')[0];
    
    db.all("SELECT * FROM recurring_subscriptions WHERE next_date <= ?", [todayStr], (err, subs) => {
        if (err || !subs || subs.length === 0) return callback();
        
        let pending = subs.length;
        if (pending === 0) return callback();

        subs.forEach(sub => {
            const txn_id = 'txn-rec-' + Date.now() + Math.floor(Math.random() * 100);
            
            // Insert the generated transaction
            db.run("INSERT INTO transactions (txn_id, date, merchant, category, amount, type, notes) VALUES (?, ?, ?, ?, ?, ?, ?)",
                [txn_id, sub.next_date, sub.merchant, sub.category, sub.amount, sub.type, "Auto-generated recurring entry"], (err) => {
                
                // Update Balance
                db.get("SELECT balance, safeToSpend FROM summary WHERE id = 1", (err, row) => {
                    const newBalance = (row ? row.balance : 0) + sub.amount;
                    const newSafe = sub.type === 'expense' ? Math.max(0, (row ? row.safeToSpend : 0) + sub.amount) : (row ? row.safeToSpend : 0);
                    db.run("UPDATE summary SET balance = ?, safeToSpend = ? WHERE id = 1", [newBalance, newSafe]);
                });

                // Calculate next date
                let nextDateObj = new Date(sub.next_date);
                if (sub.frequency.toLowerCase() === 'monthly') {
                    nextDateObj.setMonth(nextDateObj.getMonth() + 1);
                } else if (sub.frequency.toLowerCase() === 'weekly') {
                    nextDateObj.setDate(nextDateObj.getDate() + 7);
                } else if (sub.frequency.toLowerCase() === 'yearly') {
                    nextDateObj.setFullYear(nextDateObj.getFullYear() + 1);
                }
                const newNextStr = nextDateObj.toISOString().split('T')[0];

                db.run("UPDATE recurring_subscriptions SET next_date = ? WHERE id = ?", [newNextStr, sub.id], () => {
                    pending--;
                    if (pending === 0) callback();
                });
            });
        });
    });
}

// GET /api/summary
// Returns balance, safe to spend, and triggers a recurring check
app.get('/api/summary', (req, res) => {
    processRecurringLogic(() => {
        db.get("SELECT balance, safeToSpend FROM summary WHERE id = 1", (err, summaryRow) => {
            if (err) return res.status(500).json({error: err.message});
            
            db.all("SELECT * FROM transactions ORDER BY date DESC", (err, txns) => {
                if (err) return res.status(500).json({error: err.message});
                
                res.json({
                    balance: summaryRow ? summaryRow.balance : 0,
                    safeToSpend: summaryRow ? summaryRow.safeToSpend : 0,
                    transactions: txns
                });
            });
        });
    });
});

// PUT /api/summary
app.put('/api/summary', (req, res) => {
    const { balance } = req.body;
    db.run("UPDATE summary SET balance = ? WHERE id = 1", [parseFloat(balance) || 0], (err) => {
        if (err) return res.status(500).json({error: err.message});
        res.json({ success: true, balance });
    });
});

// GET /api/transactions
app.get('/api/transactions', (req, res) => {
    db.all("SELECT * FROM transactions ORDER BY date DESC", (err, rows) => {
        if (err) return res.status(500).json({error: err.message});
        res.json(rows);
    });
});

// POST /api/transactions
// Create a new transaction
app.post('/api/transactions', (req, res) => {
    const { merchant, date, category, amount, type, notes, isRecurring, frequency, nextDate } = req.body;
    const txn_id = 'txn-' + Date.now();
    
    // Insert into db
    db.run("INSERT INTO transactions (txn_id, date, merchant, category, amount, type, notes) VALUES (?, ?, ?, ?, ?, ?, ?)",
        [txn_id, date, merchant, category, amount, type, notes], function(err) {
        if (err) return res.status(500).json({error: err.message});
        
        // Setup recurring if applicable
        if (isRecurring) {
            db.run("INSERT INTO recurring_subscriptions (merchant, category, amount, type, frequency, next_date) VALUES (?, ?, ?, ?, ?, ?)", 
                [merchant, category, amount, type, frequency, nextDate]);
        }
        
        // Update summary balance
        db.get("SELECT balance, safeToSpend FROM summary WHERE id = 1", (err, row) => {
            if (!row) return res.status(500).json({error: "Summary missing"});
            const newBalance = row.balance + amount;
            const newSafe = type === 'expense' ? Math.max(0, row.safeToSpend + amount) : row.safeToSpend;
            
            db.run("UPDATE summary SET balance = ?, safeToSpend = ? WHERE id = 1", [newBalance, newSafe], (err) => {
                if (err) return res.status(500).json({error: err.message});
                res.json({ success: true, txn_id });
            });
        });
    });
});

// DELETE /api/transactions (Clear All)
app.delete('/api/transactions', (req, res) => {
    db.run("DELETE FROM transactions", (err) => {
        if (err) return res.status(500).json({error: err.message});
        
        db.run("DELETE FROM recurring_subscriptions", (err) => {
            db.run("UPDATE summary SET balance = 0, safeToSpend = 0 WHERE id = 1", (err) => {
                if (err) return res.status(500).json({error: err.message});
                res.json({ success: true });
            });
        });
    });
});

// DELETE /api/transactions/:txn_id
app.delete('/api/transactions/:txn_id', (req, res) => {
    const txn_id = req.params.txn_id;
    
    // Find amount to restore balance
    db.get("SELECT amount, type FROM transactions WHERE txn_id = ?", [txn_id], (err, txn) => {
        if (err || !txn) return res.status(404).json({error: "Transaction not found"});
        
        db.run("DELETE FROM transactions WHERE txn_id = ?", [txn_id], (err) => {
            if (err) return res.status(500).json({error: err.message});
            
            db.get("SELECT balance, safeToSpend FROM summary WHERE id = 1", (err, row) => {
                if (!row) return res.status(500).json({error: "Summary missing"});
                
                // We reverse the transaction (if it was an expense, it was negative, so removing it adds to balance)
                const newBalance = row.balance - txn.amount;
                const newSafe = txn.type === 'expense' ? row.safeToSpend - txn.amount : row.safeToSpend;
                
                db.run("UPDATE summary SET balance = ?, safeToSpend = ? WHERE id = 1", [newBalance, newSafe], (err) => {
                    res.json({ success: true });
                });
            });
        });
    });
});

// PUT /api/transactions/:txn_id
app.put('/api/transactions/:txn_id', (req, res) => {
    const txn_id = req.params.txn_id;
    const { merchant, date, category, amount, type, notes } = req.body;
    
    // Get old amount to correct balance
    db.get("SELECT amount, type FROM transactions WHERE txn_id = ?", [txn_id], (err, oldTxn) => {
        if (err || !oldTxn) return res.status(404).json({error: "Transaction not found"});
        
        const diff = amount - oldTxn.amount;
        
        db.run("UPDATE transactions SET date=?, merchant=?, category=?, amount=?, type=?, notes=? WHERE txn_id=?", 
            [date, merchant, category, amount, type, notes, txn_id], (err) => {
            if (err) return res.status(500).json({error: err.message});
            
            db.get("SELECT balance, safeToSpend FROM summary WHERE id = 1", (err, row) => {
                if (!row) return res.status(500).json({error: "Summary missing"});
                
                const newBalance = row.balance + diff;
                let newSafe = row.safeToSpend;
                if (oldTxn.type === 'expense' && type === 'expense') newSafe += diff;
                else if (type === 'expense') newSafe += amount; // Transitioned from income
                else if (oldTxn.type === 'expense') newSafe -= oldTxn.amount; // Transitioned to income
                
                db.run("UPDATE summary SET balance = ?, safeToSpend = ? WHERE id = 1", [newBalance, Math.max(0, newSafe)], (err) => {
                    res.json({ success: true });
                });
            });
        });
    });
});


// GET /api/subscriptions
app.get('/api/subscriptions', (req, res) => {
    db.all("SELECT * FROM recurring_subscriptions ORDER BY next_date ASC", (err, rows) => {
        if (err) return res.status(500).json({error: err.message});
        res.json(rows);
    });
});

// DELETE /api/subscriptions/:id
app.delete('/api/subscriptions/:id', (req, res) => {
    db.run("DELETE FROM recurring_subscriptions WHERE id = ?", [req.params.id], (err) => {
        if (err) return res.status(500).json({error: err.message});
        res.json({ success: true });
    });
});

// PUT /api/subscriptions/:id
app.put('/api/subscriptions/:id', (req, res) => {
    const { amount, frequency, nextDate } = req.body;
    // For simplicity, just allow modifying amount, frequency, and nextDate
    db.run("UPDATE recurring_subscriptions SET amount = ?, frequency = ?, next_date = ? WHERE id = ?", 
        [amount, frequency, nextDate, req.params.id], (err) => {
        if (err) return res.status(500).json({error: err.message});
        res.json({ success: true });
    });
});

// POST /api/signup
app.post('/api/signup', (req, res) => {
    const { name, email, password } = req.body;
    db.run("INSERT INTO users (name, email, password) VALUES (?, ?, ?)", [name, email, password], function(err) {
        if (err) {
            if (err.message.includes('UNIQUE constraint failed')) {
                return res.status(400).json({error: "Email already exists"});
            }
            return res.status(500).json({error: err.message});
        }
        res.json({ success: true, user: { id: this.lastID, name, email } });
    });
});

// POST /api/login
app.post('/api/login', (req, res) => {
    const { email, password } = req.body;
    db.get("SELECT id, name, email FROM users WHERE email = ? AND password = ?", [email, password], (err, row) => {
        if (err) return res.status(500).json({error: err.message});
        if (!row) return res.status(401).json({error: "Invalid email or password"});
        res.json({ success: true, user: row });
    });
});

// GET /api/ml-insights
app.get('/api/ml-insights', (req, res) => {
    exec('python ml_insights.py', (error, stdout, stderr) => {
        try {
            // we expect the python script to print the json and exit
            const jsonStr = stdout.trim().split('\n').pop(); // In case there are warnings printed before the dict
            const data = JSON.parse(jsonStr);
            res.json(data);
        } catch (e) {
            console.error("ML Script Error:", stderr || stdout, e);
            res.status(500).json({ error: 'Failed to process ML data', details: e.message });
        }
    });
});

// ─── Credit Cards API ───
app.get('/api/credit-cards', (req, res) => {
    db.all("SELECT * FROM credit_cards ORDER BY id ASC", (err, rows) => {
        if (err) return res.status(500).json({error: err.message});
        res.json(rows || []);
    });
});

app.post('/api/credit-cards', (req, res) => {
    const { card_number, cvv, total_limit, used_limit, access_limit, card_name } = req.body;
    db.run("INSERT INTO credit_cards (card_number, cvv, total_limit, used_limit, access_limit, card_name) VALUES (?, ?, ?, ?, ?, ?)",
        [card_number, cvv, total_limit || 0, used_limit || 0, access_limit || 0, card_name || 'My Card'], function(err) {
        if (err) return res.status(500).json({error: err.message});
        res.json({ success: true, id: this.lastID });
    });
});

app.put('/api/credit-cards/:id', (req, res) => {
    const { card_number, cvv, total_limit, used_limit, access_limit, card_name } = req.body;
    db.run("UPDATE credit_cards SET card_number=?, cvv=?, total_limit=?, used_limit=?, access_limit=?, card_name=? WHERE id=?",
        [card_number, cvv, total_limit, used_limit, access_limit, card_name, req.params.id], (err) => {
        if (err) return res.status(500).json({error: err.message});
        res.json({ success: true });
    });
});

app.delete('/api/credit-cards/:id', (req, res) => {
    db.run("DELETE FROM credit_cards WHERE id = ?", [req.params.id], (err) => {
        if (err) return res.status(500).json({error: err.message});
        res.json({ success: true });
    });
});

// ─── Loans API ───
app.get('/api/loans', (req, res) => {
    db.all("SELECT * FROM loans ORDER BY id ASC", (err, rows) => {
        if (err) return res.status(500).json({error: err.message});
        res.json(rows || []);
    });
});

app.post('/api/loans', (req, res) => {
    const { loan_type, total_amount, monthly_emi, months_remaining, loan_name } = req.body;
    db.run("INSERT INTO loans (loan_type, total_amount, monthly_emi, months_remaining, loan_name) VALUES (?, ?, ?, ?, ?)",
        [loan_type, total_amount || 0, monthly_emi || 0, months_remaining || 0, loan_name || 'My Loan'], function(err) {
        if (err) return res.status(500).json({error: err.message});
        res.json({ success: true, id: this.lastID });
    });
});

app.put('/api/loans/:id', (req, res) => {
    const { loan_type, total_amount, monthly_emi, months_remaining, loan_name } = req.body;
    db.run("UPDATE loans SET loan_type=?, total_amount=?, monthly_emi=?, months_remaining=?, loan_name=? WHERE id=?",
        [loan_type, total_amount, monthly_emi, months_remaining, loan_name, req.params.id], (err) => {
        if (err) return res.status(500).json({error: err.message});
        res.json({ success: true });
    });
});

app.delete('/api/loans/:id', (req, res) => {
    db.run("DELETE FROM loans WHERE id = ?", [req.params.id], (err) => {
        if (err) return res.status(500).json({error: err.message});
        res.json({ success: true });
    });
});

// ─── User Settings API ───
app.get('/api/settings/:email', (req, res) => {
    db.get("SELECT * FROM user_settings WHERE email = ?", [req.params.email], (err, row) => {
        if (err) return res.status(500).json({error: err.message});
        res.json(row || { monthly_budget: 5000, daily_limit: 0, savings_goal_pct: 5 });
    });
});

app.put('/api/settings/:email', (req, res) => {
    const { monthly_budget, daily_limit, savings_goal_pct } = req.body;
    const email = req.params.email;
    db.get("SELECT * FROM user_settings WHERE email = ?", [email], (err, row) => {
        if (row) {
            const mb = monthly_budget !== undefined ? monthly_budget : row.monthly_budget;
            const dl = daily_limit !== undefined ? daily_limit : row.daily_limit;
            const sg = savings_goal_pct !== undefined ? savings_goal_pct : row.savings_goal_pct;
            db.run("UPDATE user_settings SET monthly_budget=?, daily_limit=?, savings_goal_pct=? WHERE email=?",
                [mb, dl, sg, email], (err) => {
                if (err) return res.status(500).json({error: err.message});
                res.json({ success: true });
            });
        } else {
            db.run("INSERT INTO user_settings (email, monthly_budget, daily_limit, savings_goal_pct) VALUES (?, ?, ?, ?)",
                [email, monthly_budget || 5000, daily_limit || 0, savings_goal_pct || 5], (err) => {
                if (err) return res.status(500).json({error: err.message});
                res.json({ success: true });
            });
        }
    });
});

// Fallback to dashboard
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Start Server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}/`);
});
