# Arquitectura de KultiApp

## En una frase

Sitio estático (HTML, CSS y JavaScript sin compilación) publicado en Vercel, con Supabase como backend:
Auth para las cuentas, Postgres con RLS para los datos y Storage para las fotos.

## Archivos

| Ruta | Qué es |
|---|---|
| `index.html` | La app. Carga el tema antes de pintar, muestra la pantalla de carga y los scripts en orden. |
| `styles.css` | Todos los estilos. Colores como tokens en `:root` (oscuro) y `:root[data-theme='light']`. |
| `js/supabase-client.js` | Módulo que importa el SDK de Supabase (versión fija) y deja `createClient` global. |
| `js/01-core.js` … `js/14-brand.js` | La aplicación, por tema (ver abajo). |
| `js/99-start.js` | Arranca la app (`init()`). |
| `sw.js` | Service worker: abre sin conexión con la última versión. Supabase nunca se guarda en caché. |
| `manifest.webmanifest`, `assets/` | App instalable: nombre, íconos y accesos directos. `assets/brand/` guarda las piezas para WhatsApp y `assets/brand/kit/` el kit de marca del equipo (se importa al Kit de marca). |
| `catalogo.*`, `seguimiento.*`, `subir.*` | Páginas públicas (módulos ES), sin cuenta: catálogo, seguimiento de pedido y subida de fotos. |
| `tests/` | Pruebas jsdom con backend simulado (`boot.cjs`, `run.cjs`, `*.test.cjs`). |
| `docs/` | Manual, arquitectura, base de datos, historial, lista de consolidación, notas por versión y migraciones. |

## Los scripts de la app

Son scripts clásicos que comparten un único ámbito global: una función de un archivo usa las de otro. El
orden de `index.html` importa solo para el código que corre al cargar (constantes y escuchas de eventos);
las funciones se llaman después, cuando ya está todo cargado.

| Archivo | Tema |
|---|---|
| `01-core.js` | Conexión a Supabase, estado global `S`, utilidades (`q`, `n`, `clp`, `esc`…), versión y registro de errores. |
| `02-ui.js` | Íconos, diálogos, avisos (`toast`), campos, buscadores, menús flotantes, pantalla de carga, tema y `pageSheet` (fichas como página). |
| `03-app.js` | Sesión y espacio de trabajo, `render()` y `goMode()`, barra lateral, «Más», enlaces por sección (`#…`), búsqueda, instalación y sin conexión. |
| `04-account.js` | Inicio de sesión, nombre e iniciales, Mi perfil, contraseña e invitaciones. |
| `05-products.js` | Lista y galería de productos, números del producto, stock terminado, edición rápida, listas de precios, catálogo y venta desde stock. |
| `06-product-editor.js` | Editor de producto: impresiones, filamentos, costos, precio, fotos y borradores locales. |
| `07-inventory.js` | Materiales, movimientos, ficha del material, modo conteo, recetas, reservas de pedidos y lista de compras. |
| `08-printers.js` | Impresoras, horas, mantención y fallas. |
| `09-orders.js` | Pedidos: lista, ficha, creación rápida, vínculo con producto, costos, revisión y fotos. |
| `10-payments.js` | Pagos, saldos, avisos por WhatsApp y enlace de seguimiento. |
| `11-customers-quotes.js` | Clientes, cotizaciones (documento e imagen) y archivos de clientes. |
| `12-finance-reports.js` | Finanzas, reportes, exportación a Excel y respaldo. |
| `13-home.js` | Inicio y recordatorios. |
| `14-brand.js` | Kit de marca: galería, subida de originales, vista previa segura, versiones y archivos de la app. |

Para agregar un archivo: crearlo en `js/`, agregarlo a `index.html` antes de `99-start.js` y a `SHELL` en `sw.js`.

## Flujo de una pantalla

1. `goMode(modo)` muestra el esqueleto de la sección, carga lo que falta y llama a `render()`.
2. `render()` elige la vista según `S.mode` (`homeView`, `productionView`, `materialView`, `orderView`…).
3. Cada vista escribe `root.innerHTML` con `header(…)` y su `<main>`, llama a `common()` (barra lateral,
   animación, avisos, campos) y conecta sus botones.
4. `saveView()` recuerda la pantalla y actualiza el enlace (`#pedido/<id>`); el botón Atrás del navegador
   vuelve a la anterior (`popstate`).

Las **fichas** (producto, material, pedido y cliente) son páginas con su enlace. Pedido y cliente se arman
con `pageSheet()`, que ofrece la misma interfaz que un diálogo (incluido `close()`), así su lógica es la misma.

## Datos y permisos

- Todo dato pertenece a un `workspace_id`. Las políticas RLS usan `private.is_workspace_member` (leer) y
  `private.can_edit_workspace` (escribir). Ver `docs/BASE_DE_DATOS.md`.
- Las operaciones delicadas (reservar y consumir inventario, mover stock de productos, vincular pedidos,
  actualizar materiales de un pedido, enlaces públicos) son funciones `private.*` con `security definer`,
  llamadas desde envoltorios `public.*`.
- El cliente nunca tiene la clave `service_role`; la clave publicable es pública por diseño.
- `localStorage` guarda solo preferencias del dispositivo (tema, vista, borradores), con el prefijo `kultiapp_`.

## Pruebas y publicación

- `npm run lint` (ESLint) y `npm test` (todas las suites con jsdom, ver `docs/CONSOLIDACION.md`).
- CI en GitHub: pruebas, CodeQL y gitleaks.
- Vercel publica `main` en https://kultiapp.vercel.app; cada rama y PR tiene vista previa.
- Las migraciones se aplican en Supabase antes de publicar el cliente que las usa; su SQL queda en
  `docs/migraciones/`.
