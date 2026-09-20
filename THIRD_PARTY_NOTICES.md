# Licencia y avisos de terceros

El material propio de IDG se licencia como **GPL-3.0-only**. El archivo [LICENSE](LICENSE) contiene íntegro el texto obtenido de [GNU](https://www.gnu.org/licenses/gpl-3.0.txt), sin modificarlo. La elección «only» está declarada aquí y en el README; no se concede la opción de versiones posteriores. El texto de la licencia conserva su aviso de la Free Software Foundation.

Comprobación de origen en fase 00 (2026-09-19): SHA-256 del texto descargado `3972dc9744f6499f0f9b2dbf76696f2ae7ad8af9b23dde66d6af86c9dfb36986`. El identificador se contrastó con [SPDX](https://spdx.org/licenses/GPL-3.0-only.html).

La fase 00 no incorporó bibliotecas, binarios, tipografías, iconos ni medios de terceros. Los enlaces a documentación son referencias, no dependencias distribuidas. El kit aportado por el propietario se conserva como base del proyecto; `KIT_MANIFEST.json` describe ese kit original, no el inventario actual del repositorio. Su ZIP permanece local y excluido de Git para no duplicar contenido.

Antes de incorporar una dependencia o recurso, registrar nombre, versión, procedencia, licencia exacta, avisos y obligaciones de redistribución del artefacto concreto. Revisar compatibilidad con GPL-3.0-only y conservar licencias en la distribución cuando corresponda. Los lockfiles documentarán las versiones realmente resueltas.

FFmpeg/ffprobe aún no se distribuyen. Sus obligaciones y codecs dependen del build elegido; revisar la [documentación oficial de licencias](https://ffmpeg.org/legal.html) en fase 10 y de nuevo antes del empaquetado. No atribuir una licencia única a cualquier build.

## Dependencias de fase 01

El código referencia dependencias resueltas en Cargo.lock y pnpm-lock.yaml. [DEPENDENCIES.json](docs/DEPENDENCIES.json) registra nombre, versión, origen y licencia declarada de 435 crates y 55 paquetes JS presentes en este entorno (incluye herramientas y objetivos transitivos no usados por Windows). Se genera mediante `node scripts/dependency-inventory.mjs`, con Cargo disponible. No contiene rutas personales; no se distribuyen node_modules, crates descargados o binarios de herramientas en Git.

Principales: Tauri/tauri-build (MIT OR Apache-2.0), Tokio (MIT), Serde/serde_json (MIT OR Apache-2.0), ts-rs (MIT), windows-sys (MIT OR Apache-2.0), React (MIT), TypeScript (Apache-2.0), Vite/esbuild (MIT), Playwright/Selenium (Apache-2.0). Consultar el inventario para versiones y expresiones exactas, incluidas dependencias Unicode, BSD, ISC, Zlib y MPL-2.0. Para alternativas se elige MIT/Apache cuando esté permitido; no se requiere elegir una alternativa GPL posterior para el producto GPL-3.0-only.

El inventario de metadatos no sustituye los textos de licencia/NOTICE. Antes de distribuir binarios deben reunirse los avisos del grafo efectivamente enlazado, fuentes y obligaciones de las licencias correspondientes (incluida MPL donde aplique). Esa revisión de empaquetado queda pendiente; aquí se publica fuente y lockfiles, sin una release binaria ni instalador.

El icono de desarrollo es propio y reproducible con scripts/make-dev-icon.mjs. No se añadieron fuentes o imágenes de terceros. Playwright descarga sus navegadores/herramientas solo a tools/browsers, excluido de Git; esto no implementa ni distribuye el motor multimedia de IDG.

## Dependencias de fase 03

Inventario regenerado: 501 crates y 55 paquetes JS, cero entradas sin licencia declarada. Añadidos reqwest 0.13.5 (MIT OR Apache-2.0), rusqlite 0.40.2 (MIT), httpdate 1.0.3 (MIT OR Apache-2.0); sha2 0.10.9 reutilizado (MIT OR Apache-2.0). rcgen 0.14.10 (MIT OR Apache-2.0) y tokio-rustls 0.26.5 (MIT OR Apache-2.0) sirven pruebas HTTPS; tempfile 3.27.0 (MIT OR Apache-2.0) sirve directorios aislados. Origen crates.io y licencias transitivas en DEPENDENCIES.json. SQLite bundled y el backend criptográfico requieren conservar sus avisos al empaquetar; continúa pendiente el conjunto de avisos de una futura distribución binaria.

## Dependencias de fase 05

Inventario regenerado: 558 crates y 55 paquetes JS; cero entradas sin licencia declarada. Plugins oficiales Tauri dialog 2.7.3, single-instance 2.4.4 y notification 2.4.0 (MIT OR Apache-2.0); versiones y licencias transitivas en docs/DEPENDENCIES.json. Continúa pendiente recopilar avisos del grafo enlazado antes de una futura distribución binaria.
