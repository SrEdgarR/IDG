# Extensión Chromium de desarrollo (fase 07)

Esta guía describe código en revisión. No hay extensión publicada, instalador ni garantía de uso cotidiano. La carga descomprimida es solo para desarrollo. Firefox tiene un build separado de fase 08, con sus pruebas y limitaciones descritas en [DESARROLLO](DESARROLLO.md); Edge comparte la base Chromium, pero su integración específica todavía requiere prueba.

## Preparar una sola instalación local

Compila desde la raíz siguiendo [DESARROLLO.md](DESARROLLO.md):

```powershell
npx --yes pnpm@12.4.2 install --frozen-lockfile
cargo build --locked -p idg-runtime -p idg-native-host
npx --yes pnpm@12.4.2 desktop:build
npx --yes pnpm@12.4.2 extension:build
.\scripts\Register-NativeHost.ps1 -Browser Chromium
.\target\debug\idg-desktop.exe
```

El host se registra en HKCU solo para la copia de IDG desde la que ejecutas el script. Si ya apunta a otra copia, el script se detiene sin reemplazarla. Cierra por completo la otra sesión IDG y retira su registro con su propio script antes de cambiar de copia; no detengas un motor que otra persona esté usando. En `chrome://extensions`, activa Modo de desarrollador y carga `apps/extension/build/chromium` como extensión descomprimida. Ábrela desde el icono de extensiones. `Conectado` exige el host y el runtime compatibles; `Reconectar` no inicia el motor a escondidas.

El manifiesto normal no solicita `downloads` ni ofrece un control que active captura automática. AutoPick sigue siendo requisito del producto; la captura automática de descargas ya iniciadas está deshabilitada y esas descargas permanecen en Chromium. La interfaz permite elegir enlaces directos de la página tras una acción explícita y confirmar cada solicitud en IDG. Chromium expone URL, nombre, MIME y estado de `DownloadItem`, pero no el método HTTP ni el cuerpo original; esa limitación explica por qué esta ruta observada no se reproduce como un GET improvisado, no por qué toda captura automática futura sería imposible. Consulte la [referencia oficial `chrome.downloads`](https://developer.chrome.com/docs/extensions/reference/api/downloads#type-DownloadItem).

La preferencia AutoPick que aparece en el asistente se guarda como una elección futura; hoy no cambia cómo se capturan descargas. Las excepciones automáticas por sitio, MIME y tamaño no están disponibles en el popup actual.

Para probar la ruta admitida, inicia `node fixtures/http/segments.mjs 8788` en otra terminal. En el popup pulsa «Previsualizar enlaces», elige un enlace GET **público y repetible**, sin consulta ni fragmento, como `http://127.0.0.1:8788/file`, y confirma en el diálogo de IDG el nombre, la carpeta y que las solicitudes repetidas son seguras. El trabajo se guarda antes de empezar. El manifiesto de producción tiene permisos mínimos (`nativeMessaging`, `storage`, `contextMenus`, `activeTab` y `scripting`); el recorrido normal de permisos, el gesto del icono y el menú contextual aún están pendientes de comprobación con perfil aislado.

POST, formularios, `blob:`, `data:`, URLs con parámetros o fragmentos, credenciales, cookies de sesión y respuestas de acceso no se trasladan. Los fixtures HTTP locales comprueban una redirección a otro origen sin cabeceras `Cookie`/`Authorization`, una página HTML de acceso rechazada como representación y un endpoint POST-only que no se acepta mediante un GET. No se transfieren cookies del perfil. Una descarga observada no se ofrece ni se cancela; su alternativa segura comprobada es que Chromium la complete. El trabajador conserva únicamente el estado mínimo de tareas explícitas de enlace elegidas por el usuario. El historial de trabajos reside en IDG.

La captura explícita del enlace elegido usa un ID estable para evitar duplicar trabajos ante doble clic o respuesta perdida. Después de reiniciar el motor, pulsa «Reconectar» para consultar el trabajo persistido. Las descargas que Chromium inicia por su cuenta no se ofrecen ni se cancelan; continúan en el navegador porque no se puede demostrar que un GET nuevo reproduzca la petición original. Revisa el estado del enlace elegido antes de repetirlo.

`node scripts/test-extension-shell.mjs` usa el manifiesto normal, pero no acredita una concesión/rechazo interactivos. `node scripts/test-chromium-capture.mjs` es un arnés aislado de Tauri/WebView2 y Chromium. Añade `downloads` y permiso de origen `127.0.0.1` solo a la copia temporal del manifiesto para verificar que una descarga observada termina en Chromium, sin propuesta ni cancelación. También comprueba el enlace explícito, doble envío, exclusiones, pausa/reanudación, cortes del host/worker, reconexión y hash final. Esta ampliación de permisos es exclusiva del arnés: no cambia ni acredita el manifiesto normal. En este worktree no se repitió la integración, porque el registro Native Messaging apunta a otra copia y su script se niega a reemplazarlo. No se atribuya al CI: `scripts/Check.ps1 -Integration` es una matriz local y consulta [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md) para resultados por commit.
