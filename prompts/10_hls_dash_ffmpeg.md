# 10 — HLS/DASH sin DRM y procesamiento con FFmpeg

Lee AGENTS.md, el estado de implementación y las secciones aplicables de la especificación, arquitectura, sistema visual y plan de pruebas. Inspecciona el código antes de cambiarlo. Ejecuta esta fase, no todas las fases posteriores. Da un plan breve y luego implementa.

No inventes API, datos reales o resultados. Fixtures solo en pruebas/galería de desarrollo. Si el entorno no puede ejecutar Windows o navegadores, prepara las comprobaciones y marca lo no verificado; no lo declares aprobado. Al cerrar, actualiza estado e inventario de controles, muestra comandos ejecutados y su resultado, limita los pendientes concretos y guarda SIGUIENTE_PASO.

Objetivo: descarga multimedia completa en un subconjunto bien definido y probado.

Implementa en idg-media resolución HLS VOD sin cifrar y MPD estáticos sin DRM. Antes de codificar, documenta elementos soportados: variantes/pistas, referencias relativas/BaseURL, segmentos de inicialización, listas/timelines/templates aplicables, byte ranges y discontinuidades que realmente manejes. Rechaza explícitamente elementos no soportados en lugar de producir videos truncados. No confundir todo HLS/DASH o todo cifrado con DRM.

Descarga segmentos mediante presupuestos del runtime, checkpoints y reintentos, respetando sesión/autorización mínima y redirects seguros. Limita manifiestos, duración/listas/segmentos y profundidad XML. Desactiva resolución de entidades externas/lecturas de archivos. No enviar a FFmpeg una URL hostil para que explore red/archivos al margen de las políticas del programa; preferir entradas locales controladas.

Integra FFmpeg/ffprobe con versión/procedencia verificadas y licencias del build documentadas. Invoca binarios sin shell, argumentos estructurados y rutas absolutas, formato explícito cuando el temporal tiene sufijo .idgpart. Suministra entradas por canales que no filtren cookies ni tokens a línea de comandos/logs.

Video+audio: stream copy/remux cuando compatible; escoger contenedor adecuado o pedir conversión, no copiar un codec incompatible a MP4 y dar por terminado. Solo audio conserva pista original por defecto; MP3/AAC/FLAC son conversiones opt-in con explicación de pérdida/calidad y disponibilidad real de codecs. No prometer que FLAC restaura calidad perdida.

Progreso por etapas: descargando, combinando/convirtiendo, verificando. Cancelación controla proceso y temporales sin borrar origen válido. Presupuesto de CPU/hilos, un trabajo pesado por defecto y preferencias avanzadas. Verifica streams/duración/salida con ffprobe y fixtures; solo entonces finaliza y renombra.

Al cerrar el navegador el runtime continúa si la autorización sigue válida. Ante enlace caducado muestra recuperación posible, no reintentos infinitos. Contenido DRM/protegido: informar y detener ese intento; nada de claves, servidores de licencias o bypass.

Prueba clips propios con pistas separadas, idiomas, resolución variable, manifiesto malformado, segmentos ausentes, conversión cancelada, codec inexistente, disco lleno y formato incompatible. Documenta livestream/cifrado/extractores por plataforma como fuera de la entrega inicial.

## Control de versiones y documentación

Respeta `docs/GITHUB_WORKFLOW.md`. Revisa el diff y secretos, actualiza el README y la guía afectada cuando cambie el uso o la instalación, realiza commits coherentes y push a la rama de trabajo en `sredgarr/IDG`. No confundas esta subida autorizada con publicar releases o extensiones. Informa rama, commit y resultado real; sin acceso, deja el push pendiente explícitamente.
