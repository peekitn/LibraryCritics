const bcrypt = require("bcrypt");
const express = require("express");
const axios = require("axios");
const db = require("./db/db");
const session = require("express-session");
const nodemailer = require("nodemailer");
require("dotenv").config();
const multer = require("multer");
const path = require("path");

const app = express();

app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));
app.set("view engine", "ejs");

// ----------------- SESSÃO -----------------
app.use(session({
  secret: "biblioteca_secreta_123",
  resave: false,
  saveUninitialized: false
}));

app.use((req, res, next) => {
  res.locals.user = req.session.user;
  next();
});

function authMiddleware(req, res, next) {
  if (!req.session.user) return res.redirect("/login");
  next();
}

// ----------------- EMAIL -----------------
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// ----------------- UPLOAD -----------------
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "public/uploads"),
  filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});
const upload = multer({ storage });

// ----------------- LOGIN -----------------
app.get("/login", (req, res) => {
  res.render("login", { error: null });
});

app.post("/login", async (req, res) => {
  const { username, password } = req.body;

  const result = await db.query(
    "SELECT * FROM users WHERE username=$1",
    [username]
  );

  if (result.rows.length === 0) {
    return res.render("login", { error: "Usuário ou senha inválidos" });
  }

  const user = result.rows[0];

  const passwordMatch = await bcrypt.compare(password, user.password);

  if (!passwordMatch) {
    return res.render("login", { error: "Usuário ou senha inválidos" });
  }

  req.session.user = user;
  res.redirect("/");
});

app.get("/logout", (req, res) => {
  req.session.destroy(() => res.redirect("/login"));
});

// ----------------- REGISTRO -----------------
const verificationCodes = {};

app.get("/register", (req, res) => {
  res.render("register", { error: null });
});

app.post("/register", async (req, res) => {
  const { username, email, password } = req.body;

  const exists = await db.query(
    "SELECT * FROM users WHERE username=$1 OR email=$2",
    [username, email]
  );

  if (exists.rows.length > 0) {
    return res.render("register", { error: "Usuário ou e-mail já existe" });
  }

  const code = Math.floor(100000 + Math.random() * 900000).toString();
  verificationCodes[email] = code;

  await transporter.sendMail({
    from: process.env.EMAIL_USER,
    to: email,
    subject: "Código de verificação",
    text: `Seu código é: ${code}`
  });

  res.render("verify", { username, email, password, error: null });
});

app.post("/verify", async (req, res) => {
  const { username, email, password, code } = req.body;

  if (verificationCodes[email] !== code) {
    return res.render("verify", { username, email, password, error: "Código inválido" });
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  await db.query(
    "INSERT INTO users (username, email, password) VALUES ($1,$2,$3)",
    [username, email, hashedPassword]
  );

  delete verificationCodes[email];
  res.redirect("/login");
});

// ----------------- HOME -----------------
app.get("/", authMiddleware, async (req, res) => {
  const search = req.query.search || "";

  const books = await db.query(
    `SELECT * FROM books 
     WHERE user_id=$1 AND (title ILIKE $2 OR author ILIKE $2)
     ORDER BY id DESC`,
    [req.session.user.id, `%${search}%`]
  );

  res.render("index", { books: books.rows, search });
});

// ----------------- DASHBOARD -----------------
app.get("/dashboard", authMiddleware, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const currentYear = new Date().getFullYear();
    const selectedYear = parseInt(req.query.year) || currentYear;

    // Anos disponíveis (fallback para ano atual)
    const yearsResult = await db.query(`
      SELECT DISTINCT EXTRACT(YEAR FROM date_read) AS year
      FROM books
      WHERE user_id=$1 AND date_read IS NOT NULL
      ORDER BY year DESC
    `, [userId]);

    const years =
      yearsResult.rows.length > 0
        ? yearsResult.rows
        : [{ year: currentYear }];

    // Livros por mês
    const booksPerMonthResult = await db.query(`
      SELECT 
        EXTRACT(MONTH FROM date_read) AS month_number,
        TO_CHAR(date_read, 'Mon') AS month,
        COUNT(*) AS total
      FROM books
      WHERE user_id=$1
        AND date_read IS NOT NULL
        AND EXTRACT(YEAR FROM date_read) = $2
      GROUP BY month_number, month
      ORDER BY month_number
    `, [userId, selectedYear]);

    const booksPerMonth = booksPerMonthResult.rows || [];

    // Total no ano
    const totalYear = booksPerMonth.reduce(
      (sum, m) => sum + Number(m.total),
      0
    );

    // Média mensal (NUMBER, não string)
    const avgPerMonth =
      totalYear === 0 ? 0 : Number((totalYear / 12).toFixed(1));

    // Melhor mês (safe)
    const bestMonth =
      booksPerMonth.length === 0
        ? { month: "-", total: 0 }
        : booksPerMonth.reduce((best, cur) =>
            Number(cur.total) > Number(best.total) ? cur : best
          );

    // Nota média
    const avgRatingResult = await db.query(`
      SELECT ROUND(AVG(rating),1) AS avg_rating
      FROM books
      WHERE user_id=$1
        AND rating IS NOT NULL
        AND EXTRACT(YEAR FROM date_read) = $2
    `, [userId, selectedYear]);

    const avgRating =
      avgRatingResult.rows[0]?.avg_rating ?? "-";

    // Tags mais lidas
    const tagsResult = await db.query(`
      SELECT tags
      FROM books
      WHERE user_id=$1
        AND tags IS NOT NULL
        AND EXTRACT(YEAR FROM date_read) = $2
    `, [userId, selectedYear]);

    const tagCount = {};
    tagsResult.rows.forEach(row => {
      row.tags.split(",").forEach(tag => {
        const clean = tag.trim().toLowerCase();
        if (!clean) return;
        tagCount[clean] = (tagCount[clean] || 0) + 1;
      });
    });

    const topTag =
      Object.keys(tagCount).length > 0
        ? Object.entries(tagCount).sort((a, b) => b[1] - a[1])[0][0]
        : "-";

    // Comparação com ano anterior
    const prevYearResult = await db.query(`
      SELECT COUNT(*) AS total
      FROM books
      WHERE user_id=$1
        AND date_read IS NOT NULL
        AND EXTRACT(YEAR FROM date_read) = $2
    `, [userId, selectedYear - 1]);

    const prevYearTotal = Number(prevYearResult.rows[0]?.total || 0);

    const diff =
      prevYearTotal === 0
        ? null
        : Math.round(((totalYear - prevYearTotal) / prevYearTotal) * 100);

    // Perfil do leitor (robusto)
    let readerProfile = "📖 Novo leitor";
    if (avgPerMonth >= 3) readerProfile = "🔥 Leitor extremamente consistente";
    else if (avgPerMonth >= 1) readerProfile = "👏 Leitor consistente";
    else if (totalYear > 0) readerProfile = "🚀 Leitor ocasional";

    res.render("dashboard", {
      years,
      selectedYear,
      chartData: booksPerMonth,
      totalYear,
      avgPerMonth,
      bestMonth,
      avgRating,
      topTag,
      diff,
      readerProfile
    });

  } catch (err) {
    console.error("Erro no dashboard:", err);
    res.send("Erro ao carregar dashboard");
  }
});



// ----------------- CRUD -----------------
app.get("/new", authMiddleware, (req, res) => res.render("new"));

app.post("/add", authMiddleware, async (req, res) => {
  const { title, author, rating, notes, date_read, tags, cover_url } = req.body;
  let finalCover = cover_url || "";

  // 🔥 MELHORIA NA BUSCA DE CAPA OPENLIBRARY
  if (!finalCover) {
    try {
      const response = await axios.get(
        `https://openlibrary.org/search.json?title=${encodeURIComponent(title)}&author=${encodeURIComponent(author)}`,
        {
          headers: {
            "User-Agent": "MinhaBibliotecaApp/1.0"
          }
        }
      );

      const book = response.data.docs.find(b => b.cover_i || b.isbn?.length);

      if (book?.cover_i) {
        finalCover = `https://covers.openlibrary.org/b/id/${book.cover_i}-L.jpg`;
      } else if (book?.isbn?.length) {
        finalCover = `https://covers.openlibrary.org/b/isbn/${book.isbn[0]}-L.jpg`;
      }

    } catch (err) {
      console.log("Erro ao buscar capa:", err.message);
    }
  }

  await db.query(
    "INSERT INTO books (user_id,title,author,rating,notes,date_read,cover_url,tags) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)",
    [req.session.user.id, title, author, rating || null, notes, date_read || null, finalCover, tags]
  );

  res.redirect("/");
});

// --------- EDITAR LIVRO ----------
app.get("/edit/:id", authMiddleware, async (req, res) => {
  const result = await db.query(
    "SELECT * FROM books WHERE id=$1 AND user_id=$2",
    [req.params.id, req.session.user.id]
  );

  if (result.rows.length === 0) return res.send("Livro não encontrado");

  res.render("edit", { book: result.rows[0] });
});

app.post("/edit/:id", authMiddleware, async (req, res) => {
  const { title, author, rating, notes, date_read, tags, cover_url } = req.body;

  await db.query(
    `UPDATE books 
     SET title=$1, author=$2, rating=$3, notes=$4, date_read=$5, tags=$6, cover_url=$7 
     WHERE id=$8 AND user_id=$9`,
    [title, author, rating || null, notes, date_read || null, tags, cover_url, req.params.id, req.session.user.id]
  );

  res.redirect("/");
});

// --------- DELETE LIVRO ----------
app.post("/delete/:id", authMiddleware, async (req, res) => {
  await db.query(
    "DELETE FROM books WHERE id=$1 AND user_id=$2",
    [req.params.id, req.session.user.id]
  );
  res.redirect("/");
});

// ----------------- PERFIL -----------------
app.get("/profile", authMiddleware, async (req, res) => {
  const userId = req.session.user.id;

  const user = await db.query(
    "SELECT username,email,bio,avatar FROM users WHERE id=$1",
    [userId]
  );

  const favorites = await db.query(`
    SELECT books.*
    FROM favorite_books
    JOIN books ON books.id = favorite_books.book_id
    WHERE favorite_books.user_id=$1
  `, [userId]);

  const books = await db.query(
    "SELECT * FROM books WHERE user_id=$1",
    [userId]
  );

  res.render("profile", {
    user: user.rows[0],
    favorites: favorites.rows,
    books: books.rows
  });
});

app.post("/profile", authMiddleware, upload.single("avatar"), async (req, res) => {
  const userId = req.session.user.id;
  const { bio } = req.body;

  let avatar = null;
  if (req.file) avatar = `/uploads/${req.file.filename}`;

  if (avatar) {
    await db.query("UPDATE users SET bio=$1, avatar=$2 WHERE id=$3", [bio, avatar, userId]);
  } else {
    await db.query("UPDATE users SET bio=$1 WHERE id=$2", [bio, userId]);
  }

  res.redirect("/profile");
});

app.post("/favorites", authMiddleware, async (req, res) => {
  const userId = req.session.user.id;
  const favorites = Array.isArray(req.body.favorites)
    ? req.body.favorites.slice(0, 5)
    : req.body.favorites ? [req.body.favorites] : [];

  await db.query("DELETE FROM favorite_books WHERE user_id=$1", [userId]);

  for (let bookId of favorites) {
    await db.query(
      "INSERT INTO favorite_books (user_id, book_id) VALUES ($1,$2)",
      [userId, bookId]
    );
  }

  res.redirect("/profile");
});

// ----------------- APAGAR CONTA -----------------
app.post("/delete-account", authMiddleware, async (req, res) => {
  await db.query("DELETE FROM users WHERE id=$1", [req.session.user.id]);
  req.session.destroy(() => res.redirect("/register"));
});

// ----------------- SERVER -----------------
app.listen(3000, () => {
  console.log("Servidor rodando em http://localhost:3000");
});
