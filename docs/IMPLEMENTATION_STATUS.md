# Estado de implementación

Estado actual: **fase 00 VERIFICADA (fundaciones documentales y primera subida); aplicación y extensión no implementadas**.
No marcar una fila completada solo por generar archivos. Completar evidencia conforme se ejecute cada fase.

Estados: PLANIFICADO, EN_CURSO, IMPLEMENTADO_NO_VERIFICADO, VERIFICADO, BLOQUEADO, DIFERIDO.

| Requisitos | Fases principales | Estado | Código / pruebas / evidencia |
|---|---|---|---|
| Repositorio SrEdgarR/IDG, README y primera subida | 00 | VERIFICADO | Repositorio público, main y primer SHA remoto verificados; evidencia debajo. |
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

Abrir el README en GitHub, seguir las guías de instalación/desarrollo y confirmar el aviso de que no hay instalador. Recorrer ADR y trazabilidad; los CTL deben seguir PLANIFICADO. Comparar `git rev-parse HEAD` con `git ls-remote origin refs/heads/main` y comprobar `git status --short --branch` limpio. No hay todavía una aplicación que probar.

## Decisiones pendientes de despliegue

Destino creado y verificado: [SrEdgarR/IDG](https://github.com/SrEdgarR/IDG), público; título `IDG — Internet Download Genious`. Primera subida verificada. Siguen pendientes revisión de marca (crear un repositorio no la acredita), identidad/IDs de extensión, claves reales del actualizador, firma Authenticode cuando se disponga de ella y cuentas de tienda. No son bloqueantes para desarrollar con fixtures y configuración local; sí pueden bloquear publicar/actualizar instalaciones reales.

## Limitaciones conocidas

Aún no existe evidencia de ejecución del programa. Nada en este archivo certifica velocidad, seguridad, compatibilidad con navegadores o estabilidad de un binario.

## SIGUIENTE_PASO

Ejecutar únicamente [prompts/01_esqueleto_y_puente.md](../prompts/01_esqueleto_y_puente.md) en una nueva tarea y rama por fase. Primero comprobar/preparar Rust MSVC, C++/SDK, pnpm y WebView2 con autorización para cualquier instalación del sistema; fijar paquetes/lockfiles y probar el puente mínimo real en Chromium y Firefox. No avanzar a fase 02.

## Fase 01 — en curso

Primer incremento: workspace Rust 1.98.1, protocolo v1 y tipos TypeScript generados. `cargo test -p idg-protocol`: 4 pruebas pasadas (framing fragmentado/EOF, límites/truncamiento, escritura y JSON/IDs inválidos). La prueba inicial falló por funciones aún no implementadas; se corrigió además la llamada de generación para la API actual ts-rs 12. Runtime, escritorio y navegadores todavía pendientes. Rust instalado por usuario con autorización, sin modificar PATH global. Build Tools autorizado, instalación en curso; WebView2 153.0.4234.32 presente.
