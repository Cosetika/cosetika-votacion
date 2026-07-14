# Cosétika - Votación Ziaja

Módulo independiente para que distribuidoras voten por los productos Ziaja que Cosétika debería importar.

## Archivos del repositorio

```
cosetika-votacion/
├── server.js              ← servidor Node.js con las rutas
├── votacion-ziaja.html    ← página que ven las distribuidoras
├── package.json
└── README.md
```

## Despliegue en Railway

### 1. Base de datos (una sola vez)
Ejecuta `tablas_votacion.sql` en el panel Query de tu PostgreSQL en Railway.
Este SQL crea las tablas `productos_votacion` y `votos_ziaja` — no toca nada más.

### 2. Nuevo servicio en Railway
- En tu proyecto Railway existente → **New Service** → **GitHub Repo**
- Selecciona este repositorio (`cosetika-votacion`)
- En Variables de entorno del nuevo servicio, agrega:
  ```
  DATABASE_URL=<la misma que usa tu app principal de Cosétika>
  ```
- Railway detecta el `package.json` y corre `npm start` automáticamente

### 3. Dominio
Railway te asigna un dominio automático tipo `cosetika-votacion.up.railway.app`.
Puedes mandarles ese link directamente a tus distribuidoras por WhatsApp.

## Cargar productos candidatos

Una vez que tengas tu lista final recortada, ejecuta en Railway Query:

```sql
INSERT INTO productos_votacion (linea, nombre, categoria, imagen_url) VALUES
('Acai Berry', 'Acai Berry Crema Facial Antioxidante', 'Facial', ''),
('Manuka Tree', 'Manuka Tree Mascarilla Purificante', 'Facial', '');
-- etc.
```

Claude puede generarte este INSERT completo desde tu Excel final.

## Ver resultados

Abre en el navegador:
```
https://tudominio.up.railway.app/api/votacion/resultados
```

Devuelve un JSON con ranking de productos más votados y total de votos por producto.
