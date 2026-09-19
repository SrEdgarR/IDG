# Estado de implementación

Estado actual: **fase 00 documental preparada; aplicación y extensión no implementadas**.
No marcar una fila completada solo por generar archivos. Completar evidencia conforme se ejecute cada fase.

Estados: PLANIFICADO, EN_CURSO, IMPLEMENTADO_NO_VERIFICADO, VERIFICADO, BLOQUEADO, DIFERIDO.

| Requisitos | Fases principales | Estado | Código / pruebas / evidencia |
|---|---|---|---|
| Repositorio SrEdgarR/IDG, README y primera subida | 00 | EN_CURSO | Repositorio público creado y verificado; main/origin preparados; primera subida pendiente. |
| Plataforma, licencia y límites | 00, 13, 15 | VERIFICADO (documentación 00) | [ADR-001](decisions/001-plataforma.md), [LICENSE](../LICENSE), [Desarrollo](DESARROLLO.md); compatibilidad del binario pendiente de 13/15. |
| Separación core/runtime/desktop/host y contratos | 00, 01 | PLANIFICADO (implementación) | Decisiones de diseño registradas en [ADR](decisions/README.md); sin código ni pruebas de procesos. |
| UI-01 a UI-08 | 02, 05, 14, 15 | PLANIFICADO | — |
| WIN-01 a WIN-06 | 05, 06, 08, 12, 13 | PLANIFICADO | — |
| WIN-07 | 13, 15 | PLANIFICADO | — |
| DL-01 HTTP/HTTPS | 03, 04 | PLANIFICADO | — |
| DL-01 FTP/FTPS | 11 | PLANIFICADO | — |
| DL-02 a DL-07 | 03, 04, 05 | PLANIFICADO | — |
| DL-08 a DL-10 | 04, 05, 06, 11 | PLANIFICADO | — |
| ORG-01 a ORG-03 | 06, 07 | PLANIFICADO | — |
| ORG-04 a ORG-06 | 06, 12 | PLANIFICADO | — |
| EXT-01 a EXT-08 | 01, 07, 08 | PLANIFICADO | — |
| MEDIA-01 a MEDIA-03 | 09, 10 | PLANIFICADO | — |
| MEDIA-04 a MEDIA-07 | 10 | PLANIFICADO | — |
| SEC-01 a SEC-06 | Todas; revisión 12, 15 | PLANIFICADO | — |
| SEC-07 sincronización | Opcional 17 | DIFERIDO | No forma parte de la entrega base. |
| SEC-08 BitTorrent | Opcional 16 | DIFERIDO | No forma parte de la entrega base. |
| SEC-08 plugins externos | Futuro | DIFERIDO | No habilitar ejecución arbitraria. |
| ARM64, portable, streaming en vivo, VPN aislada por proceso | Futuro / ADR | DIFERIDO | No prometer soporte no implementado. |

## Registro de fases

Fase 00, 2026-09-19: documentación, licencia íntegra, guías de contribución/seguridad, ADR, [trazabilidad de todos los requisitos](TRACEABILITY.md) y exclusiones preparadas. El ZIP original se conserva local sin versionar; el manifiesto del kit conserva su significado histórico. La fase 01 no se ha ejecutado. Evidencia final de revisión y publicación: pendiente de completar después del primer push.

## Decisiones pendientes de despliegue

Destino creado y verificado: [SrEdgarR/IDG](https://github.com/SrEdgarR/IDG), público; título `IDG — Internet Download Genious`. Push pendiente de completar en esta fase. Siguen pendientes revisión de marca (crear un repositorio no la acredita), identidad/IDs de extensión, claves reales del actualizador, firma Authenticode cuando se disponga de ella y cuentas de tienda. No son bloqueantes para desarrollar con fixtures y configuración local; sí pueden bloquear publicar/actualizar instalaciones reales.

## Limitaciones conocidas

Aún no existe evidencia de ejecución del programa. Nada en este archivo certifica velocidad, seguridad, compatibilidad con navegadores o estabilidad de un binario.

## SIGUIENTE_PASO

Después de verificar la primera subida, ejecutar únicamente [prompts/01_esqueleto_y_puente.md](../prompts/01_esqueleto_y_puente.md) en una nueva tarea y rama por fase. Primero comprobar/preparar Rust MSVC, C++/SDK, pnpm y WebView2 con autorización para cualquier instalación del sistema; fijar paquetes/lockfiles y probar el puente mínimo real en Chromium y Firefox. No avanzar a fase 02.
