import { useEffect, useState } from 'react';
import { Save, Settings2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useSaveCommissionSettings } from '@/hooks/useCommissions';
import type { CommissionSettings } from '@/types/commissions';

export function CommissionSettingsPanel({ settings }: { settings: CommissionSettings | null | undefined }) {
  const save = useSaveCommissionSettings();
  const [accrualEvent, setAccrualEvent] = useState<CommissionSettings['accrual_event']>(settings?.accrual_event ?? 'venta_completada');
  const [prefix, setPrefix] = useState(settings?.liquidation_prefix ?? 'LIQ-');
  const [enabled, setEnabled] = useState(settings?.is_enabled ?? false);
  useEffect(() => { setAccrualEvent(settings?.accrual_event ?? 'venta_completada'); setPrefix(settings?.liquidation_prefix ?? 'LIQ-'); setEnabled(settings?.is_enabled ?? false); }, [settings]);
  return <Card><CardHeader><CardTitle className="flex items-center gap-2"><Settings2 className="h-5 w-5" /> Configuración de comisiones</CardTitle><CardDescription>Activá el módulo solo después de cargar vendedores y reglas.</CardDescription></CardHeader><CardContent className="space-y-5"><div className="space-y-2"><Label htmlFor="commission-accrual">Evento de devengo</Label><select id="commission-accrual" className="flex h-11 w-full rounded-xl border border-input bg-background px-3 text-sm" value={accrualEvent} onChange={(event) => setAccrualEvent(event.target.value as CommissionSettings['accrual_event'])}><option value="venta_completada">Venta completada</option><option value="firma_completa">Firma completa</option></select></div><div className="space-y-2"><Label htmlFor="commission-prefix">Prefijo de liquidación</Label><Input id="commission-prefix" value={prefix} onChange={(event) => setPrefix(event.target.value)} maxLength={20} /></div><div className="flex items-center justify-between rounded-lg border p-4"><div><Label htmlFor="commission-enabled">Habilitar comisiones</Label><p className="text-sm text-muted-foreground">El cálculo y pago se bloquean si está desactivado.</p></div><Switch id="commission-enabled" checked={enabled} onCheckedChange={setEnabled} /></div><Button onClick={() => save.mutate({ accrual_event: accrualEvent, liquidation_prefix: prefix, is_enabled: enabled })} disabled={save.isPending}><Save className="mr-2 h-4 w-4" /> Guardar configuración</Button></CardContent></Card>;
}
