const http = require('http');
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const PORT = process.env.PORT || 3000;

const server = http.createServer(async (req, res) => {
  const url = req.url.split('?')[0];

  // CORS - permite que el HTML llame a la API desde cualquier origen
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // ----------------------------------------------------------
  // GET /images/* -> sirve imágenes estáticas desde la raíz
  // ----------------------------------------------------------
  if (url.startsWith('/images/') && req.method === 'GET') {
    const fileName = path.basename(url);
    const imgPath = path.join(__dirname, fileName);
    fs.readFile(imgPath, (err, data) => {
      if (err) {
        res.writeHead(404);
        res.end('Imagen no encontrada');
        return;
      }
      res.writeHead(200, { 'Content-Type': 'image/jpeg' });
      res.end(data);
    });
    return;
  }

  // ----------------------------------------------------------
  // GET / o /votacion-ziaja -> sirve la página HTML
  // ----------------------------------------------------------
  if ((url === '/' || url === '/votacion-ziaja') && req.method === 'GET') {
    const filePath = path.join(__dirname, 'votacion-ziaja.html');
    fs.readFile(filePath, 'utf8', (err, html) => {
      if (err) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Error al cargar la página.');
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
    });
    return;
  }

  // ----------------------------------------------------------
  // GET /api/votacion/productos -> lista de productos activos
  // ----------------------------------------------------------
  if (url === '/api/votacion/productos' && req.method === 'GET') {
    try {
      const result = await pool.query(
        `SELECT id, linea, nombre, categoria, imagen_url
         FROM productos_votacion
         WHERE activo = TRUE
         ORDER BY linea, nombre`
      );
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(result.rows));
    } catch (err) {
      console.error('Error en /api/votacion/productos:', err);
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'Error al obtener productos' }));
    }
    return;
  }

  // ----------------------------------------------------------
  // POST /api/votacion/votar -> registra los votos
  // Body: { nombre, telefono, producto_ids: [1, 2, 3] }
  // ----------------------------------------------------------
  if (url === '/api/votacion/votar' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const { nombre, telefono, producto_ids } = JSON.parse(body);

        if (!nombre || !telefono || !Array.isArray(producto_ids) || producto_ids.length === 0) {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ error: 'Datos incompletos' }));
          return;
        }

        const nombreLimpio = String(nombre).trim().slice(0, 150);
        const telefonoLimpio = String(telefono).trim().slice(0, 30);

        const valores = [];
        const placeholders = producto_ids.map((pid, i) => {
          valores.push(nombreLimpio, telefonoLimpio, Number(pid));
          const base = i * 3;
          return `($${base + 1}, $${base + 2}, $${base + 3})`;
        }).join(', ');

        await pool.query(
          `INSERT INTO votos_ziaja (nombre_distribuidora, telefono, producto_id)
           VALUES ${placeholders}`,
          valores
        );

        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: true }));
      } catch (err) {
        console.error('Error en /api/votacion/votar:', err);
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: 'Error al registrar votos' }));
      }
    });
    return;
  }

  // ----------------------------------------------------------
  // GET /api/votacion/distribuidoras -> quién votó qué
  // ----------------------------------------------------------
  if (url === '/api/votacion/distribuidoras' && req.method === 'GET') {
    try {
      const result = await pool.query(
        `SELECT v.nombre_distribuidora AS nombre,
                array_agg(p.nombre ORDER BY p.linea, p.nombre) AS productos
         FROM votos_ziaja v
         JOIN productos_votacion p ON p.id = v.producto_id
         GROUP BY v.nombre_distribuidora
         ORDER BY v.nombre_distribuidora`
      );
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(result.rows));
    } catch (err) {
      console.error('Error en /api/votacion/distribuidoras:', err);
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'Error al obtener distribuidoras' }));
    }
    return;
  }

  // ----------------------------------------------------------
  // GET /api/votacion/resultados -> ranking de productos más votados
  // ----------------------------------------------------------
  if (url === '/api/votacion/resultados' && req.method === 'GET') {
    try {
      const result = await pool.query(
        `SELECT p.id, p.linea, p.nombre, p.categoria, COUNT(v.id) AS total_votos
         FROM productos_votacion p
         LEFT JOIN votos_ziaja v ON v.producto_id = p.id
         GROUP BY p.id, p.linea, p.nombre, p.categoria
         ORDER BY total_votos DESC`
      );
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(result.rows));
    } catch (err) {
      console.error('Error en /api/votacion/resultados:', err);
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'Error al obtener resultados' }));
    }
    return;
  }

  // ----------------------------------------------------------
  // 404 para cualquier otra ruta
  // ----------------------------------------------------------
  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('No encontrado');
});

server.listen(PORT, () => {
  console.log(`Servidor de votación corriendo en puerto ${PORT}`);
});
