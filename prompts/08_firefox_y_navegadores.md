# 08 — Firefox y compatibilidad de navegadores

Lee AGENTS.md, el estado de implementación y las secciones aplicables de la especificación, arquitectura, sistema visual y plan de pruebas. Inspecciona el código antes de cambiarlo. Ejecuta esta fase, no todas las fases posteriores. Da un plan breve y luego implementa.

No inventes API, datos reales o resultados. Fixtures solo en pruebas/galería de desarrollo. Si el entorno no puede ejecutar Windows o navegadores, prepara las comprobaciones y marca lo no verificado; no lo declares aprobado. Al cerrar, actualiza estado e inventario de controles, muestra comandos ejecutados y su resultado, limita los pendientes concretos y guarda SIGUIENTE_PASO.

Objetivo: compartir código sin fingir que todos los navegadores tienen idénticas capacidades.

Completa Firefox sobre el adaptador/POC de fase 01. Verifica manifest, background, promesas/eventos, permisos, descarga, host allowed_extensions y registro en Windows según documentación actual. No copiar el manifest Chrome cambiando el nombre y declararlo compatible. Gestiona IDs estables de desarrollo/publicación de manera explícita.

Valida Chrome, Edge y Firefox como matriz principal. Después prueba empaquetado/carga, registro del host, Native Messaging, popup, contexto, AutoPick y eventos en Brave, Opera y Vivaldi. Mantén una tabla navegador/versión/función/resultados/restricciones. «Basado en Chromium» no sustituye una prueba ni permite inventar rutas de registro.

Añade gestión de perfiles, modo privado/incógnito y contenedores cuando las APIs lo permitan. No mezclar cookies/estados privados con el perfil normal. Permisos ausentes degradan la captura sin romper descargas manuales. No alterar preferencias de seguridad o forzar extensiones.

Conecta onboarding: detectar navegador instalado, abrir instalación oficial cuando exista URL real, mostrar permiso pendiente/host ausente/conectado verificado. En desarrollo, ofrecer instrucciones de carga local y no un enlace ficticio a la tienda. Detectar navegador no significa verificar extensión.

Repite pruebas de transferencia segura de fase 07 en Firefox y, según la matriz, en derivados. Corrige diferencias mediante adaptadores pequeños en lugar de condicionales dispersos. Preserva funcionalidad de Chrome/Edge.

Genera builds separados con metadata correcta, instrucciones de instalación/desinstalación y checklist de publicación. No subas a tiendas ni registres cuentas: entrega artefactos locales si es posible y limitaciones verificables.

## Control de versiones y documentación

Respeta `docs/GITHUB_WORKFLOW.md`. Revisa el diff y secretos, actualiza el README y la guía afectada cuando cambie el uso o la instalación, realiza commits coherentes y push a la rama de trabajo en `sredgarr/IDG`. No confundas esta subida autorizada con publicar releases o extensiones. Informa rama, commit y resultado real; sin acceso, deja el push pendiente explícitamente.
