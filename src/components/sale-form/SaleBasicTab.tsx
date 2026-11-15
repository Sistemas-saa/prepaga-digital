
import React, { useEffect, useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import { useClients } from '@/hooks/useClients';
import { usePlans } from '@/hooks/usePlans';
import { ClientForm } from '@/components/ClientForm';
import { useCurrencySettings } from '@/hooks/useCurrencySettings';
import { getClientDisplayName, getClientDocument, getClientDocumentLabel, isCompanyClient } from '@/lib/clientUtils';
import { MANUAL_SALE_TYPE_OPTIONS, isOperationSaleType, saleTypeLabel } from '@/lib/saleTypes';
import { addMonthsToDateOnly } from '@/lib/vigencia';
interface SaleBasicTabProps {
  formData: {
    client_id: string;
    plan_id: string;
    company_id: string;
    titular_amount: number;
    notes: string;
    requires_adherents: boolean;
    signer_type: string;
    signer_name: string;
    signer_dni: string;
    signer_relationship: string;
    signer_email: string;
    signer_phone: string;
    billing_razon_social: string;
    billing_ruc: string;
    billing_email: string;
    billing_phone: string;
    contract_start_date: string;
    contract_end_date: string;
    immediate_coverage: boolean;
    sale_type: string;
    /** Adicional Plan Materno. Habilita la pestaña "Campos del Plan". */
    maternity_bonus?: boolean;
    /** 'individual' (por defecto) o 'representante'. Contratos de empresa. */
    employee_signature_mode?: string;
  };
  onChange: (field: string, value: any) => void;
  companyId?: string;
  errors?: Record<string, string>;
  /**
   * Tipo de contratante elegido en el selector de arriba.
   *
   * No es una columna de `sales`: la fuente de verdad sigue siendo
   * `clients.client_type`. Vive como estado del formulario porque hace falta
   * ANTES de elegir el cliente, para filtrar la lista y para saber qué campos
   * pedir. Al abrir una venta existente se deriva del cliente que ya tiene.
   */
  contractorType: 'persona' | 'empresa';
  onContractorTypeChange: (value: 'persona' | 'empresa') => void;
}

const SaleBasicTab: React.FC<SaleBasicTabProps> = ({
  formData, onChange, companyId, errors, contractorType, onContractorTypeChange,
}) => {
  const { data: clients } = useClients();
  const { data: plans } = usePlans();
  const { settings } = useCurrencySettings();
  const [searchClient, setSearchClient] = useState('');
  const [searchPlan, setSearchPlan] = useState('');
  const [showClientModal, setShowClientModal] = useState(false);
  const [prevClientCount, setPrevClientCount] = useState<number | null>(null);

  const thousandSeparator = settings?.thousand_separator || '.';
  const decimalSeparator = settings?.decimal_separator || ',';
  const decimalPlaces = settings?.decimal_places ?? 0;

  const clienteElegido = clients?.find((c: any) => c.id === formData.client_id);

  // El fin de vigencia se sugiere a 12 meses del inicio, pero SÓLO cuando está
  // vacío: una vez que alguien escribió una fecha, mueva o no el inicio, la que
  // manda es la suya. Se autocompleta acá y no en la base a propósito — así la
  // persona la ve y la puede corregir antes de guardar, en vez de descubrirla
  // recién cuando le llega el aviso de vencimiento.
  const handleContractStartDateChange = (value: string) => {
    onChange('contract_start_date', value);
    if (value && !formData.contract_end_date) {
      const sugerida = addMonthsToDateOnly(value, 12);
      if (sugerida) onChange('contract_end_date', sugerida);
    }
  };

  // El selector manda mientras no haya cliente elegido; una vez elegido, manda
  // el cliente (es la fuente de verdad y puede no coincidir con el selector si
  // alguien lo cambió a mano).
  const titularEsEmpresa = clienteElegido
    ? isCompanyClient(clienteElegido)
    : contractorType === 'empresa';

  // Sólo se ofrecen clientes del tipo elegido: mezclarlos era la principal
  // forma de terminar con una venta de empresa apuntando a una persona.
  const clientesDelTipo = useMemo(
    () => (clients || []).filter((c: any) =>
      isCompanyClient(c) === (contractorType === 'empresa'),
    ),
    [clients, contractorType],
  );

  // Auto-set company from logged-in user (always)
  useEffect(() => {
    if (companyId) {
      onChange('company_id', companyId);
    }
  }, [companyId]);

  // Si el titular no es una empresa, el modo de firma vuelve a 'individual':
  // el campo ni siquiera se muestra, y sin esto una venta que empezó apuntando
  // a una empresa y después cambió de titular se guardaba con 'representante',
  // que aguas abajo suprime las DDJJ y los enlaces de firma de cada adherente.
  useEffect(() => {
    if (!titularEsEmpresa && formData.employee_signature_mode !== 'individual') {
      onChange('employee_signature_mode', 'individual');
    }
  }, [titularEsEmpresa, formData.employee_signature_mode]);

  // Cambiar el tipo de contratante deja sin efecto al cliente ya elegido si es
  // del otro tipo. Sin esto quedaba una venta marcada como Empresa apuntando a
  // una persona física: el selector filtraba pero el `client_id` viejo seguía
  // guardado, y el resto del formulario decidía por el cliente, no por el
  // selector. Se exige que la lista ya haya cargado para no borrar la selección
  // mientras el query está en vuelo.
  useEffect(() => {
    if (!formData.client_id || !clients?.length) return;
    const actual = clients.find((c: any) => c.id === formData.client_id);
    if (actual && isCompanyClient(actual) !== (contractorType === 'empresa')) {
      onChange('client_id', '');
    }
  }, [contractorType, clients, formData.client_id]);

  // Auto-select newly created client when modal closes
  useEffect(() => {
    if (prevClientCount !== null && clients && clients.length > prevClientCount) {
      const newestClient = clients[0];
      if (newestClient) {
        onChange('client_id', newestClient.id);
      }
      setPrevClientCount(null);
    }
  }, [clients, prevClientCount, onChange]);

  const filteredClients = useMemo(() => (
    clientesDelTipo.filter(client =>
      getClientDisplayName(client).toLowerCase().includes(searchClient.toLowerCase()) ||
      getClientDocument(client).toLowerCase().includes(searchClient.toLowerCase()) ||
      client.email?.toLowerCase().includes(searchClient.toLowerCase())
    )
  ), [clientesDelTipo, searchClient]);

  const filteredPlans = useMemo(() => (
    plans?.filter(plan =>
      plan.name.toLowerCase().includes(searchPlan.toLowerCase())
    ) || []
  ), [plans, searchPlan]);

  const formatAmountInput = (value: number) => {
    if (!Number.isFinite(value) || value === 0) return '';

    const fixed = value.toFixed(decimalPlaces);
    const [integerPart, decimalPart] = fixed.split('.');
    const integerWithSeparators = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, thousandSeparator);

    if (decimalPlaces > 0 && decimalPart) {
      return `${integerWithSeparators}${decimalSeparator}${decimalPart}`;
    }

    return integerWithSeparators;
  };

  const parseAmountInput = (rawValue: string) => {
    if (!rawValue.trim()) return 0;

    const normalized = rawValue
      .split(thousandSeparator).join('')
      .replace(decimalSeparator, '.')
      .replace(/[^\d.-]/g, '');

    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
  };

  return (
    <div className="space-y-6">
      {/* Tipo de contratante.
          No es una columna de `sales`: la fuente de verdad es
          `clients.client_type`. Está acá arriba porque decide qué clientes se
          ofrecen y qué campos pide el resto del formulario, y eso hay que
          saberlo ANTES de elegir el cliente. */}
      <div className="space-y-2">
        <Label>Tipo de contratante *</Label>
        <Select
          value={contractorType}
          onValueChange={(v) => onContractorTypeChange(v as 'persona' | 'empresa')}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="persona">Persona física</SelectItem>
            <SelectItem value="empresa">Empresa</SelectItem>
          </SelectContent>
        </Select>
        {contractorType === 'empresa' && (
          <p className="text-xs text-muted-foreground">
            El contrato lo firma la empresa. Los empleados, con su plan y sus adherentes,
            se cargan en la pestaña <strong>Nómina</strong>.
          </p>
        )}
      </div>

      {/* Client Selection */}
      <div className="space-y-2">
        <Label>Cliente *</Label>
        <div className="flex gap-2">
          <div className="flex-1">
            <Select value={formData.client_id} onValueChange={(v) => onChange('client_id', v)}>
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar cliente" />
              </SelectTrigger>
              <SelectContent>
                <div className="p-2">
                  <Input
                    placeholder="Buscar cliente..."
                    value={searchClient}
                    onChange={(e) => setSearchClient(e.target.value)}
                    className="mb-2"
                  />
                </div>
                {filteredClients.map((client) => (
                  <SelectItem key={client.id} value={client.id}>
                    {getClientDisplayName(client)} {getClientDocument(client) ? `- ${getClientDocumentLabel(client)}: ${getClientDocument(client)}` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setPrevClientCount(clients?.length ?? 0);
              setShowClientModal(true);
            }}
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Plan, grupo familiar y adicionales.
          En un contrato de EMPRESA nada de esto es del contrato: cada empleado
          contrata SU plan, declara SU grupo familiar y decide SU Plan Materno,
          y todo eso se carga en la pestaña Nómina. Pedirlo acá obligaba a
          elegir un plan que después no se facturaba y dejaba dos tildes a nivel
          venta que no significaban nada.

          `sales.plan_id` no queda huérfano: SaleTabbedForm lo deriva del primer
          empleado activo de la nómina, porque lo leen la condición `has_plan`
          del workflow, la herencia de plan de la venta-operación de un anexo y
          la resolución de reglas de comisiones. */}
      {titularEsEmpresa ? (
        <div className="space-y-2">
          <Label>Plan y adicionales</Label>
          <p className="text-sm text-muted-foreground">
            Cada empleado elige su plan, su grupo familiar y su Plan Materno en la
            pestaña <strong>Nómina</strong>.
          </p>
        </div>
      ) : (
        <>
          {/* Plan Selection */}
          <div className="space-y-2">
            <Label>Plan *</Label>
            <Select value={formData.plan_id} onValueChange={(v) => onChange('plan_id', v)}>
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar plan" />
              </SelectTrigger>
              <SelectContent>
                <div className="p-2">
                  <Input
                    placeholder="Buscar plan..."
                    value={searchPlan}
                    onChange={(e) => setSearchPlan(e.target.value)}
                    className="mb-2"
                  />
                </div>
                {filteredPlans.map((plan) => (
                  <SelectItem key={plan.id} value={plan.id}>
                    {plan.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Requires Adherents */}
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="requires_adherents"
              checked={formData.requires_adherents}
              onChange={(e) => onChange('requires_adherents', e.target.checked)}
              className="h-4 w-4"
            />
            <Label htmlFor="requires_adherents">¿Requiere adherentes/grupo familiar?</Label>
          </div>

          {/* Adicional Plan Materno.
              Va acá, al inicio de la venta, porque el Plan Materno NO es un plan
              por si mismo: se contrata SOBRE otro plan. Al tildarlo se habilita la
              pestaña "Campos del Plan" con las preguntas del template homonimo,
              sea cual sea el plan elegido. */}
          <div className="space-y-2">
            <Label>Adicionales</Label>
            <label className="flex items-start gap-3 rounded-xl border border-input bg-background/80 p-3.5 cursor-pointer">
              <Checkbox
                checked={!!formData.maternity_bonus}
                onCheckedChange={(v) => onChange('maternity_bonus', v === true)}
                className="mt-0.5"
              />
              <span className="space-y-1">
                <span className="block text-sm font-medium leading-none">Incluye Plan Materno</span>
                <span className="block text-xs text-muted-foreground">
                  Se contrata junto al plan elegido. Al marcarlo se habilita la pestaña
                  “Campos del Plan” para completar los datos que exige el Plan Materno.
                </span>
              </span>
            </label>
          </div>
        </>
      )}

      {/* Vigencia Inmediata & Tipo de Venta */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Vigencia Inmediata (V.I.)</Label>
          <Select value={formData.immediate_coverage ? 'si' : 'no'} onValueChange={(v) => onChange('immediate_coverage', v === 'si')}>
            <SelectTrigger>
              <SelectValue placeholder="Seleccionar" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="si">Sí</SelectItem>
              <SelectItem value="no">No</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Tipo de Venta</Label>
          {/* En una venta-OPERACIÓN el tipo ('alta_adherente', 'cambio_plan') no
              está entre las opciones elegibles, así que el <Select> se mostraba
              VACÍO: parecía un dato sin cargar. Se muestra el tipo real, en
              sólo lectura, porque lo pone el sistema y no se puede cambiar. */}
          {isOperationSaleType(formData.sale_type) ? (
            <Input value={saleTypeLabel(formData.sale_type)} readOnly disabled />
          ) : (
            <Select value={formData.sale_type || 'venta_nueva'} onValueChange={(v) => onChange('sale_type', v)}>
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar tipo" />
              </SelectTrigger>
              {/* Solo los tipos que elige el vendedor. Los tipos de OPERACION
                  los pone el sistema al crear la venta-operacion y no deben
                  poder elegirse a mano. */}
              <SelectContent>
                {MANUAL_SALE_TYPE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
        {/* Sólo tiene sentido en contratos de empresa: es la opción de que firme
            el representante legal en vez de cada empleado. En una venta a
            persona física aparecía igual y no significaba nada. */}
        {titularEsEmpresa && (
          <div className="space-y-2">
            <Label>Firma de los adherentes</Label>
            <Select
              value={formData.employee_signature_mode || 'individual'}
              onValueChange={(v) => onChange('employee_signature_mode', v)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="individual">Cada uno firma su DDJJ</SelectItem>
                <SelectItem value="representante">Firma solo el representante</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Para contratos de empresa con muchos empleados. "Firma solo el representante"
              no genera DDJJ ni enlace de firma por cada persona.
            </p>
          </div>
        )}
      </div>

      {/* Total Amount.
          En un contrato de empresa no hay "monto del titular": la empresa no es
          beneficiaria de sí misma. El total sale de la suma de la nómina y lo
          calcula la base (trigger trg_recalculate_sale_total sobre
          beneficiaries). Mostrar el campo pidiendo un monto > 0 obligaba a
          inventar un número que después quedaba sumado de más. */}
      {titularEsEmpresa ? (
        <div className="space-y-2">
          <Label>Cuota mensual del contrato</Label>
          <p className="text-sm text-muted-foreground">
            Se calcula sola: es la suma de los empleados y sus adherentes activos,
            que se cargan en la pestaña <strong>Nómina</strong>.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          <Label htmlFor="titular_amount">Monto Titular / Plan (Gs.) *</Label>
          <Input
            id="titular_amount"
            inputMode="decimal"
            value={formatAmountInput(Number(formData.titular_amount) || 0)}
            onChange={(e) => onChange('titular_amount', parseAmountInput(e.target.value))}
            placeholder="0"
            aria-invalid={(Number(formData.titular_amount) || 0) <= 0 || !!errors?.basico}
            className={
              (Number(formData.titular_amount) || 0) <= 0
                ? 'border-red-500 focus-visible:ring-red-500'
                : ''
            }
          />
          {(Number(formData.titular_amount) || 0) <= 0 && (
            <p className="text-sm text-red-500">El monto debe ser mayor a 0</p>
          )}
        </div>
      )}

      {/* Signer Selection */}
      <div className="space-y-4 border border-border/70 rounded-xl p-4 sm:p-5 bg-muted/20">
        <Label className="text-base font-semibold">¿Quién firmará el contrato?</Label>
        <Select value={formData.signer_type || 'titular'} onValueChange={(v) => onChange('signer_type', v)}>
          <SelectTrigger>
            <SelectValue placeholder="Seleccionar firmante" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="titular">Titular (cliente)</SelectItem>
            <SelectItem value="responsable_pago">Responsable de Pago</SelectItem>
          </SelectContent>
        </Select>

        {formData.signer_type === 'responsable_pago' && (
          <div className="space-y-3 pl-3 border-l-2 border-primary/30">
            <div className="space-y-1">
              <Label>Nombre completo del responsable de pago *</Label>
              <Input
                value={formData.signer_name || ''}
                onChange={(e) => onChange('signer_name', e.target.value)}
                placeholder="Nombre y Apellido"
              />
            </div>
            <div className="space-y-1">
              <Label>C.I. del responsable de pago *</Label>
              <Input
                value={formData.signer_dni || ''}
                onChange={(e) => onChange('signer_dni', e.target.value)}
                placeholder="Número de Cédula"
              />
            </div>
            <div className="space-y-1">
              <Label>Relación con el titular</Label>
              <Input
                value={formData.signer_relationship || ''}
                onChange={(e) => onChange('signer_relationship', e.target.value)}
                placeholder="Ej: Padre, Madre, Tutor legal"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Correo electrónico *</Label>
                <Input
                  type="email"
                  value={formData.signer_email || ''}
                  onChange={(e) => onChange('signer_email', e.target.value)}
                  placeholder="correo@ejemplo.com"
                />
                <p className="text-xs text-muted-foreground">Recibirá el enlace de firma por este email.</p>
              </div>
              <div className="space-y-1">
                <Label>Teléfono / WhatsApp</Label>
                <Input
                  type="tel"
                  value={formData.signer_phone || ''}
                  onChange={(e) => onChange('signer_phone', e.target.value)}
                  placeholder="Ej: 0981000000"
                />
                <p className="text-xs text-muted-foreground">Recibirá el código OTP por WhatsApp.</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Datos de Facturación */}
      <div className="space-y-4 border border-border/70 rounded-xl p-4 sm:p-5 bg-muted/20">
        <Label className="text-base font-semibold">Datos de Facturación</Label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1">
            <Label>Razón Social</Label>
            <Input
              value={formData.billing_razon_social || ''}
              onChange={(e) => onChange('billing_razon_social', e.target.value)}
              placeholder="Razón Social"
            />
          </div>
          <div className="space-y-1">
            <Label>R.U.C.</Label>
            <Input
              value={formData.billing_ruc || ''}
              onChange={(e) => onChange('billing_ruc', e.target.value)}
              placeholder="Número de RUC"
            />
          </div>
          <div className="space-y-1">
            <Label>Correo electrónico</Label>
            <Input
              type="email"
              value={formData.billing_email || ''}
              onChange={(e) => onChange('billing_email', e.target.value)}
              placeholder="email@ejemplo.com"
            />
          </div>
          <div className="space-y-1">
            <Label>Celular</Label>
            <Input
              value={formData.billing_phone || ''}
              onChange={(e) => onChange('billing_phone', e.target.value)}
              placeholder="Número de celular"
            />
          </div>
          <div className="space-y-1">
            <Label>Fecha de inicio de contrato</Label>
            <Input
              type="date"
              value={formData.contract_start_date || ''}
              onChange={(e) => handleContractStartDateChange(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label>Fecha de fin de vigencia</Label>
            <Input
              type="date"
              value={formData.contract_end_date || ''}
              onChange={(e) => onChange('contract_end_date', e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Se autocompleta con 12 meses desde el inicio. Es la fecha que avisa
              el vencimiento al vendedor.
            </p>
          </div>
        </div>
      </div>

      {/* Notes */}
      <div className="space-y-2">
        <Label>Notas</Label>
        <Textarea
          value={formData.notes}
          onChange={(e) => onChange('notes', e.target.value)}
          placeholder="Notas adicionales sobre la venta..."
          rows={3}
        />
      </div>

      <ClientForm
        open={showClientModal}
        onOpenChange={setShowClientModal}
        defaultClientType={contractorType}
      />
    </div>
  );
};

export default SaleBasicTab;
