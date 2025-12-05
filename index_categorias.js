// index_categorias.js
const express = require("express");
const cors = require("cors");
const pool = require("./db");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT_CATEGORIAS || 4005;

app.use(express.json());
app.use(cors());

// -----------------------------
// Crear tabla categoría (si no existe) y asegurar índices
// -----------------------------
(async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS categoria (
        id SERIAL PRIMARY KEY,
        nombre VARCHAR(100) UNIQUE NOT NULL
      );
    `);
    console.log("Tabla 'categoria' verificada/creada.");
  } catch (err) {
    console.error("Error creando/verificando tabla categoria:", err.stack || err);
  }
})();

// -----------------------------
// GET /categorias  --> devuelve objetos {id, nombre}
// -----------------------------
app.get("/categorias", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM categoria ORDER BY nombre");
    res.json(result.rows);
  } catch (err) {
    console.error("Error GET /categorias:", err.stack || err);
    res.status(500).json({ message: "Error al obtener categorías" });
  }
});

// -----------------------------
// GET /categorias/nombres  --> devuelve array de strings ["Electrónica", ...]
// -----------------------------
app.get("/categorias/nombres", async (req, res) => {
  try {
    const result = await pool.query("SELECT nombre FROM categoria ORDER BY nombre");
    const nombres = result.rows.map(r => r.nombre);
    res.json(nombres);
  } catch (err) {
    console.error("Error GET /categorias/nombres:", err.stack || err);
    res.status(500).json({ message: "Error al obtener nombres de categorías" });
  }
});

// -----------------------------
// POST /categorias  --> crear nueva categoría { nombre }
// -----------------------------
app.post("/categorias", async (req, res) => {
  try {
    const { nombre } = req.body;
    if (!nombre || !String(nombre).trim()) {
      return res.status(400).json({ message: "Nombre de categoría requerido" });
    }
    const result = await pool.query(
      "INSERT INTO categoria (nombre) VALUES ($1) RETURNING *",
      [nombre.trim()]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error("Error POST /categorias:", err.stack || err);
    if (err.code === "23505") return res.status(409).json({ message: "Categoría ya existe" });
    res.status(500).json({ message: "Error creando categoría" });
  }
});

// -----------------------------
// POST /categorias/seed  --> insertar categorías por defecto si faltan
// -----------------------------
app.post("/categorias/seed", async (req, res) => {
  const defaults = ["Electrónica", "Ropa", "Hogar", "Gamer"];
  try {
    for (const nombre of defaults) {
      await pool.query(
        `INSERT INTO categoria (nombre) VALUES ($1) ON CONFLICT (nombre) DO NOTHING;`,
        [nombre]
      );
    }
    const result = await pool.query("SELECT nombre FROM categoria ORDER BY nombre");
    return res.json({ ok: true, categorias: result.rows.map(r => r.nombre) });
  } catch (err) {
    console.error("Error POST /categorias/seed:", err.stack || err);
    res.status(500).json({ message: "Error seeding categorías" });
  }
});

// -----------------------------
// PUT /categorias/:id  --> actualizar nombre { nombre }
// -----------------------------
app.put("/categorias/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { nombre } = req.body;
    if (!nombre || !String(nombre).trim()) {
      return res.status(400).json({ message: "Nombre de categoría requerido" });
    }
    const result = await pool.query(
      "UPDATE categoria SET nombre = $1 WHERE id = $2 RETURNING *",
      [nombre.trim(), id]
    );
    if (result.rows.length === 0) return res.status(404).json({ message: "Categoría no encontrada" });
    res.json(result.rows[0]);
  } catch (err) {
    console.error("Error PUT /categorias/:id:", err.stack || err);
    if (err.code === "23505") return res.status(409).json({ message: "Ya existe otra categoría con ese nombre" });
    res.status(500).json({ message: "Error actualizando categoría" });
  }
});

// -----------------------------
// DELETE /categorias/:id  --> elimina categoría y opcionalmente limpia productos
// -----------------------------
app.delete("/categorias/:id", async (req, res) => {
  try {
    const { id } = req.params;

    // obtener nombre antes de borrar (para limpiar productos si existe)
    const catRes = await pool.query("SELECT nombre FROM categoria WHERE id = $1", [id]);
    if (catRes.rows.length === 0) return res.status(404).json({ message: "Categoría no encontrada" });
    const nombre = catRes.rows[0].nombre;

    // Intentar limpiar productos que referencien esa categoría (si existe tabla producto)
    try {
      await pool.query("UPDATE producto SET categoria = NULL WHERE categoria = $1", [nombre]);
    } catch (e) {
      // Si falla (p. ej. tabla producto no existe), no interrumpimos la eliminación.
      console.warn("No se pudo limpiar productos (posible falta de tabla 'producto'):", e.message);
    }

    await pool.query("DELETE FROM categoria WHERE id = $1", [id]);
    res.json({ ok: true });
  } catch (err) {
    console.error("Error DELETE /categorias/:id:", err.stack || err);
    res.status(500).json({ message: "Error eliminando categoría" });
  }
});

app.listen(PORT, () => console.log(`Categorías API corriendo en puerto ${PORT}`));
