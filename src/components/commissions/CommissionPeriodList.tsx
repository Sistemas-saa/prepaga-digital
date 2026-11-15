import { useState } from 'react';
import { Link } from 'react-router-dom';
import { FileSpreadsheet } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { downloadCommissionXlsx, useCommissionPeriods } from '@/hooks/useCommissions';
import { useSimpleAuthContext } from '@/components/SimpleAuthProvider';
import { formatDateOnly } from '@/lib/dateOnly';
import { formatCommissionCurrency } from '@/lib/commissionCurrency';
import { commissionPersonName, type CommissionPeriod, type CommissionPeriodStatus } from '@/types/commissions';

const statusVariant: Record<CommissionPeriodStatus, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  borrador: 'secondary', cerrada: 'default', pagada: 'outline', anulada: 'destructive',
};

const exportRoles = new Set(['super_admin', 'admin', 'financiero']);

/** "Exportar Resumen": un Excel con una hoja por liquidación del rango + el Resumen. */
function ExportSummaryDialog({ periods }: { periods: CommissionPeriod[] }) {
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [busy, setBusy] = useState(false);
  // Las anuladas no se pagan, así que no entran al resumen. Las fechas ISO
  // (YYYY-MM-DD) se comparan como texto: no se pasan por Date (bug de timezone).
  const inRange = periods.filter((p) => p.status !== 'anulada' && p.period_start >= from && p.period_end <= to);
  const run = async () => {
    if (!from || !to || from > to) { toast.error('Elegí un rango de fechas válido.'); return; }
    if (!inRange.length) { toast.error('No hay liquidaciones dentro de ese rango.'); return; }
    try {
      setBusy(true);
      await downloadCommissionXlsx(inRange.map((p) => p.id));
      setOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo exportar el Excel');
    } finally {
      setBusy(false);
    }
  };
  return <Dialog open={open} onOpenChange={setOpen}>
    <DialogTrigger asChild><Button variant="outline"><FileSpreadsheet className="mr-2 h-4 w-4" />Exportar Resumen</Button></DialogTrigger>
    <DialogContent>
      <DialogHeader><DialogTitle>Exportar Resumen a Excel</DialogTitle><DialogDescription>Incluye las liquidaciones cuyo período cae completo dentro del rango (sin las anuladas): una hoja por liquidación más la hoja Resumen.</DialogDescription></DialogHeader>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2"><Label htmlFor="export-from">Desde</Label><Input id="export-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
        <div className="space-y-2"><Label htmlFor="export-to">Hasta</Label><Input id="export-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
      </div>
      {from && to && <p className="text-sm text-muted-foreground">{inRange.length} liquidación(es) en el rango.</p>}
      <DialogFooter><Button onClick={run} disabled={busy || !from || !to}>{busy ? 'Generando...' : 'Exportar'}</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}

export function CommissionPeriodList() {
  const { userRole } = useSimpleAuthContext();
  const periods = useCommissionPeriods();
  if (periods.isLoading) return <div className="py-10 text-center text-muted-foreground">Cargando liquidaciones...</div>;
  if (periods.isError) return <div className="py-10 text-center text-destructive">No se pudo cargar el historial de liquidaciones.</div>;
  return <Card><CardHeader className="flex flex-row items-start justify-between gap-4"><div><CardTitle>Liquidaciones</CardTitle><CardDescription>Historial de períodos generados y su estado contable.</CardDescription></div>{exportRoles.has(userRole || '') && <ExportSummaryDialog periods={periods.data || []} />}</CardHeader><CardContent>
    <div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Número</TableHead><TableHead>Promotor</TableHead><TableHead>Período</TableHead><TableHead>Estado</TableHead><TableHead className="text-right">Total</TableHead><TableHead /></TableRow></TableHeader><TableBody>
      {(periods.data || []).map((period) => <TableRow key={period.id}><TableCell className="font-medium">{period.liquidation_number}</TableCell><TableCell>{period.salesperson_name || commissionPersonName(period.salesperson)}</TableCell><TableCell>{formatDateOnly(period.period_start)} – {formatDateOnly(period.period_end)}</TableCell><TableCell><Badge variant={statusVariant[period.status]}>{period.status}</Badge></TableCell><TableCell className="text-right">{formatCommissionCurrency(Number(period.total_amount || 0), period.currency_code)}</TableCell><TableCell className="text-right"><Button asChild variant="outline" size="sm"><Link to={`/comisiones/${period.id}`}>Ver detalle</Link></Button></TableCell></TableRow>)}
      {!periods.isLoading && !periods.data?.length && <TableRow><TableCell colSpan={6} className="py-8 text-center text-muted-foreground">No hay liquidaciones disponibles.</TableCell></TableRow>}
    </TableBody></Table></div>
  </CardContent></Card>;
}
