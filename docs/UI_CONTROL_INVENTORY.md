# Inventario de controles de IDG

Contrato inicial ampliado. **Todos figuran PLANIFICADO**; esta lista no prueba que exista código. Los nombres de comandos son contratos orientativos que se deben ajustar al protocolo real, no API ya implementadas.

Leer [INTERFAZ.md](INTERFAZ.md) y [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md). Al implementar, añadir ruta de código, error exacto y prueba/evidencia real a cada fila. Los grupos (por ejemplo límites o filtros) se desglosan en controles individuales al construir su pantalla, sin eliminar ningún elemento del grupo.

| ID | Pantalla | Control | Acción esperada | Comando / lógica propuestos | Disponibilidad / error | Criterio de prueba | Fases | Estado |
|---|---|---|---|---|---|---|---|---|
| CTL-001 | Principal | Nueva descarga | Abrir el diálogo compartido | Estado UI / AddDownload al confirmar | Runtime disponible o error de conexión claro | UX-04 abre sin iniciar trabajo | 02,05 | PLANIFICADO |
| CTL-002 | Principal | Sidebar: estados y categorías | Filtrar conservando foco | QueryDownloads | Vista disponible | Cada sección muestra sus resultados reales | 02,06 | PLANIFICADO |
| CTL-003 | Principal | Buscador global | Buscar por texto permitido | QueryDownloads | Sin exponer secretos | Nombre/dominio/ruta y vacío de resultados | 02,06 | PLANIFICADO |
| CTL-004 | Principal | Filtros y Limpiar | Aplicar/restablecer filtros | QueryDownloads | Filtros válidos | Fecha/tamaño/sitio/estado combinados | 02,06 | PLANIFICADO |
| CTL-005 | Principal | Vista Automática/Compacta/Expandida | Persistir preferencia de vista | UpdateSettings + estado UI | Siempre | 1/3/20 filas y override manual | 02,05 | PLANIFICADO |
| CTL-006 | Principal | Seleccionar una/varias/todas | Cambiar selección sin ejecutar acciones | Estado UI | Filas seleccionables | Teclado y alcance de selección claros | 02,06 | PLANIFICADO |
| CTL-007 | Principal | Barra de acciones masivas | Operar solo trabajos compatibles | BatchCommand | Selección válida | Resumen parcial sin éxito falso | 02,06 | PLANIFICADO |
| CTL-008 | Fila | Expandir/contraer | Revelar datos sin reiniciar descarga | Estado UI | Siempre | No se dispara por checkbox o Pausar | 02,05 | PLANIFICADO |
| CTL-009 | Fila | Pausar | Pausar realmente o advertir límites | Pause | Trabajo activo y política válida | Transferencia detenida; estado persistente | 03,05 | PLANIFICADO |
| CTL-010 | Fila | Reanudar | Continuar con validadores seguros | Resume | Recuperación validada | No mezclar representaciones distintas | 03,05 | PLANIFICADO |
| CTL-011 | Fila | Cancelar | Cancelar según confirmación aplicable | Cancel | Trabajo cancelable | Estado/temporales coherentes | 03,05 | PLANIFICADO |
| CTL-012 | Fila | Reintentar | Recrear intento con estado seguro | Retry | Error recuperable | Error explicado si enlace vencido | 03,05 | PLANIFICADO |
| CTL-013 | Fila | Abrir archivo | Abrir solo por acción explícita | OpenDownloadedFile | Archivo completado y presente | No autoejecutar al completar | 05,12 | PLANIFICADO |
| CTL-014 | Fila | Abrir carpeta / Copiar ruta | Ubicar o copiar destino | RevealFile / CopyPath | Ruta válida | No apuntar a archivo ajeno | 05,12 | PLANIFICADO |
| CTL-015 | Fila | Menú: quitar del historial | Quitar registro sin borrar el archivo | RemoveHistory | Estado permite retirar registro | Archivo del disco permanece | 06,12 | PLANIFICADO |
| CTL-016 | Fila | Menú: eliminar del disco | Eliminar solo con confirmación específica | DeleteDownloadedFile | Propiedad/ruta confirmadas | Archivo enumerado y cancelación segura | 06,12 | PLANIFICADO |
| CTL-017 | Fila | Cambiar prioridad/cola/categoría | Actualizar trabajo real | UpdateDownload | Cambio permitido por estado | Persistencia tras reiniciar | 06 | PLANIFICADO |
| CTL-018 | Fila | Detalles técnicos | Ver campos técnicos redactados | GetDownloadDetails | Datos disponibles | Sin cookies/tokens en DOM ni logs | 02,05,12 | PLANIFICADO |
| CTL-019 | Fila | Gráfica y resumen accesible | Mostrar medidas reales sin interpolación engañosa | Runtime metrics | Muestras disponibles | Pausa/desconexión sin curva ficticia | 02,05,14 | PLANIFICADO |
| CTL-020 | Nueva descarga | Nombre y URL | Editar y validar entrada | ValidateDownloadInput | Formato admitido | Nombre peligroso y URL inválida rechazados | 02,05 | PLANIFICADO |
| CTL-021 | Nueva descarga | Elegir carpeta/categoría | Seleccionar destino y clasificación | PickFolder / UpdateDraft | Destino válido | Error de permisos/espacio visible | 05,06 | PLANIFICADO |
| CTL-022 | Nueva descarga | Metadatos/reanudabilidad | Mostrar consulta y capacidad comprobada | ProbeDownload | Solicitud autorizada | Desconocido distinto de disponible | 03,05 | PLANIFICADO |
| CTL-023 | Nueva descarga | Avanzado | Conexiones/límite/prioridad/proxy | UpdateDraft | Opciones soportadas | Valores validados; secretos protegidos | 04,05,11 | PLANIFICADO |
| CTL-024 | Nueva descarga | Descargar ahora | Aceptar trabajo durable y cerrar | AddDownload / CommitCapture | Datos válidos y runtime confirma | Modal conserva datos si falla | 05,07 | PLANIFICADO |
| CTL-025 | Nueva descarga | Descargar después | Crear trabajo diferido sin arrancarlo | AddDeferredDownload | Datos válidos | No se inicia silenciosamente | 05,06 | PLANIFICADO |
| CTL-026 | Nueva descarga | Añadir a cola | Crear según política de la cola | EnqueueDownload | Cola válida | Horario/orden realmente respetados | 05,06 | PLANIFICADO |
| CTL-027 | Nueva descarga | Cancelar / Escape | Descartar borrador con recuperación segura | CancelCapture / estado UI | No compromiso irreversible | Navegador no pierde alternativa | 05,07 | PLANIFICADO |
| CTL-028 | Conflicto | Renombrar automáticamente | Proponer y reservar nombre único | ResolveConflictRename | Destino válido | Carrera con archivo existente | 05 | PLANIFICADO |
| CTL-029 | Conflicto | Sobrescribir | Confirmar reemplazo seguro | ResolveConflictReplace | Confirmación del usuario | No destruir archivo válido antes de tiempo | 05 | PLANIFICADO |
| CTL-030 | Conflicto | Reanudar | Usar parcial identificado por el motor | ResolveConflictResume | Identidad/metadatos verificables | Mismo nombre no basta | 03,05 | PLANIFICADO |
| CTL-031 | Conflicto | Cancelar | No crear ni borrar contenido | CancelDraft | Diálogo abierto | Archivo previo permanece | 05 | PLANIFICADO |
| CTL-032 | Asistente | Comenzar/Atrás/Siguiente | Navegar sin perder preferencias | Wizard state | Paso válido | Reabrir asistente con datos guardados | 02,05 | PLANIFICADO |
| CTL-033 | Asistente | Carpeta/organizar por tipo | Elegir destino y opt-in | UpdateSettings | Ruta válida | Known Folder; sin ruta personal fija | 05,06 | PLANIFICADO |
| CTL-034 | Asistente | Instalar extensión/Omitir | Abrir destino oficial o guía de desarrollo | OpenTrustedExtensionLink | Destino real configurado | Detectado no equivale a conectado | 05,08,13 | PLANIFICADO |
| CTL-035 | Asistente | AutoPick/Terminar | Persistir modo inicial elegido | UpdateSettings | Elección válida | Tres modos guardados realmente | 05,07 | PLANIFICADO |
| CTL-036 | Colas | Crear/editar/eliminar cola | Administrar cola y destino de trabajos | Queue CRUD | Sin pérdida de trabajos | Confirmación al afectar descargas | 06 | PLANIFICADO |
| CTL-037 | Colas | Iniciar/pausar/reordenar | Controlar secuencia real | QueueCommand | Trabajos compatibles | Orden y máximo simultáneo comprobados | 06 | PLANIFICADO |
| CTL-038 | Colas | Horario y acción al terminar | Programar y advertir apagado | UpdateSchedule | Runtime activo y opción válida | No prometer descarga con PC apagada | 06 | PLANIFICADO |
| CTL-039 | Reglas | Añadir/editar/activar/priorizar | Organizar por condiciones soportadas | Rule CRUD | Regla válida | Persistencia y conflictos explicados | 06 | PLANIFICADO |
| CTL-040 | Reglas | Previsualizar | Explicar resultado sin efectos | EvaluateRulePreview | Datos de ejemplo claros | No mover/borrar por previsualizar | 06 | PLANIFICADO |
| CTL-041 | Importar | Pegar varias/TXT/CSV/soltar enlace | Validar lista antes de crear | ParseImport / AddDownloads | Entradas admitidas | Errores por entrada; no ejecutar texto | 06 | PLANIFICADO |
| CTL-042 | Ajustes | Tema Claro/Oscuro/Sistema | Cambiar tema y persistir | UpdateSettings | Siempre | Cambio de Windows conserva foco/vista | 02,05 | PLANIFICADO |
| CTL-043 | Ajustes | Acción de X/inicio con Windows | Configurar comportamiento reversible | UpdateSettings / OS integration | Capacidad disponible | Cerrar realmente detiene runtime cuando corresponde | 05,13 | PLANIFICADO |
| CTL-044 | Ajustes | Carpeta/límites/simultáneas | Cambiar valores efectivos | UpdateSettings | Rangos válidos | Motor aplica y conserva valores | 04,05,06 | PLANIFICADO |
| CTL-045 | Ajustes | AutoPick/excepciones/formato/tamaño | Cambiar captura efectiva | UpdateSettings | Sincronización disponible o diferida clara | Sitios ignorados permanecen en navegador | 07,08 | PLANIFICADO |
| CTL-046 | Ajustes | Proxy y autenticación avanzada | Usar configuración segura | UpdateConnectionSettings | Protocolos soportados | Ruta y credenciales sin fugas | 11,12 | PLANIFICADO |
| CTL-047 | Ajustes | Multimedia/calidad/formato/FFmpeg | Guardar valores compatibles | UpdateMediaSettings | Capacidad detectada | No ofrecer codec inexistente | 09,10 | PLANIFICADO |
| CTL-048 | Ajustes | Notificaciones y sonidos | Guardar eventos/sonidos opt-in | UpdateSettings | Sistema disponible | Respetar apagado y evitar tormentas | 05,12 | PLANIFICADO |
| CTL-049 | Ajustes | Historial/modo privado/estadísticas | Aplicar política real de retención | UpdatePrivacySettings | Consentimiento aplicable | Sin historial privado residual indebido | 06,12 | PLANIFICADO |
| CTL-050 | Ajustes | Portapapeles/ventanas flotantes | Activar capacidades opcionales | UpdateSettings | Opt-in | Desactivar detiene monitorización | 06,12 | PLANIFICADO |
| CTL-051 | Ajustes | Buscar actualizaciones automático/manual | Consultar versión sin instalar | CheckForUpdates | Red/configuración real | Sin nuevas versiones falsas | 13 | PLANIFICADO |
| CTL-052 | Actualización | Más tarde / Actualizar y reiniciar | Aceptar instalación verificada o posponer | UpdateCoordinator | Firma válida y usuario acepta | Rechazo/fallo/descargas activas seguros | 13 | PLANIFICADO |
| CTL-053 | Bandeja | Abrir/nueva/pausar/reanudar/AutoPick | Controlar runtime desde bandeja | Tray commands | Runtime accesible | Estado sincronizado con ventana | 05,07 | PLANIFICADO |
| CTL-054 | Bandeja | Salir | Detener aplicación tras advertir | ShutdownRuntime | Confirmación aplicable | No reactivar host en bucle | 05,13 | PLANIFICADO |
| CTL-055 | Extensión | Estado/badge/icono | Reflejar conexión y trabajos reales | Runtime events | Handshake real | Sin timer ficticio ni datos stale como actuales | 01,07,08 | PLANIFICADO |
| CTL-056 | Extensión | AutoPick global/por sitio | Cambiar modo efectivo | UpdateSettings | Permisos válidos | Reconexión y opción persistente | 07,08 | PLANIFICADO |
| CTL-057 | Extensión | Controles de trabajos/Abrir IDG | Actuar sobre mismo trabajo del escritorio | Native commands | Host disponible | Error si app ausente; no éxito ficticio | 07,08 | PLANIFICADO |
| CTL-058 | Extensión | Usar navegador | Conservar vía funcional sin recaptura | ReleaseCapture | Captura no comprometida | POST/blob/no transferible con fallback | 07,08 | PLANIFICADO |
| CTL-059 | Extensión | Menú contextual de enlace/medio | Solicitar captura del recurso pertinente | PrepareCapture | Enlace/medio compatible | No crear menú invasivo en todo elemento | 07,08 | PLANIFICADO |
| CTL-060 | Multimedia | Botón Descargar y ocultar | Mostrar medios asociados/configurar visibilidad | MediaCandidates / UpdateSettings | Detección real | No tapar controles ni atribuir otro video | 09 | PLANIFICADO |
| CTL-061 | Multimedia | Calidad/pistas/modo/formato | Elegir combinación compatible | ValidateMediaSelection | Medio compatible sin DRM | Tamaño estimado identificado y pistas válidas | 09,10 | PLANIFICADO |
| CTL-062 | Multimedia | Conservar original / Convertir | Distinguir copia y recodificación | MediaJobSpec | FFmpeg/capacidad disponibles | Aviso de pérdida y archivo original preservado | 10 | PLANIFICADO |
| CTL-063 | Historial | Localizar archivo | Asociar ruta solo tras validación | LocateDownloadedFile | Archivo accesible | No decir eliminado si solo no se encuentra | 12 | PLANIFICADO |
| CTL-064 | Historial | Descargar de nuevo | Crear nuevo intento confirmado | Redownload | URL utilizable | Enlace caducado explicado | 05,12 | PLANIFICADO |
| CTL-065 | Opcionales | Mini ventana/Drop target | Mostrar superficies opt-in | Window state / ParseImport | Usuario activa | Cerrar auxiliar no cancela descargas | 06,12 | PLANIFICADO |

## Cierre del inventario
Un aviso de éxito, un `onClick` vacío o un cambio cosmético no acredita el control. La fase 02 puede construir componentes en galería; las fases de integración conectan acciones reales. En la versión utilizable no se presentan controles ficticios como capacidades disponibles.

No omitir estados de error, foco/teclado, loading, cancelación, permisos o ausencia de runtime. Las acciones que eliminan del disco requieren comprobaciones distintas de las que quitan una entrada del historial.
