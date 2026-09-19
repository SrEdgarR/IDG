# Referencias técnicas primarias

Consultadas el 19 de septiembre de 2026. Son referencias para verificar contratos y restricciones, no una garantía de que cualquier versión futura tenga idéntica API. En cada fase, contrastar documentación con las versiones fijadas en el repositorio. Los requisitos propios de producto son decisiones del proyecto.

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
