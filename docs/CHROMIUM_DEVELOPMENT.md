# Extensión Chromium de desarrollo (fase 07)

Esta guía describe código en revisión. No hay extensión publicada, instalador ni garantía de uso cotidiano. La carga descomprimida es solo para desarrollo. Firefox conserva el puente de fase 01 hasta su propia fase; Edge usa la misma base Chromium, pero su integración de captura todavía requiere prueba específica.

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

El permiso opcional `downloads` se solicita **solo** al pulsar «Activar detección global»; si se rechaza, Chromium conserva su descarga. La guía y los ajustes locales del popup siguen en desarrollo. La API de Chromium informa URL, nombre, MIME y estado de `DownloadItem`, pero no el método HTTP ni el cuerpo original. Por eso las descargas ya iniciadas se quedan en el navegador y la extensión explica el límite: no las convierte en un GET improvisado. Consulte la [referencia oficial `chrome.downloads`](https://developer.chrome.com/docs/extensions/reference/api/downloads#type-DownloadItem).

Mientras editas las excepciones, las actualizaciones de progreso no sustituyen los campos sin guardar. Pulsa «Guardar excepciones» para aplicar los cambios; si el guardado falla, el borrador permanece visible para corregirlo o intentarlo de nuevo.

Para probar la ruta admitida, inicia `node fixtures/http/segments.mjs 8788` en otra terminal. En el popup pulsa «Previsualizar enlaces», elige un enlace GET **público y repetible**, sin consulta ni fragmento, como `http://127.0.0.1:8788/file`, y confirma en el diálogo de IDG el nombre, la carpeta y que las solicitudes repetidas son seguras. El trabajo se guarda antes de empezar. También hay un menú contextual sobre enlaces y vídeos directos; el gesto desde la barra y el menú no se han comprobado en un Chrome interactivo en este entorno.

POST, formularios, `blob:`, `data:`, URLs con parámetros o fragmentos, credenciales, cookies de sesión y respuestas de acceso no se trasladan. Los fixtures HTTP locales comprueban una redirección a otro origen sin cabeceras `Cookie`/`Authorization`, una página HTML de acceso rechazada como representación y un endpoint POST-only que no se acepta mediante un GET. No se transfieren cookies del perfil. Una descarga observada no se ofrece ni se cancela; su alternativa segura comprobada es que Chromium la complete. El trabajador conserva únicamente el estado mínimo de tareas explícitas de enlace elegidas por el usuario. El historial de trabajos reside en IDG.

La captura explícita del enlace elegido usa un ID estable para evitar duplicar trabajos ante doble clic o respuesta perdida. Después de reiniciar el motor, pulsa «Reconectar» para consultar el trabajo persistido. Las descargas que Chromium inicia por su cuenta no se ofrecen ni se cancelan; continúan en el navegador porque no se puede demostrar que un GET nuevo reproduzca la petición original. Revisa el estado del enlace elegido antes de repetirlo.

`node scripts/test-extension-shell.mjs` usa el manifiesto normal, pero no acredita una concesión/rechazo interactivos. `node scripts/test-chromium-capture.mjs` abre Tauri/WebView2 y Chromium con host y runtime reales, perfil aislado y manifiesto de integración preconcedido solo para `downloads` y `127.0.0.1`. Comprueba que una descarga observada termina en Chromium sin propuesta/cancelación; captura explícita de enlace, doble envío, exclusiones, pausa/reanudación; caída del proceso host y terminación del service worker antes de bytes durables, reconexión y ausencia de rangos duplicados; y cierre del navegador tras bytes durables con hash final. No sustituye la prueba del permiso normal, el icono, `activeTab` ni el menú contextual. El registro Chromium se restaura al terminar. `scripts/Check.ps1 -Integration` no debe atribuirse al CI; consulta [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md) para evidencias y pendientes.
