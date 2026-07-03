const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, '..', 'glossahub.db');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database:', err);
    process.exit(1);
  }
  console.log('Connected to SQLite database.');
});

db.serialize(() => {
  db.all('SELECT * FROM glossary_tables', [], (err, tables) => {
    if (err) {
      console.error('Error reading glossary_tables:', err);
      return;
    }
    console.log('\n--- Glossary Tables ---');
    console.log(`Total tables: ${tables.length}`);
    tables.forEach(t => {
      console.log(`ID: ${t.id} | Name: ${t.table_name}`);
    });

    if (tables.length > 0) {
      db.all('SELECT count(*) as count, table_id FROM glossary_terms GROUP BY table_id', [], (err, counts) => {
        if (err) {
          console.error('Error counting glossary_terms:', err);
          return;
        }
        console.log('\n--- Term Counts per Table ---');
        counts.forEach(c => {
          console.log(`Table ID: ${c.table_id} | Terms Count: ${c.count}`);
        });

        // Also print first 5 terms of the last table
        const lastTableId = tables[tables.length - 1].id;
        db.all('SELECT * FROM glossary_terms WHERE table_id = ? LIMIT 5', [lastTableId], (err, terms) => {
          if (err) {
            console.error('Error reading glossary_terms:', err);
            return;
          }
          console.log(`\n--- First 5 terms in Table [${tables[tables.length - 1].table_name}] ---`);
          terms.forEach(t => {
            console.log(`CN: ${t.cn_term} | EN: ${t.en_term} | Desc: ${t.description}`);
          });
          db.close();
        });
      });
    } else {
      db.close();
    }
  });
});
