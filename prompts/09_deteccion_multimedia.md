# 09 — Detección multimedia y selección de descarga

Lee AGENTS.md, el estado de implementación y las secciones aplicables de la especificación, arquitectura, sistema visual y plan de pruebas. Inspecciona el código antes de cambiarlo. Ejecuta esta fase, no todas las fases posteriores. Da un plan breve y luego implementa.

No inventes API, datos reales o resultados. Fixtures solo en pruebas/galería de desarrollo. Si el entorno no puede ejecutar Windows o navegadores, prepara las comprobaciones y marca lo no verificado; no lo declares aprobado. Al cerrar, actualiza estado e inventario de controles, muestra comandos ejecutados y su resultado, limita los pendientes concretos y guarda SIGUIENTE_PASO.

Objetivo: detectar medios accesibles y dar una experiencia sencilla sin prometer soporte universal.

Implementa modelo común de candidatos multimedia: pestaña/frame/reproductor, URL o manifest, título, miniatura, MIME, resolución/FPS/codec/pistas cuando se conocen, duración y tamaño exacto/estimado/desconocido. Datos hostiles: validar longitudes y URLs, no innerHTML inseguro ni iconos remotos arbitrarios.

Combina DOM de video/audio y observación de requests permitida por WebExtensions, con permisos por origen. No intentes leer cuerpos de respuesta mediante una API que no los expone. No tratar un `blob:` de MediaSource como un archivo público. Buscar manifest/recursos accesibles relacionados y, si no existen, explicar que no puede transferirse ese medio.

Botón pequeño y estilizado cerca del borde superior del reproductor, sin tapar controles, accesible y configurable global/por sitio. Responder a resize, scroll, pantalla completa y contenido dinámico sin sondeo intensivo. Cada botón corresponde al reproductor; popup permite ver candidatos de la pestaña sin duplicados. Iframes solo dentro de permisos realmente disponibles.

Al pulsarlo, abre selector de escritorio con Video+audio/Solo video/Solo audio y calidad. Para un archivo directo crea una descarga real usando el motor. Para HLS/DASH detectados, presenta capacidades honestas y conecta la resolución de variantes en fase 10; no mostrar calidades inventadas antes de parsear.

Conserva original de audio como opción inicial. Etiqueta estimación de tamaño y opción de conversión futura sin afirmar mejora de calidad. Al aceptar descarga guarda los metadatos permitidos, no antes en un historial oculto de todos los videos visitados. No extraigas claves o descifres DRM.

Fixtures: video directo, audio, varios reproductores, iframe permitido/denegado, mutaciones DOM, SPA, fullscreen y blob sin origen transferible. No uses un sitio comercial como único test ni declares «detecta todos los videos».

## Control de versiones y documentación

Respeta `docs/GITHUB_WORKFLOW.md`. Revisa el diff y secretos, actualiza el README y la guía afectada cuando cambie el uso o la instalación, realiza commits coherentes y push a la rama de trabajo en `sredgarr/IDG`. No confundas esta subida autorizada con publicar releases o extensiones. Informa rama, commit y resultado real; sin acceso, deja el push pendiente explícitamente.
