const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./database.sqlite', (err) => {
    if (err) {
        console.error('Error opening database', err);
        process.exit(1);
    }
    console.log('Connected to the SQLite database.');
});

db.all("SELECT name FROM sqlite_master WHERE type='table'", [], (err, rows) => {
    if (err) {
        console.error('Error querying tables', err);
    } else {
        console.log('Tables in database:', rows.map(r => r.name));
    }
    db.get("SELECT COUNT(*) as count FROM transactions", (err, row) => {
        if (err) {
            console.error('Error counting transactions', err);
        } else {
            console.log('Number of transactions:', row ? row.count : 0);
        }
        db.close();
    });
});
