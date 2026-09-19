# 02 — Sistema visual e interfaz de escritorio

Lee AGENTS.md, el estado de implementación y las secciones aplicables de la especificación, arquitectura, sistema visual y plan de pruebas. Inspecciona el código antes de cambiarlo. Ejecuta esta fase, no todas las fases posteriores. Da un plan breve y luego implementa.

No inventes API, datos reales o resultados. Fixtures solo en pruebas/galería de desarrollo. Si el entorno no puede ejecutar Windows o navegadores, prepara las comprobaciones y marca lo no verificado; no lo declares aprobado. Al cerrar, actualiza estado e inventario de controles, muestra comandos ejecutados y su resultado, limita los pendientes concretos y guarda SIGUIENTE_PASO.

Objetivo: construir la experiencia visual acordada sobre el esqueleto existente, con diseño consistente y componentes preparados para datos reales.

Lee completos `docs/INTERFAZ.md`, `docs/DESIGN_SYSTEM.md` y `docs/UI_CONTROL_INVENTORY.md`. Usa las superficies UX-01 a UX-11 y los controles CTL como checklist. No omitas pantallas/acciones ni sustituyas los requisitos por un dashboard genérico; las funciones futuras quedan registradas para su fase, no eliminadas.

Implementa tokens y modos Claro/Oscuro/Sistema de DESIGN_SYSTEM. Usa React/TypeScript, componentes accesibles, iconos de trazo y estilos locales. Nada de landing pages, tarjetas de métricas gigantes, gradientes decorativos, glassmorphism pesado o estética genérica de dashboard. Prioriza lista, nombres, progreso y controles.

Construye AppShell, sidebar exacta, barra superior, buscador/filtros, lista compacta expandible, sparkline en cada fila, selección múltiple, menús de acciones, diálogo Nueva descarga, conflicto de archivo y estructura de Ajustes/onboarding. No llenar producción con 20 descargas ficticias: crea una galería de componentes de desarrollo aislada con fixtures de estados reales del contrato. El producto todavía sin datos debe mostrar vacío/desconectado de forma honesta.

Implementa la política automática de 1–3 filas expandidas y 4+ compactas, supeditada al espacio y a la decisión manual. Evita saltos de layout al actualizar progreso. Campos técnicos en expansión; mini ventana y drop target como componentes opcionales, no activados por defecto. Métricas desconocidas con etiquetas honestas.

Prepara el popup visual de extensión y botón multimedia reutilizando tokens apropiados sin introducir dependencias enormes. No declares controles conectados hasta que lo estén. Registra cada control visible en UI_CONTROL_INVENTORY con su futuro comando, disponibilidad, errores y prueba.

Pruebas: teclado/foco, Escape, selección, menús, expansión manual/automática, temas y reducción de movimiento. Toma y revisa capturas reales en claro/oscuro con 0/1/3/20 trabajos de galería, viewport pequeño/normal y DPI cuando sea posible. Corrige overflow, alineación, contraste y truncamientos. Las fixtures de galería no deben entrar en el bundle de producción como datos de usuario.

Al cerrar explica qué está conectado de verdad, qué solo existe en galería y qué debe conectarse en fase 05. Mantén el motor fuera de React.

## Control de versiones y documentación

Respeta `docs/GITHUB_WORKFLOW.md`. Revisa el diff y secretos, actualiza el README y la guía afectada cuando cambie el uso o la instalación, realiza commits coherentes y push a la rama de trabajo en `sredgarr/IDG`. No confundas esta subida autorizada con publicar releases o extensiones. Informa rama, commit y resultado real; sin acceso, deja el push pendiente explícitamente.
