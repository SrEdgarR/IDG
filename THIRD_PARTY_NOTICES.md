# Licencia y avisos de terceros

El material propio de IDG se licencia como **GPL-3.0-only**. El archivo [LICENSE](LICENSE) contiene íntegro el texto obtenido de [GNU](https://www.gnu.org/licenses/gpl-3.0.txt), sin modificarlo. La elección «only» está declarada aquí y en el README; no se concede la opción de versiones posteriores. El texto de la licencia conserva su aviso de la Free Software Foundation.

Comprobación de origen en fase 00 (2026-09-19): SHA-256 del texto descargado `3972dc9744f6499f0f9b2dbf76696f2ae7ad8af9b23dde66d6af86c9dfb36986`. El identificador se contrastó con [SPDX](https://spdx.org/licenses/GPL-3.0-only.html).

La fase 00 no incorporó bibliotecas, binarios, tipografías, iconos ni medios de terceros. Los enlaces a documentación son referencias, no dependencias distribuidas. El kit aportado por el propietario se conserva como base del proyecto; `KIT_MANIFEST.json` describe ese kit original, no el inventario actual del repositorio. Su ZIP permanece local y excluido de Git para no duplicar contenido.

Antes de incorporar una dependencia o recurso, registrar nombre, versión, procedencia, licencia exacta, avisos y obligaciones de redistribución del artefacto concreto. Revisar compatibilidad con GPL-3.0-only y conservar licencias en la distribución cuando corresponda. Los lockfiles documentarán las versiones realmente resueltas.

IDG ejecuta un FFmpeg/ffprobe que el usuario selecciona en Ajustes; el repositorio no los descarga, incorpora ni distribuye. Para la E2E local de fase 10 se usó el paquete `ffmpeg-9.0.2-essentials_build-www.gyan.dev` enlazado desde la [página oficial de descargas FFmpeg](https://www.ffmpeg.org/download.html), publicado por [Gyan.dev](https://www.gyan.dev/ffmpeg/builds/). SHA-256 del ZIP de prueba: `60f467265b1e312373dbcd92200c2618a74850f98d3d078e94296bb3fa2047ba`.

La inspección local `ffmpeg -version`, `ffmpeg -L` y `ffmpeg -buildconf` identificó FFmpeg 9.0.2, aviso GPL versión 3 o posterior, `--enable-gpl --enable-version3`, build estático y bibliotecas externas como `libx264`, `libx265` y `libmp3lame`. El encoder MP3 estuvo disponible. El build y el ZIP permanecen en `.local/` excluidos de Git y solo son herramientas de prueba; el hash y la licencia no se atribuyen a otros builds elegidos por usuarios.

La licencia y obligaciones del binario varían con sus opciones y dependencias, como explica la [documentación oficial de licencias FFmpeg](https://ffmpeg.org/legal.html). Antes de distribuir FFmpeg junto a IDG habría que elegir y auditar un build concreto, conservar avisos, configuración/fuentes correspondientes y comprobar las obligaciones de cada biblioteca. Esta revisión no autoriza ni prepara una distribución de FFmpeg.

## Dependencias de fase 01

El código referencia dependencias resueltas en Cargo.lock y pnpm-lock.yaml. [DEPENDENCIES.json](docs/DEPENDENCIES.json) registra nombre, versión, origen y licencia declarada de 435 crates y 55 paquetes JS presentes en este entorno (incluye herramientas y objetivos transitivos no usados por Windows). Se genera mediante `node scripts/dependency-inventory.mjs`, con Cargo disponible. No contiene rutas personales; no se distribuyen node_modules, crates descargados o binarios de herramientas en Git.

Principales: Tauri/tauri-build (MIT OR Apache-2.0), Tokio (MIT), Serde/serde_json (MIT OR Apache-2.0), ts-rs (MIT), windows-sys (MIT OR Apache-2.0), React (MIT), TypeScript (Apache-2.0), Vite/esbuild (MIT), Playwright/Selenium (Apache-2.0). Consultar el inventario para versiones y expresiones exactas, incluidas dependencias Unicode, BSD, ISC, Zlib y MPL-2.0. Para alternativas se elige MIT/Apache cuando esté permitido; no se requiere elegir una alternativa GPL posterior para el producto GPL-3.0-only.

El inventario de metadatos no sustituye los textos de licencia/NOTICE. Antes de distribuir binarios deben reunirse los avisos del grafo efectivamente enlazado, fuentes y obligaciones de las licencias correspondientes (incluida MPL donde aplique). Esa revisión de empaquetado queda pendiente; aquí se publica fuente y lockfiles, sin una release binaria ni instalador.

El icono de desarrollo es propio y reproducible con scripts/make-dev-icon.mjs. No se añadieron fuentes o imágenes de terceros. Playwright descarga sus navegadores/herramientas solo a tools/browsers, excluido de Git; esto no implementa ni distribuye el motor multimedia de IDG.

## Dependencias de fase 03

Inventario regenerado: 501 crates y 55 paquetes JS, cero entradas sin licencia declarada. Añadidos reqwest 0.13.5 (MIT OR Apache-2.0), rusqlite 0.40.2 (MIT), httpdate 1.0.3 (MIT OR Apache-2.0); sha2 0.10.9 reutilizado (MIT OR Apache-2.0). rcgen 0.14.10 (MIT OR Apache-2.0) y tokio-rustls 0.26.5 (MIT OR Apache-2.0) sirven pruebas HTTPS; tempfile 3.27.0 (MIT OR Apache-2.0) sirve directorios aislados. Origen crates.io y licencias transitivas en DEPENDENCIES.json. SQLite bundled y el backend criptográfico requieren conservar sus avisos al empaquetar; continúa pendiente el conjunto de avisos de una futura distribución binaria.

## Dependencias de fase 05

Inventario regenerado: 558 crates y 55 paquetes JS; cero entradas sin licencia declarada. Plugins oficiales Tauri dialog 2.7.3, single-instance 2.4.4 y notification 2.4.0 (MIT OR Apache-2.0); versiones y licencias transitivas en docs/DEPENDENCIES.json. Continúa pendiente recopilar avisos del grafo enlazado antes de una futura distribución binaria.
