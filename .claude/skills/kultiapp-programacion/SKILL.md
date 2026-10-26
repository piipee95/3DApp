---
name: kultiapp-programacion
description: Programación sobre KultiApp (JavaScript clásico sin compilación, scripts por tema js/01-core.js … js/14-brand.js y js/99-start.js con ámbito global compartido, páginas públicas en módulos ES, service worker). Usar antes de editar cualquier archivo de js/, index.html, styles.css, sw.js o las páginas públicas (catalogo, seguimiento, subir).
---

# Skill: programación de KultiApp

## Estructura real

- `index.html` carga `js/supabase-client.js` (módulo que importa el SDK desde jsDelivr con versión fija) y después `js/01-core.js` … `js/14-brand.js` y `js/99-start.js` **en orden**. Son scripts clásicos que comparten un único ámbito global: una función de un archivo usa las de otro.
- Cada archivo es un **tema** (núcleo, interfaz, app, cuenta, productos, editor, inventario, impresoras, pedidos, cobros, clientes y cotizaciones, finanzas y reportes, inicio); la tabla está en `docs/ARQUITECTURA.md`. Código nuevo va en el archivo de su tema, no en uno nuevo por versión, y sin nombres de versión en funciones (`setupV12`).
- Las fichas (producto, material, pedido, cliente) son páginas con enlace (`ID_PAGES` en `03-app.js`); pedido y cliente usan `pageSheet()`.
- Páginas públicas independientes: `catalogo.html/js`, `seguimiento.html/js`, `subir.html/js` (módulos ES).
- `sw.js`: service worker con `CACHE = 'kultiapp-vNN'` y la lista `SHELL`. Supabase nunca se guarda en caché.
- `styles.css`: colores como tokens en `:root` y `:root[data-theme='light']`; nada de colores fijos nuevos.

## Añadir un archivo de script

1. Crear `js/NN-nombre.js` con el siguiente número libre.
2. Añadirlo en `index.html` antes de `js/99-start.js`.
3. Añadirlo a `SHELL` en `sw.js`. Las pruebas leen el orden desde `index.html`.

## Reglas

- Cambio mínimo: antes de escribir código, buscar si ya existe una función, un control nativo del navegador o un patrón en otro `js/NN-*.js` que resuelva el caso. Sin frameworks, bundlers ni dependencias de ejecución nuevas.
- Mantener el estilo vigente (`.prettierrc.json`: comillas simples, 110 columnas). No reformatear archivos completos.
- Datos de usuario solo en Supabase; `localStorage` únicamente para preferencias del dispositivo y borradores (`kultiapp_*`), siempre dentro de `try/catch`.
- Nunca poner en el cliente la clave `service_role`, contraseñas ni tokens. La clave `sb_publishable_…` es pública por diseño.
- Textos de la interfaz en español de Chile y en lenguaje claro; la app debe funcionar en celular.
- La cotización impresa o compartida sigue siendo blanca en cualquier tema.

## Antes de terminar

`npm run lint` y `npm test` (ver la Skill `kultiapp-pruebas`) y actualizar la versión según la Skill `kultiapp-versiones`.
