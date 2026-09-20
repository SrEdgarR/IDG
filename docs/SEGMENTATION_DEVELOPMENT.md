# Segmentación y límites — utilidad de desarrollo

La interfaz y la extensión todavía no gestionan estos trabajos. Compila como indica [DESARROLLO](DESARROLLO.md), y usa únicamente archivos/directorios de prueba propios. El runtime conserva una sola instancia y todos los comandos siguientes pasan por su IPC autorizado.

## Prueba automatizada completa

Con ningún runtime personal abierto:

```powershell
node scripts/test-segments.mjs
```

La utilidad crea su servidor, directorio `.local/segments-*` y runtime, y los cierra al terminar. No mata instancias preexistentes. Prueba 1/4/8/16/Automático, bytes/hash, pausa/cancelación, respuestas tardías, rangos incorrectos/cambio/416, backoff/Retry-After extremo, recuperación tras matar su proceso entre escritura y checkpoint, trabajos antiguos y tres prioridades bajo límites combinados. Comprueba que la recuperación no vuelve a solicitar rangos durables. No equivale a un corte eléctrico físico.

## Uso de los comandos

`idg-probe capabilities` anuncia las operaciones admitidas. Se conservan `add`, `status`, `list`, `pause`, `resume`, `cancel`, `watch` y `shutdown` de [fase 03](HTTP_DEVELOPMENT.md). Nuevos comandos, ejecutados en la suite por entrada estándar:

```powershell
.\target\debug\idg-probe.exe capabilities
.\target\debug\idg-probe.exe limits
'{"max_downloads":3,"global_requests":16,"origin_requests":8,"bytes_per_second":4194304}' |
  .\target\debug\idg-probe.exe limits set
```

Para un GET público reutilizable y una carpeta de prueba ya existente, envía por stdin este objeto a `idg-probe.exe add-segmented prueba`. Sustituye URL, carpeta y referencia por los del fixture; no publiques enlaces privados:

```json
{
  "input": {
    "url": "URL_DEL_FIXTURE",
    "directory": "CARPETA_ABSOLUTA_DE_PRUEBA",
    "name": "prueba.bin",
    "expected_sha256": "SHA256_DEL_FIXTURE",
    "conflict": "reject"
  },
  "options": {
    "mode": { "manual": { "requests": 4 } },
    "replay_safe": true,
    "bytes_per_second": 2097152,
    "priority": "normal"
  }
}
```

Esos marcadores son una plantilla. El recorrido completo probado es `node scripts/test-segments.mjs`, que construye los objetos con datos reales. Para una prueba interactiva, inicia el runtime siguiendo la guía de fase 03 y, en otra terminal, el fixture comprobado:

```powershell
node fixtures/http/segments.mjs
```

Sirve 64 MiB en `http://127.0.0.1:8788/file` y muestra su hash. Con una carpeta propia nueva:

```powershell
$prueba04 = Join-Path $PWD ('.local/prueba04-' + [guid]::NewGuid())
New-Item -ItemType Directory -Path $prueba04 | Out-Null
@{
  input = @{
    url = 'http://127.0.0.1:8788/file'
    directory = $prueba04
    name = 'prueba.bin'
    expected_sha256 = '98dc891b284e4d84ac25b0c0a24fdbe39a7f0dbd643ad5e8aa06e02fc6258254'
    conflict = 'reject'
  }
  options = @{
    mode = @{ manual = @{ requests = 4 } }
    replay_safe = $true
    bytes_per_second = 2097152
    priority = 'normal'
  }
} | ConvertTo-Json -Depth 5 -Compress | .\target\debug\idg-probe.exe add-segmented prueba
```

Los comandos y sus objetos se verificaron mediante la suite Node; este recorrido interactivo completo de PowerShell queda pendiente de confirmación del usuario. Al recibir `completed`, compara `Get-FileHash (Join-Path $prueba04 'prueba.bin') -Algorithm SHA256` con la referencia. Detén el fixture con Ctrl+C y el runtime propio con `idg-probe.exe shutdown`. El fixture anterior de fase 03 omite Accept-Ranges a propósito y conserva el camino secuencial para descargas nuevas.

Para Automático usa `"mode":"automatic"`; es también el valor predeterminado. `replay_safe` no es una comprobación que IDG pueda adivinar: declara que repetir el GET es seguro. Si falta o es false, se conserva el camino secuencial y no se habilitan reintentos automáticos. No lo actives para enlaces de un uso. Un modo manual de 16 es un techo solicitado, no una promesa de 16 solicitudes: lo limitan origen, presupuesto global, rangos disponibles y presión.

```powershell
.\target\debug\idg-probe.exe watch
.\target\debug\idg-probe.exe status prueba
.\target\debug\idg-probe.exe ranges prueba
.\target\debug\idg-probe.exe ranges prueba 50
.\target\debug\idg-probe.exe pause prueba
```

Después de recibir `paused`, puedes cambiar opciones:

```powershell
'{"mode":"automatic","replay_safe":true,"bytes_per_second":null,"priority":"low"}' |
  .\target\debug\idg-probe.exe options prueba
.\target\debug\idg-probe.exe resume prueba
```

Los límites individuales también se aplican al camino secuencial; `null` significa ilimitado y cero se rechaza. Globales y opciones se conservan en documentos protegidos. El máximo de trabajos activos devuelve `busy` al excederse; aún no hay editor de colas. Cambiar opciones de un trabajo activo devuelve `busy`: primero páusalo. El listado de rangos usa intervalos [inicio, fin exclusivo), páginas de 50 y marcador durable.

`active_requests` cuenta permisos HTTP realmente en uso, no sockets; `target_requests` es el objetivo del controlador. `ranges_durable` y `durable_bytes` son checkpoints, no longitud del archivo preasignado. `transferred_bytes` incluye bloques transferidos otra vez; el progreso útil no suma dos veces un rango. La comparación final exige `verified_against_reference: true` si se dio una referencia. Comprobar además con `Get-FileHash` sigue disponible; no se ejecuta el archivo.

Errores de representación, 200 ante Range, 416 no válido o hash incorrecto detienen el trabajo conservando parciales. No existe reinicio destructivo automático. Retry-After >1 h deja el trabajo detenido con su plazo persistido; no consume un hilo dormido ni mantiene ocupado un slot, pero no se permite reanudar antes del plazo. Cancelar sigue disponible. El control automático puede no cambiar en un archivo que termina antes de acumular ventanas suficientes.

## Benchmark reproducible

```powershell
cargo build --locked --release -p idg-runtime -p idg-platform-windows
node scripts/benchmark-segments.mjs
```

Se ejecuta sin runtime previo. Usa ejecutables release juntos, un runtime/directorio propios por caso, 16 MiB +13 bytes, tres repeticiones, modos 1/4/8/16/Automático y tres condiciones: 4 MiB/s por solicitud, 4 MiB/s compartidos por servidor, y ausencia de anuncio de rangos. El benchmark eleva solo sus límites IPC a 32 por origen/global para poder comparar 16; no cambia red ni configuración global de Windows. Mide tiempo de aceptación→final verificado, bytes útiles, cuerpos emitidos por el servidor, bytes repetidos/descartados, solicitudes observadas, RSS y CPU del proceso Rust. Los bytes del servidor incluyen datos enviados antes de cerrar una respuesta; no son un contador de retransmisiones TCP.

`Measure-Runtime.ps1` solo lee métricas del PID propio cada 100 ms; CPU acumulada muestreada y pico RSS observado son aproximaciones y pueden omitir el último intervalo. No incluye WebView2, Node/servidor, CLI ni muestreador. Resultados completos en `artifacts/benchmark04.json`; datos públicos y condiciones en [BENCHMARK_04](BENCHMARK_04.md). No se eliminan resultados desfavorables ni se extrapola al Internet real o a IDM.

Para verificar el servidor compartido con temporizadores retrasados: `node scripts/test-segment-fixture.mjs`. La suite de segmentación repite tres veces cada condición Automático y muestra decisiones numéricas acotadas. Para repetir solo el benchmark afectado por la corrección: `node scripts/benchmark-segments.mjs --shared-only`; genera `artifacts/benchmark04-shared-v2.json` sin reemplazar el informe original. [Diagnóstico del fallo de CI](CI04_DIAGNOSIS.md).
