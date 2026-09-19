# Sistema visual — IDG

Lee también [INTERFAZ.md](INTERFAZ.md) para pantallas, navegación y flujos, y [UI_CONTROL_INVENTORY.md](UI_CONTROL_INVENTORY.md) para acciones y pruebas. Estos tres documentos son obligatorios para construir o revisar la interfaz.

## Dirección
Herramienta de escritorio moderna, serena y funcional. Inspiración Vercel por claridad, tipografía y sobriedad; no copiar marca, triángulos comerciales o interfaz exacta. No introducir landing page, tarjetas KPI arriba, gradientes decorativos, glassmorphism intenso, sidebar gigante, botones redondos desproporcionados o iconos emoji como identidad final.

Prioridad visual: archivo → progreso/estado → acciones → detalles. Todo control tiene una tarea. Los campos técnicos viven en expansión/Avanzado.

## Tokens propuestos
Los siguientes valores son propuestas de diseño; comprobar contraste y ajustar antes de cerrar la etapa visual.

| Token | Claro | Oscuro |
|---|---|---|
| Fondo | `#F6F7F8` | `#151618` |
| Superficie | `#FBFBFC` | `#1B1D20` |
| Superficie elevada | `#F0F1F3` | `#23262B` |
| Borde | `#D8DCE1` | `#343941` |
| Texto principal | `#20242B` | `#E8EBEF` |
| Texto secundario | `#606A77` | `#A5ADB9` |
| Foco/acento funcional | `#2563EB` | `#7BA7FF` |

El modo del sistema cambia en tiempo real sin perder selección o estado de filas. Nunca depender solo del color para errores, éxito o pausa. Fondo claro no puro `#FFFFFF`; fondo oscuro no puro `#000000`. Reducir contraste de grandes superficies, no de texto importante.

Tipografía: `Segoe UI Variable`, `Segoe UI`, system-ui; fuente alternativa solo con licencia correcta. Tamaño base aproximado 13–14 px, títulos de sección 18–20 px, cifras tabulares para velocidades y tamaños. Iconos coherentes de trazo, 16–18 px. Radios moderados: 6–8 px para controles, 10 px para diálogos; no píldoras para todo. Espaciado basado en múltiplos de 4 px. Bordes de 1 px y sombras leves en capas flotantes.

## Layout
Ventana inicial propuesta 1180×760; debe ser usable en 1024×640 y pantallas con DPI alto. Sidebar aproximada 208–224 px con opción de colapsar, no anchos rígidos que impidan el escalado. Barra superior de unos 56 px. Lista ocupa el espacio principal, sin grandes márgenes vacíos.

Compacto: una fila de altura aproximada 58–68 px. Mostrar checkbox al seleccionar o pasar foco, icono de tipo, nombre, barra/porcentaje, bytes, sparkline de unos 84×24 px, velocidad, ETA y acciones. A anchos menores ocultar columnas de menor prioridad en el panel expandido, no cortar acciones.

Expandido: mismo elemento, no abrir otra tarjeta sin relación. Datos secundarios, resumen de conexiones, gráfico grande opcional, información de reanudación y botones según estado. Detalles técnicos en un segundo plegable: URL redactada, cabeceras no sensibles, validadores, segmentos y logs redactados.

## Reglas de expansión
Automática con 1–3 elementos visibles y suficiente alto; compacta con cuatro o más. La preferencia manual manda. No reordenar ni expandir filas bajo el cursor al cambiar el progreso. Aplicar cambios automáticos en transiciones claras de vista, con conservación de anclaje de scroll. Opciones globales Automática/Compacta/Expandida.

## Componentes obligatorios
AppShell, Sidebar, Toolbar/Search, FilterPopover, DownloadList, DownloadRow, DownloadDetails, Sparkline, SelectionToolbar, NewDownloadDialog, ExistingFileDialog, QueueEditor, RuleEditor, Settings, FirstRunWizard, Toast/Notification, EmptyState, ErrorState y ConfirmDialog. Crear componentes solo a medida que la fase los requiera; no una biblioteca vacía por adelantado.

Extensión: popup compacto, estado de conexión, selector AutoPick, sitio actual, lista breve de trabajos, controles y enlace Abrir IDG. Botón multimedia discreto, anclado y configurable; no usar carteles grandes que tapen el video.

## Estados que deben diseñarse
Sin descargas; sin resultados; metadatos cargando; descarga con tamaño desconocido; reanudabilidad desconocida/no disponible; pérdida de conexión; host no instalado; permiso rechazado; error de disco; archivo no encontrado; hash no coincidente; URL vencida; conversión en curso; actualización disponible; modo privado. Ninguno se resuelve con una pantalla en blanco o un éxito falso.

## Interacción y accesibilidad
Enter confirma solo cuando la acción es válida; Escape cierra diálogos no destructivos sin iniciar descargas. Foco vuelve al elemento que abrió el diálogo. Ctrl+F búsqueda; atajos adicionales documentados, sin interferir con escritura. Botones de acción de fila no expanden la fila por propagación accidental.

Animaciones 120–180 ms en opacity/transform preferentemente, sin transiciones continuas costosas. Respetar `prefers-reduced-motion`. Gráficas: no anunciar cada punto al lector de pantalla; ofrecer resumen accesible de estado/velocidad.

## Inventario de controles
En fase 02 ampliar el inventario inicial `docs/UI_CONTROL_INVENTORY.md`: pantalla, control, acción esperada, comando/backend, estado habilitado, error, prueba y fase que lo conecta. Cada fase lo actualiza. En release no debe quedar un control visible que prometa algo no implementado. Para previews tempranas, galería de desarrollo explícita; no datos ficticios mezclados con descargas reales.

## Validación visual
Capturas verificadas, no inventadas, de claro/oscuro con 0, 1, 3 y 20 trabajos; tamaños normal/pequeño; DPI 100/150/200 cuando sea posible. Revisar alineación, overflow, contraste, foco, estados y control de todos los menús. Sin capturas del entorno real, declarar el pendiente.

Si el usuario aporta imágenes posteriormente, inventariar y ubicar cada control visible de la referencia antes de adaptar el diseño; preservar toda la funcionalidad existente. No afirmar haber visto archivos que no están en el repositorio.
