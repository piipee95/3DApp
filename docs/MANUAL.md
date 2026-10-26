# Manual de KultiApp

KultiApp es la aplicación de gestión del taller de impresión 3D de Kultiverso Pop: costos, cotizaciones,
pedidos, producción, inventario, ventas, cobros y finanzas en un solo lugar. Funciona en el celular y en el
computador, y se puede instalar como app.

## Primeros pasos

- **Cuenta y taller.** Cada persona entra con su email y contraseña. Todos los datos pertenecen al taller
  (espacio de trabajo) y se comparten con los socios invitados.
- **Roles.** *Propietario* (todo, incluido invitar socios), *Editor* (crea y modifica) y *Solo lectura*
  (consulta sin modificar). Las invitaciones se crean en el menú de cuenta → «Invitar socio».
- **Instalar.** En el celular: «Instalar app» en el menú «Más» (o «Agregar a inicio» en iPhone). La app
  abre sin conexión con la última versión; los cambios necesitan internet.
- **Navegación.** En computador, la barra lateral; en el celular, la barra de abajo y «Más». Cada sección y
  cada ficha tiene su enlace (`#pedidos`, `#pedido/…`, `#material/…`): el botón Atrás vuelve a la anterior y
  un enlace compartido abre directo ahí (para quien tenga acceso al taller).
- **Buscar.** La lupa (o Ctrl K) busca productos, pedidos, cotizaciones, clientes y materiales.
- **Nuevo.** El botón «+ Nuevo» crea cotización, pedido de cliente, fabricación para stock o producto.

## Inicio

Saludo, accesos rápidos (Vender, Nuevo pedido, Fabricar, Cotizar), las cifras del mes (ventas, utilidad,
pedidos), **Productos en stock** y **Materia prima** (dinero invertido), **Por cobrar**, próximas entregas,
stock bajo y **Pendientes**: atrasos, entregas de hoy y mañana, pedidos listos, saldos por cobrar,
cotizaciones por vencer, mantenciones y el conteo de inventario cuando toca.

## Productos

- **Lista o galería**, con pestañas *Activos*, *En stock* y *Archivados*, filtros por margen y orden.
- **Editor** en cuatro pestañas:
  - *Detalles*: nombre, descripción, foto, cantidad del lote, IVA, margen objetivo y redondeo.
  - *Impresiones*: cada impresión con tiempo, impresora y hasta siete filamentos del inventario (gramos y purga).
  - *Costos*: costos directos y adicionales, más los **materiales del lote** (insumos del inventario).
  - *Resumen*: costo por unidad, precio recomendado, escenarios (mínimo, promo, recomendado, premium),
    precio manual y utilidad.
- **Stock de producto terminado**: «Fabricar para stock» suma unidades al quedar lista la fabricación;
  «Vender» registra una venta desde stock al precio real acordado; el ajuste corrige la cantidad.
- **Edición rápida** de precio y stock desde el menú ⋯ de cada producto.
- **Al guardar un producto con costo nuevo**, la app ofrece pasar ese costo (y sus materiales) a los pedidos
  abiertos que lo usan.
- **Listas de precios** (Precios rápidos) para trabajos por tamaño y extras; **Catálogo** público con los
  productos visibles y su precio, en `catalogo.html`.

## Inventario

- **Lista** de filamentos e insumos con disponible (físico − reservado), reservado, mínimo, costo promedio,
  estado y barra de nivel. Botones rápidos **+** (ingreso) y **−** (salida); tocar la fila abre la ficha.
- **Ficha del material**: resumen y valor en stock, **Ingreso / Salida / Ajustar al real** (con la opción de
  **pesar el rollo**: peso en balanza − carrete vacío), ingresos por rollos o paquetes, datos editables
  (nombre, marca, color, mínimo, notas, gramos por rollo, carrete vacío, unidades por paquete), precio
  promedio con historial y **Corregir**, **Dónde se usa** e **Historial** con saldo y **Deshacer** del último
  movimiento.
- **Modo conteo**: todos los materiales en una pantalla para el inventario físico; guarda solo lo que cambia.
  La app recuerda la fecha de conteo de cada material y avisa cuando pasan 30 días.
- **Lista de compras**: lo que falta para cubrir lo reservado, los pedidos abiertos sin reserva y el mínimo,
  con costo estimado, «Registrar compra» y «Copiar lista».
- **Reservas**: un pedido con producto reserva sus materiales; al quedar *Listo* o *Entregado* (o al
  «Confirmar consumo real», con mermas) se descuentan.

## Cotizaciones

- Desde un producto o rápida (sin producto). Folio, cliente, vigencia, entrega, condiciones y contacto;
  se ve como documento, PDF o imagen para WhatsApp.
- Estados: abierta, aceptada, rechazada, vencida. **Convertir en pedido** crea el pedido con su abono.
- Si se guardó sin costo, su utilidad usa el costo del producto vinculado.

## Pedidos

- **Lista** con filtros (En curso, Atrasados, Por cobrar, Fabricación, por estado, Todos). Arriba aparecen
  los avisos de **revisión** (pedidos que no coinciden con su producto: corregir uno o todos) y de stock bajo.
- **Ficha del pedido** (página propia): cliente, cantidad, entrega, venta, costo y utilidad; *Pedir fotos*,
  *Seguimiento* (enlace para el cliente) y *Cotización*; **Avisar al cliente** por WhatsApp con el mensaje del
  estado; **Pagos** (abonos, saldo, recordatorios); **Materiales y stock** (reserva, consumo real, «Usar
  materiales actuales del producto»); **Fotos del trabajo**; estado, entrega, costos reales y notas;
  *Registrar falla* y *Eliminar*.
- **Estados**: pendiente → imprimiendo → armado → listo → entregado (o cancelado). Al cambiar el estado, la
  app ofrece enviar el aviso al cliente.
- **Fabricación para stock**: suma unidades al producto al quedar lista; no es una venta.
- **Trabajo a medida sin producto**: se puede vincular a un producto o crear uno desde el pedido.

## Clientes y archivos

- **Ficha del cliente** (página propia): cotizaciones, pedidos, vendido y por cobrar, WhatsApp, datos, notas
  e historial. Los clientes se crean solos al cotizar o vender con un nombre nuevo.
- **Archivos de clientes**: enlace de 48 horas para que el cliente suba sus fotos originales (sin
  compresión); se revisan, archivan o eliminan.

## Kit de marca

Los recursos gráficos oficiales del equipo: logotipos (fondo claro, oscuro o transparente), tarjetas de
presentación y de agradecimiento, redes sociales (WhatsApp, Instagram, portadas, publicaciones), etiquetas y
stickers, recursos de la app y otros.

- **Buscar y filtrar** por categoría, favoritos, oficiales o archivados. Cada tarjeta muestra el formato, el
  tamaño y las medidas.
- **Abrir** un recurso para verlo, **descargar el original** (el mismo archivo que se subió) o **copiar** su texto.
- **Subir**: botón o arrastrar archivos (PNG, JPG, WebP, SVG, PDF o ZIP, hasta 50 MB). No se comprimen ni se
  cambian de tamaño. Al subir se elige la categoría, el fondo y si es una nueva versión de un diseño.
- **Versiones**: un diseño puede tener varias; la **vigente** es la que se usa. Se cambia desde la ficha.
- **Oficial** y **Favorito**, **Editar**, **Archivar** (se restaura desde el filtro Archivados) y **Eliminar**.
- **Lo que falta** lista las piezas esperadas que aún no se han subido. **Agregar archivos de la app** suma los
  archivos de la marca que ya tiene KultiApp; la primera vez que un editor abre el kit vacío se cargan solos.
- Arriba se ve el espacio usado frente al límite gratuito (1 GB para todo el proyecto).
- Los visores pueden ver y descargar; propietarios y editores administran.

## Impresoras

Consumo eléctrico, horas de uso (suman al terminar pedidos), aviso de mantención y registro de **fallas**
(material y tiempo perdidos, que pueden descontarse del inventario y cuentan como merma del mes).

## Reportes

Mes a mes: ventas, utilidad (real o estimada), cobrado, cotizaciones y tasa de cierre, fabricación para stock,
por producto y por cliente, costo estimado vs real y gráfico de 6 meses. Exportación a Excel.

## Finanzas

**Tu dinero hoy** (materia prima, productos fabricados, por cobrar e ingreso proyectado), utilidad real del
mes (ventas netas − costo de lo vendido − gastos − mermas), punto de equilibrio, **gastos** (con IVA),
**IVA del mes** y **cuentas entre socios** con transferencias.

## Mi perfil

Foto, nombre, nombre de usuario y WhatsApp; email de acceso (con confirmación); contraseña (10+ caracteres,
letras y números, revisada contra filtraciones); tema claro, oscuro o automático; respaldo de datos (Excel para revisar o JSON completo);
instalar la app y cerrar sesión.

## Páginas públicas

- `seguimiento.html#…`: el cliente ve el avance de su pedido (sin montos).
- `catalogo.html#…`: catálogo de productos visibles con pedido por WhatsApp.
- `subir.html#…`: el cliente sube sus fotos con el enlace de 48 horas.
