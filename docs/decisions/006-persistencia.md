# ADR-006 — Un propietario de la persistencia

Estado: aceptada como diseño. Fecha: 2026-09-19.

## Contexto y decisión

El runtime es único escritor de SQLite y de estado persistente. UI y extensión leen snapshots/eventos y solicitan comandos; no abren una segunda ruta de escritura. Credenciales y URLs sensibles no van a DB plana, FTS ni logs. Modo privado no persiste material de recuperación sin opt-in específico.

## Alternativas y consecuencias

Una DB por cliente diverge; permitir múltiples escritores rompe la autoridad de estado aunque SQLite pueda serializar transacciones. Un backend remoto contradice el funcionamiento local sin cuenta. A cambio, todas las mutaciones dependen de disponibilidad del runtime y errores claros.

## Hipótesis y prueba pendiente

Elegir biblioteca Rust y política WAL/sincronización en 03, con justificación de durabilidad y migraciones recuperables. En 01 comprobar que los clientes no escriben estado por su cuenta. En 03 probar DB bloqueada, migración interrumpida y reinicio; en 12 buscar secretos en DB/WAL/exports. ORG-04, SEC-01 a SEC-04; [plan §2 y §6](../TEST_PLAN.md).
