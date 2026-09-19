# Arquitectura propuesta y contratos que hay que comprobar

Las decisiones de fase 00 y sus hipótesis de validación están en [ADR](decisions/README.md); la asignación a fases está en [Trazabilidad](TRACEABILITY.md). Documentación no equivale a implementación.

## 1. Procesos y responsabilidades

```text
Extensión Chromium / Firefox
        │ Native Messaging
        ▼
idg-native-host.exe (pueden existir varios, uno por conexión)
        │ named pipe local protegido
        ▼
idg-runtime.exe (una instancia efectiva por usuario)
        ├── idg-core: trabajos, red, segmentos, reintentos, colas
        ├── almacenamiento SQLite y credenciales protegidas
        ├── adaptador Windows: bandeja, archivos, energía
        └── idg-media: manifiestos, FFmpeg/ffprobe
        ▲
        │ mismo protocolo tipado sobre named pipe
IDG Desktop: backend Tauri 2 ⇄ React / TypeScript
```

El runtime es un proceso de usuario, **no un servicio de Windows elevado**. Sigue funcionando al cerrar/minimizar la ventana o el navegador. No tener un motor independiente en cada native host ni un segundo escritor de base de datos. Mantener la lógica de bandeja en un único propietario; no crear dos iconos o bucles de inicio. La UI puede liberarse cuando no se necesita, si su ciclo de vida está comprobado; ocultar una WebView no demuestra que haya liberado su memoria.

El host nativo traduce framing y mensajes. No controla por sí solo la vida de las descargas. Cerrar su stdin por cierre del navegador no mata el runtime. «Salir completamente» es un comando explícito, con checkpoints y supresión del autoreinicio hasta nueva acción autorizada.

**Prueba temprana obligatoria:** antes de desarrollar funciones extensas, compilar UI/runtime/host mínimos y verificar handshake real con Chromium y Firefox. La autorización y el registro difieren entre navegadores. Registrar evidencia y restricciones en una ADR, sin afirmar que la matriz entera está validada. Referencias [S03], [S04], [S06].

## 2. Organización sugerida del repositorio

```text
AGENTS.md
Cargo.toml
Cargo.lock
rust-toolchain.toml
package.json
pnpm-workspace.yaml
pnpm-lock.yaml
apps/
  desktop/                 # React, Vite y src-tauri
  extension/               # implementación compartida + manifests/adaptadores
crates/
  idg-core/                # sin dependencia de Tauri/React
  idg-storage/             # SQLite, migraciones, transacciones
  idg-protocol/            # comandos, eventos y versiones de esquema
  idg-runtime/             # orquestación e instancia única
  idg-native-host/         # framing de Native Messaging
  idg-platform-windows/    # pipes, bandeja, archivos, firma, energía
  idg-media/               # crea este módulo al llegar a multimedia
packages/
  shared-types/            # tipos generados, no duplicados a mano
  ui/                      # solo si hay reutilización real
fixtures/
  http/ ftp/ media/        # contenido de prueba creado/autorizado
scripts/
docs/
.github/workflows/
```

No crear docenas de módulos vacíos por anticipación. Ajustes menores están permitidos con ADR y actualización de rutas. Usar un solo gestor JS, preferentemente pnpm; adaptar al existente si ya hay repositorio válido. Rust estable con versión/MSRV documentados, lockfiles comprometidos y dependencies auditadas.

Candidatas a verificar, no API garantizadas: Tokio para async; reqwest con TLS validado para HTTP; rusqlite sobre un worker dedicado o sqlx con política de escritura única; serde para contratos; un generador Rust→TS compatible; biblioteca FTP mantenida. Elegir una opción por responsabilidad y documentarla. HTTP no implica FTP.

## 3. Modelo de estado

Separar `TransferState`, `FilePresence`, `IntegrityState`, `ResumeCapability` y `CaptureState`. Evitar un enum gigante donde «Movido» sea a la vez estado de transferencia.

Estados de transferencia, adaptables con pruebas: Probing, Deferred, Queued, Downloading, Pausing, Paused, RetryWaiting, Verifying, Processing, Completed, Failed, Cancelled. Definir transiciones y comandos idempotentes. La UI usa etiquetas en español; protocolos y código pueden emplear nombres estables en inglés.

Datos mínimos: ID del trabajo, fechas UTC, origen, URL pública redactada, referencia protegida a credenciales/URL real, destino final y temporal, tamaño opcional de 64 bits, rangos verificados, bytes durables, validadores de representación, cola/prioridad, límites, reintentos, hash esperado/calculado, fase, privacidad y capacidades reales.

Esquema inicial normalizado: downloads, segments/checkpoints, queues, rules, categories, settings, schema_migrations y event/log metadata no sensibles. Estadísticas separadas y opt-in. SQLite WAL y política de sincronización deben justificarse. El checkpoint nunca debe afirmar durabilidad de bytes aún no sincronizados según la estrategia elegida. La recuperación tolera pérdida del último tramo, no corrupción silenciosa.

## 4. Contrato local y seguridad

Comandos mínimos por etapas: GetCapabilities, GetSnapshot, Subscribe, ProbeDownload, PrepareCapture, CommitCapture, AbortCapture, AddDownload, Pause, Resume, Cancel, Retry, RevealFile, UpdateSettings y Shutdown. Mutaciones con request_id/idempotency_key; mensajes con versión, ID de correlación y errores tipados; eventos con secuencia y detección de huecos. No exigir que todos existan en fase 01.

Native Messaging usa el framing exigido por el navegador; stdout queda reservado al protocolo. Limitar el tamaño antes de reservar memoria. Propuesta: mensajes normales ≤256 KiB y lotes paginados, por debajo del límite host→navegador. No enviar bytes de archivos ni todo el historial por el canal. Referencia [S03].

Named pipes con descriptor de seguridad restrictivo al usuario apropiado, sin acceso remoto, validación del cliente y defensa frente a un pipe falso; no usar los permisos amplios predeterminados sin revisión. Allowed origins/extensions específicos en el host y protocolo con operaciones permitidas. No tratar la misma cuenta local como una barrera absoluta frente a malware. Referencia [S06].

Tauri capabilities limitadas a las ventanas/comandos necesarios; CSP de producción, sin contenido remoto privilegiado, sin exposición genérica de shell o filesystem al frontend. Referencia [S08]. No abrir un puerto TCP por comodidad; una alternativa exige threat model y aprobación.

## 5. Coordinación de AutoPick

Crear un estado persistido o recuperable de captura con ownership explícito:
`observada → preparada → confirmada_en_IDG → original_transferida`.
Abortar, expirar o reiniciar el worker no debe duplicar ni perder el trabajo.

Separar dos rutas: enlaces GET elegibles interceptados a partir de un gesto del usuario y descargas ya iniciadas observadas por downloads API. Solo pausar cuando hay una recuperación segura. Mantener el original si no se pueden reproducir método, autorización o URL. El ACK de una conexión no equivale a aceptación durable de una descarga.

La UI abre un diálogo de escritorio solicitado al runtime, con ventana única por capture_id. No reenviar el mismo clic múltiples veces ni permitir que un «usar navegador» vuelva a interceptarse. Caducidad y timeouts visibles. Referencia [S05].

## 6. Eficiencia

Streaming a disco con buffers acotados; no cargar archivos enteros en RAM. Un coordinador de escritura o escrituras posicionales seguras, sin `seek` compartido entre tareas concurrentes. Presupuestos globales de solicitudes, sockets y memoria. No confundir stream HTTP/2 con conexión TCP.

Progreso coalescido: objetivo inicial 2–4 actualizaciones/s para filas visibles; menos en popup y cero render de gráficas ocultas. Buffer de muestras de aproximadamente 60–120 s, limitado. Backpressure a IPC. Reconciliación de archivos al abrir/focalizar y mediante watchers acotados, no polling constante de todos los discos.

Metas de ingeniería, no resultados garantizados: medir proceso Rust separado de árbol WebView2; idle del runtime cercano a cero CPU; memoria estable tras ciclos de abrir/cerrar UI; UI utilizable con miles de entradas. Establecer presupuestos numéricos solo tras obtener una línea base en hardware descrito.

## 7. Pruebas, builds y dependencias externas

Separar pruebas portables del core y pruebas Windows reales. CI puede compilar/probar Windows, pero añadir un workflow no equivale a ejecutarlo. No declarar integración gráfica, extensión o instalador verificados desde un entorno que no los ejecutó.

GitHub owner/repo ya están definidos: `sredgarr/IDG`; crear y verificar ese repositorio en fase 00 según GITHUB_WORKFLOW. Los IDs de extensiones y claves de release siguen pendientes. Usar configuración `.example`, tests locales y errores claros; no endpoints falsos en producción. Preparar configuración y documentación antes de pedir secretos. No pegarlos en prompts ni archivos versionados.

Usar FFmpeg como proceso lateral controlado, con procedencia e integridad del binario conocidas y obligaciones de licencia cubiertas. El build concreto determina obligaciones y codecs; evitar builds marcadas no redistribuibles. Referencia [S14].

## Implementación de fase 03

`idg-core/src/download` implementa HTTP y archivos mediante un contrato Checkpoint. `idg-runtime/src/downloads.rs` controla una transferencia, IPC y todas las escrituras persistentes. `idg-storage` aplica migración 001 y protege el documento de trabajo completo con DPAPI antes de SQLite/WAL. La normalización futura de colas/segmentos no se implementa todavía. `idg-probe` utiliza el pipe autorizado; no enlaza un segundo motor ni abre la DB. Contratos generados en `packages/shared-types/protocol.ts`: comandos aditivos v1, capacidades consultables, snapshots y eventos de descarga con secuencia. Un salto se recupera consultando el estado; no requiere reconstruir deltas.

Un blob no descifrable se conserva sin sobrescribir, aparece en `unavailable` del listado y devuelve error tipado al consultar o actuar sobre ese ID; no bloquea los trabajos sanos. Una DB completa ilegible o una migración desconocida sí bloquea el arranque sin reinicializar datos. Detalles y límites: [ADR-011](decisions/011-http-secuencial.md). La UI aún no consume estos trabajos.
