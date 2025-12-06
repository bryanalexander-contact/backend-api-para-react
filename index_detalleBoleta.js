// index_detalleBoleta.js
const express = require("express");
const cors = require("cors");
const pool = require("./db"); // mismo pool
require("dotenv").config();

const app = express();
const PORT = process.env.PORT_DETALLE_BOLETA || 4004;

app.use(express.json());
app.use(cors());

// ============================
// CREAR TABLA BOLETA SI NO EXISTE (MISMA QUE LA OTRA API)
// ============================
(async () => {
  try {
    await pool.query(`CREATE SEQUENCE IF NOT EXISTS seq_numero_compra START 1;`);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS boleta (
        id SERIAL PRIMARY KEY,
        numero_compra BIGINT UNIQUE DEFAULT nextval('seq_numero_compra'),
        fecha TIMESTAMP,
        comprador JSONB,
        productos JSONB,
        total NUMERIC,
        user_id INT
      );
    `);

    console.log("Tabla 'boleta' verificada/creada para DetalleBoleta API.");
  } catch (err) {
    console.error("Error asegurando tabla boleta en DetalleBoleta API:", err.stack || err);
  }
})();

// ============================
// OBTENER DETALLE POR NUMERO_COMPRA
// ============================
app.get("/detalle/:numeroCompra", async (req, res) => {
  try {
    const { numeroCompra } = req.params;

    // Permite string o número (igual que la otra API)
    const num = Number(numeroCompra);

    const result = await pool.query(
      "SELECT * FROM boleta WHERE numero_compra=$1",
      [Number.isNaN(num) ? numeroCompra : num]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Boleta no encontrada" });
    }

    const boleta = result.rows[0];
    boleta.total = Number(boleta.total) || 0;

    res.json(boleta);
  } catch (err) {
    console.error("Error GET /detalle/:numeroCompra", err.stack || err);
    res.status(500).json({ message: "Error al obtener detalle de la boleta" });
  }
});

// ============================
// GET TODAS LAS BOLETAS (ADMIN)
// ============================
app.get("/detalle", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM boleta ORDER BY fecha DESC");

    const rows = result.rows.map(r => ({
      ...r,
      total: Number(r.total) || 0,
      numero_compra: r.numero_compra || null
    }));

    res.json(rows);
  } catch (err) {
    console.error("Error GET /detalle", err.stack || err);
    res.status(500).json({ message: "Error al obtener todas las boletas" });
  }
});

// ============================
// INICIAR SERVIDOR
// ============================
app.listen(PORT, "0.0.0.0", () =>
  console.log(`DetalleBoleta API corriendo en puerto ${PORT}`)
);
