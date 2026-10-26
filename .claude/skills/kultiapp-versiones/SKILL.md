---
name: kultiapp-versiones
description: Versionado, notas de versión, ramas y publicación de KultiApp (sitio estático en Vercel: main publica producción, las demás ramas generan vistas previas). Usar al cerrar un cambio, subir la versión, escribir docs/versiones/VX_Y.md o preparar commit, rama y PR.
---

# Skill: versiones y publicación de KultiApp

## Publicación

- Vercel (proyecto `costos3d`) publica el sitio estático desde la raíz del repositorio. URL de producción: `https://kultiapp.vercel.app` (`costos3d.vercel.app` redirige a ella). **Fusionar en `main` publica** para todos los usuarios.
- Cada rama y PR recibe una vista previa de Vercel; sirve para revisar en el celular antes de fusionar.
- Si el cambio necesita una migración, esta se aplica en Supabase antes de fusionar (Skill `kultiapp-supabase`).

## Al cerrar una versión

1. Si cambia la app, subir juntos `APP_VERSION` en `js/01-core.js` (versión visible en pantallas y login) y `CACHE` en `sw.js` (`kultiapp-vNN`), para que los celulares reciban la versión nueva. Un cambio solo de herramientas o CI no los cambia.
2. Escribir `docs/versiones/VX_Y.md` en español sencillo (qué cambia para quien usa la app y cualquier paso que deba hacer el dueño) y su resumen al inicio de `docs/HISTORIAL.md`.
3. Si hay esquema nuevo: `docs/migraciones/SCHEMA_VXY.sql` y actualizar `docs/BASE_DE_DATOS.md`.
4. Si cambia cómo se usa algo, actualizar `docs/MANUAL.md`.

## Versiones redondas (5.0, 6.0, 7.0…)

Son de **consolidación**: casi sin funciones nuevas, se sigue la lista de `docs/CONSOLIDACION.md` (recorrido completo, datos reales, coherencia, código por tema, pruebas, base de datos, documentación e identidad). Se trabaja en una rama aparte, se revisa en la vista previa y se publica completa.

## Git

- Trabajar sobre el `main` más reciente, en una rama propia; nunca commits directos en `main`.
- Commits con el prefijo de versión, por ejemplo `V3.6: …`.
- Push, PR y fusión solo con autorización del dueño. Sin force-push ni reescritura de historia.
- Antes de pedir revisión: `npm run lint` y `npm test` en verde y CI en verde.
