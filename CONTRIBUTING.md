# Contribuir a IDG

IDG está en fase documental. Lee [el estado real](docs/IMPLEMENTATION_STATUS.md), [AGENTS.md](AGENTS.md) y [el flujo GitHub](docs/GITHUB_WORKFLOW.md) antes de modificarlo. La licencia de las contribuciones al proyecto es GPL-3.0-only; aporta solo material propio o con permisos compatibles y conserva los avisos necesarios.

1. Describe el problema y el alcance en una issue sin datos privados. Los cambios de stack, plataforma, licencia o alcance sustancial requieren aprobación del propietario.
2. Trabaja en una rama por tarea, desde `main`, conservando cambios anteriores. Implementa solo la fase asignada.
3. Respeta [interfaz](docs/INTERFAZ.md), [sistema visual](docs/DESIGN_SYSTEM.md) e [inventario de controles](docs/UI_CONTROL_INVENTORY.md). Un control simulado no es una función terminada.
4. Ejecuta las comprobaciones disponibles en [Desarrollo](docs/DESARROLLO.md) y las pruebas pertinentes del [plan](docs/TEST_PLAN.md). Registra tanto resultados como omisiones en el estado de implementación.
5. Revisa diff, secretos, archivos y licencias; realiza commits descriptivos y una pull request con problema, cambios, pruebas y límites. No hagas force-push ni merge automático.

En fase 00 no existen scripts de build, lint ni pruebas del producto. No inventes resultados ni instales herramientas del sistema sin consentimiento. Los paquetes, scripts y lockfiles llegarán en la fase 01. Problemas de seguridad: [SECURITY.md](SECURITY.md).
