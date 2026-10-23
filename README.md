# KultiApp — Costos y producción 3D

Aplicación web de Kultiverso Pop para costear productos de impresión 3D,
cotizar, gestionar pedidos de producción e inventario. Funciona sobre
Supabase (Auth, Postgres con RLS y Storage) y se publica como sitio estático.

## Funciones
- Login/registro y espacio de trabajo compartido con invitaciones (propietario, editor, solo lectura).
- Productos con varias impresiones, hasta siete filamentos por impresión, costos directos y adicionales.
- Margen objetivo, IVA configurable, redondeo comercial, precio manual y escenarios Mínimo/Promo/Recomendado/Premium.
- Fotos de producto en Supabase Storage (bucket privado `product-photos`).
- Cotizaciones con folio, cliente, vigencia, plazo de entrega, condiciones y contacto; vista, PDF e imagen PNG para WhatsApp.
- Pedidos de producción con reserva y consumo de inventario.
- Borradores locales por usuario y espacio de trabajo.

## Estructura
- `index.html`, `styles.css` y `js/`: la aplicación (sin paso de compilación). `index.html` carga
  `js/supabase-client.js` (módulo del SDK) y luego los archivos `js/01-…` a `js/19-start.js` **en orden**;
  comparten un mismo ámbito global, así que una función de un archivo puede usar las de otro.
  Para agregar un archivo nuevo: créalo en `js/`, agrégalo a `index.html` antes de `19-start.js`
  y a la lista `SHELL` de `sw.js` (las pruebas leen el orden desde `index.html`).
- `docs/`: notas de cada versión y referencias de las migraciones aplicadas (`SCHEMA_V*.sql`).
- `tests/`: pruebas con jsdom y un backend simulado (no escriben en Supabase).

## Pruebas
```sh
npm install
npm test
```
GitHub Actions ejecuta `npm test` en cada push y pull request.

## Publicación
Sitio estático (GitHub Pages desde `main`, raíz del repositorio). Las migraciones
de base de datos se aplican en Supabase antes de publicar el cliente que las usa.
