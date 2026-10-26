# Versiones de consolidación (5.0, 6.0, 7.0…)

Las versiones **x.1 a x.9** traen mejoras y funciones nuevas. Cada versión **redonda** (5.0, 6.0, 7.0…) es de
**consolidación**: casi no agrega funciones y deja la app sólida, coherente y documentada antes de seguir.
Se trabaja en una rama aparte, se revisa en la vista previa de Vercel y se publica completa.

## Lista de revisión

1. **Recorrido completo.** Material → producto → cotización → pedido → producción → entrega → cobro →
   finanzas → reportes. Las cifras deben coincidir entre pantallas (valor del inventario, productos en stock,
   ventas y utilidad del mes, por cobrar). La prueba `tests/recorrido-completo.test.cjs` lo cubre; se amplía
   con lo nuevo de la serie.
2. **Datos reales (solo lectura).** El stock de cada material y producto coincide con su historial; las
   reservas con los pedidos; lo consumido por cada pedido con sus movimientos; ningún pago supera su pedido.
3. **Interfaz coherente.** Un solo vocabulario, mismos botones y avisos en el mismo lugar, fichas como página,
   rol de solo lectura, celular (unos 360 px) y escritorio, tema claro y oscuro.
4. **Código.** Cada función en el archivo de su tema, sin código sin uso ni nombres de versión
   (`setupV12`…). Verificar que la app cargue en un navegador real, archivo por archivo.
5. **Pruebas.** Agrupar las suites nuevas de la serie por tema (`tema-que-revisa.test.cjs`).
6. **Base de datos.** Avisos de seguridad y rendimiento de Supabase, índices, permisos por columna, funciones
   antiguas sin uso (retirar el permiso; no borrar) y actualizar `docs/BASE_DE_DATOS.md`.
7. **Documentación.** Actualizar `docs/MANUAL.md`, `docs/ARQUITECTURA.md`, `docs/HISTORIAL.md`, el README y
   las Skills de `.claude/skills/`.
8. **Identidad.** Nombre, subtítulo e íconos al día en todos los lugares (`APP_TAGLINE` en `js/01-core.js`,
   `index.html`, `manifest.webmanifest`, README).

## Pruebas

```sh
npm run lint
npm test   # tests/run.cjs corre cada tests/*.test.cjs en su propio proceso
```

Una suite nueva se llama por lo que revisa (`inventario-ficha-y-conteo.test.cjs`), usa `boot()` de
`tests/boot.cjs` y termina con `console.log('PASS …')`.
