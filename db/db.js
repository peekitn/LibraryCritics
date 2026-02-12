const { Pool } = require("pg");
require("dotenv").config();

// Configuração do pool de conexões com PostgreSQL
const pool = new Pool({
  user: process.env.DB_USER,                   // usuário do banco
  password: process.env.DB_PASSWORD,           // senha do banco
  host: process.env.DB_HOST,                   // host do banco
  port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 5432, // garante número
  database: process.env.DB_NAME,               // nome do banco
  ssl: process.env.DB_SSL === "true" ? { rejectUnauthorized: false } : false
  // DB_SSL=true no Railway ativa SSL
});

// Testa a conexão automaticamente (opcional)
pool.connect()
  .then(() => console.log("Conectado ao PostgreSQL com sucesso!"))
  .catch(err => console.error("Erro ao conectar ao PostgreSQL:", err));

module.exports = pool;
