# 04 — Segmentación adaptable y control de recursos

Lee AGENTS.md, el estado de implementación y las secciones aplicables de la especificación, arquitectura, sistema visual y plan de pruebas. Inspecciona el código antes de cambiarlo. Ejecuta esta fase, no todas las fases posteriores. Da un plan breve y luego implementa.

No inventes API, datos reales o resultados. Fixtures solo en pruebas/galería de desarrollo. Si el entorno no puede ejecutar Windows o navegadores, prepara las comprobaciones y marca lo no verificado; no lo declares aprobado. Al cerrar, actualiza estado e inventario de controles, muestra comandos ejecutados y su resultado, limita los pendientes concretos y guarda SIGUIENTE_PASO.

Objetivo: acelerar cuando las condiciones lo permitan sin comprometer la integridad del motor existente.

Añade planificación por rangos y múltiples solicitudes para archivos/servidores compatibles. Coordinación de escritura segura: escrituras posicionales o un writer coordinado, nunca seek compartido con carreras. Cobertura exacta del archivo y checkpoints de rangos durables. Prohibido deducir progreso del tamaño de un archivo preasignado.

Modo Automático por defecto: empezar conservador, medir throughput útil y fallos durante ventanas suficientes, aumentar solo si mejora de forma sostenida, reducir ante presión del servidor, latencia, 429/503 o disco. Limitar concurrencia por archivo, origen y globalmente; respetar Retry-After y un tamaño mínimo de segmento. No probar 64 conexiones por defecto ni prometer saturar cualquier línea.

Añade límite de velocidad global/individual, inicialmente ilimitado; máximo de descargas simultáneas; prioridades con equidad; reintentos con backoff/jitter, límite y cancelación inmediata. Diferencia número de requests/rangos activos del número de sockets HTTP/2 en la información técnica.

Verifica que todos los rangos correspondan a la misma representación. Un cambio de ETag/longitud/respuesta no debe mezclar versiones. Si servidor deja de soportar ranges, degradar con política segura o reiniciar con aviso, no pegar una respuesta completa al parcial. Hash completo al terminar: no concatenar hashes de segmentos.

Pruebas property-based de cobertura y fronteras; pausas/cancelaciones simultáneas; crash entre escritura y checkpoint; reintentos que llegan tarde; 416 y rangos solapados; tamaños grandes/pequeños; límites combinados. Mide 1/4/8/16 solicitudes contra servidor controlado y documenta condiciones, bytes útiles, RAM y CPU. Resultados negativos también se reportan.

Mantén biblioteca independiente de UI y interfaces estables. Entrega benchmark reproducible y evidencia de que adaptar concurrencia no corrompe archivos ni multiplica indefinidamente uso de memoria.

## Control de versiones y documentación

Respeta `docs/GITHUB_WORKFLOW.md`. Revisa el diff y secretos, actualiza el README y la guía afectada cuando cambie el uso o la instalación, realiza commits coherentes y push a la rama de trabajo en `sredgarr/IDG`. No confundas esta subida autorizada con publicar releases o extensiones. Informa rama, commit y resultado real; sin acceso, deja el push pendiente explícitamente.
