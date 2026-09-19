# Internet Download Genious — Especificación del producto

Versión de especificación: 1.1 · Actualizada el 19 de septiembre de 2026.
Nombre de trabajo solicitado: **Internet Download Genious / IDG**. Repositorio de destino: **sredgarr/IDG**, cuya creación se encarga a Astra en fase 00. No implica comprobación de disponibilidad de marca ni creación ya realizada.

La especificación de pantallas y flujos está en [INTERFAZ.md](INTERFAZ.md), los tokens en [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md) y la correspondencia de acciones/pruebas en [UI_CONTROL_INVENTORY.md](UI_CONTROL_INVENTORY.md). El flujo autorizado de código y documentación se define en [GITHUB_WORKFLOW.md](GITHUB_WORKFLOW.md).

## 1. Objetivo y prioridades

Un reemplazo moderno de IDM, gratuito y open source, para usuarios normales de Windows 10 y Windows 11. La complejidad técnica debe permanecer en paneles avanzados. Prioridad, en orden: preservar archivos y privacidad; completar descargas de manera fiable; aprovechar la velocidad disponible; consumir pocos recursos; ofrecer una experiencia moderna, sencilla y accesible.

No prometer «más rápido que IDM» o «sin errores». Medir mejoras con pruebas reproducibles. No copiar código, gráficos, textos comerciales ni identidad de IDM o Vercel.

**Plataforma de entrega inicial propuesta:** Windows x64. Windows ARM64 queda como ampliación; no se considera verificado por una compilación cruzada. Solo Windows 10/11, sin macOS, Linux de escritorio, Safari o Windows 7/8. Las pruebas de bibliotecas portables sí pueden ejecutarse en Linux.

**Tecnologías:** Rust para motor y runtime; Tauri 2, React y TypeScript para interfaz; SQLite local; WebExtensions para navegador; FFmpeg/ffprobe para operaciones multimedia. No Electron, backend web obligatorio, cuenta, IA incorporada ni servicios de pago necesarios para descargar.

**Licencia del producto:** GPL-3.0-only. Las versiones derivadas distribuidas del código cubierto deben respetar sus obligaciones; no se afirma que todo cambio privado deba publicarse o que esté prohibida la redistribución comercial. Incluir licencia, avisos y código fuente correspondiente de lo distribuido. Referencia [S10].

## 2. Interfaz principal — UI-01 a UI-08

### UI-01 · Composición
Aplicación de escritorio con sidebar y área principal de descargas, no una landing page ni un dashboard financiero. Sidebar con dos grupos: estados y categorías.

Estados: **Todas, Descargando, En cola, Completadas, Pausadas, Fallidas**.
Categorías: **Videos, Documentos, Programas, Comprimidos, Otros**.
Configuración al pie; Estadísticas visible únicamente al activarlas. Las categorías personalizadas son compatibles; no crear Música por defecto. El audio se clasifica en Otros hasta que el usuario cree una categoría propia.

Barra superior: búsqueda, filtros y botón Nueva descarga. Acciones de fila: pausar/reanudar según estado, carpeta cuando existe, menú contextual. Selección múltiple revela una barra de acciones masivas.

### UI-02 · Apariencia
Inspiración Vercel: monocromática, tipografía cuidada, bordes discretos, iconos de trazo y espacio suficiente. Modo Sistema como predeterminado, con Claro y Oscuro seleccionables. Oscuro carbón suave, no negro puro como fondo principal; claro marfil/gris suave, no una superficie blanca deslumbrante. Tokens exactos y accesibilidad en DESIGN_SYSTEM.

### UI-03 · Filas y expansión
Cada descarga ofrece nombre, tamaño total, bytes descargados, porcentaje, velocidad, tiempo restante estimado, sitio/servidor, conexiones o solicitudes activas reales, fecha, tipo, categoría y estado. En compacto se priorizan nombre, progreso, velocidad, tiempo y **sparkline en la misma fila**; el resto aparece al expandir o en detalles. No apilar todos los campos en una fila ilegible.

Vista automática inicial: entre una y tres descargas visibles, expandir las activas cuando haya espacio; con cuatro o más, compactar. La decisión manual de expandir/contraer tiene prioridad. No volver a colapsar durante una interacción ni al recibir cada evento. Historial grande: virtualización/paginación. Configurable: Automática, Compacta, Expandida.

### UI-04 · Gráficas
Sparkline alimentado por medidas reales, con memoria acotada. Una descarga expandida muestra un gráfico mayor opcional, sin librería pesada obligatoria. La curva no avanza si no hay muestras. No renderizar continuamente filas fuera del viewport ni ventanas ocultas. Datos desconocidos: «—», «Calculando» o «Desconocido», no números inventados.

### UI-05 · Navegación y búsqueda
Buscador global sobre nombre, dominio, categoría, ruta y partes no sensibles de la URL almacenada. Filtros por estado, fecha, sitio, tipo y tamaño. Sintaxis avanzada opcional documentada: `site:`, `type:`, `status:`, `size:`; una consulta desconocida no debe romper la búsqueda.

### UI-06 · Accesibilidad
Teclado, foco visible, nombres accesibles, tooltips, estados no basados solo en color, soporte de escalado de Windows y reducción de movimiento. Menús y diálogos accesibles. Idioma inicial español con estructura preparada para traducciones; no mezclar inglés en mensajes dirigidos al usuario.

### UI-07 · Ventanas auxiliares
Mini ventana de progreso y zona flotante para soltar enlaces, ambas opcionales y desactivadas inicialmente. No confundirlas con la ventana de Nueva descarga ni con el botón multimedia del navegador.

### UI-08 · Feedback
Animaciones discretas de unos 120–180 ms y confirmación visible de acciones. «Descargar ahora» cierra el diálogo una vez aceptado y persistido el trabajo, sin esperar toda la descarga. La extensión cambia su estado/badge y puede hacer una microanimación breve si la API del navegador lo permite. Nunca mantener un bucle de animación para simular actividad.

## 3. Primera ejecución y Windows — WIN-01 a WIN-07

### WIN-01 · Asistente
Cuatro pasos breves: bienvenida; carpeta; integración con navegador; AutoPick. Carpeta inicial: Known Folder Descargas de Windows, no una ruta hardcodeada. Organización por tipo: opcional, inicialmente desactivada para no modificar hábitos sin consentimiento.

Detectar navegadores instalados como información, no como prueba de que la extensión esté instalada. «Conectado» exige handshake real. Abrir la tienda oficial correspondiente cuando exista publicación; en desarrollo proporcionar instrucciones honestas para cargar extensión local. Nunca simular instalación, inventar enlaces de tienda o activar extensiones sin consentimiento. Es posible omitir el paso y descargar manualmente.

### WIN-02 · AutoPick inicial
Tres modos: **Siempre usar IDG / Preguntarme / Usar el navegador**. Predeterminado propuesto: Preguntarme. Siempre usar IDG sigue abriendo el diálogo de Nueva descarga para revisar nombre y carpeta; no significa iniciar silenciosamente sin ese paso.

### WIN-03 · Botón X y bandeja
X minimiza a la bandeja de manera predeterminada. Configurable: Minimizar, Cerrar completamente, Preguntar. Bandeja: abrir IDG, nueva descarga, pausar/reanudar todas, estado de AutoPick, salir.

Salir completamente detiene el runtime, no solo la ventana. Guardar checkpoints; avisar que las descargas no reanudables podrían requerir reinicio desde cero. Un proceso temporal de Native Messaging no debe reiniciar IDG en bucle después de una salida explícita. Solo una nueva acción del usuario o un inicio autorizado puede reactivarlo.

### WIN-04 · Inicio y programación
Inicio con Windows opcional y desactivado por defecto. La programación funciona mientras el runtime está activo y Windows despierto. No prometer descargas con la PC apagada. Programar reactivación o inicio del equipo sería una función aparte con consentimiento; queda fuera de la primera entrega.

### WIN-05 · Integración local
Instancia única efectiva del runtime. Menú del Explorador y protocolo propio, si se implementan, son opt-in, reversibles, sin privilegios innecesarios. No interpretar un enlace como código o línea de comandos. La versión instalable es obligatoria; portable queda documentada como posible ampliación, sin prometer integración automática.

### WIN-06 · Notificaciones
Configurar individualmente inicio, fin, error y conectividad; notificaciones y sonidos pueden desactivarse. Propuesta inicial: fin y errores activados, inicio y sonidos desactivados. Acciones relevantes: abrir carpeta, reintentar, copiar ruta; abrir un ejecutable siempre exige acción explícita del usuario. Respetar ajustes de notificación de Windows y evitar tormentas de avisos.

### WIN-07 · Instalación y actualizaciones
Instalador para usuario normal, preferentemente NSIS por usuario. Verificar WebView2 y explicar cualquier descarga adicional necesaria. Actualizaciones desde GitHub Releases: búsqueda automática configurable; mostrar versión, notas y botones Más tarde / Actualizar y reiniciar. No instalar ni reiniciar sin aceptar. Proteger descargas activas y explicar casos no reanudables. Firmas del actualizador obligatorias, separadas de la firma Authenticode del instalador. Sin claves reales, publicar actualizaciones de producción queda bloqueado; nunca suprimir verificación para hacer que «funcione». Referencias [S07], [S08].

## 4. Descarga tradicional — DL-01 a DL-10

### DL-01 · Protocolos
HTTP y HTTPS desde el núcleo inicial. FTP mediante adaptador específico, no atribuirlo a una biblioteca que solo implementa HTTP. Preferir FTPS cuando se soporte; FTP sin TLS requiere aviso de que no cifra credenciales ni contenido. BitTorrent está en un módulo opcional posterior, no bloquea la aplicación principal.

### DL-02 · Nueva descarga
Mostrar nombre editable, URL con secretos ocultos por defecto, tamaño o desconocido, tipo, carpeta, categoría, sitio de origen y reanudabilidad. Estados de reanudabilidad: Comprobando, Confirmada en la comprobación actual, No disponible, Desconocida. No tratar una comprobación como garantía de que el enlace seguirá vigente para siempre.

Botones: **Descargar ahora / Descargar después / Añadir a cola / Cancelar**. Después crea un elemento diferido que no se inicia automáticamente; añadir a cola obedece las reglas de esa cola. El plegable Avanzado permite conexiones, límite, prioridad, cola, proxy y cabeceras permitidas.

### DL-03 · Segmentación adaptable
Descargas por rangos concurrentes para representaciones apropiadas, ajustando concurrencia según mejora sostenida, fallos, límites del servidor y disco. No suponer que más conexiones siempre es mejor. Una conexión o un stream lógico no son necesariamente lo mismo bajo HTTP/2: la interfaz técnica debe usar nombres correctos.

Modo Automático por defecto. Avanzado permite límite manual, con tope conservador documentado. Propuesta inicial: 3 descargas simultáneas, hasta 8 solicitudes concurrentes por origen y máximo manual 32 por archivo, sujeto al presupuesto global. Son valores ajustables después de medir, no requisitos de rendimiento garantizado. Límites de velocidad global e individual desactivados inicialmente.

### DL-04 · Reanudación y errores
Reanudación condicionada al servidor y a que el recurso siga siendo el mismo. Verificar rangos y validadores; nunca concatenar una respuesta completa 200 con un parcial existente. Soportar cortes, reinicio de la aplicación, suspensión, reintentos limitados con espera progresiva y actualización autorizada de una URL vencida.

Una petición repetida no es automáticamente segura: no reproducir POST, formularios, URLs de un solo uso o sesiones incompletas como si fueran enlaces GET públicos. Fallos deben permitir reintentar, localizar archivo parcial, actualizar enlace o reiniciar sin perder silenciosamente el trabajo. Referencia [S09].

### DL-05 · Temporales y finalización
Escribir en `archivo.iso.idgpart` en el mismo volumen del destino. Si hay colisión, usar temporal único asociado al ID del trabajo. Estado auxiliar en el directorio de datos del programa. No inferir bytes válidos únicamente por el tamaño de un archivo preasignado.

Al finalizar: comprobar cobertura y tamaño cuando se conocen, verificar hash esperado cuando existe, sincronizar los datos necesarios y hacer el renombrado/reemplazo apropiado para Windows. No anunciar Completada hasta que el archivo final sea accesible. Un antivirus, un bloqueo o falta de permisos pueden retrasar el rename: preservar el temporal y explicar el problema.

### DL-06 · Archivo existente
Opciones: Sobrescribir, Renombrar automáticamente, Reanudar, Cancelar. Predeterminado seguro propuesto: renombrar. Reanudar solo está disponible con evidencia de que ese parcial corresponde al recurso; un archivo cualquiera con el mismo nombre no basta. Sobrescribir no destruye la versión anterior antes de tener una nueva descarga válida y la confirmación correspondiente.

### DL-07 · Integridad
SHA-256 y comparación con un valor esperado introducido por el usuario o de procedencia documentada. MD5 solo para compatibilidad, con etiqueta apropiada. ETag no es un hash garantizado del archivo. Calcular un hash sin referencia no equivale a verificar contra el original. En segmentación, no combinar hashes de fragmentos como si fueran el hash del archivo completo.

### DL-08 · Prioridades y colas
Prioridad Alta/Normal/Baja, colas nombradas, orden editable, límite de simultaneidad, calendario, reglas por horario y límites de velocidad. Evitar que la prioridad baja quede bloqueada indefinidamente. Apagar/suspender/hibernar al terminar una cola requiere opt-in, condición definida, cuenta atrás y cancelación. Errores o trabajos fuera de esa cola no deben causar apagados inesperados.

### DL-09 · Disco y red
Detectar espacio insuficiente, restricciones del sistema de archivos, permisos y rutas inválidas. Pruebas de archivos mayores de 4 GiB y cálculos con enteros de 64 bits. Validación TLS activada. Proxies del sistema, HTTP y SOCKS cuando el adaptador lo soporte, globales y por descarga. «VPN por descarga» no debe fingirse: una VPN del sistema y un proxy no son lo mismo; soporte de rutas/interfaces específicas solo mediante una implementación comprobada y opt-in.

### DL-10 · Sin depender del navegador
Una descarga aceptada continúa con el runtime aunque se cierre la ventana o el navegador, si dispone de URL, autorización y recursos todavía válidos. No prometer continuidad cuando el sitio exige renovar una sesión o un manifiesto que ya no está disponible.

## 5. Organización e historial — ORG-01 a ORG-06

### ORG-01 · Categorías y reglas
Categorías automáticas y personalizadas. Reglas por dominio, tipo/extensión, tamaño y horario para carpeta, cola, límite y prioridad. Orden y precedencia visibles; vista previa del resultado; no usar IA ni reglas misteriosas. Tamaño desconocido no se interpreta como cero. Las reglas nunca ejecutan scripts arbitrarios.

### ORG-02 · Acciones masivas
Pausar, reanudar, cancelar, reintentar, asignar categoría/cola y eliminar del historial con disponibilidad según estado. Separar Eliminar del historial de Eliminar archivo. Borrado de archivos exige confirmación; preferir Papelera cuando resulte aplicable. No añadir eliminación automática de duplicados.

### ORG-03 · Entrada avanzada
Pegar múltiples URLs, importar TXT/CSV, arrastrar enlaces, recoger enlaces de la página con vista previa y selección, portapapeles opcional y zona de arrastre flotante opcional. El menú contextual del navegador solo aparece sobre enlaces y video, no en cualquier lugar de una página. Descargar todos los enlaces puede vivir en el popup. Limitar el número de elementos por lote y evitar repeticiones accidentales.

### ORG-04 · Historial persistente
Conservar historial normal hasta borrado explícito, con retención configurable. Si falta el archivo, mostrar nombre tachado y estado **No encontrado en la ubicación original**. Solo afirmar **Movido** o **Eliminado** cuando haya evidencia suficiente. Disco desconectado, cambio de permisos o pérdida de un evento de archivos no demuestran eliminación.

Acciones: Localizar archivo, Volver a descargar, Quitar del historial. Identificación de archivos, observación de directorios y comprobaciones bajo demanda, sin recorrer todos los discos continuamente. Reasociar tras verificar tamaño/hash u otra evidencia suficiente.

### ORG-05 · Duplicados
Detectar URL idéntica con contexto relevante; deduplicar una misma entrega del navegador por ID de solicitud. Dos URLs diferentes pueden apuntar a contenidos distintos aunque nombre y tamaño coincidan. Confirmación fuerte mediante hash cuando esté disponible; no calcular hashes de todo el disco por defecto.

### ORG-06 · Estadísticas
Opt-in para recopilación local y sección visible; bytes, velocidad media y sitios frecuentes sobre datos permitidos. Excluir descargas privadas. Desactivarlas detiene recopilación y permite borrar los agregados existentes. No subir estadísticas por defecto.

## 6. Extensión — EXT-01 a EXT-08

### EXT-01 · Navegadores
Chrome, Edge y Firefox como primera matriz de pruebas. Brave, Opera y Vivaldi comparten gran parte del código Chromium, pero se comprueban individualmente en empaquetado y registro del host. No afirmar «cualquier navegador» ni equivalencia automática. Sin Safari.

### EXT-02 · Arquitectura
WebExtensions, Manifest V3 donde corresponda y adaptadores por navegador. Native Messaging conecta con un host local ligero; no abrir un servidor HTTP accesible públicamente ni depender de un WebSocket sin autenticación. App y extensión leen el mismo estado del runtime. Referencias [S03], [S04].

### EXT-03 · AutoPick
Modos de WIN-02, suspensión temporal, configuración global y por sitio, lista de ignorados, filtros de extensión/MIME y tamaño mínimo. Reglas claras para tamaños desconocidos. «Usar el navegador» debe conservar el comportamiento del navegador, sin reiniciar un ciclo de captura.

### EXT-04 · Entrega segura
No cancelar irrevocablemente la descarga original hasta recibir aceptación durable de IDG y tener una estrategia segura para ese caso. `downloads.onCreated` se recibe cuando una descarga ya ha comenzado, no antes de toda transferencia. Distinguir enlaces directos interceptables por clic de descargas observadas por la API. No prometer que Chrome nunca recibirá bytes. Referencia [S05].

Evitar duplicados y bucles; soportar aplicación ausente, host incompatible, timeouts y reinicio del worker. Para descargas no transferibles, conservar el navegador y mostrar una explicación. No convertir un POST, blob local o URL de un solo uso en un GET inventado.

### EXT-05 · Popup
Minimalista: conexión con IDG, AutoPick, descargas activas, progreso/velocidad reales, pausa/reanudación, abrir aplicación y ajustes del sitio actual. Badge con cantidad activa y estado de error. Reconectar mediante snapshot y eventos ordenados; no duplicar estado como una segunda fuente de verdad.

### EXT-06 · Ventana de Nueva descarga
La extensión inicia una ventana de IDG controlada por la aplicación, no un formulario sensible inyectado por cualquier web. Respeta limitaciones de foco de Windows. La ventana incluye todo DL-02. Al aceptar: cierre del diálogo, trabajo visible y feedback en extensión. Si no se puede abrir la ventana, avisar sin perder la descarga original.

### EXT-07 · Cookies y autenticación
Solo para descargas iniciadas o aceptadas por el usuario, con permisos y consentimiento. Transferir el mínimo necesario para el dominio/recurso, no exportar todo el perfil. Separar perfiles, contenedores y modo privado. La extracción DOM no accede a cookies HttpOnly; no inventar esta capacidad. No reenviar credenciales a otro dominio después de una redirección sin una política segura y explícita.

### EXT-08 · Permisos y publicación
Permisos mínimos, solicitados según funciones, con explicación. Captura global puede necesitar permisos amplios; hacer ese coste visible. Sin código remoto, rastreo publicitario, recolección de navegación no relacionada ni modificación de políticas de seguridad del navegador. Publicación en tiendas y acceso a las cuentas requieren una fase autorizada aparte.

## 7. Multimedia — MEDIA-01 a MEDIA-07

Las decisiones no contestadas al final de la entrevista se resuelven con estos valores propuestos, configurables y conservadores.

### MEDIA-01 · Detección
Detectar URLs directas de video/audio y manifiestos HLS/DASH accesibles mediante DOM y observación permitida de peticiones. Reproductores incrustados solo dentro de los permisos disponibles. El botón discreto se ancla al borde superior del reproductor sin cubrir controles; en pantalla completa se adapta cuando sea posible. Activado tras habilitar integración multimedia, configurable globalmente/por sitio.

El botón corresponde al reproductor actual. El popup puede mostrar todos los medios detectados de la pestaña. No convertir cualquier `blob:` en un archivo remoto ni prometer detección en todas las páginas.

### MEDIA-02 · Selección
Mostrar calidad, resolución, FPS, codec, pista/idioma y tamaño cuando se conocen. Tamaño calculado: prefijo aproximado y etiqueta Estimado; desconocido: Desconocido. Calidad predeterminada: la mejor disponible sin conversión, configurable. Presentar «1080p» al usuario normal aunque internamente implique pistas separadas.

### MEDIA-03 · Modos
Video + audio, Solo video, Solo audio. Conservar pistas originales y contenedor compatible por defecto. Extraer no es convertir. MP3/AAC/FLAC son conversiones opcionales según codecs disponibles. Convertir de un formato con pérdida a FLAC no recupera calidad ni debe anunciarse como mejora.

### MEDIA-04 · HLS/DASH
Soportar VOD sin cifrar en la entrega inicial: playlists HLS maestras/medios y MPD estáticos, pistas separadas y segmentos compatibles. Definir explícitamente el subconjunto implementado. Casos no soportados producen explicación, no archivos aparentemente correctos pero truncados. HLS/DASH no son sinónimos de DRM. Referencias [S11], [S12].

### MEDIA-05 · FFmpeg
Usar ffprobe y FFmpeg para inspeccionar, combinar y convertir. Priorizar stream copy cuando contenedor y pistas son compatibles; recodificar solo con consentimiento. Ejecución sin shell, argumentos estructurados, recursos limitados, cancelación y progreso reales. Conservar originales/parciales hasta verificar el resultado. Seleccionar explícitamente el formato de salida aunque el nombre temporal termine en `.idgpart`. Referencias [S13], [S14].

### MEDIA-06 · Metadatos
Al pulsar descargar, guardar título, miniatura y metadatos permitidos, con limpieza de nombres y tratamiento de entradas hostiles. Preferir base local o metadatos embebidos, no llenar la carpeta de archivos extra sin que el usuario lo elija. Omitir datos sensibles en modo privado.

### MEDIA-07 · Límites
No extracción de claves, evasión de DRM ni bypass de autenticación. Contenido protegido/no soportado: mensaje claro y sin reintentos infinitos. Streams en vivo, manifiestos cifrados y extractores específicos de plataformas quedan fuera de la primera entrega; se documentan como alcance futuro, no como funciones implementadas. La descarga autorizada puede requerir volver a abrir la página si caduca el acceso.

## 8. Privacidad, seguridad y extensiones futuras — SEC-01 a SEC-08

### SEC-01 · Local primero
Sin cuenta. Historial, preferencias, reglas y colas locales. No backend propio necesario. Sin llamadas de telemetría ni analítica por defecto. Las comprobaciones de actualización son una conexión externa explícita y desactivable, distinta de telemetría.

### SEC-02 · Secretos
Cookies, tokens, cabeceras de autenticación y URLs firmadas con secretos: memoria cuando sea suficiente y almacenamiento protegido por usuario mediante mecanismos de Windows cuando sea necesario para reanudación. No guardar secretos en SQLite plano, FTS, logs, exportaciones o snapshots de UI. El usuario puede borrar credenciales guardadas.

### SEC-03 · Modo privado
Sin historial ni estadísticas permanentes. Explicar la tensión entre recuperación tras un cierre y no conservar datos: por defecto una descarga privada no persiste material de sesión para recuperación tras reiniciar. Una recuperación privada persistente, si se ofrece, requiere consentimiento y metadatos protegidos con limpieza posterior. No prometer ausencia forense de todo rastro en Windows o SSD.

### SEC-04 · Diagnóstico
Logs locales redactados y rotados; exportación manual con vista previa. Un opt-in de telemetría solo funciona cuando hay un receptor real, documentado y aprobado. Sin receptor, no mostrar un interruptor que finja enviar informes. Exportar diagnóstico local cubre soporte sin servidor.

### SEC-05 · Archivo descargado
No autoejecución. Incorporar información de editor/firma cuando el formato y Windows permiten verificarla, con estados Valida/Inválida/No firmada/No comprobada/No aplicable según evidencia. «Firmado» no significa «seguro». Mantener la información de procedencia y las protecciones de Windows mediante API adecuadas, como Attachment Services cuando corresponda. Referencia [S15].

### SEC-06 · Superficies de entrada
Validar URLs, nombres, rutas, manifests, metadatos, mensajes nativos y tamaños. Prohibir escapes de directorio, nombres reservados, destinos inesperados y ejecución de shell. Un sitio no puede convertir IDG en un servicio para explorar la red local: las descargas automáticas a loopback/red privada requieren política y consentimiento; enlaces locales pegados explícitamente se tratan como un caso distinto.

### SEC-07 · Sincronización opcional
No eliminar esta idea, pero implementarla en una fase separada después de una base estable. Primera ampliación: configuración, categorías, reglas y opcionalmente historial redactado, cifrados antes de salir del equipo, con destino elegido por el usuario. Sin cookies, contraseñas, archivos parciales ni rutas de otra PC ejecutadas automáticamente. Mover descargas/archivos entre equipos es otra función, no se presume resuelta sincronizando un JSON.

### SEC-08 · BitTorrent y plugins
BitTorrent opcional, módulo aislado, biblioteca mantenida y licencia compatible; no reescribir el protocolo desde cero. Mostrar implicaciones de compartición/subida, selección de archivos, límites y comportamiento al completar. Pruebas solo con contenido propio o autorizado. Plugins de terceros son una posibilidad futura de arquitectura, no ejecución arbitraria habilitada por defecto.

## 9. Escenario de aceptación principal

Dado IDG instalado, extensión conectada y AutoPick en Siempre usar IDG, al hacer clic en un enlace GET directo válido a `Windows11.iso` de 6,2 GB se propone la descarga en una ventana de IDG. El usuario puede revisar tamaño, sitio, carpeta, nombre y capacidad de reanudar; ajustar o abrir Avanzado; pulsar Descargar ahora. El trabajo queda persistido, el diálogo se cierra, la aplicación muestra progreso real y la extensión confirma actividad. Al terminar, se valida el resultado y se transforma el temporal en el archivo final.

La descarga original del navegador solo se transfiere cuando es seguro hacerlo, sin duplicar el trabajo. Si IDG no está disponible, el navegador conserva una vía funcional. Si se corta la red o se reinicia IDG, solo se reanuda con validadores coherentes. Si el archivo cambia en origen, se informa y no se mezclan versiones.
