const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./database.sqlite');

db.serialize(() => {
    db.run("DELETE FROM transactions WHERE rowid NOT IN (SELECT MIN(rowid) FROM transactions GROUP BY date, merchant, amount, type)", (err) => {
        if (err) console.error(err);
        else console.log("Cleaned up duplicate transactions.");
        db.close();
    });
});
