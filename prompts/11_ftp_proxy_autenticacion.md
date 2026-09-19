# 11 — FTP, proxies y autenticación avanzada

Lee AGENTS.md, el estado de implementación y las secciones aplicables de la especificación, arquitectura, sistema visual y plan de pruebas. Inspecciona el código antes de cambiarlo. Ejecuta esta fase, no todas las fases posteriores. Da un plan breve y luego implementa.

No inventes API, datos reales o resultados. Fixtures solo en pruebas/galería de desarrollo. Si el entorno no puede ejecutar Windows o navegadores, prepara las comprobaciones y marca lo no verificado; no lo declares aprobado. Al cerrar, actualiza estado e inventario de controles, muestra comandos ejecutados y su resultado, limita los pendientes concretos y guarda SIGUIENTE_PASO.

Objetivo: completar protocolos y ajustes avanzados de conexión sin convertirlos en controles engañosos.

Añade adaptador FTP con biblioteca mantenida y licencia compatible, comprobando sus capacidades reales. Soporta descargas, autenticación, modo pasivo y reanudación cuando servidor/implementación lo permitan; valida identidad/tamaño del recurso con las limitaciones de FTP. FTPS cuando la biblioteca lo soporte, con validación de certificado. FTP sin TLS lleva aviso claro antes de enviar credenciales; no llamarlo conexión segura.

Usa el mismo ciclo de trabajos, `.idgpart`, colas, límites, checkpoints y finalización. No asumir paralelismo FTP idéntico a HTTP ni atribuir FTP a reqwest. Defiende el canal de datos contra redirecciones/destinos inesperados; pruebas controladas de protocolo y errores.

Implementa configuración de proxy del sistema y proxies explícitos HTTP/SOCKS donde se soporte, globalmente y por descarga. Verifica la ruta real de peticiones y posibles diferencias por protocolo. Un control no soportado en un adaptador se deshabilita con razón. Nunca llamar VPN a un proxy; aislamiento VPN por proceso/interfaz requiere una futura implementación comprobada.

Autenticación manual y cabeceras permitidas con validación; rechaza CR/LF, controles y headers reservados que romperían seguridad. Almacena secretos mediante mecanismos protegidos de Windows; no mostrarlos a React, logs, índices ni exportaciones. Cookies mínimas de sesión del navegador ya autorizada, con scoping por dominio/perfil y protección ante redirects.

Añade diagnóstico redactado de conexión, timeout, proxy inválido, contraseña rechazada y servidor no reanudable. Evita auto-reintentos agresivos con credenciales incorrectas.

Prueba contra FTP/FTPS y proxies locales de fixtures: descarga correcta, REST soportado/no soportado, TLS inválido, desconexión, cancelación, límites y secretos ausentes de logs. Actualiza la matriz de capacidades por protocolo y mantén opciones avanzadas fuera de la vista inicial.

## Control de versiones y documentación

Respeta `docs/GITHUB_WORKFLOW.md`. Revisa el diff y secretos, actualiza el README y la guía afectada cuando cambie el uso o la instalación, realiza commits coherentes y push a la rama de trabajo en `sredgarr/IDG`. No confundas esta subida autorizada con publicar releases o extensiones. Informa rama, commit y resultado real; sin acceso, deja el push pendiente explícitamente.
