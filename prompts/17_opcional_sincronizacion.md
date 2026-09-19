# 17 — Ampliación opcional: sincronización cifrada

Lee AGENTS.md, el estado de implementación y las secciones aplicables de la especificación, arquitectura, sistema visual y plan de pruebas. Inspecciona el código antes de cambiarlo. Ejecuta esta fase, no todas las fases posteriores. Da un plan breve y luego implementa.

No inventes API, datos reales o resultados. Fixtures solo en pruebas/galería de desarrollo. Si el entorno no puede ejecutar Windows o navegadores, prepara las comprobaciones y marca lo no verificado; no lo declares aprobado. Al cerrar, actualiza estado e inventario de controles, muestra comandos ejecutados y su resultado, limita los pendientes concretos y guarda SIGUIENTE_PASO.

Esta fase es opcional y posterior a la base estable. El funcionamiento local sin cuenta no cambia. El usuario debe activar la sincronización y elegir destino; no crear un servicio de pago ni registrar cuentas automáticamente.

Primero implementa exportación/importación cifrada y versionada de preferencias, categorías y reglas. Para sincronizar entre PCs, ofrece una carpeta elegida explícitamente como transporte inicial, que el usuario puede sincronizar con su proveedor; no afirmes que IDG ha construido por ello una nube o transferencia de archivos. El adaptador de transporte puede ampliarse posteriormente con un endpoint aprobado.

Usa primitivas/bibliotecas criptográficas revisadas: cifrado autenticado, derivación de clave resistente con parámetros documentados, nonce correcto y un formato versionado. No inventes criptografía ni uses DPAPI como único cifrado de un archivo que debe abrirse en otra PC. El secreto del usuario no sale en claro; explica recuperación/pérdida de clave y cómo detener/eliminar la configuración de sync.

Define conflictos, revisiones, tombstones, actualización atómica del archivo, recuperación tras escritura parcial y validación de tamaño/esquema. No ejecutar reglas importadas con destinos peligrosos sin preview; rutas de otro equipo se revalidan. Cifrar antes de escribir al destino externo. Nombres/metadata que permanezcan visibles deben documentarse.

Historial redactado es opt-in aparte. Nunca sincronizar cookies, Authorization, passwords, URLs firmadas, material privado, `.idgpart`, binarios descargados o credenciales del proveedor. Una descarga en curso no migra de PC por copiar su registro.

Prueba con dos perfiles/instancias de datos de test: cambios simultáneos, clave errónea, archivo alterado, versión incompatible, rollback, duplicados y revocación de la opción. Mide ausencia de llamadas externas cuando está desactivada. Registra claramente qué sincroniza esta ampliación y qué requeriría otra fase.

## Control de versiones y documentación

Respeta `docs/GITHUB_WORKFLOW.md`. Revisa el diff y secretos, actualiza el README y la guía afectada cuando cambie el uso o la instalación, realiza commits coherentes y push a la rama de trabajo en `sredgarr/IDG`. No confundas esta subida autorizada con publicar releases o extensiones. Informa rama, commit y resultado real; sin acceso, deja el push pendiente explícitamente.
