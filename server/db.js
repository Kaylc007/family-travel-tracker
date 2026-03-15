import "dotenv/config";
import pkg from "pg";
const { Pool } = pkg;

// Create a PostgreSQL connection pool using the database URL from the environment variables.
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl:
    process.env.NODE_ENV === "production"
      ? { rejectUnauthorized: false }
      : false
});

// Helper function to run database queries.
export async function query(sql, params) {
  const res = await pool.query(sql, params);
  return res.rows;
}


