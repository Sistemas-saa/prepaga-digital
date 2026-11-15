import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Plus, Repeat, ExternalLink, AlertCircle, Ban, Pencil } from 'lucide-react';
import { toast } from 'sonner';
import { formatCurrency } from '@/lib/utils';
import { useSale } from '@/hooks/useSale';
import { usePlans } from '@/hooks/usePlans';
import { useBeneficiaries } from '@/hooks/useBeneficiaries';
import { getClientDisplayName } from '@/lib/clientUtils';
import {
  usePlanChanges,
  useCreatePlanChange,
  useUpdatePlanChange,
  useCancelPlanChange,
  planChangeReasonLabel,
  PLAN_CHANGE_REASONS,
  type PlanChangeMemberInput,
  type PlanChangeReason,
} from '@/hooks/usePlanChanges';

interface SalePlanChangeTabProps {
  saleId?: string;
  /** Estado del contrato madre: solo se cambia el plan de contratos firmados. */
  saleStatus?: string | null;
}

const parseAmount = (v: string) => {
  const digits = v.replace(/\D/g, '');
  return digits ? Number(digits) : 0;
};
const showAmount = (v: number) => (v ? v.toLocaleString('es-PY', { maximumFractionDigits: 0 }) : '');

/** Cancelable mientras la operación no se aplicó al contrato. */
const CANCELABLE = ['draft', 'sent'];
/** Único estado desde el que la base deja editar (trigger `plan_changes_guard_lifecycle`). */
const EDITABLE = 'draft';

/**
 * Estados de la VENTA-OPERACIÓN en los que el formulario todavía se puede tocar.
 *
 * No alcanza con `c.status`: nadie escribe nunca 'sent' ni 'signed', así que se
 * queda en 'draft' incluso después de que el titular firmó (ahí la
 * venta-operación ya está en 'firmado'). Y acá no hay ningún guard de base que
 * frene el update, así que sin esto se reescribe el snapshot de un formulario
 * ya firmado en silencio. Los hooks repiten la guarda.
 */
const OP_EDITABLE = ['borrador'];
const OP_CANCELABLE = ['borrador', 'enviado', 'pendiente'];

/**
 * Fila de `plan_changes` (y de su `members_snapshot`). La tabla todavía no está
 * en types.ts, así que se tipa suelta como en el hook.
 */
type CambioPlan = Record<string, any>;

/**
 * Clave de fila de un integrante. Tiene que ser la misma al armar la tabla desde
 * el contrato madre y al rearmarla desde el snapshot, porque es la que indexa
 * los montos nuevos que se están tipeando.
 */
const memberKey = (m: { beneficiary_id?: string | null; is_primary?: boolean }, i: number) =>
  m.beneficiary_id || (m.is_primary ? 'titular' : `integrante-${i}`);

/**
 * "Cambio de Plan" sobre un contrato ya firmado.
 *
 * No modifica el contrato madre: crea una VENTA-OPERACIÓN aparte con el plan
 * nuevo y la cuota nueva del grupo. Desde ahí se genera y se firma el
 * Formulario de Solicitud de Cambio con el circuito de firma de siempre, y
 * recién cuando termina la base aplica el plan y los montos al contrato
 * original (trigger `activate_plan_change`).
 */
const SalePlanChangeTab: React.FC<SalePlanChangeTabProps> = ({ saleId, saleStatus }) => {
  const navigate = useNavigate();
  const { data: cambios = [], isLoading } = usePlanChanges(saleId);
  const { data: sale } = useSale(saleId || '');
  const { data: plans = [] } = usePlans();
  const { data: beneficiarios = [] } = useBeneficiaries(saleId || '');
  const crear = useCreatePlanChange();
  const actualizar = useUpdatePlanChange();
  const cancelar = useCancelPlanChange();

  const [showForm, setShowForm] = useState(false);
  /** Cambio de plan que se está corrigiendo; null = alta nueva. */
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [reason, setReason] = useState<PlanChangeReason | ''>('');
  const [newPlanId, setNewPlanId] = useState('');
  const [startDate, setStartDate] = useState('');
  const [observations, setObservations] = useState('');
  /** Monto nuevo por integrante, indexado por la clave de fila. */
  const [nuevosMontos, setNuevosMontos] = useState<Record<string, number>>({});

  const habilitado = saleStatus === 'firmado' || saleStatus === 'completado';

  const editando = useMemo(
    () => (cambios as CambioPlan[]).find((c) => c.id === editandoId) || null,
    [cambios, editandoId],
  );

  const planActual = (sale as any)?.plans?.name || '';

  /**
   * Integrantes del contrato madre: el titular primero, después los adherentes.
   *
   * El titular NO se busca como beneficiario con relationship='Titular' (bug
   * conocido #4: esa fila fantasma no debe existir). Se lo toma de
   * `sales.client_id` y su `beneficiary_id` sale de la fila marcada
   * `is_primary`, que algunos contratos tienen y otros no; si no existe queda
   * null y el trigger de activación escribe sólo en `sales.titular_amount`.
   */
  const integrantes = useMemo(() => {
    // Al corregir, la tabla se rearma desde el snapshot y NO desde el contrato
    // madre: el snapshot es la foto del momento de la solicitud, y el formulario
    // tiene que seguir describiendo esa foto aunque los adherentes hayan cambiado.
    if (editando) {
      const snapshot = Array.isArray(editando.members_snapshot) ? editando.members_snapshot : [];
      return snapshot.map((m: CambioPlan, i: number) => ({
        key: memberKey(m, i),
        beneficiary_id: m.beneficiary_id || null,
        is_primary: !!m.is_primary,
        name: m.name || '',
        previous_plan: m.previous_plan || '',
        previous_amount: Number(m.previous_amount) || 0,
        new_amount: Number(m.new_amount) || 0,
      })) as (PlanChangeMemberInput & { key: string })[];
    }

    if (!sale) return [] as (PlanChangeMemberInput & { key: string })[];

    const filaPrimary = (beneficiarios as any[])?.find((b) => b.is_primary);
    const titular: PlanChangeMemberInput & { key: string } = {
      key: 'titular',
      beneficiary_id: filaPrimary?.id || null,
      is_primary: true,
      name: getClientDisplayName((sale as any).clients),
      previous_plan: planActual,
      previous_amount: Number(
        filaPrimary?.amount || (sale as any).titular_amount || 0,
      ),
      new_amount: 0,
    };

    const adherentes = (beneficiarios as any[])
      .filter((b) => !b.is_primary)
      .map((b) => ({
        key: b.id,
        beneficiary_id: b.id as string,
        is_primary: false,
        name: `${b.first_name || ''} ${b.last_name || ''}`.trim(),
        previous_plan: planActual,
        previous_amount: Number(b.amount || 0),
        new_amount: 0,
      }));

    return [titular, ...adherentes];
  }, [sale, beneficiarios, planActual, editando]);

  const totalNuevo = integrantes.reduce((s, m) => s + (nuevosMontos[m.key] || 0), 0);
  const totalAnterior = integrantes.reduce((s, m) => s + m.previous_amount, 0);

  if (!saleId) {
    return (
      <p className="text-sm text-muted-foreground">
        Guardá la venta primero para poder solicitar un cambio de plan.
      </p>
    );
  }

  const cerrarForm = () => {
    setShowForm(false);
    setEditandoId(null);
    setReason('');
    setNewPlanId('');
    setStartDate('');
    setObservations('');
    setNuevosMontos({});
  };

  const abrirEdicion = (c: CambioPlan) => {
    const snapshot = Array.isArray(c.members_snapshot) ? c.members_snapshot : [];
    setEditandoId(c.id);
    setReason((c.reason as PlanChangeReason) || '');
    setNewPlanId(c.new_plan_id || '');
    setStartDate(c.new_contract_start_date || '');
    setObservations(c.observations || '');
    setNuevosMontos(
      snapshot.reduce((acc: Record<string, number>, m: CambioPlan, i: number) => {
        acc[memberKey(m, i)] = Number(m.new_amount) || 0;
        return acc;
      }, {}),
    );
    setShowForm(true);
  };

  const handleGuardar = async () => {
    if (!reason) {
      toast.error('Elegí el motivo del cambio.');
      return;
    }
    if (!newPlanId) {
      toast.error('Elegí el plan nuevo.');
      return;
    }
    if (!integrantes.length) {
      toast.error('El contrato no tiene integrantes para cambiar de plan.');
      return;
    }
    if (totalNuevo <= 0) {
      toast.error('Cargá los montos nuevos: la cuota del grupo no puede quedar en cero.');
      return;
    }

    const members: PlanChangeMemberInput[] = integrantes.map(({ key, ...m }) => ({
      ...m,
      new_amount: nuevosMontos[key] || 0,
    }));

    try {
      if (editandoId) {
        await actualizar.mutateAsync({
          id: editandoId,
          reason,
          newPlanId,
          newContractStartDate: startDate || null,
          observations: observations || null,
          members,
        });
        cerrarForm();
        return;
      }

      const res = await crear.mutateAsync({
        parentSaleId: saleId,
        reason,
        newPlanId,
        newContractStartDate: startDate || null,
        observations: observations || null,
        members,
      });
      cerrarForm();
      // Se abre la operación para generar y enviar a firmar el formulario.
      if (res?.operationSale?.id) navigate(`/sales/${res.operationSale.id}/edit`);
    } catch {
      // El hook ya muestra el error.
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Repeat className="h-5 w-5" />
          <h3 className="text-lg font-semibold">Cambios de Plan ({cambios.length})</h3>
        </div>
        {habilitado && !showForm && (
          <Button type="button" size="sm" onClick={() => setShowForm(true)}>
            <Plus className="h-4 w-4 mr-1" />
            Solicitar Cambio de Plan
          </Button>
        )}
      </div>

      {!habilitado && (
        <div className="flex items-start gap-2 rounded-md border border-dashed p-4 text-sm text-muted-foreground">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>
            El cambio de plan está disponible una vez que el contrato está{' '}
            <strong>firmado</strong>. Mientras tanto, cambiá el plan directamente desde la
            pestaña "Básico".
          </span>
        </div>
      )}

      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {editandoId ? 'Editar Cambio de Plan' : 'Nuevo Cambio de Plan'}
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Se genera un Formulario de Solicitud de Cambio con estos datos. El contrato
              original no se modifica: el plan y los montos se aplican recién cuando el
              formulario queda firmado.
            </p>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label>Motivo del cambio *</Label>
                <Select value={reason} onValueChange={(v) => setReason(v as PlanChangeReason)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar motivo" />
                  </SelectTrigger>
                  <SelectContent>
                    {PLAN_CHANGE_REASONS.map((r) => (
                      <SelectItem key={r.value} value={r.value}>
                        {r.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Plan nuevo *</Label>
                <Select value={newPlanId} onValueChange={setNewPlanId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar plan" />
                  </SelectTrigger>
                  <SelectContent>
                    {plans.map((p: any) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {planActual && (
                  <p className="text-xs text-muted-foreground">Plan actual: {planActual}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label>Fecha de Inicio nvo. Cto.</Label>
                {/* Input type="date" trabaja con el string ISO tal cual, sin
                    pasar por new Date(): así no hay corrimiento de un día por
                    zona horaria (bug conocido #1). */}
                <Input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>

              <div className="space-y-2 sm:col-span-2">
                <Label>Observaciones</Label>
                <Textarea
                  value={observations}
                  onChange={(e) => setObservations(e.target.value)}
                  rows={3}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Integrantes</Label>
              <div className="overflow-x-auto rounded-md border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="p-2 text-left font-medium">Integrante</th>
                      <th className="p-2 text-left font-medium">Plan anterior</th>
                      <th className="p-2 text-right font-medium">Monto anterior</th>
                      <th className="p-2 text-right font-medium">Monto nuevo (Gs.)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {integrantes.map((m) => (
                      <tr key={m.key} className="border-t">
                        <td className="p-2">
                          <span className="font-medium">{m.name || '(sin nombre)'}</span>
                          {m.is_primary && (
                            <Badge variant="outline" className="ml-2">
                              Titular
                            </Badge>
                          )}
                        </td>
                        <td className="p-2 text-muted-foreground">{m.previous_plan || '—'}</td>
                        <td className="p-2 text-right text-muted-foreground">
                          {formatCurrency(m.previous_amount)}
                        </td>
                        <td className="p-2 text-right">
                          <Input
                            inputMode="numeric"
                            className="text-right"
                            placeholder="0"
                            value={showAmount(nuevosMontos[m.key] || 0)}
                            onChange={(e) =>
                              setNuevosMontos((prev) => ({
                                ...prev,
                                [m.key]: parseAmount(e.target.value),
                              }))
                            }
                          />
                        </td>
                      </tr>
                    ))}
                    {integrantes.length === 0 && (
                      <tr>
                        <td colSpan={4} className="p-4 text-center text-muted-foreground">
                          Este contrato no tiene integrantes cargados.
                        </td>
                      </tr>
                    )}
                  </tbody>
                  <tfoot className="border-t bg-muted/30">
                    <tr>
                      <td className="p-2 font-medium" colSpan={2}>
                        Cuota mensual del grupo
                      </td>
                      <td className="p-2 text-right text-muted-foreground">
                        {formatCurrency(totalAnterior)}
                      </td>
                      <td className="p-2 text-right font-semibold">
                        {formatCurrency(totalNuevo)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              <p className="text-xs text-muted-foreground">
                El total nuevo es la cuota mensual del grupo completo y es la base de cálculo
                de la comisión de esta operación.
              </p>
            </div>

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={cerrarForm}>
                Cancelar
              </Button>
              <Button
                type="button"
                onClick={handleGuardar}
                disabled={crear.isPending || actualizar.isPending}
              >
                {editandoId
                  ? actualizar.isPending
                    ? 'Guardando...'
                    : 'Guardar cambios'
                  : crear.isPending
                    ? 'Creando...'
                    : 'Crear Cambio de Plan'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <div className="py-8 text-center text-muted-foreground">Cargando cambios de plan...</div>
      ) : cambios.length === 0 ? (
        !showForm && (
          <div className="py-8 text-center text-muted-foreground">
            Este contrato todavía no tiene cambios de plan.
          </div>
        )
      ) : (
        <div className="space-y-2">
          {cambios.map((c: CambioPlan) => {
            const op = c.operation_sale;
            return (
              <Card key={c.id}>
                <CardContent className="flex items-center justify-between gap-4 py-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{op?.contract_number || 'Cambio de Plan'}</span>
                      <Badge variant="outline">{op?.status || 'borrador'}</Badge>
                      <Badge variant="secondary">{c.status}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground truncate">
                      {planChangeReasonLabel(c.reason)}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {(Array.isArray(c.members_snapshot) ? c.members_snapshot.length : 0)}{' '}
                      integrante(s) · {formatCurrency(Number(c.new_total_amount || 0))}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    {/* Editar/cancelar según el estado de la VENTA-OPERACIÓN:
                        `c.status` se queda en 'draft' hasta la activación, así
                        que no distingue un formulario sin emitir de uno firmado. */}
                    {c.status === EDITABLE &&
                      (!op?.status || OP_EDITABLE.includes(op.status as string)) && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={actualizar.isPending}
                        onClick={() => abrirEdicion(c)}
                      >
                        <Pencil className="h-4 w-4 mr-1" />
                        Editar
                      </Button>
                    )}
                    {CANCELABLE.includes(c.status) &&
                      (!op?.status || OP_CANCELABLE.includes(op.status as string)) && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={cancelar.isPending}
                          >
                            <Ban className="h-4 w-4 mr-1" />
                            Cancelar
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>¿Cancelar el cambio de plan?</AlertDialogTitle>
                            <AlertDialogDescription>
                              No se borra nada: la solicitud y su formulario quedan registrados
                              como cancelados. Para cambiar el plan habrá que crear una solicitud
                              nueva.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Volver</AlertDialogCancel>
                            <AlertDialogAction onClick={() => cancelar.mutate({ id: c.id })}>
                              Cancelar cambio de plan
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                    {c.operation_sale_id && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => navigate(`/sales/${c.operation_sale_id}/edit`)}
                      >
                        <ExternalLink className="h-4 w-4 mr-1" />
                        Abrir formulario
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default SalePlanChangeTab;
