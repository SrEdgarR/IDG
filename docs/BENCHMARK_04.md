# Benchmark local de fase 04

45 ejecuciones conservadas: cinco modos × tres condiciones × tres repeticiones. [Datos completos](benchmarks/fase04.json), [script](../scripts/benchmark-segments.mjs) y [reproducción](SEGMENTATION_DEVELOPMENT.md). No es una comparación con IDM ni una predicción de velocidad en Internet.

Entorno: Windows 11 x64, kernel 10.0.26200, AMD Ryzen 7 5700X 8-Core Processor, 16 hilos lógicos, 31.9 GiB RAM; Node v24.14.0, Rust 1.98.1, perfil release. Archivos temporales en el volumen local del workspace; no se caracterizó su hardware de almacenamiento. Un trabajo por caso, 16 MiB +13 bytes, SHA esperado f1808c3366e106973e30f4fa360e5355f36284aa0f299705ef9ee0a0d9648fc3.

Servidor Node HTTP/1.1 loopback, 4 MiB/s por cuerpo/conexión activa, o 4 MiB/s compartidos entre todas las solicitudes; una solicitud activa por conexión en esta prueba. El escenario sin rangos omite Accept-Ranges y mantiene una sola transferencia aunque se soliciten 4/8/16/Automático. No se midió HTTP/2 ni conexiones TCP como contador independiente. El presupuesto de origen/global se fija a 32 exclusivamente en cada runtime aislado del benchmark.

| Condición | Modo | Media s (mín–máx) | CPU ms media | RSS observado máx MiB | Bytes adicionales medios |
|---|---|---:|---:|---:|---:|
| Límite por conexión HTTP/1.1 | 1 | 4.433 (4.399–4.461) | 203.1 | 14.31 | 0 |
| Límite por conexión HTTP/1.1 | 4 | 1.517 (1.471–1.570) | 197.9 | 10.39 | 32768 |
| Límite por conexión HTTP/1.1 | 8 | 0.965 (0.924–0.992) | 140.6 | 10.61 | 38229 |
| Límite por conexión HTTP/1.1 | 16 | 0.699 (0.663–0.717) | 93.8 | 11.55 | 38229 |
| Límite por conexión HTTP/1.1 | Automático | 2.549 (2.520–2.597) | 130.2 | 10.28 | 32768 |
| Límite total compartido | 1 | 4.346 (4.330–4.364) | 203.1 | 9.80 | 0 |
| Límite total compartido | 4 | 4.135 (4.123–4.159) | 171.9 | 10.46 | 43691 |
| Límite total compartido | 8 | 4.144 (4.128–4.155) | 218.8 | 10.64 | 38229 |
| Límite total compartido | 16 | 4.126 (4.119–4.134) | 161.5 | 11.21 | 43691 |
| Límite total compartido | Automático | 4.188 (4.174–4.204) | 208.3 | 10.36 | 43691 |
| Sin rangos | 1 | 4.369 (4.354–4.382) | 213.5 | 9.80 | 0 |
| Sin rangos | 4 | 4.376 (4.361–4.400) | 182.3 | 9.76 | 0 |
| Sin rangos | 8 | 4.343 (4.318–4.377) | 135.4 | 9.82 | 0 |
| Sin rangos | 16 | 4.337 (4.317–4.363) | 166.7 | 9.75 | 0 |
| Sin rangos | Automático | 4.366 (4.336–4.390) | 192.7 | 9.84 | 0 |

Todos los archivos terminaron con el SHA esperado. Los bytes útiles fueron siempre 16.777.229; los adicionales son cuerpos emitidos por el servidor menos bytes finales, incluidos datos descartados al cerrar el GET inicial. No representan retransmisiones TCP medidas. La conversión cuesta unos 32–64 KiB adicionales en esta ejecución.

Con límite por conexión hubo mejora local al paralelizar. Con límite total compartido, 4/8/16 no muestran una mejora sostenida entre sí y consumen bytes adicionales: más solicitudes no liberan ese cuello de botella. Sin rangos, todos usan realmente una solicitud y las diferencias pequeñas no acreditan una aceleración. Automático observó un objetivo máximo de dos en el escenario por conexión (archivo terminado antes de acumular ventanas suficientes) y tres, como prueba limitada, en el compartido; no se presenta ese máximo como una mejora validada. La lógica de conservar/rechazar pruebas y presión se verifica por separado.

Tiempo medido desde aceptación hasta archivo final verificado; incluye sondeo por CLI y cálculo de referencia del fixture. CPU acumulada del runtime y RSS se muestrean cada 100 ms mediante Get-Process; pueden omitir el último intervalo. La cifra baja de CPU de un caso rápido no es evidencia de menor coste total: resolución/muestreo y duración difieren. RSS es el máximo observado, no una garantía de pico absoluto. No incluye Node/servidor, CLI, PowerShell ni WebView2.

El crecimiento observado con 16 solicitudes quedó acotado en estos archivos, pero no demuestra estabilidad universal o ausencia de fugas en sesiones prolongadas. Quedan pendientes rendimiento con archivos físicos >4 GiB, diez trabajos, Internet real, otros discos/equipos y Windows 10. Tres trabajos/prioridades y límites combinados se probaron funcionalmente fuera de este benchmark. No se eliminó ninguna repetición desfavorable.

Prueba funcional adicional (fuera de las 45 mediciones): con 64 MiB y límite por conexión, Automático conservó el aumento de dos a tres; con 32 MiB y límite compartido volvió a dos después de probar tres. Ambas transferencias terminaron con el hash esperado. No modifica los resultados del benchmark corto.

## Corrección del fixture compartido

Las 45 mediciones anteriores y fase04.json se conservan intactas y corresponden al código publicado en c73617f (implementación 128c01e). No acreditan el fixture corregido. La temporización antigua descartaba crédito cuando el callback se retrasaba; con un mínimo de 16 ms entregó 1,88 MiB/s con dos solicitudes y 2,84 MiB/s con tres aunque el techo configurado era 4 MiB/s. No excedía necesariamente el techo: no lo saturaba y una solicitud adicional daba una ganancia real no prevista por la prueba.

Se sustituyó únicamente el pacing compartido por un presupuesto agregado que conserva crédito hasta 256 KiB. El algoritmo de decisiones del motor no cambia. Las mediciones afectadas se repiten con `node scripts/benchmark-segments.mjs --shared-only` y se guardan separadas en artifacts/benchmark04-shared-v2.json. Las condiciones por conexión y sin rangos antiguas siguen siendo evidencia del código original, no cifras atribuidas al nuevo build.

### Serie compartida corregida (v2)

15/15 archivos terminaron con el hash esperado. Mismo equipo/Node, Rust 1.98.1 release, tamaño, tasa configurada y tres repeticiones que la serie original. El único modelo de pacing cambiado es el compartido. [Datos completos v2](benchmarks/fase04-shared-v2.json). Bytes útiles por ejecución: 16.777.229. No se inyectaron retrasos de 16 ms en este benchmark; esa inyección pertenece a las pruebas funcionales.

| Modo | Media s (mín–máx) | CPU ms media | RSS máx observado MiB | Bytes adicionales medios |
|---|---:|---:|---:|---:|
| 1 | 4.052 (4.036–4.061) | 406.3 | 9.85 | 0 |
| 4 | 4.060 (4.044–4.092) | 338.5 | 10.64 | 38229 |
| 8 | 4.060 (4.047–4.069) | 213.5 | 10.94 | 38229 |
| 16 | 4.062 (4.055–4.069) | 125.0 | 11.46 | 32768 |
| automatic | 4.062 (4.049–4.073) | 359.4 | 10.50 | 38229 |

El compartido queda alrededor de cuatro segundos en todos los modos. No demuestra ventaja de paralelizar este cuello de botella. Se conservan CPU, variabilidad y bytes adicionales, incluidos resultados desfavorables. El archivo corto puede terminar antes de evaluar una prueba de aumento: la decisión de rechazo se acredita con las transferencias de 32 MiB y sus trazas, no con el máximo de solicitudes del benchmark. Mismas limitaciones de muestreo de CPU/RSS, loopback y ausencia de prueba en Internet que el informe original.
