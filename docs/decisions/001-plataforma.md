# ADR-001 — Plataforma, licencia y herramientas

Estado: aceptada como diseño, no verificada por compilación. Fecha: 2026-09-19.

## Contexto y decisión

Conservar Windows 10/11 x64, Rust para core/runtime, Tauri 2 + React/TypeScript y WebExtensions, SQLite local y GPL-3.0-only. No hay necesidad de backend o cuenta. El contrato visual obligatorio sigue en INTERFAZ, DESIGN_SYSTEM e inventario CTL; no se sustituye por una interpretación estética.

Base propuesta reproducible: Rust **1.98.1**, target `x86_64-pc-windows-msvc`, edición 2024 y MSRV inicial de proyecto **1.98.1**, pendiente de build. Es una política conservadora, no una medición del compilador mínimo posible. El manifiesto stable oficial consultado publica esa versión; no se instalaron herramientas. Node **24 LTS**, con **24.14.0** observado localmente, y **pnpm 12.4.2** como único gestor JS. Véanse requisitos, fuentes y límites en [Desarrollo](../DESARROLLO.md).

## Alternativas y consecuencias

Electron, servicios elevados y otras plataformas no corresponden al alcance acordado. npm está disponible, pero no hay paquetes previos que obliguen a usarlo como gestor del proyecto. pnpm sigue la preferencia de arquitectura. No crear paquetes vacíos ni lockfiles ficticios en 00.

## Hipótesis y prueba pendiente

En 01 fijar `rust-toolchain.toml`, `rust-version`, `packageManager` y versiones estables exactas de Tauri/React/TypeScript con lockfiles reales. Comprobar resolución y build MSVC; subir el MSRV solo con justificación. Verificar dependencias C++/SDK y WebView2 antes de instalar nada. Windows 10 sigue sin prueba; el entorno Windows 11 no acredita compatibilidad del programa.
