# Diagnóstico del CI de fase 04

## Fallo remoto confirmado

Se descargaron los logs completos de los tres jobs de ambas ejecuciones. En ambas, ui y portable aprobaron; Windows falló en `reject shared-bottleneck trial`, línea 64 del antiguo `test-segments.mjs`:

- [Push 35477886488, Windows 105990195542](https://github.com/SrEdgarR/IDG/actions/runs/35477886488/job/105990195542): checkout `c73617fae353cfd0589bea1a4649054fbdb280a0`.
- [PR 35477888133, Windows 105990200342](https://github.com/SrEdgarR/IDG/actions/runs/35477888133/job/105990200342): checkout del merge temporal `d30b607bacab97677bd06027daa434b5134fab15`, con HEAD c73617f y base c521a4f.

Ambos árboles Git son `f40adfd6dfa79a6a4f737e499ee2908c65315f4f`. No son commits idénticos, aunque ejecutaron el mismo contenido. Los logs antiguos no guardaron ventanas de Adaptive: **no es posible reconstruir su caudal exacto ni afirmar la resolución de temporizadores de aquellos runners**.

## Reproducción y causa demostrada

Se conservó el fixture de c73617f en un archivo temporal y se inyectó un mínimo de 16 ms en sus `setTimeout`, sin cambiar Windows. El controlador recibió instrumentación numérica, sin cambiar umbrales ni decisiones. Esa ejecución reprodujo la aserción original. No se presenta como reproducción del hardware exacto de GitHub.

El antiguo `sharedDue = max(sharedDue, now) + duración` perdía capacidad cuando un callback llegaba tarde. Con cuerpos de 16 KiB y presupuesto de 4 MiB/s, cada bloque corresponde a 3,90625 ms. Con callbacks de 16 ms, dos clientes entregaron 1,877 MiB/s y tres 2,843 MiB/s. El fixture respetaba un techo, pero no establecía el cuello de botella compartido saturado que suponía la prueba. Más solicitudes permitían aprovechar capacidad perdida y producían una mejora real.

[Traza anterior completa, sin datos privados](test-evidence/adaptive-before.json):

- A los 3,022 s, Automático abrió una prueba 2→3 con referencia de **1.945.261,81 bytes/s**, medida en esa ventana.
- Las dos ventanas siguientes midieron **2.942.916,33** y **2.934.996,50 bytes/s**. Ambas superaron en más del 10% la referencia: decisión `retain` a los 5,029 s. Fue coherente con las medidas, no un error demostrado del controlador.
- El archivo aún tenía más de 20 MB pendientes al conservar tres solicitudes; el final del archivo no explicó esa decisión. Más adelante probó y conservó cuatro.
- Hubo 176 snapshots, separación máxima 91,93 ms con espera nominal de 50 ms. Se observaron 2→3→4 y ninguna bajada: en esta reproducción el probe no perdió una transición. El coste de crear procesos existe, pero no explica la aserción.

## Corrección limitada

El fixture usa un presupuesto agregado con crédito por tiempo realmente transcurrido, acotado a 256 KiB. Un solo temporizador atiende las solicitudes pendientes; los retrasos no se convierten en límites independientes por petición. `test-segment-fixture.mjs` exige que dos y tres clientes saturen al menos el 90% del presupuesto incluso con callbacks retrasados, respetando el techo y la ráfaga acotada, y verifica bytes/hash.

Adaptive conserva su política: dos ventanas consecutivas con ganancia >=10%, rechazo sin ella e histéresis/reducción por presión. Se añadieron cuatro pruebas deterministas. `sample` devuelve además el nombre de la decisión para diagnóstico; no modifica el estado de otra manera.

La integración conserva la aserción de rechazo y añade comprobaciones: tres repeticiones por condición, ganancia sostenida aceptada en el caso por conexión, ningún `retain` en el compartido, referencia exacta, decisión antes de los últimos 2 MiB, cobertura durable y hash final. Se observan decisiones numéricas emitidas por el motor, sin depender de acertar un instante por sondeo. Los snapshots continúan consultándose cada 500 ms y se informa el coste máximo del probe. Tamaños originales: 64/32 MiB; plazo explícito de 60 s por transferencia, no reintentos hasta lograr verde.

Las trazas debug son optativas y acotadas a 128 líneas por transferencia; incluyen tiempos, bytes útiles, caudal/referencia, presión, objetivo y permisos activos. No incluyen URLs, rutas ni identificadores. En release no se emiten. Los resultados de CI imprimirán estas ventanas también ante una aserción fallida.

En la primera regresión completa apareció otro fallo de observación: `timeout crash`, antes de ejecutar los escenarios Automático. La condición entre escritura y checkpoint era transitoria. Se añadió una barrera del fixture que conserva un rango parcialmente escrito hasta que se observa el estado; entonces se mata solo el runtime propio. La barrera se libera antes de reanudar. No cambia escritura, checkpoint, recuperación ni validaciones del producto.

## Evidencia y límites

Las ejecuciones fallidas anteriores se conservan como evidencia; no se han eliminado aserciones ni relajado integridad, permisos o CI. Las mediciones originales siguen intactas en [benchmark 04](BENCHMARK_04.md); el pacing compartido requiere una serie nueva separada. La [planificación de pruebas](TEST_PLAN.md) contiene los comandos reproducibles y límites.

No hay confirmación humana del motor, fusión de PR #4 ni trabajo de fase 05. Consultar [estado de implementación](IMPLEMENTATION_STATUS.md) y PR #4 para resultados finales y SHA del conjunto probado.

[Traza posterior de las seis transferencias finales](test-evidence/adaptive-after.json): tres rechazos compartidos y tres aceptaciones por conexión, todos antes del tramo final y con hash/cobertura correctos. La suite completa y Check.ps1 -Integration ejecutaron otras seis transferencias cada uno, también aprobadas: nueve repeticiones aprobadas por condición en total tras la corrección. El timeout de crash anterior queda registrado por separado; no se cuenta como una repetición aprobada.
