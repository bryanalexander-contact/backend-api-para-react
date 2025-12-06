const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const pool = require("./db");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT_USUARIOS || 4002;

app.use(express.json());
app.use(cors());

const SECRET_KEY = process.env.JWT_SECRET || "CLAVE_SUPER_SECRETA";

// Middleware JWT
function verificarToken(req, res, next) {
  const authHeader = req.headers["authorization"];
  if (!authHeader) return res.status(403).json({ message: "Token requerido" });

  const token = authHeader.split(" ")[1];
  jwt.verify(token, SECRET_KEY, (err, decoded) => {
    if (err) return res.status(401).json({ message: "Token inválido" });
    req.usuario = decoded.usuario;
    next();
  });
}

// Crear tabla y columnas necesarias si no existen
(async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS usuario (
        id SERIAL PRIMARY KEY,
        nombre VARCHAR(100),
        apellidos VARCHAR(100),
        correo VARCHAR(100) UNIQUE NOT NULL,
        password VARCHAR(200) NOT NULL,
        historial JSONB DEFAULT '[]'::JSONB
      );
    `);

    const columnas = [
      { name: "run", type: "VARCHAR(50)" },
      { name: "fecha_nacimiento", type: "DATE" },
      { name: "tipo_usuario", type: "VARCHAR(50) DEFAULT 'cliente'" },
      { name: "direccion", type: "TEXT" },
      { name: "region", type: "VARCHAR(50)" },
      { name: "comuna", type: "VARCHAR(50)" },
      { name: "departamento", type: "VARCHAR(50)" },
      { name: "indicacion", type: "TEXT" },
    ];

    for (let col of columnas) {
      await pool.query(`
        ALTER TABLE usuario
        ADD COLUMN IF NOT EXISTS ${col.name} ${col.type};
      `);
    }

    console.log("Tabla 'usuario' verificada y columnas agregadas si era necesario.");
  } catch (err) {
    console.error("Error creando/verificando tabla usuario:", err.stack || err);
  }
})();

// Helper para normalizar usuario
function normalizarUsuario(row) {
  const u = { ...row };
  u.historialCompras = u.historial || [];
  return u;
}

// Convierte "" o undefined a null
function normalizeEmptyToNull(val) {
  if (val === "" || val === undefined) return null;
  return val;
}

// ====================== RUTAS ======================

// REGISTER
app.post("/usuarios/register", async (req, res) => {
  try {
    console.log("POST /usuarios/register body:", req.body);
    const body = req.body || {};
    let run = normalizeEmptyToNull(body.run);
    let nombre = normalizeEmptyToNull(body.nombre);
    let apellidos = normalizeEmptyToNull(body.apellidos);
    let correo = normalizeEmptyToNull(body.correo);
    let password = normalizeEmptyToNull(body.password);
    let fechaNacimiento = normalizeEmptyToNull(body.fechaNacimiento ?? body.fecha_nacimiento);
    let tipoUsuario = normalizeEmptyToNull(body.tipoUsuario ?? body.tipo_usuario) || "cliente";
    let direccion = normalizeEmptyToNull(body.direccion);
    let region = normalizeEmptyToNull(body.region);
    let comuna = normalizeEmptyToNull(body.comuna);
    let departamento = normalizeEmptyToNull(body.departamento);
    let indicacion = normalizeEmptyToNull(body.indicacion);

    if (!correo || !password) return res.status(400).json({ message: "Correo y password requeridos" });

    const result = await pool.query(
      `INSERT INTO usuario
        (run, nombre, apellidos, correo, password, fecha_nacimiento, tipo_usuario, direccion, region, comuna, departamento, indicacion)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       RETURNING *;`,
      [run, nombre, apellidos, correo, password, fechaNacimiento, tipoUsuario, direccion, region, comuna, departamento, indicacion]
    );

    const user = normalizarUsuario(result.rows[0]);
    res.status(201).json({ ok: true, user });
  } catch (err) {
    console.error("Error POST /usuarios/register:", err.stack || err);
    if (err.code === "23505") return res.status(409).json({ message: "Usuario ya existe" });
    res.status(500).json({ message: "Error en registro", error: err.message });
  }
});

// LOGIN
app.post("/usuarios/login", async (req, res) => {
  try {
    const { correo, password } = req.body;
    const result = await pool.query(
      `SELECT * FROM usuario WHERE correo=$1 AND password=$2`,
      [correo, password]
    );
    if (result.rows.length === 0) return res.status(401).json({ message: "Credenciales inválidas" });

    const userRow = result.rows[0];
    const token = jwt.sign({ usuario: correo }, SECRET_KEY, { expiresIn: "8h" });

    const user = normalizarUsuario(userRow);
    res.json({ token, user });
  } catch (err) {
    console.error("Error POST /usuarios/login:", err.stack || err);
    res.status(500).json({ message: "Error en login", error: err.message });
  }
});

// GET USUARIOS (admin)
app.get("/usuarios", verificarToken, async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM usuario ORDER BY id");
    const usuarios = result.rows.map(normalizarUsuario);
    res.json(usuarios);
  } catch (err) {
    console.error("Error GET /usuarios:", err.stack || err);
    res.status(500).json({ message: "Error al obtener usuarios", error: err.message });
  }
});

// GET usuario por id
app.get("/usuarios/:id", verificarToken, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query("SELECT * FROM usuario WHERE id=$1", [id]);
    if (result.rows.length === 0) return res.status(404).json({ message: "Usuario no encontrado" });
    res.json(normalizarUsuario(result.rows[0]));
  } catch (err) {
    console.error("Error GET /usuarios/:id", err.stack || err);
    res.status(500).json({ message: "Error al obtener usuario", error: err.message });
  }
});

// UPDATE, DELETE y rutas de historial se mantienen igual...

app.listen(PORT, () => console.log(`Usuarios API corriendo en puerto ${PORT}`));
