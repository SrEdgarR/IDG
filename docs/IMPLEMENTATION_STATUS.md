# Estado de implementación

Estado actual: **fase 04 integrada en main; fase 05 implementada y VERIFICADA en las pruebas automáticas locales descritas debajo. Revisión manual parcial y CI del HEAD de entrega pendientes.** No se declara verificación completa de la matriz Windows ni confirmación humana del motor.
No marcar una fila completada solo por generar archivos. Completar evidencia conforme se ejecute cada fase.

Estados: PLANIFICADO, EN_CURSO, IMPLEMENTADO_NO_VERIFICADO, VERIFICADO, BLOQUEADO, DIFERIDO.

| Requisitos | Fases principales | Estado | Código / pruebas / evidencia |
|---|---|---|---|
| Repositorio SrEdgarR/IDG, README y primera subida | 00 | VERIFICADO | Repositorio público, main y primer SHA remoto verificados; evidencia debajo. |
| Plataforma, licencia y límites | 00, 13, 15 | VERIFICADO (documentación 00) | [ADR-001](decisions/001-plataforma.md), [LICENSE](../LICENSE), [Desarrollo](DESARROLLO.md); compatibilidad del binario pendiente de 13/15. |
| Separación core/runtime/desktop/host y contratos | 00, 01 | VERIFICADO (alcance 01 local) | crates/*, apps/*, scripts/test-*.mjs; [ADR-009](decisions/009-esqueleto-verificado.md). |
| UI-01 a UI-08 | 02, 05, 14, 15 | EN_CURSO; capa visual 02 VERIFICADA localmente | App, DownloadList, Dialogs, Settings, galería y tokens; pruebas UI y Tauri. Backend conectado y probado en 05; accesibilidad exhaustiva y rendimiento final pendientes. |
| WIN-01 a WIN-06 | 05, 06, 08, 12, 13 | EN_CURSO | Ciclo de vida, bandeja, preferencias y ventanas implementados; evidencia automatizada y límites manuales en cierre 05. Integración final posterior pendiente. |
| WIN-07 | 13, 15 | PLANIFICADO | — |
| DL-01 HTTP/HTTPS | 03, 04 | VERIFICADO (local automatizado 03/04) | core/download, tests/http.rs, test-http-runtime y test-segments; benchmark controlado. |
| DL-01 FTP/FTPS | 11 | PLANIFICADO | — |
| DL-02 a DL-07 | 03, 04, 05 | EN_CURSO | Persistencia, pausa/reanudación y validación secuencial por IPC verificadas; UI conectada en 05; funciones de fases posteriores pendientes. |
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

Fase 00, 2026-09-19: documentación, licencia íntegra, guías de contribución/seguridad, ADR, [trazabilidad de todos los requisitos](TRACEABILITY.md) y exclusiones preparadas. El ZIP original se conserva local sin versionar; el manifiesto del kit conserva su significado histórico. En ese momento todavía no se había ejecutado fase 01.

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

Rama: feat/01-esqueleto-y-puente. Base conservada e22c96deb44791da860bdcf36ec0b44911c0b0f1; primer incremento de protocolo 5925e5f publicado. El SHA final y PR se comunican al entregar para evitar autorreferencias. En esa entrega no se avanzó a fase 02.

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
| CI portable/Windows | VERIFICADO para 9bbdc40 | [PR run 35469726320](https://github.com/SrEdgarR/IDG/actions/runs/35469726320) y [push run 35469724322](https://github.com/SrEdgarR/IDG/actions/runs/35469724322): portable y Windows aprobados. CI no ejecuta ventanas ni navegadores. |
| Interfaz completa, descargas, persistencia, captura y video | PLANIFICADO | Fuera del alcance de 01. No existen filas, controles o progreso simulados. |

Entorno y versiones: [DESARROLLO](DESARROLLO.md). Rust y Build Tools instalados con autorización. Instalador Firefox bloqueado inicialmente por revisión automática; el propietario lo instaló y después se ejecutó la prueba. No quedan bloqueos de herramientas para las comprobaciones locales de 01.

Fallos resueltos durante desarrollo: API de generación ts-rs actualizada, permisos/build Tauri e icono, configuración pnpm 12 y tipos TS; prueba Chromium corrigió un selector que confundía role=status con heading; Firefox requirió esperar la navegación y usar su contexto de automatización para abrir la página de extensión. El fallo de una prueba no se registró como éxito antes de corregirlo y repetirla.

Comprobación visual: captura auténtica del WebView2 revisada, estado/PID y controles legibles. Automatización en Windows y navegadores reales no equivale a un recorrido manual exhaustivo. Pendiente manual: abrir desde menú de extensiones (las pruebas cargan su página), X de ventana mediante gesto humano, teclado/lector de pantalla/DPI, Windows 10, Chrome de consumo/Edge/Brave/Opera/Vivaldi, privado/múltiples perfiles, usuario distinto y estrés prolongado. La fase no acredita esas matrices futuras del TEST_PLAN.

## SIGUIENTE_PASO

Revisar PR de fase 05 y el CI de su HEAD; realizar el checklist de APP_DEVELOPMENT.md (selector Windows, X/bandeja físicos y avisos nativos). No fusionar sin autorización ni avanzar a 06. No hay confirmación humana del motor. El cierre vigente está al final; los siguientes apartados conservan evidencia histórica.

Revisión final local: 112 archivos inspeccionados, 106 enlaces Markdown locales válidos y cero patrones de tokens/claves privadas/URLs con credenciales. Revisión estática independiente sin hallazgos bloqueantes; precisó que el test Tauri termina el proceso y no pulsa la X (recorrido manual pendiente ya indicado). Diff sin errores de whitespace. Los binarios, perfiles, herramientas descargadas y capturas están excluidos; solo se versiona la clave pública de identidad Chromium.

Publicación verificada: commit de implementación d38fa27d2b643f44e221e42a397fe262295d0b21 coincide con la rama remota. [PR #1](https://github.com/SrEdgarR/IDG/pull/1) entonces abierta hacia main, sin fusionar; integración posterior registrada debajo. pnpm audit --prod no encontró vulnerabilidades conocidas. Captura real saneada en docs/images/fase01-conexion.png. Se corrigió una línea vacía final detectada en el diff de avisos de terceros.

## Transición autorizada a fase 02

Sobre 9bbdc40 se recompilaron los ejecutables y se realizó interacción real automatizada con la X nativa: escritorio cerrado, runtime con el mismo PID y runtime_id; reapertura conectó sin otra instancia. No fue una revisión humana. Computer Use interrumpió la prueba al no poder determinar con confianza la URL de Chromium: abrir/cerrar/reabrir el popup desde el menú real sigue PENDIENTE DE CONFIRMACIÓN DEL USUARIO. La integración previa de la página del popup mediante automatización permanece válida; no equivale al recorrido de la barra del navegador.

Confirmación comunicada por el propietario: Reconectar funciona después de iniciar manualmente idg-runtime.exe. Reconectar no debe iniciar el motor. Esta confirmación no aprueba navegadores, accesibilidad u otras pruebas no mencionadas. No hay defecto bloqueante conocido en el esqueleto; se conserva la matriz ampliada pendiente. La autorización de fusión se limita a PR #1; PR de fase 02 requiere revisión y no tiene autorización de fusión.

Este cierre cambia solo documentación: lectura de CI del SHA exacto, revisión de evidencia y enlaces/diff; no se afirma una nueva ejecución completa de -Integration.

PR #1 fusionada con autorización del propietario: HEAD documental 87403226a82d482bb8b0a882babe4923d3b65b79 aprobado en [CI de PR](https://github.com/SrEdgarR/IDG/actions/runs/35470825868) y [push](https://github.com/SrEdgarR/IDG/actions/runs/35470824002), jobs portable/windows. Integración verificada: e64d633ead3e52eda7a0c14804e735d47c67d468. La rama fase 02 comenzó dependiente de ese cierre mientras corría CI y conserva toda la historia mediante merge de main. No se autorizó fusionar fase 02.


## Fase 02 — interfaz y evidencia local

Implementación en feat/02-interfaz, sobre el esqueleto existente, sin motor de descargas ni cambios del IPC. Fuentes verificadas: 45c45a471b0d20502d104292eab0a18caaa65b9f; integración de main sin cambios de fuentes: 086700682194684ac4bb87496d8231391dfeee62. Check.ps1 -Integration probó esas fuentes; después se ampliaron únicamente las aserciones de resize/persistencia del test y pnpm test:ui volvió a pasar. Cambios posteriores solo documentales no implican una nueva prueba completa.

| Área | Estado y evidencia |
|---|---|
| Shell, sidebar exacta, temas, búsqueda/filtros | VERIFICADO automáticamente con TypeScript, tres tests de modelo y test-ui.mjs. Tokens compartidos sin nuevas dependencias. Tema/vista local persistidos; no ajustes del runtime. |
| Filas/selección/expansión/menús | VERIFICADO en galería: 0/1/3/20, override manual, checkbox y menú no expanden, cambio de muestras conserva selección/foco/scroll, resize mantiene override. Métricas desconocidas explícitas; 60 puntos máximos por sparkline, 50 filas por página. |
| Diálogos/Ajustes/asistente/colas/reglas/multimedia/auxiliares | Componentes IMPLEMENTADOS; interacciones locales cubiertas según inventario. Operaciones del motor PLANIFICADAS y deshabilitadas. Capturas revisadas no equivalen a probar todos los controles. |
| Producción sin fixtures | VERIFICADO: entrada normal vacía, prueba del bundle sin entry/marcadores/nombres de galería. La galería usa un entry separado y no invoca Tauri. |
| Aplicación Windows real | VERIFICADO mediante interacción automatizada en Tauri/WebView2: error útil sin runtime, handshake, ping, shutdown y reconexión; cero filas reales; diálogo y temas capturados. No revisión humana. |
| Extensiones reales | VERIFICADO con test-chromium y test-firefox después de cambiar estilos: Native Messaging, reapertura de página, desconexión/reconexión sin relanzamiento. No recorrido del menú nativo. Registro de desarrollo propio retirado al finalizar. |
| Regresión general | Check.ps1 -Integration aprobado: fmt, Clippy -D warnings, seis tests Rust, tres tests UI modelo, tipos regenerados, TS, build frontend/extensión/Tauri, runtime/framing/seguridad, galería y conexiones reales. test-ui se repitió tras ampliar sus aserciones de resize/persistencia. |
| Evidencia visual | 27 capturas de galería + Tauri y popup claro/oscuro. Vista normal/pequeña revisada, sin overflow horizontal; gráficas visibles en filas pequeñas. DPR 1.5/2 emulado: NO prueba DPI real de Windows. Selección saneada en images/fase02-*.png. |
| CI | Workflow conserva portable/windows y añade ui headless en Linux. Estado remoto del HEAD final pendiente de consulta en la entrega. CI ui no ejecuta Tauri ni Native Messaging. |

Defectos corregidos y comprobados: expansión manual se perdía al filtrar hasta cero resultados; foco de modal escapaba con Tab; error asíncrono de conexión no mostraba la explicación útil; gráfica quedaba oculta en ventana pequeña. La revisión independiente detectó campos visuales omitidos de Avanzado/Ajustes; añadidos como controles pendientes. La prueba de resize ahora espera el render del evento en vez de leer antes de actualizarse. Capturas se toman tras finalizar transiciones, sin editar imágenes.

**Confirmado por el propietario:** únicamente reconexión tras iniciar runtime manualmente (transición anterior), y cierre de la ventana anterior para permitir recompilar. No atribuirle aprobación estética, navegadores o DPI.

**Pendiente de esta entrega:** revisión visual del propietario y CI del HEAD de su PR; ninguna descarga se puede iniciar. **Pendientes posteriores:** integrar motor/datos/acciones en 03–12 según inventario, bandeja y configuración de X, instalador/actualizador, Windows 10, otras familias de navegador, menú nativo de extensión, accesibilidad exhaustiva, DPI real y rendimiento a escala. No se ha iniciado fase 03. Ver [ADR-010](decisions/010-interfaz-y-galeria.md).

## Transición solicitada a fase 03

Confirmación del propietario limitada a temas claro/oscuro, filas expandibles con información y gráfica, Nueva descarga y Configuración: base visual aceptada. Se pidió únicamente subir moderadamente todo el texto; decoración posterior. No equivale a aprobar accesibilidad/DPI/compatibilidad. PR #2 seguía abierta con CI de d9289d8 aprobada; el nuevo ajuste requiere sus propios checks antes de fusionar. Motor 03 no se incorpora a PR #2.

Ajuste tipográfico: +1 px en toda la escala mediante tokens compartidos, sin zoom ni cambio de paleta. Build, test:ui y Check.ps1 -Integration aprobados; capturas auténticas actualizadas, incluida revisión de galería pequeña y diálogos. La aprobación de CI anterior no se atribuye a este nuevo commit. SIGUIENTE_PASO de transición: comprobar su HEAD, fusionar únicamente PR #2 cuando cumpla condiciones y continuar 03 en rama independiente/dependiente explícita.

## Cierre autorizado de fase 02

Confirmación humana limitada a temas claro/oscuro, expansión de filas, Nueva descarga y Configuración. No extiende aprobación a otras pruebas. Ajuste solicitado +1 px mediante tokens compartidos, sin zoom ni cambios de paleta; commit 06e87b6e043ba970ec7316f704da680124190ed9, build/test:ui/Check -Integration aprobados. CI de ese SHA: [PR run 35473020703](https://github.com/SrEdgarR/IDG/actions/runs/35473020703) y [push run 35473019922](https://github.com/SrEdgarR/IDG/actions/runs/35473019922), ui/portable/windows aprobados. PR #2 fusionada con autorización expresa y comprobación de HEAD/conflictos; merge 244407faf89efd0baad1f0f9eb155676439cbbf4.

## Fase 03 — motor secuencial

Rama feat/03-motor-http. Implementación en core/download, runtime/downloads, idg-storage, protocolo compartido y CLI existente idg-probe. [ADR-011](decisions/011-http-secuencial.md) registra decisiones; [recorrido reproducible](HTTP_DEVELOPMENT.md) separa utilidad técnica de aplicación final. No se avanza a fase 04 ni se conectan botones prematuramente.

- VERIFICADO automáticamente en Windows 11: HTTP/HTTPS real local, bytes recibidos/durables separados, pausa/cancelación, Range/If-Range y hash, tamaño desconocido, HEAD no necesario, enlace de un uso, errores de representación/recurso, checkpoint SQLite/DPAPI y recuperación. Muerte real del runtime propio durante 8 MiB; reinicio pausado, Range desde checkpoint y cantidad exacta restante, hash final esperado.
- VERIFICADO automáticamente: publicación bloqueada mediante handle Windows real; conserva final y reintenta sin GET. Fallos de disco lleno y guardado final son inyectados, no equivalen a llenar disco/corte eléctrico real. Migraciones y blob corrupto se prueban por separado.
- Interacción real automatizada: regresiones Tauri/WebView2 y Native Messaging Chromium/Firefox mediante páginas de extensión. No es revisión humana del motor ni prueba del menú nativo del popup.
- Confirmado por el usuario: únicamente aceptación visual de fase 02 descrita arriba. Revisión manual del motor PENDIENTE.
- DIFERIDO: segmentación 04, conexión visual de trabajos 05, colas/organización, captura, multimedia y distribución. Matriz Windows 10, accesibilidad exhaustiva, DPI real y navegadores adicionales sigue PENDIENTE.

Errores detectados en revisión y corregidos: una señal Run redundante podía abortar un GET; destino alternativo no persistido antes de mover; fallo del último guardado podía perder el estado recuperable; admisión durante apagado; falta de anuncio de capacidades; un blob corrupto bloqueaba trabajos sanos. Se conservan pruebas de regresión pertinentes. El parcial recién creado se retira si falla su primera persistencia; no se toca un final.

La evidencia local se refiere al conjunto de implementación de fase 03, cuyo SHA se registra al publicar. CI de fase 02 no se atribuye al motor nuevo. Sin promesas de aceleración, estabilidad universal o protección frente a control malicioso de la propia cuenta Windows.

Comprobaciones ejecutadas: `Check.ps1 -Integration` aprobado (23 pruebas Rust, tres de modelo UI, build/TS, procesos, galería y Tauri/Chromium/Firefox). Después se añadieron una prueba de Last-Modified y apagado activo, y se endureció la sintaxis de ETag/clasificación de disco lleno: `Check.ps1` aprobado sobre ese código final, 24 pruebas Rust y regresiones IPC/HTTP. No se presenta esa última ejecución sin -Integration como otra prueba gráfica completa. Servidor standalone `node fixtures/http/server.mjs 8787` comprobado. Los subcomandos CLI documentados se ejecutaron desde la suite Node; un recorrido adicional con lanzamiento desde PowerShell fue rechazado por la revisión automática, sin motivo específico, y no se cuenta como ejecutado. Registro del host de pruebas retirado al terminar.

Revisión de diff/secretos/enlaces: 155 archivos, 134 enlaces locales válidos, sin patrones de secretos detectados; no se incluyen DB, parciales, perfiles o claves TLS privadas. Inventario actualizado: 501 crates/55 paquetes JS. Esta búsqueda no es una auditoría absoluta de seguridad.

### Publicación y evidencia vinculada

Implementación probada: `b949ffffc47f1988a4455a412c76d39b03ad294c`. Push a `origin/feat/03-motor-http` correcto y SHA remoto comprobado; [PR #3](https://github.com/SrEdgarR/IDG/pull/3) abierta hacia main, sin fusionar. El cierre que agrega este registro solo modifica documentación; no representa una nueva prueba completa del producto.

CI observado para b949ffff: [run de push 35474606199](https://github.com/SrEdgarR/IDG/actions/runs/35474606199), ui aprobado, portable/windows en curso; [run de PR 35474637478](https://github.com/SrEdgarR/IDG/actions/runs/35474637478), ui/portable en curso y Windows en cola. No se declaran aprobados ni se atribuyen estos runs al commit documental posterior. Consultar el HEAD actual de PR #3 antes de integrar; su CI sigue siendo condición pendiente. No se promete seguimiento en segundo plano.

## Cierre puntual de fase 03 y autorización de transición

HEAD inspeccionado y conservado: `ed4e72e88cd10f493e50984b1a802b3f12e81587`. CI de ese SHA aprobado en ui/portable/windows: [35474676225](https://github.com/SrEdgarR/IDG/actions/runs/35474676225) y [35474674383](https://github.com/SrEdgarR/IDG/actions/runs/35474674383). No se atribuyen esos resultados al commit documental posterior.

Sobre ese mismo HEAD se ejecutó nuevamente `Check.ps1 -Integration`: 24 pruebas Rust, modelo/UI, compilación, tipos, IPC/HTTP y regresiones Tauri/WebView2, Chromium y Firefox aprobadas. Interacciones reales automatizadas; no confirmación humana del motor ni gesto del menú nativo. Antes de registrar se verificó que los cuatro registros de desarrollo estaban ausentes; se crearon para las pruebas y se retiraron al terminar, restaurando ese estado. No se encontraron procesos IDG personales activos ni se usaron perfiles personales. No se repitió ni eludió el recorrido adicional de PowerShell bloqueado anteriormente: permanece no ejecutado.

Precisión de privacidad: los documentos de trabajos se protegen con DPAPI antes de almacenarlos como blobs dentro de SQLite/WAL. Esto **no es cifrado integral del archivo SQLite**: esquema e identificadores quedan visibles. La prueba manual del propietario sigue PENDIENTE. No aparecieron regresiones ni defectos bloqueantes conocidos en este cierre; el cambio es documental, sin reconstruir fase 03. La fusión de PR #3 queda autorizada únicamente tras aprobar el HEAD documental; la PR de fase 04 no tiene autorización de fusión.

## Fase 04 — EN_CURSO

Primer incremento: planificador de rangos semiabiertos, cobertura exacta y metadatos acotados a 4096 rangos, sin activar todavía transferencias paralelas. Dos pruebas aprobadas (`cargo test --locked -p idg-core ranges::tests`): casos generados deterministas (2000 tamaños, tres prefijos), fronteras hasta u64::MAX, huecos y solapes. Rama feat/04-segmentacion inicialmente dependiente del cierre 9bd2800 de PR #3; el código de 04 no se incorpora a esa PR.

PR #3 integrada con autorización tras verificar HEAD `9bd28002fc9858ffee93ffeb53a1a17083bcf626`, sin conflictos y ui/portable/windows aprobados: [35476204831](https://github.com/SrEdgarR/IDG/actions/runs/35476204831) y [35476203071](https://github.com/SrEdgarR/IDG/actions/runs/35476203071). Merge remoto `c521a4f9c12a18eb0d70bb03d6fde9351d50e2fa`. La regresión final se ejecutó sobre ed4e72e; el cierre 9bd2800 solo documenta esos resultados.

Segundo incremento de 04: rangos paralelos por IPC, writer único, checkpoints protegidos, migración 002 compatible, modo automático medido/manual, límites globales/individuales/origen y prioridades. Pruebas HTTP anteriores y nueva suite de segmentación aprobadas antes del último ajuste de observabilidad de solicitudes; ese ajuste y el benchmark se verifican en el cierre. Sin confirmación humana del motor. No se ha conectado la UI ni iniciado 05.

### Cierre local de fase 04

El conjunto de implementación de este cierre (su SHA se registra en la PR y entrega) pasó `Check.ps1 -Integration`: formato, Clippy, 31 pruebas Rust, tres pruebas de modelo UI, tipos/build, IPC, HTTP y segmentación, galería y regresiones Tauri/WebView2, Chromium y Firefox. Después se amplió únicamente la suite de segmentación con dos transferencias largas de Automático y se ejecutó otra vez completa con resultado aprobado. El fixture standalone también arrancó y anunció URL/hash reales. No se atribuye una nueva ejecución gráfica a esos cambios posteriores de pruebas/documentación.

- VERIFICADO automáticamente: cobertura generada y fronteras hasta u64::MAX (sin escribir archivos físicos de ese tamaño), integridad de 1/4/8/16/Auto, respuestas inválidas, representación cambiada, pausa/cancelación, reintentos acotados y Retry-After extremo, recuperación tras muerte del proceso entre escritura/checkpoint sin volver a pedir rangos durables, migración desde 03 conservando el blob y límites/prioridades de tres trabajos.
- Automático real: fixture de 64 MiB limitado por conexión conserva el aumento; fixture de 32 MiB con límite compartido vuelve de tres a dos. Se comprueba además el hash final.
- Benchmark release: **45/45 archivos con hash esperado**, tres repeticiones por modo/condición. [Resultados, entorno y limitaciones](BENCHMARK_04.md), [datos completos](benchmarks/fase04.json). No acredita Internet ni superioridad sobre IDM.
- Interacción real automatizada: Tauri/WebView2 y Native Messaging Chromium/Firefox; host de desarrollo retirado al finalizar, sin perfiles personales. No es revisión humana ni interacción con el menú nativo del popup.
- Confirmado por el usuario: aceptación visual de fase 02; ninguna confirmación humana nueva del motor. Recorrido interactivo de PowerShell pendiente; no se reintentó el flujo adicional bloqueado anteriormente.
- Pendiente: CI remoto del HEAD publicado y revisión/autorización de integración de 04. Windows 10, archivos físicos >4 GiB, energía física, diez trabajos/rendimiento prolongado, otros discos y matriz ampliada no se declaran verificados. UI de trabajos pertenece a 05; no se ha iniciado.

La revisión detectó un posible desbordamiento con Retry-After extremo: ahora se conserva el plazo y se libera el slot sin crear una espera desmesurada; prueba de regresión aprobada. También se corrigieron la contabilidad de permisos HTTP activos y la limpieza de listeners del fixture. Documentos de trabajos y ajustes protegidos mediante DPAPI dentro de SQLite: **no cifrado integral de SQLite**. Guía reproducible: [segmentación y límites](SEGMENTATION_DEVELOPMENT.md).

### Publicación de fase 04

Implementación probada: `128c01e` más el planificador previo `6457fde`. Se incorporó main mediante merge `93ede986d66dfdf6c82e30bbbf154b7ed4aae4ce`, sin cambiar el árbol probado. Push y SHA remoto comprobados. [PR #4](https://github.com/SrEdgarR/IDG/pull/4) abierta hacia main, sin fusionar.

CI observado para 93ede986: [push 35477828885](https://github.com/SrEdgarR/IDG/actions/runs/35477828885), ui aprobado y portable/windows en curso; [PR 35477856928](https://github.com/SrEdgarR/IDG/actions/runs/35477856928), ui/portable/windows en curso. No se declaran aprobados los jobs pendientes ni se atribuyen estos runs al posterior commit documental. La entrega/PR registra la consulta del HEAD final; no se promete seguimiento en segundo plano. El workflow no ejecuta la integración gráfica ni navegadores.

Revisión final: 168 archivos y 151 enlaces locales válidos, diff sin errores de espacios ni patrones de secretos detectados. No es certificación absoluta. Este registro posterior solo cambia documentación y no representa otra prueba completa del producto. SIGUIENTE_PASO: comprobar el CI del HEAD vigente y revisar PR #4; integrar únicamente con autorización posterior del propietario.

## Corrección puntual del CI de fase 04

El CI de c73617f terminó **FALLIDO en Windows** en ambas ejecuciones, no pendiente: [push 35477886488](https://github.com/SrEdgarR/IDG/actions/runs/35477886488) y [PR 35477888133](https://github.com/SrEdgarR/IDG/actions/runs/35477888133). ui y portable aprobaron. El push ejecutó c73617f y la PR el merge temporal d30b607, con el mismo árbol Git. [Diagnóstico y causa reproducida](CI04_DIAGNOSIS.md).

El fixture compartido perdía crédito con callbacks tardíos. Reproducción controlada con mínimo 16 ms: misma aserción fallida, referencia de 1.945.262 bytes/s y dos ventanas de 2.942.916 / 2.934.997 bytes/s; conservar el aumento era correcto frente a esa mejora real. No se conoce el caudal interno exacto de las ejecuciones remotas antiguas, porque no lo registraron. La corrección usa presupuesto compartido con crédito acotado y comprueba su caudal real; no fuerza el objetivo a dos ni modifica la política de Adaptive. Trazas optativas permiten observar las decisiones sin perder transiciones por sondeo.

Registro de ejecuciones, sin ocultar fallos:

1. Reproducción con fixture antiguo y callbacks retrasados: FALLÓ la aserción original; evidencia numérica conservada.
2. Primera suite completa tras corregir pacing: FALLÓ en `timeout crash`, antes de los casos Automático. Se reforzó la observación con una barrera HTTP sin alterar el motor ni sus hashes/checkpoints.
3. Suite completa con barrera: APROBADA; tres repeticiones por conexión y tres compartidas.
4. `Check.ps1 -Integration`: APROBADO, 35 pruebas Rust, tres del modelo UI, formato/Clippy, tipos/build, HTTP/IPC/recuperación, fixture con temporizadores retrasados y otras tres repeticiones de cada condición; galería, Tauri/WebView2 y Chromium/Firefox reales automatizados.

Después se afinó únicamente la asociación de cada decisión con su prueba de aumento más reciente en la aserción diagnóstica; la política Rust y la UI no cambiaron. Esa comprobación se ejecuta otra vez en un recorrido HTTP/IPC focalizado de tres repeticiones por condición. Resultados finales del recorrido y benchmark se agregan debajo.

Los cuatro registros de host ya estaban presentes por la prueba manual anterior y apuntaban a esta copia. Se conservaron sin modificaciones durante la regresión. El propietario cerró su aplicación/runtime; las pruebas administraron únicamente procesos y perfiles propios. No se declara confirmación humana del motor.

La interfaz, tipografía, paleta, permisos y protocolo de producto no cambian. Sin fusión de PR #4, releases ni fase 05. CI del nuevo commit correctivo se consulta después del push y se registra en la PR/entrega; el resultado del commit fallido no se presenta como éxito ni como pendiente.

Recorrido focalizado final: APROBADO, otras tres repeticiones por condición (nueve aprobadas por condición en total, sumando suite completa e integración). [Trazas finales con referencia, ventanas, decisiones, coste de probe y caudal del servidor](test-evidence/adaptive-after.json). Son comprobaciones automatizadas, no confirmación humana.

Benchmark afectado repetido: release, 15/15 hashes correctos, cinco modos × tres repeticiones. [Serie compartida v2](BENCHMARK_04.md) y [datos](benchmarks/fase04-shared-v2.json). Las 45 mediciones originales se comprobaron idénticas byte a byte respecto a c73617f. No se atribuyen al fixture nuevo. Código probado sin modificaciones posteriores del algoritmo; SHA de publicación se registra en PR #4 y entrega.

## Transición autorizada 04 → 05

HEAD 08b17caed34eb68e2411ca7f629c88f2d6d6bf76: [push 35479388766](https://github.com/SrEdgarR/IDG/actions/runs/35479388766) y [PR 35479390196](https://github.com/SrEdgarR/IDG/actions/runs/35479390196) terminaron con ui, portable y Windows aprobados. La ejecución de PR usa el merge temporal 4b26c70d5664fcc20abb57047ed45dad1617b3ac; no es el commit de la rama. Se conservan diagnóstico, fallos originales y benchmarks separados. Sin confirmación humana de descargas.

El propietario autorizó fusionar solo PR #4 si el HEAD correspondiente aprueba y no hay conflictos ni defectos bloqueantes conocidos. Este cierre modifica únicamente documentación; su CI también se comprobará antes de fusionar. Mientras tanto, fase 05 puede comenzar en una rama dependiente explícita. Las pruebas locales registradas se atribuyen a 08b17ca, no se finge otra prueba de producto por esta edición.

## Fase 05 — primer incremento (histórico, commit 69f07a1)

El diálogo del escritorio acepta una URL por IPC tipado, reserva y guarda un trabajo mediante el runtime y muestra snapshots/eventos reales. El permiso se limita al ejecutable de escritorio validado; el host de extensión no obtiene estos comandos. Selector nativo de carpeta con plugin dialog 2.7.3; sin permisos genéricos de archivos o shell. URLs solo en memoria del formulario y almacenamiento protegido del runtime. Automático conserva `replay_safe=false` por defecto.

Verificación del conjunto de cambios de este incremento: `cargo check -p idg-desktop -p idg-runtime`, `pnpm check`, `pnpm desktop:build`, `pnpm test:ui` y `node scripts/test-app-download.mjs` aprobados. La última prueba interactúa con Tauri/WebView2 real de forma automatizada: formulario → aceptación durable → fila → archivo de 2 MiB, SHA-256 correcto y un único GET, sin preflight durante la edición. No es confirmación humana. La galería permanece separada.

El siguiente paso de ese incremento era completar ciclo de vida y aplicación; se desarrolla en el cierre siguiente. La rama comenzó dependiente de 8f19e11 y posteriormente incorpora main sin reescribir historia.

## Cierre de fase 05 — aplicación conectada

### Integración de fase 04

PR #4 **fusionada con autorización**, HEAD documental 8f19e1126547816aae606b1a9f873f47b7d2043c, después de comprobar ui/portable/windows aprobados en [push 35480532423](https://github.com/SrEdgarR/IDG/actions/runs/35480532423) y [PR 35480534506](https://github.com/SrEdgarR/IDG/actions/runs/35480534506). Merge remoto verificado: 2e18de4adea099ad038444bc641032ab6ca18796. Las ejecuciones de PR usan un merge temporal, no sustituyen el SHA de su rama. Diagnóstico, ejecuciones fallidas y series de benchmark anteriores se conservan. No hay confirmación humana de descargas.

### Implementación y pruebas locales

Conjunto probado: incremento 69f07a1 más cambios de cierre en feat/05-app-funcional; el SHA que guarda este conjunto se registra en PR/entrega para evitar autorreferencia. Cambios posteriores exclusivamente documentales no implican una nueva prueba completa.

| Área | Estado y evidencia |
|---|---|
| Alta durable por IPC, sin preflight, doble clic y reintento | VERIFICADO: test-app-download, formulario Tauri → runtime → archivo 2 MiB con SHA; un GET, recibo inmutable aun después de cambiar opciones. |
| Después/Cola, categoría y opciones | VERIFICADO: estados persistentes sin GET antes de iniciar, cola ejecutada con hash; regresión de caída con respuesta pendiente recupera pausado sin repetir URL. Capacidad/reglas en downloads.rs; colas avanzadas DIFERIDAS a 06. |
| Lista, pausa/reanudación, integridad | VERIFICADO: descarga 8 MiB, progreso real, pausa durable y reanudación, archivo final con SHA. BigInt u64, 60 muestras, render agrupado/oculto; filtros/selección/expansión conservados y galería aislada. |
| Conflicto/destino | VERIFICADO: rechazo conserva formulario; destino inexistente produce FileIo; archivo bloqueado conserva contenido y reintenta publicación sin otro GET. Validación de parcial por identidad/hash probada en core; renombrado/resume positivo desde diálogo IMPLEMENTADO, pendiente de recorrido UI específico. |
| Ciclo de vida | VERIFICADO por interacción automatizada real: solo escritorio inicia runtime, SC_CLOSE oculta y bytes siguen aumentando, segunda apertura conserva instancia, salida coordinada durante transferencia, reapertura conserva parcial/preferencias. SC_CLOSE no es clic físico/humano. |
| Desconexión/arranque | VERIFICADO: detener no relanza, Iniciar motor explícito recupera sesión/historial; ejecutable adjunto ausente produce error y no busca en PATH. |
| Asistente/preferencias | VERIFICADO: Known Folder consultada, destino introducido, navegador omitido, guardado y reapertura sin repetir asistente; tema conservado. Preferencias DPAPI/migración probadas. Selector nativo: IMPLEMENTADO_NO_VERIFICADO mediante su diálogo OS. |
| Carpeta/mini/drop | VERIFICADO: Explorer abre carpeta correcta, mini real consulta trabajo y rechaza preferencias privadas, drop DOM en ventana real abre revisión sin alta automática. Arrastre físico pendiente. |
| Avisos | IMPLEMENTADO: preferencias fin/error, acciones internas, deduplicación de transiciones y solicitud nativa validada/silenciosa. Entrega visual/toast Windows y sus políticas: IMPLEMENTADO_NO_VERIFICADO; en desarrollo puede identificar PowerShell. No se promete entrega por aceptar API. |
| Puente navegador | VERIFICADO: Chromium y Firefox 156 con Native Messaging real, perfiles aislados, desconexión/reconexión; no captura ni gesto físico del menú. Registros preexistentes de esta copia conservados. |

Comandos: **Check.ps1 -Integration APROBADO**, incluye fmt, Clippy -D warnings, 37 pruebas Rust, tres del modelo, tipos/build, HTTP, fixture compartido y tres repeticiones por condición de Automático, galería, Tauri y Chromium/Firefox. Sin eliminar ni debilitar la regresión de fase 04. Luego se corrigió únicamente la codificación de una etiqueta accesible y se formateó el test; check/build, test:ui y test-desktop se repiten sobre esa presentación final y se registra el resultado en el cierre de publicación.

Durante desarrollo se detectó y corrigió bloqueo de creación síncrona de la mini ventana en Windows: ahora comando asíncrono y prueba con contenido real. También se corrigió la persistencia Probing antes del GET de una cola, con regresión de caída aprobada. Una preferencia recibida tarde ya no sobrescribe una carpeta editada. Los trabajos protegidos no recuperables se informan, no se borran ni ocultan silenciosamente.

[Capturas](../README.md#cómo-se-verá) auténticas saneadas en screenshots/fase05; [memoria](test-evidence/fase05-memory.json) separa runtime, escritorio y procesos WebView2. Muestra debug aislada, ventana oculta con transferencia activa; no comparación antes/después ni promesa de liberar RAM. Working sets pueden compartir páginas y no equivalen a RAM física exclusiva.

### Límites y siguiente paso

Confirmación humana: solo aceptación visual anterior de 02; ninguna del motor/05. **PENDIENTE DE CONFIRMACIÓN DEL USUARIO**: [checklist corto](APP_DEVELOPMENT.md) de selector, X y bandeja físicos, notificación Windows y arrastre. No se ha comprobado ENOSPC real desde la UI; core inyecta disco lleno sin llenar el equipo. Windows 10, otros navegadores/discos, accesibilidad exhaustiva, DPI físico, archivos físicos >4 GiB y matriz ampliada siguen pendientes. No son funciones de 06 implementadas por esta entrega.

AutoPick/captura, colas avanzadas/horarios/reglas, FTP/multimedia, inicio Windows, abrir archivo/copia de ruta/eliminar historial o disco, instaladores y actualizaciones siguen DIFERIDOS a sus fases; controles no conectados explican su indisponibilidad. No se confunde quitar historial con borrar archivo.

SIGUIENTE_PASO: consultar CI del HEAD publicado de PR 05, revisar cambios y realizar el checklist manual. PR 05 no se fusiona sin autorización. No avanzar a 06. CI ui/portable/windows no ejecuta Tauri/WebView2 ni navegadores; sus resultados nunca sustituyen -Integration.

Verificación final de presentación: `pnpm check`, `pnpm desktop:build`, `pnpm test:ui` y `node scripts/test-desktop.mjs` APROBADOS tras corregir la codificación de la etiqueta accesible. Solo se ajustó después el momento de captura para esperar la transición del tema y muestras reales de velocidad; el recorrido Tauri se repitió para generar esas imágenes. Revisión de 207 archivos y 186 enlaces locales: válidos, sin patrones de secretos detectados ni rutas personales absolutas en Markdown; diff sin errores de espacios. Esto no es una certificación absoluta de seguridad.

Revisión adicional: orden estable por creación/ID para que un snapshot no reorganice filas; regresión de reconexión en Tauri. El primer test posterior falló porque esperaba en mini el último elemento del orden interno del motor, distinto del orden de presentación. Se corrigió la expectativa: mini debe mostrar un trabajo existente y sigue rechazando acceso a preferencias privadas. No se ocultó el fallo ni se modificó el producto para devolver un trabajo ficticio. **Check.ps1 -Integration se repitió completo sobre el conjunto final: APROBADO**, incluidos Tauri, Chromium y Firefox. No hubo cambios posteriores de código del producto.
