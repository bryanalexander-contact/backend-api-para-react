
// -----------------------------
// index_detalleBoleta.js
// -----------------------------
const express2 = require("express");
const cors2 = require("cors");
const pool2 = require("./db");
require("dotenv").config();

const app2 = express2();
const PORT2 = process.env.PORT_DETALLE_BOLETA || 4004;

app2.use(express2.json());
app2.use(cors2());

// Aseguramos que la tabla boleta exista (si no, la creamos) para evitar errores
(async () => {
  try {
    await pool2.query(`CREATE SEQUENCE IF NOT EXISTS seq_numero_compra START 1;`);
    await pool2.query(`
      CREATE TABLE IF NOT EXISTS boleta (
        id SERIAL PRIMARY KEY,
        numero_compra INT UNIQUE DEFAULT nextval('seq_numero_compra'),
        fecha TIMESTAMP,
        comprador JSONB,
        productos JSONB,
        total NUMERIC,
        user_id INT
      );
    `);
  } catch (err) {
    console.error("Error asegurando tabla boleta en detalle API:", err.stack || err);
  }
})();

// GET boleta por número de compra
app2.get("/detalle/:numeroCompra", async (req, res) => {
  try {
    const { numeroCompra } = req.params;
    const result = await pool2.query(
      "SELECT * FROM boleta WHERE numero_compra=$1",
      [numeroCompra]
    );
    if (result.rows.length === 0) return res.status(404).json({ message: "Boleta no encontrada" });
    res.json(result.rows[0]);
  } catch (err) {
    console.error("Error GET /detalle/:numeroCompra", err.stack || err);
    res.status(500).json({ message: "Error al obtener detalle de la boleta" });
  }
});

app2.listen(PORT2, () => console.log(`DetalleBoleta API corriendo en puerto ${PORT2}`));



