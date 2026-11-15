-- =====================================================================
-- Seed de las plantillas de los 3 tipos de venta
-- Fecha: 2026-08-22
--
-- QUÉ HACE
-- Carga en `templates` los 3 formularios que SAMAP usa en papel:
--   · ANEXO DE INCORPORACIÓN DE ADHERENTE      (sale_type='alta_adherente')
--   · FORMULARIO DE SOLICITUD DE CAMBIO DE PLAN (sale_type='cambio_plan')
--   · ANEXO ESPECIAL DE VIGENCIA INMEDIATA      (sin tipo propio: se adjunta
--     a cualquier venta y lista los beneficiarios con V.I.)
--
-- POR QUÉ
-- El código de los 3 flujos ya está (tablas, triggers, hooks, tabs) y el
-- motor `src/lib/enhancedTemplateEngine.ts` ya interpola todas sus
-- variables. Pero las plantillas vivían sólo como HTML en `docs/`: nunca
-- se cargaron en la base, así que no había NADA que adjuntar a una venta y
-- los tres flujos eran inutilizables. Esto es el bloqueante.
--
-- El HTML es copia literal de:
--   docs/plantilla-anexo-incorporacion.html
--   docs/plantilla-solicitud-cambio-plan.html
--   docs/plantilla-anexo-vigencia-inmediata.html
-- Si se editan esos archivos, esta migración NO se re-aplica sola (ver más
-- abajo): hay que actualizar la plantilla desde el diseñador.
--
-- POR QUÉ `template_type` PROPIO
-- Las 9 plantillas preexistentes son todas 'contrato'. Con estos tipos, el
-- selector de plantillas puede recomendar la que corresponde al `sale_type`
-- de la venta (ver TEMPLATE_TYPE_BY_SALE_TYPE en src/lib/saleTypes.ts).
--
-- POR QUÉ `requires_signature = true`
-- Las 3 llevan {{firma_contratante}} / {{firma_contratada}}. El front las
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
  v_incorporacion text := $tpl$
<!--
  PLANTILLA: "Anexo de Incorporación de Adherente"

  CÓMO USARLA
  Crear una plantilla nueva en el diseñador con este nombre y pegar este HTML.
  El encabezado y el zócalo con el logo de SAMAP los agrega automáticamente
  generate-base-pdf, así que NO van acá.

  IMPORTANTE — que sea FIRMABLE
  La plantilla incluye {{firma_contratante}} y {{firma_contratada}}. Esos campos
  son los que hacen que el documento se clasifique como firmable. Si se los saca,
  el anexo se generaría como adjunto y nunca se enviaría a firmar.

  LA TABLA SE REPITE SOLA
  El bloque {{#beneficiarios}} ... {{/beneficiarios}} se repite una vez por cada
  persona que se incorpora. No hay que dejar 6 filas vacías como en el papel:
  salen exactamente las que se cargaron.
-->

<div style="font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#111;">

  <h2 style="text-align:center;font-size:15px;margin:0 0 18px 0;">
    ANEXO DE INCORPORACIÓN DE ADHERENTE
  </h2>

  <table style="width:100%;border-collapse:collapse;margin-bottom:14px;">
    <tr>
      <td style="padding:3px 0;"><strong>ID CLIENTE Nº:</strong> {{id_cliente}}</td>
      <td style="padding:3px 0;"><strong>Titular:</strong> {{titular_nombre}}</td>
      <td style="padding:3px 0;text-align:right;"><strong>Plan:</strong> {{plan.nombre}}</td>
    </tr>
  </table>

  <p style="margin:0 0 12px 0;text-align:justify;">
    El CONTRATANTE incorpora a partir de la fecha como adherente/s a la/s siguiente/s
    persona/s con los mismos beneficios y obligaciones correspondientes:
  </p>

  <table style="width:100%;border-collapse:collapse;font-size:10px;">
    <thead>
      <tr>
        <th style="border:1px solid #000;padding:4px;">Nombre y Apellido</th>
        <th style="border:1px solid #000;padding:4px;">C. I. Nº</th>
        <th style="border:1px solid #000;padding:4px;">Fecha Nac.</th>
        <th style="border:1px solid #000;padding:4px;">Edad</th>
        <th style="border:1px solid #000;padding:4px;">Parentesco</th>
        <th style="border:1px solid #000;padding:4px;">Fecha de Ingreso</th>
        <th style="border:1px solid #000;padding:4px;">Precio</th>
        <th style="border:1px solid #000;padding:4px;">V.I</th>
        <th style="border:1px solid #000;padding:4px;">Teléfono</th>
        <th style="border:1px solid #000;padding:4px;">Domicilio - Barrio</th>
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
        <td style="border:1px solid #000;padding:4px;text-align:center;">{{fecha_ingreso}}</td>
        <td style="border:1px solid #000;padding:4px;text-align:right;">{{montoFormateado}}</td>
        <td style="border:1px solid #000;padding:4px;text-align:center;">{{vigencia_inmediata_adherente}}</td>
        <td style="border:1px solid #000;padding:4px;text-align:center;">{{telefono}}</td>
        <td style="border:1px solid #000;padding:4px;">{{domicilio}} - {{barrio}}</td>
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
    OJO: el motor interpola TAMBIÉN dentro de los comentarios HTML, así que acá
    los nombres van sin llaves a propósito.
    monto_total_grupo = cuota del CONTRATO COMPLETO ya con las personas que se
    incorporan. monto_total, en cambio, es solo el importe de esta incorporación
    (y es la base sobre la que se calcula la comisión).
  -->

  <p style="margin:10px 0 0 0;">
    Asunción, {{fecha.dia}} / {{fecha.mes}} / {{fecha.anio}}
  </p>

  <table style="width:100%;margin-top:55px;border-collapse:collapse;text-align:center;">
    <tr>
      <td style="width:33%;vertical-align:bottom;">
        {{firma_contratante}}
        <div style="border-top:1px solid #555;margin-top:36px;padding-top:4px;">CONTRATANTE</div>
        <div style="font-size:10px;">C. I. Nº {{titular_ci}}</div>
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
  v_cambio_plan text := $tpl$
<!--
  PLANTILLA: "Formulario de Solicitud de Cambio" (Cambio de Plan)

  CÓMO USARLA
  Crear una plantilla nueva en el diseñador con este nombre y pegar este HTML.
  El encabezado y el zócalo con el logo de SAMAP los agrega automáticamente
  generate-base-pdf, así que NO van acá.

  IMPORTANTE — que sea FIRMABLE
  La plantilla incluye {{firma_contratante}} y {{firma_contratada}}. Esos campos
  son los que hacen que el documento se clasifique como firmable. Si se los saca,
  el formulario se generaría como adjunto y nunca se enviaría a firmar.

  DE DÓNDE SALEN LOS DATOS
  El formulario se genera en el contexto de la VENTA-OPERACIÓN del cambio, que
  sólo conoce el plan nuevo. El plan anterior, los montos anteriores, el motivo y
  la tabla de integrantes vienen de plan_changes: los adosa attachPlanChangeContext
  y el motor los expone en el bloque cambio y en el loop integrantes_anteriores.

  LA TABLA ES UNA FOTO
  El bloque de integrantes recorre el members_snapshot tomado al momento de la
  solicitud, NO los adherentes actuales del contrato. Si después se editan los
  adherentes, este formulario ya firmado sigue diciendo lo mismo.
-->

<div style="font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#111;">

  <h2 style="text-align:center;font-size:15px;margin:0 0 18px 0;">
    FORMULARIO DE SOLICITUD DE CAMBIO
  </h2>

  <table style="width:100%;border-collapse:collapse;margin-bottom:14px;">
    <tr>
      <td style="padding:3px 0;"><strong>Cliente Nº:</strong> {{id_cliente}}</td>
      <td style="padding:3px 0;"><strong>Titular Actual:</strong> {{titular_nombre}}</td>
      <td style="padding:3px 0;text-align:right;"><strong>Vendedor:</strong> {{venta.vendedor}}</td>
    </tr>
  </table>

  <p style="margin:0 0 12px 0;">
    <strong>MOTIVO:</strong> {{cambio.motivo}}
  </p>

  <table style="width:100%;border-collapse:collapse;font-size:11px;">
    <thead>
      <tr>
        <th style="border:1px solid #000;padding:4px;">INTEGRANTES</th>
        <th style="border:1px solid #000;padding:4px;">PLAN ANTERIOR</th>
        <th style="border:1px solid #000;padding:4px;">MONTO ANTERIOR</th>
        <th style="border:1px solid #000;padding:4px;">MONTO NUEVO</th>
      </tr>
    </thead>
    <tbody>
      {{#integrantes_anteriores}}
      <tr>
        <td style="border:1px solid #000;padding:4px;">{{nombre}}</td>
        <td style="border:1px solid #000;padding:4px;">{{planAnterior}}</td>
        <td style="border:1px solid #000;padding:4px;text-align:right;">{{montoAnteriorFormateado}}</td>
        <td style="border:1px solid #000;padding:4px;text-align:right;">{{montoNuevoFormateado}}</td>
      </tr>
      {{/integrantes_anteriores}}
    </tbody>
  </table>

  <p style="margin:16px 0 0 0;text-align:justify;">
    <strong>OBSERVACIONES:</strong> {{cambio.observaciones}}
  </p>

  <table style="width:100%;border-collapse:collapse;margin-top:14px;">
    <tr>
      <td style="padding:3px 0;">
        <strong>Fecha de Inicio nvo. Cto:</strong> {{cambio.fechaInicioNuevoContrato}}
      </td>
      <td style="padding:3px 0;text-align:right;">
        <strong>Nueva cuota mensual del grupo:</strong> {{cambio.montoNuevoFormateado}}
      </td>
    </tr>
  </table>

  <p style="margin:10px 0 0 0;">
    Asunción, {{fecha.dia}} / {{fecha.mes}} / {{fecha.anio}}
  </p>

  <table style="width:100%;margin-top:55px;border-collapse:collapse;text-align:center;">
    <tr>
      <td style="width:50%;vertical-align:bottom;">
        {{firma_contratante}}
        <div style="border-top:1px solid #555;margin-top:36px;padding-top:4px;">CONTRATANTE</div>
        <div style="font-size:10px;">C. I. Nº {{titular_ci}}</div>
      </td>
      <td style="width:50%;vertical-align:bottom;">
        {{firma_contratada}}
        <div style="border-top:1px solid #555;margin-top:36px;padding-top:4px;">POR LA CONTRATADA</div>
      </td>
    </tr>
  </table>

</div>
$tpl$;
  v_vigencia text := $tpl$
<!--
  PLANTILLA: "Anexo Especial de Vigencia Inmediata"

  CÓMO USARLA
  Crear una plantilla nueva en el diseñador con este nombre y pegar este HTML.
  El encabezado y el zócalo con el logo de SAMAP los agrega automáticamente
  generate-base-pdf, así que NO van acá.

  IMPORTANTE — que sea FIRMABLE
  La plantilla incluye {{firma_contratante}} y {{firma_contratada}}. Esos campos
  son los que hacen que el documento se clasifique como firmable. Si se los saca,
  el anexo se generaría como adjunto y nunca se enviaría a firmar.

  QUIÉNES SALEN EN LA TABLA
  El bloque {{#beneficiarios_vi}} ... {{/beneficiarios_vi}} se repite una vez por
  cada persona con VIGENCIA INMEDIATA EFECTIVA. "Efectiva" quiere decir: manda el
  valor del adherente y, si no tiene uno propio, hereda el de la venta. El titular
  aparece cuando la venta tiene vigencia inmediata. No hay que dejar 8 filas
  vacías como en el papel: salen exactamente las personas que corresponden.
-->

<div style="font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#111;">

  <h2 style="text-align:center;font-size:15px;margin:0 0 18px 0;">
    ANEXO ESPECIAL DE VIGENCIA INMEDIATA
  </h2>

  <p style="margin:0 0 12px 0;text-align:justify;">
    Este anexo forma parte integrante del contrato nº {{venta.numeroContrato}} entre
    SAMAP Departamento de Medicina Pre paga del Sanatorio Adventista de Asunción, y
    {{titular_nombre}} (Titular), por el cual SAMAP otorga vigencia inmediata para
    estudios laboratoriales, estudios especializados, e Internaciones agudas
    (clínicas) según los anexos del plan elegido.
  </p>

  <p style="margin:0 0 8px 0;">
    Los beneficiarios del presente anexo, son las siguientes personas:
  </p>

  <table style="width:100%;border-collapse:collapse;font-size:11px;">
    <thead>
      <tr>
        <th style="border:1px solid #000;padding:4px;width:40px;">Nº</th>
        <th style="border:1px solid #000;padding:4px;">Nombre y Apellido</th>
      </tr>
    </thead>
    <tbody>
      {{#beneficiarios_vi}}
      <tr>
        <td style="border:1px solid #000;padding:4px;text-align:center;">{{indice}}</td>
        <td style="border:1px solid #000;padding:4px;">{{nombreCompleto}}</td>
      </tr>
      {{/beneficiarios_vi}}
    </tbody>
  </table>

  <p style="margin:16px 0 0 0;text-align:justify;">
    Vigencia inmediata no contempla internación o procedimientos por enfermedad o
    embarazo preexistente a la firma del contrato, sean éstas conocidas o no por el
    beneficiario.
  </p>

  <p style="margin:12px 0 0 0;text-align:justify;">
    En prueba de conformidad, firman las partes en dos ejemplares de un mismo tenor
    y a un solo efecto.
  </p>

  <p style="margin:10px 0 0 0;">
    Asunción, {{fecha.dia}} / {{fecha.mes}} / {{fecha.anio}}
  </p>

  <table style="width:100%;margin-top:55px;border-collapse:collapse;text-align:center;">
    <tr>
      <td style="width:50%;vertical-align:bottom;">
        {{firma_contratante}}
        <div style="border-top:1px solid #555;margin-top:36px;padding-top:4px;">CONTRATANTE</div>
        <div style="font-size:10px;">C. I. Nº {{titular_ci}}</div>
      </td>
      <td style="width:50%;vertical-align:bottom;">
        {{firma_contratada}}
        <div style="border-top:1px solid #555;margin-top:36px;padding-top:4px;">CONTRATADA</div>
      </td>
    </tr>
  </table>

</div>
$tpl$;
BEGIN
  SELECT count(*) INTO v_empresas FROM public.companies;
  v_esperadas := v_empresas * 3;

  WITH nuevas AS (
    INSERT INTO public.templates
      (company_id, name, description, content, template_type, is_active, requires_signature)
    SELECT c.id, v.name, v.description, v.content, v.template_type, true, true
      FROM public.companies c
      CROSS JOIN (VALUES
        ('Anexo de Incorporación de Adherente',
         'Anexo por el cual el contratante incorpora adherentes a un contrato ya firmado. Se emite sobre la venta-operación (sale_type=alta_adherente).',
         v_incorporacion::text,
         'anexo_incorporacion'),
        ('Formulario de Solicitud de Cambio de Plan',
         'Solicitud de cambio de plan de un contrato existente: separación, mayor cobertura o menor cobertura. Se emite sobre la venta-operación (sale_type=cambio_plan).',
         v_cambio_plan::text,
         'solicitud_cambio_plan'),
        ('Anexo Especial de Vigencia Inmediata',
         'Anexo que lista los beneficiarios con vigencia inmediata. Se adjunta a la venta cuyo titular o adherentes tengan immediate_coverage.',
         v_vigencia::text,
         'anexo_vigencia_inmediata')
      ) AS v(name, description, content, template_type)
    ON CONFLICT (company_id, name) DO NOTHING
    RETURNING 1
  )
  SELECT count(*) INTO v_insertadas FROM nuevas;

  RAISE NOTICE 'Seed plantillas tipos de venta: % empresa(s) x 3 = % esperadas, % insertadas, % ya existían (no se pisaron).',
    v_empresas, v_esperadas, v_insertadas, v_esperadas - v_insertadas;

  IF v_insertadas < v_esperadas THEN
    RAISE NOTICE 'Revisá las salteadas: si alguien creó a mano una plantilla con el mismo nombre y otro contenido, el vendedor podría estar usando la equivocada. SELECT company_id, name, template_type FROM public.templates WHERE name IN (''Anexo de Incorporación de Adherente'', ''Formulario de Solicitud de Cambio de Plan'', ''Anexo Especial de Vigencia Inmediata'');';
  END IF;
END
$seed$;
