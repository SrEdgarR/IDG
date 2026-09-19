# 07 — Extensión Chromium y AutoPick de extremo a extremo

Lee AGENTS.md, el estado de implementación y las secciones aplicables de la especificación, arquitectura, sistema visual y plan de pruebas. Inspecciona el código antes de cambiarlo. Ejecuta esta fase, no todas las fases posteriores. Da un plan breve y luego implementa.

No inventes API, datos reales o resultados. Fixtures solo en pruebas/galería de desarrollo. Si el entorno no puede ejecutar Windows o navegadores, prepara las comprobaciones y marca lo no verificado; no lo declares aprobado. Al cerrar, actualiza estado e inventario de controles, muestra comandos ejecutados y su resultado, limita los pendientes concretos y guarda SIGUIENTE_PASO.

Objetivo: completar la extensión para Chrome/Edge con un traspaso que no pierda descargas.

Reutiliza el host probado en fase 01. Implementa popup minimalista con conexión, modo AutoPick, excepciones del sitio, trabajos activos, pausa/reanuda y abrir IDG. Usa eventos/snapshot del runtime, no otra DB como fuente principal. Worker reiniciable: estado mínimo recuperable, IDs de solicitud, detección de duplicados y resuscripción.

AutoPick: Siempre usar IDG/Preguntarme/Usar navegador; suspensión temporal; ignorados por sitio, MIME/extensión y tamaño; política visible para tamaño desconocido. Menú contextual solo sobre enlaces/video. Herramienta Descargar enlaces de la página desde popup con preview/selección, no descarga indiscriminada.

Diseña y prueba las dos rutas: clic en GET directo elegible y observación de descargas ya iniciadas. Documenta API vigente. No trates onCreated o onDeterminingFilename como hooks universales anteriores a la transferencia. No canceles el original solo porque el host respondió ping. Preparar→aceptación durable→transferir ownership, con timeout, abort y fallback. Pausar únicamente cuando no destruya una vía irreproducible.

No recrees POST, formularios, blobs, data URLs, URLs firmadas de un uso o descargas con sesión incompleta como un GET improvisado. Cuando no sea seguro, conserva el navegador y explica el límite. Un «Usar navegador» lleva una exención de recaptura. No desaparecer la descarga al cancelar el diálogo.

La extensión solicita una ventana Nueva descarga de IDG. Al aceptar, el runtime persiste trabajo, UI cierra modal y extensión actualiza badge/icono; microfeedback de actividad breve según APIs, sin timer infinito. Mide estado verdadero, no animación como sustituto del progreso.

Permisos graduales para captura global y sesión autorizada. Transferencia mínima de credenciales por dominio/perfil; nada de exportar todas las cookies. No cookies en logs/React ni fuga tras redirección. Host ausente/incompatible permite ayuda o continuar con navegador.

Pruebas reales/matriz: modos, ignorados, permiso rechazado, dos clics, worker caído entre preparación/commit, app ausente, cerrar navegador durante descarga, cancelación, conexión perdida y sitios de fixtures autenticados. Corrige pérdidas/duplicados antes de ampliar compatibilidad.

## Control de versiones y documentación

Respeta `docs/GITHUB_WORKFLOW.md`. Revisa el diff y secretos, actualiza el README y la guía afectada cuando cambie el uso o la instalación, realiza commits coherentes y push a la rama de trabajo en `sredgarr/IDG`. No confundas esta subida autorizada con publicar releases o extensiones. Informa rama, commit y resultado real; sin acceso, deja el push pendiente explícitamente.
