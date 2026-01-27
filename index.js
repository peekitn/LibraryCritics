const express = require("express");
const axios = require("axios");
const db = require("./db/db");
const session = require("express-session");
const nodemailer = require("nodemailer");
require("dotenv").config();

const app = express();

app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));
app.set("view engine", "ejs");

// SESSÃO
app.use(session({
  secret: "biblioteca_secreta_123",
  resave: false,
  saveUninitialized: false
}));

app.use((req, res, next) => {
  res.locals.user = req.session.user; // deixa disponível em todos os templates
  next();
});


// Middleware para proteger rotas
function authMiddleware(req, res, next) {
  if (!req.session.user) return res.redirect("/login");
  next();
}

// ----------------- Nodemailer -----------------
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// ----------------- LOGIN/LOGOUT -----------------
app.get("/login", (req, res) => {
  res.render("login", { error: null });
});

app.post("/login", async (req, res) => {
  const { username, password } = req.body;
  try {
    const result = await db.query(
      "SELECT * FROM users WHERE username=$1 AND password=$2",
      [username, password]
    );
    if (result.rows.length === 0) return res.render("login", { error: "Usuário ou senha incorretos" });
    req.session.user = result.rows[0];
    res.redirect("/");
  } catch (err) {
    console.error(err);
    res.render("login", { error: "Erro ao processar login" });
  }
});

app.get("/logout", (req, res) => {
  req.session.destroy(() => {
    res.redirect("/login");
  });
});

// ----------------- REGISTRO -----------------
const verificationCodes = {}; // memória temporária

app.get("/register", (req, res) => {
  res.render("register", { error: null });
});

app.post("/register", async (req, res) => {
  const { username, email, password } = req.body;

  try {
    const exists = await db.query(
      "SELECT * FROM users WHERE username=$1 OR email=$2",
      [username, email]
    );
    if (exists.rows.length > 0) return res.render("register", { error: "Usuário ou e-mail já cadastrado" });

    // gerar código de 6 dígitos
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    verificationCodes[email] = code;

    // enviar e-mail real
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: email,
      subject: "Código de verificação - Minha Biblioteca",
      text: `Olá ${username}, seu código de verificação é: ${code}`
    });

    res.render("verify", { username, email, password, error: null, codeForTest: null });

  } catch (err) {
    console.error(err);
    res.render("register", { error: "Erro ao processar registro" });
  }
});

app.post("/verify", async (req, res) => {
  const { username, email, password, code } = req.body;

  if (!verificationCodes[email] || verificationCodes[email] !== code) {
    return res.render("verify", { username, email, password, error: "Código incorreto", codeForTest: null });
  }

  try {
    await db.query(
      "INSERT INTO users (username, email, password) VALUES ($1, $2, $3)",
      [username, email, password]
    );
    delete verificationCodes[email]; // limpa código
    res.redirect("/login");
  } catch (err) {
    console.error(err);
    res.render("verify", { username, email, password, error: "Erro ao criar conta", codeForTest: null });
  }
});

// ----------------- ROTAS PRINCIPAIS (CRUD + Dashboard) -----------------
app.get("/", authMiddleware, async (req, res) => {
  const sort = req.query.sort || "date_read";
  const search = req.query.search || "";
  const allowed = ["title", "rating", "date_read"];
  const order = allowed.includes(sort) ? sort : "date_read";

  try {
    const result = await db.query(
      `SELECT * FROM books
       WHERE title ILIKE $1 OR author ILIKE $1
       ORDER BY ${order} DESC NULLS LAST`,
      [`%${search}%`]
    );
    res.render("index", { books: result.rows, search });
  } catch (err) {
    console.error(err);
    res.send("Erro ao carregar livros");
  }
});

app.get("/new", authMiddleware, (req, res) => res.render("new"));

app.post("/add", authMiddleware, async (req, res) => {
  const { title, author, rating, notes, date_read, tags, cover_url } = req.body;
  const safeDate = date_read === "" ? null : date_read;
  let finalCover = cover_url || "";

  if (!finalCover) {
    try {
      const response = await axios.get(
        `https://openlibrary.org/search.json?title=${encodeURIComponent(title)}&author=${encodeURIComponent(author)}`,
        { timeout: 4000 }
      );
      const book = response.data.docs.find(b => b.cover_i);
      if (book) finalCover = `https://covers.openlibrary.org/b/id/${book.cover_i}-L.jpg`;
    } catch { console.log("API falhou, continuando sem capa."); }
  }

  try {
    await db.query(
      "INSERT INTO books (title, author, rating, notes, date_read, cover_url, tags) VALUES ($1,$2,$3,$4,$5,$6,$7)",
      [title, author, rating || null, notes, safeDate, finalCover, tags]
    );
    res.redirect("/");
  } catch (err) {
    console.error(err);
    res.send("Erro ao guardar livro");
  }
});

app.get("/edit/:id", authMiddleware, async (req, res) => {
  try {
    const result = await db.query("SELECT * FROM books WHERE id=$1", [req.params.id]);
    if (result.rows.length === 0) return res.send("Livro não encontrado");
    res.render("edit", { book: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.send("Erro ao carregar livro");
  }
});

app.post("/edit/:id", authMiddleware, async (req, res) => {
  const { title, author, rating, notes, date_read, tags, cover_url } = req.body;
  const safeDate = date_read === "" ? null : date_read;
  try {
    await db.query(
      "UPDATE books SET title=$1, author=$2, rating=$3, notes=$4, date_read=$5, tags=$6, cover_url=$7 WHERE id=$8",
      [title, author, rating || null, notes, safeDate, tags, cover_url, req.params.id]
    );
    res.redirect("/");
  } catch (err) {
    console.error(err);
    res.send("Erro ao atualizar livro");
  }
});

app.post("/delete/:id", authMiddleware, async (req, res) => {
  try {
    await db.query("DELETE FROM books WHERE id=$1", [req.params.id]);
    res.redirect("/");
  } catch (err) {
    console.error(err);
    res.send("Erro ao apagar");
  }
});

app.get("/dashboard", authMiddleware, async (req, res) => {
  try {
    const selectedYear = req.query.year || new Date().getFullYear();
    const yearsResult = await db.query(`
      SELECT DISTINCT EXTRACT(YEAR FROM date_read) AS year
      FROM books
      WHERE date_read IS NOT NULL
      ORDER BY year DESC
    `);
    const booksPerMonth = await db.query(`
      SELECT EXTRACT(MONTH FROM date_read) AS month_number,
             TO_CHAR(date_read, 'Mon') AS month,
             COUNT(*) AS total
      FROM books
      WHERE date_read IS NOT NULL
        AND EXTRACT(YEAR FROM date_read) = $1
      GROUP BY month_number, month
      ORDER BY month_number
    `, [selectedYear]);
    const totalYear = booksPerMonth.rows.reduce((sum, m) => sum + Number(m.total), 0);
    const avgPerMonth = (totalYear / 12).toFixed(1);
    const bestMonth = booksPerMonth.rows.reduce((best, current) => {
      return Number(current.total) > Number(best.total) ? current : best;
    }, booksPerMonth.rows[0] || { month: "-", total: 0 });

    res.render("dashboard", {
      chartData: booksPerMonth.rows,
      years: yearsResult.rows,
      selectedYear,
      totalYear,
      avgPerMonth,
      bestMonth
    });

  } catch (err) {
    console.error(err);
    res.send("Erro no wrapped");
  }
});

app.listen(3000, () => {
  console.log("Servidor em http://localhost:3000");
});
