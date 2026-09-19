# 14 — Pruebas integrales, fallos y rendimiento medido

Lee AGENTS.md, el estado de implementación y las secciones aplicables de la especificación, arquitectura, sistema visual y plan de pruebas. Inspecciona el código antes de cambiarlo. Ejecuta esta fase, no todas las fases posteriores. Da un plan breve y luego implementa.

No inventes API, datos reales o resultados. Fixtures solo en pruebas/galería de desarrollo. Si el entorno no puede ejecutar Windows o navegadores, prepara las comprobaciones y marca lo no verificado; no lo declares aprobado. Al cerrar, actualiza estado e inventario de controles, muestra comandos ejecutados y su resultado, limita los pendientes concretos y guarda SIGUIENTE_PASO.

Objetivo: hacer una revisión integral basada en ejecución, no añadir nuevas funciones.

Ejecuta los comandos reales de formato, lint, test y build del repositorio. Revisa warnings y fallos; no ignores comprobaciones con flags para obtener verde. Separa pruebas portables, Windows, navegador y manuales. Actualiza TEST_PLAN con rutas/comandos concretos y resultados, indicando entorno.

Cubre de extremo a extremo el escenario Windows11.iso de la especificación con fixture equivalente: clic/AutoPick, diálogo, aceptación durable, archivo temporal, progreso en UI/extensión, pérdida de red, reinicio, reanudación segura, validación y rename. Casos incompatibles conservan navegador. Repite operación con usuario no administrador y carpeta con espacios/acentos.

Inyecta fallos: cierre abrupto, pérdida de sesión, 200 al pedir rango, 206 incoherente, ETag cambiado, 429, disk full, archivo bloqueado, hash incorrecto, conversión fallida y firma de update inválida. Verifica que no hay corrupción silenciosa, sobrescritura prematura, duplicados o pérdida del original.

Perf en build release: throughput útil con 1/4/8/16 solicitudes y múltiples descargas, memoria, CPU, disco, arranque, UI con miles de entradas, gráficas visibles/ocultas y popup cerrado. Mide runtime separado del árbol WebView2. No afirmar rendimiento por el simple uso de Rust/Tauri. Publica hardware, red, configuración, repeticiones y variabilidad; establece presupuestos razonables con esa línea base.

Optimiza solo cuellos medidos: buffering, scheduling, DB/checkpoint, batches IPC, gráficos, virtualización o ciclo de vida WebView. Conserva comprobaciones de integridad y recuperación. No aumentar concurrencia por defecto para maquillar un benchmark.

Pruebas visuales y accesibilidad de toda UI clara/oscura, DPI y todos los menús. Revisa UI_CONTROL_INVENTORY: ninguna acción visible sin efecto real, estados deshabilitados explicables, búsquedas/colas/reglas persistentes. Capturas redactadas sin datos privados.

Entrega reporte con regresiones corregidas, evidencia de mejora, riesgos abiertos y elementos no verificables en este entorno. Una prueba pendiente importante bloquea afirmar candidato de release, no obliga a fingir que pasó.

## Control de versiones y documentación

Respeta `docs/GITHUB_WORKFLOW.md`. Revisa el diff y secretos, actualiza el README y la guía afectada cuando cambie el uso o la instalación, realiza commits coherentes y push a la rama de trabajo en `sredgarr/IDG`. No confundas esta subida autorizada con publicar releases o extensiones. Informa rama, commit y resultado real; sin acceso, deja el push pendiente explícitamente.
