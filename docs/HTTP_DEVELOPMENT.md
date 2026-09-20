# Probar el motor HTTP de desarrollo

Requiere el setup y build de [DESARROLLO](DESARROLLO.md), Windows y los ejecutables juntos en `target/debug`. Esto no es un instalador ni habilita descargas en la ventana o extensión. Usa una carpeta propia de prueba. Cierra tu runtime de desarrollo antes de una prueba aislada; no termines procesos ajenos. La base contiene datos protegidos para tu cuenta Windows, por lo que no es portable entre usuarios/equipos.

## Recorrido reproducible

Desde la raíz, en una terminal:

```powershell
node fixtures/http/server.mjs 8787
```

El servidor local sirve 8 MiB deterministas y muestra su SHA-256. No necesita archivos externos. En otra terminal, crea un directorio exclusivo y abre el runtime de prueba:

Hash de este fixture: `bdf23837181f5808331800c1ae2b4f7d7a839536b10d58491471c50dde23833a`.

```powershell
$prueba = Join-Path $PWD ('.local/manual-http-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path "$prueba/files" -Force | Out-Null
$env:IDG_DATA_DIR = "$prueba/state"
Start-Process -FilePath "$PWD/target/debug/idg-runtime.exe" -WindowStyle Hidden
.\target\debug\idg-probe.exe ping
.\target\debug\idg-probe.exe capabilities
```

Si ping se ejecuta antes de que termine el arranque, repítelo. IDG_DATA_DIR solo afecta al proceso lanzado desde esta terminal; no configura globalmente Windows. En una tercera terminal puedes observar snapshots reales:

```powershell
.\target\debug\idg-probe.exe watch
```

En la terminal que conserva `$prueba`, copia el hash mostrado por el servidor en `$hashEsperado` y envía el trabajo por entrada estándar. No pongas enlaces privados en argumentos, historial compartido o issues.

```powershell
$hashEsperado = 'bdf23837181f5808331800c1ae2b4f7d7a839536b10d58491471c50dde23833a'
@{ url='http://127.0.0.1:8787/slow'; directory="$prueba/files"; name='prueba.bin'; expected_sha256=$hashEsperado; conflict='reject' } |
  ConvertTo-Json -Compress | .\target\debug\idg-probe.exe add prueba
.\target\debug\idg-probe.exe status prueba
.\target\debug\idg-probe.exe pause prueba
.\target\debug\idg-probe.exe status prueba
.\target\debug\idg-probe.exe resume prueba
.\target\debug\idg-probe.exe list
```

Pausa durante la transferencia; si ya terminó, crea otro ID/nombre. Espera `paused` antes de reanudar y `completed` antes de leer el final. `received_bytes` puede superar `durable_bytes`; el segundo es el checkpoint recuperable. El SHA calculado solo se etiqueta `verified` si coincide con la referencia entregada. Comprueba el archivo:

```powershell
Get-FileHash -Algorithm SHA256 -LiteralPath "$prueba/files/prueba.bin"
```

Para cancelar, inicia otro trabajo con ID `cancelar` y nombre `cancelar.bin`, y ejecuta:

```powershell
.\target\debug\idg-probe.exe cancel cancelar
.\target\debug\idg-probe.exe status cancelar
.\target\debug\idg-probe.exe shutdown
Remove-Item Env:IDG_DATA_DIR
```

Detén el servidor con Ctrl+C. Cancelar no borra el parcial; no hay comando de borrar en esta fase. `replace` debe elegirse expresamente y solo publica después de validar; `rename` busca otro nombre, `reject` preserva el existente. No se abre ni ejecuta el archivo descargado automáticamente.

## Pruebas repetibles y diagnóstico

```powershell
cargo test --locked -p idg-core -p idg-protocol -p idg-storage
node scripts/test-http-runtime.mjs
.\scripts\Check.ps1
```

La prueba de runtime se niega a comenzar si detecta otra instancia. Crea su servidor, carpeta y procesos propios; mata exclusivamente el runtime que lanzó y verifica después el Range exacto y SHA final. Conserva artefactos ignorados en `.local/http-engine-*`. El recorrido automatizado usa los mismos subcomandos, incluidos watch/capabilities. Check añade builds y regresiones existentes; `-Integration` añade UI/Tauri y navegadores con el host registrado conforme a DESARROLLO.

Ante `busy`, espera o pausa la transferencia activa; aún no hay colas. `unsafe_resume`, `range_ignored`, `resource_changed` o `invalid_range` conservan el parcial: no existe reinicio automático desde cero. Un enlace de un solo uso consumido puede no permitir recuperación. `publish_pending` permite `resume` tras liberar el bloqueo, sin descargar otra vez. `retry_later` no programa reintentos. TLS/DNS/conexión pueden compartir error de red sanitizado; no se registran errores HTTP con URLs completas. Los fallos de operación CLI producen salida distinta de cero.

Contrato: [tipos generados](../packages/shared-types/protocol.ts), [protocolo Rust](../crates/idg-protocol/src/download.rs), [ADR-011](decisions/011-http-secuencial.md). La lista real de trabajos todavía no se presenta en la interfaz gráfica.

## Continuidad en fase 04

`add` conserva su contrato y el camino prudente sin autorización de GET repetidos. El runtime ahora admite hasta tres trabajos por defecto; los límites y opciones se amplían en la [guía de segmentación](SEGMENTATION_DEVELOPMENT.md). Las cifras de una transferencia activa y ausencia de reintentos anteriores describen fase 03: en 04 pueden configurarse presupuestos y autorizar reintentos/rangos mediante `replay_safe`. Los documentos están protegidos con DPAPI dentro de SQLite, no el archivo SQLite entero.
