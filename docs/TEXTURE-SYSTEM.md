# Sistema de texturas

> **Estado:** pendiente. Nada de este sistema está implementado todavía.

Este documento describirá:

- La carga de los recursos por defecto desde el `client.jar` del usuario
  (`feature/minecraft-assets`).
- La resolución de blockstates y modelos y la construcción del atlas
  (`feature/block-models`).
- La carga de resource packs personalizados (`feature/texture-packs`).
- Las medidas de seguridad al leer archivos ZIP (Zip Slip, ZIP bombs, rutas internas).

## Licencia de los recursos

Las texturas y modelos de Minecraft son propiedad de Mojang y no se incluyen en el
repositorio. Se leerán siempre del archivo que aporte el usuario, en su navegador.
