# IDG — Instrucciones para agentes

## Producto y decisiones
Internet Download Genious (IDG) es un gestor de descargas gratuito y abierto para Windows 10/11. Prioridad: integridad de los archivos, descarga eficiente, poco consumo e interfaz sencilla inspirada en Vercel. Motor independiente en Rust; escritorio Tauri 2 + React + TypeScript; extensión WebExtensions. Licencia prevista del código del producto: GPL-3.0-only. No cambiar stack, plataforma, alcance o licencia sin una justificación registrada y aprobación del propietario.

Lee `docs/README.md`, `docs/PRODUCT_SPEC.md`, `docs/ARCHITECTURE.md`, `docs/INTERFAZ.md`, `docs/DESIGN_SYSTEM.md`, `docs/UI_CONTROL_INVENTORY.md` y `docs/GITHUB_WORKFLOW.md` al iniciar el proyecto. En tareas posteriores, consulta las secciones pertinentes, `docs/IMPLEMENTATION_STATUS.md` y el prompt asignado. `docs/TEST_PLAN.md` define las pruebas. Las referencias técnicas están en `docs/SOURCES.md`; verifica las API actuales antes de usarlas.

## Forma de trabajar
- Inspecciona primero el repositorio, el entorno y los cambios existentes. No sobrescribas trabajo ajeno ni reinicialices un proyecto ya creado.
- Ejecuta solo la fase solicitada. Propón un plan breve y después implementa; no te limites a explicar cómo lo harías. Divide una fase grande en incrementos comprobables sin declararla terminada prematuramente.
- Conserva decisiones válidas. No reconstruyas la interfaz o el motor completo para resolver un problema local.
- Usa versiones estables compatibles, lockfiles y dependencias justificadas. No inventes API, paquetes, permisos de navegador, endpoints, IDs de tienda, credenciales ni resultados de pruebas.
- Registra decisiones no definidas de bajo riesgo. Pregunta únicamente por datos realmente bloqueantes, acciones destructivas, servicios externos, publicación o cambios sustanciales de alcance.
- El primer mensaje autoriza crear el nuevo repositorio `sredgarr/IDG` y subir allí código/documentación de IDG. Aplica `docs/GITHUB_WORKFLOW.md`: comprobar identidad/destino, revisar secretos y conservar trabajo previo. La creación o el push solo se declaran realizados con evidencia remota.
- Esa autorización no incluye borrar repositorios, force-push, cambiar otros proyectos/cuentas, publicar releases/extensiones, instalar componentes del sistema sin consentimiento o modificar permisos ajenos. Las pruebas destructivas solo usan directorios temporales propios.

## Calidad y seguridad
- No hay botones decorativos, controles que solo muestran un toast de éxito, descargas simuladas en producción ni porcentajes inventados. Fixtures exclusivamente en pruebas o una galería de desarrollo separada.
- Una función está terminada cuando interfaz, contrato, lógica, persistencia y pruebas pertinentes están conectados. Los estados temporalmente no disponibles deben explicar la razón.
- Cada nueva lógica o corrección debe incorporar o actualizar pruebas capaces de detectar una regresión en sus decisiones, límites y errores. Elige el nivel adecuado (unitario, componente, integración o extremo a extremo); no añadas un test trivial por cada función ni sustituyas una integración real por mocks.
- No prometas ausencia de errores, velocidad superior a otra aplicación ni compatibilidad universal sin evidencias. No ocultes pruebas omitidas, fallidas o no ejecutables en este entorno.
- El core no depende de React/Tauri. Solo el runtime controla las descargas y escribe el estado persistente. Usa IPC tipado, validación de entradas, límites y permisos mínimos.
- No registres cookies, Authorization, contraseñas, tokens, URLs firmadas completas ni datos privados en logs o capturas. No envíes estos datos a telemetría.
- No ejecutes archivos descargados automáticamente. No desactives TLS, antivirus, comprobaciones de firma o protecciones de Windows.
- Multimedia: contenido accesible y autorizado, sin extracción de claves ni evasión de DRM. Una limitación se informa, no se disimula.

## Comprobación y entrega
La fase 00 mantiene `README.md` como entrada para usuarios no técnicos y separa compilación en `docs/DESARROLLO.md`. Al crear los scripts en sus fases, documenta los comandos reales de setup, formato, lint, pruebas y build; no afirmes que ejecutaste comandos inexistentes. Actualiza README/INSTALACION con el estado real, no con funcionalidades futuras presentadas como existentes.

Tras cada incremento, revisa diff y secretos, realiza un commit coherente y push a la rama de IDG conforme al flujo autorizado. Comunica rama, SHA y resultado real del push. Si no hay acceso, registra el bloqueo y conserva el trabajo local; no inventes la publicación.

Al finalizar cada tarea: resume cambios, archivos relevantes y comprobaciones con su resultado real; indica limitaciones y cómo probar manualmente. Actualiza `docs/IMPLEMENTATION_STATUS.md`, vinculando requisitos, código y pruebas. Distingue PLANIFICADO, EN_CURSO, IMPLEMENTADO_NO_VERIFICADO, VERIFICADO, BLOQUEADO y DIFERIDO. Guarda el siguiente paso concreto para continuar en otra sesión.
