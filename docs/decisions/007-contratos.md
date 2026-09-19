# ADR-007 — Contratos tipados y versionados

Estado: aceptada como diseño; generador pendiente. Fecha: 2026-09-19.

## Contexto y decisión

Definir contratos en un módulo independiente y generar los tipos TypeScript desde una fuente de verdad Rust. Validar entradas en ejecución: los tipos por sí solos no autentican mensajes. Incluir versión, correlación, errores tipados, idempotencia de mutaciones y secuencias de eventos con recuperación por snapshot ante huecos.

## Alternativas y consecuencias

Copiar interfaces a mano facilita divergencias; IPC libre y errores como cadenas impiden compatibilidad controlada. Generación implica elegir una herramienta compatible y verificar cambios de esquema. Los comandos del inventario CTL son orientativos hasta el contrato real.

## Hipótesis y prueba pendiente

En 01 implementar solo handshake/capacidades/snapshot mínimos que pida la fase, seleccionar generador y probar serialización, versión incompatible, mensaje malformado y desconexión. Añadir idempotencia de mutaciones al aparecer estas; nunca fingir comandos del motor. [Arquitectura §4](../ARCHITECTURE.md), EXT-02/05, SEC-06.
