-- Contacto de RR.HH. del cliente EMPRESA.
--
-- POR QUÉ
-- En un contrato corporativo las altas y bajas de nómina no las gestiona el
-- titular (que es una razón social) sino una persona concreta del área de
-- Recursos Humanos. Hoy el único contacto que guarda `clients` es el genérico
-- (`email`, `phone`), que en una empresa suele ser el de administración o el de
-- facturación, y no sirve para avisar de un movimiento de personal.
--
-- Se guarda en `clients` y no en `sales` porque es un atributo de la EMPRESA:
-- si mañana tiene un segundo contrato, el contacto es el mismo.
--
-- QUÉ NO HACE
-- No pone NOT NULL ni CHECK condicional: ya hay clientes empresa cargados sin
-- estos datos, y una constraint los dejaría sin poder editarse. La
-- obligatoriedad se valida en el front, y sólo cuando client_type = 'empresa'.

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS hr_contact_name  text,
  ADD COLUMN IF NOT EXISTS hr_contact_phone text,
  ADD COLUMN IF NOT EXISTS hr_contact_email text;

COMMENT ON COLUMN public.clients.hr_contact_name IS
  'Contacto de RR.HH. de un cliente empresa: con quien se gestionan altas y bajas de nomina. NULL para personas fisicas.';

NOTIFY pgrst, 'reload schema';

-- ---------------------------------------------------------------------
-- VERIFICACIÓN — debe decir OK
-- ---------------------------------------------------------------------
SELECT 'las 3 columnas de contacto RR.HH. existen' AS chequeo,
       CASE WHEN (SELECT count(*) FROM information_schema.columns
                   WHERE table_schema='public' AND table_name='clients'
                     AND column_name IN ('hr_contact_name','hr_contact_phone','hr_contact_email')) = 3
       THEN 'OK' ELSE 'FALTA' END AS estado;
