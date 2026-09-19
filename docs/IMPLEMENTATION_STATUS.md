# Estado de implementación

Estado actual: **fase 01 implementada y verificada localmente en Windows 11 x64, con integración real Tauri/Chromium/Firefox; CI portable aprobada; ejecución Windows remota en curso al registrar esta evidencia**.
No marcar una fila completada solo por generar archivos. Completar evidencia conforme se ejecute cada fase.

Estados: PLANIFICADO, EN_CURSO, IMPLEMENTADO_NO_VERIFICADO, VERIFICADO, BLOQUEADO, DIFERIDO.

| Requisitos | Fases principales | Estado | Código / pruebas / evidencia |
|---|---|---|---|
| Repositorio SrEdgarR/IDG, README y primera subida | 00 | VERIFICADO | Repositorio público, main y primer SHA remoto verificados; evidencia debajo. |
| Plataforma, licencia y límites | 00, 13, 15 | VERIFICADO (documentación 00) | [ADR-001](decisions/001-plataforma.md), [LICENSE](../LICENSE), [Desarrollo](DESARROLLO.md); compatibilidad del binario pendiente de 13/15. |
| Separación core/runtime/desktop/host y contratos | 00, 01 | VERIFICADO (alcance 01 local) | crates/*, apps/*, scripts/test-*.mjs; [ADR-009](decisions/009-esqueleto-verificado.md). |
| UI-01 a UI-08 | 02, 05, 14, 15 | PLANIFICADO | — |
| WIN-01 a WIN-06 | 05, 06, 08, 12, 13 | PLANIFICADO | — |
| WIN-07 | 13, 15 | PLANIFICADO | — |
| DL-01 HTTP/HTTPS | 03, 04 | PLANIFICADO | — |
| DL-01 FTP/FTPS | 11 | PLANIFICADO | — |
| DL-02 a DL-07 | 03, 04, 05 | PLANIFICADO | — |
| DL-08 a DL-10 | 04, 05, 06, 11 | PLANIFICADO | — |
| ORG-01 a ORG-03 | 06, 07 | PLANIFICADO | — |
| ORG-04 a ORG-06 | 06, 12 | PLANIFICADO | — |
| EXT-01 a EXT-08 | 01, 07, 08 | EN_CURSO | Puente y estado de conexión verificados en 01; captura/AutoPick y matriz completa PLANIFICADOS. |
| MEDIA-01 a MEDIA-03 | 09, 10 | PLANIFICADO | — |
| MEDIA-04 a MEDIA-07 | 10 | PLANIFICADO | — |
| SEC-01 a SEC-06 | Todas; revisión 12, 15 | PLANIFICADO | — |
| SEC-07 sincronización | Opcional 17 | DIFERIDO | No forma parte de la entrega base. |
| SEC-08 BitTorrent | Opcional 16 | DIFERIDO | No forma parte de la entrega base. |
| SEC-08 plugins externos | Futuro | DIFERIDO | No habilitar ejecución arbitraria. |
| ARM64, portable, streaming en vivo, VPN aislada por proceso | Futuro / ADR | DIFERIDO | No prometer soporte no implementado. |

## Registro de fases

Fase 00, 2026-09-19: documentación, licencia íntegra, guías de contribución/seguridad, ADR, [trazabilidad de todos los requisitos](TRACEABILITY.md) y exclusiones preparadas. El ZIP original se conserva local sin versionar; el manifiesto del kit conserva su significado histórico. La fase 01 no se ha ejecutado.

### Evidencia de fase 00

- Cuenta autenticada confirmada: SrEdgarR. Antes de crear se consultó el destino y se enumeraron repositorios propios: IDG no existía. Se creó público por API oficial sin tocar otros repositorios.
- Rama `main`, remoto `origin` = `https://github.com/SrEdgarR/IDG.git`.
- Commit inicial: `4e756d83afdcfde9445679351f1a3070b8a56273`, mensaje `docs: initialize IDG specification and project guides`.
- `git push -u origin main`: correcto, nueva rama remota. `git ls-remote origin refs/heads/main` devolvió el mismo SHA. Lectura pública por API confirmó repositorio público, rama principal main y ese commit; cero releases.
- 55 archivos revisados/versionados. Comparación de 41 archivos originales contra el ZIP: solo ocho documentos/configuraciones cambiaron; PRODUCT_SPEC, INTERFAZ, DESIGN_SYSTEM, inventario CTL y prompts se conservaron íntegros.
- Verificador temporal ejecutado con Node: 109 enlaces Markdown locales resueltos, 54 IDs de requisitos cubiertos por TRACEABILITY y 65 controles consecutivos sin omisiones. No se agregó un paquete o framework de pruebas.
- Búsqueda de patrones de tokens, claves privadas y URLs con credenciales: cero coincidencias. Revisión de lista/diff y exclusiones correcta; ZIP, .env, datos privados, parciales, DB y binarios quedan excluidos. Esto no es una certificación absoluta de seguridad.
- `git diff --cached --check`: pasó después de corregir una línea vacía final. Licencia descargada íntegra desde GNU y SHA-256 registrado en THIRD_PARTY_NOTICES.
- No se ejecutaron build, lint, tests del producto, UI, instalador ni handshake: aún no existen paquetes ni aplicación; no se instalaron herramientas. Rust/Cargo y pnpm no se encontraron; C++ no confirmado y WebView2 pendiente, como detalla DESARROLLO.

Este registro se guarda en un segundo commit documental después de verificar el inicial. Su SHA final y la verificación de su push se comunican al entregar, evitando autorreferencias imposibles.

### Comprobación manual

Abrir el README en GitHub, seguir las guías de instalación/desarrollo y confirmar el aviso de que no hay instalador. Recorrer ADR y trazabilidad; los CTL deben seguir PLANIFICADO. Comparar `git rev-parse HEAD` con `git ls-remote origin refs/heads/main` y comprobar `git status --short --branch` limpio. Esta comprobación histórica corresponde a fase 00; para la aplicación actual ver DESARROLLO.

## Decisiones pendientes de despliegue

Destino creado y verificado: [SrEdgarR/IDG](https://github.com/SrEdgarR/IDG), público; título `IDG — Internet Download Genious`. Primera subida verificada. Siguen pendientes revisión de marca (crear un repositorio no la acredita), identidad/IDs de extensión, claves reales del actualizador, firma Authenticode cuando se disponga de ella y cuentas de tienda. No son bloqueantes para desarrollar con fixtures y configuración local; sí pueden bloquear publicar/actualizar instalaciones reales.

## Limitaciones conocidas

La evidencia de fase 01 se limita al entorno registrado; no certifica rendimiento de descargas, seguridad absoluta, compatibilidad universal ni estabilidad de una release.

## Fase 01 — evidencia local, 2026-09-19

Rama: feat/01-esqueleto-y-puente. Base conservada e22c96deb44791da860bdcf36ec0b44911c0b0f1; primer incremento de protocolo 5925e5f publicado. El SHA final y PR se comunican al entregar para evitar autorreferencias. No se avanzó a fase 02.

| Área | Estado | Evidencia real |
|---|---|---|
| Rust y frontend, contratos generados | VERIFICADO | Check.ps1 -Integration pasó: fmt, Clippy -D warnings, seis tests Rust, tipos TS, regeneración estable, builds de tres ejecutables y extensión. |
| Instancia única y estado | VERIFICADO | test-runtime.mjs/idg-probe: varios clientes con mismo runtime_id, segunda instancia rechazada, snapshots, suscripción, reconexión. |
| Framing y validación | VERIFICADO | tests/framing.rs y test-runtime: fragmentos, EOF limpio/truncado, tamaño cero/excesivo, JSON inválido, versión incompatible y handshake obligatorio; frame parcial termina dentro del plazo. |
| Seguridad IPC | VERIFICADO (pruebas locales) | Node no autorizado rechazado sin respuesta; pipe falso del mismo usuario rechazado por probe. DACL SID-only y remote reject en código. Otra cuenta/sesión remota NO EJECUTADA. |
| Ventana Windows real | VERIFICADO | test-desktop.mjs abrió Tauri/WebView2 y accionó conectar, ping, shutdown y reconectar; captura real revisada. Cierre de proceso conserva runtime. |
| Chromium real | VERIFICADO (Chrome for Testing) | test-chromium.mjs: página propia del popup → host → pipe → runtime, cierre/reapertura, caída y reconexión; cierre de navegador conserva runtime. |
| Firefox real | VERIFICADO (156.0) | test-firefox.mjs: addon temporal en perfil separado, mismo recorrido real y salida. |
| Vida del host | VERIFICADO | test-runtime: EOF del navegador termina host, runtime permanece; cierre runtime termina host incluso con stdin abierto. |
| Registro reversible/host ausente | VERIFICADO | Unregister → Chromium muestra Desconectado → Register → ambos navegadores conectan. Registros de pruebas retirados al entregar. |
| CI portable/Windows | EN_CURSO | Portable aprobada en [run 35469531778](https://github.com/SrEdgarR/IDG/actions/runs/35469531778); Windows sigue ejecutándose al registrar. No atribuirle las pruebas gráficas locales. |
| Interfaz completa, descargas, persistencia, captura y video | PLANIFICADO | Fuera del alcance de 01. No existen filas, controles o progreso simulados. |

Entorno y versiones: [DESARROLLO](DESARROLLO.md). Rust y Build Tools instalados con autorización. Instalador Firefox bloqueado inicialmente por revisión automática; el propietario lo instaló y después se ejecutó la prueba. No quedan bloqueos de herramientas para las comprobaciones locales de 01.

Fallos resueltos durante desarrollo: API de generación ts-rs actualizada, permisos/build Tauri e icono, configuración pnpm 12 y tipos TS; prueba Chromium corrigió un selector que confundía role=status con heading; Firefox requirió esperar la navegación y usar su contexto de automatización para abrir la página de extensión. El fallo de una prueba no se registró como éxito antes de corregirlo y repetirla.

Comprobación visual: captura auténtica del WebView2 revisada, estado/PID y controles legibles. Automatización en Windows y navegadores reales no equivale a un recorrido manual exhaustivo. Pendiente manual: abrir desde menú de extensiones (las pruebas cargan su página), X de ventana mediante gesto humano, teclado/lector de pantalla/DPI, Windows 10, Chrome de consumo/Edge/Brave/Opera/Vivaldi, privado/múltiples perfiles, usuario distinto y estrés prolongado. La fase no acredita esas matrices futuras del TEST_PLAN.

## SIGUIENTE_PASO

Revisar la PR de fase 01 y el resultado de CI, repetir el recorrido manual de DESARROLLO en el equipo del propietario y atender cualquier fallo. No fusionar automáticamente. No iniciar fase 02 sin una nueva indicación; se conserva íntegra su especificación y el inventario de controles pendientes.

Revisión final local: 112 archivos inspeccionados, 106 enlaces Markdown locales válidos y cero patrones de tokens/claves privadas/URLs con credenciales. Revisión estática independiente sin hallazgos bloqueantes; precisó que el test Tauri termina el proceso y no pulsa la X (recorrido manual pendiente ya indicado). Diff sin errores de whitespace. Los binarios, perfiles, herramientas descargadas y capturas están excluidos; solo se versiona la clave pública de identidad Chromium.

Publicación verificada: commit de implementación d38fa27d2b643f44e221e42a397fe262295d0b21 coincide con la rama remota. [PR #1](https://github.com/SrEdgarR/IDG/pull/1) abierta hacia main, sin fusionar. pnpm audit --prod no encontró vulnerabilidades conocidas. Captura real saneada en docs/images/fase01-conexion.png. Se corrigió una línea vacía final detectada en el diff de avisos de terceros.
