---
name: kultiapp-supabase
description: Base de datos de KultiApp en Supabase (Postgres con RLS, funciones private.*, Storage privado, espacios de trabajo con roles). Usar antes de cualquier cambio de esquema, política RLS, función SQL, bucket o consulta nueva desde el cliente.
---

# Skill: Supabase de KultiApp

## Cómo está organizado

- Todo dato pertenece a un `workspace_id`. Los permisos se comprueban con funciones `private.*` (`private.can_edit_workspace` para escribir, `private.is_workspace_member` para leer) dentro de las políticas RLS.
- Roles del espacio: propietario, editor y solo lectura.
- Fotos en Storage privado (`product-photos`); los enlaces públicos usan tokens propios (seguimiento: 64 hexadecimales; catálogo: `catalog_slug`).
- `docs/migraciones/SCHEMA_V*.sql` es la **referencia** de cada migración ya aplicada (no se vuelve a ejecutar); `docs/BASE_DE_DATOS.md` es la foto del esquema vigente.

## Reglas para un cambio de esquema

1. Escribir el SQL nuevo como `docs/migraciones/SCHEMA_V<versión>.sql`, con la cabecera «Reference of the deployment migration …; do not re-run», y actualizar `docs/BASE_DE_DATOS.md`.
2. Toda tabla nueva: `enable row level security` y políticas para `authenticated` basadas en `private.is_workspace_member` (lectura) y `private.can_edit_workspace` (escritura). Nunca una tabla sin RLS.
3. Funciones `security definer` con `set search_path = ''` y comprobación de `auth.uid()` y permisos al principio.
4. `grant` por columna cuando el cliente solo debe escribir algunas columnas.
5. Restricciones `check` para longitudes, formatos y rangos; no confiar solo en la validación del cliente.
6. La migración se aplica en Supabase **antes** de publicar el cliente que la usa, y solo lo hace el dueño o con su autorización expresa.
7. Las pruebas usan el backend simulado de `tests/`; nunca escriben en el Supabase real.

## Prohibido

- Aplicar migraciones, borrar datos o cambiar buckets sin autorización expresa.
- Exponer datos de un espacio a otro, o datos privados en las páginas públicas.
