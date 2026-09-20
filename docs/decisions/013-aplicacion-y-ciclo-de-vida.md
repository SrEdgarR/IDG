# ADR-013 — Aplicación conectada y ciclo de vida

Aceptada para desarrollo de fase 05; mantiene stack, producto y licencia.

- Runtime como único escritor. Migración 003 añade preferencias DPAPI conservando documentos; no cifra íntegramente SQLite. AutoPick guarda tres modos futuros, sin captura.
- Framing versión 1 y capacidades de descarga esquema 3. Escritorio validado con comandos tipados; host conserva permisos anteriores. Mini solo consulta trabajos; drop prepara enlace validado para revisión.
- CreateDownload guarda recibo inmutable: mismo ID/contenido devuelve trabajo aunque luego cambien opciones; contenido distinto se rechaza. Sin preflight al editar ni replay_safe implícito.
- Después/Cola durables con capacidad/ejecución controladas. Antes del primer GET se persiste Probing: una caída recupera pausado y no repite silenciosamente el enlace consumido.
- Apertura explícita inicia solo runtime adyacente validado, sin shell/PATH. Handle impide sustituir ejecutable durante arranque; pipe autentica ubicación/usuario. No equivale a firma Authenticode. Host/reconexión automática no arrancan procesos.
- Single-instance y un propietario de bandeja. X oculta; Cerrar/Preguntar advierten y coordinan shutdown. No mata si tarda guardando ni apaga Windows.
- Known Folder, tema/vista, límites, cierre y opciones por IPC. URLs fuera de almacenamiento web. u64 como cadenas/BigInt; muestras reales limitadas a 60, agrupadas a 250 ms; ocultar no detiene transferencias.
- Abrir carpeta obtiene ruta del runtime, valida en backend y usa ShellExecuteW explore; sin shell/filesystem/SQLite genérico en JavaScript ni ejecución automática.
- Avisos de transiciones reales con acciones dentro de IDG, sin notificar historial recuperado. Backend verifica estado/preferencia, deduplica y limita frecuencia; sin sonido configurado. Aceptación de API no prueba entrega visual de toast Windows.

## Dependencias y fuentes

Tauri 2.11.5 tray-icon; plugins oficiales dialog 2.7.3, single-instance 2.4.4 y notification 2.4.0. API/permisos contrastados con Cargo.lock y fuentes oficiales: [tray](https://v2.tauri.app/learn/system-tray/), [single-instance](https://v2.tauri.app/plugin/single-instance/), [dialog](https://v2.tauri.app/plugin/dialog/), [notification](https://v2.tauri.app/plugin/notification/), [WebviewWindowBuilder](https://docs.rs/tauri/2.11.5/tauri/webview/struct.WebviewWindowBuilder.html). Ventanas auxiliares asíncronas evitan bloqueo documentado Windows; drop HTML5 desactiva manejador nativo de archivos en esa superficie y principal.

[Estado](../IMPLEMENTATION_STATUS.md), [controles](../UI_CONTROL_INVENTORY.md) y [recorrido](../APP_DEVELOPMENT.md) separan evidencia y límites. Selector, bandeja física y presentación de toast requieren confirmación; Windows 10, distribución y matriz ampliada siguen pendientes.
