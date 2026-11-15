import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useCommissionCatalog, useCommissionSalespeople, useSaveCommissionSalesperson } from '@/hooks/useCommissions';
import { commissionPersonName } from '@/types/commissions';
import type { CommissionBase } from '@/types/commissions';

const BASE_LABEL: Record<CommissionBase, string> = {
  plan_price: 'Precio del plan',
  sale_total_amount: 'Monto de la venta',
  per_adherent: 'Por adherente',
  net_of_fee_and_tax: 'Neto de gasto adm. e IVA',
};

export function CommissionSalespeoplePanel() {
  const catalog = useCommissionCatalog();
  const configs = useCommissionSalespeople();
  const save = useSaveCommissionSalesperson();
  const [salespersonId, setSalespersonId] = useState('');
  const [defaultPercent, setDefaultPercent] = useState('');
  const [defaultBase, setDefaultBase] = useState<CommissionBase>('sale_total_amount');
  if (catalog.isLoading || configs.isLoading) return <div className="py-8 text-center text-muted-foreground">Cargando vendedores...</div>;
  if (catalog.isError || configs.isError) return <div className="py-8 text-center text-destructive">No se pudo cargar la configuración de vendedores.</div>;

  const percentOf = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  };

  return <Card><CardHeader><CardTitle>Vendedores que comisionan</CardTitle><CardDescription>Habilitá los vendedores que deben liquidarse. El porcentaje por defecto se aplica solo a las ventas que ninguna regla cubre; si una regla aplica, manda la regla.</CardDescription></CardHeader><CardContent className="space-y-5">
    <div className="grid gap-4 md:grid-cols-[1fr_auto_1fr_auto] md:items-end">
      <div className="space-y-2"><Label>Vendedor</Label><Select value={salespersonId} onValueChange={setSalespersonId}><SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger><SelectContent>{catalog.data?.profiles.map((p) => <SelectItem key={p.id} value={p.id}>{commissionPersonName(p)}</SelectItem>)}</SelectContent></Select></div>
      <div className="space-y-2"><Label>% por defecto</Label><Input type="number" min="0" max="100" step="0.01" className="md:w-32" placeholder="Sin definir" value={defaultPercent} onChange={(e) => setDefaultPercent(e.target.value)} /></div>
      <div className="space-y-2"><Label>Base del % por defecto</Label><Select value={defaultBase} onValueChange={(v) => setDefaultBase(v as CommissionBase)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="sale_total_amount">Monto de la venta</SelectItem><SelectItem value="plan_price">Precio del plan</SelectItem></SelectContent></Select></div>
      <Button disabled={!salespersonId || save.isPending} onClick={() => save.mutate({ salesperson_id: salespersonId, is_active: true, default_percent: percentOf(defaultPercent), default_base: defaultBase })}>Habilitar vendedor</Button>
    </div>
    <p className="text-xs text-muted-foreground">Dejá el porcentaje vacío para que las ventas sin regla sigan bloqueando la liquidación en lugar de comisionar por defecto.</p>
    <Table><TableHeader><TableRow><TableHead>Vendedor</TableHead><TableHead>% por defecto</TableHead><TableHead>Base</TableHead><TableHead>Activo</TableHead></TableRow></TableHeader><TableBody>{(configs.data || []).map((row) => <TableRow key={row.salesperson_id}>
      <TableCell>{row.display_name}<div className="text-xs text-muted-foreground">{row.email || '—'}</div></TableCell>
      <TableCell><Input type="number" min="0" max="100" step="0.01" className="w-28" placeholder="Sin definir" defaultValue={row.default_percent ?? ''} onBlur={(e) => {
        const next = percentOf(e.target.value);
        if (next !== (row.default_percent ?? null)) save.mutate({ salesperson_id: row.salesperson_id, is_active: row.is_active, default_percent: next, default_base: row.default_base });
      }} /></TableCell>
      <TableCell><Select value={row.default_base} onValueChange={(v) => save.mutate({ salesperson_id: row.salesperson_id, is_active: row.is_active, default_percent: row.default_percent, default_base: v as CommissionBase })}><SelectTrigger className="w-48"><SelectValue>{BASE_LABEL[row.default_base]}</SelectValue></SelectTrigger><SelectContent><SelectItem value="sale_total_amount">Monto de la venta</SelectItem><SelectItem value="plan_price">Precio del plan</SelectItem></SelectContent></Select></TableCell>
      <TableCell><Switch checked={row.is_active} disabled={save.isPending} onCheckedChange={(is_active) => save.mutate({ salesperson_id: row.salesperson_id, is_active, default_percent: row.default_percent, default_base: row.default_base })} /></TableCell>
    </TableRow>)}</TableBody></Table>
  </CardContent></Card>;
}
