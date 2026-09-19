# 00 — Repositorio GitHub, README y fundaciones

Lee AGENTS.md, docs/README.md, PRODUCT_SPEC, ARCHITECTURE, INTERFAZ, DESIGN_SYSTEM, UI_CONTROL_INVENTORY, GITHUB_WORKFLOW, TEST_PLAN e IMPLEMENTATION_STATUS. Inspecciona la carpeta antes de cambiarla. Ejecuta únicamente esta fase: creación/versionado y base documental, no toda la aplicación.

## A. Crear el repositorio de destino

El propietario ha indicado que quiere un repositorio nuevo en su cuenta **sredgarr**, con identificador **IDG** y título **IDG — Internet Download Genious**. El primer mensaje autoriza crearlo público y subir exclusivamente archivos propios de IDG; no autoriza releases, otros proyectos o acciones destructivas.

Comprueba autenticación y permisos con la integración disponible o CLI. Consulta `sredgarr/IDG` antes de crear; un fallo de acceso no prueba ausencia. Si ya existe, inspecciona y conserva contenido compatible. Ante otro proyecto o conflicto, no lo sustituyas y deja la escritura pendiente.

Crea el repositorio cuando el destino y autorización estén confirmados. Prepara `main` y `origin` sin reinicializar repositorios ajenos ni sobrescribir remotos. Sigue GITHUB_WORKFLOW para revisión previa, commit inicial y push. Si falta acceso, prepara localmente lo posible, indica la autorización mínima necesaria y marca el remoto como BLOQUEADO, nunca como creado.

## B. Preparar documentación útil y decisiones

1. Revisa árbol, git status, herramientas y plataforma. Integra el kit sin perder archivos o cambios existentes. No cambies el stack por las limitaciones del entorno temporal.
2. Confirma Rust + Tauri 2 + React/TypeScript + WebExtensions, Windows 10/11 x64 inicial y GPL-3.0-only. Verifica requisitos/versiones en documentación oficial; registra toolchain/MSRV y gestor JS. Los lockfiles y scripts se crean cuando existan los paquetes.
3. Mantén **README.md para usuarios normales**, no solo para desarrolladores: qué es IDG, para qué sirve, estado real, funciones, instalación de app y extensión, primer uso, ayuda, privacidad y licencia. En este punto aclara que no hay instalador. No inventes comandos, releases, enlaces de tienda o capturas.
4. Mantén `docs/INSTALACION.md` separado de `docs/DESARROLLO.md`. El README enlaza ambas rutas. Añade requisitos y comandos comprobados conforme exista código; no presentes instrucciones previstas como pasos ya probados.
5. Escribe ADR breves sobre runtime separado, instancia única, pipes protegidos, Native Messaging, propietario de DB, contratos tipados y recuperación. Distingue decisiones de hipótesis por comprobar en fase 01.
6. Vincula los requisitos de PRODUCT_SPEC a fases, sin eliminar los complejos. Deja INTERFAZ, DESIGN_SYSTEM y el inventario como contrato obligatorio: no basta «inspirado en Vercel». No construyas todavía todas las pantallas.
7. Incorpora texto auténtico completo GPL-3.0-only, guía de contribución, SECURITY y avisos de terceros que procedan; comprobar licencias antes de atribuirlas. No añadir condiciones incompatibles ni secretos.
8. Revisa `.gitignore`/`.gitattributes`, excluye temporales, builds y datos privados; conserva lockfiles, fuentes, pruebas y ejemplos seguros. Owner/repo ya están definidos como `sredgarr/IDG`; solo la creación verificada y los datos de distribución pendientes deben registrarse como tales. IDs de tienda y claves de firma siguen pendientes.

## C. Versionar y comprobar

Revisa archivos, enlaces locales de documentación y diff antes de stage/commit. Usa identidad Git real configurada, sin inventar correo ni cambiar ajustes globales. Realiza un primer commit coherente y súbelo al remoto comprobado. Si la preparación necesitó varios commits, que tengan sentido y no sean ruido.

Verifica repositorio, rama y SHA remoto. Muestra resultado real del push, archivos cambiados, comprobaciones ejecutadas y límites del entorno. No marques funciones del descargador como implementadas por haber escrito documentación.

Actualiza IMPLEMENTATION_STATUS con creación/versionado verificados o bloqueo real, alcance, pruebas y SIGUIENTE_PASO: fase 01. El nombre de despliegue ya no está por elegir; identidad de extensiones, artefactos, firmas y publicación de versiones sí pueden seguir pendientes.

**Criterio de salida:** repositorio inicializado y primera subida verificada cuando hay acceso; README comprensible y honesto; documentación visual explícita; decisiones y requisitos trazables. Un bloqueo de autenticación se informa, no se oculta ni impide preparar lo local. No avances a fase 01 en esta tarea.
