import "dotenv/config";
import pkg from "pg";
const { Pool } = pkg;



console.log("DATABASE_URL from env:", process.env.DATABASE_URL); // 👈 add this


const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: false
});

console.log("Starting DB test...");

try {
  const { rows } = await pool.query(`
    SELECT 
      (SELECT COUNT(*)::int FROM users) AS users,
      (SELECT COUNT(*)::int FROM countries) AS countries,
      (SELECT COUNT(*)::int FROM visited_countries) AS visits
  `);

  console.log("Query result:", rows[0]);
} catch (e) {
  console.error("DB ERROR:", e);
} finally {
  await pool.end();
  console.log("Done.");
}
