// IMPORTS
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const pool = require('./db');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT_KOTLIN_EVENTOS || 4001; // <-- usa el .env o 4001 por defecto

app.use(express.json());
app.use(cors());

// ============================
//     INICIAR TABLA EVENTOS
// ============================
const iniciarDB = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS eventos (
        id SERIAL PRIMARY KEY,
        usuarioId INT NOT NULL,
        nombre VARCHAR(100) NOT NULL,
        descripcion TEXT NOT NULL,
        direccion VARCHAR(255) NOT NULL,
        fecha BIGINT NOT NULL,
        duracionHoras INT NOT NULL,
        imagenUri TEXT,
        creadorNombre VARCHAR(100) NOT NULL,
        isGuardado BOOLEAN DEFAULT FALSE
      );
    `);
    console.log("Tabla eventos lista.");
  } catch (err) {
    console.error("Error DB:", err);
  }
};
iniciarDB();

// ============================
//         JWT CHECK
// ============================
const SECRET_KEY = process.env.JWT_SECRET_KOTLIN;

function verificarToken(req, res, next) {
  const authHeader = req.headers["authorization"];
  if (!authHeader) return res.status(403).json({ message: "Token requerido" });

  const token = authHeader.split(" ")[1];

  jwt.verify(token, SECRET_KEY, (err, decoded) => {
    if (err) return res.status(401).json({ message: "Token inválido" });

    req.usuarioId = decoded.id;
    next();
  });
}

// ============================
//           EVENTOS
// ============================
app.post("/eventos", verificarToken, async (req, res) => {
  const {
    usuarioId, nombre, descripcion, direccion,
    fecha, duracionHoras, imagenUri, creadorNombre
  } = req.body;

  const r = await pool.query(
    `INSERT INTO eventos (
      usuarioId,nombre,descripcion,direccion,fecha,
      duracionHoras,imagenUri,creadorNombre
    )
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     RETURNING *`,
    [usuarioId, nombre, descripcion, direccion, fecha, duracionHoras, imagenUri, creadorNombre]
  );

  res.status(201).json(r.rows[0]);
});

app.get("/eventos", async (req, res) => {
  const r = await pool.query("SELECT * FROM eventos");
  res.json(r.rows);
});

// ============================
//         SERVER
// ============================
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Microservicio Eventos en puerto ${PORT}`);
});
