# Sistema visual — IDG

Lee también [INTERFAZ.md](INTERFAZ.md) para pantallas, navegación y flujos, y [UI_CONTROL_INVENTORY.md](UI_CONTROL_INVENTORY.md) para acciones y pruebas. Estos tres documentos son obligatorios para construir o revisar la interfaz.

## Dirección
Herramienta de escritorio moderna, serena y funcional. Inspiración Vercel por claridad, tipografía y sobriedad; no copiar marca, triángulos comerciales o interfaz exacta. No introducir landing page, tarjetas KPI arriba, gradientes decorativos, glassmorphism intenso, sidebar gigante, botones redondos desproporcionados o iconos emoji como identidad final.

Prioridad visual: archivo → progreso/estado → acciones → detalles. Todo control tiene una tarea. Los campos técnicos viven en expansión/Avanzado.

## Tokens vigentes
La revisión visual solicitada el 2026-09-24 adapta la paleta y el tratamiento de controles de `workspace-ui.css` a las superficies de IDG. Los selectores de ese archivo describen otra aplicación y no se cargan en producción. Los valores vigentes viven en `packages/ui/tokens.css`; escritorio añade `apps/desktop/src/workspace.css` y el popup usa los mismos tokens.

| Token | Claro | Oscuro |
|---|---|---|
| Fondo | `#F5F5F9` | `#191B25` |
| Superficie | `#FFFFFF` | `#232632` |
| Superficie sutil | `#F0F1F6` | `#2B2E3D` |
| Borde | `#E1E3EB` | `#383C4F` |
| Borde de control | `#C9CDD9` | `#535A73` |
| Texto principal | `#202331` | `#EEF0F8` |
| Texto secundario | `#626779` | `#B7BDD0` |
| Foco/acento funcional | `#5546E8` | `#A79CFF` |

El modo del sistema cambia en tiempo real sin perder selección o estado de filas. Nunca depender solo del color para errores, éxito o pausa. Fondo claro no puro `#FFFFFF`; fondo oscuro no puro `#000000`. Reducir contraste de grandes superficies, no de texto importante.

Tipografía: `Segoe UI Variable`, `Segoe UI`, system-ui; fuente alternativa solo con licencia correcta. La escala compartida vigente tiene base de 15 px. Cifras tabulares para velocidades y tamaños; iconos coherentes de trazo. Radios de 9 px en controles, 12–14 px en grupos y 16–20 px en diálogos. Espaciado basado en múltiplos de 4 px. Bordes de 1 px; sombras leves en superficies y más marcadas solo en menús y diálogos.

## Layout
Ventana inicial propuesta 1180×760; debe ser usable en 1024×640 y pantallas con DPI alto. Sidebar aproximada 208–224 px con opción de colapsar, no anchos rígidos que impidan el escalado. Barra superior de unos 56 px. Lista ocupa el espacio principal, sin grandes márgenes vacíos.

Al llegar a 760 px o menos, la navegación se abre como panel lateral con botón de cierre, Escape y retorno de foco. La barra de búsqueda, filtros y acción principal se reorganiza sin ocultar controles. Formularios de dos columnas pasan a una; diálogos se ajustan al ancho y desplazan su contenido verticalmente. Las acciones de fila permanecen visibles y los datos secundarios se reubican según el ancho disponible. El popup admite 280–360 px sin desbordamiento horizontal.

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

Los iconos usan el acento violeta al señalar una acción principal, un filtro activo o una descarga en curso; verde para completadas y rojo para fallidas. El estado siempre se nombra con texto. La conexión en el popup conserva su texto y punto de estado.

Las interacciones frecuentes usan transiciones de 140 ms y las superficies de entrada o navegación móvil, 180 ms, con `cubic-bezier(0.2, 0, 0, 1)`. Animar color, opacidad o desplazamientos pequeños; el botón presionado escala a 0,96. La espera de conexión en el popup puede pulsar suavemente. Al cambiar el tema se aplican los colores de inmediato. `prefers-reduced-motion` elimina animaciones y transiciones. Gráficas: no anunciar cada punto al lector de pantalla; ofrecer resumen accesible de estado/velocidad.

## Inventario de controles
En fase 02 ampliar el inventario inicial `docs/UI_CONTROL_INVENTORY.md`: pantalla, control, acción esperada, comando/backend, estado habilitado, error, prueba y fase que lo conecta. Cada fase lo actualiza. En release no debe quedar un control visible que prometa algo no implementado. Para previews tempranas, galería de desarrollo explícita; no datos ficticios mezclados con descargas reales.

## Validación visual
Capturas verificadas, no inventadas, de claro/oscuro con 0, 1, 3 y 20 trabajos; tamaños normal/pequeño; DPI 100/150/200 cuando sea posible. Revisar alineación, overflow, contraste, foco, estados y control de todos los menús. Sin capturas del entorno real, declarar el pendiente.

Si el usuario aporta imágenes posteriormente, inventariar y ubicar cada control visible de la referencia antes de adaptar el diseño; preservar toda la funcionalidad existente. No afirmar haber visto archivos que no están en el repositorio.

## Ajuste aprobado al cerrar fase 02

El propietario aceptó personalmente los temas claro/oscuro, expansión de filas con información y gráfica, Nueva descarga y Configuración. Esta confirmación no acredita accesibilidad exhaustiva, DPI, compatibilidad ni funciones futuras. Iconos y animaciones ornamentales se reservan para pulido posterior.

Se conserva paleta, estructura e interacción. La escala compartida `--font-N` representa el tamaño anterior N más 1 px (base 15 px), aplicada a sidebar, filas, etiquetas, botones, campos, diálogos, Ajustes y popup. Los títulos mantienen su jerarquía; interlineado base 1.45. No se usa zoom ni transform para escalar la aplicación.

Ese párrafo documenta el cierre histórico de fase 02. La solicitud visual del 2026-09-24 sustituye sus colores y radios por los tokens vigentes de esta página; conserva la escala tipográfica, la jerarquía de información y las acciones existentes. La galería verifica localmente claro/oscuro, anchos 320/720/1180 px, formularios estrechos y popup 280/360 px; la revisión física en WebView2, navegador y DPI real sigue pendiente.
