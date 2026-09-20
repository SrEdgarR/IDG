# ADR 014 — Organización durable y programación de una sola ejecución

Estado: aceptado para el incremento de colas de fase 06. No cambia stack ni alcance.

El runtime es el único escritor. La migración 004 conserva los trabajos y preferencias anteriores; añade configuración de organización y recibos de operaciones protegidos mediante DPAPI. Los cambios de cola y sus trabajos se confirman en una transacción. Reutilizar un identificador con otra operación se rechaza; repetir la misma operación devuelve el recibo original.

Cada trabajo conserva su solicitud de creación original. Su cola y posición son metadatos separados; no se mueve un trabajo activo para evitar sobrescribir el checkpoint del trabajador. Eliminar una cola exige una cola de destino y no elimina trabajos ni archivos. Detener una cola impide nuevos inicios; pausar activas es otra operación.

El planificador reparte plazas por turnos entre colas ejecutables, empezando por prioridad y manteniendo un cursor que evita inanición. Aplica el menor límite disponible entre capacidad global y concurrencia de cola; los presupuestos globales, por origen y por trabajo del motor siguen vigentes. Una descarga explícita tampoco elude la concurrencia de su cola.

La programación inicial es un instante único UTC (segundos hasta 2106), elegido mediante fecha ISO y zona explícita. La interfaz muestra también la hora del equipo. El estado aplicado se persiste antes de iniciar trabajos: retroceder el reloj o repetir una hora por horario de verano no vuelve a aplicarlo. Hasta 15 minutos de retraso se recupera; después se marca vencido. Requiere runtime activo y Windows despierto. Editar el mismo instante no restablece un horario consumido.

La energía requiere una activación explícita independiente de guardar la cola. Se consume durablemente antes de iniciar una cuenta atrás monotónica de 60 segundos. Reiniciar el runtime cancela esa cuenta; nunca la restaura ni reintenta la acción. Solo todos los trabajos completados y publicados, sin trabajadores, registros inaccesibles ni horarios pendientes permiten continuar. Errores, cancelaciones, pausas y descargas diferidas bloquean; acciones distintas entre colas también bloquean. Cambiar la organización cancela la cuenta atrás.

Windows recibe una operación fija, sin shell, elevación ni cierre forzado de aplicaciones. Se habilita temporalmente un privilegio ya presente en el token y se restaura; su ausencia es un error. La aceptación de Windows no acredita que el apagado termine. Las pruebas usan exclusivamente el adaptador simulado.

Fuentes oficiales verificadas: [ExitWindowsEx](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-exitwindowsex), [SetSuspendState](https://learn.microsoft.com/en-us/windows/win32/api/powrprof/nf-powrprof-setsuspendstate).
