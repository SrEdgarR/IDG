# Documentación de IDG

## Empieza aquí

| Buscas… | Documento |
|---|---|
| Entender qué es IDG y si ya puede instalarse | [README principal](../README.md) |
| Instalar la aplicación y la extensión | [Instalación](INSTALACION.md) |
| Ver cómo será cada pantalla y qué hace cada control | **[Interfaz — pantallas y flujos](INTERFAZ.md)** |
| Consultar colores, tamaños, componentes y animaciones | **[Sistema visual](DESIGN_SYSTEM.md)** |
| Comprobar que ningún control se ha omitido | **[Inventario de controles](UI_CONTROL_INVENTORY.md)** |
| Crear el repositorio y mantener control de versiones | [Flujo de GitHub](GITHUB_WORKFLOW.md) |
| Preparar el entorno para programar | [Desarrollo](DESARROLLO.md) |
| Conocer todas las funciones y sus límites | [Especificación del producto](PRODUCT_SPEC.md) |
| Entender procesos, motor y extensión | [Arquitectura](ARCHITECTURE.md) |
| Revisar qué funciona realmente | [Estado de implementación](IMPLEMENTATION_STATUS.md) |
| Saber cómo verificar cada fase | [Plan de pruebas](TEST_PLAN.md) |
| Consultar las referencias técnicas | [Fuentes](SOURCES.md) |
| Entender decisiones y pruebas pendientes de arquitectura | [ADR](decisions/README.md) |
| Relacionar requisitos, pantallas y fases | [Trazabilidad](TRACEABILITY.md) |
| Contribuir o reportar problemas de seguridad | [Contribución](../CONTRIBUTING.md) / [Seguridad](../SECURITY.md) |

## Para Astra o cualquier agente de desarrollo

Comienza con [AGENTS.md](../AGENTS.md) y [el primer mensaje](../PRIMER_MENSAJE_ASTRA.md). Ejecuta una fase por tarea; el orden está en [LEEME_PRIMERO.md](../LEEME_PRIMERO.md).

**La interfaz sí es parte del contrato:** `INTERFAZ.md` describe pantallas y flujos; `DESIGN_SYSTEM.md` define su apariencia; `UI_CONTROL_INVENTORY.md` relaciona los controles con implementación y pruebas. Leer uno no sustituye leer los otros dos.

Los documentos describen requisitos; solo `IMPLEMENTATION_STATUS.md`, respaldado por código y pruebas, puede registrar funciones como verificadas. Mantén el README comprensible y actualizado, sin transformar requisitos futuros en publicidad de funciones inexistentes.
