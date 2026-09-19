# 91 — Corregir una regresión sin rehacer el proyecto

Corrige el problema que describo a continuación en Internet Download Genious:

[PEGAR AQUÍ EL ERROR, LOS PASOS PARA REPRODUCIRLO Y EL RESULTADO ESPERADO]

Lee AGENTS.md y la especificación relacionada. Inspecciona el código y reproduce el fallo, usando fixtures y logs redactados. Si no logras reproducirlo, indica la evidencia disponible y qué falta; no inventes una causa raíz.

Escribe una prueba que falle por el problema cuando sea posible. Localiza la causa y aplica el cambio mínimo que lo resuelva conservando contratos, diseño y funciones existentes. No reescribas el módulo completo, cambies el stack o quites el control como atajo. Nunca desactives TLS, hashes, firmas, permisos o tests para pasar.

Ejecuta la prueba nueva y las comprobaciones relacionadas. Revisa escenarios vecinos y recuperación tras fallo. Entrega causa demostrada o hipótesis identificada, archivos modificados, resultados reales y cómo comprobar la corrección. Actualiza documentación/estado solo si el comportamiento cambió de forma válida.

## Control de versiones y documentación

Respeta `docs/GITHUB_WORKFLOW.md`. Revisa el diff y secretos, actualiza el README y la guía afectada cuando cambie el uso o la instalación, realiza commits coherentes y push a la rama de trabajo en `sredgarr/IDG`. No confundas esta subida autorizada con publicar releases o extensiones. Informa rama, commit y resultado real; sin acceso, deja el push pendiente explícitamente.
