import { useMemo, useState } from 'react';
import { AlertTriangle, Calculator } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useCommissionCatalog, useCommissionPreview, useGenerateCommissionPeriod } from '@/hooks/useCommissions';
import { useCurrencySettings } from '@/hooks/useCurrencySettings';
import { useSimpleAuthContext } from '@/components/SimpleAuthProvider';
import { formatDateOnly } from '@/lib/dateOnly';
import { commissionPersonName } from '@/types/commissions';
import { saleTypeLabel } from '@/lib/saleTypes';

export function CommissionPreview() {
  const { profile } = useSimpleAuthContext();
  const catalog = useCommissionCatalog();
  const generate = useGenerateCommissionPeriod();
  const { formatCurrency } = useCurrencySettings();
  const today = new Date();
  const [salespersonId, setSalespersonId] = useState('');
  const [periodStart, setPeriodStart] = useState(`${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`);
  const [periodEnd, setPeriodEnd] = useState(`${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate()).padStart(2, '0')}`);
  const [requested, setRequested] = useState(false);
  const params = requested && profile?.company_id && salespersonId && periodStart && periodEnd
    ? { companyId: profile.company_id, salespersonId, periodStart, periodEnd } : null;
  const preview = useCommissionPreview(params);
  const missing = useMemo(() => (preview.data || []).filter((item) => !item.has_rule), [preview.data]);
  const total = useMemo(() => (preview.data || []).reduce((sum, item) => sum + Number(item.commission_amount || 0), 0), [preview.data]);
  const invalidRange = Boolean(periodStart && periodEnd && periodStart > periodEnd);

  return <Card>
    <CardHeader><CardTitle>Vista previa</CardTitle><CardDescription>Simula la liquidación sin escribir datos. Las ventas sin regla bloquean la generación.</CardDescription></CardHeader>
    <CardContent className="space-y-5">
      <div className="grid gap-4 md:grid-cols-4">
        <div className="space-y-2"><Label>Vendedor</Label><Select value={salespersonId} onValueChange={(v) => { setSalespersonId(v); setRequested(false); }}><SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger><SelectContent>{catalog.data?.profiles.map((p) => <SelectItem key={p.id} value={p.id}>{commissionPersonName(p)}</SelectItem>)}</SelectContent></Select></div>
        <div className="space-y-2"><Label>Desde</Label><Input type="date" value={periodStart} onChange={(e) => { setPeriodStart(e.target.value); setRequested(false); }} /></div>
        <div className="space-y-2"><Label>Hasta</Label><Input type="date" value={periodEnd} onChange={(e) => { setPeriodEnd(e.target.value); setRequested(false); }} /></div>
        <div className="flex items-end"><Button className="w-full" variant="outline" disabled={!salespersonId || !periodStart || !periodEnd || invalidRange} onClick={() => setRequested(true)}><Calculator className="mr-2 h-4 w-4" />Calcular</Button></div>
      </div>
      {invalidRange && <p className="text-sm text-destructive">La fecha desde no puede ser posterior a la fecha hasta.</p>}
      {requested && missing.length > 0 && <Alert variant="destructive"><AlertTriangle className="h-4 w-4" /><AlertTitle>Hay {missing.length} venta(s) sin regla</AlertTitle><AlertDescription className="space-y-2">
        <p>Configure las reglas indicadas antes de generar la liquidación. No se asignará 0% automáticamente.</p>
        <p className="text-xs">Causas frecuentes:</p>
        <ul className="ml-4 list-disc space-y-1 text-xs">
          <li><strong>La regla es posterior a la venta.</strong> «Válida desde» arranca en la fecha de hoy, así que una regla creada hoy no alcanza ventas de meses anteriores. Retrocedé esa fecha hasta antes de la venta más vieja del período.</li>
          <li><strong>La regla está atada a otro vendedor o a otro plan.</strong> Poné «Todos» en el campo que corresponda.</li>
          <li><strong>El vendedor no tiene % por defecto.</strong> Cargalo en Reglas → «Vendedores que comisionan»: se aplica a toda venta que ninguna regla cubra.</li>
        </ul>
      </AlertDescription></Alert>}
      {requested && preview.isError && <Alert variant="destructive"><AlertTriangle className="h-4 w-4" /><AlertTitle>No se pudo calcular</AlertTitle><AlertDescription>{preview.error instanceof Error ? preview.error.message : 'Revise la configuración e intente nuevamente.'}</AlertDescription></Alert>}
      {requested && preview.data && <>
        <div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Fecha</TableHead><TableHead>Cliente</TableHead><TableHead>Plan</TableHead><TableHead>Tipo de venta</TableHead><TableHead>Regla</TableHead><TableHead className="text-right">Base</TableHead><TableHead className="text-right">Comisión</TableHead></TableRow></TableHeader><TableBody>
          {preview.data.map((item) => <TableRow key={item.sale_id} className={!item.has_rule ? 'bg-destructive/10' : ''}><TableCell>{formatDateOnly(item.sale_date)}</TableCell><TableCell>{item.client_name}<div className="text-xs text-muted-foreground">{item.client_display_id || item.sale_id.slice(0, 8)}</div></TableCell><TableCell>{item.plan_name}</TableCell><TableCell>{saleTypeLabel(item.sale_type) || '—'}</TableCell><TableCell>{item.has_rule
              ? <>{item.percent != null ? `${item.percent}%` : 'Fija'}{!item.rule_id && <div className="text-xs text-muted-foreground">% por defecto</div>}</>
              : <span className="font-medium text-destructive">Sin regla</span>}</TableCell><TableCell className="text-right">{item.base_amount == null ? '—' : formatCurrency(Number(item.base_amount))}</TableCell><TableCell className="text-right font-medium">{item.commission_amount == null ? '—' : formatCurrency(Number(item.commission_amount))}</TableCell></TableRow>)}
          {!preview.data.length && <TableRow><TableCell colSpan={7} className="py-8 text-center text-muted-foreground">No hay ventas elegibles para este período.</TableCell></TableRow>}
        </TableBody></Table></div>
        <div className="flex flex-col items-end gap-3 sm:flex-row sm:justify-end sm:items-center"><div className="text-right"><div className="text-sm text-muted-foreground">Total estimado</div><div className="text-xl font-semibold">{formatCurrency(total)}</div></div><Button disabled={!preview.data.length || missing.length > 0 || generate.isPending || !params} onClick={() => params && generate.mutate(params)}>Generar borrador</Button></div>
      </>}
    </CardContent>
  </Card>;
}
