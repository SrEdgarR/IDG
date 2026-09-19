# 13 — Instalador Windows y actualizaciones firmadas

Lee AGENTS.md, el estado de implementación y las secciones aplicables de la especificación, arquitectura, sistema visual y plan de pruebas. Inspecciona el código antes de cambiarlo. Ejecuta esta fase, no todas las fases posteriores. Da un plan breve y luego implementa.

No inventes API, datos reales o resultados. Fixtures solo en pruebas/galería de desarrollo. Si el entorno no puede ejecutar Windows o navegadores, prepara las comprobaciones y marca lo no verificado; no lo declares aprobado. Al cerrar, actualiza estado e inventario de controles, muestra comandos ejecutados y su resultado, limita los pendientes concretos y guarda SIGUIENTE_PASO.

Objetivo: instalar IDG y actualizarlo sin romper integración, sesiones ni seguridad.

Genera instalador por usuario para Windows 10/11 x64, preferentemente NSIS, incluyendo desktop/runtime/host y componentes redistribuibles aprobados. Verifica WebView2 e informa de cualquier requisito/descarga. No exigir administrador sin necesidad. Instala/registra host en los navegadores verificados; IDs de desarrollo y release separados. Desinstalación elimina solo claves/archivos propios y pregunta qué hacer con datos, sin borrar archivos descargados del usuario.

Completa onboarding de cuatro pasos con carpeta real, integración/permiso omitibles y AutoPick. Conectado requiere handshake. Inicio con Windows y menú del Explorador/protocolo propio, cuando estén implementados, opt-in y reversibles. Una extensión aún no publicada no tiene un enlace de tienda inventado.

Actualizaciones desde GitHub Releases mediante mecanismo firmado de Tauri. Configura formato/versionado correcto de metadata y artifacts. Busca automáticamente de forma configurable, muestra novedades y solicita Actualizar y reiniciar. No aplicar silenciosamente. Distingue firma de actualización de Authenticode; un checksum publicado junto al binario no sustituye una raíz de confianza.

Antes de instalar: coordina UI/runtime/hosts, verifica estado de descargas, permite posponer por una no reanudable, guarda checkpoints/backups/migraciones y evita iniciar nuevos trabajos durante el reemplazo. Restaurar conexión y estado tras reiniciar sin duplicates. Maneja paquete corrupto, firma ausente, red fallida, release incompleta, versión antigua y usuario que cancela.

Owner/repo ya están definidos: `sredgarr/IDG`; verifica el repositorio creado en fase 00. Siguen pendientes identidades de extensión y claves reales de despliegue: prepara `.example`, fixtures y documentación de generación/almacenamiento en secretos, sin pedir pegar claves privadas en el chat y sin versionarlas. Las claves de pruebas quedan claramente separadas y no habilitan publicación. No desactives verificación para completar un test. Sin configuración real, ese canal muestra No configurado y el release queda bloqueado.

Prepara workflows de build/tests/artifacts y generación de borrador de release con aprobación; sube código/documentación a la rama autorizada de `sredgarr/IDG`, pero no publiques releases ni extensiones sin autorización específica. Incluye avisos/licencias/código correspondiente, procedencia de FFmpeg, y matriz de instalación/actualización/desinstalación. No declares los tests de Windows aprobados si no se ejecutaron realmente.

## Control de versiones y documentación

Respeta `docs/GITHUB_WORKFLOW.md`. Revisa el diff y secretos, actualiza el README y la guía afectada cuando cambie el uso o la instalación, realiza commits coherentes y push a la rama de trabajo en `sredgarr/IDG`. No confundas esta subida autorizada con publicar releases o extensiones. Informa rama, commit y resultado real; sin acceso, deja el push pendiente explícitamente.
