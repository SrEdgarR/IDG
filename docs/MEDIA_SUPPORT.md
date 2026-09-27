# Subconjunto multimedia implementado

Esta lista describe lo que acepta el parser y el procesamiento probado en fase 10. No significa compatibilidad con todos los perfiles HLS/DASH ni que una extensión ya transfiera estos medios desde cualquier navegador.

## HLS

- Acepta playlists master con variantes de video y rendiciones externas de audio, y playlists VOD finitas con `EXTINF` y `EXT-X-ENDLIST`. Resuelve referencias relativas desde la URL final de cada manifiesto.
- Acepta metadatos `VERSION`, `TARGETDURATION`, `MEDIA-SEQUENCE`, `PLAYLIST-TYPE:VOD`, `INDEPENDENT-SEGMENTS` y, opcionalmente, un `EXT-X-MAP` de inicialización. Solo acepta `EXT-X-KEY:METHOD=NONE`.
- En una playlist directa de video también conserva una pista de audio integrada cuando FFmpeg la encuentra. Esa playlist directa no aporta una pista de audio seleccionable; la conversión a solo audio requiere elegir una rendición de audio explícita.
- Rechaza cifrado, playlists live/dinámicas o sin `ENDLIST`, `EVENT`, byte ranges, discontinuidades, tags `EXT` desconocidos y rendiciones de subtítulos. Las referencias con credenciales, query, fragmento u otros esquemas se rechazan.
- Límite: 4 MiB por playlist, 20.000 segmentos y 24 horas declaradas; el resolver limita a 100 variantes y 100 rendiciones de audio.

## DASH

- Acepta MPD estático con un solo `Period` que empieza en cero, duración declarada y listas explícitas `SegmentList` de audio/video. Admite `BaseURL` relativo heredado y `SegmentList` heredada; cada pista debe terminar con una lista efectiva y referencias explícitas a inicialización y segmentos.
- `SegmentList@duration`/`timescale` se valida contra la duración declarada. Sin duración de segmento solo se admite un segmento por lista. Las listas en varios niveles que exigirían concatenación se rechazan.
- Rechaza `SegmentTemplate`, `SegmentTimeline`, `SegmentBase`, byte ranges, varios períodos, `ContentProtection`, enlaces externos XML/DTD, entidades y estructuras o atributos desconocidos. No sigue XLink ni procesa licencias.
- Límites: MPD de 4 MiB, profundidad XML 16, 100.000 elementos, 20.000 segmentos, 500 pistas, duración máxima 24 horas, nombres de 128 bytes, atributos/URLs de 2.048 bytes y texto de pista de 1.024 bytes.

## Descarga y salida

- Solo manifiestos y segmentos HTTP(S) públicos reproducibles, sin credenciales ni parámetros de URL. Redirects seguros: máximo cinco; nunca degradan HTTPS a HTTP ni reenvían credenciales entre orígenes. FFmpeg/ffprobe reciben únicamente archivos locales ya descargados, no URLs.
- Límite de transferencia: 512 MiB por segmento y 8 GiB por trabajo, máximo 20.000 segmentos combinados. Los segmentos completos se guardan con tamaño/hash en checkpoints y pueden reutilizarse al reanudar.
- Se descargan los segmentos seleccionados; después FFmpeg remultiplexa/copia streams en MP4 o Matroska, o crea audio Matroska original, MP3, AAC o FLAC. MP3/AAC/FLAC recodifican audio; FLAC no recupera calidad ya perdida. AAC solo aparece disponible si el ejecutable anuncia el encoder `aac`. Si el contenedor no admite un códec, el trabajo falla; no se recodifica video automáticamente.
- El ejecutable FFmpeg y el `ffprobe` hermano los elige el usuario desde Ajustes → Video y audio. El procesamiento usa rutas locales absolutas, limita cada proceso a dos hilos y seis horas, cancela el proceso al cancelar el trabajo y valida streams y duración con ffprobe antes de publicar. La duración de salida debe coincidir con la declarada dentro de una tolerancia acotada entre 50 ms y 1 s; un resultado fuera de rango se retira sin publicarlo.
- No se admite live/DVR, sesiones autenticadas, medios cifrados o DRM, descargas por URL firmada, cualquier `blob:` ni extractores de plataformas. HLS/DASH distintos de este subconjunto se rechazan con error, no se presentan como transferencias completas.

La cobertura real de escritorio y las limitaciones de navegador figuran en [IMPLEMENTATION_STATUS](IMPLEMENTATION_STATUS.md), [DESARROLLO](DESARROLLO.md) y [TESTING](TESTING.md).
