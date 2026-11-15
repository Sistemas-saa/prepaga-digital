import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { getClientDisplayName, getClientDocument } from '@/lib/clientUtils';

/**
 * Incorporación de Adherente ("Anexo de Incorporación de Adherente").
 *
 * MODELO — por qué una VENTA-OPERACIÓN y no sumar el adherente a la venta madre:
 *
 * 1. Firma: todo el circuito filtra por `sale_id`. En particular
 *    `useSignatureLinkPublic` borra los documentos finales del destinatario
 *    antes de sellar; si el anexo colgara de la venta madre, el titular al
 *    firmarlo BORRARÍA el contrato original ya firmado.
 * 2. Comisiones: hay un índice único que permite liquidar cada venta UNA sola
 *    vez en la historia. Si solo subiéramos el total de la venta madre, el
 *    vendedor nunca podría cobrar la incorporación, y fallaría en silencio.
 *
 * Con `sale_id` propio, el flujo de firma existente funciona tal cual y la
 * comisión se liquida sola. La venta madre no se toca hasta que el anexo se
 * completa, momento en el que se le agregan los adherentes de verdad.
 *
 * Un anexo puede incorporar VARIAS personas:
 *   1 anexo = 1 venta-operación = N filas en `adherent_incorporations`
 */

import { SALE_TYPE_INCORPORACION } from '@/lib/saleFilters';

export { SALE_TYPE_INCORPORACION };

export interface IncorporationAdherentInput {
  first_name: string;
  last_name: string;
  dni?: string;
  relationship?: string;
  birth_date?: string | null;
  gender?: string;
  phone?: string;
  email?: string;
  address?: string;
  barrio?: string;
  city?: string;
  amount: number;
  entry_date?: string | null;
  /** null = hereda la vigencia inmediata de la venta. */
  immediate_coverage?: boolean | null;
  /**
   * Contratos de EMPRESA: qué se incorpora. Un 'empleado' trae su propio plan y
   * no depende de nadie; un 'adherente' cuelga de un empleado del contrato
   * madre (`parent_target_beneficiary_id`). En una venta a persona física
   * ninguno de los tres campos se usa y quedan en su default.
   */
  member_role?: 'empleado' | 'adherente';
  plan_id?: string | null;
  parent_target_beneficiary_id?: string | null;
  /**
   * Adherente de un empleado que entra en ESTE MISMO movimiento: índice de ese
   * empleado dentro del array `adherents`. Es excluyente con
   * `parent_target_beneficiary_id`, que apunta a un empleado que ya vive en el
   * contrato madre; acá el padre todavía no existe en ningún lado cuando se
   * arma el alta. El vínculo se crea dentro de la venta-operación y la base lo
   * traduce al contrato madre al activar.
   */
  parent_row_index?: number | null;
  /** Empleado que declara grupo familiar (viaja al contrato madre al activar). */
  requires_adherents?: boolean;
  maternity_bonus?: boolean;
}

/**
 * BAJA de nómina: desvincular a alguien de un contrato ya firmado.
 *
 * Usa el MISMO anexo y la MISMA serie (ANX-YYYY-NNNNNN) que el alta, que es lo
 * que se pidió: un solo documento para los dos movimientos de personal.
 */
export interface TerminationInput {
  /** Beneficiario del CONTRATO MADRE que se desvincula. */
  targetBeneficiaryId: string;
  /** Fin de cobertura. Formato "YYYY-MM-DD", sin pasar por Date. */
  terminationDate: string;
  reason?: string;
  /** Si el que sale es un empleado, ¿salen también sus adherentes? */
  cascadeDependents: boolean;
}

/**
 * Devuelve la venta enriquecida con `group_monthly_total`: la cuota mensual
 * del GRUPO COMPLETO una vez incorporadas las personas del anexo.
 *
 * El documento pide "la cuota mensual ... por todo el grupo de personas que
 * conforman el contrato", pero el anexo se genera en el contexto de la
 * venta-operación, cuyo total es solo el de las personas que entran.
 *
 * No se resuelve inflando el total de la operación porque ESE total es la base
 * de cálculo de la comisión: si se lo llevara al total del grupo, el vendedor
 * cobraría comisión sobre el contrato entero y no sobre la incorporación.
 *
 * Para cualquier venta que no sea una incorporación devuelve la venta tal cual.
 */
export const attachGroupMonthlyTotal = async (sale: any): Promise<any> => {
  if (!sale || sale.sale_type !== SALE_TYPE_INCORPORACION) return sale;

  // `select('*')` + cast a propósito. Trae la fila entera y la lee suelta en vez
  // de enumerar columnas: esta tabla ya cambió de forma tres veces (20260813*,
  // 20260908000003) y cada vez habría que tocar todos los selects. Es barato:
  // se lee UNA fila.
  const { data: incRow } = await supabase
    .from('adherent_incorporations')
    .select('*')
    .eq('operation_sale_id', sale.id)
    .not('parent_sale_id', 'is', null)
    .limit(1)
    .maybeSingle();

  const inc = incRow as Record<string, any> | null;
  if (!inc?.parent_sale_id) return sale;

  const { data: parent } = await supabase
    .from('sales')
    .select('total_amount')
    .eq('id', inc.parent_sale_id)
    .maybeSingle();

  // En una BAJA el grupo queda MÁS chico, y la venta-operación vale 0 (no
  // factura), así que sumar su total daría la cuota de antes. Se resta lo que
  // sale, que es lo que el anexo tiene que anunciar como cuota nueva.
  const esBaja = inc.movement_type === 'baja';
  const delta = esBaja
    ? -Number(inc.adherent_amount || 0)
    : Number(sale.total_amount || 0);

  return {
    ...sale,
    group_monthly_total: Math.max(Number(parent?.total_amount || 0) + delta, 0),
    // Lo consume `{{movimiento}}` de la plantilla del anexo, que es la MISMA
    // para alta y para baja: sin esto el documento no tendría cómo decir cuál
    // de los dos es.
    movimiento_nomina: esBaja ? 'baja' : 'alta',
    movimiento_fecha: esBaja ? inc.termination_date || null : null,
  };
};

/** Incorporaciones de un contrato madre, con su venta-operación. */
export const useAdherentIncorporations = (parentSaleId?: string) => {
  return useQuery({
    queryKey: ['adherent-incorporations', parentSaleId],
    queryFn: async () => {
      if (!parentSaleId) return [];
      const { data, error } = await supabase
        .from('adherent_incorporations')
        .select('*, operation_sale:operation_sale_id (id, contract_number, status, total_amount, sale_date)')
        .eq('parent_sale_id', parentSaleId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!parentSaleId,
  });
};

export const useCreateAdherentIncorporation = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      parentSaleId,
      adherents,
    }: {
      parentSaleId: string;
      adherents: IncorporationAdherentInput[];
    }) => {
      if (!adherents.length) throw new Error('Agregá al menos un adherente.');

      // 1. Contrato madre + titular (snapshot para el documento)
      const { data: parent, error: parentError } = await supabase
        .from('sales')
        .select(`
          id, company_id, client_id, plan_id, salesperson_id, immediate_coverage,
          clients:client_id ( first_name, last_name, dni, client_type, razon_social, ruc, email, phone )
        `)
        .eq('id', parentSaleId)
        .maybeSingle();

      if (parentError) throw parentError;
      if (!parent) throw new Error('No se encontró el contrato de origen.');

      const cliente: any = (parent as any).clients || {};
      // Mayúsculas del titular tal cual están: no transformar (bug conocido
      // de nombres en minúscula en el bloque de firma).
      const titularName = getClientDisplayName(cliente);

      const totalAdherentes = adherents.reduce((sum, a) => sum + (Number(a.amount) || 0), 0);

      // 2. Venta-operación. El trigger le asigna un número de la serie
      //    ANX-YYYY-NNNNNN, separada de la de contratos.
      const { data: operationSale, error: saleError } = await supabase
        .from('sales')
        .insert({
          company_id: (parent as any).company_id,
          client_id: (parent as any).client_id,
          plan_id: (parent as any).plan_id,
          salesperson_id: (parent as any).salesperson_id,
          sale_type: SALE_TYPE_INCORPORACION,
          status: 'borrador',
          total_amount: totalAdherentes,
          sale_date: new Date().toISOString().slice(0, 10),
          immediate_coverage: (parent as any).immediate_coverage ?? false,
          // La venta-operación no es una venta comercial: es el vehículo para
          // firmar un anexo sobre un contrato que YA pasó auditoría. Con el
          // default 'pendiente', SaleTemplatesTab bloquea el alta de plantillas
          // y la incorporación queda creada pero sin poder emitir el anexo.
          // Solo afecta a ventas-operación; ninguna venta real cambia.
          audit_status: 'aprobado_para_templates',
        } as any)
        .select()
        .single();

      if (saleError) throw saleError;

      // A partir de acá, si algo falla hay que deshacer la venta-operación
      // para no dejar basura colgada.
      try {
        // 3. Los adherentes se crean en la VENTA-OPERACIÓN: así el motor de
        //    plantillas arma la tabla del anexo solo con ellos, y el circuito
        //    de firma les genera su DDJJ sin tocar la venta madre.
        //
        //    Se insertan en DOS PASADAS. `parent_beneficiary_id` sólo se puede
        //    apuntar a alguien de la MISMA venta (FK compuesta
        //    `fk_beneficiaries_parent (parent_beneficiary_id, sale_id)`), así
        //    que el empleado que entra en este movimiento tiene que existir
        //    antes que sus adherentes. Los adherentes de un empleado que ya
        //    vive en el contrato MADRE no llevan padre acá: ese vínculo lo
        //    resuelve la base al activar, desde `parent_target_beneficiary_id`.
        const filaBase = (a: IncorporationAdherentInput) => ({
          sale_id: operationSale.id,
          first_name: a.first_name,
          last_name: a.last_name,
          dni: a.dni || null,
          document_number: a.dni || null,
          relationship: a.relationship || null,
          birth_date: a.birth_date || null,
          gender: a.gender || null,
          phone: a.phone || null,
          email: a.email || null,
          address: a.address || null,
          barrio: a.barrio || null,
          city: a.city || null,
          amount: Number(a.amount) || 0,
          entry_date: a.entry_date || null,
          immediate_coverage: a.immediate_coverage ?? null,
          is_primary: false,
          member_role: a.member_role || 'adherente',
          plan_id: a.plan_id || (parent as any).plan_id || null,
          requires_adherents: a.requires_adherents === true,
          maternity_bonus: a.maternity_bonus === true,
        });

        const esHijoDeEsteMovimiento = (a: IncorporationAdherentInput) =>
          typeof a.parent_row_index === 'number' && a.parent_row_index >= 0;

        /** índice en `adherents` → id del beneficiario creado en la operación. */
        const idPorIndice = new Map<number, string>();

        const insertarPasada = async (
          indices: number[],
          conPadre: boolean,
        ): Promise<void> => {
          if (!indices.length) return;
          const { data, error } = await supabase
            .from('beneficiaries')
            .insert(
              indices.map((i) => {
                const a = adherents[i];
                const fila: any = filaBase(a);
                if (conPadre) {
                  const padre = idPorIndice.get(a.parent_row_index as number);
                  if (!padre) {
                    throw new Error(
                      'No se pudo vincular a ' +
                        `${a.first_name} ${a.last_name} con su empleado.`,
                    );
                  }
                  fila.parent_beneficiary_id = padre;
                }
                return fila;
              }) as any,
            )
            .select();

          if (error) throw error;
          // `INSERT ... RETURNING` devuelve las filas en el orden en que se
          // insertaron, así que la posición dentro de ESTA pasada alcanza para
          // mapear cada id a su índice original.
          if ((data || []).length !== indices.length) {
            throw new Error('La incorporación no se pudo guardar completa.');
          }
          indices.forEach((i, pos) => {
            const fila = (data as any[])[pos];
            // Si el orden no fuera el de entrada, un adherente terminaría
            // colgado del empleado equivocado Y eso viajaría al contrato madre
            // al activar. Mejor romper acá, en voz alta, que dejar la nómina
            // mal armada en silencio.
            if (
              fila.first_name !== adherents[i].first_name ||
              fila.last_name !== adherents[i].last_name
            ) {
              throw new Error('La incorporación se guardó desordenada: reintentá la carga.');
            }
            idPorIndice.set(i, fila.id);
          });
        };

        const indicesPadres = adherents
          .map((a, i) => (esHijoDeEsteMovimiento(a) ? -1 : i))
          .filter((i) => i >= 0);
        const indicesHijos = adherents
          .map((a, i) => (esHijoDeEsteMovimiento(a) ? i : -1))
          .filter((i) => i >= 0);

        await insertarPasada(indicesPadres, false);
        await insertarPasada(indicesHijos, true);

        const createdBeneficiaries = adherents.map((_a, i) => ({
          id: idPorIndice.get(i) || null,
        }));

        // 4. Una fila de incorporación por adherente.
        const { error: incError } = await supabase.from('adherent_incorporations').insert(
          adherents.map((a, i) => ({
            company_id: (parent as any).company_id,
            client_id: (parent as any).client_id,
            operation_sale_id: operationSale.id,
            parent_sale_id: parentSaleId,
            plan_id: (parent as any).plan_id,
            titular_name: titularName,
            titular_document: getClientDocument(cliente) || null,
            titular_email: cliente.email || null,
            titular_phone: cliente.phone || null,
            adherent_first_name: a.first_name,
            adherent_last_name: a.last_name,
            adherent_document_number: a.dni || null,
            adherent_birth_date: a.birth_date || null,
            adherent_relationship: a.relationship || null,
            adherent_email: a.email || null,
            adherent_phone: a.phone || null,
            adherent_amount: Number(a.amount) || 0,
            coverage_start_date: a.entry_date || null,
            // Vocabulario de adherent_incorporations: la tabla usa estados en
            // INGLÉS ('draft','sent','signed','completed','cancelled') y
            // source en ('existing_sale','external_sale'). No confundir con
            // sales.status, que sí es en español. Escribir 'borrador'/'manual'
            // acá revienta con 23514 (adherent_incorporations_status_check).
            status: 'draft',
            source: 'existing_sale',
            // Movimiento de nómina. 'alta' es el default de la columna, pero se
            // escribe explícito para que la fila se lea sola.
            movement_type: 'alta',
            member_role: a.member_role || 'adherente',
            adherent_plan_id: a.plan_id || (parent as any).plan_id || null,
            parent_target_beneficiary_id: a.parent_target_beneficiary_id || null,
            // Adherente que vive en la venta-operación mientras se firma.
            operation_beneficiary_id: createdBeneficiaries?.[i]?.id || null,
            // Se llena recién al activar (por trigger), con el adherente
            // definitivo creado en la venta madre.
            activated_beneficiary_id: null,
          }))
        );

        if (incError) throw incError;

        return { operationSale, beneficiaries: createdBeneficiaries };
      } catch (err) {
        // Rollback manual: no hay transacción entre llamadas REST.
        await supabase.from('sales').delete().eq('id', operationSale.id);
        throw err;
      }
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['adherent-incorporations', variables.parentSaleId] });
      queryClient.invalidateQueries({ queryKey: ['sales'] });
      toast({
        title: 'Incorporación creada',
        description: 'Ya podés generar y enviar a firmar el Anexo de Incorporación.',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'No se pudo crear la incorporación.',
        variant: 'destructive',
      });
    },
  });
};

/**
 * BAJA de nómina: desvincula a alguien de un contrato ya firmado.
 *
 * MISMO vehículo que el alta —una venta-operación con `sale_type='alta_adherente'`,
 * su anexo y su ceremonia de firma— porque es lo que se pidió: un solo documento
 * para los dos movimientos. Lo que cambia es qué hace la activación
 * (`activate_adherent_incorporation`, migración 20260908000005): en vez de
 * copiar a la persona al contrato madre, la pasa a `status='inactive'` con su
 * `coverage_end_date`, y el total del contrato baja solo.
 *
 * DOS DECISIONES QUE PARECEN RARAS Y SON DELIBERADAS:
 *
 * 1. `total_amount: 0` en la venta-operación. Ese campo es la base de cálculo de
 *    la comisión: una baja no factura, así que no puede llevar el monto de quien
 *    sale.
 *
 * 2. Los que salen SÍ se insertan como beneficiarios de la venta-operación, pero
 *    con `signature_required=false` y `status='inactive'`. Esa combinación es la
 *    que hace que el anexo funcione sin motor de plantillas nuevo:
 *      · `useCreateAllSignatureLinks` y `SaleTemplatesTab` saltean a quien tiene
 *        `signature_required === false`, así que NO se les genera DDJJ ni enlace
 *        de firma —firman sólo el representante de la empresa y la contratada—;
 *      · pero el loop `{{#beneficiarios}}` de la plantilla los imprime igual, que
 *        es justo lo que el anexo tiene que decir;
 *      · y `status='inactive'` hace que `recalculate_sale_total_amount` los
 *        ignore, dejando la venta-operación en total 0 sin pisarlo a mano.
 */
export const useCreateNominaTermination = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      parentSaleId,
      termination,
    }: {
      parentSaleId: string;
      termination: TerminationInput;
    }) => {
      const { targetBeneficiaryId, terminationDate, reason, cascadeDependents } = termination;
      if (!targetBeneficiaryId) throw new Error('Elegí a quién dar de baja.');
      if (!terminationDate) throw new Error('Indicá la fecha de baja.');

      // 1. Contrato madre + titular (snapshot para el documento)
      const { data: parent, error: parentError } = await supabase
        .from('sales')
        .select(`
          id, company_id, client_id, plan_id, salesperson_id, immediate_coverage,
          clients:client_id ( first_name, last_name, dni, client_type, razon_social, ruc, email, phone )
        `)
        .eq('id', parentSaleId)
        .maybeSingle();

      if (parentError) throw parentError;
      if (!parent) throw new Error('No se encontró el contrato de origen.');

      const cliente: any = (parent as any).clients || {};
      const titularName = getClientDisplayName(cliente);

      // 2. Quién sale: la persona elegida y, si corresponde, sus adherentes.
      const { data: objetivo, error: objetivoError } = await supabase
        .from('beneficiaries')
        .select('*')
        .eq('id', targetBeneficiaryId)
        .maybeSingle();

      if (objetivoError) throw objetivoError;
      if (!objetivo) throw new Error('No se encontró a la persona que se quiere dar de baja.');
      if (((objetivo as any).status ?? 'active') !== 'active') {
        throw new Error('Esa persona ya está dada de baja del contrato.');
      }

      // Los adherentes a cargo se filtran en memoria y no con un `.eq()` más
      // sobre `parent_beneficiary_id`: encadenar otro filtro acá hacía explotar
      // la inferencia de tipos de PostgREST ("Type instantiation is excessively
      // deep"). La nómina de un contrato es chica, así que traerla entera no
      // cuesta nada.
      let dependientes: any[] = [];
      if (cascadeDependents) {
        const { data, error } = await supabase
          .from('beneficiaries')
          .select('*')
          .eq('sale_id', parentSaleId);
        if (error) throw error;
        dependientes = ((data || []) as any[]).filter(
          (d) =>
            d.parent_beneficiary_id === targetBeneficiaryId &&
            (d.status ?? 'active') === 'active',
        );
      }

      const montoQueSale =
        (Number((objetivo as any).amount) || 0) +
        dependientes.reduce((s, d) => s + (Number(d.amount) || 0), 0);

      // 3. Venta-operación. El trigger le asigna un número de la serie ANX.
      const { data: operationSale, error: saleError } = await supabase
        .from('sales')
        .insert({
          company_id: (parent as any).company_id,
          client_id: (parent as any).client_id,
          plan_id: (parent as any).plan_id,
          salesperson_id: (parent as any).salesperson_id,
          sale_type: SALE_TYPE_INCORPORACION,
          status: 'borrador',
          // Una baja no factura: ver el encabezado del hook.
          total_amount: 0,
          titular_amount: 0,
          sale_date: new Date().toISOString().slice(0, 10),
          immediate_coverage: false,
          audit_status: 'aprobado_para_templates',
        } as any)
        .select()
        .single();

      if (saleError) throw saleError;

      try {
        // 4. Snapshot de quienes salen, dentro de la venta-operación.
        //    El empleado primero, para poder colgarle sus adherentes: la FK
        //    compuesta exige que padre e hijo compartan `sale_id`, así que el
        //    padre del snapshot es el snapshot, no el del contrato madre.
        const snapshotBase = (b: any, extra: Record<string, unknown>) => ({
          sale_id: operationSale.id,
          first_name: b.first_name,
          last_name: b.last_name,
          dni: b.dni || null,
          document_number: b.document_number || b.dni || null,
          relationship: b.relationship || null,
          birth_date: b.birth_date || null,
          gender: b.gender || null,
          phone: b.phone || null,
          email: b.email || null,
          address: b.address || null,
          barrio: b.barrio || null,
          city: b.city || null,
          amount: Number(b.amount) || 0,
          entry_date: b.entry_date || null,
          plan_id: b.plan_id || null,
          is_primary: false,
          // Las dos marcas que hacen que esto funcione sin motor nuevo.
          signature_required: false,
          status: 'inactive',
          coverage_end_date: terminationDate,
          ...extra,
        });

        const { data: snapObjetivo, error: snapError } = await supabase
          .from('beneficiaries')
          .insert(
            snapshotBase(objetivo, {
              member_role: (objetivo as any).member_role || 'adherente',
              parent_beneficiary_id: null,
            }) as any,
          )
          .select()
          .single();

        if (snapError) throw snapError;

        if (dependientes.length > 0) {
          const { error: depError } = await supabase.from('beneficiaries').insert(
            dependientes.map((d) =>
              snapshotBase(d, {
                member_role: 'adherente',
                // Sólo se puede colgar de un 'empleado' (trg_beneficiaries_validate_nomina).
                parent_beneficiary_id:
                  (objetivo as any).member_role === 'empleado' ? snapObjetivo.id : null,
              }),
            ) as any,
          );
          if (depError) throw depError;
        }

        // 5. La fila del movimiento. UNA sola: la cascada la resuelve la
        //    activación, que además deja registrado en
        //    `deactivated_beneficiary_ids` a quiénes desactivó de verdad.
        const { error: movError } = await supabase.from('adherent_incorporations').insert({
          company_id: (parent as any).company_id,
          client_id: (parent as any).client_id,
          operation_sale_id: operationSale.id,
          parent_sale_id: parentSaleId,
          plan_id: (parent as any).plan_id,
          titular_name: titularName,
          titular_document: getClientDocument(cliente) || null,
          titular_email: cliente.email || null,
          titular_phone: cliente.phone || null,
          // Snapshot de quien sale: `adherent_first_name`/`last_name` son NOT NULL
          // y son lo que el anexo imprime.
          adherent_first_name: (objetivo as any).first_name,
          adherent_last_name: (objetivo as any).last_name,
          adherent_document_number: (objetivo as any).dni || (objetivo as any).document_number || null,
          adherent_birth_date: (objetivo as any).birth_date || null,
          adherent_relationship: (objetivo as any).relationship || null,
          adherent_email: (objetivo as any).email || null,
          adherent_phone: (objetivo as any).phone || null,
          adherent_amount: montoQueSale,
          status: 'draft',
          source: 'existing_sale',
          movement_type: 'baja',
          member_role: (objetivo as any).member_role || 'adherente',
          target_beneficiary_id: targetBeneficiaryId,
          termination_date: terminationDate,
          termination_reason: reason || null,
          cascade_dependents: cascadeDependents,
          coverage_end_date: terminationDate,
          operation_beneficiary_id: snapObjetivo.id,
          activated_beneficiary_id: null,
        } as any);

        if (movError) throw movError;

        return { operationSale, dadosDeBaja: 1 + dependientes.length };
      } catch (err) {
        // Rollback manual: no hay transacción entre llamadas REST.
        await supabase.from('sales').delete().eq('id', operationSale.id);
        throw err;
      }
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['adherent-incorporations', variables.parentSaleId] });
      queryClient.invalidateQueries({ queryKey: ['sales'] });
      toast({
        title: 'Baja creada',
        description: `Ya podés generar y enviar a firmar el anexo (${data.dadosDeBaja} persona(s)). El contrato se actualiza recién cuando el anexo queda firmado.`,
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'No se pudo crear la baja.',
        variant: 'destructive',
      });
    },
  });
};

/** Estados desde los que todavía se puede tocar una incorporación. */
/**
 * Estados de la VENTA-OPERACIÓN en los que el anexo todavía se puede tocar.
 *
 * `adherent_incorporations.status` NO alcanza como guarda: nadie escribe nunca
 * 'sent' ni 'signed' —el único salto real es draft → completed, y lo hace el
 * trigger recién cuando la venta-operación llega a 'completado'—. O sea que
 * mientras el titular ya firmó y falta la contratada, la venta-operación está
 * en 'firmado' pero la incorporación sigue en 'draft'.
 *
 * Sin esta guarda, en esa ventana la edición pasa el guard de lifecycle (que
 * sólo mira OLD.status <> 'draft') y después revienta con 42501 al tocar el
 * beneficiario del contrato firmado, dejando el snapshot editado y el
 * beneficiario sin tocar: justo la divergencia que se quería evitar. Y el PDF
 * ya firmado no se regenera.
 */
const OPERATION_EDITABLE_STATUSES = ['borrador'];

/** Cancelar se admite hasta que alguien haya firmado. */
const OPERATION_CANCELABLE_STATUSES = ['borrador', 'enviado', 'pendiente'];

const EDITABLE_STATUS = 'draft';
const CANCELABLE_STATUSES = ['draft', 'sent'];

/**
 * Corrige los datos del adherente de una incorporación que todavía está en
 * borrador (típicamente un error de tipeo detectado antes de enviar a firmar).
 *
 * Escribe en los DOS lados: la fila de `adherent_incorporations` (que es el
 * snapshot con el que se arma el anexo) y el beneficiario de la venta-operación
 * (que es el que firma y el que después se copia al contrato madre). Si sólo se
 * tocara uno, el documento y la persona incorporada dirían cosas distintas.
 *
 * Después de `draft` no se puede editar: el anexo ya se generó y puede estar
 * firmado. Ahí el camino es cancelar y crear una nueva.
 */
export const useUpdateAdherentIncorporation = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      adherent,
    }: {
      id: string;
      adherent: IncorporationAdherentInput;
    }) => {
      const { data: actual, error: readError } = await supabase
        .from('adherent_incorporations')
        .select(
          'id, status, operation_beneficiary_id, parent_sale_id, operation_sale:operation_sale_id (status)',
        )
        .eq('id', id)
        .maybeSingle();

      if (readError) throw readError;
      if (!actual) throw new Error('No se encontró la incorporación.');
      if (actual.status !== EDITABLE_STATUS) {
        throw new Error(
          'La incorporación ya fue enviada a firmar y no se puede editar. Cancelala y creá una nueva.',
        );
      }
      const estadoOperacion = (actual.operation_sale as { status?: string } | null)?.status;
      if (estadoOperacion && !OPERATION_EDITABLE_STATUSES.includes(estadoOperacion)) {
        throw new Error(
          'El anexo ya se emitió o se está firmando: editarlo dejaría el PDF firmado diciendo una cosa y la base otra. Cancelalo y creá uno nuevo.',
        );
      }

      const { error: incError } = await supabase
        .from('adherent_incorporations')
        .update({
          adherent_first_name: adherent.first_name,
          adherent_last_name: adherent.last_name,
          adherent_document_number: adherent.dni || null,
          adherent_birth_date: adherent.birth_date || null,
          adherent_relationship: adherent.relationship || null,
          adherent_email: adherent.email || null,
          adherent_phone: adherent.phone || null,
          adherent_amount: Number(adherent.amount) || 0,
          coverage_start_date: adherent.entry_date || null,
          adherent_plan_id: adherent.plan_id || null,
        } as any)
        .eq('id', id);

      if (incError) throw incError;

      if (actual.operation_beneficiary_id) {
        // El trigger de `beneficiaries` recalcula solo el total de la
        // venta-operación, que es la base de cálculo de la comisión.
        const { error: benError } = await supabase
          .from('beneficiaries')
          .update({
            first_name: adherent.first_name,
            last_name: adherent.last_name,
            dni: adherent.dni || null,
            document_number: adherent.dni || null,
            relationship: adherent.relationship || null,
            birth_date: adherent.birth_date || null,
            gender: adherent.gender || null,
            phone: adherent.phone || null,
            email: adherent.email || null,
            address: adherent.address || null,
            barrio: adherent.barrio || null,
            city: adherent.city || null,
            amount: Number(adherent.amount) || 0,
            entry_date: adherent.entry_date || null,
            immediate_coverage: adherent.immediate_coverage ?? null,
            plan_id: adherent.plan_id || null,
          } as any)
          .eq('id', actual.operation_beneficiary_id);

        if (benError) throw benError;
      }

      return actual;
    },
    onSuccess: (actual: any) => {
      queryClient.invalidateQueries({ queryKey: ['adherent-incorporations', actual?.parent_sale_id] });
      queryClient.invalidateQueries({ queryKey: ['sales'] });
      toast({ title: 'Incorporación actualizada' });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'No se pudo actualizar la incorporación.',
        variant: 'destructive',
      });
    },
  });
};

/**
 * Cancela una incorporación que todavía no se activó.
 *
 * NO borra nada: deja la fila en `cancelled` y la venta-operación en
 * `cancelado`. Una incorporación ya activada no se cancela desde acá — sus
 * adherentes ya están en el contrato madre y revertir eso es un problema
 * contable, no de pantalla.
 */
export const useCancelAdherentIncorporation = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id }: { id: string }) => {
      // `select('*')` + cast: ver la nota de `attachGroupMonthlyTotal`.
      const { data: actualRow, error: readError } = await supabase
        .from('adherent_incorporations')
        .select('*, operation_sale:operation_sale_id (status)')
        .eq('id', id)
        .maybeSingle();

      const actual = actualRow as Record<string, any> | null;
      if (readError) throw readError;
      if (!actual) throw new Error('No se encontró la incorporación.');
      // `deactivated_beneficiary_ids` es la marca de una BAJA ya aplicada: ahí
      // `activated_beneficiary_id` apunta a quien SALIÓ, no a alguien recién
      // creado, así que mirar sólo esa columna alcanzaría — pero si un día se
      // dejara de escribir, una baja firmada quedaría cancelable.
      if (
        actual.activated_beneficiary_id ||
        actual.status === 'completed' ||
        actual.deactivated_beneficiary_ids?.length
      ) {
        throw new Error(
          actual.movement_type === 'baja'
            ? 'La baja ya fue aplicada al contrato. No se puede cancelar.'
            : 'La incorporación ya fue activada: el adherente está en el contrato. No se puede cancelar.',
        );
      }
      const estadoOperacion = (actual.operation_sale as { status?: string } | null)?.status;
      if (estadoOperacion && !OPERATION_CANCELABLE_STATUSES.includes(estadoOperacion)) {
        throw new Error(
          `No se puede cancelar: el anexo ya está en estado "${estadoOperacion}". Si alguien firmó, hay que anularlo por el circuito de la venta.`,
        );
      }
      if (!CANCELABLE_STATUSES.includes(actual.status)) {
        throw new Error(`No se puede cancelar una incorporación en estado "${actual.status}".`);
      }

      const { error: incError } = await supabase
        .from('adherent_incorporations')
        .update({ status: 'cancelled' })
        .eq('id', id);

      if (incError) throw incError;

      if (actual.operation_sale_id) {
        const { error: saleError } = await supabase
          .from('sales')
          .update({ status: 'cancelado' } as any)
          .eq('id', actual.operation_sale_id);

        if (saleError) throw saleError;
      }

      return actual;
    },
    onSuccess: (actual: any) => {
      queryClient.invalidateQueries({ queryKey: ['adherent-incorporations', actual?.parent_sale_id] });
      queryClient.invalidateQueries({ queryKey: ['sales'] });
      toast({
        title: 'Incorporación cancelada',
        description: 'Queda registrada como cancelada; no se borró nada.',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'No se pudo cancelar la incorporación.',
        variant: 'destructive',
      });
    },
  });
};
