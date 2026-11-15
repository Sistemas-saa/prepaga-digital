-- ============================================================================
-- Agendado diario del aviso de vencimiento (pg_cron)
-- ============================================================================
-- Va en su PROPIO archivo, separado de 20260910000002, a proposito.
--
-- Cada archivo de migracion corre dentro de una unica transaccion. Si
-- `CREATE EXTENSION pg_cron` o `cron.schedule` fallan —la extension no
-- habilitada en ese proyecto, permisos, `cron.database_name` distinto— se
-- revierte TODO el archivo. Metido junto con las funciones, un fallo del
-- agendado se llevaria puestas `auth_user_of_profile`, `notify_expiring_sales` y
-- el indice de idempotencia, dejando la columna de 20260910000001 aplicada pero
-- el resto no: el peor de los estados intermedios.
--
-- Aca aislado, si esto falla, lo unico que queda pendiente es el agendado. La
-- funcion sigue instalada y se la puede llamar a mano o agendar despues, una vez
-- habilitada la extension desde Database → Extensions.
--
-- No hay precedente de pg_cron en ninguna otra migracion de este repo (los 2
-- jobs que corren en BR prod se crearon fuera de version), asi que no se puede
-- dar por hecho que la extension este disponible en todos los entornos.
--
-- Horario: la base corre en UTC y Paraguay es UTC-4, asi que 12:00 UTC son las
-- 08:00 de la manana aca — el vendedor se encuentra el aviso al empezar el dia.
--
-- Idempotente: el unschedule previo permite re-agendar aunque cambie el comando
-- o el horario, sin duplicar el job.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
BEGIN
  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'notify-expiring-sales';
END;
$$;

SELECT cron.schedule(
  'notify-expiring-sales',
  '0 12 * * *',
  $$SELECT public.notify_expiring_sales(30);$$
);
