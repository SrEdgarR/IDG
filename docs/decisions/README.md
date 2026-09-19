# Decisiones de arquitectura

Fecha: 2026-09-19. Aceptadas como diseño de la fase 00; ninguna implica implementación o validación experimental. Se conservarán cuando una ADR posterior las sustituya.

| ADR | Decisión | Comprobación posterior |
|---|---|---|
| [001](001-plataforma.md) | Plataforma, licencia y herramientas | Build y lockfiles en 01 |
| [002](002-runtime.md) | Runtime separado del escritorio | Ciclo de vida en 01/05 |
| [003](003-instancia-unica.md) | Una instancia por usuario | Carreras y salida en 01 |
| [004](004-pipes.md) | IPC por pipes protegidos | Clientes rechazados en 01 |
| [005](005-native-messaging.md) | Host ligero para navegador | Handshake Chromium/Firefox en 01 |
| [006](006-persistencia.md) | Runtime único propietario de DB | Persistencia en 03 |
| [007](007-contratos.md) | Contratos versionados y tipados | Generación/validación en 01 |
| [008](008-recuperacion.md) | Checkpoints y finalización segura | Fallos de proceso/disco en 03/04 |

Implementar solo el mínimo pedido en [fase 01](../../prompts/01_esqueleto_y_puente.md), sin anticipar el motor ni la interfaz completa. Pruebas detalladas: [TEST_PLAN](../TEST_PLAN.md).
