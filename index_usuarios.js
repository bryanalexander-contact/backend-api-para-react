// index_usuarios.js
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const pool = require("./db");

const { verificarToken, authorizeRole } = require("./auth");

const app = express();
const PORT = process.env.PORT_USUARIOS || 4002;

// Usa obligatoriamente la clave del .env
const SECRET_KEY = process.env.JWT_SECRET;

app.use(express.json());
app.use(cors());

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

function normalizeEmptyToNull(val) {
  if (val === "" || val === undefined) return null;
  return val;
}

// Mapeo claro de roles: acepta variantes como "administrador", "admin", "vendedor", etc.
function mapRole(raw) {
  if (!raw) return "cliente";
  const r = String(raw).toLowerCase().trim();
  if (r.includes("admin") || r.includes("administrador")) return "admin";
  if (r.includes("vend")) return "vendedor";
  return "cliente";
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

    // Normalizamos el rol y lo incluimos en el token
    const rawRole = userRow.tipo_usuario || userRow.tipoUsuario;
    const normalizedRole = mapRole(rawRole);

    // firmar token incluyendo id y rol normalizado
    const payload = {
      usuario: {
        id: userRow.id,
        correo: userRow.correo,
        rol: normalizedRole,
      },
    };

    const token = jwt.sign(payload, SECRET_KEY, { expiresIn: "8h" });

    const user = normalizarUsuario(userRow);
    res.json({ token, user });
  } catch (err) {
    console.error("Error POST /usuarios/login:", err.stack || err);
    res.status(500).json({ message: "Error en login", error: err.message });
  }
});

// GET USUARIOS (solo admin)
app.get("/usuarios", verificarToken, authorizeRole("admin", "administrador"), async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM usuario ORDER BY id");
    const usuarios = result.rows.map(normalizarUsuario);
    res.json(usuarios);
  } catch (err) {
    console.error("Error GET /usuarios:", err.stack || err);
    res.status(500).json({ message: "Error al obtener usuarios", error: err.message });
  }
});

// GET usuario por id (requiere token pero usuario puede ver su propio registro o admin)
app.get("/usuarios/:id", verificarToken, async (req, res) => {
  try {
    const { id } = req.params;
    // si no es admin solo puede ver su propio ID
    const requesterRole = (req.usuario?.rol || req.usuario?.tipo_usuario || "").toString().toLowerCase();
    if (requesterRole !== "admin" && requesterRole !== "administrador" && Number(req.usuario.id) !== Number(id)) {
      return res.status(403).json({ message: "Acceso denegado" });
    }

    const result = await pool.query("SELECT * FROM usuario WHERE id=$1", [id]);
    if (result.rows.length === 0) return res.status(404).json({ message: "Usuario no encontrado" });
    res.json(normalizarUsuario(result.rows[0]));
  } catch (err) {
    console.error("Error GET /usuarios/:id", err.stack || err);
    res.status(500).json({ message: "Error al obtener usuario", error: err.message });
  }
});

/*
  PUT /usuarios/:id
  - Permite a admin actualizar cualquier usuario
  - Permite al propio usuario actualizar su registro
*/
app.put("/usuarios/:id", verificarToken, async (req, res) => {
  try {
    const { id } = req.params;
    const requesterRole = (req.usuario?.rol || req.usuario?.tipo_usuario || "").toString().toLowerCase();
    const requesterId = Number(req.usuario?.id);

    if (requesterRole !== "admin" && requesterRole !== "administrador" && requesterId !== Number(id)) {
      return res.status(403).json({ message: "Acceso denegado para actualizar este usuario" });
    }

    const body = req.body || {};

    // Campos aceptados
    const fields = {
      run: normalizeEmptyToNull(body.run),
      nombre: normalizeEmptyToNull(body.nombre),
      apellidos: normalizeEmptyToNull(body.apellidos),
      correo: normalizeEmptyToNull(body.correo),
      password: normalizeEmptyToNull(body.password),
      fecha_nacimiento: normalizeEmptyToNull(body.fechaNacimiento ?? body.fecha_nacimiento),
      tipo_usuario: normalizeEmptyToNull(body.tipoUsuario ?? body.tipo_usuario),
      direccion: normalizeEmptyToNull(body.direccion),
      region: normalizeEmptyToNull(body.region),
      comuna: normalizeEmptyToNull(body.comuna),
      departamento: normalizeEmptyToNull(body.departamento),
      indicacion: normalizeEmptyToNull(body.indicacion),
    };

    // Construir dinámicamente query SET
    const setParts = [];
    const values = [];
    let idx = 1;
    for (let key in fields) {
      if (fields[key] !== null) {
        setParts.push(`${key}=$${idx}`);
        values.push(fields[key]);
        idx++;
      }
    }

    if (setParts.length === 0) {
      return res.status(400).json({ message: "No hay campos para actualizar" });
    }

    const sql = `UPDATE usuario SET ${setParts.join(", ")} WHERE id=$${idx} RETURNING *`;
    values.push(id);

    const result = await pool.query(sql, values);
    if (result.rows.length === 0) return res.status(404).json({ message: "Usuario no encontrado" });

    const updated = normalizarUsuario(result.rows[0]);
    res.json({ ok: true, user: updated });
  } catch (err) {
    console.error("Error PUT /usuarios/:id", err.stack || err);
    res.status(500).json({ message: "Error al actualizar usuario", error: err.message });
  }
});

/*
  DELETE /usuarios/:id
  - Solo admin/administrador puede eliminar usuarios
*/
app.delete("/usuarios/:id", verificarToken, authorizeRole("admin", "administrador"), async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query("DELETE FROM usuario WHERE id=$1 RETURNING *", [id]);
    if (result.rows.length === 0) return res.status(404).json({ message: "Usuario no encontrado" });
    res.json({ ok: true, deleted: result.rows[0] });
  } catch (err) {
    console.error("Error DELETE /usuarios/:id", err.stack || err);
    res.status(500).json({ message: "Error al eliminar usuario", error: err.message });
  }
});

// Aquí puedes añadir authorizeRole("admin","administrador") en otras rutas sensibles como delete/update de usuarios.

app.listen(PORT, () => console.log(`Usuarios API corriendo en puerto ${PORT}`));
