# Pruebas y cobertura del código implementado

La etapa transversal partió de `b6b4668189d595f9a7fd490653036c0c455769f6`: fase 07 integrada con el rediseño visual. La rama `test/cobertura-y-regresiones` se fusionó después solo en `feat/07-extension-chromium`; el propietario autorizó reanudar esa fase, que aún no está en `main`. Las cifras comparativas de la etapa transversal se conservan como historial y la medición posterior de fase 07 se indica abajo. No atribuyas a `main` esta cobertura ni las funciones de fases 06/07.

## Ejecutar

Desde la raíz del repositorio, con Rust 1.98.1 y Node 24.14.0:

```powershell
$env:PATH = "$env:USERPROFILE\.cargo\bin;$env:PATH"
npx --yes pnpm@12.4.2 install --frozen-lockfile
npx --yes pnpm@12.4.2 test:unit
npx --yes pnpm@12.4.2 test:coverage
cargo test --locked --workspace
cargo llvm-cov --locked --workspace
```

El modo continuo se inicia por separado y se detiene con Ctrl+C:

```powershell
npx --yes pnpm@12.4.2 test:unit:watch
```

`test:unit` descubre únicamente `*.test.ts(x)` en `apps/desktop/src` y `apps/extension/src`; no lanza los scripts de proceso de `scripts/`. `test:unit:watch` repite las pruebas afectadas durante desarrollo. `test:coverage` usa el mismo conjunto unitario e instrumenta código propio de escritorio y extensión, incluyendo archivos sin tests. `cargo llvm-cov` necesita `cargo-llvm-cov 0.9.1` y el componente `llvm-tools-preview` del toolchain Rust; si faltan, instálalos en el toolchain del usuario con `rustup component add llvm-tools-preview` y `cargo install cargo-llvm-cov --version 0.9.1 --locked`, según la [guía del mantenedor](https://github.com/taiki-e/cargo-llvm-cov). Son herramientas de desarrollo, no dependencias del producto.

La comprobación general conserva formato, Clippy estricto, tests Rust, tipos TypeScript, builds y suites HTTP/runtime/segmentación:

```powershell
.\scripts\Check.ps1
```

La matriz adicional de Tauri/WebView2 y Chromium/Firefox se ejecuta mediante `.\scripts\Check.ps1 -Integration`, después de preparar el host de desarrollo según [DESARROLLO](DESARROLLO.md). Gestiona solo sus datos, perfiles y procesos de prueba; no la ejecutes contra un runtime personal activo. Ni `test:unit` ni CI ordinario acreditan ese recorrido gráfico y Native Messaging real.

## Niveles e inventario de lógica

«Directa» significa aserciones sobre el módulo real; «indirecta» significa que la lógica se ejercita por otro límite real; «pendiente» identifica un camino aún sin prueba suficiente. Los grupos reúnen funciones con decisiones propias, no getters ni delegaciones triviales. Los tests de galería son componentes con fixtures y no acreditan IPC.

| Módulo y decisiones | Cobertura actual y nivel |
|---|---|
| Core: rangos, segmentación, presupuestos, adaptación | Directa en pruebas Rust con propiedades deterministas, fronteras y competencia; integración HTTP/fixture para bytes y límites. |
| Core: reanudación, cambios de recurso, checkpoints, hash y publicación | Directa en `crates/idg-core/tests/http.rs` y pruebas de `download`; indirecta en scripts HTTP/segmentación con procesos y archivos reales. |
| Core: colas, horario, reglas, búsqueda, retención, estadísticas y energía | Directa en módulos Rust; indirecta en Tauri/HTTP de fase 06. Energía física deliberadamente fuera de prueba; el recorrido manual de cancelación simulada sigue bloqueado. |
| Almacenamiento: migraciones, DPAPI, rollback y datos corruptos | Directa en `idg-storage`; indirecta en reinicio/recuperación de proceso. |
| Protocolo y límites de mensajes | Directa en `idg-protocol` y framing; indirecta en host/pipe real. |
| Runtime: idempotencia, captura y mutaciones de trabajos | Captura directa; organización/biblioteca principalmente indirectas en suites de proceso/Tauri. Ramas de error poco frecuentes aún pendientes. |
| Plataforma Windows: pipe, archivos, portapapeles, energía | Energía simulada directa; el resto se comprueba por integración aislada. API del portapapeles personal y energía física no se ejercitan. |
| TypeScript: modelo y parser de importación | Directa en Node y pruebas unitarias; CSV/TXT y límites además pasan por integración Tauri. |
| React: formularios, selección, expansión y estados tardíos | Componentes con interacción de usuario y galería Playwright; guardado/IPC real permanece en las suites Tauri. |
| Chromium: política, mensajería y recuperación | Directa en worker/bridge; `test-chromium-capture.mjs` acreditó en la fase 07 enlace explícito, reinicio de host/worker y cierre del navegador. Descargas observadas permanecen en Chromium: `DownloadItem` no expone método/cuerpo, así que esa ruta no improvisa un GET. Permisos con el manifiesto normal, icono/`activeTab` y menú contextual pendientes. |
| Firefox: adaptación WebExtensions y popup | Directa en `browser-api.test.ts`, `firefox-background.test.ts` y `popup-firefox.test.ts`; `test-firefox-manifest.mjs` valida MV3/ID/permisos y build separado. La transferencia real se intentó en Firefox 156.0, pero quedó bloqueada antes de conectar porque el registro apunta al host de otro checkout. Permisos/gestos normales y hash de descarga real pendientes. |

La línea base aislada de `b6b4668` pasó `cargo test --locked --workspace` (52 pruebas Rust: 37 unitarias y 15 de integración), los cuatro tests Node de modelo/parser, `pnpm check`, `pnpm build`, `pnpm test:ui` (galería Playwright, 41 capturas) y `test-extension-shell.mjs`. No se ejecutaron allí las suites de procesos que disputarían el runtime IDG abierto en otra copia; los resultados históricos de esas suites están en [IMPLEMENTATION_STATUS](IMPLEMENTATION_STATUS.md) y no se presentan como una nueva ejecución.

Tres regresiones nuevas demostraron fallos antes de una corrección mínima y pasaron después: una URL codificada con `%2Eexe` evadía la excepción `exe` en Chromium; el callback tardío de un watcher anterior marcaba desconectada la conexión ya restablecida; el validador del formulario admitía `ftp:`/`ftps:` aunque el core actual solo acepta HTTP/HTTPS. Las correcciones están en `apps/extension/src/worker.ts` y `apps/desktop/src/model.ts`, sin añadir transporte ni permisos.

## Verificación de fase 08 en curso — 2026-09-26

En el incremento de fase 08, `pnpm test:unit` pasó **50/50**; `pnpm check`, `pnpm extension:build` y `node scripts/test-firefox-manifest.mjs` pasaron. Se ejecutó también `scripts/Check.ps1` sin `-Integration`: Rust fmt/Clippy/workspace, tipos, builds y las suites generales de runtime/HTTP/segmentación finalizaron con código 0. No se volvió a medir cobertura ni se modificaron umbrales. Firefox usa `background.scripts` en MV3, ID Gecko estable, permisos `nativeMessaging`/`menus` y `incognito: "not_allowed"`; no se usó un manifiesto con permisos preconcedidos para declarar aprobado el recorrido normal.

La ejecución real de `node scripts/test-firefox-capture.mjs` alcanzó a abrir Firefox con un perfil WebDriver temporal, pero no pudo obtener `Conectado`. La causa quedó identificada de forma independiente: HKCU apunta al host generado en el checkout principal, mientras que el runtime de fase 08 vive en este worktree. El pipe comprueba que host y runtime sean hermanos. No se reemplazó el registro ni se repitió el intento. Se añadió un preflight de rutas a ambos arneses Firefox para que futuros intentos terminen inmediatamente con el motivo concreto. Por ello no hay resultado real de transferencia Firefox, archivo final o hash en esta fase.

La transferencia explícita de enlace HTTP(S) público y repetible en Chromium sí tiene evidencia real de fase 07 en su commit de cierre, con Tauri, Chromium de prueba, host/runtime y fixture local; esa evidencia se conserva en el historial de [IMPLEMENTATION_STATUS](IMPLEMENTATION_STATUS.md) y no se atribuye como una nueva ejecución de fase 08. AutoPick sigue siendo requisito; la captura automática sigue deshabilitada. La ausencia de método/cuerpo en `DownloadItem` limita la ruta de captura observada, no demuestra imposibilidad general. Sesiones autenticadas no soportadas; el fallback seguro conserva el navegador. Los permisos y gestos del manifiesto normal siguen pendientes.

El cierre focalizado ejecutó los arneses reales de [Tauri/HTTP](../scripts/test-app-download.mjs), [captura Chromium](../scripts/test-chromium-capture.mjs) y [reconexión Chromium](../scripts/test-chromium.mjs) sobre el código final de esta rama. Además de las 29 pruebas Vitest, comprobó rechazo de FTP/FTPS sin trabajo, HTTP local terminado con hash, `exe` y `%2Eexe` ignorados con una captura `.bin` permitida, y reconexión al runtime mediante Native Messaging. Se restauró el registro de Chromium; los perfiles y datos fueron aislados. No se ejecutó la matriz completa `-Integration` ni la cancelación manual de energía, que permanece **BLOQUEADA / PENDIENTE**. Los resultados y la atribución del CI están en [IMPLEMENTATION_STATUS](IMPLEMENTATION_STATUS.md). Esta comprobación no cambia el alcance ni los porcentajes de cobertura medidos abajo.

## Cobertura medida

Para una comparación TypeScript de alcance constante, se instrumentó el código fuente original de `b6b4668` con el nuevo harness Vitest V8 y se trasladaron **solo en un checkout de medición, sin versionarlos**, las cuatro aserciones Node preexistentes de `test-ui-model.mjs` y `test-import-parser.mjs`. Se incluyeron también los archivos propios no importados, con 0 % cuando correspondía. Esta preparación no modifica el producto base ni equivale a los nuevos tests. La medición posterior usó el mismo include/exclude sobre el código con regresiones. Los porcentajes de Rust y TypeScript nunca se suman entre sí.

| Fuentes TypeScript propias | Líneas antes → después | Funciones antes → después | Ramas antes → después |
|---|---:|---:|---:|
| Escritorio `src` sin `ui` | 79/1391 (5,68 %) → 181/1391 (13,01 %) | 10/529 (1,89 %) → 36/529 (6,81 %) | 100/1373 (7,28 %) → 211/1373 (15,37 %) |
| Componentes `src/ui` | 0/58 → 16/58 (27,59 %) | 0/17 → 6/17 (35,29 %) | 0/36 → 9/36 (25,00 %) |
| Extensión Chromium/Firefox `src` | 0/431 → 203/441 (46,03 %) | 0/105 → 39/106 (36,79 %) | 0/398 → 170/408 (41,67 %) |
| **Total TypeScript** | **79/1880 (4,20 %) → 400/1890 (21,16 %)** | **10/651 (1,53 %) → 81/652 (12,42 %)** | **100/1807 (5,53 %) → 390/1817 (21,46 %)** |

El denominador de la extensión aumentó por dos correcciones pequeñas del worker. Vitest excluye solo declaraciones `.d.ts`, archivos `*.test.ts(x)` y `apps/desktop/src/gallery/**` (fixtures de desarrollo que no entran en el bundle del producto); incluye `App.tsx`, popup, formularios y demás código de producción aunque no se importen en los tests. Los mínimos globales iniciales son 15 % de líneas, 8 % de funciones y 15 % de ramas; además hay pisos por archivo para `worker` (65/55/45), `bridge` (90/55/80), parser (80/90/70), Nueva descarga (45/25/50) y lista (45/50/35), siempre en el orden líneas/funciones/ramas. Una comprobación deliberada elevó temporalmente el mínimo del parser a 100 %: las 29 pruebas pasaron, pero la cobertura devolvió error; tras restaurar el mínimo, la suite terminó verde y produjo JUnit. Los módulos todavía a 0 % se enumeran en los huecos de abajo.

En la reanudación de fase 07, `test:coverage` ejecutó **39 pruebas** con el mismo alcance y umbrales: **544/1933 líneas (28,14 %), 104/659 funciones (15,78 %) y 474/1854 ramas (25,56 %)** TypeScript propias. En `worker.ts`, la medición fue **83,87 % líneas, 71,42 % funciones y 65,72 % ramas**; `popup.ts` llegó a **74,80 % líneas** con regresiones que exigen conservar botones activos/propuestas, preservar un campo de exclusión editado y enviar una sola vez un enlace u oferta tras dos clics. Los casos nuevos comprueban permiso opcional, exclusiones, doble envío, respuesta perdida, recuperación de propuesta y trabajo fallido, requisito de bytes durables y estabilidad de los controles del popup. Esta medición no reemplaza la tabla histórica antes/después ni se mezcla con Rust; los archivos sin tests siguen incluidos.

## CI y artefactos

El workflow `.github/workflows/check.yml` conserva tres jobs. `ui` comprueba tipos de ambos paquetes, ejecuta Vitest con cobertura y JUnit, compila escritorio/extensión y recorre galería Playwright y shell Chromium. `portable` ejecuta Rust core/protocolo/storage en Linux y genera LCOV con mínimos de 70 % de líneas y 65 % de funciones sobre ese subconjunto. `windows` corre `Check.ps1`, que ahora incluye las unitarias TypeScript además de formato Rust, Clippy estricto, tests workspace, builds y pruebas HTTP/runtime/segmentación. Los tres publican informes o logs de fallo como artefactos con nombres distintos; una prueba fallida sigue haciendo fallar su job. El workflow normal **no** ejecuta `Check.ps1 -Integration`, Tauri/WebView2 ni Native Messaging real en navegadores.

Como comprobación secundaria, Node `--experimental-test-coverage` cubrió solo `model.ts` (líneas 85,84 %, funciones 80 %, ramas 95,65 %) e `import-parser.ts` (líneas 92,31 %, funciones 100 %, ramas 76,79 %). Su total de 89,30 % de líneas **no representa la aplicación**: Node no incluyó archivos no importados. No se usa como umbral global ni se compara directamente con Vitest.

La línea base Rust se midió en Windows x64 sobre el mismo commit con `cargo llvm-cov 0.9.1`, `rustc 1.98.1` y la salida JSON de `cargo llvm-cov --locked -p idg-core -p idg-protocol -p idg-storage -p idg-runtime --json --summary-only`. Se agregaron los archivos propios `crates/<crate>/src`, incluidos los no recorridos (28 archivos):

| Crate | Líneas base | Líneas después | Funciones base | Funciones después |
|---|---:|---:|---:|---:|
| `idg-core` | 1789/2439 (73,35 %) | 1966/2578 (76,26 %) | 160/231 (69,26 %) | 170/236 (72,03 %) |
| `idg-protocol` | 177/369 (47,97 %) | 406/572 (70,98 %) | 22/43 (51,16 %) | 32/50 (64,00 %) |
| `idg-storage` | 509/545 (93,39 %) | 629/650 (96,77 %) | 40/42 (95,24 %) | 49/50 (98,00 %) |
| `idg-runtime` | 424/2009 (21,11 %) | 725/2178 (33,29 %) | 23/139 (16,55 %) | 40/147 (27,21 %) |
| Conjunto Rust | 2899/5713 (50,74 %) | 3726/5978 (62,33 %) | 245/486 (50,41 %) | 291/483 (60,25 %) |

La medición adicional `cargo llvm-cov --locked --workspace --json --summary-only` incorpora los adaptadores y ejecutables de Windows/Tauri: 36 archivos propios en `src`, incluidos los que quedaron a cero. Los cuatro crates anteriores conservan las mismas cifras; el total del workspace es el denominador completo:

| Módulo Rust adicional y total | Líneas base → después | Funciones base → después |
|---|---:|---:|
| Plataforma Windows | 13/514 (2,53 %) → 13/514 (2,53 %) | 2/43 (4,65 %) → 2/43 (4,65 %) |
| Host Native Messaging | 0/37 → 0/37 | 0/6 → 0/6 |
| Escritorio Tauri | 0/684 → 0/684 | 0/84 → 0/84 |
| **Workspace Rust completo** | **2912/6597 (44,14 %) → 3739/7213 (51,84 %)** | **247/588 (42,01 %) → 293/616 (47,56 %)** |

Los denominadores cambiaron por tests `#[cfg(test)]` inline: `cargo-llvm-cov` los incluye porque comparten archivo con código de producción. Estos porcentajes son métricas instrumentadas de `src`, **no una cifra pura del producto**. El runtime bajo en unitarias refleja lógica probada principalmente por procesos/IPC fuera de esta instrumentación, no una ausencia total de pruebas. `cargo-llvm-cov` en este toolchain ofrece líneas, funciones y regiones; no se presenta una cifra de ramas Rust comparable con la de TypeScript. El CI portable instrumenta core/protocolo/storage en Linux; su porcentaje no es directamente el total Windows de cuatro crates. Como suelo inicial de CI para esos tres crates se usa 70 % de líneas y 65 % de funciones: queda por debajo de la base Windows comparable (73,81 %/70,25 %) para admitir diferencias de plataforma sin permitir una caída amplia.

## Huecos y límites

Quedan sin aserción unitaria TypeScript directa `App.tsx`, `Clipboard.tsx`, `Import.tsx` (componente, distinto de su parser), `Library.tsx`, `RuntimeConnection.tsx`, `Settings.tsx`, `desktop.ts`, `main.tsx`, `appearance.ts` y `popup-firefox.ts`; `Organization.tsx` y `Rules.tsx` rondan 1 % en este nivel. Varias rutas sí se ejercitan indirectamente en galería/Tauri/navegadores según el inventario, por lo que no se añaden tests que solo repitan un mock. En fase 07 siguen pendientes la concesión/rechazo interactivos, abrir desde el icono y el menú contextual. El traspaso de descargas observadas permanece deshabilitado porque la API no expone método/cuerpo reproducibles; la alternativa segura (Chromium conserva la descarga) se comprobó en el navegador. El arnés real ahora cubre caída/reconexión del host, terminación/reinicio del worker para una captura explícita y cierre del navegador después de bytes durables. En Rust, las ramas de error poco frecuentes del runtime siguen principalmente cubiertas por procesos, no por unitarias; `segmented.rs` no tiene cobertura directa en la instrumentación Rust aunque conserva la suite de segmentación de proceso.

La matriz gráfica/navegadores de la PR 07 y la comprobación manual **BLOQUEADA** de cancelación de energía simulada no se declaran aprobadas. No se leen portapapeles o descargas personales, ni se apaga/suspende/hiberna Windows. Windows 10, accesibilidad exhaustiva, DPI físico y navegadores adicionales permanecen fuera de esta etapa. Los artefactos de cobertura excluyen `node_modules`, `target`, builds generados y tipos de protocolo generados; no excluyen módulos propios por ser difíciles de cubrir.
