# 15 — Auditoría final y candidato de entrega

Lee AGENTS.md, el estado de implementación y las secciones aplicables de la especificación, arquitectura, sistema visual y plan de pruebas. Inspecciona el código antes de cambiarlo. Ejecuta esta fase, no todas las fases posteriores. Da un plan breve y luego implementa.

No inventes API, datos reales o resultados. Fixtures solo en pruebas/galería de desarrollo. Si el entorno no puede ejecutar Windows o navegadores, prepara las comprobaciones y marca lo no verificado; no lo declares aprobado. Al cerrar, actualiza estado e inventario de controles, muestra comandos ejecutados y su resultado, limita los pendientes concretos y guarda SIGUIENTE_PASO.

Objetivo: contrastar el programa completo contra lo acordado y preparar una entrega comprobable. No introducir una nueva arquitectura o rediseño general en esta fase.

Recorre PRODUCT_SPEC requisito por requisito e inventario de controles. Para cada obligación de la base indica implementación, archivo/función, prueba y evidencia. Descubre stubs, TODOs funcionales, datos mock en producción, handlers vacíos, controles que solo muestran éxito, flags que ocultan errores y tests que nunca ejecutan el comportamiento real. No marques VERIFICADO por mera lectura de código.

Audita independencia del core, procesos/instancia única, escritor de DB, privacidad, permisos, traspaso AutoPick, rangos y hashes, temporales/rename, HLS/DASH y conversiones, colas/energía, updater y compatibilidad de navegadores. Revisa dependencias/avisos de licencia GPLv3 y FFmpeg, secretos en repo/historial y configuración de publicación.

Corrige primero corrupción, pérdida de descargas, exposición de secretos, errores de instalación/update y crashes; luego regresiones funcionales/visuales. Añade prueba de regresión por cada fallo reproducido. No ocultes un defecto quitando la función acordada o deshabilitando su test.

Genera documentación para usuario en español: instalación, asistente, extensión, AutoPick, descargas/reanudación, multimedia compatible, privacidad y solución de problemas. README principal para usuarios no técnicos, guía de desarrollo separada, changelog factual, limitaciones explícitas, checklist de release y matriz de Windows/navegadores comprobados. Incluye cómo obtener el código correspondiente a los binarios.

Torrents, sincronización, portable/ARM64 o livestream no implementados permanecen diferenciados de la entrega base. No anunciarlos como disponibles. Si un requisito obligatorio está bloqueado, entrega una lista priorizada y llama al resultado build de desarrollo, no v1.0 completa.

Produce instalador/artefactos locales si el entorno y claves apropiadas lo permiten; la subida de fuente/documentación a `sredgarr/IDG` está autorizada por GITHUB_WORKFLOW, pero no publiques releases/instaladores ni extensiones en tiendas sin autorización específica. No generes resultados de pruebas, firmas o URLs falsas. Termina con el estado real del producto, cómo reproducir verificaciones y cualquier dato específico de despliegue todavía necesario.

## Control de versiones y documentación

Respeta `docs/GITHUB_WORKFLOW.md`. Revisa el diff y secretos, actualiza el README y la guía afectada cuando cambie el uso o la instalación, realiza commits coherentes y push a la rama de trabajo en `sredgarr/IDG`. No confundas esta subida autorizada con publicar releases o extensiones. Informa rama, commit y resultado real; sin acceso, deja el push pendiente explícitamente.
