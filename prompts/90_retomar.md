# 90 — Retomar el trabajo en otra sesión

Retoma Internet Download Genious sin empezar de cero.

Lee AGENTS.md, docs/IMPLEMENTATION_STATUS.md y sus referencias a código/pruebas. Inspecciona git status y el historial disponible; no descartes cambios sin commit ni asumas que todo lo indicado está implementado. Identifica la última fase realmente verificada y el SIGUIENTE_PASO.

Resume brevemente: qué funciona con evidencia, qué está implementado pero no verificado y cuál es el siguiente incremento. Lee el prompt de esa fase y las secciones pertinentes de la especificación. Después implementa ese incremento conservando arquitectura, diseño y decisiones aceptadas.

Si el estado dice que una fase falló, corrige/reproduce el bloqueo antes de declarar completado lo dependiente. No te limites a volver a planificar todo ni repitas la entrevista de producto. Solo pregunta por un dato que no puedas resolver desde el repositorio y que de verdad bloquee el siguiente paso.

Al terminar ejecuta comprobaciones disponibles, actualiza estado e inventario y deja un siguiente paso preciso para continuar.

## Control de versiones y documentación

Respeta `docs/GITHUB_WORKFLOW.md`. Revisa el diff y secretos, actualiza el README y la guía afectada cuando cambie el uso o la instalación, realiza commits coherentes y push a la rama de trabajo en `sredgarr/IDG`. No confundas esta subida autorizada con publicar releases o extensiones. Informa rama, commit y resultado real; sin acceso, deja el push pendiente explícitamente.
