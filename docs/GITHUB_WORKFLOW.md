# GitHub y control de versiones — IDG

## 1. Destino y alcance

| Dato | Valor |
|---|---|
| Propietario solicitado | `sredgarr` |
| Nombre del repositorio | `IDG` |
| Título visible del proyecto | `IDG — Internet Download Genious` |
| Visibilidad del nuevo repositorio | Pública, propuesta en el primer mensaje por el objetivo open source |
| Rama principal | `main` |
| Remoto local | `origin`, solo después de verificar el destino |
| Estado al entregar este kit | Repositorio no creado ni consultado por este kit; creación encargada a Astra |

`IDG` es el identificador corto elegido para el repositorio; el nombre desarrollado se utiliza en README, aplicación y descripción. No cambiarlo por otro sufijo o cuenta sin indicarlo.

Al recibir el primer mensaje, Astra tiene autorización para crear este repositorio nuevo y publicar allí código/documentación de IDG mediante commits y push. **No** incluye otros proyectos, cambio de visibilidad de un repositorio existente, borrado, force-push, releases públicas, publicación en tiendas, acceso a secretos nuevos ni cambios de cuenta.

## 2. Comprobar antes de crear

Usar primero una integración de GitHub disponible; si se usa CLI, verificar su autenticación y la identidad efectiva. No pedir tokens o claves por chat, no imprimirlos y no guardarlos en archivos del proyecto.

Consultar el destino exacto `sredgarr/IDG`. Si existe, inspeccionar propietario, descripción, contenido y ramas antes de decidir que corresponde a IDG. Conservar contenido compatible; si corresponde a otro proyecto, detener únicamente la escritura remota y explicar el conflicto. No borrar, renombrar o vaciar nada.

Si la consulta falla, distinguir falta de acceso, red, error de autenticación y ausencia real. Un error no prueba que un repositorio esté disponible. Si se bloquea la creación, continuar la preparación local y registrar el bloqueo sin inventar resultados.

Inspeccionar también carpeta local y repositorio padre. No ejecutar `git init` en un repositorio ajeno, no reemplazar `origin` ni ignorar cambios previos. Reutilizar una raíz IDG válida o preparar una carpeta nueva separada sin alterar la anterior.

## 3. Creación y primera subida

La CLI oficial permite crear el repositorio remoto especificando propietario/nombre, visibilidad y descripción [S17]. Ejemplo para el destino ausente, con autenticación válida:

```shell
gh repo create sredgarr/IDG --public --description "Internet Download Genious: gestor de descargas open source para Windows 10 y 11."
```

Este comando es una instrucción para la fase 00, no evidencia de que ya se haya ejecutado. Usar el equivalente de la integración disponible también es válido. No crear README/licencia remotos vacíos separados de los archivos locales si eso produce historiales innecesariamente divergentes.

Después de comprobar el resultado, preparar el repositorio local y `main` solo si no existían, configurar `origin` con la URL real devuelta y revisar el contenido que se va a subir. Si ya hay historia, conservarla y resolver su relación con el remoto sin operaciones destructivas.

El commit inicial debe contener únicamente archivos propios de IDG: README, kit, documentación, licencia cuando se incorpore, exclusiones y configuración pertinente. No subir la carpeta de trabajo completa sin revisar el diff. Usar la identidad Git ya configurada; no inventar nombre/correo ni cambiar la configuración global de usuario.

Mensaje sugerido: `docs: initialize IDG specification and project guides`.

Hacer push a `main` después de verificar archivos y exclusiones. Confirmar que el commit esperado está en el remoto mediante lectura de su referencia, no solo por la intención de ejecutar push. Si falla, guardar el commit local y detallar el motivo. No afirmar «subido» por haber creado la carpeta `.git`.

## 4. Trabajo posterior

Usar una rama por fase o arreglo, por ejemplo `feat/02-interfaz`, `fix/download-resume` o `docs/install-guide`. No crear otra si ya existe una rama adecuada con trabajo en curso.

Hacer commits pequeños, coherentes y descriptivos. Al cerrar cada incremento comprobable, revisar el diff, ejecutar pruebas disponibles, actualizar documentación y hacer push a esa rama. No crear commits vacíos solo para marcar avance. El registro de estado debe diferenciar pruebas pasadas, fallidas y no ejecutables.

Abrir una pull request al terminar una fase verificable. Mantener `main` en un estado coherente; no fusionar cambios incompletos o con errores críticos ocultos. No hacer merge automático sin autorización del propietario o una política de proyecto posterior explícita. No alterar reglas de protección ni comprar habilitaciones.

El flujo de desarrollo autorizado no obliga a publicar binarios o versiones. Releases y tiendas tienen otra aceptación y requieren artefactos, firmas y pruebas correspondientes.

## 5. Qué se versiona y qué no

Versionar fuente, tests, scripts, documentación, lockfiles, configuración de ejemplo y recursos propios/licenciados. Incluir capturas reales saneadas cuando exista una UI ejecutable, con estado de prueba identificado.

Excluir dependencias descargadas, builds generados, instaladores/binaries pesados, `.idgpart`, bases de datos de usuario, logs privados, cookies, contraseñas, tokens, certificados con clave privada y archivos personales. Una exclusión no sustituye inspeccionar lo ya seguido por Git. No publicar capturas con URLs privadas o rutas personales innecesarias.

Los certificados públicos y claves públicas de verificación pueden formar parte de la configuración cuando proceda; nunca confundirlos con la clave privada del firmante. Revisar cada caso expresamente.

## 6. README para usuarios

`README.md` en la raíz explica el proyecto a una persona no técnica; `LEEME_PRIMERO.md` explica cómo usar el kit. No sustituir el primero por instrucciones internas para agentes. La documentación de GitHub describe el README como punto de entrada para propósito y comienzo de uso [S18].

Mantener: qué es IDG, estado real, funciones verificadas frente a previstas, Windows/arquitectura comprobados, instalación de aplicación y extensión, primera configuración, uso básico, privacidad, ayuda, contribución y licencia. Separar comandos de compilación en `docs/DESARROLLO.md`.

Mientras no exista instalador, mostrar el aviso claramente al principio. Al publicar uno autorizado, sustituir la sección provisional por enlaces reales, pasos probados y capturas auténticas. No afirmar que cargar una extensión temporal es el proceso normal para usuarios finales.

## 7. Evidencia y cierre

Cada fase entrega repositorio confirmado, rama, commit real, resultado del push y pruebas. Registrar en `IMPLEMENTATION_STATUS.md` el commit de código probado cuando exista; el commit que guarda ese registro se comunica al final para evitar autorreferencias imposibles.

Si cambió el flujo de instalación o una función visible, el mismo incremento debe actualizar README y guía correspondiente. No llamar al producto versión estable por terminar una lista de prompts.

Referencias de uso de GitHub: [S17], [S18], [S19] en [SOURCES.md](SOURCES.md).

## Evidencia inicial del destino

El 2026-09-19 se verificó la cuenta SrEdgarR por integración y API autenticada. La consulta de IDG devolvió 404 y la enumeración autenticada de repositorios propios confirmó su ausencia. Se creó únicamente [SrEdgarR/IDG](https://github.com/SrEdgarR/IDG), público, sin auto_init. Esta es la capitalización canónica de la cuenta solicitada como sredgarr. Se configuraron main y origin localmente; la evidencia del commit y del push se conserva en [IMPLEMENTATION_STATUS](IMPLEMENTATION_STATUS.md).
