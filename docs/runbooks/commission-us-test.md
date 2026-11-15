# Comisiones — despliegue exclusivo a US test

Este runbook aplica únicamente al proyecto Supabase US test
`ykducvvcjzdpoojxlsig`. El proyecto BR producción
`ejiycfqxgtrzaysgpzmx` está expresamente prohibido durante esta fase.

## Precondiciones

- Rama `feat/liquidacion-comisiones` limpia.
- `SUPABASE_ACCESS_TOKEN` con acceso al proyecto US.
- `SUPABASE_US_DB_URL` del proyecto US; el host/usuario deben identificar de forma
  estructural el proyecto US (conexión directa o pooler).
- `generate-base-pdf` sin cambios en el diff.
- `commission_settings.is_enabled` permanece en `false`.

## Migraciones

1. Inspeccionar el dry-run obligatorio:

   `npm run commission:db:dry-run:us`

2. Si el destino y las migraciones son correctos, confirmar el ref en la sesión:

   PowerShell: `$env:CONFIRM_SUPABASE_US='ykducvvcjzdpoojxlsig'`

3. Aplicar:

   `npm run commission:db:push:us`

El wrapper rechaza cualquier URL con el ref de BR, exige el ref de US y siempre
ejecuta un dry-run antes del push real. No usar `supabase db push --linked` en este
repositorio: `supabase/config.toml` pertenece a BR.

## Edge function

Desplegar exclusivamente la función nueva:

`npm run commission:function:deploy:us`

Nunca ejecutar un deploy global de funciones. En runtime, la función también
rechaza cualquier `SUPABASE_URL` que no corresponda al ref US.

## Verificación

- Ejecutar `supabase/tests/commission_module_test.sql` en US.
- Probar RPC preview con venta sin regla: debe devolver excepción, no monto cero.
- Confirmar que generar/cerrar falla mientras el módulo esté desactivado.
- Habilitar solo para un smoke test controlado y volver a deshabilitar.
- Renderizar una liquidación cerrada de 60+ ítems y verificar branding en todas las páginas.
- Ejecutar advisors de seguridad y revisar nuevas políticas RLS.
- Revisar logs/comandos locales y confirmar que ninguna ejecución tuvo como destino
  BR; durante esta fase no se abre ninguna conexión a producción, ni siquiera de lectura.

## Rollback

El rollback normal es mantener `commission_settings.is_enabled=false` y retirar la
ruta del frontend. No eliminar tablas si existe alguna liquidación cerrada o pagada.
