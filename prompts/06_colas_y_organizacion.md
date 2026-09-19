# 06 — Colas, reglas, búsqueda y funciones de organización

Lee AGENTS.md, el estado de implementación y las secciones aplicables de la especificación, arquitectura, sistema visual y plan de pruebas. Inspecciona el código antes de cambiarlo. Ejecuta esta fase, no todas las fases posteriores. Da un plan breve y luego implementa.

No inventes API, datos reales o resultados. Fixtures solo en pruebas/galería de desarrollo. Si el entorno no puede ejecutar Windows o navegadores, prepara las comprobaciones y marca lo no verificado; no lo declares aprobado. Al cerrar, actualiza estado e inventario de controles, muestra comandos ejecutados y su resultado, limita los pendientes concretos y guarda SIGUIENTE_PASO.

Objetivo: organización completa sin complicar el uso normal.

Implementa colas nombradas, orden, concurrencia, prioridades, descargas diferidas y planificación horaria con zona/horario local documentados. Al suspender/reanudar Windows o cambiar el reloj, evitar ejecuciones duplicadas. Una programación solo corre si el runtime está activo y el sistema despierto; explicar esto, no simular descargas con PC apagada.

Acción al terminar cola: ninguna por defecto; apagar/suspender/hibernar solo con opt-in, condición de fin explícita, cuenta atrás cancelable y comprobación de otras tareas. Usa adaptador Windows testeable, sin comandos shell construidos con texto del usuario. Tests simulan energía; no apagues el equipo de desarrollo.

Categorías solicitadas y categorías personalizadas, reglas por dominio/tipo/tamaño/horario, destino/cola/límite/prioridad y orden de precedencia. Vista previa explicable de la regla que aplica. Tamaño desconocido no se interpreta como cero. No evaluar scripts o código en reglas.

Conecta búsqueda global y filtros sobre datos no sensibles, paginación/virtualización y acciones masivas con estados compatibles. Añade entrada múltiple de URLs, TXT/CSV con preview, drag & drop y monitor del portapapeles opt-in. No escanear el portapapeles permanentemente cuando la función esté apagada.

Historial con retención; separar borrar historial de borrar archivo. Duplicados: request_id para entrega del navegador, URL/contexto y hash cuando exista; nunca borrar por coincidencia de nombre. Estadísticas locales opt-in con posibilidad de borrarlas, excluyendo privado; la integración completa de presencia de archivo se revisa en fase 12.

Pruebas: reglas en conflicto, lotes malformados/grandes, URLs repetidas con credenciales distintas, calendario en cambios de hora, fairness, acciones masivas parcialmente fallidas, undo/confirmación cuando corresponda, apagado cancelado y consultas con caracteres especiales.

Todo ajuste visible debe cambiar comportamiento real y persistir. Mantén avanzado plegado por defecto y evita añadir tarjetas KPI a la pantalla principal.

## Control de versiones y documentación

Respeta `docs/GITHUB_WORKFLOW.md`. Revisa el diff y secretos, actualiza el README y la guía afectada cuando cambie el uso o la instalación, realiza commits coherentes y push a la rama de trabajo en `sredgarr/IDG`. No confundas esta subida autorizada con publicar releases o extensiones. Informa rama, commit y resultado real; sin acceso, deja el push pendiente explícitamente.
