import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SlidersHorizontal, X } from 'lucide-react';
import { SALE_TYPE_OPTIONS } from '@/lib/saleTypes';
import type { SalesListFilters } from '@/hooks/useSales';

/**
 * Radix no admite `value=""` en un `<SelectItem>`, así que "sin filtro" se
 * representa con este centinela y se traduce a `undefined` al salir.
 * Mismo patrón que `AnalyticsFilterBar`.
 */
const ALL = '_all';

const AUDIT_STATUS_OPTIONS = [
  { value: 'pendiente', label: 'Pendiente' },
  { value: 'aprobado', label: 'Aprobado' },
  { value: 'aprobado_para_templates', label: 'Aprobado para plantillas' },
  { value: 'rechazado', label: 'Rechazado' },
  { value: 'requiere_info', label: 'Requiere info' },
];

interface SalesFiltersPanelProps {
  value: SalesListFilters;
  onChange: (next: SalesListFilters) => void;
  plans: Array<{ id: string; name: string }>;
  salespersons: Array<{ id: string; name: string }>;
  /** Un vendedor sólo ve sus ventas: filtrar por vendedor no le aporta nada. */
  showSalesperson?: boolean;
}

export const countActiveSalesFilters = (filters: SalesListFilters): number =>
  Object.values(filters).filter((v) => !!v).length;

export const SalesFiltersPanel = ({
  value,
  onChange,
  plans,
  salespersons,
  showSalesperson = true,
}: SalesFiltersPanelProps) => {
  const activeCount = countActiveSalesFilters(value);

  const setField = (key: keyof SalesListFilters, next?: string) => {
    onChange({ ...value, [key]: next || undefined });
  };

  const renderSelect = (
    key: keyof SalesListFilters,
    label: string,
    placeholder: string,
    options: Array<{ value: string; label: string }>,
  ) => (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Select
        value={value[key] || ALL}
        onValueChange={(v) => setField(key, v === ALL ? undefined : v)}
      >
        <SelectTrigger className="h-9">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>{placeholder}</SelectItem>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" className="gap-2">
          <SlidersHorizontal className="h-4 w-4" />
          Filtros
          {activeCount > 0 && (
            <Badge variant="secondary" className="ml-1 h-5 min-w-5 justify-center px-1.5">
              {activeCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 max-h-[70vh] overflow-y-auto">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">Filtrar contratos</p>
            {activeCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => onChange({})}
              >
                <X className="mr-1 h-3 w-3" />
                Limpiar
              </Button>
            )}
          </div>

          <Separator />

          {renderSelect('clientType', 'Tipo de persona', 'Todos', [
            { value: 'persona', label: 'Persona física' },
            { value: 'empresa', label: 'Empresa' },
          ])}

          {renderSelect(
            'saleType',
            'Tipo de venta',
            'Todos',
            SALE_TYPE_OPTIONS.map((o) => ({ value: o.value, label: o.label })),
          )}

          {renderSelect('auditStatus', 'Estado de auditoría', 'Todos', AUDIT_STATUS_OPTIONS)}

          {showSalesperson &&
            renderSelect(
              'salespersonId',
              'Vendedor',
              'Todos',
              salespersons.map((s) => ({ value: s.id, label: s.name })),
            )}

          {renderSelect(
            'planId',
            'Plan',
            'Todos',
            plans.map((p) => ({ value: p.id, label: p.name })),
          )}

          <Separator />

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Desde</Label>
              <Input
                type="date"
                className="h-9"
                value={value.dateFrom || ''}
                max={value.dateTo || undefined}
                onChange={(e) => setField('dateFrom', e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Hasta</Label>
              <Input
                type="date"
                className="h-9"
                value={value.dateTo || ''}
                min={value.dateFrom || undefined}
                onChange={(e) => setField('dateTo', e.target.value)}
              />
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
};
