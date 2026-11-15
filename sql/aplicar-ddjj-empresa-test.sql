-- ============================================================================
-- US TEST (ykducvvcjzdpoojxlsig) — Una venta de EMPRESA no lleva titular
-- ============================================================================
-- PROYECTO   SAMAP Prepaga Digital
-- PROJECT_ID ykducvvcjzdpoojxlsig  (US TEST)
--
-- ⚠️ NO CORRER ESTO CONTRA PRODUCCION (ejiycfqxgtrzaysgpzmx).
--    El modulo de nomina de empresa no existe alla; ver CLAUDE.md, "Estado por
--    entorno". Fuera de ese modulo la funcion que se reemplaza aca ni siquiera
--    existe.
--
-- ----------------------------------------------------------------------------
-- POR QUE
-- ----------------------------------------------------------------------------
--   La razon social NO es beneficiaria de si misma: un contrato corporativo no
--   tiene fila de titular, no tiene `is_primary` y su `titular_amount` es 0.
--   Quien declara salud y cobra cobertura es cada EMPLEADO de la nomina y cada
--   uno de sus adherentes.
--
--   La pestaña DDJJ Salud violaba eso: si la venta no tenia ningun beneficiario
--   `is_primary`, anteponia un "titular virtual" armado con el cliente de la
--   venta —que en una venta de empresa es la EMPRESA— y al guardar ese paso
--   insertaba la razon social como beneficiaria. Esa fila caia en `sueltos` de
--   `agruparNomina`, se imprimia en el contrato y la sumaba
--   `recalculate_sale_total_amount`.
--
--   El front ya no ofrece ese paso, pero la guarda va tambien en la base para
--   que sobreviva a un revert de Lovable.
--
-- ----------------------------------------------------------------------------
-- GARANTIA DE CERO IMPACTO
-- ----------------------------------------------------------------------------
--   · Se EXTIENDE la funcion existente `beneficiaries_validate_nomina()`: mismo
--     nombre, misma firma, mismos atributos (SECURITY DEFINER, search_path) y
--     el mismo trigger que ya la ejecuta. No se crea un septimo trigger sobre
--     `beneficiaries` ni se cambia el orden de los que hay.
--   · Sus dos validaciones previas quedan textuales.
--   · Una venta a persona fisica no cambia en nada: el chequeo nuevo solo mira
--     filas `is_primary` de ventas cuyo cliente es `client_type='empresa'`.
--   · El PREFLIGHT aborta si existiera alguna fila que la nueva regla
--     rechazaria (al escribir esto: 0). Nada se aplica a medias.
--   · Idempotente: se puede correr dos veces.
-- ============================================================================

BEGIN;

-- ── 0. PREFLIGHT: nadie puede quedar en infraccion ──────────────────────────
DO $preflight$
DECLARE
  v_infractores int;
BEGIN
  SELECT count(*) INTO v_infractores
    FROM public.beneficiaries b
    JOIN public.sales s   ON s.id = b.sale_id
    JOIN public.clients c ON c.id = s.client_id
   WHERE b.is_primary IS TRUE
     AND c.client_type = 'empresa';

  IF v_infractores > 0 THEN
    RAISE EXCEPTION
      'ABORTA: hay % beneficiario(s) is_primary en ventas de EMPRESA. Depuralos antes de instalar la guarda.',
      v_infractores;
  END IF;
END;
$preflight$;

-- ── 1. La funcion, con la validacion nueva primera ──────────────────────────
CREATE OR REPLACE FUNCTION public.beneficiaries_validate_nomina()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rol_padre text;
BEGIN
  -- La razon social no es beneficiaria de si misma.
  IF NEW.is_primary IS TRUE
     AND EXISTS (SELECT 1
                   FROM public.sales s
                   JOIN public.clients c ON c.id = s.client_id
                  WHERE s.id = NEW.sale_id
                    AND c.client_type = 'empresa') THEN
    RAISE EXCEPTION
      'Una venta de EMPRESA no lleva beneficiario titular: la razon social no es beneficiaria de si misma.'
      USING ERRCODE = '23514',
            HINT = 'Cargue a las personas en la pestaña Nomina (member_role=empleado) y a sus adherentes debajo de cada una.';
  END IF;

  IF NEW.parent_beneficiary_id IS NOT NULL THEN
    SELECT member_role INTO v_rol_padre
    FROM public.beneficiaries WHERE id = NEW.parent_beneficiary_id;

    IF v_rol_padre IS DISTINCT FROM 'empleado' THEN
      RAISE EXCEPTION
        'Un adherente solo puede depender de un EMPLEADO, y ese beneficiario no lo es.'
        USING ERRCODE = '23514',
              HINT = 'La nomina tiene exactamente dos niveles: empleado -> adherentes. No se admite anidar un adherente debajo de otro.';
    END IF;
  END IF;

  IF TG_OP = 'UPDATE'
     AND OLD.member_role = 'empleado'
     AND NEW.member_role <> 'empleado'
     AND EXISTS (SELECT 1 FROM public.beneficiaries WHERE parent_beneficiary_id = NEW.id) THEN
    RAISE EXCEPTION
      'El empleado tiene adherentes a cargo: no puede dejar de ser empleado.'
      USING ERRCODE = '23514',
            HINT = 'Reasigne o elimine primero a sus adherentes.';
  END IF;

  RETURN NEW;
END;
$$;

COMMIT;

-- ── Verificacion ────────────────────────────────────────────────────────────
SELECT 'la funcion conserva SECURITY DEFINER y search_path' AS control,
       CASE WHEN (SELECT prosecdef FROM pg_proc WHERE proname='beneficiaries_validate_nomina')
             AND (SELECT proconfig::text FROM pg_proc WHERE proname='beneficiaries_validate_nomina')
                 LIKE '%search_path=public%'
       THEN 'OK' ELSE 'SE PERDIERON LOS ATRIBUTOS' END AS estado
UNION ALL
SELECT 'la guarda nueva esta en el cuerpo',
       CASE WHEN (SELECT prosrc FROM pg_proc WHERE proname='beneficiaries_validate_nomina')
                 LIKE '%no es beneficiaria de si misma%'
       THEN 'OK' ELSE 'FALTA' END
UNION ALL
SELECT 'sigue estando la validacion del padre empleado',
       CASE WHEN (SELECT prosrc FROM pg_proc WHERE proname='beneficiaries_validate_nomina')
                 LIKE '%solo puede depender de un EMPLEADO%'
       THEN 'OK' ELSE 'SE PERDIO UNA VALIDACION' END
UNION ALL
SELECT 'sigue estando la validacion de degradar un empleado con gente a cargo',
       CASE WHEN (SELECT prosrc FROM pg_proc WHERE proname='beneficiaries_validate_nomina')
                 LIKE '%no puede dejar de ser empleado%'
       THEN 'OK' ELSE 'SE PERDIO UNA VALIDACION' END
UNION ALL
SELECT 'beneficiaries sigue con sus 6 triggers (no se agrego uno nuevo)',
       CASE WHEN (SELECT count(*) FROM pg_trigger
                   WHERE tgrelid='public.beneficiaries'::regclass AND NOT tgisinternal) = 6
       THEN 'OK' ELSE 'CAMBIO LA CANTIDAD DE TRIGGERS' END
UNION ALL
SELECT 'no quedo ningun titular en una venta de empresa',
       CASE WHEN NOT EXISTS (
              SELECT 1 FROM public.beneficiaries b
                JOIN public.sales s   ON s.id = b.sale_id
                JOIN public.clients c ON c.id = s.client_id
               WHERE b.is_primary IS TRUE AND c.client_type = 'empresa')
       THEN 'OK' ELSE 'HAY FILAS EN INFRACCION' END;

-- ── Prueba de que la guarda ademas FUNCIONA (no escribe nada) ───────────────
-- Intenta insertar la razon social como beneficiaria de una venta de empresa y
-- espera el 23514. No deja rastro en ninguno de los dos desenlaces: si la
-- guarda anda, el INSERT nunca ocurre; si no anda, el RAISE final aborta el DO
-- entero y Postgres revierte el INSERT con el.
DO $prueba$
DECLARE
  v_sale_id uuid;
  v_ok      boolean := false;
BEGIN
  SELECT s.id INTO v_sale_id
    FROM public.sales s
    JOIN public.clients c ON c.id = s.client_id
   WHERE c.client_type = 'empresa'
     AND s.status NOT IN ('firmado','completado')
   LIMIT 1;

  IF v_sale_id IS NULL THEN
    RAISE NOTICE 'PRUEBA OMITIDA: no hay ninguna venta de empresa abierta para probar.';
    RETURN;
  END IF;

  BEGIN
    INSERT INTO public.beneficiaries (sale_id, first_name, last_name, is_primary)
    VALUES (v_sale_id, 'PRUEBA RAZON SOCIAL', '', true);
  EXCEPTION WHEN check_violation THEN
    v_ok := true;
  END;

  IF v_ok THEN
    RAISE NOTICE 'PRUEBA OK: la guarda rechazo el titular en la venta de empresa %.', v_sale_id;
  ELSE
    RAISE EXCEPTION 'PRUEBA FALLIDA: se pudo insertar un titular en la venta de empresa %.', v_sale_id;
  END IF;
END;
$prueba$;
