const { Pool } = require('pg');
const { drizzle } = require('drizzle-orm/node-postgres');
const { pgTable, integer, varchar } = require('drizzle-orm/pg-core');

const widgets = pgTable('widgets', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  name: varchar('name', { length: 255 }).notNull(),
});

let pool;
let db;

async function connect() {
  pool = new Pool({
    host: process.env.PGHOST ?? 'localhost',
    port: process.env.PGPORT ?? 5432,
    user: process.env.PGUSER ?? 'drizzle_transact',
    password: process.env.PGPASSWORD ?? 'drizzle_transact',
    database: process.env.PGDATABASE ?? 'drizzle_transact',
  });
  db = drizzle({ client: pool });
  return db;
}

async function createTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS widgets (
      id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      name VARCHAR(255) NOT NULL
    )
  `);
}

async function truncateTables() {
  await pool.query('TRUNCATE widgets RESTART IDENTITY');
}

async function dropTables() {
  await pool.query('DROP TABLE IF EXISTS widgets');
}

async function close() {
  await pool.end();
}

function getDb() {
  return db;
}

module.exports = { connect, createTables, truncateTables, dropTables, close, getDb, widgets };
