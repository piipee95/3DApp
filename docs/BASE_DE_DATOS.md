# Base de datos de KultiApp (estado a la versión 5.2)

Supabase: Postgres con RLS en todas las tablas, Auth y Storage privado. Esta es la foto del esquema vigente;
el SQL de cada cambio aplicado está en `docs/migraciones/` (referencia, no se vuelve a ejecutar).

## Tablas

| Tabla | Para qué | Campos principales |
|---|---|---|
| `workspaces` | El taller | nombre, propietario |
| `workspace_members` | Quién pertenece y con qué rol | usuario, rol (owner, editor, viewer) |
| `workspace_invites` | Invitaciones de socios | token, rol, vencimiento, uso |
| `workspace_settings` | Ajustes del taller | precio de filamento y luz por defecto, textos de cotización, socios, catálogo (slug, WhatsApp, intro) |
| `workspace_resources` | Filamentos, insumos e impresoras | tipo, nombre, marca, color, unidad, costo promedio, precio por kg, stock, reservado, mínimo, contado, fecha de conteo, gramos por rollo, carrete vacío, unidades por paquete, notas, horas y mantención (impresoras), eliminado |
| `inventory_movements` | Historial de stock de cada material | tipo (stock inicial, ingreso, ajuste, salida, consumo), cantidad, costo, nota, pedido |
| `inventory_order_lines` | Materiales de cada pedido | material, cantidad reservada, consumida, costo |
| `products` | Productos | nombre, lote, IVA, margen, redondeo, precio manual, materiales (receta), foto, stock terminado y reservado, catálogo |
| `print_jobs` | Impresiones de cada producto | gramos, tiempo, filamentos, impresora, costos |
| `cost_items` | Costos directos y adicionales del producto | categoría, monto |
| `product_cost_summary` (vista) | Costo total y precio recomendado por producto | con `security_invoker`: respeta los permisos |
| `product_stock_movements` | Historial del stock terminado | fabricación, venta, ajuste |
| `production_orders` | Pedidos y fabricaciones | tipo (cliente o stock), cliente, cantidad, precio, IVA, costo estimado y real, estado (pendiente, imprimiendo, armado, listo, enviado, entregado, cancelado), entrega, inventario, desde stock, enlace de seguimiento |
| `order_payments` | Pagos de pedidos | monto, medio, fecha, quién recibió |
| `quotes` | Cotizaciones | folio, cliente, producto, precio, costo, vigencia, estado, pedido creado |
| `customers` | Clientes | nombre, teléfono, email, Instagram, notas |
| `customer_file_requests`, `customer_files` | Enlaces para que el cliente suba fotos y lo recibido | token, vencimiento, estados |
| `price_lists` | Precios rápidos por tamaño y extras | tamaños, extras, IVA |
| `print_failures` | Fallas de impresión | motivo, gramos, minutos, costo, descontado |
| `expenses` | Gastos | categoría, monto, IVA, quién pagó |
| `partner_transfers` | Transferencias entre socios | de, a, monto |
| `brand_assets` | Kit de marca (5.1) | categoría, nombre, descripción, uso, texto, fondo, archivo original (ruta, nombre, tipo, bytes, medidas), oficial, favorito, diseño (`group_id`), versión, vigente (una por diseño), archivado |
| `app_errors` | Errores de la app para diagnóstico | mensaje, pantalla, versión |

## Funciones

Las que hacen cambios delicados viven en `private` (con `security definer`, comprobación de `auth.uid()` y
permisos del taller) y se llaman desde un envoltorio en `public`:

- Inventario: `inventory_consume_order`, `refresh_order_materials`, y los disparadores que reservan, consumen
  y validan movimientos (`inventory_order_trigger`, `inventory_apply_movement`, `inventory_resource_guard`).
- Productos: `adjust_product_stock` y el disparador de
  stock terminado de pedidos.
- Pedidos: `link_order_product`, `order_tracking_link`, `printer_hours`.
- Taller: `bootstrap_workspace`, `create_workspace_invite`, `accept_workspace_invite`.
- Kit de marca: `brand_storage_usage` (espacio usado por el kit y por el proyecto, solo totales).
- Público (sin cuenta, por token): `order_tracking`, `public_catalog`, `customer_upload`.
- Las versiones antiguas `save_product_bundle` a `_v4` se conservan sin permiso de ejecución (5.0).

El guardado `public.save_product_bundle_v5` es SECURITY INVOKER: valida sesión y edición del equipo y
trabaja bajo RLS. Desde la reparación `kultiapp_v523_inline_save_bundle_chain`, integra la lógica de las
versiones anteriores sin invocarlas. Conserva su firma y ACL; authenticated puede ejecutar v5, pero no
las funciones antiguas. Ver `docs/versiones/V5_2_3.md`.

## Storage

- `product-photos` (privado): fotos de productos, del perfil y de los trabajos, bajo `<workspace_id>/…`.
- `customer-originals` (privado): fotos originales que suben los clientes.
- `brand-assets` (privado, 5.1): originales del Kit de marca bajo `<workspace_id>/brand/…`, hasta 50 MB, solo PNG,
  JPG, WebP, SVG, PDF y ZIP. Miembros leen; propietarios y editores suben y borran.

## Revisión 5.0

- Seguridad: RLS activo en todas las tablas; el único aviso de Supabase es la protección de contraseñas
  filtradas del lado del servidor (plan pago), que la app cubre al cambiar o crear contraseñas.
- Coherencia comprobada con los datos reales: el stock de cada material y producto coincide con la suma de su
  historial, las reservas con los pedidos reservados y lo consumido por cada pedido con sus movimientos.
- Índices agregados para las relaciones de `print_failures`.
