// index_usuarios.js
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
    req.usuario = decoded.usuario; // correo u otro claim que hayas puesto
    next();
  });
}

// Crear tabla usuarios
(async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS usuario (
        id SERIAL PRIMARY KEY,
        run VARCHAR(50),
        nombre VARCHAR(100),
        apellidos VARCHAR(100),
        correo VARCHAR(100) UNIQUE NOT NULL,
        password VARCHAR(200) NOT NULL,
        fecha_nacimiento DATE,
        tipo_usuario VARCHAR(50) DEFAULT 'cliente',
        direccion TEXT,
        region VARCHAR(50),
        comuna VARCHAR(50),
        departamento VARCHAR(50),
        indicacion TEXT,
        historial JSONB DEFAULT '[]'::JSONB
      );
    `);
    console.log("Tabla 'usuario' verificada/creada.");
  } catch (err) {
    console.error("Error creando/verificando tabla usuario:", err.stack || err);
  }
})();

/**
 * Helper: normalizar usuario (para compatibilidad con frontend anterior)
 * agrega campo historialCompras = historial (JSONB)
 */
function normalizarUsuario(row) {
  const u = { ...row };
  u.historialCompras = u.historial || [];
  // opcional: borrar u.historial si quieres evitar duplicados; mantengo ambos para debug.
  return u;
}

// REGISTER
app.post("/usuarios/register", async (req, res) => {
  try {
    const {
      run,
      nombre,
      apellidos,
      correo,
      password,
      fechaNacimiento,
      tipoUsuario,
      direccion,
      region,
      comuna,
      departamento,
      indicacion,
    } = req.body;

    if (!correo || !password) return res.status(400).json({ message: "Correo y password requeridos" });

    const result = await pool.query(
      `INSERT INTO usuario
        (run, nombre, apellidos, correo, password, fecha_nacimiento, tipo_usuario, direccion, region, comuna, departamento, indicacion)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       RETURNING *;`,
      [
        run || null,
        nombre || null,
        apellidos || null,
        correo,
        password,
        fechaNacimiento || null,
        tipoUsuario || "cliente",
        direccion || null,
        region || null,
        comuna || null,
        departamento || null,
        indicacion || null,
      ]
    );

    const user = normalizarUsuario(result.rows[0]);
    res.status(201).json({ ok: true, user });
  } catch (err) {
    console.error("Error POST /usuarios/register:", err.stack || err);
    if (err.code === "23505") return res.status(409).json({ message: "Usuario ya existe" });
    res.status(500).json({ message: "Error en registro" });
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
    const token = jwt.sign({ usuario: correo }, SECRET_KEY, { expiresIn: "8h" }); // duración ajustable

    const user = normalizarUsuario(userRow);
    res.json({ token, user });
  } catch (err) {
    console.error("Error POST /usuarios/login:", err.stack || err);
    res.status(500).json({ message: "Error en login" });
  }
});

// GET USUARIOS (admin) -> devolver usuarios con historialCompras
app.get("/usuarios", verificarToken, async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM usuario ORDER BY id");
    const usuarios = result.rows.map(normalizarUsuario);
    res.json(usuarios);
  } catch (err) {
    console.error("Error GET /usuarios:", err.stack || err);
    res.status(500).json({ message: "Error al obtener usuarios" });
  }
});

// GET usuario por id (público)
app.get("/usuarios/:id", verificarToken, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query("SELECT * FROM usuario WHERE id=$1", [id]);
    if (result.rows.length === 0) return res.status(404).json({ message: "Usuario no encontrado" });
    res.json(normalizarUsuario(result.rows[0]));
  } catch (err) {
    console.error("Error GET /usuarios/:id", err.stack || err);
    res.status(500).json({ message: "Error al obtener usuario" });
  }
});

// UPDATE USUARIO
app.put("/usuarios/:id", verificarToken, async (req, res) => {
  try {
    const { id } = req.params;
    const campos = req.body || {};
    const keys = Object.keys(campos);
    if (keys.length === 0) return res.status(400).json({ message: "No hay campos para actualizar" });

    const sets = keys.map((k, i) => `${k}=$${i + 1}`).join(",");
    const values = keys.map((k) => campos[k]);
    const result = await pool.query(
      `UPDATE usuario SET ${sets} WHERE id=$${values.length + 1} RETURNING *`,
      [...values, id]
    );
    res.json({ ok: true, user: normalizarUsuario(result.rows[0]) });
  } catch (err) {
    console.error("Error PUT /usuarios/:id", err.stack || err);
    res.status(500).json({ message: "Error actualizando usuario" });
  }
});

// DELETE USUARIO
app.delete("/usuarios/:id", verificarToken, async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query("DELETE FROM usuario WHERE id=$1", [id]);
    res.json({ ok: true });
  } catch (err) {
    console.error("Error DELETE /usuarios/:id", err.stack || err);
    res.status(500).json({ message: "Error eliminando usuario" });
  }
});

/* =========================================================
   HISTORIAL DE COMPRAS (equivalente a registrarCompra en context)
   - POST /usuarios/:id/compras   -> agregar compra al historial (mantiene max 10)
   - GET  /usuarios/:id/compras   -> obtener historial
   - DELETE /usuarios/:id/compras -> limpiar historial
   ========================================================= */

// Agregar una compra al historial del usuario
app.post("/usuarios/:id/compras", verificarToken, async (req, res) => {
  try {
    const { id } = req.params;
    const compra = req.body; // { numeroCompra, fecha, total, comprador, productos }

    const r = await pool.query("SELECT historial FROM usuario WHERE id=$1", [id]);
    if (r.rows.length === 0) return res.status(404).json({ message: "Usuario no encontrado" });

    const historial = r.rows[0].historial || [];

    // Evitar duplicados simples: si la última compra tiene mismo total y fecha muy cercana
    const last = historial[historial.length - 1];
    if (last && compra && last.total === compra.total) {
      const lastTime = last.fecha ? new Date(last.fecha).getTime() : 0;
      const newTime = compra.fecha ? new Date(compra.fecha).getTime() : Date.now();
      if (Math.abs(newTime - lastTime) < 2000) {
        return res.status(200).json({ ok: true, message: "Compra duplicada ignorada", numeroCompra: last.numeroCompra || null });
      }
    }

    const nuevoHistorial = [...historial, compra].slice(-10);
    await pool.query("UPDATE usuario SET historial = $1 WHERE id = $2", [JSON.stringify(nuevoHistorial), id]);

    res.status(201).json({ ok: true, historialCompras: nuevoHistorial });
  } catch (err) {
    console.error("Error POST /usuarios/:id/compras", err.stack || err);
    res.status(500).json({ message: "Error agregando compra al historial" });
  }
});

// Obtener historial del usuario
app.get("/usuarios/:id/compras", verificarToken, async (req, res) => {
  try {
    const { id } = req.params;
    const r = await pool.query("SELECT historial FROM usuario WHERE id=$1", [id]);
    if (r.rows.length === 0) return res.status(404).json({ message: "Usuario no encontrado" });
    res.json(r.rows[0].historial || []);
  } catch (err) {
    console.error("Error GET /usuarios/:id/compras", err.stack || err);
    res.status(500).json({ message: "Error obteniendo historial" });
  }
});

// Limpiar historial de compras
app.delete("/usuarios/:id/compras", verificarToken, async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query("UPDATE usuario SET historial = '[]' WHERE id = $1", [id]);
    res.json({ ok: true });
  } catch (err) {
    console.error("Error DELETE /usuarios/:id/compras", err.stack || err);
    res.status(500).json({ message: "Error limpiando historial" });
  }
});

app.listen(PORT, () => console.log(`Usuarios API corriendo en puerto ${PORT}`));
