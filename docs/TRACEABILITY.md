# Trazabilidad de requisitos a fases

Fuente normativa: [PRODUCT_SPEC](PRODUCT_SPEC.md). Estado real: [IMPLEMENTATION_STATUS](IMPLEMENTATION_STATUS.md). Asignar una fase no acredita funcionalidad; no hay código ni pruebas ejecutables del producto en 00.

| Requisitos | Fases | Contrato y aceptación |
|---|---|---|
| UI-01, UI-02, UI-03, UI-04, UI-05, UI-06, UI-07, UI-08 | 02, 05, 06, 12, 14, 15 | Interfaz, tokens y CTL; plan §4 y §8 |
| WIN-01, WIN-02, WIN-03, WIN-04, WIN-05, WIN-06 | 01, 05, 06, 07, 08, 12, 13 | Ciclo de vida, asistente, AutoPick e integración real; plan §3 |
| WIN-07 | 13, 15 | Instalador y actualizador firmado; plan §3 y §6 |
| DL-01 | 03, 04, 11 | HTTP/HTTPS en 03/04, FTP/FTPS en 11; plan §1 y §5 |
| DL-02, DL-03, DL-04, DL-05, DL-06, DL-07 | 03, 04, 05 | Diálogo, rangos, identidad, hash y finalización; plan §1–2 |
| DL-08, DL-09, DL-10 | 01, 04, 05, 06, 11 | Colas, recursos, disco/red y runtime independiente; plan §1–3 y §7 |
| ORG-01, ORG-02, ORG-03 | 06, 07 | Reglas, lotes e importación; plan §3–4 y §6 |
| ORG-04, ORG-05, ORG-06 | 06, 12 | Historial, duplicados y estadísticas opt-in; plan §2, §4 y §6 |
| EXT-01, EXT-02, EXT-03, EXT-04, EXT-05, EXT-06, EXT-07, EXT-08 | 01, 07, 08, 13, 15 | Handshake, permisos y traspaso durable; plan §3 y §6; tiendas requieren autorización aparte |
| MEDIA-01, MEDIA-02, MEDIA-03 | 09, 10 | Detección y selección válidas; plan §5 |
| MEDIA-04, MEDIA-05, MEDIA-06, MEDIA-07 | 10 | VOD sin cifrar, FFmpeg, metadatos y límites; plan §5–6 |
| SEC-01, SEC-02, SEC-03, SEC-04, SEC-05, SEC-06 | Todas; cierre 12, 15 | Privacidad, secretos, inputs y no autoejecución; plan §6 |
| SEC-07 | 17 opcional | Sincronización cifrada DIFERIDA |
| SEC-08 | 16 opcional / futuro | BitTorrent y plugins externos DIFERIDOS |

Secciones de pruebas: [TEST_PLAN](TEST_PLAN.md). Prompts: [orden de fases](../LEEME_PRIMERO.md). Se conservan requisitos complejos: más de 4 GiB, reanudación validada, cierres abruptos, archivos movidos, permisos por navegador y actualización firmada.

## Superficies y controles obligatorios

| Superficie | Fases | Controles y prueba |
|---|---|---|
| UX-01 Primera configuración | 02, 05, 06, 07, 08, 13 | CTL-032 a CTL-035; preferencias, omisión y conexión |
| UX-02 Principal | 02, 05, 06 | CTL-001 a CTL-007; filtros, selección, teclado |
| UX-03 Filas/detalles | 02, 03, 04, 05, 06, 12, 14 | CTL-008 a CTL-019, CTL-063/064; medidas reales y archivo ausente |
| UX-04 Nueva descarga | 02, 03, 04, 05, 06, 07, 11 | CTL-020 a CTL-027; cuatro acciones y aceptación durable |
| UX-05 Conflictos | 03, 05 | CTL-028 a CTL-031; preservar original |
| UX-06 Colas/reglas/importación | 06 | CTL-036 a CTL-041; persistencia, orden y vista previa |
| UX-07 Ajustes | 02, 04–13 | CTL-042 a CTL-051; preferencia efectiva y persistente |
| UX-08 Popup | 01, 07, 08 | CTL-055 a CTL-059; host ausente y fallback seguro |
| UX-09 Multimedia | 09, 10 | CTL-060 a CTL-062; pistas válidas, no DRM |
| UX-10 Avisos/recuperación | 05, 12, 13 | CTL-052 a CTL-054, CTL-063/064; salida, errores y actualización |
| UX-11 Ventanas opcionales | 06, 12 | CTL-065; opt-in y cierre independiente |

[INTERFAZ](INTERFAZ.md), [DESIGN_SYSTEM](DESIGN_SYSTEM.md) e [inventario](UI_CONTROL_INVENTORY.md) siguen siendo el contrato obligatorio. Cada CTL conserva disponibilidad, errores, fase y criterio de prueba; todos siguen PLANIFICADO. Al implementar, añadir rutas de código y pruebas. Una ADR o galería no permite marcar controles VERIFICADO.
