# 05 — Aplicación conectada, nueva descarga y bandeja

Lee AGENTS.md, el estado de implementación y las secciones aplicables de la especificación, arquitectura, sistema visual y plan de pruebas. Inspecciona el código antes de cambiarlo. Ejecuta esta fase, no todas las fases posteriores. Da un plan breve y luego implementa.

No inventes API, datos reales o resultados. Fixtures solo en pruebas/galería de desarrollo. Si el entorno no puede ejecutar Windows o navegadores, prepara las comprobaciones y marca lo no verificado; no lo declares aprobado. Al cerrar, actualiza estado e inventario de controles, muestra comandos ejecutados y su resultado, limita los pendientes concretos y guarda SIGUIENTE_PASO.

Objetivo: convertir los componentes visuales en una aplicación utilizable con el motor real.

Conecta Nueva descarga, probe, campos editables, carpeta/categoría, opciones avanzadas y botones Descargar ahora/Después/Cola al runtime. Estado Comprobando/Desconocido/No reanudable confirmado correctamente. Cierra el diálogo solo tras aceptación durable del trabajo; si falla, conserva lo introducido y muestra el error. No uses URLs o velocidades de fixtures en el producto.

Conecta lista, búsqueda básica, datos de fila, sparkline, expansión, pausa/reanuda, cancelar, reintentar, abrir carpeta y detalles al snapshot/eventos versionados. Coalesce eventos y recupera snapshot si hay un hueco. Operaciones idempotentes y ausencia de doble alta al pulsar dos veces. UI optimista solo con reconciliación y rollback claros.

Implementa X→bandeja predeterminado, opción Cerrar/Preguntar, instancia única y menú de bandeja. Cerrar UI no detiene descargas; Salir completamente sí hace shutdown coordinado con checkpoints y advertencia de descargas no reanudables. No reiniciar por reconexiones automáticas del host tras salida explícita. Al reabrir recuperar estado sin nuevas descargas duplicadas.

Implementa asistente breve persistente: bienvenida, Known Folder Descargas y carpeta elegida, paso navegador con estado real/omitible y AutoPick. Por ahora un navegador no configurado se muestra así; no simular que instalar una extensión es una acción ya terminada. Configuración guarda tema, vista, carpeta, X y opciones implementadas.

Notificaciones configurables y acciones útiles; por defecto fin/error, sin sonidos. Mini ventana de progreso y drop target opcionales, inicialmente apagados. Acciones de abrir archivos no se ejecutan automáticamente ni desde un dato no validado.

E2E con servidor controlado: añadir archivo, observar progreso real, pausar, minimizar, reabrir, continuar, completar y abrir carpeta correcta. Probar cierre completo, destino existente, error de disco y falta de conexión. Audita cada control conectado en UI_CONTROL_INVENTORY.

## Control de versiones y documentación

Respeta `docs/GITHUB_WORKFLOW.md`. Revisa el diff y secretos, actualiza el README y la guía afectada cuando cambie el uso o la instalación, realiza commits coherentes y push a la rama de trabajo en `sredgarr/IDG`. No confundas esta subida autorizada con publicar releases o extensiones. Informa rama, commit y resultado real; sin acceso, deja el push pendiente explícitamente.
