# Desarrollo de IDG

La fase 01 contiene un esqueleto ejecutable de conexión. No descarga archivos. La [instalación para usuarios](INSTALACION.md) sigue pendiente de una publicación; cargar esta extensión local es una prueba de desarrollo.

## Entorno y versiones comprobados

El 2026-09-19: Windows 11 Pro 10.0.26200 x64, AMD Ryzen 7 5700X, 31,9 GiB RAM, Rust/Cargo 1.98.1 MSVC, Build Tools 2022 17.14.41 con C++ y Windows SDK 10.0.19041.0/10.0.26100.0, WebView2 153.0.4234.32, Node 24.14.0, npm 11.9.0 y pnpm 12.4.2. Firefox 156.0 instalado por el propietario; Chrome for Testing 153.0.8010.12 en perfil separado. No se ha comprobado Windows 10 ni otros navegadores.

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

## Abrir y usar el esqueleto

En una terminal desde la raíz:

```powershell
.\target\debug\idg-runtime.exe
```

En otra terminal:

```powershell
.\target\debug\idg-desktop.exe
```

La ventana muestra **Conectado** tras un handshake real. **Comprobar conexión** envía ping; **Reconectar** sustituye la conexión; **Detener motor** cierra el runtime y desconecta todos los clientes. Cerrar la ventana conserva el runtime. Inícialo otra vez manualmente y pulsa Reconectar. Sin runtime muestra Desconectado; ningún cliente lo relanza automáticamente.

Para desarrollo con recarga: inicia el runtime por separado y ejecuta `npx --yes pnpm@12.4.2 dev`. `npx --yes pnpm@12.4.2 build` solo construye frontend. El ejecutable `idg-probe.exe ping` comprueba estado y `idg-probe.exe shutdown` solicita salida explícita.

## Extensiones de desarrollo y host

Después de compilar host y extensión:

```powershell
.\scripts\Register-NativeHost.ps1
```

Registra solo `io.github.sredgarr.idg.dev` bajo HKCU, para Chrome/Chromium/Edge y Firefox. Los manifiestos quedan en `.local/native-host`, con ruta absoluta y allowlist exacta. El script rechaza un registro del mismo nombre perteneciente a otra ubicación; no reemplaza otras instalaciones. Ejecuta este registro otra vez si mueves el repositorio, retirando primero el registro desde su ubicación original.

Chromium: abre `chrome://extensions` (Edge: `edge://extensions`), activa el modo de desarrollo y carga **descomprimida** `apps/extension/build/chromium`. Abre la extensión IDG desde el menú de extensiones. El ID de desarrollo estable es `keopaccdnmianljlfkpinbkfppcpfdlk`.

Firefox: abre `about:debugging#/runtime/this-firefox`, elige **Cargar complemento temporal** y selecciona `apps/extension/build/firefox/manifest.json`. Abre IDG desde el menú de extensiones. Su ID es `idg-dev@sredgarr.github.io`; se retira al cerrar el perfil. No se deshabilita la firma de extensiones. Ambos IDs son de desarrollo, no de tienda.

El popup muestra Conectado solo tras handshake/suscripción. Reconectar repite ese intercambio. Cierra y vuelve a abrir el popup: recibe un snapshot nuevo del mismo motor. No captura enlaces, páginas ni descargas; su único permiso es `nativeMessaging`.

Retirada reversible:

```powershell
.\scripts\Unregister-NativeHost.ps1
```

Retira únicamente los registros que todavía apuntan a esta copia; conserva manifiestos y archivos. Quita la extensión local desde el navegador. Puedes volver a registrarla. Los scripts admiten `-Browser Chromium` o `-Browser Firefox`. La prueba de registro/desregistro y host ausente pasó aquí. Al entregar se retiran los registros usados por las pruebas: regístralos para tu prueba manual.

## Comprobaciones reproducibles

Cierra los runtimes de IDG que hayas iniciado antes de ejecutar las pruebas: estas rechazan una instancia previa y administran solo la suya.

```powershell
.\scripts\Check.ps1
```

Ejecuta formato Rust, Clippy sin warnings, las pruebas Rust del workspace, tres tests del modelo de presentación, regeneración/consistencia de tipos, comprobación TS, builds y pruebas de procesos/seguridad. Comandos individuales: `cargo fmt --all -- --check`, `cargo clippy --locked --workspace --all-targets -- -D warnings`, `cargo test --locked --workspace`, `cargo run --locked -p idg-protocol --bin export-types`, `npx --yes pnpm@12.4.2 check`, `node scripts/test-runtime.mjs`.

Para integración real (Firefox instalado y host registrado):

```powershell
$env:PLAYWRIGHT_BROWSERS_PATH = "$PWD/tools/browsers"
npx --yes pnpm@12.4.2 exec playwright install chromium
.\scripts\Register-NativeHost.ps1
.\scripts\Check.ps1 -Integration
.\scripts\Unregister-NativeHost.ps1
```

También puedes ejecutar `node scripts/test-desktop.mjs`, `node scripts/test-chromium.mjs` y `node scripts/test-firefox.mjs` individualmente. Firefox permite una ruta alternativa en `IDG_FIREFOX_BINARY`. Selenium Manager obtiene geckodriver oficial. Los perfiles son temporales/aislados; no se usan tus sesiones. Las capturas reales quedan en `artifacts/`; solo una selección revisada y saneada se versiona en `docs/images`.

La prueba Tauri abre una ventana real con WebView2 y depuración local mediante una variable limitada al proceso de prueba; no añade un servidor TCP al IPC del producto. La prueba Firefox habilita el contexto de automatización del navegador mediante `--allow-system-access` solo en ese proceso aislado, para abrir la página propia del complemento. No cambia preferencias globales, firma o protecciones del perfil personal. Las pruebas de navegador son headless y ejercitan la página del popup con Native Messaging real; no certifican el gesto manual del menú de la barra.

CI: `.github/workflows/check.yml` conserva portable (core/protocolo/migraciones en Linux) y windows (compilación/pruebas de procesos). Añade ui (galería Playwright headless, modelo de presentación y aislamiento del bundle). CI no ejecuta Tauri/WebView2 ni Native Messaging en navegadores; esos requieren las pruebas locales con -Integration. Consulta el resultado remoto antes de declararla aprobada. No publica instaladores ni releases.

## Límites y diagnóstico

Hay motor HTTP/HTTPS secuencial y SQLite protegida, manejados solo mediante la utilidad de desarrollo. No hay bandeja, autoinicio ni AutoPick. La interfaz de fase 02 conserva su lista vacía real; las acciones futuras están deshabilitadas y explicadas. Los estados de conexión no se persisten. El pipe admite 16 clientes simultáneos, frames de 256 KiB y plazos de cinco segundos. La suscripción usa una conexión dedicada y snapshots completos, por lo que un salto de secuencia no exige reconstruir deltas. Un proceso malicioso con control del mismo usuario y capacidad de reemplazar binarios no queda aislado por este mecanismo.

Ante Desconectado: comprueba el runtime con `idg-probe.exe ping`, que los binarios estén juntos, registro/ID correctos y que el complemento se haya reconstruido. No pegues credenciales ni rutas privadas en issues. Estado, evidencias y pendientes en [IMPLEMENTATION_STATUS](IMPLEMENTATION_STATUS.md).


## Galería de interfaz (fase 02)

Después del setup anterior, desde la raíz:

```powershell
npx --yes pnpm@12.4.2 gallery
```

Abre http://127.0.0.1:1421/gallery.html. Este comando se comprobó con Vite; la prueba automatizada usa el mismo entry en un puerto libre. El banner identifica muestras de 0/1/3/20 archivos. No conecta al runtime ni descarga nada. El servidor queda limitado a loopback; Ctrl+C lo detiene. Abrir index.html muestra la interfaz normal, que necesita Tauri para conectar.

Prueba filtros y Limpiar, selección, menú de fila, expansión automática/manual, Nueva descarga y las superficies del banner. Actualizar muestra cambia una medida solo al pulsarlo; no hay temporizador de progreso. Conflicto, asistente, colas, reglas, multimedia, recuperación y ventanas auxiliares son componentes de muestra. Mini ventana y zona de arrastre necesitan activación local; no crean ventanas del sistema ni vigilan el portapapeles. Los diálogos explican qué acciones necesitan backend y no muestran éxitos falsos.

Sistema es el tema inicial. Tema y vista de filas se conservan localmente por origen; no guardan URLs, credenciales ni trabajos. La configuración real del motor sigue pendiente. Una elección manual de expansión prevalece durante la sesión, incluso al filtrar y volver. 1–3 filas se expanden automáticamente si cabe el presupuesto de espacio; 4+ empiezan compactas. Los detalles técnicos se abren aparte. Lista paginada de 50 filas como límite de renderizado; hay listado paginado de trabajos por IPC de desarrollo, todavía sin conexión con la lista visual.

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

El host de Native Messaging no tiene permiso de iniciar ni consultar trabajos. El handshake del probe anuncia la consulta de capacidades; la del host/escritorio conserva comandos anteriores. Los snapshots de trabajos no contienen URL ni directorio. Datos persistentes por defecto en el directorio de aplicación del usuario, subcarpeta `IDG/development`; las pruebas usan `IDG_DATA_DIR` local al proceso. No compartas la DB como diagnóstico público.
