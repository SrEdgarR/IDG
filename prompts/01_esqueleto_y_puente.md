# 01 — Esqueleto ejecutable y prueba del puente con el navegador

Lee AGENTS.md, el estado de implementación y las secciones aplicables de la especificación, arquitectura, sistema visual y plan de pruebas. Inspecciona el código antes de cambiarlo. Ejecuta esta fase, no todas las fases posteriores. Da un plan breve y luego implementa.

No inventes API, datos reales o resultados. Fixtures solo en pruebas/galería de desarrollo. Si el entorno no puede ejecutar Windows o navegadores, prepara las comprobaciones y marca lo no verificado; no lo declares aprobado. Al cerrar, actualiza estado e inventario de controles, muestra comandos ejecutados y su resultado, limita los pendientes concretos y guarda SIGUIENTE_PASO.

Objetivo: demostrar temprano la arquitectura de procesos y la integración real antes de invertir en toda la interfaz.

Crea el workspace Rust y el workspace frontend con los paquetes mínimos de ARCHITECTURE. La UI Tauri debe abrir una ventana simple y real; runtime, host y protocolo deben compilar como unidades separadas. La ventana muestra Conectado/Desconectado según un handshake verdadero, no un temporizador.

Implementa un protocolo mínimo versionado: handshake/capabilities, ping, estado y suscripción. Runtime único con mecanismo Windows apropiado y named pipe protegido para el usuario. Protocolo con IDs de correlación, errores, timeouts y tamaño máximo. El host transforma Native Messaging a ese IPC: framing correcto, stdin/stdout binarios, logs solo por stderr y sin secretos. La UI se comunica mediante su backend, sin dar acceso arbitrario al filesystem o al shell a JavaScript.

Añade extensión mínima de desarrollo para Chromium y Firefox que haga handshake. Usa manifests/adaptadores correctos y documentación oficial vigente. Scripts explícitos de registro/desregistro por usuario del host en desarrollo; preservar otras instalaciones. Identificadores de desarrollo estables y claramente separados de los de publicación. No usar permisos/orígenes comodín donde se exige una identidad concreta.

Demuestra, si el entorno lo permite: UI se conecta; extensión se conecta; cerrar extensión/worker o navegador termina su host pero no el runtime; varias conexiones no crean motores duplicados; reiniciar un cliente recupera snapshot; salir explícitamente no provoca bucles de relanzamiento.

Prueba framing fragmentado, JSON inválido, longitud excesiva, versión incompatible, host ausente y canal no autorizado. Crea scripts de check y CI para componentes portables/Windows. Registra resultados auténticos y los pasos manuales pendientes.

No implementes aún segmentación, video, filas simuladas ni un servicio elevado. El entregable es un esqueleto funcional con la integración más arriesgada comprobada, no una maqueta del producto completo.

## Control de versiones y documentación

Respeta `docs/GITHUB_WORKFLOW.md`. Revisa el diff y secretos, actualiza el README y la guía afectada cuando cambie el uso o la instalación, realiza commits coherentes y push a la rama de trabajo en `sredgarr/IDG`. No confundas esta subida autorizada con publicar releases o extensiones. Informa rama, commit y resultado real; sin acceso, deja el push pendiente explícitamente.
