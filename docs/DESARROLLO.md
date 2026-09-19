# Desarrollo de IDG

Guía para programar IDG; la [instalación para usuarios](INSTALACION.md) está separada. La fase 00 contiene documentación: no hay aplicación compilable, paquetes, lockfiles ni scripts de setup/build/lint/tests del producto.

## Entorno inspeccionado el 2026-09-19

| Componente | Observado | Decisión para fase 01 |
|---|---|---|
| Windows | Windows 11 Pro, 10.0.26200, 64 bits | Objetivo Windows 10/11 x64; programa sin comprobar |
| Git / GitHub | Git y GCM disponibles, cuenta SrEdgarR autenticada; gh ausente | API oficial y Git/GCM; identidad solo local |
| Node.js / npm | v24.14.0 / 11.9.0 | Línea Node 24 LTS; npm no será segundo gestor |
| pnpm | No encontrado en PATH | Fijar pnpm 12.4.2 como único gestor JS |
| Rust/Cargo | No encontrados en PATH ni rustc en ubicación convencional del usuario | Rust 1.98.1, target x86_64-pc-windows-msvc |
| C++/SDK | vswhere no devolvió instalación con VC.Tools.x86.x64 | Verificar/preparar Desktop development with C++ y Windows SDK |
| WebView2 | No comprobado en esta fase documental | Verificar runtime y registrar versión antes de Tauri |

No se instalaron componentes del sistema. Prepararlos requiere consentimiento según AGENTS.md. Estas limitaciones no bloquean documentación/Git; sí condicionan el build de fase 01.

## Versiones y requisitos contrastados

Conservar Rust + Tauri **2** + React/TypeScript + WebExtensions, SQLite local y GPL-3.0-only. [ADR-001](decisions/001-plataforma.md) registra la elección.

El [manifiesto stable oficial de Rust](https://static.rust-lang.org/dist/channel-rust-stable.toml) consultado indica **1.98.1**, fechado 2026-09-03. Toolchain y MSRV inicial de proyecto: 1.98.1, edición 2024. El MSRV es una política conservadora pendiente de build, no una medición del compilador mínimo posible. En 01 crear rust-toolchain.toml y declarar rust-version, comprobando dependencias.

[Node.js](https://nodejs.org/en/about/previous-releases) documenta la línea 24 LTS. [pnpm](https://pnpm.io/installation) admite Node 24 y Windows x64; el [registro de pnpm](https://registry.npmjs.org/pnpm/12.4.2) confirmó 12.4.2. pnpm no se ejecutó ni resolvió paquetes. Fijar packageManager y pnpm-lock.yaml con la primera instalación real, sin package-lock.json paralelo.

[Tauri](https://v2.tauri.app/start/prerequisites/) requiere herramientas C++ y WebView2 en Windows; usar Rust MSVC. En 01 fijar versiones estables exactas compatibles de Tauri 2, React, TypeScript y herramientas frontend al resolver el esqueleto. No hay dependencias instaladas para certificar esa combinación. Comprometer Cargo.lock y el lockfile JS entonces; no crear módulos vacíos en 00.

## Comprobaciones disponibles

Desde la raíz, estos comandos existen y se ejecutaron durante la preparación documental:

```powershell
git status --short --branch
git remote -v
git diff --cached --check
node --version
npm.cmd --version
```

Para comparar commit local y main publicado después del push:

```powershell
git rev-parse HEAD
git ls-remote origin refs/heads/main
```

La fase 00 revisa enlaces Markdown locales, continuidad CTL-001 a CTL-065, trazabilidad y patrones de secretos sobre el contenido a versionar. Los resultados están en [IMPLEMENTATION_STATUS](IMPLEMENTATION_STATUS.md). Una búsqueda de patrones no garantiza ausencia absoluta de secretos.

No hay comandos de setup, desarrollo, formato, lint, tests o build de IDG. En 01 documentarlos solo después de crear y ejecutar sus scripts. Separar pruebas portables del core, navegador, WebView y programa Windows real.

## Continuación

Leer [AGENTS](../AGENTS.md), [GitHub](GITHUB_WORKFLOW.md), [arquitectura](ARCHITECTURE.md), [ADR](decisions/README.md), [trazabilidad](TRACEABILITY.md) y [plan de pruebas](TEST_PLAN.md). Fases posteriores: rama por tarea y PR, sin merge automático.

En 01 crear el esqueleto mínimo y probar handshake Chromium/Firefox, registro reversible del host y carga local de extensión. Estos pasos aún no están probados. No usar IDs, firmas ni credenciales ficticios en producción.
