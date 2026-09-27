# Desarrollo de IDG

**Estado actual: fase 12, EN_CURSO, dependiente de fase 11.** Esta guía describe compilación y carga local de extensiones de desarrollo; no hay instalador, extensión publicada ni enlace de tienda para usuarios finales. AutoPick se conserva como requisito del producto, pero la captura automática está deshabilitada. El escritorio procesa el subconjunto HLS/DASH de [alcance multimedia](MEDIA_SUPPORT.md) mediante FFmpeg externo elegido por el usuario; la transferencia multimedia iniciada desde el navegador hasta archivo/hash aún no está verificada. Las sesiones autenticadas no son compatibles: no se transfieren cookies ni credenciales.

La organización de fase 06 se prueba mediante el [recorrido aislado](FASE06_PRUEBA_MANUAL.md). Comprobaciones nuevas: `node --test scripts/test-import-parser.mjs`, `node scripts/test-organization.mjs`, `node scripts/test-rules.mjs`, `node scripts/test-library.mjs`, `node scripts/test-import.mjs` y `node scripts/test-queue-limits.mjs`. Las últimas cinco abren Tauri real y requieren binarios recién compilados y ningún runtime previo. `scripts/Check.ps1 -Integration` las incorpora; `Check.ps1` sin ese parámetro no acredita la matriz gráfica o navegadores.

El monitor nativo está separado de su política testeable. El arnés configura `IDG_CLIPBOARD_FIXTURE` para leer un archivo propio de prueba, nunca el portapapeles personal. `IDG_POWER_ADAPTER=simulate` evita toda acción física. Ambas se fijan antes de iniciar procesos. Formato de las superficies nuevas aplicado con Prettier 3.9.8, comprobado en el registro oficial npm; no es una dependencia de ejecución ni cambia el stack.

## Colas, reglas y energía de prueba (fase 06)

Reglas y categorías (06-B): abre «Gestionar reglas» desde En cola o Configuración → Colas y programación. Añade categorías personalizadas en el apartado plegado. Una regla guardada se evalúa para descargas nuevas; el menor orden y después el identificador deciden cada campo. Campos cambiados explícitamente en Nueva descarga prevalecen. «Previsualizar reglas» no consulta el enlace. Tipo HTTP y tamaño desconocidos no coinciden con condiciones de tipo/tamaño. El horario de reglas se expresa en minutos UTC desde medianoche; no usa implícitamente la zona del equipo.

Para un trabajo anterior, despliega «Previsualizar y aplicar a un trabajo existente», carga trabajos, previsualiza y acepta. Las carpetas existentes se omiten con explicación; no hay movimientos de parciales/archivos. Una carpeta de regla debe existir y sus permisos efectivos se comprueban al crear el trabajo; un error conserva el formulario y no descarga. Prueba reproducible: `node scripts/test-rules.mjs`, con binarios recompilados y sin runtime previo.

Con el runtime anterior detenido, compila mediante `pnpm desktop:build`. Para probar energía sin actuar sobre Windows, establece `$env:IDG_POWER_ADAPTER = 'simulate'` **antes de iniciar el runtime** y abre `./target/debug/idg-desktop.exe`. El aviso debe indicar «Simulación»; no actives energía si falta esa indicación en una prueba. Esta variable es del proceso de desarrollo, no una preferencia global ni un ajuste recibido por IPC.

En «En cola → Gestionar colas» crea una cola, ajusta simultáneas y guarda. «Nueva descarga → Avanzado → Cola de descarga» elige su cola antes de añadir. Detener nuevos inicios no pausa una transferencia activa; «Pausar activas» sí. Mover u ordenar requiere trabajos inactivos. Eliminar una cola exige reasignar sus trabajos y conserva los archivos.

El horario acepta una fecha ISO con zona explícita, como `2030-01-01T15:00:00-04:00`; el ejemplo no es un horario recomendado. Elige tu instante futuro real. La aplicación muestra su equivalencia en la hora del equipo. Requiere runtime activo y Windows despierto; se aplica una sola vez, recupera hasta 15 minutos de retraso y vence después.

Guardar «Al terminar» no activa energía. Su botón de confirmación la activa una vez; todos los trabajos deben estar completados/publicados. En modo simulado, completa trabajos de fixture, observa la cuenta atrás y pulsa «Cancelar acción de energía». La prueba automatizada reproducible es `node scripts/test-organization.mjs`, después de compilar escritorio/runtime/probe; utiliza datos propios y rechaza un runtime previo. Nunca invoca energía real.

La fase 05 conecta la ventana con descargas HTTP/HTTPS, preferencias y ciclo de vida reales. La [instalación para usuarios](INSTALACION.md) sigue pendiente de una publicación; cargar esta extensión local es una prueba de desarrollo.

## Historial, privacidad y comprobaciones de Windows (fase 12)

En un checkout de desarrollo, compila el runtime y escritorio de la misma copia y ejecuta el arnés aislado:

```powershell
$env:PATH = "$env:USERPROFILE\.cargo\bin;$env:PATH"
cargo build --locked -p idg-runtime -p idg-platform-windows --bins
npx --yes pnpm@12.4.2 desktop:build
npx --yes pnpm@12.4.2 test:file-reconciliation
```

El arnés abre Tauri/WebView2 y su runtime, descarga un fixture HTTP local, mueve el archivo en una carpeta temporal, comprueba el estado “No encontrado”, reasocia la ruta por la operación tipada `LocateFile`, reinicia el runtime y compara el SHA-256. **No** automatiza el selector nativo: el arnés pasa una ruta propia directamente por IPC tipado para comprobar identidad sin usar una ventana de archivo. En una comprobación manual aparte, abre un trabajo completado con el archivo movido, pulsa «Localizar archivo», elige el archivo correcto y confirma que el estado vuelve a disponible; un archivo distinto debe rechazarse sin cambiar la asociación. La interacción del selector nativo queda pendiente hasta tener una herramienta de GUI permitida.

En Ajustes → Privacidad, «Eliminar metadatos terminados» pide confirmación y solo quita registros completados/cancelados y recibos asociados. No borra descargas; preserva trabajos activos, pausados y fallidos recuperables. El modo privado mantiene sus metadatos en la sesión actual, no los recupera al reiniciar el runtime y no borra el archivo guardado.

«Diagnóstico local» muestra la vista previa antes de abrir el diálogo del sistema. El informe contiene versión, plataforma, arquitectura y estado de conexión; no exporta trabajos, nombres, rutas, URLs, estadísticas, credenciales o reglas. El guardado utiliza creación exclusiva y rechaza sobrescribir. La interfaz no envía telemetría. IDG no escribe logs persistentes, de modo que la rotación no aplica mientras no exista un escritor de logs. El diálogo nativo de guardado, cancelación y archivo existente deben verificarse manualmente cuando la herramienta de GUI esté disponible.

Pruebas unitarias focalizadas sin volver a ejecutar el recorrido de energía:

```powershell
cargo test --locked -p idg-runtime history_metadata_cleanup_removes_only_terminal_records_and_keeps_files
cargo test --locked -p idg-storage explicit_history_cleanup_removes_job_and_receipts_without_touching_other_jobs
cargo test --locked -p idg-desktop diagnostics_tests
npx --yes pnpm@12.4.2 exec vitest run apps/desktop/src/Library.test.tsx apps/desktop/src/Settings.test.tsx --config apps/desktop/vitest.config.ts
```

No ejecutes `scripts/test-library.mjs` para esta verificación: ese arnés también recorre la energía simulada, que permanece **BLOQUEADA/PENDIENTE**. Los comandos específicos y sus resultados actuales están en [IMPLEMENTATION_STATUS](IMPLEMENTATION_STATUS.md).

## Entorno y versiones comprobados

El snapshot del entorno de desarrollo del 2026-09-19 registró Windows 11 Pro 10.0.26200 x64, Rust/Cargo 1.98.1 MSVC, Build Tools 2022 17.14.41 con C++ y Windows SDK 10.0.19041.0/10.0.26100.0, WebView2 153.0.4234.32, Node 24.14.0 y pnpm 12.4.2. Versiones observadas de navegador en esta tarea, 2026-09-26: Firefox 156.0, Chrome estable 154.0.8037.58 y Edge 153.0.4234.48. Ver esas versiones instaladas no acredita una integración probada. No se ha comprobado Windows 10 ni otros navegadores.

Rust y Build Tools se instalaron con consentimiento; no se cambió PATH global ni se desactivaron protecciones. Rust está en `%USERPROFILE%\.cargo\bin`. El wrapper pnpm presente en PATH devolvía 11.19.0; los comandos usan explícitamente `npx --yes pnpm@12.4.2`.

Versiones exactas y transitivas en Cargo.lock/pnpm-lock.yaml. Principales: Tauri 2.11.5 (CLI 2.11.4/API JS 2.11.1), React 19.3.0, TypeScript 7.0.2, Vite 8.3.0, Tokio 1.53.1 y ts-rs 12.0.1. La combinación fue resuelta, compilada y ejecutada; no implica compatibilidad universal. Las fuentes oficiales están en [ADR-009](decisions/009-esqueleto-verificado.md).

## Preparar y compilar

Instala previamente [Rust MSVC](https://rustup.rs/), [C++/SDK y WebView2 requeridos por Tauri](https://v2.tauri.app/start/prerequisites/) y Node 24. No omitas comprobaciones de firma ni cambies la política de seguridad de PowerShell para ejecutar scripts.

Desde la raíz en PowerShell 7:

```powershell
$env:PATH = "$env:USERPROFILE\.cargo\bin;$env:PATH"
rustup show
node --version
npx --yes pnpm@12.4.2 --version
npx --yes pnpm@12.4.2 install --frozen-lockfile
cargo build --locked -p idg-runtime -p idg-native-host -p idg-platform-windows
npx --yes pnpm@12.4.2 desktop:build
npx --yes pnpm@12.4.2 extension:build
```

`desktop:build` genera un ejecutable debug con frontend integrado, sin instalador. No basta compilar el HTML ni abrirlo en el navegador. Mantén los tres ejecutables junto a `idg-probe.exe` en `target/debug`: la autenticación del pipe verifica sus rutas. `0.1.0` es una versión interna de paquetes, no una release publicada.

## Abrir y usar la aplicación

Después de compilar, basta abrir desde la raíz:

```powershell
.\target\debug\idg-desktop.exe
```

La apertura explícita inicia el runtime adyacente validado o conecta con el existente. Asistente y preferencias se conservan. X oculta por defecto sin detener descargas; Salir completamente advierte y guarda checkpoints. Si detienes el motor con la ventana abierta, Iniciar motor permite arrancarlo deliberadamente. La reconexión del host no lo relanza.

Sigue el [recorrido con archivo local y checklist manual](APP_DEVELOPMENT.md). Para recarga del frontend usa `npx --yes pnpm@12.4.2 dev`; `build` solo construye frontend. `idg-probe.exe ping` consulta y `idg-probe.exe shutdown` solicita salida.

## Extensiones de desarrollo y host

Después de compilar host y extensión:

```powershell
.\scripts\Register-NativeHost.ps1
```

El build y los scripts obtienen el host de desarrollo de `scripts/native-host-name.mjs`: su sufijo de 16 caracteres deriva de la ruta canónica de este checkout, sin publicar la ruta. El nombre generado también queda en el archivo local ignorado `.local/native-host/host-name.txt`, para que el escritorio consulte el mismo registro. Así copias y worktrees no comparten el host habitual `io.github.sredgarr.idg.dev`. El registro se limita a HKCU y a los navegadores indicados; los manifiestos quedan en `.local/native-host`, con ruta absoluta y allowlist exacta. El script rechaza un registro del mismo nombre perteneciente a otra ubicación y el desregistro solo retira claves que apuntan a sus manifiestos locales sin valores o subclaves adicionales.

Chromium: abre `chrome://extensions` (Edge: `edge://extensions`), activa el modo de desarrollo y carga **descomprimida** `apps/extension/build/chromium`. Abre la extensión IDG desde el menú de extensiones. El ID de desarrollo estable es `keopaccdnmianljlfkpinbkfppcpfdlk`.

Firefox: compila el build separado, abre `about:debugging#/runtime/this-firefox`, elige **Cargar complemento temporal** y selecciona `apps/extension/build/firefox/manifest.json`. Abre IDG desde el menú de extensiones. Su ID estable de desarrollo es `idg-dev@sredgarr.github.io`; la carga temporal se retira al cerrar el perfil. No se deshabilita la firma de extensiones. El manifiesto usa `background.scripts` para Firefox MV3 y niega ventanas privadas; Chromium usa su service worker MV3, conforme a la [documentación oficial de Mozilla sobre background scripts](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/background). Ambos IDs son de desarrollo, no de tienda.

Los dos popups muestran el estado real de Native Messaging, permiten reconectar y muestran trabajos del motor; Pausar/Reanudar envía comandos reales. Chromium permite previsualizar enlaces de la página tras una acción explícita. Firefox permite escribir una URL HTTP(S) directa o elegir un enlace desde su menú contextual. En ambos casos la solicitud requiere confirmación en IDG y excluye parámetros, fragmentos y sesión autenticada. Los manifiestos normales no solicitan el permiso `downloads` ni habilitan la captura automática. AutoPick sigue siendo un requisito del producto y la captura de descargas ya iniciadas está deshabilitada; esa limitación de `DownloadItem` no prueba que cualquier vía futura sea imposible. Se deben conservar las descargas del navegador mientras no exista una vía segura.

La transferencia directa de Chromium se comprobó con fixture local en fase 07 y está atribuida a ese commit; no se repitió aquí. En fase 08 se compiló Firefox y pasó la prueba de manifiesto. Los scripts ahora derivan un nombre de host de desarrollo por ruta de checkout. El ciclo HKCU Firefox de esta copia se registró y retiró: la entrada habitual del checkout principal conservó su valor exacto y la allowlist Firefox siguió conteniendo solo el ID estable. La prueba de transferencia se intentó una vez con Tauri/WebView2 del mismo worktree, pero el arnés agotó 15 s esperando el estado `Conectado` antes de abrir Firefox; no se creó un archivo y no hay hash que atribuir a Firefox. No se repitió el recorrido.

Los permisos y gestos del manifiesto normal (concesión o rechazo, abrir desde el icono, `activeTab` y menú contextual) siguen pendientes. Las pruebas con manifiesto de integración preconcedido no los acreditan. Las sesiones autenticadas no están soportadas: no se copian cookies ni credenciales; cuando una solicitud no pueda reproducirse con seguridad, se conserva la alternativa del navegador.

Los dos builds declaran `incognito: "not_allowed"` para evitar que esta extensión de desarrollo acceda a ventanas privadas; se verificó en el manifiesto, no en una sesión privada real. Firefox Containers todavía no tiene adaptación por identidad/contexto. No se habilitó acceso privado ni se mezclan datos de sesión entre contextos.

## Detección multimedia (fase 09, en desarrollo)

Reconstruye las extensiones con `npx --yes pnpm@12.4.2 extension:build` y cárgalas como complemento **de desarrollo** según los pasos anteriores. La detección empieza por una acción explícita en el popup: activa el control general o el del sitio actual y pulsa **Analizar pestaña**. Si el medio tiene un archivo HTTP(S) directo, el popup lista lo que la página declara y permite seleccionar el original para enviarlo a la aplicación; IDG todavía pide revisar y aceptar los datos antes de crear el trabajo. El botón pequeño sobre el reproductor se muestra solo cuando esa detección está activa. No se guardan candidatos en el historial antes de aceptar.

La extensión no lee cuerpos de red, cookies, credenciales ni parámetros de URLs firmadas. Chrome puede aportar encabezados limitados del origen principal mientras `activeTab` está habilitado; otras respuestas permanecen desconocidas. Firefox usa la URL y los metadatos declarados por el DOM y deja desconocidos MIME/tamaño que no puede observar con los permisos actuales. Los permisos temporales `activeTab` de Chrome y Firefox no ofrecen el mismo acceso: Firefox documenta el acceso a eventos `webRequest` mediante permisos de host, que IDG no solicita globalmente ([Chrome `activeTab`](https://developer.chrome.com/docs/extensions/develop/concepts/activeTab), [Chrome `webRequest`](https://developer.chrome.com/docs/extensions/reference/api/webRequest), [Mozilla permisos](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/permissions)). El observador de respuesta solo solicita encabezados y no cuerpos ([Mozilla `onHeadersReceived`](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/webRequest/onHeadersReceived)).

HLS y DASH se identifican, pero no se resuelven ni descargan en esta fase. Un `blob:` de MediaSource tampoco se trata como archivo transferible. Solo se conservan datos permitidos y validados; resolución/FPS/pistas/tamaño que no fueron medidos se muestran como desconocidos. Solo el archivo original directo está disponible: seleccionar solo video/audio, elegir variantes/calidades, separar pistas y convertir quedan para fases posteriores.

Pruebas automatizadas de la lógica multimedia: `npx --yes pnpm@12.4.2 test:unit`; el check Windows completo es `.\scripts\Check.ps1`, después de `$env:PATH = "$env:USERPROFILE\.cargo\bin;$env:PATH"` en la sesión. Ese check usa un WAV generado por fixture, lo descarga por el runtime real y compara su SHA-256 con la referencia del servidor. La suite comprueba modelo, URLs hostiles, candidatos DOM, opciones por sitio, deduplicación, límites de tamaño de 64 bits, rechazo de blobs/manifiestos transferibles, UI y persistencia del metadato solo tras aceptar.

**Integración Firefox pendiente:** en el último intento se registró y retiró reversiblemente el host de este checkout. El Firefox aislado conectó con el runtime y abrió el diálogo real de Nueva descarga; tras **Aceptar en IDG**, el diálogo permaneció visible y el arnés venció a los 15 s. No se obtuvo archivo ni hash. No se repitió. El ensayo fue del puente de enlace directo de Firefox; tampoco acredita la selección multimedia desde el popup ni una descarga multimedia real. Los permisos/gestos del manifiesto normal siguen pendientes.

Retirada reversible:

```powershell
.\scripts\Unregister-NativeHost.ps1
```

Retira únicamente los registros que todavía apuntan a esta copia; conserva manifiestos y archivos. Quita la extensión local desde el navegador. Puedes volver a registrarla. Los scripts admiten `-Browser Chromium` o `-Browser Firefox`. Para repetir solo la prueba de transferencia Firefox:

```powershell
.\scripts\Register-NativeHost.ps1 -Browser Firefox
node scripts/test-firefox-capture.mjs
.\scripts\Unregister-NativeHost.ps1 -Browser Firefox
```

El arnés requiere que IDG/Tauri alcance `Conectado`; si no lo hace, no acredita el handshake ni el archivo/hash. La prueba de registro/desregistro Firefox acotada pasó para este worktree. No retires registros de otra instalación.

## Comprobaciones reproducibles

Los comandos de unitarias rápidas, modo watch y cobertura, su inventario por módulo y las limitaciones de cada nivel están en [TESTING](TESTING.md). Las nuevas pruebas no reemplazan los recorridos de proceso, Tauri o navegador descritos aquí.

Cierra los runtimes de IDG que hayas iniciado antes de ejecutar las pruebas: estas rechazan una instancia previa y administran solo la suya.

```powershell
.\scripts\Check.ps1
```

Ejecuta formato Rust, Clippy sin warnings, las pruebas Rust del workspace, tres tests del modelo de presentación, regeneración/consistencia de tipos, comprobación TS, builds y pruebas de procesos/seguridad. Comandos individuales: `cargo fmt --all -- --check`, `cargo clippy --locked --workspace --all-targets -- -D warnings`, `cargo test --locked --workspace`, `cargo run --locked -p idg-protocol --bin export-types`, `npx --yes pnpm@12.4.2 check`, `node scripts/test-runtime.mjs`.

Para integración real (Firefox instalado y el registro Native Messaging debe apuntar al host de este checkout):

```powershell
$env:PLAYWRIGHT_BROWSERS_PATH = "$PWD/tools/browsers"
npx --yes pnpm@12.4.2 exec playwright install chromium
.\scripts\Register-NativeHost.ps1
.\scripts\Check.ps1 -Integration
# Retira el registro al terminar solo si lo creaste exclusivamente para esta prueba.
```

También puedes ejecutar `node scripts/test-desktop.mjs`, `node scripts/test-chromium.mjs`, `node scripts/test-firefox.mjs` y `node scripts/test-firefox-capture.mjs` individualmente. `node scripts/test-firefox-manifest.mjs` comprueba estáticamente el manifiesto Firefox. Firefox permite seleccionar otra ruta de binario mediante `IDG_FIREFOX_BINARY`; Selenium Manager obtiene geckodriver oficial. Los perfiles son temporales/aislados; no se usan tus sesiones. Los arneses de Firefox fallan rápido si el host registrado y el runtime no son hermanos del mismo checkout; no cambian el registro. Las capturas reales quedan en `artifacts/`; solo una selección revisada y saneada se versiona en `docs/images`.

La prueba Tauri abre una ventana real con WebView2 y depuración local mediante una variable limitada al proceso de prueba; no añade un servidor TCP al IPC del producto. La prueba Firefox habilita el contexto de automatización del navegador mediante `--allow-system-access` solo en ese proceso aislado, para abrir una página propia del complemento. No cambia preferencias globales, firma o protecciones del perfil personal. En fase 08 el primer intento de `test-firefox-capture.mjs` se detuvo antes de Firefox al detectar que el host apuntaba a otra copia. En fase 09, se registró temporalmente solo el host único de Firefox de este checkout; el navegador conectó y abrió el diálogo Tauri, pero este siguió visible tras aceptar y el arnés venció a los 15 s. La clave propia se retiró; no hubo archivo/hash ni transferencia completa aprobada. Esto no prueba la selección multimedia. No certifica los gestos manuales del menú de la barra ni los permisos normales.

CI: `.github/workflows/check.yml` conserva portable (core/protocolo/migraciones en Linux) y windows (compilación/pruebas de procesos). Añade ui (galería Playwright headless, modelo de presentación y aislamiento del bundle). CI no ejecuta Tauri/WebView2 ni Native Messaging en navegadores; esos requieren las pruebas locales con -Integration. Consulta el resultado remoto antes de declararla aprobada. No publica instaladores ni releases.

## Límites y diagnóstico

El motor HTTP/HTTPS secuencial y segmentado se controla desde la aplicación real, además de la utilidad de desarrollo. Trabajos, preferencias y organización se protegen con DPAPI dentro de SQLite; no es cifrado integral de la DB. Hay bandeja y cierre coordinado; autoinicio sigue pendiente. AutoPick sigue siendo un requisito, pero la captura automática está deshabilitada. La lista y organización de producción reciben datos del runtime. Los estados de conexión no se persisten. El pipe admite 16 clientes simultáneos, frames de 256 KiB y plazos de cinco segundos. La suscripción usa una conexión dedicada y snapshots completos, por lo que un salto de secuencia no exige reconstruir deltas. Un proceso malicioso con control del mismo usuario y capacidad de reemplazar binarios no queda aislado por este mecanismo.

Ante Desconectado: comprueba el runtime con `idg-probe.exe ping`, que los binarios estén juntos, registro/ID correctos y que el complemento se haya reconstruido. No pegues credenciales ni rutas privadas en issues. Estado, evidencias y pendientes en [IMPLEMENTATION_STATUS](IMPLEMENTATION_STATUS.md).


## Galería de interfaz (fase 02)

Después del setup anterior, desde la raíz:

```powershell
npx --yes pnpm@12.4.2 gallery
```

Abre http://127.0.0.1:1421/gallery.html. Este comando se comprobó con Vite; la prueba automatizada usa el mismo entry en un puerto libre. El banner identifica muestras de 0/1/3/20 archivos. No conecta al runtime ni descarga nada. El servidor queda limitado a loopback; Ctrl+C lo detiene. Abrir index.html muestra la interfaz normal, que necesita Tauri para conectar.

Prueba filtros y Limpiar, selección, menú de fila, expansión automática/manual, Nueva descarga y las superficies del banner. Actualizar muestra cambia una medida solo al pulsarlo; no hay temporizador de progreso. Conflicto, asistente, colas, reglas, multimedia, recuperación y ventanas auxiliares son componentes de muestra. Mini ventana y zona de arrastre necesitan activación local; no crean ventanas del sistema ni vigilan el portapapeles. Los diálogos explican qué acciones necesitan backend y no muestran éxitos falsos.

En la galería, Sistema es el tema inicial y tema/vista se conservan localmente por origen; no guardan URLs, credenciales ni trabajos. En producción, preferencias, lista y búsqueda sí están conectadas al runtime. Una elección manual de expansión prevalece durante la sesión, incluso al filtrar y volver. 1–3 filas se expanden automáticamente si cabe el presupuesto de espacio; 4+ empiezan compactas. Los detalles técnicos se abren aparte. Lista y editor de cola renderizan páginas de 50; el buscador de producción consulta todo el historial en el backend.

Para repetir las pruebas visuales sin runtime:

```powershell
$env:PLAYWRIGHT_BROWSERS_PATH = "$PWD/tools/browsers"
npx --yes pnpm@12.4.2 exec playwright install chromium
npx --yes pnpm@12.4.2 build
npx --yes pnpm@12.4.2 test:ui
```

Tres tests del modelo + Playwright: filtros combinados, selección, menús, validación, Tab/Escape/retorno de foco, estabilidad con scroll no nulo al actualizar muestras, override al redimensionar, tema Sistema, movimiento reducido y preferencia de vista tras recarga. Prueba también conflicto, orden local de cola, previsualización de regla y modal multimedia anidado. Verifica que dist no contenga gallery.html ni los marcadores/nombres de fixtures.

Capturas automáticas en artifacts/ui-02: matriz claro/oscuro × normal 1180×900/pequeña 720×640 × 0/1/3/20, nueve superficies y DPR 1.5/2 emulado (27 capturas). La política de tres filas expandidas se prueba con altura 1100; con menos espacio permanecen compactas. DPR emulado no certifica el escalado de Windows. -Integration añade aplicación Tauri real y extensiones reales; el popup se abre como página de extensión, no por su menú nativo.

Selección pública de capturas: [aplicación clara](images/fase02-app-light.png), [oscura](images/fase02-app-dark.png), [galería clara](images/fase02-gallery-light.png), [galería oscura pequeña](images/fase02-gallery-dark-small.png), [Nueva descarga](images/fase02-new-download.png), [Configuración](images/fase02-settings.png), [asistente](images/fase02-wizard.png), [conflicto](images/fase02-conflict.png), [multimedia](images/fase02-media.png), [popup claro](images/fase02-popup-light.png), [popup oscuro](images/fase02-popup-dark.png). Las capturas de galería no representan descargas reales.

El propietario confirmó temas claro/oscuro, expansión, Nueva descarga y Configuración; el ajuste tipográfico posterior suma 1 px mediante tokens. Pendiente de revisión humana adicional: lector de pantalla y DPI real 150/200. Se mantienen Windows 10, otros navegadores y el recorrido del menú nativo de extensión de la matriz anterior. No son evidencia de fallos ni de aprobación.

## Motor secuencial (fase 03)

Sigue el [recorrido HTTP de desarrollo](HTTP_DEVELOPMENT.md). `node scripts/test-http-runtime.mjs` descarga bytes reales, observa eventos por IPC, pausa/cancela y mata/reinicia únicamente su runtime de prueba; verifica el sufijo solicitado y SHA-256 final. Check.ps1 lo ejecuta también en CI Windows. La prueba TLS, hash incorrecto y bloqueo real de destino está en `crates/idg-core/tests/http.rs`; el fallo de disco lleno se inyecta en la escritura, sin llenar el disco del usuario. SQLite/DPAPI y migraciones tienen pruebas propias.

El host de Native Messaging no tiene permiso de iniciar ni consultar trabajos. El handshake del probe anuncia la consulta de capacidades; la del host conserva comandos anteriores; desde fase 05 el escritorio validado recibe los comandos tipados de aplicación. Los snapshots de trabajos no contienen URL ni directorio. Datos persistentes por defecto en el directorio de aplicación del usuario, subcarpeta `IDG/development`; las pruebas usan `IDG_DATA_DIR` local al proceso. No compartas la DB como diagnóstico público.

## Segmentación y recursos (fase 04)

[Guía de comandos, límites y benchmark](SEGMENTATION_DEVELOPMENT.md). Check.ps1 añade `node scripts/test-segments.mjs`; las pruebas anteriores permanecen. No se requieren paquetes nuevos ni cambios de sistema. Migración 002 conserva los documentos de fase 03 y añade ajustes protegidos; no borres la base para actualizar. [ADR-012](decisions/012-segmentacion-recursos.md) precisa elegibilidad, rangos durables, políticas de recursos/reintento y límites de la evidencia.

## Aplicación conectada (fase 05)

[Guía completa](APP_DEVELOPMENT.md) y [ADR-013](decisions/013-aplicacion-y-ciclo-de-vida.md). `test-desktop.mjs` ejecuta descarga desde Tauri, ciclo de vida, recuperación, preferencias, mini/drop y fallo de arranque. `Check.ps1 -Integration` conserva las regresiones anteriores y agrega estas pruebas; CI no ejecuta esa matriz gráfica ni navegadores. El selector nativo, clic físico de X, menú de bandeja y entrega visual del toast tienen checklist manual. El test usa mensaje nativo SC_CLOSE, no una revisión humana.

Migración 003 conserva trabajos y añade preferencias protegidas. No borres la base para actualizar. Inventario de dependencias regenerado en DEPENDENCIES.json; no hay instalador ni release. La galería anterior sigue aislada; capturas reales de 05 en screenshots/fase05.

## Procesamiento HLS/DASH (fase 10, desarrollo)

Para probar desde el escritorio, compila el runtime **después** del build de Tauri: son ejecutables distintos. En PowerShell desde la raíz del checkout:

```powershell
$env:PATH = "$env:USERPROFILE\.cargo\bin;$env:PATH"
cargo build --locked -p idg-runtime
pnpm desktop:build
```

Inicia `target/debug/idg-desktop.exe`, abre Ajustes → Video y audio y selecciona `ffmpeg.exe` de un build que hayas revisado. `ffprobe.exe` debe estar junto a él. En Nueva descarga pega el URL explícito de un manifiesto HTTP(S) permitido, pulsa **Analizar HLS/DASH**, elige variante/pista/salida y confirma el trabajo. Esto prueba entrada directa en el escritorio, no el flujo navegador→extensión→archivo.

Reproducción automatizada aislada en Windows (fixtures HTTP locales y carpeta temporal, sin cuentas ni medios externos):

```powershell
$env:IDG_MEDIA_FFMPEG = (Resolve-Path 'RUTA_LOCAL\ffmpeg.exe').Path
pnpm test:media:e2e
```

La ruta es una elección local y no se guarda en el repositorio. La prueba requiere `ffprobe.exe` hermano y binarios debug recién compilados (`cargo build --locked -p idg-runtime`, `pnpm desktop:build`); configura `IDG_MEDIA_FFMPEG` antes de correrla. El build FFmpeg 9.0.2 usado para la evidencia quedó en `.local`, está excluido de Git y no forma parte del producto.

Para revisar el subconjunto exacto y lo que se rechaza, consulta [MEDIA_SUPPORT.md](MEDIA_SUPPORT.md). Para cambios del parser/transferencia ejecuta además `cargo test -p idg-media --locked --offline`, `cargo test --workspace --locked --offline` y Clippy; `scripts/Check.ps1` no incluye `test:media:e2e`. La evidencia de esta fase distingue explícitamente Windows/Tauri real, suites automatizadas y navegadores pendientes en [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md).
