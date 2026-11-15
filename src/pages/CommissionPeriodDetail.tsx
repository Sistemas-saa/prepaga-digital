import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Download, FileSpreadsheet, LockKeyhole, Ban, CircleDollarSign } from 'lucide-react';
import { toast } from 'sonner';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useAnnulCommissionPeriod, useCloseCommissionPeriod, useCommissionItems, useCommissionPeriod, useCommissionSettings, usePayCommissionPeriod, downloadCommissionPdf, downloadCommissionXlsx } from '@/hooks/useCommissions';
import { CommissionAdjustmentsCard } from '@/components/commissions/CommissionAdjustmentsCard';
import { useSimpleAuthContext } from '@/components/SimpleAuthProvider';
import { formatDateOnly } from '@/lib/dateOnly';
import { formatCommissionCurrency } from '@/lib/commissionCurrency';
import { commissionPersonName } from '@/types/commissions';
import { saleTypeLabel } from '@/lib/saleTypes';

const managementRoles = new Set(['super_admin', 'admin', 'financiero']);
export default function CommissionPeriodDetail() {
  const { id = '' } = useParams();
  const { userRole } = useSimpleAuthContext();
  const period = useCommissionPeriod(id);
  const items = useCommissionItems(id);
  const settings = useCommissionSettings();
  const close = useCloseCommissionPeriod();
  const pay = usePayCommissionPeriod();
  const annul = useAnnulCommissionPeriod();
  const [reason, setReason] = useState('');
  const [downloading, setDownloading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const canManage = managementRoles.has(userRole || '');
  const download = async () => { try { setDownloading(true); await downloadCommissionPdf(id); } catch (error) { toast.error(error instanceof Error ? error.message : 'No se pudo generar el PDF'); } finally { setDownloading(false); } };
  const exportXlsx = async () => { try { setExporting(true); await downloadCommissionXlsx([id]); } catch (error) { toast.error(error instanceof Error ? error.message : 'No se pudo exportar el Excel'); } finally { setExporting(false); } };
  if (period.isLoading || items.isLoading || settings.isLoading) return <div className="flex min-h-[300px] items-center justify-center text-muted-foreground">Cargando liquidación...</div>;
  if (settings.isError || !settings.data?.is_enabled) return <div className="py-10 text-center text-destructive">El módulo de comisiones no está habilitado.</div>;
  if (period.isError || !period.data) return <div className="py-10 text-center text-destructive">No se pudo cargar la liquidación o no tienes acceso.</div>;
  if (items.isError) return <div className="py-10 text-center text-destructive">No se pudo cargar el detalle congelado de la liquidación.</div>;
  const p = period.data;
  return <div className="space-y-6">
    <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start"><div><Button asChild variant="ghost" size="sm" className="-ml-3 mb-2"><Link to="/comisiones"><ArrowLeft className="mr-2 h-4 w-4" />Volver</Link></Button><div className="flex items-center gap-3"><h1 className="text-3xl font-bold">{p.liquidation_number}</h1><Badge>{p.status}</Badge></div><p className="text-muted-foreground">{p.salesperson_name || commissionPersonName(p.salesperson)} · {formatDateOnly(p.period_start)} – {formatDateOnly(p.period_end)}</p></div>
      <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={download} disabled={downloading || !['cerrada', 'pagada'].includes(p.status)}><Download className="mr-2 h-4 w-4" />Descargar PDF</Button>
        {canManage && <Button variant="outline" onClick={exportXlsx} disabled={exporting}><FileSpreadsheet className="mr-2 h-4 w-4" />Exportar Excel</Button>}
        {canManage && p.status === 'borrador' && <AlertDialog><AlertDialogTrigger asChild><Button disabled={close.isPending || annul.isPending}><LockKeyhole className="mr-2 h-4 w-4" />Cerrar liquidación</Button></AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>¿Cerrar esta liquidación?</AlertDialogTitle><AlertDialogDescription>Los importes quedarán congelados y las ventas se marcarán como liquidadas. Solo podrá revertirse anulando el período.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction disabled={close.isPending} onClick={() => close.mutate({ periodId: id })}>Cerrar</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>}
        {canManage && p.status === 'cerrada' && <AlertDialog><AlertDialogTrigger asChild><Button disabled={pay.isPending || annul.isPending}><CircleDollarSign className="mr-2 h-4 w-4" />Marcar pagada</Button></AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>¿Marcar esta liquidación como pagada?</AlertDialogTitle><AlertDialogDescription>Esta transición es definitiva y conservará el detalle para auditoría.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction disabled={pay.isPending} onClick={() => pay.mutate({ periodId: id })}>Confirmar pago</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>}
        {canManage && (p.status === 'borrador' || p.status === 'cerrada') && <AlertDialog><AlertDialogTrigger asChild><Button variant="destructive" disabled={annul.isPending || close.isPending || pay.isPending}><Ban className="mr-2 h-4 w-4" />Anular</Button></AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Anular liquidación</AlertDialogTitle><AlertDialogDescription>La liquidación se conserva para auditoría y las ventas cerradas vuelven a quedar disponibles.</AlertDialogDescription></AlertDialogHeader><Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Motivo obligatorio" /><AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction disabled={!reason.trim() || annul.isPending} onClick={() => annul.mutate({ periodId: id, reason: reason.trim() })}>Confirmar anulación</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>}
      </div></div>
    <div className="grid gap-4 sm:grid-cols-3"><Summary label="Concepto" value={p.concept} /><Summary label="Ventas" value={String(items.data?.length || 0)} /><Summary label="Total" value={formatCommissionCurrency(Number(p.total_amount || 0), p.currency_code)} /></div>
    <CommissionAdjustmentsCard periodId={id} currencyCode={p.currency_code} editable={canManage && p.status === 'borrador'} />
    <Card><CardHeader><CardTitle>Detalle congelado</CardTitle></CardHeader><CardContent><div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Ítem</TableHead><TableHead>Tipo</TableHead><TableHead>Fecha</TableHead><TableHead>Cliente</TableHead><TableHead>Plan</TableHead><TableHead>Tipo de venta</TableHead><TableHead>%</TableHead><TableHead className="text-right">Base</TableHead><TableHead className="text-right">Comisión</TableHead></TableRow></TableHeader><TableBody>
      {(items.data || []).map((item) => <TableRow key={item.id}><TableCell>{item.item_number}</TableCell><TableCell>{item.group_type}</TableCell><TableCell>{formatDateOnly(item.sale_date)}</TableCell><TableCell>{item.client_name}<div className="text-xs text-muted-foreground">{item.client_display_id || item.sale_id.slice(0, 8)}{item.client_sequence != null ? ` · Sec. ${item.client_sequence}` : ''}</div></TableCell><TableCell>{item.plan_name}</TableCell><TableCell>{saleTypeLabel(item.sale_type) || '—'}</TableCell><TableCell>{item.percent == null ? 'Fija' : `${item.percent}%`}</TableCell><TableCell className="text-right">{formatCommissionCurrency(Number(item.base_amount), p.currency_code)}</TableCell><TableCell className="text-right font-medium">{formatCommissionCurrency(Number(item.commission_amount), p.currency_code)}</TableCell></TableRow>)}
    </TableBody></Table></div></CardContent></Card>
  </div>;
}

function Summary({ label, value }: { label: string; value: string }) { return <Card><CardContent className="pt-6"><div className="text-sm text-muted-foreground">{label}</div><div className="mt-1 text-xl font-semibold">{value}</div></CardContent></Card>; }
