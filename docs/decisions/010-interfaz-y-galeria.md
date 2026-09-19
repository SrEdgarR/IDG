# ADR-010 — Presentación aislada y preferencias visuales

Estado: aceptada como decisión de implementación de bajo riesgo, fase 02. No cambia stack, producto, licencia ni comandos.

La UI React recibe un modelo de presentación tipado con los estados de ARCHITECTURE; no es un contrato IPC nuevo. La entrada normal no carga datos de descargas, porque aún no existe ese backend. RuntimeConnection mantiene invoke/listen reales y no inicia runtime.

La galería usa gallery.html y módulos exclusivos con fixtures marcadas. El build Vite por defecto solo incluye index.html; test-ui comprueba ausencia de la entrada, marcador y nombres de muestras en dist. Las muestras no se guardan como trabajos, ni generan progreso periódico. Componentes sin backend deshabilitan la operación y explican su disponibilidad.

Tema y modo de vista son preferencias exclusivamente visuales, guardadas en localStorage por origen bajo idg.ui.*; no son la configuración persistente del runtime ni requieren DB. Fallo de storage deja la UI utilizable. No se almacenan URLs, credenciales, métricas ni trabajos. La integración futura decidirá cómo migrar estas preferencias sin alterar decisiones del producto.

CSS compartido sirve escritorio y popup; iconos SVG propios, gráficas SVG de máximo 60 puntos, paginación local de 50 filas, sin nuevas dependencias. No se añade librería gráfica ni estado global innecesario. El tema Sistema responde mediante media query y respeta movimiento reducido. Modales nativos usan showModal, foco atrapado y restaurado; tests cubren también anidamiento.

Verificación: scripts/test-ui-model.mjs y scripts/test-ui.mjs; regresión Tauri/Native Messaging mediante Check.ps1 -Integration. DPR emulado y Playwright no sustituyen lector de pantalla, DPI real ni inspección humana.
