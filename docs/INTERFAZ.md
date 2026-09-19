# Interfaz de IDG — Pantallas, controles y flujos

**Contrato de experiencia de usuario.** Este archivo complementa [PRODUCT_SPEC.md](PRODUCT_SPEC.md), [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md) y [UI_CONTROL_INVENTORY.md](UI_CONTROL_INVENTORY.md). No es una captura ni una implementación.

La interfaz debe parecer una aplicación de escritorio moderna y sencilla, no una web promocional. El usuario habitual encuentra las acciones de descarga sin abrir ajustes técnicos. La inspiración es la sobriedad de Vercel, sin copiar su marca ni reproducir su web.

## 1. Reglas visuales obligatorias

Utilizar los tokens de `DESIGN_SYSTEM.md`: fondo claro suave y oscuro carbón, sin blanco o negro puros como grandes superficies. Modo Sistema inicial, con Claro y Oscuro manuales. Tipografía legible, iconos coherentes de trazo, bordes finos y animaciones discretas. No inventar una paleta alternativa en cada pantalla.

La jerarquía es **archivo → progreso/estado → acciones → detalles**. Nada de grandes tarjetas estadísticas en la pantalla principal, gradientes decorativos, sombras pesadas, ilustraciones vacías o botones gigantes. Estadísticas, ventana flotante y opciones técnicas son opcionales.

Los detalles de geometría no respondidos por el propietario son propuestas ajustables, no compromisos rígidos. Los requisitos funcionales no se pueden eliminar para que quepan en un diseño.

## 2. Mapa de pantallas

| ID | Superficie | Función |
|---|---|---|
| UX-01 | Primera configuración | Carpeta, extensión y AutoPick sin tecnicismos |
| UX-02 | Principal | Navegar, buscar, filtrar y controlar descargas |
| UX-03 | Fila y detalles | Progreso real y acciones según estado |
| UX-04 | Nueva descarga | Revisar archivo, destino, reanudabilidad y comienzo |
| UX-05 | Conflicto de archivo | Renombrar, sobrescribir, reanudar cuando proceda o cancelar |
| UX-06 | Colas y reglas | Orden, prioridades, horarios y organización |
| UX-07 | Ajustes | Preferencias sencillas y secciones avanzadas plegadas |
| UX-08 | Popup de extensión | Captura, sitio actual y control resumido |
| UX-09 | Detección multimedia | Botón sobre el reproductor y selección de medios |
| UX-10 | Avisos y recuperación | Errores útiles, archivos ausentes y actualizaciones |
| UX-11 | Ventanas opcionales | Mini progreso y zona para soltar enlaces |

Estas superficies se construyen cuando corresponda a su fase. Durante el desarrollo, las pantallas aún no conectadas viven en una galería explícita, no fingiendo funcionalidad en producción.

## 3. Pantalla principal — UX-02

Esquema de distribución, no pixel art obligatorio:

```text
┌────────────────────────────────────────────────────────────────────────────┐
│ IDG                 Buscar descargas…            Filtros    + Nueva descarga│
├──────────────────┬─────────────────────────────────────────────────────────┤
│ Todas            │ Todas las descargas                 Vista: Automática  │
│ Descargando      │                                                         │
│ En cola          │ [ ] Windows11.iso   progreso   curva   velocidad   ⋯    │
│ Completadas      │ [ ] Archivo.pdf     estado     curva   restante    ⋯    │
│ Pausadas         │                                                         │
│ Fallidas         │                Lista / estados vacíos                   │
│                  │                                                         │
│ Videos           │                                                         │
│ Documentos       │                                                         │
│ Programas        │                                                         │
│ Comprimidos      │                                                         │
│ Otros            │                                                         │
│                  │                                                         │
│ Configuración    │                                                         │
└──────────────────┴─────────────────────────────────────────────────────────┘
```

La sidebar mantiene exactamente esos dos grupos. Categorías propias se añaden sin reemplazar las originales. Estadísticas se muestra solo cuando el usuario lo activa. La vista **En cola** permite abrir la gestión de colas; no requiere inventar otra sección superior permanente.

La búsqueda es global cuando no hay filtro de vista y respeta los filtros activos cuando existen. Buscar no borra la selección sin avisar ni expone secretos de URLs. Deben verse claramente filtros activos, cantidad de resultados y **Limpiar filtros**.

La selección de una o varias filas muestra acciones masivas: pausar, reanudar, reintentar, mover a cola/categoría y quitar del historial, según lo implementado y los estados. **Quitar del historial** no es **Eliminar del disco**: esta última es una acción separada con confirmación explícita y archivos enumerados.

## 4. Filas y expansión — UX-03

Una fila compacta contiene icono de tipo, nombre, estado/progreso, bytes, pequeña gráfica real, velocidad, tiempo restante y acciones principales. Puede contener una segunda línea breve de metadatos sin convertirse en una tarjeta grande. A menor ancho se trasladan datos secundarios al detalle; no se esconden los botones esenciales.

Al expandir la misma fila se muestran tamaño total y descargado, porcentaje, sitio/servidor, categoría/tipo, fecha, estado de reanudación, prioridad y concurrencia real. Gráfica mayor opcional. El plegable **Detalles técnicos** contiene segmentos, validadores y logs/cabeceras redactados; no muestra contraseñas o cookies.

La regla Automática expande entre una y tres descargas visibles cuando hay altura suficiente; cuatro o más empiezan compactas. La decisión manual prevalece. El progreso nunca debe disparar un cambio inesperado de altura. Mantener anclaje de scroll, foco y selección. La vista se puede cambiar a Compacta o Expandida.

| Estado real | Texto/acción útil | Evitar |
|---|---|---|
| Descargando | Velocidad, progreso; Pausar/Cancelar según capacidad | Porcentajes inventados |
| Pausada | Reanudar si es seguro; explicar reinicio si no | Prometer que toda pausa se recupera |
| En cola o diferida | Cola/horario o Iniciar | Confundir diferida con comienzo automático |
| Completada | Abrir archivo, carpeta, copiar ruta | Ejecutar el archivo automáticamente |
| Fallida | Motivo útil, Reintentar o revisar enlace | Un icono rojo sin explicación |
| Sin tamaño conocido | «Tamaño desconocido» y bytes reales | Mostrar 100 % ficticio |
| Archivo no encontrado | Nombre tachado, Localizar, Descargar otra vez | Afirmar eliminación sin evidencia |

El gráfico solo utiliza muestras del motor. Pausado o sin datos no genera una animación aleatoria. La fila no debe expandirse al pulsar su checkbox, menú o botón Pausar.

## 5. Nueva descarga — UX-04

Diálogo de escritorio compartido por **Nueva descarga**, un enlace capturado y una acción de la extensión. El navegador solicita la captura; los datos, carpeta y aceptación final se gestionan con la aplicación. Evitar una ventana modal incrustada en cualquier página que exponga rutas o sesión.

Mostrar **nombre editable, URL protegida, tamaño, tipo, carpeta, categoría, sitio de origen y reanudabilidad**. Cargar el diálogo inmediatamente y consultar metadatos sin congelarlo. La carpeta se puede elegir con selector de Windows; mostrar permisos/espacio insuficiente de forma útil.

Reanudabilidad: **Comprobando / Disponible en la comprobación actual / No disponible / Desconocida**. La ayuda explica que un servidor o enlace puede cambiar posteriormente; no prometer recuperación universal tras un apagón.

Acciones visibles: **Descargar ahora**, **Descargar después**, **Añadir a cola** y **Cancelar**. Ahora crea el trabajo persistente y cierra el modal tras la aceptación real. Si el motor falla, conservar datos y mostrar el error, sin fingir comienzo. La extensión actualiza badge/icono y realiza una microanimación breve cuando lo permita el navegador.

**Avanzado**, plegado inicialmente: conexiones automáticas/manuales, límite inicialmente sin límite, prioridad, cola, proxy y datos de solicitud permitidos. Mostrar secretos solo bajo una acción deliberada y sin incluirlos en logs o capturas.

## 6. Conflicto de archivo — UX-05

Mostrar archivo existente, ruta, tamaño y fecha disponibles. Ofrecer **Renombrar automáticamente** con previsualización del nombre, **Sobrescribir**, **Reanudar** cuando el motor pueda validar identidad/estado y **Cancelar**. Una coincidencia de nombre no habilita por sí sola Reanudar.

Descargar inicialmente a `archivo.iso.idgpart` y publicar el nombre final solo al completar correctamente. La UI no debe presentar un temporal como archivo final válido. Sobrescribir requiere confirmación y no destruye prematuramente un archivo válido.

## 7. Primera configuración — UX-01

Cuatro pasos breves: **Bienvenida → Carpeta → Navegadores → AutoPick**. Botones Atrás/Siguiente y omisión del paso de navegador cuando corresponda. No pedir cuentas o tarjetas.

Carpeta Descargas de Windows por defecto; organización por tipo opcional. Mostrar navegador detectado, extensión instalada y conexión efectiva como estados distintos. Sin publicación en tienda, informar que solo existe instalación de desarrollo; no mostrar enlaces falsos.

AutoPick: **Siempre usar IDG / Preguntarme / Usar el navegador**. Inicial propuesto Preguntarme. Siempre usar IDG abre igualmente el diálogo de nueva descarga; no significa descargar silenciosamente. Toda elección se puede cambiar después.

## 8. Ajustes — UX-07

Ajustes agrupa opciones con explicaciones breves. Guardado consistente e inmediato para switches seguros; editores complejos de reglas/colas usan Guardar/Cancelar. No mezclar ambos patrones de forma ambigua.

| Sección | Opciones que deben contemplarse |
|---|---|
| General y apariencia | Tema, idioma, inicio con Windows, acción de X, densidad/vista, ventana flotante opcional |
| Descargas | Carpeta, organización, simultáneas, límites, categorías y comportamiento ante conflictos |
| Navegadores | AutoPick global/por sitio, excepciones, formatos/tamaños ignorados, conexiones y botón multimedia |
| Conexión — avanzado | Concurrencia, proxy, autenticación, opciones de protocolo disponibles |
| Video y audio | Calidad, pistas, conservar original o convertir, contenedor compatible, estado de FFmpeg |
| Colas y programación | Colas, horarios y acción al finalizar, con advertencia antes de apagar |
| Notificaciones | Inicio/fin/error/conectividad, sonidos y acciones |
| Privacidad | Historial, modo privado, estadísticas y diagnóstico; telemetría apagada inicialmente |
| Actualizaciones | Búsqueda automática configurable, comprobar manualmente y aceptación de instalación |

X minimiza a bandeja por defecto; Configuración permite cerrar por completo o preguntar. Al salir realmente, avisar sobre trabajos activos y posibles reinicios desde cero. No decir simplemente «se pausarán» si no son reanudables.

## 9. Colas, reglas y búsqueda avanzada — UX-06

La gestión de colas permite crear/renombrar, iniciar/pausar, ordenar trabajos, definir simultáneas/horarios y acción al terminar. Prioridad y límites no necesitan mostrarse como paneles siempre abiertos.

Las reglas se editan con condición (dominio/extensión/tamaño y condiciones soportadas), acción (carpeta/categoría/cola), prioridad y activación. Mostrar una previsualización sobre datos de ejemplo identificados y explicar conflictos. No ejecutar movimientos o borrados al solo previsualizar.

La sintaxis avanzada del buscador se ofrece como ayuda opcional, no como requisito para usar la búsqueda normal. Importar varias URLs, TXT/CSV, soltar enlaces y monitorizar portapapeles son acciones configurables; no activar vigilancia del portapapeles sin elección del usuario.

## 10. Extensión — UX-08

Popup pequeño, aproximadamente 340–380 px ajustables al navegador, con nombre IDG, estado de conexión, cantidad de trabajos, lista resumida, AutoPick, excepción del sitio y **Abrir IDG**. Ajustes completos viven en escritorio.

Badge numérico de descargas activas; atención/error con significado claro; microanimación al aceptar una nueva descarga sin bucles intensivos. Los estados deben sincronizarse con el runtime, no con contadores ficticios del popup.

La elección **Usar navegador** permite continuar la descarga sin recapturarla en bucle. La falta de host muestra diagnóstico y ruta de instalación legítima. Los menús contextuales se limitan a enlaces/medios relevantes. Detener captura global o por página debe quedar visible.

## 11. Multimedia — UX-09

Botón discreto **Descargar** anclado al reproductor, configurable y sin tapar sus controles esenciales. Si no se puede asociar un medio con un reproductor de forma fiable, listar medios detectados en la extensión sin inventar correspondencias.

El selector muestra título, miniatura cuando exista, calidad, tamaño exacto o **aproximado**, y modo **Video + audio / Solo video / Solo audio**. Idioma/pistas cuando estén disponibles; codec/FPS pueden estar en Avanzado. No ofrecer MP4 ni una conversión si la combinación no es compatible.

Combinar audio/video sin recodificar cuando proceda. Diferenciar **Conservar/extraer original** de **Convertir** y avisar sobre pérdida adicional. Descargar continúa tras cerrar el navegador solo cuando IDG dispone de la información y autorización necesarias. DRM detectado se informa como no compatible; no se ofrece un botón de evasión.

## 12. Errores, avisos y ventanas opcionales — UX-10 / UX-11

Estados diseñados: vacío inicial, sin resultados, sin conexión al runtime, permisos denegados, tamaño desconocido, conexión perdida, disco lleno, enlace caducado, integridad fallida, conversión fallida y actualización disponible. Ofrecer recuperación concreta sin abrumar con logs.

Un archivo ausente se muestra tachado y como **No encontrado en su ubicación**. Solo decir **Movido** o **Eliminado** cuando exista evidencia. Acciones: localizar, abrir nueva ubicación confirmada, descargar nuevamente o quitar del historial.

Actualización: versión actual/nueva, notas reales, **Más tarde** y **Actualizar y reiniciar**. Coordinar con trabajos activos y no reiniciar sin aceptación. Mini ventana y zona de arrastre son independientes, opt-in y con cierre propio sin detener descargas accidentalmente.

## 13. Comprobación obligatoria

Cada control del inventario necesita acción, disponibilidad, error y evidencia. En la fase visual puede figurar PLANIFICADO o implementado solo en galería; eso no equivale a funcionalidad real.

Probar claro/oscuro/sistema, 0/1/3/20 trabajos, ventana normal/pequeña, DPI cuando sea posible, teclado, foco, Escape, selección, expansión y reducción de movimiento. Registrar capturas auténticas y saneadas cuando se pueda ejecutar el entorno. No generar imágenes y presentarlas como capturas del programa.

La revisión visual no sustituye verificar el comando del motor. Un botón que solo cambia un texto o muestra un aviso de éxito no supera la revisión funcional.
