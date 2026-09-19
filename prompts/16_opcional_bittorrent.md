# 16 — Ampliación opcional: BitTorrent

Lee AGENTS.md, el estado de implementación y las secciones aplicables de la especificación, arquitectura, sistema visual y plan de pruebas. Inspecciona el código antes de cambiarlo. Ejecuta esta fase, no todas las fases posteriores. Da un plan breve y luego implementa.

No inventes API, datos reales o resultados. Fixtures solo en pruebas/galería de desarrollo. Si el entorno no puede ejecutar Windows o navegadores, prepara las comprobaciones y marca lo no verificado; no lo declares aprobado. Al cerrar, actualiza estado e inventario de controles, muestra comandos ejecutados y su resultado, limita los pendientes concretos y guarda SIGUIENTE_PASO.

Esta fase es opcional y posterior a la base estable. No ejecutar solo porque aparece el archivo; ejecútala cuando el usuario la solicite. No sacrificar motor HTTP ni interfaz sencilla.

Evalúa bibliotecas BitTorrent mantenidas, aptas para Windows y de licencia compatible con GPL-3.0-only; documenta capacidades, dependencias, seguridad y consumo. Prefiere integrar una biblioteca comprobada antes que reimplementar el protocolo. Si una elección implica restricciones de distribución o cambios fuertes de arquitectura, presenta el bloqueo con alternativas fundamentadas.

Implementa un adaptador aislado para .torrent/magnet con selección de archivos, progreso real, hash de piezas, pausa/reanudación, límites de descarga/subida, peers y políticas de seeding. Explica que BitTorrent implica transferencia con otros usuarios, incluida subida y visibilidad de la dirección IP para pares. No activar asociaciones del sistema o puertos externos sin consentimiento.

Integra los estados, colas, categorías y privacidad sin fingir que HTTP y torrents tienen iguales métricas. Regla de completado/seed y acción de apagar deben ser compatibles y explícitas. No usar `.idgpart` de HTTP de forma que rompa el almacenamiento/resume de la biblioteca; documenta formatos temporales propios.

Servidor/tracker/peers de prueba con archivos propios o autorizados. Tests de datos dañados, metadata hostil, paths/traversal, espacio insuficiente, suspensión, reinicio, magnet sin pares, límite de subida y apagado al completar según la política elegida. Sin pruebas descargando contenido no autorizado.

Interfaz avanzada y opt-in; HTTP sigue siendo la experiencia inicial. Actualiza matriz, licencias, documentación y mediciones. No anunciar soporte de cualquier característica BitTorrent que la biblioteca no implemente.

## Control de versiones y documentación

Respeta `docs/GITHUB_WORKFLOW.md`. Revisa el diff y secretos, actualiza el README y la guía afectada cuando cambie el uso o la instalación, realiza commits coherentes y push a la rama de trabajo en `sredgarr/IDG`. No confundas esta subida autorizada con publicar releases o extensiones. Informa rama, commit y resultado real; sin acceso, deja el push pendiente explícitamente.
