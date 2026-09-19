# 03 — Motor HTTP/HTTPS secuencial, persistencia y recuperación

Lee AGENTS.md, el estado de implementación y las secciones aplicables de la especificación, arquitectura, sistema visual y plan de pruebas. Inspecciona el código antes de cambiarlo. Ejecuta esta fase, no todas las fases posteriores. Da un plan breve y luego implementa.

No inventes API, datos reales o resultados. Fixtures solo en pruebas/galería de desarrollo. Si el entorno no puede ejecutar Windows o navegadores, prepara las comprobaciones y marca lo no verificado; no lo declares aprobado. Al cerrar, actualiza estado e inventario de controles, muestra comandos ejecutados y su resultado, limita los pendientes concretos y guarda SIGUIENTE_PASO.

Objetivo: una descarga auténtica y recuperable antes de paralelizarla.

En idg-core implementa un flujo HTTP/HTTPS de una solicitud con streaming a disco, cancellation, pausa con capacidad declarada, reanudación comprobada, progreso real y errores tipados. Rust async, TLS válido y límites de memoria. No cargar el archivo entero ni bloquear el hilo gráfico.

Define máquina de estados y almacenamiento local mediante migraciones. Runtime es el propietario de escrituras. Guarda identidad del recurso, destino/temporal, bytes realmente durables, validador, estado y referencias protegidas a lo sensible. Contraseñas, cookies o URLs firmadas no pueden guardarse en claro «temporalmente hasta la fase de seguridad».

Descarga al temporal `.idgpart`, sin truncar un final existente. Probe prudente con fallback si HEAD no funciona; GET de rango solo cuando sea seguro. No consumir a ciegas enlaces de un solo uso. Valida 206 y Content-Range, usa validadores apropiados, distingue 200/416 y datos cambiados. A falta de evidencia suficiente, explica por qué reanudar no es seguro. Accept-Ranges por sí solo no autoriza concatenar bytes.

Al finalizar comprueba tamaño si se conoce y hash esperado si existe. Calcular SHA-256 se presenta separado de verificación contra referencia. Flush/checkpoint coherentes y rename en el mismo volumen; archivo bloqueado produce estado recuperable, no Completed falso. Resolver nombre existente con renombrado/sobrescritura explícita; no reanudar un archivo arbitrario por coincidir el nombre.

Crea el servidor controlado y fixtures del TEST_PLAN. Cubre archivo correcto, tamaño desconocido, HEAD denegado, rangos ignorados/incorrectos, cambio de recurso, corte/reconexión, error TLS, disk full y hash erróneo. Test de matar/reiniciar proceso y verificar SHA-256 final. Utilidad de desarrollo/CLI local para iniciar y observar una descarga sin depender todavía de la UI.

Criterio de salida: descarga HTTP/HTTPS real y recuperación con evidencia; no anunciar aceleración o estabilidad universal. Expón los comandos/eventos necesarios para la futura conexión visual.

## Control de versiones y documentación

Respeta `docs/GITHUB_WORKFLOW.md`. Revisa el diff y secretos, actualiza el README y la guía afectada cuando cambie el uso o la instalación, realiza commits coherentes y push a la rama de trabajo en `sredgarr/IDG`. No confundas esta subida autorizada con publicar releases o extensiones. Informa rama, commit y resultado real; sin acceso, deja el push pendiente explícitamente.
