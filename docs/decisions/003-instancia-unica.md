# ADR-003 — Instancia única y salida explícita

Estado: aceptada como diseño; mecanismo exacto propuesto. Fecha: 2026-09-19.

## Contexto y decisión

Varios hosts y ventanas pueden arrancar simultáneamente. Solo un runtime efectivo por usuario puede aceptar trabajos. Proponer exclusión Windows por identidad de usuario y handshake con el dueño existente; la exclusión es requisito del runtime, no solo de la ventana Tauri.

La salida explícita guarda checkpoints y suprime reinicios automáticos hasta una nueva acción autorizada. Cerrar stdin del host solo termina esa conexión.

## Alternativas y consecuencias

Un PID en un archivo no resuelve carreras ni identidad; una instancia global del equipo mezcla usuarios. La sincronización por usuario necesita tratar sesiones, cierres abruptos y propietarios obsoletos.

## Hipótesis y prueba pendiente

En 01 concretar mutex/alcance de sesión y permisos con documentación Windows; probar lanzamientos simultáneos, runtime terminado, dos clientes, desconexión y nueva acción después de Salir. No prometer aislamiento absoluto frente a malware del mismo usuario. Requisitos WIN-03, EXT-02; [plan §2–3](../TEST_PLAN.md).
