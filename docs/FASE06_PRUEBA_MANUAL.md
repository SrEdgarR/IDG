# Probar organización — fase 06

Aplicación de desarrollo para Windows; no es un instalador ni una publicación. La [compilación y extensión de desarrollo](DESARROLLO.md) siguen separadas de la instalación para usuarios. Este recorrido es para que el propietario revise lo entregado; no consta como realizado por él hasta recibir su confirmación.

## Preparar una prueba aislada

Cierra el IDG anterior mediante **Salir completamente**. X solo oculta la ventana. No cierres procesos de otros programas. Desde la raíz del repositorio, con Rust y pnpm preparados:

```powershell
cargo build --locked -p idg-runtime -p idg-native-host -p idg-platform-windows
npx --yes pnpm@12.4.2 desktop:build
node fixtures/http/segments.mjs 8788
```

El último comando mantiene un servidor local que anuncia URL, tamaño y SHA-256. Si el puerto está ocupado, elige otro y usa el que anuncie. En **otra terminal** PowerShell 7 desde la raíz:

```powershell
$prueba06 = Join-Path $PWD ('.local/manual-06-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path "$prueba06/files","$prueba06/reglas" | Out-Null
$env:IDG_DATA_DIR = "$prueba06/state"
$env:IDG_POWER_ADAPTER = 'simulate'
$env:IDG_CLIPBOARD_FIXTURE = "$prueba06/clipboard.txt"
@('url,nombre','http://127.0.0.1:8788/file,manual-a.bin','http://127.0.0.1:8788/file,manual-b.bin') |
  Set-Content -LiteralPath "$prueba06/links.csv" -Encoding utf8
Write-Output "Carpeta inicial: $prueba06/files"
Write-Output "Carpeta de la regla: $prueba06/reglas"
Write-Output "CSV de prueba: $prueba06/links.csv"
.\target\debug\idg-desktop.exe
```

Las variables solo afectan a esa terminal y sus procesos. En el asistente, elige la **ruta completa** que imprime «Carpeta inicial» y omite el navegador. No escribas literalmente `$prueba06/files` en la aplicación: PowerShell interpreta esa variable, pero IDG no. No publiques la ruta resultante. La fuente de portapapeles de fixture solo existe en builds de desarrollo; no lee tu portapapeles.

## Recorrido corto

1. En **En cola → Gestionar colas**, crea «Pruebas A» y «Pruebas B», simultáneas 1. Guarda cada una. Detener nuevos inicios conserva la transferencia activa; Pausar activas sí la pausa.
2. En **Gestionar reglas**, crea una regla para extensión `bin`, categoría Documentos y carpeta `$prueba06/reglas`. Guarda. Las rutas deben existir. Las condiciones se combinan con «y», menor orden e identificador deciden cada campo; no se consultan enlaces para averiguar tamaño o tipo.
3. Abre **Importar enlaces** y selecciona la ruta completa que imprime «CSV de prueba». Este archivo enumera dos enlaces al servidor local, con los nombres `manual-a.bin` y `manual-b.bin`; no es un instalador ni un archivo descargado. Previsualiza. Debes ver destino, categoría, cola y aviso de posible duplicado: las URLs son iguales deliberadamente, pero puedes descargar ambas por decisión propia. Excluye una entrada si no la quieres. Elige **Añadir a cola** y crea las revisadas. Hasta iniciar la cola no habrá descarga.
4. En Gestionar colas, mueve un trabajo a cada cola mientras estén inactivos. En Pruebas A despliega horario e introduce un instante cercano con zona explícita. Puedes obtenerlo con `(Get-Date).AddMinutes(2).ToString('yyyy-MM-ddTHH:mm:sszzz')`; esto **no cambia el reloj**. Pulsa **Guardar cola** una vez, directamente desde el campo: «Cambio de horario sin guardar» debe desaparecer y «Programación guardada» debe mostrar el instante y Pendiente. Cierra y reabre el editor para confirmar que persiste; la etiqueta Pendiente por sí sola no basta. Inicia B y espera al horario de A. El horario se aplica una vez, recupera hasta 15 minutos de retraso y después vence. Necesita motor activo y Windows despierto.
5. Busca `manual` o `type:bin`, selecciona trabajos y usa las operaciones masivas. Debes ver aceptados, omitidos, fallidos o sin confirmación, según el estado. Cambiar filtros conserva selección. **Quitar del historial** oculta terminados sin borrar el archivo; **Ocultas → Restaurar al historial** lo deshace y reinicia su período de visibilidad. La opción de eliminar del disco es independiente, enumera el archivo y advierte que es permanente, sin papelera ni deshacer.
6. Cuando todos los trabajos de esta prueba estén completados, abre Gestionar colas. **Comprueba que se indique modo de prueba/simulación antes de activar energía.** Selecciona una acción y confirma la activación de una sola vez, cierra el editor y pulsa **Cancelar acción de energía** durante sus 60 segundos. Debe cancelarse y no reactivarse. Nunca se envía una acción física en este modo. Si no aparece la indicación de simulación, no actives energía: sal completamente y revisa el entorno del proceso.

Opcional: Configuración → Privacidad permite retención y estadísticas locales opt-in. La retención oculta el historial visible; conserva metadatos protegidos de recuperación, no es eliminación de datos privados. Borrar estadísticas no las reconstruye a partir de trabajos antiguos. No se certifica aquí el modo privado completo, previsto en fase 12.

Las estadísticas muestran archivos, bytes verificados, media del ciclo completo (incluye tiempo en cola y pausas, no velocidad instantánea) y sitios registrados por frecuencia. Se guardan hasta 32 dominios; los siguientes se agrupan en Otros. Intervalos nulos/negativos no aportan una muestra de velocidad. Se explica el cálculo en la propia pantalla y no se transmiten los datos.

Para el monitor aislado, actívalo en Privacidad y espera un segundo. Después, en su terminal de lanzamiento:

```powershell
'http://127.0.0.1:8788/file?fixture=clipboard' | Set-Content -LiteralPath "$prueba06/clipboard.txt" -Encoding utf8
```

Debe proponer revisar enlaces, sin crear trabajos. Desactivar el monitor descarta la propuesta y deja de observar. La prueba usa el archivo indicado; la API del portapapeles real no se ejercita en este recorrido aislado.

## Búsqueda y límites

La búsqueda recorre el historial completo en el motor y pagina en grupos de 50. Busca nombre, dominio, categoría y carpeta; no busca tokens, credenciales, query, fragmentos ni rutas arbitrarias de URL. Ayuda opcional: `site:example.org`, `type:pdf`, `status:paused`, `size:unknown`, `size:large` (al menos 1 GiB) y `size:small`. El filtro de fecha usa inicio de día UTC. Una palabra desconocida se trata como texto literal.

Importación: máximo 1 MiB/1000 entradas; UTF-8 o UTF-16 con BOM, CSV de URL y nombre opcional. Permite corregir/excluir y detener el procesamiento; detener no cancela trabajos ya aceptados. Doble envío/reintento conserva el ID de cada entrada. Las acciones masivas admiten hasta 1000 seleccionados. No hace capturas del navegador, AutoPick, multimedia ni FTP.

Al acabar, Salir completamente conserva esta prueba aislada. Detén el servidor de fixture con Ctrl+C. Las variables permanecen solo en esa terminal; puedes cerrarla. No se han alterado reloj, zona, instalación ni perfiles personales de los navegadores.
