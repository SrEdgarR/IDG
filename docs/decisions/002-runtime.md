# ADR-002 — Runtime independiente

Estado: aceptada como diseño. Fecha: 2026-09-19.

## Contexto y decisión

DL-10 requiere continuar descargas aceptadas al cerrar ventana o navegador. El proceso de usuario `idg-runtime` coordina core, almacenamiento y adaptadores Windows. El core no depende de React/Tauri. Desktop y host son clientes. La bandeja tendrá un único propietario en runtime.

## Alternativas y consecuencias

Un motor en cada host duplicaría trabajos; dentro de la UI ataría su vida a WebView2. Un servicio elevado añade privilegios innecesarios. El proceso separado introduce empaquetado, supervisión e IPC que deberán probarse.

## Hipótesis y prueba pendiente

En 01 comprobar procesos mínimos y desconexión/reconexión. En 05 verificar X, bandeja y salida explícita con descargas reales; medir liberación de WebView2, sin asumir que ocultar equivale a liberar memoria. Referencias: [Arquitectura](../ARCHITECTURE.md) y [plan §3](../TEST_PLAN.md).
