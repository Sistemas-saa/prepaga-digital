import { useState } from 'react';
import { Pencil, Plus, PowerOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useCommissionCatalog, useCommissionRules, useDeactivateCommissionRule, useSaveCommissionRule } from '@/hooks/useCommissions';
import type { CommissionBase, CommissionCalcMode, CommissionGroupType, CommissionRule } from '@/types/commissions';
import { commissionPersonName } from '@/types/commissions';
import { SALE_TYPE_OPTIONS, saleTypeLabel } from '@/lib/saleTypes';

const ALL = '__all__';
const todayLocal = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};
const emptyRule = (): Partial<CommissionRule> => ({
  salesperson_id: null, plan_id: null, sale_type: null, group_type: null,
  calc_mode: 'percent', percent: 0, fixed_amount: null, base: 'sale_total_amount',
  valid_from: todayLocal(), valid_to: null, priority: 0, is_active: true,
});

export function CommissionRulesPanel({ canManage }: { canManage: boolean }) {
  const rules = useCommissionRules();
  const catalog = useCommissionCatalog();
  const save = useSaveCommissionRule();
  const deactivate = useDeactivateCommissionRule();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Partial<CommissionRule>>(emptyRule);

  if (rules.isLoading || catalog.isLoading) return <div className="py-8 text-center text-muted-foreground">Cargando reglas...</div>;
  if (rules.isError || catalog.isError) return <div className="py-8 text-center text-destructive">No se pudo cargar la configuración de reglas.</div>;

  const edit = (rule?: CommissionRule) => {
    setDraft(rule ? { ...rule } : emptyRule());
    setOpen(true);
  };
  const set = <K extends keyof CommissionRule>(key: K, value: CommissionRule[K]) => setDraft((current) => ({ ...current, [key]: value }));
  const submit = () => {
    if (!draft.valid_from || !draft.calc_mode || !draft.base) return;
    save.mutate({
      id: draft.id, company_id: draft.company_id || '', salesperson_id: draft.salesperson_id || null, plan_id: draft.plan_id || null,
      sale_type: draft.sale_type || null, group_type: draft.group_type || null,
      calc_mode: draft.calc_mode, percent: draft.calc_mode === 'percent' ? Number(draft.percent || 0) : null,
      fixed_amount: draft.calc_mode === 'fixed' ? Number(draft.fixed_amount || 0) : null,
      base: draft.base, valid_from: draft.valid_from, valid_to: draft.valid_to || null,
      priority: Number(draft.priority || 0), is_active: draft.is_active ?? true,
    }, { onSuccess: () => setOpen(false) });
  };

  return <Card>
    <CardHeader className="flex-row items-start justify-between gap-4">
      <div><CardTitle>Reglas de comisión</CardTitle><CardDescription>Las reglas más prioritarias y específicas se aplican primero.</CardDescription></div>
      {canManage && <Button onClick={() => edit()}><Plus className="mr-2 h-4 w-4" />Nueva regla</Button>}
    </CardHeader>
    <CardContent>
      <div className="overflow-x-auto"><Table>
        <TableHeader><TableRow><TableHead>Alcance</TableHead><TableHead>Cálculo</TableHead><TableHead>Vigencia</TableHead><TableHead>Prioridad</TableHead><TableHead>Estado</TableHead>{canManage && <TableHead />}</TableRow></TableHeader>
        <TableBody>
          {(rules.data || []).map((rule) => <TableRow key={rule.id} className={!rule.is_active ? 'opacity-50' : ''}>
            <TableCell className="min-w-52"><div className="font-medium">{rule.plan?.name || rule.group_type || 'Todos los planes'}</div><div className="text-xs text-muted-foreground">{rule.salesperson ? commissionPersonName(rule.salesperson) : 'Todos los vendedores'} · {saleTypeLabel(rule.sale_type) || 'Todo tipo de venta'}</div></TableCell>
            <TableCell>{rule.calc_mode === 'percent' ? `${rule.percent ?? 0}%` : `${Number(rule.fixed_amount || 0).toLocaleString('es-PY')} fijo`}<div className="text-xs text-muted-foreground">Base: {rule.base}</div></TableCell>
            <TableCell>{rule.valid_from}<div className="text-xs text-muted-foreground">hasta {rule.valid_to || 'sin límite'}</div></TableCell>
            <TableCell>{rule.priority}</TableCell><TableCell>{rule.is_active ? 'Activa' : 'Inactiva'}</TableCell>
            {canManage && <TableCell className="text-right"><Button variant="ghost" size="icon" onClick={() => edit(rule)} aria-label="Editar regla"><Pencil className="h-4 w-4" /></Button>{rule.is_active && <Button variant="ghost" size="icon" onClick={() => deactivate.mutate(rule.id)} aria-label="Desactivar regla"><PowerOff className="h-4 w-4" /></Button>}</TableCell>}
          </TableRow>)}
          {!rules.isLoading && !rules.data?.length && <TableRow><TableCell colSpan={6} className="py-8 text-center text-muted-foreground">No hay reglas configuradas.</TableCell></TableRow>}
        </TableBody>
      </Table></div>
    </CardContent>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-w-2xl"><DialogHeader><DialogTitle>{draft.id ? 'Editar regla' : 'Nueva regla'}</DialogTitle></DialogHeader>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Vendedor" hint="«Todos» hace que la regla valga para cualquier vendedor."><Select value={draft.salesperson_id || ALL} onValueChange={(v) => set('salesperson_id', v === ALL ? null : v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value={ALL}>Todos</SelectItem>{catalog.data?.profiles.map((p) => <SelectItem key={p.id} value={p.id}>{commissionPersonName(p)}</SelectItem>)}</SelectContent></Select></Field>
        <Field label="Plan" hint="«Todos» crea una regla de respaldo: se aplica solo cuando el plan de la venta no tiene una regla propia."><Select value={draft.plan_id || ALL} onValueChange={(v) => set('plan_id', v === ALL ? null : v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value={ALL}>Todos</SelectItem>{catalog.data?.plans.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent></Select></Field>
        <Field label="Tipo de grupo"><Select value={draft.group_type || ALL} onValueChange={(v) => set('group_type', v === ALL ? null : v as CommissionGroupType)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value={ALL}>Todos</SelectItem><SelectItem value="INDIVIDUAL">Individual</SelectItem><SelectItem value="GRUPAL">Grupal</SelectItem></SelectContent></Select></Field>
        <Field label="Modo"><Select value={draft.calc_mode} onValueChange={(v) => set('calc_mode', v as CommissionCalcMode)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="percent">Porcentaje</SelectItem><SelectItem value="fixed">Monto fijo</SelectItem></SelectContent></Select></Field>
        <Field label={draft.calc_mode === 'percent' ? 'Porcentaje' : 'Monto fijo'}><Input type="number" min="0" step="0.01" value={draft.calc_mode === 'percent' ? draft.percent ?? '' : draft.fixed_amount ?? ''} onChange={(e) => draft.calc_mode === 'percent' ? set('percent', Number(e.target.value)) : set('fixed_amount', Number(e.target.value))} /></Field>
        <Field label="Base"><Select value={draft.base} onValueChange={(v) => set('base', v as CommissionBase)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="sale_total_amount">Total de venta</SelectItem><SelectItem value="plan_price">Precio del plan</SelectItem><SelectItem value="per_adherent">Por adherente</SelectItem><SelectItem value="net_of_fee_and_tax">Neto de gasto adm. e IVA (requiere gasto cargado)</SelectItem></SelectContent></Select></Field>
        <Field label="Prioridad" hint="Desempate manual: el número más alto gana. Dejalo igual en todas salvo que quieras que una regla general pise a una específica."><Input type="number" value={draft.priority ?? 0} onChange={(e) => set('priority', Number(e.target.value))} /></Field>
        <Field label="Válida desde" hint="La regla NO alcanza ventas anteriores a esta fecha. Para liquidar meses pasados, retrocedela hasta antes de la venta más vieja."><Input type="date" value={draft.valid_from || ''} onChange={(e) => set('valid_from', e.target.value)} /></Field>
        <Field label="Válida hasta" hint="Vacío = sin vencimiento."><Input type="date" value={draft.valid_to || ''} onChange={(e) => set('valid_to', e.target.value || null)} /></Field>
        <Field label="Tipo de venta" hint="«Todo tipo de venta» hace que la regla valga para cualquiera. Elegir un tipo permite comisionar distinto una incorporación de adherente o un cambio de plan."><Select value={draft.sale_type || ALL} onValueChange={(v) => set('sale_type', v === ALL ? null : v)}><SelectTrigger><SelectValue placeholder={draft.sale_type || 'Seleccionar'} /></SelectTrigger><SelectContent><SelectItem value={ALL}>Todo tipo de venta</SelectItem>{SALE_TYPE_OPTIONS.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}{/* Reglas viejas cargadas a mano pueden tener un sale_type fuera del catalogo (un tipeo). Se lo agrega como opcion para que el trigger no quede EN BLANCO y el operador vea que hay un valor cargado, en vez de perderlo sin aviso al tocar el selector. */}{draft.sale_type && !SALE_TYPE_OPTIONS.some((o) => o.value === draft.sale_type) && <SelectItem value={draft.sale_type}>{draft.sale_type} (fuera del catalogo)</SelectItem>}</SelectContent></Select></Field>
        <div className="flex items-center gap-3 pt-7"><Switch checked={draft.is_active ?? true} onCheckedChange={(v) => set('is_active', v)} /><Label>Regla activa</Label></div>
      </div>
      <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button><Button onClick={submit} disabled={save.isPending}>Guardar</Button></DialogFooter>
    </DialogContent></Dialog>
  </Card>;
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return <div className="space-y-2"><Label>{label}</Label>{children}{hint && <p className="text-xs text-muted-foreground">{hint}</p>}</div>;
}
