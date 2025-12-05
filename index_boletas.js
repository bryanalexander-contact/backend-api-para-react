// -----------------------------
res.json(result.rows[0]);
} catch (error) {
console.error("Error GET /boletas/numero/:numero", error.stack || error);
res.status(500).json({ error: "Error al obtener boleta" });
}
});


// POST nueva boleta
app.post("/boletas", async (req, res) => {
try {
const { numero_compra, fecha, comprador, productos, total, user_id } = req.body;


// validaciones mínimas
if (!productos || !Array.isArray(productos) || productos.length === 0)
return res.status(400).json({ message: "Productos requeridos" });


// Si numero_compra viene proporcionado, intentamos usarlo (pero la columna tiene UNIQUE)
// De lo contrario, dejamos que la DB asigne nextval de la sequence
const query = numero_compra
? `INSERT INTO boleta (numero_compra, fecha, comprador, productos, total, user_id) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`
: `INSERT INTO boleta (fecha, comprador, productos, total, user_id) VALUES ($1,$2,$3,$4,$5) RETURNING *`;


const params = numero_compra
? [numero_compra, fecha || new Date(), comprador || {}, productos, total || 0, user_id || null]
: [fecha || new Date(), comprador || {}, productos, total || 0, user_id || null];


const result = await pool.query(query, params);
res.status(201).json(result.rows[0]);
} catch (error) {
console.error("Error POST /boletas", error.stack || error);
// si fallo por unique constraint en numero_compra
if (error.code === "23505")
return res.status(409).json({ message: "Número de compra ya existente" });
res.status(500).json({ error: "Error al crear boleta" });
}
});


// DELETE boletas de un usuario
app.delete("/boletas/:userId", async (req, res) => {
try {
const { userId } = req.params;
await pool.query("DELETE FROM boleta WHERE user_id=$1", [userId]);
res.json({ ok: true });
} catch (error) {
console.error("Error DELETE /boletas/:userId", error.stack || error);
res.status(500).json({ error: "Error al eliminar boletas" });
}
});


app.listen(PORT, () => console.log(`Boletas API corriendo en puerto ${PORT}`));

