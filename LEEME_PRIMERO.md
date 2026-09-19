# IDG — Kit de prompts para Astra / Codex · Revisión 1.1

Este paquete contiene las decisiones del producto y las tareas de implementación. **No contiene todavía el programa ni un instalador.** Conserva 16 fases principales (00–15), 2 ampliaciones opcionales (16–17) y 3 prompts de mantenimiento (90–92).

## Cómo empezar

Extrae el ZIP en una carpeta nueva para IDG y ábrela en el entorno donde trabajarás con Astra. En la raíz deben quedar README.md, AGENTS.md, PRIMER_MENSAJE_ASTRA.md, docs/ y prompts/. No necesitas crear tú el repositorio remoto: el nuevo primer mensaje se lo encarga a Astra.

Si la carpeta ya tiene código o instrucciones, integra el kit sin reemplazarlos automáticamente. Esta revisión sustituye las indicaciones iniciales del kit anterior, especialmente la prohibición general de publicar código mediante push.

## Primer mensaje

Copia el bloque completo de **[PRIMER_MENSAJE_ASTRA.md](PRIMER_MENSAJE_ASTRA.md)**. Le encarga crear/verificar el nuevo repositorio **sredgarr/IDG**, preparar un README para usuarios, leer la documentación de interfaz, ejecutar solo la fase 00 y realizar la primera subida verificada.

El nombre corto del repositorio es `IDG`; el título desarrollado es `IDG — Internet Download Genious`, conforme a la última indicación del propietario. El mensaje propone repositorio público por el objetivo open source. La creación remota depende de que Astra disponga de autenticación y permisos; este ZIP no ha creado ningún repositorio.

## Dónde está definida la interfaz

**[docs/INTERFAZ.md](docs/INTERFAZ.md)** describe pantallas, navegación, flujos y estados. **[docs/DESIGN_SYSTEM.md](docs/DESIGN_SYSTEM.md)** contiene la apariencia y tokens. **[docs/UI_CONTROL_INVENTORY.md](docs/UI_CONTROL_INVENTORY.md)** enumera controles, acciones y comprobaciones. Son documentos complementarios, no opcionales.

El [índice de docs](docs/README.md) permite encontrarlos sin recorrer toda la especificación.

## Continuar por fases

Al terminar y comprobar la fase 00, entrega el siguiente prompt, no todos a la vez:

```text
Ejecuta prompts/01_esqueleto_y_puente.md.
Respeta AGENTS.md, docs/GITHUB_WORKFLOW.md y el trabajo existente.
Implementa únicamente esta fase y verifica lo que permita el entorno.
Actualiza el estado y los documentos afectados, realiza commits coherentes
y push a la rama correspondiente de sredgarr/IDG.
No publiques releases ni avances a otra fase.
```

Cambia la ruta por la fase correspondiente. Una fase puede necesitar varias sesiones: sus pruebas y estado determinan si está completa. Para retomar usa `prompts/90_retomar.md`; para errores, `91_corregir_regresion.md`; para interfaz, `92_auditoria_interfaz.md`.

## Dos públicos, dos entradas

**README.md** es la portada del proyecto para cualquier persona: qué es, estado, instalación y ayuda. **LEEME_PRIMERO.md** es esta guía interna del kit. El desarrollo técnico va en `docs/DESARROLLO.md`; la instalación para usuarios en `docs/INSTALACION.md`.

## Orden de implementación

| Archivo en `prompts/` | Fase |
|---|---|
| `00_fundaciones.md` | Fundaciones y contrato del proyecto |
| `01_esqueleto_y_puente.md` | Esqueleto ejecutable y prueba del puente con el navegador |
| `02_interfaz.md` | Sistema visual e interfaz de escritorio |
| `03_motor_http.md` | Motor HTTP/HTTPS secuencial, persistencia y recuperación |
| `04_segmentacion.md` | Segmentación adaptable y control de recursos |
| `05_app_funcional.md` | Aplicación conectada, nueva descarga y bandeja |
| `06_colas_y_organizacion.md` | Colas, reglas, búsqueda y funciones de organización |
| `07_extension_chromium.md` | Extensión Chromium y AutoPick de extremo a extremo |
| `08_firefox_y_navegadores.md` | Firefox y compatibilidad de navegadores |
| `09_deteccion_multimedia.md` | Detección multimedia y selección de descarga |
| `10_hls_dash_ffmpeg.md` | HLS/DASH sin DRM y procesamiento con FFmpeg |
| `11_ftp_proxy_autenticacion.md` | FTP, proxies y autenticación avanzada |
| `12_privacidad_historial_windows.md` | Historial de archivos, privacidad y seguridad de Windows |
| `13_instalador_actualizaciones.md` | Instalador Windows y actualizaciones firmadas |
| `14_pruebas_y_rendimiento.md` | Pruebas integrales, fallos y rendimiento medido |
| `15_auditoria_entrega.md` | Auditoría final y candidato de entrega |
| `16_opcional_bittorrent.md` | Ampliación opcional: BitTorrent |
| `17_opcional_sincronizacion.md` | Ampliación opcional: sincronización cifrada |

Las fases 00–08 forman la base de escritorio y captura del navegador. Las 09–13 añaden multimedia, FTP, seguridad final e instalación/actualización. Las 14–15 verifican y preparan la entrega. Esta agrupación no autoriza a ignorar seguridad en fases tempranas.

## Decisiones que completan lo no respondido

Windows x64 primero; ARM64 no prometido. AutoPick inicial Preguntarme; tema Sistema; X a bandeja; organización por tipo y arranque con Windows opt-in; 3 descargas simultáneas como punto de partida ajustable; audio original por defecto; audio en Otros salvo categoría personal; selección de la mejor calidad disponible sin conversión; VOD HLS/DASH sin cifrar antes que livestream; telemetría desactivada y sin receptor inventado. Son decisiones de diseño propuestas y registradas, no supuestas respuestas textuales del usuario.

BitTorrent y sincronización cifrada están conservados como ampliaciones, no eliminados. Multimedia con DRM no se implementa. El soporte de todos los navegadores se declara por matriz probada, no por una promesa de compatibilidad universal.

## Qué debe devolver Astra

Código/archivos cambiados, comprobaciones y resultados reales, límites y siguiente paso. Además: destino GitHub confirmado, rama, commit y resultado del push. La falta de acceso se registra como bloqueo, no como creación o publicación ficticia.

Todo archivo que se suba debe pertenecer a IDG y estar revisado para no contener secretos o información privada. El flujo autorizado publica fuente/documentación; releases, tiendas y claves de firma requieren sus verificaciones y autorización específica.

Una interfaz bonita no basta: cada control debe estar conectado o estar claramente solo en la galería de desarrollo. «Compila» no significa «probado en Windows con la extensión». Mantener el README sin funciones, instaladores, capturas o compatibilidad inventados.
