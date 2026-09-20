# Probar la aplicación conectada — fase 05

Compila siguiendo [DESARROLLO](DESARROLLO.md). Es una prueba Windows sin instalador. Conserva los ejecutables en `target/debug`. Abrir deliberadamente `idg-desktop.exe` inicia su runtime adjunto validado o conecta con el existente.

## Recorrido con un archivo local

Sal del IDG anterior mediante **Salir completamente**; X solo oculta. Conserva tus trabajos y lee la advertencia de salida. No termines procesos ajenos.

En una terminal desde la raíz:

```powershell
node fixtures/http/server.mjs 8787
```

Anuncia URL, tamaño y SHA-256 de un archivo determinista de 8 MiB. En otra terminal PowerShell 7 desde la raíz:

```powershell
$prueba = Join-Path $PWD ('.local/manual-05-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path "$prueba/files" | Out-Null
$env:IDG_DATA_DIR = "$prueba/state"
.\target\debug\idg-desktop.exe
```

La variable solo afecta a esta terminal y sus procesos. Introduce `$prueba/files` en el asistente; no publiques esa ruta. IDG propone Descargas mediante Known Folder de Windows. Omite navegador y termina el asistente: guardar AutoPick no activa captura.

1. Nueva descarga: URL `http://127.0.0.1:8787/slow`, nombre `prueba.bin`, carpeta de prueba y categoría. Editar no hace solicitudes.
2. En Avanzado conserva Automático y deja desmarcada reutilización del enlace. Limita a 256 KiB/s para observarlo. Solo marca reutilizable si sabes que admite peticiones repetidas, nunca por suponerlo para enlaces firmados/de un solo uso.
3. Descargar ahora cierra tras guardar el trabajo. Observa bytes, velocidad y gráfica; pausa, espera Pausado y reanuda. Orden aceptada no equivale a transición completada.
4. X oculta sin detener. Ejecuta IDG otra vez o usa Mostrar IDG en bandeja; ventana y trabajo deben seguir únicos.
5. Al completar, pulsa Abrir carpeta y comprueba:

```powershell
Get-FileHash -Algorithm SHA256 -LiteralPath "$prueba/files/prueba.bin"
```

Hash esperado: `bdf23837181f5808331800c1ae2b4f7d7a839536b10d58491471c50dde23833a`.

Para recuperación, crea otro trabajo con distinto nombre, espera progreso y elige Salir completamente. Confirma la advertencia. Al abrir IDG conserva historial/parcial; pulsa Reanudar. El motor valida antes de continuar; si no puede, explica el motivo.

Descargar después guarda sin iniciar automáticamente. Añadir a cola respeta capacidad/estado; usa Iniciar cola. Detener cola impide nuevos inicios, sin pausar activos. Varias colas, reordenación y horarios siguen en 06.

Con motor detenido aparece Iniciar motor; la extensión no lo relanza. Al terminar usa Salir completamente, detén servidor con Ctrl+C y ejecuta `Remove-Item Env:IDG_DATA_DIR` en esa terminal. No necesitas borrar datos para volver a la configuración habitual.

## PENDIENTE DE CONFIRMACIÓN DEL USUARIO

| Acción exacta | Resultado esperado |
|---|---|
| Pulsa Elegir carpeta y acepta una carpeta propia en el selector Windows. | Cambia el campo; cancelar conserva el anterior. |
| Pulsa físicamente X durante descarga y abre el menú del icono IDG. | Continúa descargando; Mostrar IDG recupera la ventana, sin iconos duplicados. |
| Usa Nueva descarga, Pausar todas, Reanudar pausadas y Salir completamente desde bandeja. | Formulario compartido, estados confirmados, advertencia y checkpoints. |
| Activa avisos de fin/error y completa un trabajo. | Aviso en IDG con acciones; comprobar además presentación y silencio del aviso Windows. Aceptación de API no prueba entrega. |
| Activa mini ventana/zona flotante y arrastra un enlace físicamente. | Mini muestra trabajo real; drop abre revisión, sin descargar antes de aceptar. |

Windows requiere aplicación instalada para integración normal de avisos; en desarrollo puede identificarse como PowerShell. No se inventa instalador ni cambia identidad de sistema para ocultarlo. Acciones dentro de IDG; no se prometen botones nativos del toast. [Documentación oficial](https://v2.tauri.app/plugin/notification/).

`node scripts/test-desktop.mjs` controla Tauri/WebView2 real por CDP con servidor, carpetas y procesos propios. Cierre mediante `SC_CLOSE`: **no clic humano en X**. Drop mediante evento DOM: no arrastre físico. Galería/test:ui no sustituyen descargas. Chromium/Firefox prueban puente, no captura. FileIo real y disco lleno inyectado en core no acreditan recorrido visual de un volumen lleno. No llenes tu disco para probarlo.
