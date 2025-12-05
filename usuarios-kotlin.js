// IMPORTS
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const pool = require('./db');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT_KOTLIN_USUARIOS || 4000; // <-- usa el .env o 4000 por defecto

// Middlewares
app.use(express.json());
app.use(cors());

// ============================
//     INICIAR TABLA USUARIOS
// ============================
const iniciarDB = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS usuarios_kotlin (
        id SERIAL PRIMARY KEY,
        nombre VARCHAR(100) NOT NULL,
        correo VARCHAR(100) UNIQUE NOT NULL,
        contrasena VARCHAR(100) NOT NULL,
        rol VARCHAR(50) DEFAULT 'usuario'
      );
    `);
    console.log("Tabla usuarios_kotlin lista.");
  } catch (err) {
    console.error("Error DB:", err);
  }
};
iniciarDB();

// ============================
//         JWT CONFIG
// ============================
const SECRET_KEY = process.env.JWT_SECRET_KOTLIN;

// ============================
//       AUTH KOTLIN
// ============================
app.post("/auth/register", async (req, res) => {
  const { nombre, correo, contrasena } = req.body;

  try {
    const result = await pool.query(
      `INSERT INTO usuarios_kotlin (nombre, correo, contrasena)
       VALUES ($1,$2,$3)
       RETURNING id, nombre, correo`,
      [nombre, correo, contrasena]
    );
    res.status(201).json({ user: result.rows[0] });

  } catch (err) {
    if (err.code === "23505")
      return res.status(409).json({ message: "El correo ya existe" });
    res.status(500).json({ message: "Error en registro" });
  }
});

app.post("/auth/login", async (req, res) => {
  const { correo, contrasena } = req.body;

  const r = await pool.query(
    "SELECT * FROM usuarios_kotlin WHERE correo = $1 AND contrasena = $2",
    [correo, contrasena]
  );

  if (r.rows.length === 0)
    return res.status(401).json({ message: "Credenciales inválidas" });

  const token = jwt.sign({ id: r.rows[0].id }, SECRET_KEY, { expiresIn: "3h" });

  res.json({ token });
});

// ============================
//         SERVER
// ============================
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Microservicio Usuarios Kotlin en puerto ${PORT}`);
});
