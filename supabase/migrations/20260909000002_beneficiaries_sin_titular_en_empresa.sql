-- ============================================================================
-- Una venta de EMPRESA no lleva beneficiario titular
-- ============================================================================
-- La razon social NO es beneficiaria de si misma: en un contrato corporativo no
-- hay fila de titular, no hay `is_primary` y `titular_amount` es 0 (ver
-- CLAUDE.md, "Venta a EMPRESA"). Quien declara salud y cobra cobertura es cada
-- EMPLEADO de la nomina y cada uno de sus adherentes.
--
-- La pestaña DDJJ Salud violaba eso: cuando la venta no tenia ningun
-- beneficiario `is_primary` anteponia un "titular virtual" armado con el cliente
-- de la venta —que en una venta de empresa es la EMPRESA— y al guardar ese paso
-- insertaba la razon social como beneficiaria. Esa fila caia en `sueltos` de
-- `agruparNomina`, se imprimia en el contrato y la sumaba
-- `recalculate_sale_total_amount`.
--
-- El front ya no ofrece ese paso (SaleDDJJTab arma los pasos desde la nomina),
-- pero la guarda va tambien en la base para que sobreviva a un revert de
-- Lovable, que es la regla de defensa en profundidad del proyecto.
--
-- Se EXTIENDE la funcion existente `beneficiaries_validate_nomina()` en vez de
-- sumar un septimo trigger a `beneficiaries`: mismo nombre, misma firma, mismos
-- atributos (SECURITY DEFINER + search_path=public) y el mismo trigger
-- `trg_beneficiaries_validate_nomina` (BEFORE INSERT OR UPDATE) que ya la
-- ejecuta. Sus dos validaciones previas quedan intactas.
--
-- Cero impacto: al aplicarla no existe ninguna fila que la viole (verificado en
-- US test: 0 beneficiarios `is_primary` en ventas de empresa). Una venta a
-- persona fisica no cambia en nada.
-- ============================================================================

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
