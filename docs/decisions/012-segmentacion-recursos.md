# ADR-012 — Rangos durables y presupuestos compartidos

Fase 04. Conserva plataforma, licencias, UI y camino secuencial de ADR-011. La integración visual de trabajos corresponde a 05.

## Elegibilidad y escritura

Automático es el modo inicial; el llamante debe declarar `replay_safe: true` para autorizar GET repetidos/rangos/reintentos automáticos. No se deduce seguridad de repetición de una URL o de sus parámetros. Sin esa afirmación se conserva el GET secuencial de 03. Manual permite 1–32 solicitudes, sujeto a los presupuestos global/origen; 1 fuerza el camino secuencial. No se anuncian sockets TCP: son solicitudes HTTP activas, que pueden compartir transporte HTTP/2.

Para convertir una descarga nueva se exige tamaño conocido >=4 MiB, ETag fuerte y anuncio Accept-Ranges; primero se conserva un prefijo durable del GET inicial. Ese anuncio es solo una condición conservadora: cada 206 posterior debe probar rango y representación exactos antes de escribir. Para un parcial ya conocido se puede intentar el rango autorizado con sus validadores. No se hace HEAD ni un GET especulativo de un enlace de un uso. Un servidor sin anuncio de rangos conserva el mismo GET secuencial; si anuncia rangos pero responde 200/416 incorrecto o cambia validadores, se detiene con error y conserva los rangos anteriores, sin reiniciar ni concatenar silenciosamente.

Plan semiabierto [inicio, fin), mínimo 1 MiB y hasta 4096 entradas; el tamaño crece en archivos grandes para acotar metadatos. Un prefijo antiguo puede ser menor. Se comprueban cobertura exacta, huecos, solapes, representación, longitud y límites de 64 bits. La prueba generada cubre u64::MAX; la escritura rechaza tamaños superiores a i64::MAX, límite del posicionamiento utilizado, y no afirma una prueba física de archivos enormes.

Los workers no tienen acceso al archivo: envían bloques <=64 KiB por canal de ocho mensajes a un único escritor. Cada bloque lleva rango, generación y offset esperado; se confirma por canal de un solo uso. Un intento termina antes de reasignar su rango. Al pausar/cancelar se abortan y esperan todos los workers antes de liberar el escritor; mensajes tardíos no pueden tocar el archivo.

Cada rango se confirma después de flush/sync y su SHA-256. El documento protegido guarda esos rangos; la longitud preasignada no cuenta como progreso. Se comprueban los hashes durables al recuperar; los rangos incompletos se reescriben y el contador útil usa el máximo alcanzado por rango durante la sesión, sin sumar dos veces los reintentos. Recibido no es durable. Al cubrir el archivo entero se lee en streaming para calcular **el SHA-256 completo**, sin concatenar hashes de rangos, y se reutiliza la publicación segura de 03.

## Recursos y adaptación

Por defecto: tres descargas activas, 16 solicitudes globales y ocho por origen. Configuración IPC: 1–8 trabajos, 1–32 solicitudes global/origen; exceso de trabajos devuelve Busy, sin editor ni cola programada. El presupuesto se comparte entre todos los ejecutores, incluido el secuencial y los destinos de redirección. El origen incluye esquema/host/puerto. Los permisos usan prioridad con ventaja acotada (Alta 100 ms, Normal 50 ms, Baja 0) y antigüedad: una petición vieja termina superando nuevas peticiones prioritarias. No hay prioridad exclusiva que pueda bloquear indefinidamente a las demás.

Automático empieza con dos solicitudes y tope ocho. Ventanas de al menos un segundo miden bytes útiles: dos ventanas estables permiten una prueba de +1. Se conserva solo si dos ventanas posteriores mejoran >=10%; si no, vuelve al nivel anterior y espera cuatro ventanas. Errores, 429/503 o escrituras/sync >50 ms reducen a la mitad y aplican enfriamiento. El descenso impide nuevos permisos locales por encima del objetivo; no cancela bytes útiles en vuelo. Un archivo corto puede terminar sin suficientes ventanas para adaptar. Manual limita concurrencia, pero también reduce presión tras errores.

Límites global/individual en bytes/s, inicialmente null (ilimitados). Tokens de hasta 64 KiB, sin reservar deuda futura; se requieren ambos presupuestos para consumir un bloque. Pausa/cancelación interrumpe permisos, tokens y backoff. El límite corresponde al consumo del cuerpo por la aplicación, con prelectura acotada del transporte; no configura ni altera la conexión del equipo. Cambiar opciones de un trabajo requiere pausarlo; los límites globales pueden actualizarse y afectan nuevos permisos/consumos, sin revocar solicitudes en vuelo.

Hasta tres reintentos por rango, con backoff exponencial y dispersión determinista; solo red, timeout y presión temporal, nunca cambio de representación. El secuencial autorizado tiene hasta tres reintentos. Retry-After domina el backoff y pausa nuevas solicitudes de ese origen. Plazos superiores a una hora detienen el trabajo en lugar de crear una espera extrema: se conserva el plazo solicitado y no se reintenta automáticamente ni antes del mismo. Puede cancelarse; renovar el enlace o iniciar otra solicitud explícita no es una renovación automática del trabajo. No se recorta un plazo para reintentar antes de lo pedido.

## Persistencia y contrato

Migración 002 añade ajustes de recursos protegidos; documentos antiguos se leen con valores predeterminados de campos nuevos. No se borra la DB ni se modifica su blob durante la migración. Rangos y opciones permanecen dentro del documento de trabajo protegido con DPAPI. **No hay cifrado integral de SQLite**: esquema/ID son visibles. La prueba de migración conserva el blob de 03; otra recupera su parcial secuencial desde el offset anterior.

Protocolo de transporte v1 aditivo, capacidades de descarga esquema 2. Se añaden opciones, límites y consulta paginada de rangos (50); snapshots incluyen solicitudes activas contadas por permisos reales, objetivo, rangos durables, bytes transferidos y reintentos. El host/extensión mantiene sus permisos anteriores. El runtime sigue siendo único escritor y fuente de verdad.

Memoria de aplicación: canal de 512 KiB más hasta un bloque de 64 KiB por worker, hashes/contadores de hasta 4096 rangos y buffers internos de HTTP/TLS/SQLite. No es una cota total de RAM del proceso: se mide aparte. No se implementan segmentación FTP, AutoPick, multimedia, UI de descargas o fase 05.

API contrastada con documentación oficial de [Tokio 1.53.1 mpsc](https://docs.rs/tokio/1.53.1/tokio/sync/mpsc/fn.channel.html), [JoinSet](https://docs.rs/tokio/1.53.1/tokio/task/struct.JoinSet.html) y [RFC 9110](https://www.rfc-editor.org/rfc/rfc9110.html). No se añadieron versiones de bibliotecas; se reutiliza Serde en la CLI.
