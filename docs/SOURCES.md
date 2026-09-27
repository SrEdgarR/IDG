# Referencias técnicas primarias

S01–S14 consultadas el 19 de septiembre de 2026; S15–S17 contrastadas para fase 08 el 26 de septiembre de 2026. Son referencias para verificar contratos y restricciones, no una garantía de que cualquier versión futura tenga idéntica API. En cada fase, contrastar documentación con las versiones fijadas en el repositorio. Los requisitos propios de producto son decisiones del proyecto.

[S01] OpenAI — instrucciones de repositorio con AGENTS.md.
`https://developers.openai.com/codex/guides/agents-md`
Respalda las instrucciones persistentes del agente; mantener AGENTS breve y el detalle en documentos enlazados.

[S02] OpenAI — buenas prácticas de trabajo con Codex.
`https://developers.openai.com/codex/learn/best-practices`
Contexto, trabajo por tareas, comprobaciones e instrucciones reutilizables.

[S03] Chrome — Native Messaging.
`https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging`
Registro del host, allowed_origins, framing, procesos y límites del canal.

[S04] Mozilla — Native Messaging en WebExtensions.
`https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Native_messaging`
Diferencias de integración y autorización del host para Firefox.

[S05] Chrome — downloads API.
`https://developer.chrome.com/docs/extensions/reference/api/downloads`
Eventos, pausa/cancelación/reanudación y limitaciones del traspaso. onCreated informa del comienzo, no es una autorización universal anterior a toda transferencia.

[S06] Microsoft — seguridad y derechos de acceso de named pipes.
`https://learn.microsoft.com/en-us/windows/win32/ipc/named-pipe-security-and-access-rights`
Control de acceso explícito del canal local. No asumir seguros los permisos por defecto.

[S07] Tauri — plugin updater.
`https://v2.tauri.app/plugin/updater/`
Firmas obligatorias, artifacts, endpoint estático y comportamiento de instalación.

[S08] Tauri — capabilities y distribución para Windows.
`https://v2.tauri.app/security/capabilities/`
`https://v2.tauri.app/distribute/windows-installer/`
Permisos por ventana/comando e instalación con requisitos WebView2.

[S09] IETF — RFC 9110, semántica HTTP.
`https://www.rfc-editor.org/rfc/rfc9110.html`
Consultar las secciones de rangos, validadores, If-Range, respuestas 200/206/416 y Retry-After. Un anuncio de Accept-Ranges no garantiza futuras respuestas parciales.

[S10] SPDX — texto de GNU GPL versión 3, identificador GPL-3.0-only.
`https://spdx.org/licenses/GPL-3.0-only.html`
Texto de la licencia de la Free Software Foundation, condiciones sobre obras cubiertas y distribución de código fuente. No imponer publicación de toda modificación privada ni una prohibición de redistribución comercial.

[S11] IETF — RFC 8216, HTTP Live Streaming.
`https://www.rfc-editor.org/rfc/rfc8216.html`
Playlists, variantes y segmentos. Definir un subconjunto comprobado; no prometer soporte de todo HLS.

[S12] DASH Industry Forum — guías de interoperabilidad, versión 4.3 (2018).
`https://dashif.org/docs/DASH-IF-IOP-v4.3.pdf`
Referencia histórica para conceptos de MPD/representaciones; no se presenta como edición vigente más reciente. Verificar guías/especificación actuales para las características concretas que se implementen.

[S13] FFmpeg — documentación del programa, sección Streamcopy.
`https://ffmpeg.org/ffmpeg.html`
Diferencia entre copiar streams, remux y recodificar; compatibilidad del contenedor y pistas.

[S14] FFmpeg — licencias y consideraciones de redistribución.
`https://ffmpeg.org/legal.html`
Las obligaciones dependen de configuración y componentes del build distribuido.

[S15] Mozilla — background scripts y service workers en manifest.json.
`https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/background`
Firefox usa scripts de fondo en su variante de MV3; `background.service_worker` no se trata como intercambiable entre navegadores.

[S16] Mozilla — permisos de WebExtensions.
`https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/permissions`
Definición de permisos declarados y su alcance en el manifiesto Firefox.

[S17] Mozilla — API de menús contextuales.
`https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/menus`
Contrato de `menus` utilizado para el menú limitado a enlaces.

[S18] Mozilla — acceso a ventanas privadas.
`https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/incognito`
Modos de ejecución de extensiones en ventanas privadas; IDG deniega ese contexto en sus builds de desarrollo actuales.

[S15] Microsoft — IAttachmentExecute / Attachment Services.
`https://learn.microsoft.com/en-us/windows/win32/api/shobjidl_core/nn-shobjidl_core-iattachmentexecute`
Tratamiento de archivos recibidos, procedencia y políticas de Windows; no equivale a garantizar seguridad del contenido.

[S16] Chrome — action API y ciclo de vida del service worker.
`https://developer.chrome.com/docs/extensions/reference/api/action`
`https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle`
Badge/iconos y recuperación del estado de la extensión; no depender de variables globales persistentes o temporizadores infinitos.

## Referencias incorporadas en la revisión 1.1

Consultadas el 19 de septiembre de 2026. Las fuentes previas se conservan como referencias del kit original; esta revisión no vuelve a certificar cada dependencia.

[S17] GitHub CLI — gh repo create.
`https://cli.github.com/manual/gh_repo_create`
Creación con OWNER/REPO explícito, visibilidad, descripción y opciones de repositorio local/remoto. No omitir propietario al crear IDG.

[S18] GitHub Docs — About the repository README file.
`https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-readmes`
README como entrada al proyecto: propósito, comienzo de uso, ayuda y enlaces relativos de documentación.

[S19] GitHub Docs — Creating a new repository.
`https://docs.github.com/en/repositories/creating-and-managing-repositories/creating-a-new-repository`
Creación de repositorio, propietario, nombre y visibilidad. La elección de `sredgarr/IDG` es del proyecto, no una afirmación de que se haya creado al redactar el kit.

## Verificación de fundaciones — fase 00

Consultas reales del 2026-09-19, además de S03/S04/S06/S10:

- [S20: requisitos Tauri](https://v2.tauri.app/start/prerequisites/): C++, WebView2 y Rust MSVC para Windows.
- [S21: manifiesto Rust stable](https://static.rust-lang.org/dist/channel-rust-stable.toml): 1.98.1, manifiesto 2026-09-03; leído directamente por HTTPS. Esto no prueba una compilación de IDG.
- [S22: versiones Node](https://nodejs.org/en/about/previous-releases): línea 24 LTS.
- [S23: instalación pnpm](https://pnpm.io/installation) y [metadatos 12.4.2](https://registry.npmjs.org/pnpm/12.4.2): base del gestor elegido; no instalado durante 00.
- [S24: GNU GPL v3 completa](https://www.gnu.org/licenses/gpl-3.0.txt): descargada sin modificaciones a LICENSE; hash en THIRD_PARTY_NOTICES.md.
- [S25: API GitHub de repositorios](https://docs.github.com/en/rest/repos/repos#create-a-repository-for-the-authenticated-user): consulta autenticada y creación pública sin auto_init. Identidad contrastada antes de escribir.

Las versiones exactas de dependencias del programa se resolverán en 01. Las páginas son fuentes técnicas; el estado de implementación no se deduce de ellas.

## APIs multimedia WebExtensions — verificación del 2026-09-26

- [Chrome `activeTab`](https://developer.chrome.com/docs/extensions/develop/concepts/activeTab): tras una acción explícita, concede acceso temporal al origen del marco principal y permite observar solicitudes de ese origen mediante `webRequest`; se limita el observador a ese acceso temporal.
- [Chrome `webRequest`](https://developer.chrome.com/docs/extensions/reference/api/webRequest): exige el permiso API y acceso al host pertinente; la visibilidad de subrecursos depende tanto del URL solicitado como de su iniciador. `webRequestBlocking` no se solicita.
- [Mozilla permisos](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/permissions): los eventos `webRequest` requieren host permissions. `activeTab` documenta acceso temporal a la pestaña e inyección, pero no reemplaza ese permiso para eventos; Firefox conserva detección por DOM y no pide hosts amplios.
- [Mozilla `webRequest.onHeadersReceived`](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/webRequest/onHeadersReceived): los encabezados solo se reciben cuando se pide `responseHeaders`; esta interfaz no proporciona el cuerpo del recurso.

## Referencias multimedia — verificación del 2026-09-26

- [IETF RFC 8216](https://www.rfc-editor.org/info/rfc8216/): describe la versión 7 de HLS en un RFC informativo de 2017. IDG solo implementa el subconjunto VOD anotado en [MEDIA_SUPPORT.md](MEDIA_SUPPORT.md); no se infiere compatibilidad general de la especificación.
- [ISO/IEC 23009-1:2026](https://committee.iso.org/standard/23009-1?browse=ics): sexta edición publicada en julio de 2026 para DASH MPD y formatos de segmento. La suite actual usa `SegmentList` explícita; no implementa todos los perfiles del estándar.
- [Descargas FFmpeg](https://www.ffmpeg.org/download.html): la página oficial registra FFmpeg 9.0.2 publicado el 2026-09-18 y enlaza builds de Windows de terceros. [Gyan.dev builds](https://www.gyan.dev/ffmpeg/builds/) identifica el paquete de prueba concreto descrito en [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md); su procedencia/hash no se generalizan a otros builds.
- [Licencias FFmpeg](https://ffmpeg.org/legal.html): opciones GPL y bibliotecas externas cambian la licencia y obligaciones del binario. El build local observado declara GPLv3+ y `--enable-gpl --enable-version3`; no se incorpora al producto.
- [FFmpeg streamcopy](https://www.ffmpeg.org/ffmpeg.html#Streamcopy) y [ffprobe](https://ffmpeg.org/ffprobe.html): referencia para remultiplexado y comprobación de streams/duración; la aplicación restringe ambos procesos a entradas locales y un formato explícito.

## Privacidad y API de Windows — verificación del 2026-09-27

- [Microsoft WinVerifyTrust](https://learn.microsoft.com/en-us/windows/win32/api/wintrust/nf-wintrust-winverifytrust): verificación de confianza delegada al proveedor del sistema. El resultado «válido» indica confianza para esa operación, no que el contenido sea benigno; las causas de error se conservan como inválido/no verificable.
- [Microsoft Naming Files, Paths, and Namespaces](https://learn.microsoft.com/en-us/windows/win32/fileio/naming-a-file) y [Maximum Path Length Limitation](https://learn.microsoft.com/en-us/windows/win32/fileio/maximum-file-path-limitation): distinguen `\\?\` para rutas locales extendidas de `\\.\` namespace de dispositivos y UNC. Las comprobaciones de fase 12 aceptan rutas absolutas de disco local, incluso el prefijo extendido de `canonicalize`, y rechazan UNC/dispositivo.
- [Microsoft IAttachmentExecute](https://learn.microsoft.com/en-us/windows/win32/api/shobjidl_core/nn-shobjidl_core-iattachmentexecute): Attachment Services para tratamiento de archivos recibidos y procedencia. La implementación comprueba la marca de procedencia bajo demanda; una marca presente no certifica seguridad.
- [Tauri Dialog Plugin](https://v2.tauri.app/plugin/dialog/) y [API del crate tauri-plugin-dialog 2.7.3](https://docs.rs/tauri-plugin-dialog/2.7.3/tauri_plugin_dialog/): callbacks nativos de selector/guardado y opción cancelada. Se conserva la versión fijada en Cargo.lock; compilar no acredita interacción del usuario con el diálogo.

## Referencias FTP/FTPS y proxy HTTP — verificación del 2026-09-26

- [SuppaFTP 12.1.0: documentación de la versión](https://docs.rs/suppaftp/12.1.0/suppaftp/), [README publicado](https://docs.rs/crate/suppaftp/12.1.0/source/README.md) y [manifiesto publicado](https://docs.rs/crate/suppaftp/12.1.0/source/Cargo.toml): fuente del proveedor para las capacidades, nombres de features y licencia declarada en la versión fijada. El README documenta FTP/FTPS con rustls y clientes sync/async; el manifiesto publica los features habilitables. Esto describe la biblioteca, no demuestra que IDG haya integrado o verificado cada modo, servidor o comando.
- [reqwest 0.13.5: descripción y features](https://docs.rs/reqwest/0.13.5/reqwest/), [Proxy](https://docs.rs/reqwest/0.13.5/reqwest/struct.Proxy.html) y [ClientBuilder](https://docs.rs/reqwest/0.13.5/reqwest/struct.ClientBuilder.html): API del cliente HTTP. La versión consultada indica que `system-proxy` está habilitado por defecto, usa la configuración del sistema en Windows/macOS y consulta variables HTTP(S)/ALL_PROXY; SOCKS requiere el feature `socks`. `ClientBuilder::no_proxy()` desactiva la selección automática, mientras que un proxy explícito la reemplaza. Esto no acredita enrutamiento por proxy de FTP/FTPS ni el comportamiento de IDG por descarga.
- [webpki-roots 1.0.9](https://docs.rs/webpki-roots/1.0.9/webpki_roots/): documenta el conjunto de raíces de confianza Mozilla incluido en el paquete y advierte que una aplicación de usuario final puede necesitar el verificador nativo de la plataforma para respetar las raíces y datos de revocación del sistema. La referencia describe el paquete; no demuestra por sí sola la política de confianza configurada por IDG.
- [RFC 959](https://www.rfc-editor.org/rfc/rfc959.html): especificación base de FTP, incluidos los canales de control y datos; no define TLS.
- [RFC 4217](https://www.rfc-editor.org/rfc/rfc4217.html): especifica la negociación TLS para FTP, incluidos `AUTH TLS` en el canal de control y `PBSZ`/`PROT` para el canal de datos. La negociación descrita por el RFC no prueba que una conexión concreta haya validado el certificado ni que IDG aplique una política segura de fallback.
- [RFC 2577](https://www.rfc-editor.org/rfc/rfc2577.html): consideraciones de seguridad de FTP, entre ellas ataques de rebote y adivinación de contraseñas; es una guía informativa, no una descripción del comportamiento de IDG.
- [RFC 8996](https://www.rfc-editor.org/rfc/rfc8996.html): depreca TLS 1.0 y 1.1, y actualiza RFC 4217. Sirve de referencia para no tomar las versiones históricas mencionadas por RFC 4217 como política TLS actual.
