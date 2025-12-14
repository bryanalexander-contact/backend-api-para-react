// eventos.js
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const pool = require('./db');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT_KOTLIN_EVENTOS || 4001;

app.use(express.json());
app.use(cors());

// asegurar carpeta de uploads y servirla estáticamente
const uploadDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}
app.use('/uploads', express.static(uploadDir));

// multer config
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const unique = `${Date.now()}_${file.originalname.replace(/\s+/g,'_')}`;
    cb(null, unique);
  }
});
const upload = multer({ storage });

// INICIAR TABLA EVENTOS
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
        creadorNombre VARCHAR(100),
        isGuardado BOOLEAN DEFAULT FALSE
      );
    `);
    console.log("Tabla eventos lista.");
  } catch (err) {
    console.error("Error DB:", err);
  }
};
iniciarDB();

const SECRET_KEY = process.env.JWT_SECRET_KOTLIN || "secret_dev_key";

function verificarToken(req, res, next) {
  const authHeader = req.headers["authorization"];
  if (!authHeader) {
    return res.status(403).json({ message: "Token requerido" });
  }

  let token = null;
  if (authHeader.startsWith("Bearer ")) {
    token = authHeader.split(" ")[1];
  } else {
    token = authHeader;
  }

  if (!token) return res.status(403).json({ message: "Token requerido" });

  jwt.verify(token, SECRET_KEY, (err, decoded) => {
    if (err) {
      console.error("JWT verify error:", err);
      return res.status(401).json({ message: "Token inválido" });
    }
    req.usuarioId = decoded.id || decoded.userId || null;
    req.usuarioNombre = decoded.nombre || decoded.name || decoded.username || null;
    req.usuarioEmail = decoded.email || decoded.correo || null;
    next();
  });
}

// Crear evento (multipart o JSON)
app.post("/eventos", verificarToken, upload.single('imagen'), async (req, res) => {
  try {
    console.log("POST /eventos body:", req.body);
    console.log("POST /eventos file:", req.file ? req.file.filename : null);
    console.log("Decoded user from token:", { id: req.usuarioId, nombre: req.usuarioNombre, email: req.usuarioEmail });

    let {
      usuarioId, nombre, descripcion, direccion,
      fecha, duracionHoras, imagenUri, creadorNombre
    } = req.body;

    const usuarioIdNum = usuarioId ? parseInt(usuarioId, 10) : (req.usuarioId || null);
    const fechaNum = fecha ? parseInt(fecha, 10) : null;

    let duracionNum = null;
    if (typeof duracionHoras !== 'undefined' && duracionHoras !== null && duracionHoras !== '') {
      const parsed = parseInt(duracionHoras, 10);
      if (!Number.isNaN(parsed)) duracionNum = parsed;
    }

    let finalCreadorNombre = creadorNombre || req.usuarioNombre || req.usuarioEmail || (usuarioIdNum ? `Usuario_${usuarioIdNum}` : null);

    if (!usuarioIdNum || !nombre || !descripcion || !direccion || !fechaNum || duracionNum === null || !finalCreadorNombre) {
      return res.status(400).json({ error: "Faltan campos requeridos o son inválidos", received: { usuarioIdNum, nombre, descripcion, direccion, fechaNum, duracionNum, finalCreadorNombre } });
    }

    let finalImagenUri = imagenUri || null;
    if (req.file) {
      const base = process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get('host')}`;
      finalImagenUri = `${base}/uploads/${req.file.filename}`;
    }

    const r = await pool.query(
      `INSERT INTO eventos (
        usuarioId,nombre,descripcion,direccion,fecha,
        duracionHoras,imagenUri,creadorNombre
      )
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING *`,
      [usuarioIdNum, nombre, descripcion, direccion, fechaNum, duracionNum, finalImagenUri, finalCreadorNombre]
    );

    res.status(201).json(r.rows[0]);
  } catch (err) {
    console.error("Error al crear evento:", err);
    res.status(500).json({ error: "Error interno" });
  }
});

app.get("/eventos", async (req, res) => {
  try {
    const r = await pool.query("SELECT * FROM eventos ORDER BY id DESC");
    res.json(r.rows);
  } catch (err) {
    console.error("Error GET /eventos:", err);
    res.status(500).json({ error: "Error interno" });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Microservicio Eventos en puerto ${PORT}`);
});
