# Instalar IDG

## Disponibilidad actual

**Este kit no incluye un instalador ni una extensión lista para usar.** Su contenido es la base documental para desarrollar el programa. Esta guía se actualizará al existir artefactos verificados.

La plataforma objetivo es Windows 10 y Windows 11, inicialmente x64. La compatibilidad exacta, dependencias y versión mínima se indicarán a partir de las pruebas de cada publicación. No se han ejecutado pruebas del programa por el hecho de preparar este kit.

## Instalación para usuarios — cuando exista una versión publicada

El mantenedor completará esta sección con el enlace real de la publicación y el nombre del instalador disponible. Hasta entonces, estos pasos describen el flujo previsto:

1. Abrir la publicación oficial verificada de `sredgarr/IDG` y elegir el instalador de la arquitectura admitida. El archivo del kit de prompts no instala IDG.
2. Comprobar nombre, versión y procedencia del archivo. Si aparece una alerta de seguridad, no desactivar antivirus o protecciones para continuar; revisar la publicación y consultar al mantenedor.
3. Ejecutar el instalador y seguir sus indicaciones. Debe explicar cualquier dependencia adicional, como WebView2, que necesite instalar o descargar.
4. Abrir IDG y completar el asistente de carpeta, navegador y AutoPick.
5. Instalar la extensión desde la ubicación oficial que indique la publicación. **No hay enlaces de tienda confirmados en este kit.**
6. Realizar una descarga pequeña autorizada para comprobar la conexión entre navegador y aplicación.

Los pasos exactos, nombres de botones y capturas deberán corresponder a la versión publicada, no solo a la especificación.

## Primera configuración prevista

Elegir carpeta de descarga; decidir si se organiza por tipos; conectar la extensión; elegir **Siempre usar IDG**, **Preguntarme** o **Usar el navegador**. Se propone Preguntarme inicialmente. Es posible omitir la integración y usar enlaces manuales cuando esa función esté implementada.

## Extensión de desarrollo

Una extensión local no equivale a una publicación oficial. Las instrucciones para cargarla y los permisos necesarios se incorporarán a [DESARROLLO.md](DESARROLLO.md) cuando exista el código y se haya probado cada navegador. No recomendar a usuarios finales pasos de desarrollo como si fueran la instalación normal.

## Actualizar y desinstalar

La aplicación está diseñada para buscar actualizaciones automáticamente de forma configurable y pedir aceptación antes de instalar y reiniciar. Este mecanismo aún debe implementarse y comprobarse.

La documentación final debe describir cómo desinstalar la aplicación y la extensión, y distinguir datos del programa, historial y archivos descargados. No afirmar que un desinstalador borra o conserva datos hasta verificar su comportamiento.

## Resolver problemas

Mientras no exista una versión ejecutable, informa el archivo o fase de desarrollo implicada. Después de publicar, cada problema debe indicar Windows, versión de IDG, navegador, pasos y error visible, sin incluir cookies, credenciales o enlaces privados.

Consulta [estado de implementación](IMPLEMENTATION_STATUS.md) para saber qué está realmente disponible.
