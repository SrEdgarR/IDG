# ADR-009 — Concreción del esqueleto de fase 01

Fecha: 2026-09-19. Aceptada para desarrollo; conserva ADR-001 a 008.

Runtime independiente por usuario: primera instancia de named pipe con FIRST_PIPE_INSTANCE; se mantiene un listener continuo. DACL protegida para SID actual y rechazo de acceso remoto. Ambos extremos comprueban SID y ruta canónica del ejecutable contrario. El cliente acepta solo idg-runtime.exe hermano; runtime acepta escritorio, host y diagnóstico idg-probe.exe hermanos. No es una barrera contra malware con control de esa cuenta/carpeta. Un endpoint ocupado o falso provoca rechazo, no fallback TCP.

Protocolo v1: handshake con capabilities, ping, get_snapshot, subscribe y shutdown; IDs ASCII acotados, JSON estricto, framing u32 little-endian, máximo 256 KiB, timeout cinco segundos para respuestas y frames iniciados. Suscripción dedicada con snapshots completos/secuencia; watch coalescente acota memoria. Hasta 16 conexiones. Ningún cliente inicia el runtime: salida explícita no crea bucles. El host termina por EOF o pérdida del pipe aunque stdin siga abierto.

Se generan tipos TS desde Rust mediante ts-rs; no se duplica el contrato a mano. Core contiene solo la máquina de sesión. idg-storage se creará cuando haya persistencia real en fase 03, como permite ARCHITECTURE; idg-media y UI compartida todavía no hacen falta. No se crean módulos vacíos. Tauri permite únicamente los tres comandos locales y eventos necesarios. La extensión es MV3 con nativeMessaging; el popup posee el puerto y lo cierra al cerrarse. No necesita worker persistente.

Identidades de desarrollo en apps/extension/development-identity.json. La clave Chromium es pública (la privada se descartó), no una credencial de publicación. Registro por usuario explícito y reversible; IDs exactos sin comodines. Todavía no existe empaquetado de distribución.

Verificado localmente: seis tests Rust, build separado, singleton, rechazos, ventana real Windows 11/WebView2, Chrome for Testing y Firefox oficiales con extensión temporal. Evidencia y límites en IMPLEMENTATION_STATUS. Windows 10, otros perfiles/navegadores, accesibilidad exhaustiva y distribución quedan pendientes; estos resultados no certifican el producto completo.

## Fuentes oficiales contrastadas

- [Tauri: requisitos Windows](https://v2.tauri.app/start/prerequisites/), [comandos Rust](https://v2.tauri.app/develop/calling-rust/), [eventos](https://v2.tauri.app/develop/calling-frontend/).
- [Chrome Native Messaging](https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging), [Mozilla Native Messaging](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Native_messaging).
- [Microsoft: seguridad named pipes](https://learn.microsoft.com/en-us/windows/win32/ipc/named-pipe-security-and-access-rights), [Tokio ServerOptions](https://docs.rs/tokio/1.53.1/tokio/net/windows/named_pipe/struct.ServerOptions.html).
- [ts-rs](https://docs.rs/ts-rs/12.0.1/ts_rs/trait.TS.html), [Rust estable](https://static.rust-lang.org/dist/channel-rust-stable.toml), [pnpm 12.4.2](https://registry.npmjs.org/pnpm/12.4.2).
- [Playwright: extensiones](https://playwright.dev/docs/chrome-extensions), [Selenium: Firefox](https://www.selenium.dev/documentation/webdriver/browsers/firefox/), [API Firefox Driver](https://www.selenium.dev/selenium/docs/api/javascript/module-selenium-webdriver_firefox-Driver.html).

Se consultaron registros npm/crates para fijar versiones estables exactas antes de resolver dependencias. Cargo.lock y pnpm-lock.yaml son la evidencia de resolución; compilar y ejecutar confirma esta combinación local, no cualquier actualización futura.
