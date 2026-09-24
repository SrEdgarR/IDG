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

El permiso de detección global de descargas se solicita **solo** al pulsar «Activar detección global». Si se rechaza, Chromium continúa descargando. El popup guarda excepciones por sitio, extensión, MIME, mínimo de tamaño, política de tamaño desconocido y suspensión de una hora en el perfil local. El modo AutoPick global se guarda en el runtime. «Usar el navegador» no propone capturas; «Preguntarme» muestra propuestas en el popup; «Siempre usar IDG» abre «Nueva descarga» para las candidatas. No descarga en IDG sin aceptar el diálogo.

Para probar con el fixture local, inicia `node fixtures/http/segments.mjs 8788` en otra terminal. Usa un enlace GET **público y repetible**, sin consulta ni fragmento, como `http://127.0.0.1:8788/file`. El menú contextual aparece solo sobre enlaces y vídeos directos después de conceder el permiso. «Previsualizar enlaces» lee hasta 100 enlaces simples de la pestaña activa **solo al pulsarlo**; selecciona uno para solicitarlo. Ambos caminos piden «Nueva descarga» en la aplicación. Revisa nombre y carpeta, confirma la casilla de GET repetible y acepta. El trabajo queda persistido antes de empezar. En una descarga observada que ya corre en Chromium, el original se mantiene hasta que IDG recibe bytes durables; si la prueba falla, Chromium conserva su vía. Comprueba el destino y el hash del archivo, no solo el badge.

La captura automática no intenta rehacer POST, formularios, `blob:`, `data:`, URLs con parámetros o fragmentos, enlaces con credenciales ni sesiones que IDG no puede trasladar de forma segura. Las descargas pequeñas observadas (menos de 1 MiB) quedan en Chromium para evitar carreras de finalización. Una URL simple tampoco garantiza ausencia de autenticación: ante duda, cancela el diálogo y conserva Chromium. IDG no exporta cookies del perfil. El selector «Desconocido → Ofrecer en IDG» solo propone; no declara un tamaño ficticio. La detección observada ocurre después de iniciada la descarga en Chromium, según la [API `downloads.onCreated`](https://developer.chrome.com/docs/extensions/reference/api/downloads#event-onCreated); no es un hook universal anterior a la transferencia. El worker guarda temporalmente en el perfil local el ID de solicitud, URL pública sin consulta ni credenciales y nombre para resolver reinicios; retira esa propuesta al finalizar. El historial de trabajos reside en IDG.

La prueba sin permiso opcional es `node scripts/test-extension-shell.mjs` después de construir la extensión e instalar Chromium de Playwright. `node scripts/test-chromium-capture.mjs` usa un perfil aislado y un manifiesto de prueba con el permiso ya concedido; verifica traspaso y archivo real, pero no sustituye la comprobación del diálogo de permiso en un Chrome interactivo. La matriz gráfica/nativa sigue requiriendo el host registrado para esta misma copia y un único motor IDG. `scripts/Check.ps1 -Integration` no debe atribuirse al CI: el workflow remoto solo compila, ejecuta pruebas generales y comprueba la carga del popup sin host. Consulta [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md) para resultados y pendientes concretos.
