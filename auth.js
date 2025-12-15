require("dotenv").config();
const jwt = require("jsonwebtoken");

const SECRET_KEY = process.env.JWT_SECRET;

function verificarToken(req, res, next) {
  try {
    const authHeader = req.headers["authorization"] || req.headers["Authorization"];
    if (!authHeader) return res.status(401).json({ message: "Token requerido" });
    const parts = authHeader.split(" ");
    if (parts.length !== 2) return res.status(401).json({ message: "Token malformado" });
    const token = parts[1];
    jwt.verify(token, SECRET_KEY, (err, decoded) => {
      if (err) return res.status(401).json({ message: "Token inválido" });
      // el token puede tener estructura { usuario: {...} } o cualquier otra.
      // normalizamos a req.usuario
      if (decoded && decoded.usuario) req.usuario = decoded.usuario;
      else req.usuario = decoded;
      next();
    });
  } catch (err) {
    console.error("verificarToken error:", err);
    return res.status(500).json({ message: "Error verificando token" });
  }
}

/**
 * authorizeRole(...rolesPermitidos)
 * rolesPermitidos: lista de strings, p.ej. "admin", "vendedor"
 * La comparación es case-insensitive.
 */
function authorizeRole(...rolesPermitidos) {
  const allowed = rolesPermitidos.map((r) => String(r).toLowerCase());
  return (req, res, next) => {
    try {
      if (!req.usuario)
        return res.status(401).json({ message: "Usuario no autenticado" });

      // buscar campo de rol en diferentes formas
      const roleRaw =
        req.usuario.rol ||
        req.usuario.tipo_usuario ||
        req.usuario.tipoUsuario ||
        req.usuario.role ||
        "";
      const userRole = String(roleRaw).toLowerCase();

      if (!allowed.includes(userRole))
        return res.status(403).json({ message: "Acceso denegado (rol insuficiente)" });

      next();
    } catch (err) {
      console.error("authorizeRole error:", err);
      return res.status(500).json({ message: "Error en autorización" });
    }
  };
}

module.exports = { verificarToken, authorizeRole };
