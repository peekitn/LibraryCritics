const express = require("express");
const axios = require("axios");
const db = require("./db/db");

const app = express();

app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));
app.set("view engine", "ejs");

// HOME + SEARCH + SORT
app.get("/", async (req, res) => {
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

// FORM NOVO LIVRO
app.get("/new", (req, res) => {
  res.render("new");
});

// ADICIONAR LIVRO
app.post("/add", async (req, res) => {
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
      if (book) {
        finalCover = `https://covers.openlibrary.org/b/id/${book.cover_i}-L.jpg`;
      }
    } catch (err) {
      console.log("API falhou, continuando sem capa.");
    }
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

// FORM EDITAR LIVRO (CORREÇÃO: GET)
app.get("/edit/:id", async (req, res) => {
  try {
    const result = await db.query("SELECT * FROM books WHERE id=$1", [req.params.id]);

    if (result.rows.length === 0) {
      return res.send("Livro não encontrado");
    }

    res.render("edit", { book: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.send("Erro ao carregar livro");
  }
});

// EDITAR LIVRO (POST)
app.post("/edit/:id", async (req, res) => {
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

// APAGAR
app.post("/delete/:id", async (req, res) => {
  try {
    await db.query("DELETE FROM books WHERE id=$1", [req.params.id]);
    res.redirect("/");
  } catch (err) {
    console.error(err);
    res.send("Erro ao apagar");
  }
});

// DASHBOARD - WRAPPED COMPLETO
app.get("/dashboard", async (req, res) => {
  try {
    const selectedYear = req.query.year || new Date().getFullYear();

    const yearsResult = await db.query(`
      SELECT DISTINCT EXTRACT(YEAR FROM date_read) AS year
      FROM books
      WHERE date_read IS NOT NULL
      ORDER BY year DESC
    `);

    const booksPerMonth = await db.query(`
      SELECT 
        EXTRACT(MONTH FROM date_read) AS month_number,
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
