# 92 — Auditoría de interfaz y controles omitidos

Audita la interfaz actual de IDG sin cambiar su arquitectura o identidad visual.

Lee docs/INTERFAZ.md, docs/DESIGN_SYSTEM.md, PRODUCT_SPEC e UI_CONTROL_INVENTORY. Revisa las superficies UX y cada control CTL, desglosando los grupos en controles concretos. Abre la aplicación y revisa cada pantalla, menú, diálogo, estado, control y atajo cuando el entorno lo permita. Usa datos de test explícitos y descargas locales reales para comprobar acciones. No deduzcas que un botón funciona porque tiene un onClick.

Comprueba correspondencia entre control, handler, comando del runtime, persistencia y resultado. Señala controles omitidos, acciones ficticias, filtros que no filtran, opciones que no guardan, estados engañosos, problemas de foco y gráficas simuladas. Corrige sin eliminar controles requeridos ni inventar métricas.

Revisa claro/oscuro/sistema, 0/1/3/20 descargas, tamaños de ventana, DPI, selección masiva y expansión automática/manual. Toma capturas auténticas, compara con el sistema visual y corrige alineación/contraste/overflow. Si hay referencias visuales realmente disponibles, inventaria sus controles y contrasta; no afirmes haber visto imágenes ausentes.

Actualiza el inventario con evidencia y tests. Entrega una lista corta de cambios y pendientes; no declare aprobación visual donde no se pudo ejecutar o inspeccionar.

## Control de versiones y documentación

Respeta `docs/GITHUB_WORKFLOW.md`. Revisa el diff y secretos, actualiza el README y la guía afectada cuando cambie el uso o la instalación, realiza commits coherentes y push a la rama de trabajo en `sredgarr/IDG`. No confundas esta subida autorizada con publicar releases o extensiones. Informa rama, commit y resultado real; sin acceso, deja el push pendiente explícitamente.
