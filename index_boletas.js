// index_boletas.js
const express = require("express");
const cors = require("cors");
const pool = require("./db");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT_BOLETAS || 4006;

app.use(express.json());
app.use(cors());

// ============================
// CREAR TABLA BOLETA SI NO EXISTE
// ============================
(async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS boleta (
        id SERIAL PRIMARY KEY,
        numero_compra SERIAL UNIQUE,
        fecha TIMESTAMP,
        comprador JSONB,
        productos JSONB,
        total NUMERIC,
        user_id INT
      );
    `);

    console.log("Tabla 'boleta' verificada/creada con numero_compra SERIAL.");
  } catch (err) {
    console.error("Error creando/verificando tabla boleta:", err.stack || err);
  }
})();

// ============================
// RUTAS
// ============================

// Obtener boleta por número de compra
app.get("/boletas/numero/:numero", async (req, res) => {
  try {
    const num = Number(req.params.numero);

    const result = await pool.query(
      "SELECT * FROM boleta WHERE numero_compra=$1",
      [Number.isNaN(num) ? req.params.numero : num]
    );

    if (result.rows.length === 0)
      return res.status(404).json({ message: "Boleta no encontrada" });

    const boleta = result.rows[0];
    boleta.total = Number(boleta.total) || 0;

    res.json(boleta);
  } catch (error) {
    console.error("Error GET /boletas/numero/:numero", error.stack || error);
    res.status(500).json({ error: "Error al obtener boleta" });
  }
});

// Obtener boletas por usuario
app.get("/boletas/:userId", async (req, res) => {
  try {
    const id = Number(req.params.userId);

    const result = await pool.query(
      "SELECT * FROM boleta WHERE user_id=$1 ORDER BY fecha DESC",
      [Number.isNaN(id) ? req.params.userId : id]
    );

    const rows = result.rows.map(r => ({
      ...r,
      total: Number(r.total) || 0,
      numero_compra: r.numero_compra
    }));

    res.json(rows);
  } catch (error) {
    console.error("Error GET /boletas/:userId", error.stack || error);
    res.status(500).json({ error: "Error al obtener boletas del usuario" });
  }
});

// Obtener todas las boletas
app.get("/boletas", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM boleta ORDER BY fecha DESC"
    );

    const rows = result.rows.map(r => ({
      ...r,
      total: Number(r.total) || 0,
      numero_compra: r.numero_compra
    }));

    res.json(rows);
  } catch (error) {
    console.error("Error GET /boletas", error.stack || error);
    res.status(500).json({ error: "Error al obtener todas las boletas" });
  }
});

// Crear nueva boleta
app.post("/boletas", async (req, res) => {
  try {
    console.log("POST /boletas body:", req.body);

    let { fecha, comprador, productos, total, user_id } = req.body;

    // Intentar parseo si llegan strings
    if (typeof comprador === "string") {
      try {
        comprador = JSON.parse(comprador);
      } catch (e) {
        return res.status(400).json({ message: "comprador debe ser JSON válido" });
      }
    }
    if (typeof productos === "string") {
      try {
        productos = JSON.parse(productos);
      } catch (e) {
        return res.status(400).json({ message: "productos debe ser JSON válido" });
      }
    }

    // Validaciones
    if (!productos || !Array.isArray(productos) || productos.length === 0) {
      return res.status(400).json({ message: "Productos requeridos (array no vacío)" });
    }
    if (!comprador || typeof comprador !== "object" || !comprador.nombre || !comprador.correo) {
      return res.status(400).json({ message: "Datos del comprador requeridos (nombre y correo)" });
    }

    const fechaVal = fecha ? new Date(fecha) : new Date();
    const totalNum = total !== undefined ? Number(total) : 0;
    const uid = user_id !== undefined && user_id !== null ? (Number(user_id) || null) : null;

    const compradorJson = JSON.stringify(comprador);
    const productosJson = JSON.stringify(productos);

    const query = `
      INSERT INTO boleta (fecha, comprador, productos, total, user_id)
      VALUES ($1, $2::jsonb, $3::jsonb, $4, $5)
      RETURNING *;
    `;

    const params = [fechaVal, compradorJson, productosJson, totalNum, uid];

    const result = await pool.query(query, params);

    const boleta = result.rows[0];
    boleta.total = Number(boleta.total) || 0;

    res.status(201).json(boleta);
  } catch (error) {
    console.error("ERROR DETALLADO POST /boletas:", error.stack || error);

    if (error.code === "22P02") {
      return res.status(400).json({
        error: "JSON inválido para comprador o productos",
        code: error.code,
        detail: error.message
      });
    }

    res.status(500).json({ error: "Error al crear boleta", message: error.message, code: error.code });
  }
});

// DELETE boletas de un usuario
app.delete("/boletas/:userId", async (req, res) => {
  try {
    const id = Number(req.params.userId);
    await pool.query(
      "DELETE FROM boleta WHERE user_id=$1",
      [Number.isNaN(id) ? req.params.userId : id]
    );

    res.json({ ok: true });
  } catch (error) {
    console.error("Error DELETE /boletas/:userId", error.stack || error);
    res.status(500).json({ error: "Error al eliminar boletas" });
  }
});

// Iniciar servidor
app.listen(PORT, "0.0.0.0", () =>
  console.log(`Boletas API corriendo en puerto ${PORT}`)
);
