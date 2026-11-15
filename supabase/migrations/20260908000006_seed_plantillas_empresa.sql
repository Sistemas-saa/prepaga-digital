-- =====================================================================
-- Seed de las plantillas del contrato de EMPRESA y del anexo de movimiento
-- Fecha: 2026-09-08
--
-- QUÉ HACE
-- Carga en `templates` los 2 documentos que necesita una venta corporativa:
--   · CONTRATO COLECTIVO DE EMPRESA   (template_type='contrato_empresa')
--     Lista a los empleados con su plan y sus adherentes anidados.
--   · ANEXO DE MOVIMIENTO DE NÓMINA   (template_type='anexo_movimiento')
--     Sirve para ALTA y para BAJA: es el mismo documento, y la variable
--     {{movimiento}} dice cuál es. Se emite sobre la venta-operación
--     (sale_type='alta_adherente', serie ANX-YYYY-NNNNNN).
--
-- POR QUÉ
-- Mismo motivo que 20260822000002: el código del flujo ya está (columnas de
-- nómina, triggers, hooks, pestañas) y el motor `src/lib/enhancedTemplateEngine.ts`
-- ya interpola todas sus variables —{{#empleados}}, {{#sus_adherentes}},
-- {{rol}}, {{plan_nombre}}, {{depende_de}}, {{movimiento}}—, pero sin la
-- plantilla en la base no hay NADA que adjuntar a la venta y el flujo es
-- inutilizable.
--
-- El HTML es copia literal de:
--   docs/plantilla-contrato-empresa.html
--   docs/plantilla-anexo-movimiento.html
-- Si se editan esos archivos, esta migración NO se re-aplica sola: hay que
-- actualizar la plantilla desde el diseñador.
--
-- POR QUÉ `requires_signature = true`
-- Las 2 llevan {{firma_contratante}} / {{firma_contratada}}. El front las
-- clasifica como document_type='contrato' (NO 'anexo') justamente para que
-- entren al circuito de firma: `finalize-signature-link` saltea los
-- documentos 'anexo' y nunca les generaría el PDF firmado.
--
-- SEGURIDAD / IDEMPOTENCIA
--   · `ON CONFLICT (company_id, name) DO NOTHING` (índice de 20260822000001):
--     correrla dos veces no duplica, y NO pisa una plantilla que un admin
--     haya editado a mano.
--   · Se siembra para TODAS las empresas: RLS ya aísla por company_id.
--   · El RAISE NOTICE final informa insertadas vs. salteadas, para que un
--     DO NOTHING silencioso no pase inadvertido.
--   · No borra ni modifica ninguna fila existente.
-- =====================================================================

DO $seed$
DECLARE
  v_insertadas  int;
  v_empresas    int;
  v_esperadas   int;
  v_contrato_empresa text := $tpl$
<!--
  PLANTILLA: "Contrato Colectivo de Empresa"

  CUÁNDO SE USA
  En una venta cuyo titular es una EMPRESA (clients.client_type = 'empresa').
  A diferencia del contrato individual, acá no hay un titular-persona: los
  beneficiarios son los EMPLEADOS, cada uno con su plan y su cuota, y de cada
  uno cuelgan sus adherentes.

  CÓMO USARLA
  Crear una plantilla nueva en el diseñador con este nombre y pegar este HTML.
  El encabezado y el zócalo con el logo de SAMAP los agrega automáticamente
  generate-base-pdf, así que NO van acá.

  IMPORTANTE — que sea FIRMABLE
  Incluye firma_contratante y firma_contratada (entre llaves, más abajo). Esos
  campos son los que hacen que el documento se clasifique como firmable. Si se
  los saca, el contrato se generaría como adjunto y nunca se enviaría a firmar.

  LAS DOS TABLAS
  1. RESUMEN POR EMPLEADO — usa el loop de empleados, con el sub-loop de
     sus_adherentes anidado adentro. Una fila por empleado, con su plan, su
     cantidad de adherentes y el subtotal del grupo.
  2. DETALLE — usa el loop plano de beneficiarios, que ya viene ordenado como
     nómina (cada empleado seguido de su grupo) y trae las columnas rol,
     plan_nombre y depende_de.

  Se pueden borrar las que no se quieran: son independientes.

  OJO: el motor interpola TAMBIÉN dentro de los comentarios HTML, así que en
  este bloque los nombres van sin llaves a propósito.
-->

<div style="font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#111;">

  <h2 style="text-align:center;font-size:15px;margin:0 0 18px 0;">
    CONTRATO COLECTIVO DE ASISTENCIA MÉDICA
  </h2>

  <table style="width:100%;border-collapse:collapse;margin-bottom:6px;">
    <tr>
      <td style="padding:3px 0;width:60%;"><strong>Razón Social:</strong> {{cliente.razonSocial}}</td>
      <td style="padding:3px 0;text-align:right;"><strong>R.U.C.:</strong> {{cliente.ruc}}</td>
    </tr>
    <tr>
      <td style="padding:3px 0;"><strong>Domicilio:</strong> {{cliente.direccion}} - {{cliente.ciudad}}</td>
      <td style="padding:3px 0;text-align:right;"><strong>Contrato Nº:</strong> {{venta.numeroContrato}}</td>
    </tr>
    <tr>
      <td style="padding:3px 0;"><strong>Contacto:</strong> {{cliente.telefono}} · {{cliente.email}}</td>
      <td style="padding:3px 0;text-align:right;"><strong>Inicio de vigencia:</strong> {{venta.fechaInicioContrato}}</td>
    </tr>
  </table>

  <p style="margin:0 0 12px 0;text-align:justify;">
    La CONTRATANTE incorpora a la cobertura de asistencia médica a los funcionarios
    detallados a continuación, y a los adherentes a cargo de cada uno de ellos, con
    los beneficios y obligaciones que corresponden al plan contratado por cada
    persona.
  </p>

  <h3 style="font-size:12px;margin:14px 0 6px 0;">RESUMEN POR FUNCIONARIO</h3>

  <table style="width:100%;border-collapse:collapse;font-size:10px;">
    <thead>
      <tr>
        <th style="border:1px solid #000;padding:4px;">Nº</th>
        <th style="border:1px solid #000;padding:4px;">Funcionario</th>
        <th style="border:1px solid #000;padding:4px;">C. I. Nº</th>
        <th style="border:1px solid #000;padding:4px;">Cargo</th>
        <th style="border:1px solid #000;padding:4px;">Plan</th>
        <th style="border:1px solid #000;padding:4px;">Adh.</th>
        <th style="border:1px solid #000;padding:4px;">Cuota del grupo</th>
      </tr>
    </thead>
    <tbody>
      {{#empleados}}
      <tr>
        <td style="border:1px solid #000;padding:4px;text-align:center;">{{indice}}</td>
        <td style="border:1px solid #000;padding:4px;">{{nombreCompleto}}</td>
        <td style="border:1px solid #000;padding:4px;text-align:center;">{{dni}}</td>
        <td style="border:1px solid #000;padding:4px;">{{parentesco}}</td>
        <td style="border:1px solid #000;padding:4px;">{{plan_nombre}}</td>
        <td style="border:1px solid #000;padding:4px;text-align:center;">{{cantidadAdherentes}}</td>
        <td style="border:1px solid #000;padding:4px;text-align:right;">{{subtotalFormateado}}</td>
      </tr>
      {{#sus_adherentes}}
      <tr>
        <td style="border:1px solid #000;padding:4px;"></td>
        <td style="border:1px solid #000;padding:4px;padding-left:16px;">↳ {{nombreCompleto}}</td>
        <td style="border:1px solid #000;padding:4px;text-align:center;">{{dni}}</td>
        <td style="border:1px solid #000;padding:4px;">{{parentesco}}</td>
        <td style="border:1px solid #000;padding:4px;">{{plan_nombre}}</td>
        <td style="border:1px solid #000;padding:4px;text-align:center;">-</td>
        <td style="border:1px solid #000;padding:4px;text-align:right;">{{montoFormateado}}</td>
      </tr>
      {{/sus_adherentes}}
      {{/empleados}}
    </tbody>
  </table>

  <h3 style="font-size:12px;margin:18px 0 6px 0;">DETALLE DE PERSONAS CUBIERTAS</h3>

  <table style="width:100%;border-collapse:collapse;font-size:10px;">
    <thead>
      <tr>
        <th style="border:1px solid #000;padding:4px;">Nombre y Apellido</th>
        <th style="border:1px solid #000;padding:4px;">C. I. Nº</th>
        <th style="border:1px solid #000;padding:4px;">Fecha Nac.</th>
        <th style="border:1px solid #000;padding:4px;">Edad</th>
        <th style="border:1px solid #000;padding:4px;">Condición</th>
        <th style="border:1px solid #000;padding:4px;">Depende de</th>
        <th style="border:1px solid #000;padding:4px;">Plan</th>
        <th style="border:1px solid #000;padding:4px;">Fecha de Ingreso</th>
        <th style="border:1px solid #000;padding:4px;">Cuota</th>
        <th style="border:1px solid #000;padding:4px;">V.I</th>
      </tr>
    </thead>
    <tbody>
      {{#beneficiarios}}
      <tr>
        <td style="border:1px solid #000;padding:4px;">{{nombreCompleto}}</td>
        <td style="border:1px solid #000;padding:4px;text-align:center;">{{dni}}</td>
        <td style="border:1px solid #000;padding:4px;text-align:center;">{{fechaNacimiento}}</td>
        <td style="border:1px solid #000;padding:4px;text-align:center;">{{edad}}</td>
        <td style="border:1px solid #000;padding:4px;">{{rol}}</td>
        <td style="border:1px solid #000;padding:4px;">{{depende_de}}</td>
        <td style="border:1px solid #000;padding:4px;">{{plan_nombre}}</td>
        <td style="border:1px solid #000;padding:4px;text-align:center;">{{fecha_ingreso}}</td>
        <td style="border:1px solid #000;padding:4px;text-align:right;">{{montoFormateado}}</td>
        <td style="border:1px solid #000;padding:4px;text-align:center;">{{vigencia_inmediata_adherente}}</td>
      </tr>
      {{/beneficiarios}}
    </tbody>
  </table>

  <p style="margin:16px 0 0 0;text-align:justify;">
    Este contrato está firmado en dos copias, una para la CONTRATANTE y otra para la
    CONTRATADA. La cuota mensual por la totalidad de las personas cubiertas es de
    Guaraníes: <strong>{{monto_total}}</strong> ({{monto_total_letras}}).
  </p>

  <p style="margin:8px 0 0 0;text-align:justify;">
    Las incorporaciones y desvinculaciones posteriores de funcionarios se
    instrumentan mediante el anexo correspondiente, firmado por ambas partes, y
    surten efecto desde la fecha allí indicada.
  </p>

  <p style="margin:10px 0 0 0;">
    Asunción, {{fecha.dia}} / {{fecha.mes}} / {{fecha.anio}}
  </p>

  <table style="width:100%;margin-top:55px;border-collapse:collapse;text-align:center;">
    <tr>
      <td style="width:33%;vertical-align:bottom;">
        {{firma_contratante}}
        <div style="border-top:1px solid #555;margin-top:36px;padding-top:4px;">POR LA CONTRATANTE</div>
        <div style="font-size:10px;">{{cliente.razonSocial}} - R.U.C. {{cliente.ruc}}</div>
      </td>
      <td style="width:33%;vertical-align:bottom;">
        <!-- El ejecutivo de ventas no firma digitalmente: la línea queda para
             firma de puño y letra sobre el impreso. -->
        <div style="border-top:1px solid #555;margin-top:36px;padding-top:4px;">EJECUTIVO DE VENTAS</div>
        <div style="font-size:10px;">{{vendedor_nombre}}</div>
      </td>
      <td style="width:33%;vertical-align:bottom;">
        {{firma_contratada}}
        <div style="border-top:1px solid #555;margin-top:36px;padding-top:4px;">POR LA CONTRATADA</div>
      </td>
    </tr>
  </table>

</div>
$tpl$;
  v_anexo_movimiento text := $tpl$
<!--
  PLANTILLA: "Anexo de Movimiento de Nomina"

  CUÁNDO SE USA
  En la venta-operación que genera la pestaña "Movimientos" de un contrato ya
  firmado. Sirve para los DOS movimientos —incorporar (alta) y desvincular
  (baja)— porque es lo mismo desde el punto de vista del circuito: un anexo que
  firman el contratante y la contratada, y que recién al quedar firmado
  actualiza el contrato madre.

  CÓMO SABE SI ES ALTA O BAJA
  Con la variable movimiento (entre llaves, más abajo), que vale "ALTA" o
  "BAJA". La adosa attachGroupMonthlyTotal leyendo la fila de
  adherent_incorporations. En cualquier otra venta queda vacía.

  CÓMO USARLA
  Crear una plantilla nueva en el diseñador con este nombre y pegar este HTML.
  El encabezado y el zócalo con el logo de SAMAP los agrega automáticamente
  generate-base-pdf, así que NO van acá.

  IMPORTANTE — que sea FIRMABLE
  Incluye firma_contratante y firma_contratada (entre llaves, más abajo). Esos
  campos son los que hacen que el documento se clasifique como firmable. Si se
  los saca, el anexo se generaría como adjunto y nunca se enviaría a firmar.

  LA TABLA SE REPITE SOLA
  El bloque de beneficiarios se repite una vez por cada persona del movimiento.
  En una BAJA lista a quien sale y, si se marcó la cascada, también a sus
  adherentes: esas filas se cargan con signature_required en false, así que
  aparecen impresas pero NO se les pide firma ni se les genera DDJJ.

  OJO: el motor interpola TAMBIÉN dentro de los comentarios HTML, así que en
  este bloque los nombres van sin llaves a propósito.
-->

<div style="font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#111;">

  <h2 style="text-align:center;font-size:15px;margin:0 0 4px 0;">
    ANEXO DE MOVIMIENTO DE NÓMINA
  </h2>
  <p style="text-align:center;font-size:13px;font-weight:bold;margin:0 0 18px 0;">
    {{movimiento}}
  </p>

  <table style="width:100%;border-collapse:collapse;margin-bottom:14px;">
    <tr>
      <td style="padding:3px 0;"><strong>ID CLIENTE Nº:</strong> {{id_cliente}}</td>
      <td style="padding:3px 0;"><strong>Contratante:</strong> {{titular_nombre}}</td>
      <td style="padding:3px 0;text-align:right;"><strong>Contrato Nº:</strong> {{numero_contrato}}</td>
    </tr>
  </table>

  <p style="margin:0 0 12px 0;text-align:justify;">
    Por el presente anexo, el CONTRATANTE y la CONTRATADA dejan constancia del
    movimiento <strong>{{movimiento}}</strong> respecto de la/s siguiente/s
    persona/s, con efecto a partir de la fecha indicada en cada caso:
  </p>

  <table style="width:100%;border-collapse:collapse;font-size:10px;">
    <thead>
      <tr>
        <th style="border:1px solid #000;padding:4px;">Nombre y Apellido</th>
        <th style="border:1px solid #000;padding:4px;">C. I. Nº</th>
        <th style="border:1px solid #000;padding:4px;">Fecha Nac.</th>
        <th style="border:1px solid #000;padding:4px;">Edad</th>
        <th style="border:1px solid #000;padding:4px;">Condición</th>
        <th style="border:1px solid #000;padding:4px;">Depende de</th>
        <th style="border:1px solid #000;padding:4px;">Plan</th>
        <th style="border:1px solid #000;padding:4px;">Fecha</th>
        <th style="border:1px solid #000;padding:4px;">Cuota</th>
        <th style="border:1px solid #000;padding:4px;">Teléfono</th>
      </tr>
    </thead>
    <tbody>
      {{#beneficiarios}}
      <tr>
        <td style="border:1px solid #000;padding:4px;">{{nombreCompleto}}</td>
        <td style="border:1px solid #000;padding:4px;text-align:center;">{{dni}}</td>
        <td style="border:1px solid #000;padding:4px;text-align:center;">{{fechaNacimiento}}</td>
        <td style="border:1px solid #000;padding:4px;text-align:center;">{{edad}}</td>
        <td style="border:1px solid #000;padding:4px;">{{parentesco}}</td>
        <td style="border:1px solid #000;padding:4px;">{{depende_de}}</td>
        <td style="border:1px solid #000;padding:4px;">{{plan_nombre}}</td>
        <td style="border:1px solid #000;padding:4px;text-align:center;">{{fecha_ingreso}}</td>
        <td style="border:1px solid #000;padding:4px;text-align:right;">{{montoFormateado}}</td>
        <td style="border:1px solid #000;padding:4px;text-align:center;">{{telefono}}</td>
      </tr>
      {{/beneficiarios}}
    </tbody>
  </table>

  <p style="margin:16px 0 0 0;text-align:justify;">
    Este anexo está firmado en dos copias, una para el CONTRATANTE y otra para la
    CONTRATADA. La cuota mensual, desde el momento de la firma de este anexo, por
    todo el grupo de personas que conforman el contrato, es de Guaraníes:
    <strong>{{monto_total_grupo}}</strong>
  </p>

  <!--
    monto_total_grupo = cuota del CONTRATO COMPLETO ya con el movimiento
    aplicado: en un alta suma lo que entra, en una baja resta lo que sale.
    monto_total, en cambio, es solo el importe de esta operación — y es la base
    sobre la que se calcula la comisión, que en una baja es cero.
  -->

  <p style="margin:10px 0 0 0;">
    Asunción, {{fecha.dia}} / {{fecha.mes}} / {{fecha.anio}}
  </p>

  <table style="width:100%;margin-top:55px;border-collapse:collapse;text-align:center;">
    <tr>
      <td style="width:33%;vertical-align:bottom;">
        {{firma_contratante}}
        <div style="border-top:1px solid #555;margin-top:36px;padding-top:4px;">CONTRATANTE</div>
        <div style="font-size:10px;">{{titular_documento_label}} Nº {{titular_documento}}</div>
      </td>
      <td style="width:33%;vertical-align:bottom;">
        <!-- El ejecutivo de ventas no firma digitalmente: la línea queda para
             firma de puño y letra sobre el impreso. -->
        <div style="border-top:1px solid #555;margin-top:36px;padding-top:4px;">EJECUTIVO DE VENTAS</div>
        <div style="font-size:10px;">{{vendedor_nombre}}</div>
      </td>
      <td style="width:33%;vertical-align:bottom;">
        {{firma_contratada}}
        <div style="border-top:1px solid #555;margin-top:36px;padding-top:4px;">POR LA CONTRATADA</div>
      </td>
    </tr>
  </table>

</div>
$tpl$;
BEGIN
  SELECT count(*) INTO v_empresas FROM public.companies;
  v_esperadas := v_empresas * 2;

  WITH nuevas AS (
    INSERT INTO public.templates
      (company_id, name, description, content, template_type, is_active, requires_signature)
    SELECT c.id, v.name, v.description, v.content, v.template_type, true, true
      FROM public.companies c
      CROSS JOIN (VALUES
        ('Contrato Colectivo de Empresa',
         'Contrato de una venta cuyo titular es una empresa. Lista a los empleados con su plan y su cuota, y los adherentes a cargo de cada uno.',
         v_contrato_empresa::text,
         'contrato_empresa'),
        ('Anexo de Movimiento de Nomina',
         'Anexo de alta o baja de personas sobre un contrato ya firmado. La variable movimiento indica cual de los dos es. Se emite sobre la venta-operacion (sale_type=alta_adherente).',
         v_anexo_movimiento::text,
         'anexo_movimiento')
      ) AS v(name, description, content, template_type)
    ON CONFLICT (company_id, name) DO NOTHING
    RETURNING 1
  )
  SELECT count(*) INTO v_insertadas FROM nuevas;

  RAISE NOTICE 'Seed plantillas de empresa: % empresa(s) x 2 = % esperadas, % insertadas, % ya existían (no se pisaron).',
    v_empresas, v_esperadas, v_insertadas, v_esperadas - v_insertadas;

  IF v_insertadas < v_esperadas THEN
    RAISE NOTICE 'Revisá las salteadas: si alguien creó a mano una plantilla con el mismo nombre y otro contenido, el vendedor podría estar usando la equivocada. SELECT company_id, name, template_type FROM public.templates WHERE name IN (''Contrato Colectivo de Empresa'', ''Anexo de Movimiento de Nomina'');';
  END IF;
END
$seed$;

-- ---------------------------------------------------------------------
-- VERIFICACIÓN — las 2 filas deben decir OK
-- ---------------------------------------------------------------------
SELECT 'hay una plantilla de contrato de empresa por empresa' AS chequeo,
       CASE WHEN (SELECT count(*) FROM public.templates WHERE template_type='contrato_empresa')
                 >= (SELECT count(*) FROM public.companies)
       THEN 'OK' ELSE 'FALTAN' END AS estado
UNION ALL
SELECT 'hay una plantilla de anexo de movimiento por empresa',
       CASE WHEN (SELECT count(*) FROM public.templates WHERE template_type='anexo_movimiento')
                 >= (SELECT count(*) FROM public.companies)
       THEN 'OK' ELSE 'FALTAN' END;
