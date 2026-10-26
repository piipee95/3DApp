---
name: kultiapp-pruebas
description: Validación de cambios en KultiApp con sus herramientas reales (ESLint, pruebas jsdom tests/<tema>.test.cjs con backend simulado, CodeQL y gitleaks en CI). Usar al preparar, escribir, ejecutar o informar pruebas de cualquier cambio.
---

# Skill: pruebas de KultiApp

## Comandos

```sh
npm ci
npm run lint   # ESLint (eslint.config.mjs)
npm test       # tests/run.cjs: cada tests/*.test.cjs en su propio proceso
```

CI (`.github/workflows/`): `test.yml` (Node 22: lint y pruebas), `codeql.yml` (seguridad) y `secrets.yml` (gitleaks). Dependabot propone actualizaciones semanales.

## Escribir una prueba

- Una suite por tema, nombrada por lo que revisa: `tests/<tema>-<qué>.test.cjs` (por ejemplo `inventario-ficha-y-conteo.test.cjs`), con `boot()` de `tests/boot.cjs` (jsdom y backend simulado) y `dom.window.run(...)`. `tests/run.cjs` la encuentra sola.
- Terminar con `console.log('PASS …')` describiendo lo comprobado y `process.exitCode=1` si falla.
- Si cambian cifras que se muestran en varias pantallas, ampliar `tests/recorrido-completo.test.cjs`.
- Datos ficticios. Nunca datos reales de clientes ni escrituras en Supabase.

## Reglas

- Un fallo se investiga y se corrige; nunca se desactiva, omite o debilita una prueba ni una regla de ESLint para obtener verde.
- Si cambia la lista de scripts, comprobar `index.html` y `SHELL` de `sw.js` (las pruebas lo verifican).
- Probar en ancho de celular (unos 360 px) y escritorio, y en los temas claro y oscuro cuando cambie la interfaz.
- Informar qué se ejecutó, con qué versión de Node y el resultado; distinguir lo ejecutado de lo no reproducido.
