# Rendimiento

> **Estado:** todavía no hay mediciones, porque no existe código que procese estructuras.

Este documento recogerá las optimizaciones aplicadas y las mediciones que las justifican.
Cada funcionalidad que afecte al rendimiento añadirá aquí sus resultados (antes y después),
indicando la estructura de prueba, el equipo y el navegador utilizados.

## Compilación actual

Tras `feature/app-shell` (Svelte, interfaz base, temas e idiomas):

| Archivo     |   Tamaño |     gzip |
| ----------- | -------: | -------: |
| `index.js`  | 62,28 kB | 24,36 kB |
| `index.css` |  8,25 kB |  2,16 kB |

La interfaz no hace trabajo continuo: no hay bucles de animación ni temporizadores salvo el
cierre automático de las notificaciones.
