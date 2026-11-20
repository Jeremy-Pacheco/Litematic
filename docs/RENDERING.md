# Renderizado

> **Estado:** pendiente. El visor 3D todavía no está implementado.

Este documento describirá el funcionamiento del visor (`feature/structure-viewer`) y del
sistema de capas (`feature/layer-system`): escena, cámara, generación de geometría,
materiales y renderizado bajo demanda.

El enfoque previsto es generar la geometría por secciones de 16×16×16 bloques en un Web
Worker, eliminando las caras ocultas, en lugar de crear un objeto por bloque. Se confirmará y
documentará con mediciones al implementarlo.
