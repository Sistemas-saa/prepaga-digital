import { useState } from 'react';
import { Plus, Trash2, Baby } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  useAddCommissionAdjustment,
  useCommissionAdjustments,
  useCommissionPayable,
  useDeleteCommissionAdjustment,
  useSuggestMaternityAdjustments,
} from '@/hooks/useCommissions';
import { formatCommissionCurrency } from '@/lib/commissionCurrency';
import { parseLocalizedAmount } from '@/lib/commissions/parseAmount';
import type { CommissionAdjustmentConcept } from '@/types/commissions';

const CONCEPT_LABEL: Record<CommissionAdjustmentConcept, string> = {
  viatico: 'Viático',
  recupero: 'Recupero',
  bonificacion: 'Bonificación',
  adicional: 'Adicional',
  descuento: 'Descuento',
  otro: 'Otro',
};

interface Props {
  periodId: string;
  currencyCode: string;
  /** Sólo un período en borrador acepta altas y bajas (lo exige también la base). */
  editable: boolean;
}

/**
 * Viático, recupero, bonificación, adicional y descuentos de una liquidación.
 * No modifica el total de la liquidación (Σ ítems): el "total a cobrar" sale de
 * la vista `commission_period_payable`.
 */
export function CommissionAdjustmentsCard({ periodId, currencyCode, editable }: Props) {
  const adjustments = useCommissionAdjustments(periodId);
  const payable = useCommissionPayable(periodId);
  const add = useAddCommissionAdjustment();
  const remove = useDeleteCommissionAdjustment();
  const suggest = useSuggestMaternityAdjustments();

  const [concept, setConcept] = useState<CommissionAdjustmentConcept>('viatico');
  const [mode, setMode] = useState<'amount' | 'percent'>('amount');
  const [sign, setSign] = useState<'1' | '-1'>('1');
  const [amount, setAmount] = useState('');
  const [base, setBase] = useState('');
  const [percent, setPercent] = useState('');
  const [notes, setNotes] = useState('');

  const money = (value: number) => formatCommissionCurrency(Number(value || 0), currencyCode);

  // El módulo de reporte se aplica por separado; si la base todavía no tiene las
  // tablas, la pantalla de la liquidación sigue funcionando sin esta tarjeta.
  if (adjustments.isError) {
    return <Card><CardHeader><CardTitle>Ajustes de la liquidación</CardTitle><CardDescription>No disponibles: la base no tiene aplicado el módulo de ajustes o no tienes acceso.</CardDescription></CardHeader></Card>;
  }

  const submit = () => {
    const parsed = parseLocalizedAmount;
    if (mode === 'amount') {
      if (!amount.trim() || !(parsed(amount) >= 0)) { toast.error('Ingresa un monto válido (0 o mayor).'); return; }
    } else {
      if (!base.trim() || !(parsed(base) >= 0)) { toast.error('Ingresa una base válida (0 o mayor).'); return; }
      if (!percent.trim() || !(parsed(percent) >= 0 && parsed(percent) <= 100)) { toast.error('El porcentaje debe estar entre 0 y 100.'); return; }
    }
    add.mutate({
      periodId,
      concept,
      calcMode: mode,
      amount: mode === 'amount' ? parsed(amount) : undefined,
      baseAmount: mode === 'percent' ? parsed(base) : undefined,
      percent: mode === 'percent' ? parsed(percent) : undefined,
      sign: concept === 'otro' ? (Number(sign) as 1 | -1) : undefined,
      notes,
    }, { onSuccess: () => { setAmount(''); setBase(''); setPercent(''); setNotes(''); } });
  };

  const list = adjustments.data || [];
  const totals = payable.data;

  return <Card>
    <CardHeader>
      <CardTitle>Ajustes de la liquidación</CardTitle>
      <CardDescription>Viático, recupero, bonificación, adicionales y descuentos. No cambian el total de las comisiones: se suman al total a cobrar.</CardDescription>
    </CardHeader>
    <CardContent className="space-y-5">
      {editable && <div className="grid gap-3 rounded-md border p-4 sm:grid-cols-2 lg:grid-cols-6">
        <div className="space-y-2"><Label>Concepto</Label>
          <Select value={concept} onValueChange={(v) => setConcept(v as CommissionAdjustmentConcept)}>
            <SelectTrigger aria-label="Concepto del ajuste"><SelectValue /></SelectTrigger>
            <SelectContent>{(Object.keys(CONCEPT_LABEL) as CommissionAdjustmentConcept[]).map((key) => <SelectItem key={key} value={key}>{CONCEPT_LABEL[key]}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        {concept === 'otro' && <div className="space-y-2"><Label>Signo</Label>
          <Select value={sign} onValueChange={(v) => setSign(v as '1' | '-1')}>
            <SelectTrigger aria-label="Signo del ajuste"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="1">Suma</SelectItem><SelectItem value="-1">Resta</SelectItem></SelectContent>
          </Select>
        </div>}
        <div className="space-y-2"><Label>Cálculo</Label>
          <Select value={mode} onValueChange={(v) => setMode(v as 'amount' | 'percent')}>
            <SelectTrigger aria-label="Modo de cálculo"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="amount">Monto fijo</SelectItem><SelectItem value="percent">Porcentaje de una base</SelectItem></SelectContent>
          </Select>
        </div>
        {mode === 'amount'
          ? <div className="space-y-2"><Label htmlFor="adj-amount">Monto</Label><Input id="adj-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" /></div>
          : <>
            <div className="space-y-2"><Label htmlFor="adj-base">Base</Label><Input id="adj-base" inputMode="decimal" value={base} onChange={(e) => setBase(e.target.value)} placeholder="0" /></div>
            <div className="space-y-2"><Label htmlFor="adj-percent">%</Label><Input id="adj-percent" inputMode="decimal" value={percent} onChange={(e) => setPercent(e.target.value)} placeholder="15" /></div>
          </>}
        <div className="space-y-2"><Label htmlFor="adj-notes">Nota</Label><Input id="adj-notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Opcional" /></div>
        <div className="flex items-end gap-2">
          <Button onClick={submit} disabled={add.isPending}><Plus className="mr-2 h-4 w-4" />Agregar</Button>
        </div>
      </div>}

      {editable && <div>
        <Button variant="outline" size="sm" disabled={suggest.isPending} onClick={() => suggest.mutate(periodId)}>
          <Baby className="mr-2 h-4 w-4" />Sugerir adicionales por maternidad
        </Button>
      </div>}

      <div className="overflow-x-auto"><Table>
        <TableHeader><TableRow><TableHead>Concepto</TableHead><TableHead>Cálculo</TableHead><TableHead>Nota</TableHead><TableHead className="text-right">Importe</TableHead>{editable && <TableHead />}</TableRow></TableHeader>
        <TableBody>
          {list.map((adj) => <TableRow key={adj.id}>
            <TableCell>{CONCEPT_LABEL[adj.concept] ?? adj.concept}{adj.item_id && <span className="ml-2 text-xs text-muted-foreground">(por venta)</span>}</TableCell>
            <TableCell>{adj.calc_mode === 'percent' ? `${adj.percent}% de ${money(Number(adj.base_amount))}` : 'Monto fijo'}</TableCell>
            <TableCell className="text-muted-foreground">{adj.notes || '—'}</TableCell>
            <TableCell className="text-right font-medium">{adj.sign === -1 ? '−' : ''}{money(Number(adj.amount))}</TableCell>
            {editable && <TableCell className="text-right"><Button variant="ghost" size="icon" aria-label="Eliminar ajuste" disabled={remove.isPending} onClick={() => remove.mutate({ adjustmentId: adj.id, periodId })}><Trash2 className="h-4 w-4" /></Button></TableCell>}
          </TableRow>)}
          {!adjustments.isLoading && !list.length && <TableRow><TableCell colSpan={editable ? 5 : 4} className="py-6 text-center text-muted-foreground">Sin ajustes cargados.</TableCell></TableRow>}
        </TableBody>
      </Table></div>

      {payable.isError && <p className="text-sm text-destructive">No se pudo calcular el total a cobrar. Los ajustes cargados siguen guardados.</p>}
      {totals && <dl className="grid gap-3 sm:grid-cols-3">
        <div><dt className="text-sm text-muted-foreground">Comisiones (ítems)</dt><dd className="text-lg font-semibold">{money(Number(totals.total_items))}</dd></div>
        <div><dt className="text-sm text-muted-foreground">Ajustes</dt><dd className="text-lg font-semibold">{money(Number(totals.total_adjustments))}</dd></div>
        <div><dt className="text-sm text-muted-foreground">Total a cobrar</dt><dd className="text-xl font-bold" data-testid="total-a-cobrar">{money(Number(totals.total_a_cobrar))}</dd></div>
      </dl>}
    </CardContent>
  </Card>;
}
