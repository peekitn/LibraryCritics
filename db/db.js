const { Pool } = require("pg");
require("dotenv").config();

const pool = new Pool({
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  ssl: {
    rejectUnauthorized: false
  }
});

pool.connect((err, client, release) => {
  if (err) {
    console.error("Erro ao conectar no banco:", err.stack);
  } else {
    console.log("Conectado ao PostgreSQL AWS RDS!");
    release();
  }
});

module.exports = pool;
