# ADR-004 — Pipes locales protegidos

Estado: aceptada como diseño; ACL y validación concretas pendientes. Fecha: 2026-09-19.

## Contexto y decisión

Desktop y hosts usan named pipes locales con acceso restringido al usuario esperado, rechazo de clientes remotos y comprobación de identidad del extremo. Limitar mensajes antes de reservar memoria. No usar el descriptor predeterminado como garantía de seguridad: [Microsoft](https://learn.microsoft.com/en-us/windows/win32/ipc/named-pipe-security-and-access-rights) documenta accesos predeterminados más amplios.

## Alternativas y consecuencias

TCP local requiere otra superficie de autenticación y amenaza; el contrato del proyecto no lo autoriza como sustituto. Un nombre impredecible no reemplaza la ACL. La defensa frente a un pipe falso exige validar el servidor y resolver carreras, con APIs por seleccionar en 01.

## Hipótesis y prueba pendiente

En 01 probar usuario autorizado, cliente inesperado, pipe falso, acceso remoto rechazado, framing truncado y carga excesiva. No afirmar validación de clientes antes de esas pruebas. Requisitos EXT-02, SEC-06; [Arquitectura §4](../ARCHITECTURE.md).
