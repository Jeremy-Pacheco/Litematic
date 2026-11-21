# Contribuir

## Flujo de trabajo

1. Cada funcionalidad se desarrolla en su propia rama, creada desde `main` actualizado:
   - `feature/<nombre>` para funcionalidades.
   - `chore/<nombre>` para tareas de mantenimiento o configuración.
2. Nunca se desarrolla directamente en `main`.
3. Una rama contiene una sola funcionalidad.
4. Al terminar, se abre un Pull Request hacia `main` explicando cambios, pruebas y posibles
   problemas. El merge lo hace el propietario del repositorio tras revisarlo.

## Commits

Se sigue el estilo [Conventional Commits](https://www.conventionalcommits.org/):

```text
feat: add litematic region decoder
fix: handle negative region sizes
chore: configure vitest
docs: document nbt formats
test: add schem v3 fixtures
refactor: extract palette resolution
```

## Antes de abrir un PR

Todos estos comandos deben pasar sin errores:

```bash
pnpm check
pnpm lint
pnpm format:check
pnpm test
pnpm build
```

## Convenciones de código

- TypeScript estricto. Evitar `any` (ESLint lo marca como error).
- Variables o parámetros sin usar: error, salvo que empiecen por `_`.
- Formato con Prettier: sin punto y coma, comillas simples, ancho de 100 caracteres.
- Finales de línea LF (definido en `.gitattributes`).
- Los tests van en `tests/`, con la misma estructura de carpetas que `src/`, y terminan en
  `.test.ts`.
- La documentación de `docs/` se actualiza en la misma rama que el código que describe.
  No se documentan como terminadas funcionalidades que no lo están.

## Archivos de prueba reales

Los archivos de estructuras reales (de otros autores) **no se suben al repositorio**. Para
probarlos, cópialos en `tests/fixtures/local/`, que está en `.gitignore`. Los tests que los usan
se saltan automáticamente si el archivo no existe. Para casos generados, usa los helpers de
`tests/helpers/` (`encodeNbt`, `litematicRoot`, `region`…).

## Dependencias

Se usa **pnpm**. No se añaden dependencias sin aprobarlo previamente.
