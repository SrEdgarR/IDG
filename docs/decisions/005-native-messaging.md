# ADR-005 — Host ligero de Native Messaging

Estado: aceptada como diseño. Fecha: 2026-09-19.

## Contexto y decisión

Usar WebExtensions con Native Messaging y adaptadores Chromium/Firefox. El host traduce JSON en UTF-8 y longitud de 32 bits según el framing del navegador; stdout se reserva al protocolo. La propuesta de mensajes normales de hasta 256 KiB y paginación evita transportar archivos o historiales ilimitados.

Registrar orígenes/IDs específicos cuando existan: Chromium usa `allowed_origins`, Firefox `allowed_extensions`. No inventar IDs de tienda. Fuentes: [Chrome](https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging), [Mozilla](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Native_messaging).

## Alternativas y consecuencias

Un servidor HTTP accesible a páginas no aporta la autorización del navegador. El host no contiene motor ni DB, pero requiere registro por navegador y manejo de varios procesos. Un handshake confirma conexión, no aceptación durable de una descarga.

## Hipótesis y prueba pendiente

En 01 handshake real con Chromium y Firefox, host ausente, ID rechazado, mensajes inválidos/excesivos y cierre del navegador. AutoPick y transferencia durable corresponden a 07/08; no cancelar originales por un simple ACK. EXT-01 a EXT-08; [plan §3](../TEST_PLAN.md).
