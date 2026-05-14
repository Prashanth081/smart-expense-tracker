const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./database.sqlite');

db.serialize(() => {
    // Delete data for August (08), September (09), and October (10)
    // We match dates like 'YYYY-08-', 'YYYY-09-', 'YYYY-10-'
    db.run("DELETE FROM transactions WHERE date LIKE '%-08-%' OR date LIKE '%-09-%' OR date LIKE '%-10-%'", function(err) {
        if (err) {
            console.error("Error deleting:", err);
        } else {
            console.log(`Deleted ${this.changes} rows for Aug, Sep, Oct.`);
        }
        db.close();
    });
});
