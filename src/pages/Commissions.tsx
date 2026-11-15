import { AlertCircle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CommissionPeriodList } from '@/components/commissions/CommissionPeriodList';
import { CommissionPreview } from '@/components/commissions/CommissionPreview';
import { CommissionRulesPanel } from '@/components/commissions/CommissionRulesPanel';
import { CommissionSalespeoplePanel } from '@/components/commissions/CommissionSalespeoplePanel';
import { CommissionSettingsPanel } from '@/components/commissions/CommissionSettingsPanel';
import { useCommissionSettings } from '@/hooks/useCommissions';
import { useSimpleAuthContext } from '@/components/SimpleAuthProvider';

const managementRoles = new Set(['super_admin', 'admin', 'financiero']);
const configurationRoles = new Set(['super_admin', 'admin']);
const ruleReaderRoles = new Set([...managementRoles, 'supervisor', 'auditor']);

export default function Commissions() {
  const { userRole } = useSimpleAuthContext();
  const settings = useCommissionSettings();
  const canManage = managementRoles.has(userRole || '');
  const canConfigure = configurationRoles.has(userRole || '');
  const canReadRules = ruleReaderRoles.has(userRole || '');
  if (settings.isLoading) return <div className="flex min-h-[300px] items-center justify-center text-muted-foreground">Cargando comisiones...</div>;
  if (settings.isError || !settings.data?.is_enabled) return <div className="mx-auto max-w-3xl space-y-6 py-10"><Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertTitle>Módulo no habilitado</AlertTitle><AlertDescription>La configuración de comisiones no existe, no está activa o no pudo validarse. Por seguridad, el cálculo y los pagos permanecen cerrados.</AlertDescription></Alert>{canConfigure && !settings.isError && <CommissionSettingsPanel settings={settings.data} />}</div>;
  return <div className="space-y-6"><div><h1 className="text-3xl font-bold tracking-tight">Comisiones</h1><p className="text-muted-foreground">Configuración, cálculo y liquidación de comisiones comerciales.</p></div>
    <Tabs defaultValue="periods"><TabsList><TabsTrigger value="periods">Liquidaciones</TabsTrigger>{canManage && <TabsTrigger value="preview">Nueva liquidación</TabsTrigger>}{canReadRules && <TabsTrigger value="rules">Reglas</TabsTrigger>}{canConfigure && <TabsTrigger value="settings">Configuración</TabsTrigger>}</TabsList>
      <TabsContent value="periods" className="mt-5"><CommissionPeriodList /></TabsContent>
      {canManage && <TabsContent value="preview" className="mt-5"><CommissionPreview /></TabsContent>}
      {canReadRules && <TabsContent value="rules" className="mt-5 space-y-5">{canManage && <CommissionSalespeoplePanel />}<CommissionRulesPanel canManage={canManage} /></TabsContent>}
      {canConfigure && <TabsContent value="settings" className="mt-5"><CommissionSettingsPanel settings={settings.data} /></TabsContent>}
    </Tabs>
  </div>;
}
