# ADR-011 — HTTP secuencial y checkpoints protegidos

Estado: implementado en fase 03. Concreta ADR-006/008, sin cambiar plataforma, licencia ni fases posteriores.

## Transferencia y representación

`idg-core` recibe una solicitud y escribe en streaming, con escrituras de hasta 64 KiB. No depende de Tauri/React/SQLite. El runtime ejecuta una transferencia activa; otras solicitudes reciben `busy`, sin cola automática. No hay segmentación ni aceleración. Un GET inicial obtiene cabeceras y cuerpo: no consume enlaces mediante HEAD o sondeos adicionales. Tamaño desconocido se conserva como tal; EOF no demuestra por sí solo integridad remota, para eso hace falta una referencia.

Reqwest 0.13.5, sin features predeterminadas, usa rustls/stream, identidad de contenido, timeout de conexión 15 s y lectura 20 s. Hasta cinco redirecciones controladas; se rechazan userinfo, protocolos ajenos y descenso HTTPS→HTTP. No hay cookies, Authorization, Referer ni reintentos automáticos. HTML y representaciones transformadas se rechazan en esta fase para no guardar una página de acceso como archivo. Retry-After admite segundos/fecha; limita la reanudación manual, sin programador automático.

Reanudar exige ETag fuerte, URL efectiva y tamaño compatibles. Si había Last-Modified debe mantenerse. La respuesta 206 debe cubrir exactamente el sufijo solicitado con Content-Range consistente; Accept-Ranges no es evidencia. 200 no se concatena. 416 solo permite finalizar cuando el total coincide con los bytes durables y el total anterior, manteniendo validador y comprobación local. Un recurso cambiado o sin evidencia suficiente conserva el parcial y explica el rechazo; no reinicia silenciosamente. Last-Modified sin ETag fuerte no basta en esta primera implementación conservadora.

## Escrituras y recuperación

El runtime adquiere su instancia única antes de abrir SQLite. `idg-storage` usa rusqlite 0.40.2 con SQLite bundled, WAL, synchronous FULL y migración transaccional 001; rechaza una versión futura. La tabla actual guarda ID y documento completo protegido con DPAPI del usuario (incluye URL, destino, validador y estado). SQLite/WAL nunca reciben el JSON claro. No se añaden tablas vacías para colas/segmentos futuros. Fuera de Windows no hay fallback de secretos en claro; los tests portables ejercitan el core y migraciones.

Cada 1 MiB o aproximadamente un segundo con datos se hace flush, sync y después checkpoint. Los contadores distinguen recibido y durable. El checkpoint contiene SHA-256 del prefijo: al recuperar se comprueba el archivo y se descarta solo la cola posterior al límite guardado. Un fallo de checkpoint no confirma bytes nuevos. Trabajos interrumpidos reaparecen pausados; iniciar el runtime no descarga automáticamente. El hash calculado se diferencia de la comparación con un SHA-256 proporcionado.

Se crea un temporal exclusivo `.idgpart` junto al destino; no se adopta un archivo ajeno por su nombre. Se rechazan rutas UNC, reparse points y nombres Windows inválidos. Las políticas son `reject`, `rename` o `replace`, esta última explícita. Se registra el destino alternativo antes de mover. Windows usa MoveFileExW en el mismo volumen sin COPY_ALLOWED, con WRITE_THROUGH y reemplazo solo autorizado. Un bloqueo conserva `publish_pending`. Si el movimiento ocurrió pero el guardado final falló, la recuperación verifica tamaño/hash del final y reintenta el checkpoint, sin otro GET. No se afirma atomicidad conjunta entre SQLite y el sistema de archivos ni resistencia universal a cortes eléctricos.

Cancelar conserva el parcial propio para diagnóstico; no borra archivos finales. La pausa/cancelación activa se confirma por estado posterior, no por recibir el comando. La publicación ya iniciada no se deshace; un trabajo pendiente de publicación se reintenta con `resume`. Apagado impide admitir trabajos nuevos y espera el checkpoint de la transferencia activa.

## IPC y límites actuales

El protocolo v1 se amplía de forma aditiva; mantiene handshake/ping/suscripción. Solo el ejecutable autorizado `idg-probe` accede a comandos de descarga en esta fase; su Hello anuncia GetDownloadCapabilities y esa consulta enumera las operaciones admitidas. Escritorio/host conservan su alcance anterior. No hay segundo motor ni escritura desde CLI. Listado paginado de 50 trabajos sanos y hasta 50 no disponibles por página, máximo 10.000 trabajos nuevos admitidos. Bytes u64 se transportan como cadenas decimales para evitar pérdida en JavaScript.

`download_changed` contiene snapshot completo y secuencia por sesión de runtime; puede agrupar cambios intermedios. Al reconectar o detectar saltos se consulta `list`/`status`. `capabilities` anuncia esquema 1, una transferencia activa, tamaño máximo de escritura y requisito de validador. Snapshots no contienen URL, directorio ni credenciales. El nombre elegido y los contadores sí son visibles al cliente local autorizado. Esta protección no aísla frente a un atacante que controla la cuenta Windows y puede reemplazar los binarios.

## Referencias verificadas

- [Reqwest 0.13.5](https://docs.rs/reqwest/0.13.5/reqwest/), [ClientBuilder](https://docs.rs/reqwest/0.13.5/reqwest/struct.ClientBuilder.html): features, TLS, timeout, redirecciones y retry.
- [RFC 9110](https://www.rfc-editor.org/rfc/rfc9110.html): Range, Content-Range, If-Range y validadores.
- [Rusqlite 0.40.2](https://docs.rs/rusqlite/0.40.2/rusqlite/): transacciones y pragmas.
- [CryptProtectData](https://learn.microsoft.com/en-us/windows/win32/api/dpapi/nf-dpapi-cryptprotectdata) y [MoveFileExW](https://learn.microsoft.com/en-us/windows/win32/api/winbase/nf-winbase-movefileexw): protección por usuario y publicación Windows.

Versiones contrastadas con cargo info y documentación oficial antes de incorporarlas; se reutiliza sha2 0.10.9 del lockfile. httpdate 1.0.3 interpreta Retry-After. rcgen 0.14.10 y tokio-rustls 0.26.5 solo sirven pruebas TLS con certificado efímero en memoria; no cambian raíces de confianza del equipo. Versiones/licencias completas en [DEPENDENCIES.json](../DEPENDENCIES.json).
