# Licencia y avisos de terceros

El material propio de IDG se licencia como **GPL-3.0-only**. El archivo [LICENSE](LICENSE) contiene íntegro el texto obtenido de [GNU](https://www.gnu.org/licenses/gpl-3.0.txt), sin modificarlo. La elección «only» está declarada aquí y en el README; no se concede la opción de versiones posteriores. El texto de la licencia conserva su aviso de la Free Software Foundation.

Comprobación de origen en fase 00 (2026-09-19): SHA-256 del texto descargado `3972dc9744f6499f0f9b2dbf76696f2ae7ad8af9b23dde66d6af86c9dfb36986`. El identificador se contrastó con [SPDX](https://spdx.org/licenses/GPL-3.0-only.html).

Esta fase no incorpora bibliotecas, binarios, tipografías, iconos ni medios de terceros. Los enlaces a documentación son referencias, no dependencias distribuidas. El kit aportado por el propietario se conserva como base del proyecto; `KIT_MANIFEST.json` describe ese kit original, no el inventario actual del repositorio. Su ZIP permanece local y excluido de Git para no duplicar contenido.

Antes de incorporar una dependencia o recurso, registrar nombre, versión, procedencia, licencia exacta, avisos y obligaciones de redistribución del artefacto concreto. Revisar compatibilidad con GPL-3.0-only y conservar licencias en la distribución cuando corresponda. Los lockfiles documentarán las versiones realmente resueltas.

FFmpeg/ffprobe aún no se distribuyen. Sus obligaciones y codecs dependen del build elegido; revisar la [documentación oficial de licencias](https://ffmpeg.org/legal.html) en fase 10 y de nuevo antes del empaquetado. No atribuir una licencia única a cualquier build.
