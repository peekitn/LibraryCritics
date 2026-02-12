const { Pool } = require("pg");
require("dotenv").config();

const pool = new Pool({
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT) || 5432, // garante que seja número
  database: process.env.DB_NAME,
  ssl: {
    rejectUnauthorized: false // importante para alguns bancos na nuvem
  }
});

module.exports = pool;
