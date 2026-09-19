# ADR-008 — Recuperación y publicación del archivo final

Estado: aceptada como diseño; algoritmo durable pendiente. Fecha: 2026-09-19.

## Contexto y decisión

DL-04 a DL-07 priorizan integridad. Guardar rangos y bytes durables junto con validadores de representación; la longitud preasignada no demuestra progreso. Temporales propios en el volumen del destino; verificar cobertura, tamaño y hash esperado cuando exista antes de sincronizar y publicar el archivo final. Conservar el archivo anterior hasta reemplazo autorizado y seguro.

## Alternativas y consecuencias

Reanudar solo por nombre/tamaño puede mezclar versiones. Declarar finalización antes del rename oculta errores de disco/antivirus. Sincronizar cada byte sería costoso: definir checkpoints acotados y aceptar pérdida del último tramo no durable, nunca corrupción silenciosa.

## Hipótesis y prueba pendiente

En 01 revisar el contrato de apagado sin atribuirle descargas; en 03/04 definir orden de escrituras/flush/DB y recuperación entre cada paso. Probar muerte de proceso, cambio de ETag, Range→200, disco lleno, archivo bloqueado y destino existente. Un hash calculado sin referencia no verifica contra el origen. [Plan §1–2](../TEST_PLAN.md).
