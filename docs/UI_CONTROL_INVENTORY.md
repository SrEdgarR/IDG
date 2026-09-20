# Inventario de controles de IDG

Contrato inicial ampliado. El estado funcional sigue separado del avance visual: consulta la matriz vigente de fase 05 y la evidencia histórica de fase 02 debajo; una superficie no acredita su backend. Los nombres de comandos son contratos orientativos que se deben ajustar al protocolo real, no API ya implementadas.

Leer [INTERFAZ.md](INTERFAZ.md) y [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md). Al implementar, añadir ruta de código, error exacto y prueba/evidencia real a cada fila. Los grupos (por ejemplo límites o filtros) se desglosan en controles individuales al construir su pantalla, sin eliminar ningún elemento del grupo.

| ID | Pantalla | Control | Acción esperada | Comando / lógica propuestos | Disponibilidad / error | Criterio de prueba | Fases | Estado |
|---|---|---|---|---|---|---|---|---|
| CTL-001 | Principal | Nueva descarga | Abrir el diálogo compartido | Estado UI / AddDownload al confirmar | Runtime disponible o error de conexión claro | UX-04 abre sin iniciar trabajo | 02,05 | EN_CURSO: backend 05 conectado; ver matriz de verificación 05 y límites |
| CTL-002 | Principal | Sidebar: estados y categorías | Filtrar conservando foco | QueryDownloads | Vista disponible | Cada sección muestra sus resultados reales | 02,06 | EN_CURSO: backend 05 conectado; ver matriz de verificación 05 y límites |
| CTL-003 | Principal | Buscador global | Buscar por texto permitido | QueryDownloads | Sin exponer secretos | Nombre/dominio/ruta y vacío de resultados | 02,06 | EN_CURSO: backend 05 conectado; ver matriz de verificación 05 y límites |
| CTL-004 | Principal | Filtros y Limpiar | Aplicar/restablecer filtros | QueryDownloads | Filtros válidos | Fecha/tamaño/sitio/estado combinados | 02,06 | EN_CURSO: backend 05 conectado; ver matriz de verificación 05 y límites |
| CTL-005 | Principal | Vista Automática/Compacta/Expandida | Persistir preferencia de vista | UpdateSettings + estado UI | Siempre | 1/3/20 filas y override manual | 02,05 | EN_CURSO: backend 05 conectado; ver matriz de verificación 05 y límites |
| CTL-006 | Principal | Seleccionar una/varias/todas | Cambiar selección sin ejecutar acciones | Estado UI | Filas seleccionables | Teclado y alcance de selección claros | 02,06 | EN_CURSO: backend 05 conectado; ver matriz de verificación 05 y límites |
| CTL-007 | Principal | Barra de acciones masivas | Operar solo trabajos compatibles | BatchCommand | Selección válida | Resumen parcial sin éxito falso | 02,06 | EN_CURSO: backend 05 conectado; ver matriz de verificación 05 y límites |
| CTL-008 | Fila | Expandir/contraer | Revelar datos sin reiniciar descarga | Estado UI | Siempre | No se dispara por checkbox o Pausar | 02,05 | EN_CURSO: backend 05 conectado; ver matriz de verificación 05 y límites |
| CTL-009 | Fila | Pausar | Pausar realmente o advertir límites | Pause | Trabajo activo y política válida | Transferencia detenida; estado persistente | 03,05 | EN_CURSO: backend 05 conectado; ver matriz de verificación 05 y límites |
| CTL-010 | Fila | Reanudar | Continuar con validadores seguros | Resume | Recuperación validada | No mezclar representaciones distintas | 03,05 | EN_CURSO: backend 05 conectado; ver matriz de verificación 05 y límites |
| CTL-011 | Fila | Cancelar | Cancelar según confirmación aplicable | Cancel | Trabajo cancelable | Estado/temporales coherentes | 03,05 | EN_CURSO: backend 05 conectado; ver matriz de verificación 05 y límites |
| CTL-012 | Fila | Reintentar | Recrear intento con estado seguro | Retry | Error recuperable | Error explicado si enlace vencido | 03,05 | EN_CURSO: backend 05 conectado; ver matriz de verificación 05 y límites |
| CTL-013 | Fila | Abrir archivo | Abrir solo por acción explícita | OpenDownloadedFile | Archivo completado y presente | No autoejecutar al completar | 05,12 | EN_CURSO: visual/local 02; integración pendiente |
| CTL-014 | Fila | Abrir carpeta / Copiar ruta | Ubicar o copiar destino | RevealFile / CopyPath | Ruta válida | No apuntar a archivo ajeno | 05,12 | EN_CURSO: backend 05 conectado; ver matriz de verificación 05 y límites |
| CTL-015 | Fila | Menú: quitar del historial | Quitar registro sin borrar el archivo | RemoveHistory | Estado permite retirar registro | Archivo del disco permanece | 06,12 | EN_CURSO: visual/local 02; integración pendiente |
| CTL-016 | Fila | Menú: eliminar del disco | Eliminar solo con confirmación específica | DeleteDownloadedFile | Propiedad/ruta confirmadas | Archivo enumerado y cancelación segura | 06,12 | EN_CURSO: visual/local 02; integración pendiente |
| CTL-017 | Fila | Cambiar prioridad/cola/categoría | Actualizar trabajo real | UpdateDownload | Cambio permitido por estado | Persistencia tras reiniciar | 06 | EN_CURSO: visual/local 02; integración pendiente |
| CTL-018 | Fila | Detalles técnicos | Ver campos técnicos redactados | GetDownloadDetails | Datos disponibles | Sin cookies/tokens en DOM ni logs | 02,05,12 | EN_CURSO: backend 05 conectado; ver matriz de verificación 05 y límites |
| CTL-019 | Fila | Gráfica y resumen accesible | Mostrar medidas reales sin interpolación engañosa | Runtime metrics | Muestras disponibles | Pausa/desconexión sin curva ficticia | 02,05,14 | EN_CURSO: backend 05 conectado; ver matriz de verificación 05 y límites |
| CTL-020 | Nueva descarga | Nombre y URL | Editar y validar entrada | ValidateDownloadInput | Formato admitido | Nombre peligroso y URL inválida rechazados | 02,05 | EN_CURSO: backend 05 conectado; ver matriz de verificación 05 y límites |
| CTL-021 | Nueva descarga | Elegir carpeta/categoría | Seleccionar destino y clasificación | PickFolder / UpdateDraft | Destino válido | Error de permisos/espacio visible | 05,06 | EN_CURSO: backend 05 conectado; ver matriz de verificación 05 y límites |
| CTL-022 | Nueva descarga | Metadatos/reanudabilidad | Mostrar consulta y capacidad comprobada | ProbeDownload | Solicitud autorizada | Desconocido distinto de disponible | 03,05 | EN_CURSO: backend 05 conectado; ver matriz de verificación 05 y límites |
| CTL-023 | Nueva descarga | Avanzado | Conexiones/límite/prioridad/proxy | UpdateDraft | Opciones soportadas | Valores validados; secretos protegidos | 04,05,11 | EN_CURSO: backend 05 conectado; ver matriz de verificación 05 y límites |
| CTL-024 | Nueva descarga | Descargar ahora | Aceptar trabajo durable y cerrar | AddDownload / CommitCapture | Datos válidos y runtime confirma | Modal conserva datos si falla | 05,07 | EN_CURSO: backend 05 conectado; ver matriz de verificación 05 y límites |
| CTL-025 | Nueva descarga | Descargar después | Crear trabajo diferido sin arrancarlo | AddDeferredDownload | Datos válidos | No se inicia silenciosamente | 05,06 | EN_CURSO: backend 05 conectado; ver matriz de verificación 05 y límites |
| CTL-026 | Nueva descarga | Añadir a cola | Crear según política de la cola | EnqueueDownload | Cola válida | Horario/orden realmente respetados | 05,06 | EN_CURSO: backend 05 conectado; ver matriz de verificación 05 y límites |
| CTL-027 | Nueva descarga | Cancelar / Escape | Descartar borrador con recuperación segura | CancelCapture / estado UI | No compromiso irreversible | Navegador no pierde alternativa | 05,07 | EN_CURSO: backend 05 conectado; ver matriz de verificación 05 y límites |
| CTL-028 | Conflicto | Renombrar automáticamente | Proponer y reservar nombre único | ResolveConflictRename | Destino válido | Carrera con archivo existente | 05 | EN_CURSO: backend 05 conectado; ver matriz de verificación 05 y límites |
| CTL-029 | Conflicto | Sobrescribir | Confirmar reemplazo seguro | ResolveConflictReplace | Confirmación del usuario | No destruir archivo válido antes de tiempo | 05 | EN_CURSO: backend 05 conectado; ver matriz de verificación 05 y límites |
| CTL-030 | Conflicto | Reanudar | Usar parcial identificado por el motor | ResolveConflictResume | Identidad/metadatos verificables | Mismo nombre no basta | 03,05 | EN_CURSO: backend 05 conectado; ver matriz de verificación 05 y límites |
| CTL-031 | Conflicto | Cancelar | No crear ni borrar contenido | CancelDraft | Diálogo abierto | Archivo previo permanece | 05 | EN_CURSO: backend 05 conectado; ver matriz de verificación 05 y límites |
| CTL-032 | Asistente | Comenzar/Atrás/Siguiente | Navegar sin perder preferencias | Wizard state | Paso válido | Reabrir asistente con datos guardados | 02,05 | EN_CURSO: backend 05 conectado; ver matriz de verificación 05 y límites |
| CTL-033 | Asistente | Carpeta/organizar por tipo | Elegir destino y opt-in | UpdateSettings | Ruta válida | Known Folder; sin ruta personal fija | 05,06 | EN_CURSO: backend 05 conectado; ver matriz de verificación 05 y límites |
| CTL-034 | Asistente | Instalar extensión/Omitir | Abrir destino oficial o guía de desarrollo | OpenTrustedExtensionLink | Destino real configurado | Detectado no equivale a conectado | 05,08,13 | EN_CURSO: backend 05 conectado; ver matriz de verificación 05 y límites |
| CTL-035 | Asistente | AutoPick/Terminar | Persistir modo inicial elegido | UpdateSettings | Elección válida | Tres modos guardados realmente | 05,07 | EN_CURSO: backend 05 conectado; ver matriz de verificación 05 y límites |
| CTL-036 | Colas | Crear/editar/eliminar cola | Administrar cola y destino de trabajos | Queue CRUD | Sin pérdida de trabajos | Confirmación al afectar descargas | 06 | EN_CURSO: visual/local 02; integración pendiente |
| CTL-037 | Colas | Iniciar/pausar/reordenar | Controlar secuencia real | QueueCommand | Trabajos compatibles | Orden y máximo simultáneo comprobados | 06 | EN_CURSO: backend 05 conectado; ver matriz de verificación 05 y límites |
| CTL-038 | Colas | Horario y acción al terminar | Programar y advertir apagado | UpdateSchedule | Runtime activo y opción válida | No prometer descarga con PC apagada | 06 | EN_CURSO: visual/local 02; integración pendiente |
| CTL-039 | Reglas | Añadir/editar/activar/priorizar | Organizar por condiciones soportadas | Rule CRUD | Regla válida | Persistencia y conflictos explicados | 06 | EN_CURSO: visual/local 02; integración pendiente |
| CTL-040 | Reglas | Previsualizar | Explicar resultado sin efectos | EvaluateRulePreview | Datos de ejemplo claros | No mover/borrar por previsualizar | 06 | EN_CURSO: visual/local 02; integración pendiente |
| CTL-041 | Importar | Pegar varias/TXT/CSV/soltar enlace | Validar lista antes de crear | ParseImport / AddDownloads | Entradas admitidas | Errores por entrada; no ejecutar texto | 06 | PLANIFICADO |
| CTL-042 | Ajustes | Tema Claro/Oscuro/Sistema | Cambiar tema y persistir | UpdateSettings | Siempre | Cambio de Windows conserva foco/vista | 02,05 | EN_CURSO: backend 05 conectado; ver matriz de verificación 05 y límites |
| CTL-043 | Ajustes | Acción de X/inicio con Windows | Configurar comportamiento reversible | UpdateSettings / OS integration | Capacidad disponible | Cerrar realmente detiene runtime cuando corresponde | 05,13 | EN_CURSO: backend 05 conectado; ver matriz de verificación 05 y límites |
| CTL-044 | Ajustes | Carpeta/límites/simultáneas | Cambiar valores efectivos | UpdateSettings | Rangos válidos | Motor aplica y conserva valores | 04,05,06 | EN_CURSO: backend 05 conectado; ver matriz de verificación 05 y límites |
| CTL-045 | Ajustes | AutoPick/excepciones/formato/tamaño | Cambiar captura efectiva | UpdateSettings | Sincronización disponible o diferida clara | Sitios ignorados permanecen en navegador | 07,08 | EN_CURSO: backend 05 conectado; ver matriz de verificación 05 y límites |
| CTL-046 | Ajustes | Proxy y autenticación avanzada | Usar configuración segura | UpdateConnectionSettings | Protocolos soportados | Ruta y credenciales sin fugas | 11,12 | EN_CURSO: visual/local 02; integración pendiente |
| CTL-047 | Ajustes | Multimedia/calidad/formato/FFmpeg | Guardar valores compatibles | UpdateMediaSettings | Capacidad detectada | No ofrecer codec inexistente | 09,10 | EN_CURSO: visual/local 02; integración pendiente |
| CTL-048 | Ajustes | Notificaciones y sonidos | Guardar eventos/sonidos opt-in | UpdateSettings | Sistema disponible | Respetar apagado y evitar tormentas | 05,12 | EN_CURSO: backend 05 conectado; ver matriz de verificación 05 y límites |
| CTL-049 | Ajustes | Historial/modo privado/estadísticas | Aplicar política real de retención | UpdatePrivacySettings | Consentimiento aplicable | Sin historial privado residual indebido | 06,12 | EN_CURSO: visual/local 02; integración pendiente |
| CTL-050 | Ajustes | Portapapeles/ventanas flotantes | Activar capacidades opcionales | UpdateSettings | Opt-in | Desactivar detiene monitorización | 06,12 | EN_CURSO: backend 05 conectado; ver matriz de verificación 05 y límites |
| CTL-051 | Ajustes | Buscar actualizaciones automático/manual | Consultar versión sin instalar | CheckForUpdates | Red/configuración real | Sin nuevas versiones falsas | 13 | EN_CURSO: visual/local 02; integración pendiente |
| CTL-052 | Actualización | Más tarde / Actualizar y reiniciar | Aceptar instalación verificada o posponer | UpdateCoordinator | Firma válida y usuario acepta | Rechazo/fallo/descargas activas seguros | 13 | EN_CURSO: visual/local 02; integración pendiente |
| CTL-053 | Bandeja | Abrir/nueva/pausar/reanudar/AutoPick | Controlar runtime desde bandeja | Tray commands | Runtime accesible | Estado sincronizado con ventana | 05,07 | EN_CURSO: backend 05 conectado; ver matriz de verificación 05 y límites |
| CTL-054 | Bandeja | Salir | Detener aplicación tras advertir | ShutdownRuntime | Confirmación aplicable | No reactivar host en bucle | 05,13 | EN_CURSO: backend 05 conectado; ver matriz de verificación 05 y límites |
| CTL-055 | Extensión | Estado/badge/icono | Reflejar conexión y trabajos reales | Runtime events | Handshake real | Sin timer ficticio ni datos stale como actuales | 01,07,08 | EN_CURSO: conexión VERIFICADA en 01; badge/trabajos pendientes |
| CTL-056 | Extensión | AutoPick global/por sitio | Cambiar modo efectivo | UpdateSettings | Permisos válidos | Reconexión y opción persistente | 07,08 | EN_CURSO: visual/local 02; integración pendiente |
| CTL-057 | Extensión | Controles de trabajos/Abrir IDG | Actuar sobre mismo trabajo del escritorio | Native commands | Host disponible | Error si app ausente; no éxito ficticio | 07,08 | EN_CURSO: visual/local 02; integración pendiente |
| CTL-058 | Extensión | Usar navegador | Conservar vía funcional sin recaptura | ReleaseCapture | Captura no comprometida | POST/blob/no transferible con fallback | 07,08 | PLANIFICADO |
| CTL-059 | Extensión | Menú contextual de enlace/medio | Solicitar captura del recurso pertinente | PrepareCapture | Enlace/medio compatible | No crear menú invasivo en todo elemento | 07,08 | PLANIFICADO |
| CTL-060 | Multimedia | Botón Descargar y ocultar | Mostrar medios asociados/configurar visibilidad | MediaCandidates / UpdateSettings | Detección real | No tapar controles ni atribuir otro video | 09 | EN_CURSO: visual/local 02; integración pendiente |
| CTL-061 | Multimedia | Calidad/pistas/modo/formato | Elegir combinación compatible | ValidateMediaSelection | Medio compatible sin DRM | Tamaño estimado identificado y pistas válidas | 09,10 | EN_CURSO: visual/local 02; integración pendiente |
| CTL-062 | Multimedia | Conservar original / Convertir | Distinguir copia y recodificación | MediaJobSpec | FFmpeg/capacidad disponibles | Aviso de pérdida y archivo original preservado | 10 | EN_CURSO: visual/local 02; integración pendiente |
| CTL-063 | Historial | Localizar archivo | Asociar ruta solo tras validación | LocateDownloadedFile | Archivo accesible | No decir eliminado si solo no se encuentra | 12 | EN_CURSO: visual/local 02; integración pendiente |
| CTL-064 | Historial | Descargar de nuevo | Crear nuevo intento confirmado | Redownload | URL utilizable | Enlace caducado explicado | 05,12 | EN_CURSO: visual/local 02; integración pendiente |
| CTL-065 | Opcionales | Mini ventana/Drop target | Mostrar superficies opt-in | Window state / ParseImport | Usuario activa | Cerrar auxiliar no cancela descargas | 06,12 | EN_CURSO: backend 05 conectado; ver matriz de verificación 05 y límites |

## Cierre del inventario
Un aviso de éxito, un `onClick` vacío o un cambio cosmético no acredita el control. La fase 02 puede construir componentes en galería; las fases de integración conectan acciones reales. En la versión utilizable no se presentan controles ficticios como capacidades disponibles.

No omitir estados de error, foco/teclado, loading, cancelación, permisos o ausencia de runtime. Las acciones que eliminan del disco requieren comprobaciones distintas de las que quitan una entrada del historial.

## Controles del esqueleto de desarrollo — fase 01

Estos controles auxiliares no sustituyen CTL-001 a CTL-065 ni adelantan la UI completa.

| Control | Efecto real | Comprobación |
|---|---|---|
| Escritorio: estado/PID/clientes | Snapshot del runtime por backend Tauri | test-desktop.mjs; captura visual revisada |
| Escritorio: Reconectar | Aborta conexión anterior y abre handshake/suscripción | Desconexión y reconexión en test-desktop |
| Escritorio: Comprobar conexión | Ping real con respuesta correlacionada | test-desktop |
| Escritorio: Detener motor | Shutdown afecta a todos los clientes, sin relanzamiento | test-desktop y test-runtime |
| Extensión: estado y Reconectar | Handshake/suscripción por Native Messaging; error al faltar host | test-chromium y test-firefox; host desregistrado probado en Chromium |

Semántica accesible, estados ocupados/deshabilitados y foco CSS presentes. Recorrido manual exhaustivo con teclado, DPI y lector de pantalla pendiente; no se declara accesibilidad completa.


## Evidencia por control — fase 02

Las rutas siguientes son relativas a apps/desktop/src salvo extension (apps/extension/src) y tokens (packages/ui). Pruebas UI = scripts/test-ui.mjs; modelo = scripts/test-ui-model.mjs. Captura/código significa revisión visual/estática, **no** prueba del efecto futuro. VERIFICADO se limita a la interacción expresamente ejecutada. No hay backend de descargas en ningún CTL de esta fase: solo CTL-055 y los auxiliares de conexión usan el runtime real. El contrato, errores y comandos futuros de la tabla inicial se conservan.

| Control | Código | Visual | Interacción local y disponibilidad | Prueba/evidencia ejecutada | Integración pendiente |
|---|---|---|---|---|---|
| CTL-001 | App / Dialogs | Aplicación | Abrir diálogo; sin trabajo | UI: apertura + Escape + foco; Tauri: apertura | 05 |
| CTL-002 | App / model | Aplicación y galería | Filtros por nombre/dominio, estado/categoría, sitio/fecha/tamaño; limpiar | UI y tests modelo; sin datos reales aún | 06: QueryDownloads; búsqueda por ruta cuando exista |
| CTL-003 | App / model | Aplicación y galería | Filtros por nombre/dominio, estado/categoría, sitio/fecha/tamaño; limpiar | UI y tests modelo; sin datos reales aún | 06: QueryDownloads; búsqueda por ruta cuando exista |
| CTL-004 | App / model | Aplicación y galería | Filtros por nombre/dominio, estado/categoría, sitio/fecha/tamaño; limpiar | UI y tests modelo; sin datos reales aún | 06: QueryDownloads; búsqueda por ruta cuando exista |
| CTL-005 | App / appearance | Aplicación | Preferencia de vista local persistida; override por fila en sesión | UI: 1/3/20, resize, recarga | 05: configuración integrada |
| CTL-006 | App / DownloadList | Galería | Seleccionar fila/todos visibles; conservar selección al filtrar | UI: selección, filtro sin resultados y actualización | 06: datos reales |
| CTL-007 | App | Galería | Barra y quitar selección; acciones masivas deshabilitadas | UI: selección retenida; backend NO ejecutado | 05/06 |
| CTL-008 | DownloadList | Galería | Expandir/contraer por nombre; override estable | UI: checkbox/menú independientes, update mantiene foco/scroll | 05: eventos de trabajos |
| CTL-009 | DownloadList | Galería | Acciones visibles deshabilitadas con razón | Capturas y revisión de código; operación NO ejecutada | 03/05/06/12 según contrato original |
| CTL-010 | DownloadList | Galería | Acciones visibles deshabilitadas con razón | Capturas y revisión de código; operación NO ejecutada | 03/05/06/12 según contrato original |
| CTL-011 | DownloadList | Galería | Acciones visibles deshabilitadas con razón | Capturas y revisión de código; operación NO ejecutada | 03/05/06/12 según contrato original |
| CTL-012 | DownloadList | Galería | Acciones visibles deshabilitadas con razón | Capturas y revisión de código; operación NO ejecutada | 03/05/06/12 según contrato original |
| CTL-013 | DownloadList | Galería | Acciones visibles deshabilitadas con razón | Capturas y revisión de código; operación NO ejecutada | 03/05/06/12 según contrato original |
| CTL-014 | DownloadList | Galería | Acciones visibles deshabilitadas con razón | Capturas y revisión de código; operación NO ejecutada | 03/05/06/12 según contrato original |
| CTL-015 | DownloadList | Galería | Acciones visibles deshabilitadas con razón | Capturas y revisión de código; operación NO ejecutada | 03/05/06/12 según contrato original |
| CTL-016 | DownloadList / Dialogs | Galería | Abrir confirmación separada de historial; borrar deshabilitado | Revisión de código; borrado NO ejecutado | 06/12: validar propiedad/ruta |
| CTL-017 | DownloadList | Galería | Acciones visibles deshabilitadas con razón | Capturas y revisión de código; operación NO ejecutada | 03/05/06/12 según contrato original |
| CTL-018 | DownloadList | Galería | Details nativo plegable; datos públicos de muestra | Capturas/código; backend NO ejecutado | 05/12 |
| CTL-019 | DownloadList | Galería | SVG estático limitado a 60 muestras y texto de estado/velocidad | Matriz capturas; no medición runtime | 05/14 |
| CTL-020 | Dialogs / model | Aplicación y galería | Validar nombre Windows/URL localmente; URL oculta por defecto | UI y modelo: nombres reservados, traversal, esquema/credenciales | 05: validación definitiva backend |
| CTL-021 | Dialogs | Aplicación | Categoría editable local; elegir carpeta deshabilitado | Captura; permisos/disco NO probados | 05/06 |
| CTL-022 | Dialogs | Aplicación | Metadatos desconocidos, sin petición de red | Captura/código | 03/05 |
| CTL-023 | Dialogs | Aplicación | Avanzado plegable; prioridad local; conexiones/límite/proxy/datos deshabilitados | Captura/código; efectos NO probados | 04/05/11/12 |
| CTL-024 | Dialogs | Aplicación | Botones deshabilitados con explicación; no se crea trabajo | UI: Descargar ahora deshabilitado; código resto | 05/06/07 |
| CTL-025 | Dialogs | Aplicación | Botones deshabilitados con explicación; no se crea trabajo | UI: Descargar ahora deshabilitado; código resto | 05/06/07 |
| CTL-026 | Dialogs | Aplicación | Botones deshabilitados con explicación; no se crea trabajo | UI: Descargar ahora deshabilitado; código resto | 05/06/07 |
| CTL-027 | Dialogs / Modal | Aplicación | Cancelar/Escape descarta solo borrador local | UI: Tab/validación/Escape/retorno de foco | 05/07: captura transaccional |
| CTL-028 | Dialogs | Galería | Radio renombrar/sobrescribir; aviso; reanudar deshabilitado; cancelar sin IO | UI: sobrescribir muestra aviso, confirmación bloqueada y Escape | 03/05: resolución durable/validada |
| CTL-029 | Dialogs | Galería | Radio renombrar/sobrescribir; aviso; reanudar deshabilitado; cancelar sin IO | UI: sobrescribir muestra aviso, confirmación bloqueada y Escape | 03/05: resolución durable/validada |
| CTL-030 | Dialogs | Galería | Radio renombrar/sobrescribir; aviso; reanudar deshabilitado; cancelar sin IO | UI: sobrescribir muestra aviso, confirmación bloqueada y Escape | 03/05: resolución durable/validada |
| CTL-031 | Dialogs | Galería | Radio renombrar/sobrescribir; aviso; reanudar deshabilitado; cancelar sin IO | UI: sobrescribir muestra aviso, confirmación bloqueada y Escape | 03/05: resolución durable/validada |
| CTL-032 | Settings: FirstRunWizard | Galería | Pasos, Atrás/Siguiente/Omitir; organización/AutoPick locales; destino sin elegir | UI: pasos conservan elección al volver; captura; instalar/persistir NO probado | 05/06/07/08/13 |
| CTL-033 | Settings: FirstRunWizard | Galería | Pasos, Atrás/Siguiente/Omitir; organización/AutoPick locales; destino sin elegir | UI: pasos conservan elección al volver; captura; instalar/persistir NO probado | 05/06/07/08/13 |
| CTL-034 | Settings: FirstRunWizard | Galería | Pasos, Atrás/Siguiente/Omitir; organización/AutoPick locales; destino sin elegir | UI: pasos conservan elección al volver; captura; instalar/persistir NO probado | 05/06/07/08/13 |
| CTL-035 | Settings: FirstRunWizard | Galería | Pasos, Atrás/Siguiente/Omitir; organización/AutoPick locales; destino sin elegir | UI: pasos conservan elección al volver; captura; instalar/persistir NO probado | 05/06/07/08/13 |
| CTL-036 | gallery/Surfaces: QueueEditor | Galería | Nombre/opciones y orden local; CRUD/ejecución deshabilitados; aviso Windows despierto | UI: reordenar muestra; captura; scheduler NO probado | 06 |
| CTL-037 | gallery/Surfaces: QueueEditor | Galería | Nombre/opciones y orden local; CRUD/ejecución deshabilitados; aviso Windows despierto | UI: reordenar muestra; captura; scheduler NO probado | 06 |
| CTL-038 | gallery/Surfaces: QueueEditor | Galería | Nombre/opciones y orden local; CRUD/ejecución deshabilitados; aviso Windows despierto | UI: reordenar muestra; captura; scheduler NO probado | 06 |
| CTL-039 | gallery/Surfaces: RuleEditor | Galería | Editar extensión/categoría; previsualizar solo archivo reservado de ejemplo | UI: coincidencia/no coincidencia; guardar/evaluar runtime NO probado | 06 |
| CTL-040 | gallery/Surfaces: RuleEditor | Galería | Editar extensión/categoría; previsualizar solo archivo reservado de ejemplo | UI: coincidencia/no coincidencia; guardar/evaluar runtime NO probado | 06 |
| CTL-041 | Sin implementación 02 | PLANIFICADO | Importación TXT/CSV/múltiples no adelantada; drop parcial en CTL-065 | No ejecutada | 06 |
| CTL-042 | appearance / Settings / tokens | Aplicación | Sistema/Claro/Oscuro; preferencia local; CSS responde al SO | UI: emulación esquema/movimiento reducido; Tauri: temas reales | 05: integrar preferencias runtime si procede |
| CTL-043 | Settings | Aplicación | Secciones completas, controles no disponibles explicados/deshabilitados | Captura Ajustes + revisión de secciones; efectos NO probados | 04–13 según contrato original |
| CTL-044 | Settings | Aplicación | Secciones completas, controles no disponibles explicados/deshabilitados | Captura Ajustes + revisión de secciones; efectos NO probados | 04–13 según contrato original |
| CTL-045 | Settings | Aplicación | Secciones completas, controles no disponibles explicados/deshabilitados | Captura Ajustes + revisión de secciones; efectos NO probados | 04–13 según contrato original |
| CTL-046 | Settings | Aplicación | Secciones completas, controles no disponibles explicados/deshabilitados | Captura Ajustes + revisión de secciones; efectos NO probados | 04–13 según contrato original |
| CTL-047 | Settings | Aplicación | Secciones completas, controles no disponibles explicados/deshabilitados | Captura Ajustes + revisión de secciones; efectos NO probados | 04–13 según contrato original |
| CTL-048 | Settings | Aplicación | Secciones completas, controles no disponibles explicados/deshabilitados | Captura Ajustes + revisión de secciones; efectos NO probados | 04–13 según contrato original |
| CTL-049 | Settings / App | Aplicación | Mostrar estadísticas opt-in local solo en sesión, vacío sin recopilar; historial/privado deshabilitados | Captura/código; retención NO probada | 06/12 |
| CTL-050 | Settings / gallery/Surfaces | Aplicación / galería | Ajustes deshabilitados; auxiliares opt-in solo galería | Captura; integración SO NO probada | 06/12 |
| CTL-051 | Settings / gallery/Surfaces | Aplicación / galería | Ajustes deshabilitados; aviso explícito de ejemplo sin releases | Captura; actualizador NO probado | 13 |
| CTL-052 | Settings / gallery/Surfaces | Aplicación / galería | Ajustes deshabilitados; aviso explícito de ejemplo sin releases | Captura; actualizador NO probado | 13 |
| CTL-053 | Sin bandeja 02 | PLANIFICADO | No se añade bandeja; Detener motor del esqueleto sigue funcionando | No prueba de bandeja; shutdown en test-desktop | 05/07/13 |
| CTL-054 | Sin bandeja 02 | PLANIFICADO | No se añade bandeja; Detener motor del esqueleto sigue funcionando | No prueba de bandeja; shutdown en test-desktop | 05/07/13 |
| CTL-055 | extension/popup + background | Popup real | Handshake/snapshot/reconectar conservados; badge/trabajos pendientes | Chromium y Firefox Native Messaging reales; captura claro/oscuro | 07/08: badge/trabajos |
| CTL-056 | extension/popup | Popup real | AutoPick/excepción/Abrir IDG deshabilitados; motivo visible; sin contadores ficticios | Captura y regresión conexión; acciones NO probadas | 07/08 |
| CTL-057 | extension/popup | Popup real | AutoPick/excepción/Abrir IDG deshabilitados; motivo visible; sin contadores ficticios | Captura y regresión conexión; acciones NO probadas | 07/08 |
| CTL-058 | Sin captura 02 | PLANIFICADO | Sin menú contextual ni intercepción prematura | No ejecutada | 07/08 |
| CTL-059 | Sin captura 02 | PLANIFICADO | Sin menú contextual ni intercepción prematura | No ejecutada | 07/08 |
| CTL-060 | gallery/Surfaces: MediaButton | Galería | Abrir selector y ocultar/restaurar botón sobre reproductor de muestra | UI: modal anidado, Escape, ocultar; captura | 09: detección/asociación real |
| CTL-061 | gallery/Surfaces: MediaButton | Galería | Calidad/modo/procesamiento local; estimación marcada; descarga deshabilitada; aviso DRM/pérdida | Captura/código; formatos/FFmpeg NO probados | 09/10 |
| CTL-062 | gallery/Surfaces: MediaButton | Galería | Calidad/modo/procesamiento local; estimación marcada; descarga deshabilitada; aviso DRM/pérdida | Captura/código; formatos/FFmpeg NO probados | 09/10 |
| CTL-063 | DownloadList | Galería | Archivo no encontrado tachado; acciones deshabilitadas | Muestras/código; localización/redescarga NO probadas | 05/12 |
| CTL-064 | DownloadList | Galería | Archivo no encontrado tachado; acciones deshabilitadas | Muestras/código; localización/redescarga NO probadas | 05/12 |
| CTL-065 | gallery/Surfaces: AuxiliaryViews | Galería | Activar/cerrar componentes, pegar/arrastrar URL muestra solo host; sin descarga | Captura/código; drag SO y ventanas nativas NO probados | 06/12 |

### Superficies UX

UX-01 asistente (galería); UX-02 shell real y estados; UX-03 filas (galería); UX-04 diálogo real sin envío; UX-05 conflicto (galería); UX-06 colas/reglas (galería, importación futura); UX-07 Ajustes real con disponibilidad explícita; UX-08 popup real, captura futura; UX-09 componente multimedia (galería); UX-10 errores/avisos (galería y error de conexión real); UX-11 componentes opcionales (galería). La bandeja/gestión de X pertenece a sus fases y no se simula.

## Transición de fase 03

No se habilitan nuevos controles gráficos. El backend de iniciar/pausar/reanudar/cancelar existe y se prueba por `idg-probe`, sin declarar VERIFICADO el recorrido de los botones correspondientes. Nueva descarga, acciones de fila/masivas y configuración del motor conservan la disponibilidad explícita de fase 02; conexión, ping y reconexión sí se vuelven a probar. Las filas de muestra permanecen exclusivamente en la galería. El cierre autorizado de fase 02 aumentó 1 px la escala tipográfica compartida, sin cambiar layout, paleta ni zoom.

## Transición de fase 04

El motor incorpora modo Automático/manual, límites y prioridades por IPC de desarrollo; no se habilitan los controles gráficos correspondientes hasta conectarlos de extremo a extremo en su fase. La UI aprobada y la escala tipográfica se conservan. `active_requests` significa solicitudes HTTP en curso, no conexiones TCP. Pruebas de CLI/core no equivalen a pruebas de esos botones.

### Incremento inicial de fase 05

Nueva descarga: campos URL/nombre/carpeta y opciones del motor conectados a backend; Descargar ahora comprobado en Tauri real automatizado con archivo/hash. Elegir carpeta: implementación nativa compilada, interacción del selector pendiente. Después/Cola, conflictos y acciones de filas: todavía pendientes. La lista recibe snapshots/eventos reales; las pruebas de galería no se presentan como comprobación del motor.

## Matriz vigente de fase 05

Las tablas de 02 son evidencia histórica visual. Esta matriz sustituye su estado pendiente para los controles conectados, sin atribuir pruebas no realizadas. V = visual, L = interacción local, B = backend real. «Sí» en B acredita implementación, no por sí solo verificación de todos sus caminos.

| Controles | V / L / B | Código y operación real | Comprobación ejecutada / pendiente |
|---|---|---|---|
| CTL-001, 020, 024 | Sí / Sí / Sí | Dialogs.tsx → desktop.ts → CreateDownload; UUID y recibo durable | Tauri: formulario, un GET, doble clic, hash, reintento mismo recibo tras modificar opciones. |
| CTL-002, 003, 004 | Sí / Sí / Sí (lectura) | App.tsx/model.ts filtran snapshots por nombre/dominio/estado/categoría/fecha/tamaño; no URL privada ni consulta ficticia | Tres pruebas modelo y galería combinada; lista Tauri con trabajos reales. Búsqueda avanzada 06 pendiente. |
| CTL-005, 042 | Sí / Sí / Sí | AppPreferences guarda vista/tema; appearance.ts sin persistencia web en producción | Galería persistencia visual; Tauri reapertura conserva tema. |
| CTL-006, 008 | Sí / Sí / No necesario | Selección/expansión locales en App/DownloadList con IDs estables | Galería comprueba foco/scroll/override; progreso Tauri mantiene filas. |
| CTL-007 | Sí / Sí / Sí | Acciones masivas solo sobre estados compatibles, órdenes individuales tipadas y errores | Backend pausa/resume/cancel probado; recorrido múltiple UI específico pendiente. Gestión avanzada 06 pendiente. |
| CTL-009, 010 | Sí / Sí / Sí | PauseDownload/ResumeDownload; estado confirmado por eventos | Tauri pausa durable, bytes detenidos y recuperación/hash. |
| CTL-011 | Sí / Sí / Sí | CancelDownload, sin confundir borrar historial/disco | HTTP/runtime cancelación y respuestas tardías; confirmación visual de cancelación específica pendiente. |
| CTL-012 | Sí / Sí / Sí | ResumeDownload conserva parcial; PublishPending reintenta publicar sin otra transferencia | Tauri destino bloqueado, archivo original intacto, desbloqueo/publicación sin GET extra. |
| CTL-013, 015, 016, 017, 064 | Sí / No disponible / No | Abrir archivo, quitar historial, borrar disco, editar organización y descargar de nuevo permanecen deshabilitados con motivo | DIFERIDOS a 06/12 según contrato; no se presentan como acciones terminadas. |
| CTL-014 | Sí / Sí / Parcial | reveal_download valida carpeta del trabajo en Rust y usa ShellExecuteW explore | Tauri y consulta Shell verifican Explorer en carpeta propia correcta. Copiar ruta DIFERIDO. |
| CTL-018, 019 | Sí / Sí / Sí | Snapshots: estrategia, solicitudes, durable/hash; BigInt, velocidad delta, 60 muestras, 250 ms | Tauri progreso real, pausado/desconectado sin velocidad; galería estabilidad. No muestras aleatorias en producto. |
| CTL-021 | Sí / Sí / Sí | choose_download_folder, categoría CreateDownload | Tauri destino/categoría editados y guardados; selector OS IMPLEMENTADO_NO_VERIFICADO manualmente. FileIo/destino bloqueado probados. |
| CTL-022 | Sí / Sí / Sí tras aceptar | Antes de aceptar: desconocido, sin consumir URL; después: capacidades del snapshot | Tauri cero peticiones durante edición; pruebas HTTP de rangos/validadores/no preflight. |
| CTL-023 | Sí / Sí / Sí parcial | Automático/manual 1–32, límite, prioridad, replay_safe explícito falso inicial | Runtime recursos/segmentación y recibo tras cambiar prioridad; proxy/autenticación avanzada DIFERIDOS. |
| CTL-025, 026 | Sí / Sí / Sí | CreateDownload start Later/Queue persistente | Tauri no GET antes de inicio, cola termina/hash; caída antes de respuesta recupera pausado sin repetir petición. |
| CTL-027, 031 | Sí / Sí / Sí (sin alta) | Cerrar/Escape cancela borrador; bloqueado mientras espera aceptación | Tauri conflicto cancelado conserva campos/archivo; galería foco/Escape. No hay captura del navegador que liberar todavía. |
| CTL-028 | Sí / Sí / Sí | ResolveConflict por CreateDownload con rename | Core reserva nombre; camino UI positivo específico pendiente. |
| CTL-029 | Sí / Sí / Sí | replace explícito, publicación segura | Tauri reemplazo con destino bloqueado y reintento; original conservado hasta publicación. |
| CTL-030 | Sí / Sí / Sí | FindRecoverableDownload comprueba URL, identidad, parcial/hash y validador; luego ResumeDownload | Core rechaza mismo nombre sin prueba, URL distinta y bytes alterados; Tauri deshabilita resume no validado. Camino positivo desde conflicto pendiente. |
| CTL-032, 033 | Sí / Sí / Sí parcial | Asistente y carpeta Known Folder → preferencias DPAPI | Tauri completa y no reaparece tras reabrir; organizar por tipo pendiente 06. |
| CTL-034 | Sí / Sí / Sí (estado) | detect_browsers y native_hosts; detectado no acredita carga, conexión solo con host real | Paso Omitir ejecutado; puentes Chromium/Firefox verificados aparte. No botón/URL de tienda ficticio. |
| CTL-035, 045 | Sí / Sí / Sí (preferencia) | always/ask/browser validados y guardados; etiqueta captura pendiente | Asistente guarda; captura/excepciones efectivas DIFERIDAS a 07/08. |
| CTL-036, 038–041 | Galería / Local / No | Editores avanzados de colas, horarios/reglas/importación | DIFERIDOS a 06; las muestras no alteran historial real. Drop simple corresponde a CTL-065. |
| CTL-037 | Sí / Sí / Sí parcial | Cola básica queue_running; capacidad runtime; detener no pausa activos | Tauri iniciar cola/hash; reordenar y varias colas pendientes 06. |
| CTL-043 | Sí / Sí / Sí parcial | close_action hide/exit/ask, ciclo lifecycle.rs | SC_CLOSE ocultó sin detener; salida coordinada y reapertura probadas. Menú/clic físicos pendientes. Inicio Windows pendiente 13. |
| CTL-044 | Sí / Sí / Sí | Carpeta AppPreferences y ResourceLimits runtime | DPAPI/migración, límites motor y carpeta/asistente probados; selector nativo pendiente. |
| CTL-048 | Sí / Sí / Sí | Fin/error configurables; avisos internos con ver trabajo/abrir carpeta; notify_download valida estado, deduplica/frecuencia | Código ejecutado en E2E al completar; entrega nativa/silencio visual no comprobados. Sin sonidos configurados; sin prometer acciones de toast Windows. |
| CTL-050, 065 | Sí / Sí / Sí parcial | Mini/drop opt-in, ventanas independientes con permisos mínimos | Tauri mini muestra mismo trabajo y rechaza prefs; drop DOM abre diálogo sin alta. Arrastre físico pendiente; portapapeles no vigilado. |
| CTL-053 | Nativa / Sí / Sí parcial | Bandeja única: mostrar/nueva/pausar todas/reanudar pausadas | Instancia única y misma ventana comprobadas por reapertura del ejecutable. Selección física del menú pendiente; AutoPick captura deshabilitado. |
| CTL-054 | Nativa / Sí / Sí | request_exit → confirmación → Shutdown/checkpoints | Mismo cierre coordinado probado desde acción del escritorio; selección física en bandeja pendiente. No apaga Windows. |
| CTL-055–059 | Conexión / Sí / Solo puente | Host mantiene permisos mínimos anteriores | Chromium/Firefox reales automatizados, sin captura ni gestión de descargas de extensión. |

Rutas base: [frontend](../apps/desktop/src/App.tsx), [diálogos](../apps/desktop/src/Dialogs.tsx), [filas](../apps/desktop/src/DownloadList.tsx), [IPC/presentación](../apps/desktop/src/desktop.ts), [ciclo de vida](../apps/desktop/src-tauri/src/lifecycle.rs), [runtime](../crates/idg-runtime/src/downloads.rs), [E2E](../scripts/test-app-download.mjs). Errores se conservan en formulario/fila; no se reemplazan por éxito optimista. [Checklist manual pendiente](APP_DEVELOPMENT.md).
