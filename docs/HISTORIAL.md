# V5.3.2 — Menús anclados y avisos nuevos

Campana con burbuja de nuevos, Configuración desplegable, perfil único abajo y logo centrado. Ajuste responsive a 320 px. Ver `versiones/V5_3_2.md`.

# V5.3.1 — Editor de estudio

Resumen lateral en escritorio, guardado accesible en móvil y jerarquía financiera unificada. Sin cambios en cálculos ni backend. Ver `versiones/V5_3_1.md`.

# V5.3.0 — Estudio de productos

Galería con vista previa, campana de pendientes existentes y acceso superior de cuenta. Conserva tabla, preferencias, datos y cálculos. Ver `versiones/V5_3_0.md`.

# Historial de KultiApp

Resumen de cada versión, de la más reciente a la más antigua. El detalle completo de cada una está en `docs/versiones/`.

## Reparación de backend · Guardado de productos

- `save_product_bundle_v5` incorpora su cadena interna para dejar de llamar a las RPC retiradas en 5.0.
- Permisos, RLS, validaciones y cálculos conservados. No requiere recargar el borrador ni cambia la
  versión visible 5.2.2. Detalle en `docs/versiones/V5_2_3.md`.

## 5.2.2 · Paleta Kultiverso Pop

- Paletas clara y oscura con superficies neutras, magenta como acción y cian como apoyo.
- Mejora de contraste en textos, enlaces, estados y botones; acentos originales del logo conservados.
- Accesos rápidos más sobrios; selección de tema y funcionamiento existentes conservados.

## 5.2.1 · Claridad y accesibilidad

- Inicio prioriza pendientes y cifras operativas; conserva todos los indicadores y accesos.
- Etiquetas únicas en el costeo, IVA con controles independientes y objetivos táctiles más cómodos.
- Orientación en filtros vacíos y mensajes de WhatsApp desplegables, sin cambiar cálculos ni reglas.

## 5.2 · Estado «Enviado»

- Nuevo estado de pedido **Enviado**, entre Listo y Entregado: el pedido va en camino, sigue en curso pero no se
  marca atrasado.
- Aviso por WhatsApp «ya va en camino», paso «Enviado» en el seguimiento del cliente y recordatorio de cobro si
  queda saldo.

## 5.1.3 · Carga del kit sin cortes

- Si la carga del kit se interrumpe (página cerrada o recargada), se retoma sola al volver a abrirlo; salir a
  mitad de la carga pide confirmación.
- Los archivos de la marca pendientes se muestran en un aviso visible con «Agregar ahora».

## 5.1.2 · El kit se ordena solo

- La primera vez que un propietario o editor abre un Kit de marca vacío, se cargan solos todos los archivos de
  la marca, cada uno en su categoría, con una barra de avance. Después no se repite (lo borrado no vuelve).

## 5.1.1 · Kit oficial en el Kit de marca

- Los paquetes del equipo («KIT PNG V3» y «Tarjetas y etiquetas») quedan listos para agregar: logos, isotipo K,
  tarjetas, etiquetas, piezas web, íconos y referencia, más la foto de perfil de Instagram.

## 5.1 · Kit de marca

- Sección **Kit de marca**: logos, tarjetas, redes sociales, etiquetas y recursos de la app, con búsqueda y filtros.
- Vista previa segura, descarga del original sin cambios, copiar textos, oficial y favorito, versiones vigentes.
- Subida por botón o arrastre (PNG, JPG, WebP, SVG, PDF, ZIP hasta 50 MB) y límites reales del plan.
- Logo, íconos y piezas para WhatsApp (perfil, portada y estado) listos para agregar al kit.

## 5.0 · Consolidación

- Identidad «KultiApp — El taller bajo control».
- Fichas de Pedido y Cliente como página con enlace propio; vocabulario y menús unificados.
- Código reorganizado por tema, pruebas por tema con prueba del recorrido completo, revisión con datos reales.
- Manual, arquitectura, base de datos y lista de consolidación para las próximas versiones redondas.

## 4.9 · Ficha del material y Modo conteo

- **Resumen**: tienes, reservado, disponible y mínimo, barra de nivel, valor en stock y, en filamentos, cuántos rollos equivale.
- **Ingreso / Salida / Ajustar al real** con botones grandes.
- **Datos editables**: nombre, marca, color, mínimo, notas (dónde lo compras), disponible. En filamentos: gramos por rollo y peso del carrete vacío. En insumos: unidades por paquete.
- **Precio**: costo promedio, precio por rollo o paquete, historial de precios pagados y **Corregir** (para un precio mal ingresado, sin registrar compra).
- … y 8 cambios más (ver detalle).

## 4.8 · Revisión de pedidos y lista de compras

- En **Pedidos** aparece un aviso cuando algún pedido abierto no coincide con su producto: faltan o sobran materiales, cambian las cantidades o el costo.
- **Revisar** muestra cada pedido con sus diferencias, y se puede **Corregir** uno por uno o **Corregir todos**. Si un pedido no se puede corregir (por ejemplo, por falta de stock), muestra el motivo y los demás se corrigen igual.
- Los pedidos con consumo registrado conservan las cantidades reales que ingresaste (con mermas); solo se marcan si les falta o les sobra un material.
- No se revisan los pedidos entregados, cancelados ni las ventas desde stock.
- … y 4 cambios más (ver detalle).

## 4.7 · Materiales del pedido según el producto

- En «Materiales y stock» de cada pedido (con producto, no vendido desde stock) aparece **«Usar materiales actuales del producto»**: reemplaza la lista por la receta actual aunque el costo no haya cambiado (por ejemplo, pedidos creados…

## 4.6 · Pedidos con los materiales actuales del producto

- **Reservado**: se libera la reserva anterior y se reserva la receta nueva (revisa stock).
- **Consumo registrado**: el stock se mueve solo por la diferencia (consumo extra o devolución del sobrante) y el costo real se ajusta.
- **Sin materiales**: se reserva la receta ahora (y se consume si el pedido ya está listo).

## 4.5 · Menús más limpios y un enlace por sección

- **Menús sin duplicados**: contraseña, tema, respaldo de datos y cerrar sesión viven solo en «Mi perfil». El menú de cuenta (escritorio) deja «Mi perfil»; en «Más» se entra tocando tu nombre.
- **Un enlace por sección**: `#inicio`, `#productos`, `#producto/<id>`, `#cotizaciones`, `#pedidos`, `#clientes`, `#reportes`, `#finanzas`, `#inventario`, `#impresoras`, `#archivos`, `#perfil`.

## 4.4 · Mi perfil

- **Foto de perfil**: se sube optimizada al bucket de fotos del taller; aparece en el menú lateral, en «Más» y en la página. Se puede cambiar o quitar.
- **Datos personales**: nombre, nombre de usuario (`@usuario`: minúsculas, números, punto o guion bajo) y tu WhatsApp. Se guardan en los metadatos del usuario de Supabase.
- **Email de acceso**: cambiarlo envía un enlace de confirmación; hasta confirmarlo se sigue entrando con el actual y la página muestra el cambio pendiente.
- **Contraseña**: misma política que antes (10+ caracteres, letras y números, revisión de filtraciones).
- … y 1 cambios más (ver detalle).

## 4.3 · costos al día, «Mi perfil» y pantalla de carga con el logo

- **Costo del producto → pedidos**: cada pedido guarda el costo con el que se creó, para que el historial no cambie solo. Ahora:
- **Mi perfil** (menú de cuenta en el escritorio, «Más» en el celular): ver y editar tu nombre. Se usa en el menú, en el saludo de Inicio y en las iniciales del avatar. El email se muestra sin poder editarse.
- **Pantalla de carga** con el logo de Kultiverso Pop flotando, la barra con los colores de la marca y el texto «Cargando tu taller…». Las secciones que cargan muestran la franja de colores de la marca.

## 4.2 · vitrina, Inicio personal y animaciones

- **Vista galería en Productos**: el botón junto a los filtros cambia entre lista y galería. La galería muestra tarjetas grandes con foto, la etiqueta «N en stock», el precio, el margen, el costo y el botón «Vender». Cada dispositivo…
- **Inicio personal**:
- **Animaciones suaves**: las tarjetas aparecen en cascada, los botones responden al toque, las tarjetas se elevan al pasar el mouse y el check del aviso aparece con un pequeño salto. Si el dispositivo pide reducir el movimiento, las…
- **Corrección**: al cerrar un diálogo (por ejemplo, Vender) ya no queda una línea azul entre los productos.

## 4.1 · vender desde el stock

- **Botón «Vender»** en Productos (pestañas Activos y En stock, solo si hay unidades disponibles) y en la ficha del producto, junto a «Fabricar para stock».
- **El precio lo pones tú**: viene el sugerido, pero escribes el precio al que realmente lo vendiste (más caro o más barato). La app muestra el total, la ganancia y el margen sobre el costo, y la diferencia contra el sugerido.
- Cliente y WhatsApp opcionales. Sin cliente queda como «Venta directa».
- «Ya me pagaron» (marcado por defecto) registra el pago completo con su medio y quién lo recibió.
- … y 1 cambios más (ver detalle).

## 4.0 · avisos al cliente por WhatsApp y stock separado

- **WhatsApp del cliente** en «Nuevo pedido», «Nueva cotización» y «Pedido de cliente». Se guarda en su ficha de Clientes, y al elegir un cliente conocido el número aparece solo.
- **«Avisar al cliente»** en cada pedido muestra el mensaje según el estado, más el enlace de seguimiento si existe:
- **Al cambiar el estado** de un pedido, la app pregunta «¿Avisar a …?» con el mensaje listo.
- **Envío 100 % automático**, sin tocar nada: requiere la API de WhatsApp Business de Meta (cuenta verificada, plantillas aprobadas y costo por mensaje) más un servidor. Por ahora queda en un toque por aviso.
- … y 1 cambios más (ver detalle).

## 3.9 · menús ⋯ que no se cortan

- Los menús ⋯ (Inventario, Productos, Archivos…) ahora flotan sobre la lista: se ubican junto a su botón y se abren hacia arriba si no hay espacio abajo, tanto en el celular como en el computador. Al hacer scroll se cierran.
- WhatsApp del negocio configurado: +56 9 4840 6731 (`catalog_whatsapp`), usado en el catálogo («Lo quiero») y en la página de seguimiento («Escribir por WhatsApp»).

## 3.8 · tu dinero en stock

- **Materias primas**: filamento + insumos contados, al costo promedio de compra.
- **Productos fabricados**: unidades en stock por su costo de fabricación.
- **Invertido en stock**: la suma de los dos anteriores.
- **Si vendes lo fabricado**: unidades en stock por su precio de venta, más la utilidad proyectada (neto sin IVA − costo).
- … y 2 cambios más (ver detalle).

## 3.7 · la fabricación para stock queda como stock

- Una fabricación para stock en estado «Listo» está terminada: sus unidades ya se sumaron al stock del producto y sus materiales se descontaron. Ya no aparece como pedido en curso, ni en Inicio, ni en Pedidos («En curso», «Listo», «Todos»).
- En Pedidos solo aparecen en «Fabricación», como registro. Las fabricaciones que todavía están imprimiendo siguen en «En curso» porque son trabajo pendiente.
- Nueva pestaña **Productos → «En stock»**: los productos con unidades disponibles, con el total disponible en la pestaña.
- Al crear una fabricación con «Ya está fabricado», la app lleva a Productos → «En stock».
- … y 2 cambios más (ver detalle).

## 3.6 · inventario más simple

- **En cada material**:
- **Lenguaje simple**:
- **Editar material**: precio y «Cantidad que tienes» en el mismo formulario. Un material nuevo puede crearse ya contado.
- **Archivar**: deja de aparecer al crear productos o pedidos, pero se conserva.
- … y 2 cambios más (ver detalle).

## 3.5 · seguridad y calidad automáticas

- **Tests** (`.github/workflows/test.yml`): ahora corre `npm run lint` (ESLint) antes de `npm test`. Detecta errores típicos: variables mal escritas, código que nunca se ejecuta, claves repetidas, etc. Esto también aplica a los cambios…
- **CodeQL** (`.github/workflows/codeql.yml`): análisis de seguridad del JavaScript en cada PR, en cada cambio a `main` y una vez por semana. Los hallazgos aparecen en GitHub, en Security → Code scanning.
- **Secrets** (`.github/workflows/secrets.yml`): gitleaks bloquea commits que contengan contraseñas, llaves privadas o tokens. La llave publicable de Supabase (`sb_publishable_…`) es pública por diseño y está permitida en…
- **Dependabot** (`.github/dependabot.yml`): cada semana propone, con un PR, actualizar los paquetes de npm y las acciones de GitHub. Los arreglos de seguridad llegan apenas existen.

## 3.4 · Recordatorios

- **Pendientes en Inicio**, del más urgente al menos urgente:
- Cada aviso abre su pedido, cotización o sección. Se muestran 6 y «Ver los N avisos» abre la lista completa. Si no hay nada, aparece «Todo al día».
- **Aviso diario**: la primera vez que se abre Inicio cada día aparece un resumen, por ejemplo «Hoy: 1 atrasado · 1 entrega hoy · …». Cada dispositivo lo recuerda por día.
- Los avisos funcionan dentro de la app. Para que lleguen al celular con la app cerrada (notificación push, correo o WhatsApp automático) se necesita un servicio externo, como una Edge Function con tarea programada en Supabase y un…
- … y 1 cambios más (ver detalle).

## 3.3 · Nueva paleta y modo claro

- **Modo oscuro «Grafito»**: negro neutro en vez del azul noche. Se mantienen el magenta, el cian y el amarillo de Kultiverso Pop.
- **Modo claro**: fondo blanco, textos oscuros y los mismos acentos de la marca en tonos con buen contraste.
- **Selector de tema** con tres opciones: Automático, que sigue al celular o computador; Oscuro; y Claro. Está en el menú de cuenta (escritorio) y en «Más» (celular). Cada dispositivo recuerda su elección.
- Los colores fijos del CSS se pasaron a tokens (`color-mix`), así que los avisos, chips y fondos se ven bien en ambos temas.
- … y 3 cambios más (ver detalle).

## 3.2 · Páginas públicas y versión visible

- En cada pedido de cliente: botón «Seguimiento» → «Crear enlace de seguimiento».
- El enlace (`/seguimiento.html#token`) es privado: 64 caracteres al azar, imposible de adivinar.
- El cliente ve el estado en pasos, la fecha estimada, el total, lo pagado y el saldo, más las fotos del trabajo terminado. No ve costos, utilidad, notas internas ni datos de otros pedidos.
- Se envía por WhatsApp con el mensaje ya escrito. «Desactivar enlace» lo corta al instante.
- … y 6 cambios más (ver detalle).

## 3.1.1 · Referencia Create UI y originales del cliente

- https://createui.co/docs/installation — requiere React y Tailwind v4.
- https://createui.co/legal/license — B1 permite la biblioteca gratuita bajo licencia tipo MIT; B2 es de pago.
- https://github.com/createui/createui-components/blob/main/LICENSE — MIT del repositorio público; no autoriza componentes Pro.
- https://createui.co/docs/components/file-upload — File Upload es Pro y Dropzone es gratuito.

## 3.1 · Producción

- «Registrar falla» desde Impresoras o desde un pedido (botón junto a «Guardar avance»).
- Motivo, fecha, impresora, filamento, gramos y horas perdidas. El costo se calcula solo (filamento a su precio + electricidad de la impresora) y se puede corregir.
- Si el filamento está contado en Inventario, se puede descontar como merma.
- Si viene de un pedido, el costo se suma a «fallas» del pedido. Las horas perdidas se suman al contador de la impresora.
- … y 8 cambios más (ver detalle).

## 3.0 · Precios rápidos para personalizados

- **Productos → «Precios rápidos»**: tablas con un nombre (p. ej. «Cuadro personalizado»), tamaños o versiones con su precio y extras opcionales (luz LED, nombre grabado…), con IVA incluido o no. Se pueden desactivar o eliminar sin…
- En **Nueva cotización** y **Nuevo pedido**: «Precio desde tabla» → eliges tamaño y extras y se completan el precio por unidad, el IVA y el nombre del trabajo («Cuadro personalizado 30×40 + Luz LED»). Si escribes el nombre a mano, se…
- Base de datos: migración `kultiapp_v30_price_lists` (referencia `docs/SCHEMA_V30.sql`); el respaldo incluye las tablas. Código: `js/20-price-lists.js`.

## 2.9 · Finanzas: gastos, utilidad real, IVA y cuentas entre socios

- **Utilidad real**: ventas netas − costo de lo vendido (costo real del pedido o, si no hay, el estimado) − gastos del negocio. Muestra el margen bruto y el **punto de equilibrio** (ventas necesarias para cubrir los gastos del mes con el…
- **Gastos**: monto, fecha, categoría (arriendo, luz/agua/internet, publicidad, herramientas, suscripciones, envíos, compra de materiales, otros), detalle, quién lo pagó y si tiene factura (calcula el IVA recuperable). «Compra de…
- **IVA del mes (estimado)**: IVA de ventas − IVA de compras con factura = a pagar o remanente.
- **Cuentas entre socios**: socios y porcentaje (deben sumar 100%). Por socio: lo que cobró (pagos con «Lo recibió»), lo que pagó (gastos), transferencias entre ellos, lo que tiene y lo que le corresponde. Propone quién le debe a quién…
- … y 4 cambios más (ver detalle).

## 2.8 · Código dividido en archivos

- Los archivos son scripts clásicos que comparten un ámbito global y se ejecutan en el orden de `index.html` (el módulo del SDK primero). Ningún archivo ejecuta lógica al cargarse salvo registrar eventos, por lo que el orden solo importa…
- `sw.js` guarda todos los archivos para abrir sin conexión (caché `kultiapp-v28`).
- Las pruebas leen el orden desde `index.html`. Se verificó además la app real en el navegador con los archivos separados recorriendo todas las secciones, sin errores.

## 2.7 · Registro de errores y carga liviana

- Los errores de la app (fallas no controladas y mensajes de error que ve el usuario) se guardan en la tabla `app_errors` con la pantalla, la versión y el navegador. Máximo 20 errores distintos por sesión, sin repetir. Solo miembros del…
- Base de datos: migración `kultiapp_v27_app_errors` (referencia en `docs/SCHEMA_V27.sql`).
- Al abrir, la app trae pedidos de los últimos 12 meses más los que siguen abiertos, cotizaciones de 12 meses más las enviadas, y pagos de 24 meses.
- Reportes trae los meses anteriores solo cuando navegas hacia atrás (una vez por rango).
- … y 1 cambios más (ver detalle).

## 2.6 · Pedidos a medida que descuentan material

- En un pedido a medida (sin producto), **«Vincular producto»** elige un producto costeado del catálogo (muestra su costo por unidad y del pedido). El precio acordado no cambia.
- Al vincular: se fija el costo estimado del pedido con el costo del producto, se **reservan** su filamento e insumos, y si el pedido ya estaba «Listo» o «Entregado» se **descuentan** al instante. Si falta stock o un material no tiene…
- **«Crear producto»** desde el trabajo recuerda el pedido: al guardar el producto pregunta si vincularlo de inmediato.
- La cotización de origen (si existe) queda asociada al mismo producto.
- … y 1 cambios más (ver detalle).

## 2.5 · Crear pedidos y cotizaciones sin producto

- Botón **«Nuevo»** en el menú lateral y en Inicio (teléfono): Cotización, Pedido o Producto. También «Nueva cotización» en Cotizaciones, «Nuevo pedido» en Pedidos y «Cotizar / Nuevo pedido» en la ficha de cada cliente.
- **Pedido rápido**: cliente (se crea si no existe), trabajo, detalle, cantidad, precio final acordado, IVA incluido o no, entrega y **abono recibido** con botón 50% y medio de pago. Se abre el pedido con su saldo. No reserva materiales…
- **Cotización rápida**: se guarda con folio COT-… y se abre para compartir (WhatsApp, imagen o PDF). Al aceptarla se crea el pedido con el mismo precio y el atajo de abono 50%.
- **Desglose después**: en un pedido a medida, registra los costos reales del lote para ver la utilidad, o usa **«Crear producto»** para costearlo en detalle con el precio acordado ya cargado.
- … y 3 cambios más (ver detalle).

## 2.4 · Archivos de clientes pulido

- **Sección Archivos** con el diseño del resto de la app: filtros Esperando / Recibidos / Vencidos / Todos, filas con estado, tiempo restante (p. ej. «quedan 39 h») y pedido asociado; los envíos nuevos se destacan.
- Integra la V2.3.1: pestañas **Activos / Archivados** y, en el menú ⋯ de cada solicitud, archivar, restaurar o eliminar con sus fotos (con reintento si el borrado queda a medias).
- Acciones según el estado: los enlaces activos muestran «Enlace» y desactivar; los recibidos solo «Ver archivos»; los vencidos no muestran acciones inútiles.
- En el pedido, **«Pedir fotos»** queda junto a «Cotización» (no en fabricación para stock).
- … y 4 cambios más (ver detalle).

## 2.3 · Archivos originales del cliente

- Bucket `customer-originals` privado, separado del catálogo. No se modifica `product-photos`.
- Token de solicitud aleatorio de 256 bits, transmitido en fragmento URL (no en referer/consulta HTTP). No hay listado público de solicitudes ni archivos.
- La RPC valida token, vencimiento, cierre, formato, tamaño y límite de cupos bajo bloqueo de fila; cada ruta de carga tiene una capacidad aleatoria independiente. La subida solo permite INSERT, sin reemplazar ni leer otros archivos.
- Finalizar valida presencia y metadatos del objeto. Completar cierra el enlace en servidor. Reintentos pueden reconciliar una subida completada antes de perder conexión.
- … y 3 cambios más (ver detalle).

## 2.2 · Mejoras visuales

- **Indicadores de carga**: al cambiar de sección o abrir la app se muestra la silueta de la pantalla mientras llegan los datos, en vez de un instante vacío.
- **Transiciones**: entrada suave al cambiar de sección, ventanas que aparecen con una animación corta (en el teléfono suben desde abajo) y respuesta táctil en botones. Se desactivan si el sistema tiene «reducir movimiento».
- **Editor de producto**:
- Base de datos: regla de seguridad de movimientos de inventario optimizada (`kultiapp_v22_rls_initplan`).

## 2.1 · Reportes del mes y respaldo de datos

- Nueva sección **Reportes** (en el teléfono, dentro de «Más») con selector de mes.
- Indicadores: ventas (con variación vs el mes anterior), utilidad y margen, cobrado en el mes, ticket promedio, cotizaciones y tasa de aceptación, y saldo por cobrar a la fecha.
- Gráfico de ventas y utilidad de los últimos 6 meses.
- Tablas por producto (unidades, ventas, utilidad, margen) y por cliente (pedidos, ventas, saldo).
- … y 7 cambios más (ver detalle).

## 2.0 · Abonos, saldos y WhatsApp

- Cada pedido de cliente muestra **Total, Pagado y Saldo** con barra de avance y estado (Sin pago / Abonado / Pagado). Las fabricaciones para stock y los pedidos cancelados no generan saldo.
- **Registrar pago**: monto (atajos 50% y saldo completo), medio (transferencia, efectivo, tarjeta, otro), fecha y nota. Los pagos se pueden eliminar si se registraron por error.
- **Abono inicial** opcional al crear un pedido o al convertir una cotización aceptada.
- Inicio: indicador **Por cobrar** con acceso al filtro; Pedidos: filtro «Por cobrar» y saldo en cada fila; Clientes: deuda por cliente.
- … y 3 cambios más (ver detalle).

## 1.9 · Búsqueda global y app instalable

- Botón «Buscar» en la barra lateral y lupa en la cabecera del teléfono; atajos **Ctrl/⌘ K** y **/**.
- Busca a la vez en productos, cotizaciones (COT-…), pedidos (PED-…), clientes e inventario. Ignora tildes y mayúsculas, y exige todas las palabras escritas.
- Flechas ↑ ↓ para moverse, Enter para abrir. Vacía muestra accesos a cada sección y acciones rápidas (nuevo producto, nuevo cliente).
- `sw.js`: service worker que guarda la app para abrirla sin conexión. Los archivos de la app van primero a la red (cada despliegue llega de inmediato); fuentes y la librería de Supabase se sirven desde caché. Los datos de Supabase nunca…
- … y 3 cambios más (ver detalle).

## 1.8 · Cotizaciones guardadas y Clientes

- **Cotizaciones** (nueva sección; en el teléfono está en «Más»): cada cotización que un editor imprime, comparte o guarda queda registrada con folio correlativo `COT-0001`. Filtros Abiertas, Vencidas, Aceptadas y Rechazadas; resumen de…
- **Clientes** (nueva sección): se crean solos al escribir un cliente nuevo en una cotización o pedido (el campo sugiere los existentes). Contacto, notas, enlace a WhatsApp, historial de cotizaciones y pedidos y total vendido.
- **Pantalla recordada**: al recargar o reabrir la app vuelve a la sección (o producto y pestaña) donde estabas.
- **Ventanas con formularios** ya no se cierran al tocar fuera; solo con su botón o Esc.

## 1.7 · Stock de producto, fabricación y selector de filamento

- **Dos tipos de pedido**
- **Stock del producto**: tarjeta en Resumen (disponible / reservado), columna Stock en la lista de productos y **Ajustar conteo** con historial de movimientos (fabricación, venta, ajuste).
- **Precio y stock** desde el menú ⋯ de cada producto: precio final (vacío = automático), margen objetivo y stock real con vista previa del margen.
- **Selector de filamento**: al agregar un color se abre una grilla con color, marca, $/kg y gramos disponibles (rojo si no alcanza). Los colores vinculados muestran una ficha compacta.
- … y 1 cambios más (ver detalle).

## 1.6 · rediseño profesional

- `styles.css` reescrito como sistema de diseño con variables (colores del kit, tipografía Montserrat, radios, sombras). Se conservan las reglas de la hoja de cotización y de impresión.
- Navegación: menú lateral en escritorio (con contadores y menú de cuenta) y barra inferior en el celular con hoja "Más" (invitar socio, cambiar contraseña, cerrar sesión).
- Barra de página por vista (`header(título, acciones, {back})`), sin títulos repetidos ni textos explicativos de relleno.
- Íconos Lucide incrustados en `ICONS` (sin CDN).
- … y 12 cambios más (ver detalle).

## 1.5 · Mejoras

- Las etiquetas de los diálogos se escapan: un nombre de material ya no puede inyectar HTML.
- Los parámetros compartidos (filamento, electricidad, potencia) solo se guardan si se editaron en la sesión. Los borradores anteriores ya no revierten esos valores.
- Los enlaces de invitación funcionan con sesión iniciada y los errores se muestran.
- Nuevo bucket privado `product-photos` (JPEG, máx. 1 MB). Ruta: `<workspace_id>/<uuid>.jpg`. Políticas: miembros leen; propietarios y editores suben, reemplazan y eliminan.
- … y 22 cambios más (ver detalle).

## 1.4 · Inventario conectado

- Unidades de control: un, hoja, m, g, kg, l. Los filamentos siempre usan g y mantienen el precio/kg compatible con el costeo anterior.
- La unidad queda fija después del primer movimiento. Impresoras se administran aparte; no son material consumible.
- Stock físico, reservado y disponible se muestran separados. Bajo stock significa disponible <= mínimo configurado. Alertas dentro de la app, sin avisos externos automáticos.
- Compras calculan el promedio ponderado; salidas no modifican el costo unitario. Un conteo inicial de cero es válido.
- … y 8 cambios más (ver detalle).

## 1.3 · Cotización y producción

- Venta bruta = unidades × precio final por unidad.
- Venta neta = venta bruta / (1 + IVA), si aplica.
- Costo real = costo real base + fallas adicionales.
- Utilidad real = venta neta − costo real.
- … y 1 cambios más (ver detalle).

## 1.2 · Mejoras

- Hasta siete filamentos por impresión: nombre/material, muestra de color, gramos de pieza, purga y precio por kilogramo. Si el peso del slicer incluye purga, registrar ese peso como pieza y dejar purga en cero.
- El desglose recalcula gramos y costo de filamento automáticamente. Las impresiones anteriores conservan su costo manual mientras no se agreguen colores.
- Duplicación independiente de impresiones dentro del producto.
- Foto optimizada a JPEG, máximo 800 px de lado y 250.000 caracteres, guardada con el producto bajo las políticas existentes del workspace. La foto original no se sube. Las fotos HEIC dependen de la compatibilidad del navegador.
- … y 4 cambios más (ver detalle).
