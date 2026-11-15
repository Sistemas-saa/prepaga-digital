import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { getClientDisplayName, getClientDocument } from '@/lib/clientUtils';

/**
 * Cambio de Plan ("Formulario de Solicitud de Cambio").
 *
 * MODELO — por qué una VENTA-OPERACIÓN y no editar el contrato madre:
 *
 * 1. Firma: todo el circuito filtra por `sale_id`. En particular
 *    `useSignatureLinkPublic` borra los documentos finales del destinatario
 *    antes de sellar; si el formulario colgara de la venta madre, el titular al
 *    firmarlo BORRARÍA el contrato original ya firmado.
 * 2. Comisiones: hay un índice único que permite liquidar cada venta UNA sola
 *    vez en la historia. Si sólo cambiáramos el plan y el total de la venta
 *    madre, el vendedor nunca podría cobrar el cambio, y fallaría en silencio.
 *
 * Con `sale_id` propio, el flujo de firma existente funciona tal cual y la
 * comisión se liquida sola. El contrato madre no se toca hasta que la operación
 * queda `completado`: ahí el trigger `activate_plan_change` le aplica el plan
 * nuevo, la fecha de inicio y los montos por integrante.
 *
 * A diferencia del anexo de adherentes (1 anexo = N filas), acá:
 *   1 cambio = 1 venta-operación = 1 fila en `plan_changes`
 * Los integrantes viven dentro de `members_snapshot`.
 */

import { SALE_TYPE_CAMBIO_PLAN } from '@/lib/saleFilters';

export { SALE_TYPE_CAMBIO_PLAN };

/** Motivos del formulario en papel. El CHECK de la tabla sólo acepta estos 3. */
export type PlanChangeReason = 'separacion' | 'mayor_cobertura' | 'menor_cobertura';

export const PLAN_CHANGE_REASONS: { value: PlanChangeReason; label: string }[] = [
  { value: 'separacion', label: 'Separación del contrato actual a uno independiente' },
  { value: 'mayor_cobertura', label: 'Pasar a plan de mayor cobertura' },
  { value: 'menor_cobertura', label: 'Pasar a plan de menor cobertura' },
];

export const planChangeReasonLabel = (value?: string | null): string =>
  PLAN_CHANGE_REASONS.find((r) => r.value === value)?.label ?? (value || '');

/**
 * Una fila de la tabla de INTEGRANTES del formulario.
 *
 * La forma es EXACTAMENTE la que lee el trigger `activate_plan_change`
 * (migración 20260819000002). Cambiar una clave acá deja al trigger sin poder
 * ubicar al integrante y el monto nuevo se ignora en silencio.
 */
export interface PlanChangeMemberInput {
  /** Fila de `beneficiaries` del contrato madre. null si el titular no tiene una. */
  beneficiary_id: string | null;
  is_primary: boolean;
  name: string;
  previous_plan: string;
  previous_amount: number;
  new_amount: number;
}

/** Cambios de plan de un contrato madre, con su venta-operación. */
export const usePlanChanges = (parentSaleId?: string) => {
  return useQuery({
    queryKey: ['plan-changes', parentSaleId],
    queryFn: async () => {
      if (!parentSaleId) return [];
      const { data, error } = await supabase
        .from('plan_changes')
        .select(
          '*, operation_sale:operation_sale_id (id, contract_number, status, total_amount, sale_date)',
        )
        .eq('parent_sale_id', parentSaleId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!parentSaleId,
  });
};

export interface CreatePlanChangeInput {
  parentSaleId: string;
  reason: PlanChangeReason;
  newPlanId: string;
  newContractStartDate?: string | null;
  observations?: string | null;
  members: PlanChangeMemberInput[];
}

export const useCreatePlanChange = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      parentSaleId,
      reason,
      newPlanId,
      newContractStartDate,
      observations,
      members,
    }: CreatePlanChangeInput) => {
      if (!members.length) throw new Error('El cambio de plan necesita al menos un integrante.');
      if (!newPlanId) throw new Error('Elegí el plan nuevo.');

      // 1. Contrato madre + titular + plan actual (snapshot para el documento)
      const { data: parent, error: parentError } = await supabase
        .from('sales')
        .select(`
          id, company_id, client_id, plan_id, salesperson_id, total_amount, immediate_coverage,
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

      // Cuota mensual NUEVA del GRUPO COMPLETO. Es el total de la
      // venta-operación y la base de cálculo de la comisión, por eso se suma
      // acá y no se toma del contrato madre (cuyo total lo calcula SÓLO la
      // base — bug conocido #10).
      const nuevoTotalGrupo = members.reduce((sum, m) => sum + (Number(m.new_amount) || 0), 0);

      // 2. Venta-operación. El trigger le asigna un número de la serie
      //    CMB-YYYY-NNNNNN, separada de la de contratos y de la de anexos.
      const { data: operationSale, error: saleError } = await supabase
        .from('sales')
        .insert({
          company_id: (parent as any).company_id,
          client_id: (parent as any).client_id,
          plan_id: newPlanId,
          salesperson_id: (parent as any).salesperson_id,
          sale_type: SALE_TYPE_CAMBIO_PLAN,
          status: 'borrador',
          total_amount: nuevoTotalGrupo,
          sale_date: new Date().toISOString().slice(0, 10),
          immediate_coverage: (parent as any).immediate_coverage ?? false,
          // La venta-operación no es una venta comercial: es el vehículo para
          // firmar el formulario sobre un contrato que YA pasó auditoría. Con el
          // default 'pendiente', SaleTemplatesTab bloquea el alta de plantillas
          // y el cambio queda creado pero sin poder emitir el formulario.
          // Solo afecta a ventas-operación; ninguna venta real cambia.
          audit_status: 'aprobado_para_templates',
        } as any)
        .select()
        .single();

      if (saleError) throw saleError;

      // A partir de acá, si algo falla hay que deshacer la venta-operación
      // para no dejar basura colgada.
      try {
        // 3. Una sola fila describe todo el cambio; los integrantes van en el
        //    snapshot, que es una FOTO del contrato al momento de la solicitud:
        //    si después se editan los adherentes, el formulario firmado no
        //    tiene que cambiar.
        const { data: planChange, error: pcError } = await supabase
          .from('plan_changes')
          .insert({
            company_id: (parent as any).company_id,
            client_id: (parent as any).client_id,
            operation_sale_id: operationSale.id,
            parent_sale_id: parentSaleId,
            previous_plan_id: (parent as any).plan_id || null,
            new_plan_id: newPlanId,
            previous_total_amount: Number((parent as any).total_amount || 0),
            new_total_amount: nuevoTotalGrupo,
            reason,
            titular_name: titularName,
            titular_document: getClientDocument(cliente) || null,
            members_snapshot: members.map((m) => ({
              beneficiary_id: m.beneficiary_id || null,
              is_primary: !!m.is_primary,
              name: m.name,
              previous_plan: m.previous_plan || '',
              previous_amount: Number(m.previous_amount) || 0,
              new_amount: Number(m.new_amount) || 0,
            })),
            new_contract_start_date: newContractStartDate || null,
            observations: observations || null,
            // Vocabulario de plan_changes: la tabla usa estados en INGLÉS
            // ('draft','sent','signed','completed','cancelled') y source en
            // ('existing_sale','external_sale'). No confundir con sales.status,
            // que sí es en español. Escribir 'borrador' acá revienta con 23514
            // (plan_changes_status_check).
            status: 'draft',
            source: 'existing_sale',
          })
          .select()
          .single();

        if (pcError) throw pcError;

        return { operationSale, planChange };
      } catch (err) {
        // Rollback manual: no hay transacción entre llamadas REST.
        await supabase.from('sales').delete().eq('id', operationSale.id);
        throw err;
      }
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['plan-changes', variables.parentSaleId] });
      queryClient.invalidateQueries({ queryKey: ['sales'] });
      toast({
        title: 'Cambio de plan creado',
        description: 'Ya podés generar y enviar a firmar el Formulario de Solicitud de Cambio.',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'No se pudo crear el cambio de plan.',
        variant: 'destructive',
      });
    },
  });
};

/** Estados desde los que todavía se puede tocar un cambio de plan. */
const EDITABLE_STATUS = 'draft';
const CANCELABLE_STATUSES = ['draft', 'sent'];

/**
 * Estados de la VENTA-OPERACIÓN en los que el formulario todavía se puede tocar.
 *
 * `plan_changes.status` NO alcanza como guarda: nadie escribe nunca 'sent' ni
 * 'signed' —el único salto real es draft → completed, y lo hace el trigger
 * recién cuando la venta-operación llega a 'completado'—. Mientras el titular
 * ya firmó y falta la contratada, la venta-operación está en 'firmado' pero el
 * cambio de plan sigue en 'draft'.
 *
 * Acá es peor que en la incorporación: el update sólo toca `plan_changes` y
 * `sales`, no hay ningún guard de base que lo frene, así que sin esta guarda se
 * reescribe el `members_snapshot` de un formulario YA FIRMADO en silencio, y el
 * PDF firmado queda diciendo otra cosa que la base.
 */
const OPERATION_EDITABLE_STATUSES = ['borrador'];

/** Cancelar se admite hasta que alguien haya firmado. */
const OPERATION_CANCELABLE_STATUSES = ['borrador', 'enviado', 'pendiente'];

/**
 * Corrige los datos de un cambio de plan que todavía está en borrador
 * (típicamente un monto mal tipeado, detectado antes de enviar a firmar).
 *
 * Actualiza también el total de la venta-operación, que es la base de cálculo
 * de la comisión: si sólo se tocara el snapshot, el formulario y la comisión
 * dirían cosas distintas.
 *
 * Después de `draft` no se puede editar: el formulario ya se generó y puede
 * estar firmado. Ahí el camino es cancelar y crear uno nuevo. La base también
 * lo impide (trigger `plan_changes_guard_lifecycle`, 42501); esta guarda es la
 * capa de UI para dar un mensaje entendible.
 */
export const useUpdatePlanChange = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      reason,
      newPlanId,
      newContractStartDate,
      observations,
      members,
    }: {
      id: string;
      reason?: PlanChangeReason;
      newPlanId?: string;
      newContractStartDate?: string | null;
      observations?: string | null;
      members?: PlanChangeMemberInput[];
    }) => {
      const { data: actual, error: readError } = await supabase
        .from('plan_changes')
        .select(
          'id, status, operation_sale_id, parent_sale_id, operation_sale:operation_sale_id (status)',
        )
        .eq('id', id)
        .maybeSingle();

      if (readError) throw readError;
      if (!actual) throw new Error('No se encontró el cambio de plan.');
      if (actual.status !== EDITABLE_STATUS) {
        throw new Error(
          'El cambio de plan ya fue enviado a firmar y no se puede editar. Cancelalo y creá uno nuevo.',
        );
      }
      const estadoOperacion = (actual.operation_sale as { status?: string } | null)?.status;
      if (estadoOperacion && !OPERATION_EDITABLE_STATUSES.includes(estadoOperacion)) {
        throw new Error(
          'El formulario ya se emitió o se está firmando: editarlo dejaría el PDF firmado diciendo una cosa y la base otra. Cancelalo y creá uno nuevo.',
        );
      }

      const patch: Record<string, any> = { updated_at: new Date().toISOString() };
      if (reason) patch.reason = reason;
      if (newPlanId) patch.new_plan_id = newPlanId;
      if (newContractStartDate !== undefined) {
        patch.new_contract_start_date = newContractStartDate || null;
      }
      if (observations !== undefined) patch.observations = observations || null;

      let nuevoTotalGrupo: number | null = null;
      if (members) {
        if (!members.length) throw new Error('El cambio de plan necesita al menos un integrante.');
        nuevoTotalGrupo = members.reduce((sum, m) => sum + (Number(m.new_amount) || 0), 0);
        patch.members_snapshot = members.map((m) => ({
          beneficiary_id: m.beneficiary_id || null,
          is_primary: !!m.is_primary,
          name: m.name,
          previous_plan: m.previous_plan || '',
          previous_amount: Number(m.previous_amount) || 0,
          new_amount: Number(m.new_amount) || 0,
        }));
        patch.new_total_amount = nuevoTotalGrupo;
      }

      const { error: pcError } = await supabase.from('plan_changes').update(patch).eq('id', id);
      if (pcError) throw pcError;

      if (actual.operation_sale_id && (nuevoTotalGrupo !== null || newPlanId)) {
        const salePatch: Record<string, any> = {};
        if (nuevoTotalGrupo !== null) salePatch.total_amount = nuevoTotalGrupo;
        if (newPlanId) salePatch.plan_id = newPlanId;

        const { error: saleError } = await supabase
          .from('sales')
          .update(salePatch as any)
          .eq('id', actual.operation_sale_id);

        if (saleError) throw saleError;
      }

      return actual;
    },
    onSuccess: (actual: any) => {
      queryClient.invalidateQueries({ queryKey: ['plan-changes', actual?.parent_sale_id] });
      queryClient.invalidateQueries({ queryKey: ['sales'] });
      toast({ title: 'Cambio de plan actualizado' });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'No se pudo actualizar el cambio de plan.',
        variant: 'destructive',
      });
    },
  });
};

/**
 * Cancela un cambio de plan que todavía no se aplicó.
 *
 * NO borra nada: deja la fila en `cancelled` y la venta-operación en
 * `cancelado`. Un cambio ya completado no se cancela desde acá — el contrato
 * madre ya tiene el plan y los montos nuevos, y revertir eso es un problema
 * contable, no de pantalla.
 */
export const useCancelPlanChange = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id }: { id: string }) => {
      const { data: actual, error: readError } = await supabase
        .from('plan_changes')
        .select(
          'id, status, operation_sale_id, parent_sale_id, operation_sale:operation_sale_id (status)',
        )
        .eq('id', id)
        .maybeSingle();

      if (readError) throw readError;
      if (!actual) throw new Error('No se encontró el cambio de plan.');
      if (actual.status === 'completed') {
        throw new Error(
          'El cambio de plan ya fue aplicado al contrato. No se puede cancelar.',
        );
      }
      if (!CANCELABLE_STATUSES.includes(actual.status)) {
        throw new Error(`No se puede cancelar un cambio de plan en estado "${actual.status}".`);
      }
      const estadoOperacion = (actual.operation_sale as { status?: string } | null)?.status;
      if (estadoOperacion && !OPERATION_CANCELABLE_STATUSES.includes(estadoOperacion)) {
        throw new Error(
          `No se puede cancelar: el formulario ya está en estado "${estadoOperacion}". Si alguien firmó, hay que anularlo por el circuito de la venta.`,
        );
      }

      const { error: pcError } = await supabase
        .from('plan_changes')
        .update({ status: 'cancelled', updated_at: new Date().toISOString() })
        .eq('id', id);

      if (pcError) throw pcError;

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
      queryClient.invalidateQueries({ queryKey: ['plan-changes', actual?.parent_sale_id] });
      queryClient.invalidateQueries({ queryKey: ['sales'] });
      toast({
        title: 'Cambio de plan cancelado',
        description: 'Queda registrado como cancelado; no se borró nada.',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'No se pudo cancelar el cambio de plan.',
        variant: 'destructive',
      });
    },
  });
};

/**
 * Devuelve la venta enriquecida con `plan_change`: los datos del cambio que
 * esa venta-operación representa (planes con nombre, montos, motivo, fecha de
 * inicio, observaciones y la tabla de integrantes).
 *
 * El formulario se genera en el contexto de la venta-operación, cuyo registro
 * de `sales` sólo conoce el plan NUEVO y el total nuevo. Todo el resto —plan
 * anterior, monto anterior por integrante, motivo— vive en `plan_changes`, así
 * que hay que traerlo para que el motor de plantillas pueda imprimirlo.
 *
 * Para cualquier venta que no sea un cambio de plan devuelve la venta tal cual.
 */
export const attachPlanChangeContext = async (sale: any): Promise<any> => {
  if (!sale || sale.sale_type !== SALE_TYPE_CAMBIO_PLAN) return sale;

  const { data: pc } = await supabase
    .from('plan_changes')
    .select('*')
    .eq('operation_sale_id', sale.id)
    .limit(1)
    .maybeSingle();

  if (!pc) return sale;

  // Nombres de los planes: el snapshot guarda ids, y el formulario imprime
  // nombres. Se resuelven en una sola consulta.
  const planIds = [pc.previous_plan_id, pc.new_plan_id].filter(Boolean);
  let planNames: Record<string, string> = {};
  if (planIds.length) {
    const { data: planes } = await supabase
      .from('plans')
      .select('id, name')
      .in('id', planIds as string[]);
    planNames = (planes || []).reduce((acc: Record<string, string>, p: any) => {
      acc[p.id] = p.name;
      return acc;
    }, {});
  }

  return {
    ...sale,
    plan_change: {
      id: pc.id,
      status: pc.status,
      reason: pc.reason,
      reason_label: planChangeReasonLabel(pc.reason),
      previous_plan_id: pc.previous_plan_id || null,
      previous_plan_name: pc.previous_plan_id ? planNames[pc.previous_plan_id] || '' : '',
      new_plan_id: pc.new_plan_id || null,
      new_plan_name: pc.new_plan_id ? planNames[pc.new_plan_id] || '' : '',
      previous_total_amount: Number(pc.previous_total_amount || 0),
      new_total_amount: Number(pc.new_total_amount || 0),
      new_contract_start_date: pc.new_contract_start_date || null,
      observations: pc.observations || '',
      titular_name: pc.titular_name || '',
      titular_document: pc.titular_document || '',
      members: Array.isArray(pc.members_snapshot) ? pc.members_snapshot : [],
    },
  };
};
