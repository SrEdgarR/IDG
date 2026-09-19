# Plan de pruebas y criterios de entrega

Este documento exige evidencia, no resultados anticipados. Todos los archivos de prueba pertenecen a fixtures o directorios temporales creados por las pruebas. No borrar descargas personales ni usar páginas de terceros como único banco de pruebas.

## 1. Servidor HTTP/HTTPS controlado

Crear un servidor local determinista con endpoints para los siguientes comportamientos. Las peticiones y bytes servidos se cuentan para verificar reanudación y duplicados.

| Caso | Resultado esperado |
|---|---|
| GET con tamaño y contenido conocido | Archivo final idéntico byte a byte y por SHA-256. |
| Sin Content-Length | Descargar con progreso indeterminado; no inventar porcentaje. |
| HEAD denegado pero GET válido | Obtener lo disponible sin descartar la descarga. |
| Accept-Ranges presente, pero Range recibe 200 | No mezclar el cuerpo completo con parciales; fallback seguro. |
| Accept-Ranges ausente, Range válido | Detectar capacidad real sin depender solo de la cabecera. |
| 206 con Content-Range incorrecto | Rechazar el segmento y no anunciar completado. |
| 416 | Distinguir recurso cambiado, rango inválido o fin alcanzado con verificación. |
| ETag/Last-Modified/longitud cambian | No ensamblar versiones distintas. |
| Corte abrupto y reconexión | Recuperar bytes durables sin duplicarlos. |
| 429/503 con Retry-After | Esperar y reducir presión, sin reintentos ilimitados. |
| 401/403, enlace vencido o login HTML | Mensaje accionable; no guardar un login como archivo esperado. |
| Redirección a otro dominio | No filtrar cookies/Authorization del origen. |
| gzip/transformación de representación | No aplicar offsets a una representación distinta. |
| URL de un solo uso | No consumirla con probes repetidos sin una estrategia segura. |
| Cero bytes, un byte, Unicode, nombres hostiles | Resultado correcto o rechazo explicado. |

Crear certificados de prueba propios; confiar en ellos solo dentro del test. Nunca resolver un test desactivando TLS en producción. Para archivos mayores de 4 GiB usar generación determinista streaming y pruebas programadas adecuadas, no reservar todo el contenido en memoria ni llenar el disco de CI accidentalmente.

## 2. Core, almacenamiento y fallos

Unitarias para máquina de estados, cálculo de rangos, límites, reglas, colas, normalización de rutas y redacción. Propiedades para que los rangos finales cubran exactamente el archivo sin huecos ni solapes no controlados. Pruebas de concurrencia/cancelación, duplicate command IDs, orden de eventos y budgets.

Tests de proceso: terminar el runtime durante una descarga y durante checkpoint/finalización; abrir otra instancia; reiniciar con temporales, migraciones incompletas o una DB bloqueada. La recuperación conserva lo verificable y reconoce lo no durable. Nunca declarar progreso usando solo longitud preasignada.

Disco lleno, permiso denegado, archivo bloqueado, destino existente y carpeta desconectada. Sobrescritura cancelada debe conservar intacto el archivo anterior. Falla de hash mantiene el resultado fuera del estado Completada. No depender de un rename entre volúmenes como operación atómica.

## 3. Windows y extensión

Pruebas en Windows 10 y Windows 11 x64. Registrar edición/build, CPU/RAM, almacenamiento, versión de WebView2 y navegador. CI Windows verifica lo que realmente ejecuta; pruebas de interfaz o instalación que no corran en CI quedan en matriz manual pendiente.

Probar instalación por usuario, rutas con espacios/acentos, registro/retirada del host, inicio con Windows opcional, X→bandeja, salir completo, nueva acción después de salir, varias ventanas y cierre del navegador. No permitir procesos huérfanos, iconos de bandeja duplicados o reactivación infinita.

Para Chrome, Edge y Firefox: handshake; permiso rechazado; host ausente; JSON inválido; mensajes excesivos; ID no permitido; worker reiniciado; timeout; snapshots con huecos; perfiles distintos; modo privado. Después validar Brave, Opera y Vivaldi en sus rutas/configuraciones reales.

AutoPick: los tres modos; excepciones de sitio/tipo/tamaño; tamaño desconocido; cancelación de diálogo; usar navegador sin recaptura; aceptación durable; URL GET directa, redirección, autenticación, POST, blob, data, URL de un solo uso y captura duplicada. Los casos no transferibles deben conservar una vía funcional en el navegador. No exigir «cero bytes recibidos por el navegador» como garantía imposible de la ruta onCreated.

## 4. Interfaz y uso cotidiano

Pruebas de componentes, integración y E2E donde sea posible: modal con validación; nueva descarga real; pausa/reanuda; fila compacta/expandida; 1/3/20 trabajos; búsqueda/filtros; selección masiva; reglas; colas; configuración persistente; onboarding omitible; notificaciones; modos claro/oscuro/sistema; tamaños desconocidos; historial con archivo no encontrado y localización manual.

Teclado, foco, tabulación, textos accesibles, reducción de movimiento y DPI. Cada control de UI_CONTROL_INVENTORY enlaza con una comprobación. Capturas reales para revisión visual; una screenshot del frontend en navegador no verifica por sí sola una integración Tauri/Windows.

## 5. Multimedia y FTP

Fixtures de clips propios/licencia compatible. Video directo, audio directo, reproductores múltiples, iframe permitido/no permitido, HLS VOD master/media, MPD estático, pistas separadas y manifest malformado. Tests explícitos de los elementos HLS/DASH soportados y rechazo de los no soportados; límites de segmentos, redirects, XML y bytes para evitar consumo ilimitado.

FFmpeg: stream copy y conversión solicitada, selección de pista, salida cancelada, disco lleno, codec no disponible, nombres con caracteres especiales. Verificar pistas y duración mediante ffprobe; duración razonable según fixture, no una comparación mágica que acepte cualquier truncamiento. Comparación decodificada o de streams cuando corresponda. Fallar sin reemplazar original válido. No descargar claves ni contactar servidores de licencias para contenido protegido.

FTP/FTPS local controlado: autenticación, modo pasivo, listado cuando se necesite, REST/reanudación cuando sea soportado, desconexión, TLS, límite y credenciales incorrectas. Evitar FTP bounce aceptando destinos de datos inesperados. Proxies controlados para comprobar ruta efectiva y ausencia de fugas en logs.

## 6. Seguridad, privacidad y actualizaciones

Entradas hostiles en nombre de archivo, URL, CSV, títulos, headers, manifest y mensajes IPC. Traversal, nombres reservados Windows, ADS, paths UNC inesperados, reparse points y esquemas no admitidos. No ejecutar shell con texto de entrada. No permitir a una página dirigir automáticamente peticiones a servicios privados del equipo.

Buscar secretos de prueba en SQLite, WAL, logs, FTS, capturas, exports y payloads enviados a la UI. Descarga privada y desactivación de estadísticas cumplen sus políticas. Exportación de diagnóstico redactada; ninguna telemetría saliente sin consentimiento y destino aprobado.

Actualizador con fixtures y claves de test separadas: versión nueva, igual/anterior, firma ausente/inválida, binario cambiado, release incompleta, sin red, rechazo del usuario y descarga activa no reanudable. La versión alterada no se instala. Actualizar/reiniciar coordina runtime y hosts; backups/migraciones conservan recuperación. Nunca usar claves de test para un release público.

## 7. Rendimiento y cierre

Benchmark release, no solo debug: 1, 3 y 10 descargas; 1/4/8/16 solicitudes; miles de entradas históricas; ventana oculta/abierta; popup cerrado/abierto. Separar bytes útiles de retransmisiones. Medir throughput, CPU, memoria del runtime, memoria de WebView2, disco, tiempo de inicio y latencia de UI. Repetir y publicar configuración/variabilidad. No comparar contra IDM con casos no equivalentes ni inventar resultados.

La entrega candidata no tiene errores críticos conocidos de corrupción/pérdida, exposición de secretos, transferencia de navegador destructiva o actualización insegura. Todo requisito obligatorio queda VERIFICADO o bloquea esa declaración de entrega. Funciones diferidas figuran explícitamente, sin controles engañosos. «Compila» no significa «está terminado».

## 8. Documentación, interfaz y control de versiones

Comprobar los enlaces Markdown locales y que docs/README destaque INTERFAZ, DESIGN_SYSTEM e inventario. Cada superficie UX y control CTL debe tener fase, disponibilidad y prueba correspondiente. No aprobar una UI solo por una imagen o una galería sin motor.

La fase 00 confirma cuenta/destino, protección de archivos ajenos, ausencia de secretos en lo subido, rama main y SHA remoto real. Las fases siguientes registran rama/commit/push; un fallo de acceso no se comunica como éxito. Comprobar que ningún prompt conserva una prohibición general de push que contradiga la autorización limitada a IDG.

El README separa usuario y desarrollador, estado previsto y verificado, instalador real y kit de prompts. No contiene enlaces a versiones/tiendas inexistentes ni capturas fabricadas. Cuando exista una release autorizada, probar los pasos de instalación con ese artefacto y actualizar la guía en el mismo incremento.

## Evidencia y reproducción de fase 03

| Comprobación | Ejecución y alcance |
|---|---|
| HTTP real, tamaño conocido/desconocido, cero/un byte, HEAD denegado | Tests Rust con TCP local y fixture Node; se usa GET único sin sondeo HEAD |
| 206/If-Range y hash; 200 ignorado, rango inválido, ETag cambiado, 416 exacto/incorrecto | Tests Rust y suite IPC; no concatenan representaciones inválidas |
| Pausa/cancelación y recuperación | Transferencia real, checkpoint y descarte de cola no confirmada; cancelación conserva temporal |
| Muerte de proceso | test-http-runtime mata su propio runtime tras >=1 MiB, reinicia pausado y verifica Range = bytes durables y cuerpo = bytes restantes; SHA-256 final con referencia |
| TLS | Servidor HTTPS real, certificado efímero solo confiado dentro del test; cliente normal rechaza certificado no confiable, sin modificar raíces del equipo |
| Hash erróneo | No publica ni reemplaza el final existente |
| Archivo bloqueado Windows | Handle real impide reemplazar; publish_pending; tras liberarlo publica sin otro GET |
| Disco lleno | Fallo de escritura inyectado (OS 112 Windows/28 Linux), sin confirmar bytes; NO se llenó un disco ni se probó apagado físico |
| Persistencia | Migración idempotente, rollback transaccional, versión futura/DB bloqueada, DPAPI real y blob corrupto aislado |
| Publicación/DB | Fallo de checkpoint final inyectado y repetido tras mover; reconciliación por tamaño/hash sin GET |
| IPC | Capacidades por rol, eventos con secuencia, idempotencia, busy ante segunda transferencia; host sin permiso de trabajos |
| Regresión | Check.ps1 -Integration: formato, Clippy, Rust, TS/build, runtime, UI, ventana Tauri y páginas reales de extensiones Chromium/Firefox |

CI portable ejecuta core/protocolo/storage en Linux (DPAPI y bloqueo de archivo Windows se excluyen por plataforma). CI Windows ejecuta Check.ps1 e incluye fixture HTTP y prueba de proceso; CI ui cubre galería. Ningún workflow certifica la matriz gráfica Windows/navegadores de -Integration. Referencias de runs/SHA en IMPLEMENTATION_STATUS.

Pendiente: Windows 10, navegadores de consumo adicionales, gesto del popup desde menú nativo, accesibilidad exhaustiva/DPI real, archivos enormes y perfiles de rendimiento, cortes eléctricos físicos y almacenamiento externo/red. No son afirmaciones de éxito ni razón para activar funciones de fases 04+. No hay segmentación, colas, captura o multimedia en esta prueba.
