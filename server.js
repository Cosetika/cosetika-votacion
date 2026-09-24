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

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  // Imágenes estáticas desde la raíz
  if (url.startsWith('/images/') && req.method === 'GET') {
    const fileName = path.basename(url);
    const imgPath = path.join(__dirname, fileName);
    fs.readFile(imgPath, (err, data) => {
      if (err) { res.writeHead(404); res.end('Imagen no encontrada'); return; }
      res.writeHead(200, { 'Content-Type': 'image/jpeg' });
      res.end(data);
    });
    return;
  }

  // Página principal
  if ((url === '/' || url === '/votacion-ziaja') && req.method === 'GET') {
    fs.readFile(path.join(__dirname, 'votacion-ziaja.html'), 'utf8', (err, html) => {
      if (err) { res.writeHead(500); res.end('Error al cargar la página.'); return; }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
    });
    return;
  }

  // GET /api/votacion/productos -> solo activos
  if (url === '/api/votacion/productos' && req.method === 'GET') {
    try {
      const result = await pool.query(
        `SELECT id, linea, nombre, categoria, imagen_url
         FROM productos_votacion WHERE activo = TRUE ORDER BY linea, nombre`
      );
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(result.rows));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'Error al obtener productos' }));
    }
    return;
  }

  // GET /api/votacion/catalogo -> todos (activos e inactivos)
  if (url === '/api/votacion/catalogo' && req.method === 'GET') {
    try {
      const result = await pool.query(
        `SELECT id, linea, nombre, categoria, imagen_url, activo
         FROM productos_votacion ORDER BY linea, nombre`
      );
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(result.rows));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'Error al obtener catálogo' }));
    }
    return;
  }

  // POST /api/votacion/votar -> registra votos CON estrellas
  if (url === '/api/votacion/votar' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const { nombre, votos } = JSON.parse(body);
        if (!nombre || !Array.isArray(votos) || votos.length === 0) {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ error: 'Datos incompletos' }));
          return;
        }
        const nombreLimpio = String(nombre).trim().slice(0, 150);
        const valores = [];
        const placeholders = votos.map((v, i) => {
          const estrellas = Math.min(3, Math.max(1, parseInt(v.estrellas) || 1));
          valores.push(nombreLimpio, 'N/A', Number(v.id), estrellas);
          const base = i * 4;
          return `($${base+1}, $${base+2}, $${base+3}, $${base+4})`;
        }).join(', ');
        await pool.query(
          `INSERT INTO votos_ziaja (nombre_distribuidora, telefono, producto_id, estrellas) VALUES ${placeholders}`,
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

  // GET /api/votacion/resultados -> ranking ponderado por estrellas
  if (url === '/api/votacion/resultados' && req.method === 'GET') {
    try {
      const result = await pool.query(
        `SELECT p.id, p.linea, p.nombre, p.categoria,
                COUNT(v.id) AS total_votos,
                COALESCE(SUM(v.estrellas), 0) AS puntaje_total,
                COALESCE(AVG(v.estrellas), 0) AS promedio_estrellas
         FROM productos_votacion p
         LEFT JOIN votos_ziaja v ON v.producto_id = p.id
         GROUP BY p.id, p.linea, p.nombre, p.categoria
         ORDER BY puntaje_total DESC, total_votos DESC`
      );
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(result.rows));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'Error al obtener resultados' }));
    }
    return;
  }

  // GET /api/votacion/distribuidoras -> quién votó qué y con cuántas estrellas
  if (url === '/api/votacion/distribuidoras' && req.method === 'GET') {
    try {
      const result = await pool.query(
        `SELECT v.nombre_distribuidora AS nombre,
                SUM(v.estrellas) AS puntaje_total,
                array_agg(p.nombre || ' (' || v.estrellas || '⭐)' ORDER BY v.estrellas DESC, p.nombre) AS productos
         FROM votos_ziaja v
         JOIN productos_votacion p ON p.id = v.producto_id
         GROUP BY v.nombre_distribuidora
         ORDER BY puntaje_total DESC`
      );
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(result.rows));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'Error al obtener distribuidoras' }));
    }
    return;
  }

  // PATCH /api/votacion/producto/:id -> activar/desactivar
  const patchMatch = url.match(/^\/api\/votacion\/producto\/(\d+)$/);
  if (patchMatch && req.method === 'PATCH') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const { activo } = JSON.parse(body);
        await pool.query('UPDATE productos_votacion SET activo = $1 WHERE id = $2', [activo, parseInt(patchMatch[1])]);
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: true }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: 'Error al actualizar producto' }));
      }
    });
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('No encontrado');
});

server.listen(PORT, () => {
  console.log(`Servidor de votación corriendo en puerto ${PORT}`);
});
