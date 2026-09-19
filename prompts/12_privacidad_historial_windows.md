# 12 — Historial de archivos, privacidad y seguridad de Windows

Lee AGENTS.md, el estado de implementación y las secciones aplicables de la especificación, arquitectura, sistema visual y plan de pruebas. Inspecciona el código antes de cambiarlo. Ejecuta esta fase, no todas las fases posteriores. Da un plan breve y luego implementa.

No inventes API, datos reales o resultados. Fixtures solo en pruebas/galería de desarrollo. Si el entorno no puede ejecutar Windows o navegadores, prepara las comprobaciones y marca lo no verificado; no lo declares aprobado. Al cerrar, actualiza estado e inventario de controles, muestra comandos ejecutados y su resultado, limita los pendientes concretos y guarda SIGUIENTE_PASO.

Objetivo: cerrar funciones de historial y privacidad y revisar seguridad aplicada desde las primeras etapas.

Implementa reconciliación de archivos terminados con watchers de alcance limitado y chequeos bajo demanda. Nombre tachado y No encontrado en ubicación original cuando desaparece. Solo afirmar Movido/Eliminado con evidencia; disco desconectado/permisos/evento perdido no bastan. Acción Localizar compara datos pertinentes y actualiza asociación; no escanees todos los discos ni calcules todos sus hashes en segundo plano.

Duplica detección de identidad solo con evidencias, nunca por nombre/tamaño como prueba definitiva. Retención y borrado de historial separados de archivo; papelera/confirmación para eliminar archivos. Estadísticas opt-in excluyen privado y dejan de recopilarse al apagarlas.

Audita URLs firmadas, cookies, credenciales, cabeceras y payloads de UI. Los secretos necesarios para recuperación se protegen por usuario, no en SQLite/FTS/WAL/logs planos. Modo privado sin persistencia por defecto y advertencia de su limitación de recuperación tras reinicio. Limpieza de metadatos; no prometer borrado forense perfecto.

Logs redactados, rotación, diagnóstico exportable con vista previa y borrado. Sin receptor aprobado no crear un falso interruptor de telemetría funcional. El funcionamiento base es local y sin cuenta; sincronización se implementará en fase opcional 17, no una pantalla de login simulada.

Integra información de firma/editor para tipos compatibles mediante APIs de Windows. Estados precisos; una firma válida no asegura que el archivo sea benigno. Conserva políticas/procedencia de archivos descargados con Attachment Services/Mark of the Web según corresponda y comprueba resultado, sin falsificar una protección que no se pudo aplicar. Nunca ejecutar descargas automáticamente ni eliminar advertencias de seguridad.

Revisa traversal, nombres reservados, ADS, reparse points, UNC inesperado, URLs a red local desde páginas, invocaciones shell, IPC y capabilities. Permitir usos locales explícitos bajo política documentada sin abrirlos a cualquier sitio web.

Pruebas de secretos marcadores en disco/logs/export, modo privado, mover/eliminar/desconectar unidad, firma no verificable, archivo bloqueado, ausencia de antivirus disponible, paths hostiles y acceso IPC no autorizado. Corrige hallazgos de alto riesgo; conserva evidencia y límites.

## Control de versiones y documentación

Respeta `docs/GITHUB_WORKFLOW.md`. Revisa el diff y secretos, actualiza el README y la guía afectada cuando cambie el uso o la instalación, realiza commits coherentes y push a la rama de trabajo en `sredgarr/IDG`. No confundas esta subida autorizada con publicar releases o extensiones. Informa rama, commit y resultado real; sin acceso, deja el push pendiente explícitamente.
