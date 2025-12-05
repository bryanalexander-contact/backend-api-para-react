// index_productos.js (mejorado)
const express = require("express");
const cors = require("cors");
const pool = require("./db");
require("dotenv").config();
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT_PRODUCTOS || 4003;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// -----------------------------
// MULTER (guardar en disk/uploads)
// -----------------------------
const uploadDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || "";
    cb(null, `${Date.now()}-${file.originalname.replace(/\s+/g, "_")}${ext}`);
  },
});
const upload = multer({ storage });

// Servir archivos estáticos (imágenes)
app.use("/uploads", express.static(uploadDir));


// -----------------------------
// Crear tabla producto (si no existe) + asegurar columnas
// -----------------------------
(async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS producto (
        id SERIAL PRIMARY KEY
      );
    `);

    // Aseguramos columnas (incluye "codigo")
    await pool.query(`ALTER TABLE producto ADD COLUMN IF NOT EXISTS codigo VARCHAR(100);`);
    await pool.query(`ALTER TABLE producto ADD COLUMN IF NOT EXISTS nombre VARCHAR(200);`);
    await pool.query(`ALTER TABLE producto ADD COLUMN IF NOT EXISTS descripcion TEXT;`);
    await pool.query(`ALTER TABLE producto ADD COLUMN IF NOT EXISTS categoria VARCHAR(100);`);
    await pool.query(`ALTER TABLE producto ADD COLUMN IF NOT EXISTS precio NUMERIC DEFAULT 0;`);
    await pool.query(`ALTER TABLE producto ADD COLUMN IF NOT EXISTS precio_oferta NUMERIC;`);
    await pool.query(`ALTER TABLE producto ADD COLUMN IF NOT EXISTS en_oferta BOOLEAN DEFAULT FALSE;`);
    await pool.query(`ALTER TABLE producto ADD COLUMN IF NOT EXISTS stock INTEGER DEFAULT 0;`);
    await pool.query(`ALTER TABLE producto ADD COLUMN IF NOT EXISTS stock_critico INTEGER DEFAULT 0;`);
    await pool.query(`ALTER TABLE producto ADD COLUMN IF NOT EXISTS imagen_url TEXT;`);

    console.log("Tabla 'producto' verificada/actualizada.");
  } catch (err) {
    console.error("Error creando/verificando tabla producto:", err);
  }
})();


// -----------------------------
// GET /productos
// -----------------------------
app.get("/productos", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM producto ORDER BY id");
    res.json(result.rows);
  } catch (err) {
    console.error("Error GET /productos:", err.stack || err);
    res.status(500).json({ message: "Error al obtener productos", error: err.message });
  }
});

// -----------------------------
// GET /productos/categoria/:cat
// -----------------------------
app.get("/productos/categoria/:cat", async (req, res) => {
  try {
    const { cat } = req.params;
    const result = await pool.query("SELECT * FROM producto WHERE categoria = $1", [cat]);
    res.json(result.rows);
  } catch (err) {
    console.error("Error GET /productos/categoria/:cat", err.stack || err);
    res.status(500).json({ message: "Error al obtener productos por categoría", error: err.message });
  }
});

// -----------------------------
// GET /productos/:id
// -----------------------------
app.get("/productos/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query("SELECT * FROM producto WHERE id = $1", [id]);
    if (result.rows.length === 0) return res.status(404).json({ message: "No encontrado" });
    res.json(result.rows[0]);
  } catch (err) {
    console.error("Error GET /productos/:id", err.stack || err);
    res.status(500).json({ message: "Error al obtener producto", error: err.message });
  }
});

// -----------------------------
// POST /productos (archivo o URL)
// -----------------------------
app.post("/productos", upload.single("imagen"), async (req, res) => {
  try {
    const {
      codigo,
      nombre,
      descripcion,
      categoria,
      precio,
      precio_oferta,
      en_oferta,
      stock,
      stock_critico,
    } = req.body;

    const precioNum = precio ? Number(precio) : 0;
    const precioOfertaNum = precio_oferta ? Number(precio_oferta) : null;
    const stockNum = stock ? Number(stock) : 0;
    const stockCriticoNum = stock_critico ? Number(stock_critico) : 0;
    const enOfertaBool =
      en_oferta === "true" || en_oferta === true || en_oferta === 1 || en_oferta === "1";

    const imagen_url = req.file ? `/uploads/${req.file.filename}` : req.body.imagen || null;

    const result = await pool.query(
      `INSERT INTO producto
      (codigo, nombre, descripcion, categoria, precio, precio_oferta, en_oferta, stock, stock_critico, imagen_url)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *;`,
      [
        codigo || null,
        nombre || null,
        descripcion || null,
        categoria || null,
        precioNum,
        precioOfertaNum,
        enOfertaBool,
        stockNum,
        stockCriticoNum,
        imagen_url,
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error("Error POST /productos:", err.stack || err);
    res.status(500).json({ message: "Error creando producto", error: err.message });
  }
});

// -----------------------------
// PUT /productos/:id
// -----------------------------
app.put("/productos/:id", upload.single("imagen"), async (req, res) => {
  try {
    const { id } = req.params;
    const campos = { ...req.body };

    if (campos.precio) campos.precio = Number(campos.precio);
    if (campos.precio_oferta) campos.precio_oferta = Number(campos.precio_oferta);
    if (campos.stock) campos.stock = Number(campos.stock);
    if (campos.stock_critico) campos.stock_critico = Number(campos.stock_critico);
    if (campos.en_oferta !== undefined)
      campos.en_oferta = campos.en_oferta === "true" || campos.en_oferta === true;

    if (req.file) {
      campos.imagen_url = `/uploads/${req.file.filename}`;
    } else if (campos.imagen) {
      campos.imagen_url = campos.imagen;
      delete campos.imagen;
    }

    const keys = Object.keys(campos);
    if (keys.length === 0)
      return res.status(400).json({ message: "No hay campos para actualizar" });

    const sets = keys.map((k, i) => `${k} = $${i + 1}`).join(", ");
    const values = keys.map((k) => campos[k]);

    const result = await pool.query(
      `UPDATE producto SET ${sets} WHERE id = $${values.length + 1} RETURNING *;`,
      [...values, id]
    );

    if (result.rows.length === 0)
      return res.status(404).json({ message: "No encontrado" });

    res.json(result.rows[0]);
  } catch (err) {
    console.error("Error PUT /productos/:id", err.stack || err);
    res.status(500).json({ message: "Error actualizando producto", error: err.message });
  }
});

// -----------------------------
// DELETE /productos/:id
// -----------------------------
app.delete("/productos/:id", async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query("DELETE FROM producto WHERE id=$1", [id]);
    res.json({ ok: true });
  } catch (err) {
    console.error("Error DELETE /productos/:id", err.stack || err);
    res.status(500).json({ message: "Error eliminando producto", error: err.message });
  }
});

// -----------------------------
// START
// -----------------------------
app.listen(PORT, () => console.log(`Productos API corriendo en puerto ${PORT}`));
