import React from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { getRelationshipLabel, isRelationshipRequired } from '@/lib/beneficiaryValidation';

/**
 * Los campos de UNA persona del contrato, en un solo lugar.
 *
 * POR QUÉ EXISTE
 * Había tres formularios distintos para cargar a la misma persona
 * (`SaleAdherentsTab`, `SaleIncorporationsTab` y `beneficiaries/BeneficiaryForm`),
 * y ya divergieron una vez: uno exigía parentesco pero no teléfono y el otro al
 * revés — de ahí salió `src/lib/beneficiaryValidation.ts`. Al sumar el plan por
 * persona de los contratos de empresa, mantener tres copias garantizaba que
 * volviera a pasar.
 *
 * Este componente es CONTROLADO y sin estado propio: recibe `value` y emite
 * parches. Quien lo usa decide qué guardar y cuándo.
 */

export interface PersonaFieldsData {
  first_name: string;
  last_name: string;
  dni: string;
  /** Parentesco en una venta a persona física; Cargo en una de empresa. */
  relationship: string;
  birth_date: string;
  gender: string;
  phone: string;
  email: string;
  address: string;
  barrio: string;
  city: string;
  amount: number;
  /** "Fecha de Ingreso": columna del Anexo de Incorporación de Adherente. */
  entry_date: string;
  /** "V.I." Vacío = heredar la vigencia de la venta (se guarda como NULL). */
  vi: '' | 'si' | 'no';
  /** Plan de ESTA persona. Sólo se usa en contratos de empresa. */
  plan_id: string;
  /**
   * Sólo EMPLEADOS de una nómina: declara que esta persona tiene grupo
   * familiar. Es lo que habilita cargarle adherentes en la pestaña Nómina.
   */
  requires_adherents: boolean;
  /**
   * Sólo EMPLEADOS de una nómina: adicional Plan Materno de ESTA persona.
   * Los CAMPOS del Plan Materno siguen siendo del contrato —`template_responses`
   * es por venta, no por persona— así que basta con que un empleado lo tenga
   * para que aparezca la pestaña "Campos del Plan".
   */
  maternity_bonus: boolean;
}

export const emptyPersonaFields = (): PersonaFieldsData => ({
  first_name: '', last_name: '', dni: '', relationship: '', birth_date: '',
  gender: '', phone: '', email: '', address: '', barrio: '', city: '',
  amount: 0, entry_date: '', vi: '', plan_id: '',
  requires_adherents: false, maternity_bonus: false,
});

/** Campos que un formulario puede decidir no mostrar. */
export type PersonaFieldName =
  | 'dni' | 'relationship' | 'birth_date' | 'gender' | 'phone' | 'email'
  | 'address' | 'barrio' | 'city' | 'amount' | 'entry_date' | 'vi' | 'plan_id';

export interface PlanOption {
  id: string;
  name: string;
  price?: number | string | null;
}

interface BeneficiaryFieldsProps {
  value: PersonaFieldsData;
  onChange: (patch: Partial<PersonaFieldsData>) => void;
  /** `true` si el titular del contrato es una empresa. */
  isCompany?: boolean;
  /**
   * ¿CON QUIÉN se vincula esta persona? No es "qué rol tiene": es con quién.
   *
   *   'titular'  → directamente con el titular del contrato. Si el titular es
   *                una empresa, ese vínculo es el CARGO (texto libre, opcional);
   *                si es una persona física, es el PARENTESCO.
   *   'empleado' → con un empleado de la nómina. Siempre es PARENTESCO y
   *                siempre obligatorio, aunque el contrato sea de una empresa:
   *                el hijo de un funcionario no tiene un cargo.
   *
   * Se llama así y no `rol` a propósito. Antes decía `rol: 'empleado' | 'adherente'`
   * y `SaleAdherentsTab` —que carga adherentes comunes— tenía que pasar
   * `rol="empleado"` para conservar el rótulo correcto. Eso invitaba a
   * "corregirlo" a `'adherente'` y romper en silencio el caso empresa.
   */
  vinculoCon?: 'titular' | 'empleado';
  /** Si viene, se muestra el selector de plan por persona. */
  plans?: PlanOption[];
  /** Campos a ocultar en este formulario en particular. */
  hidden?: PersonaFieldName[];
  /**
   * `true` si esta persona es un EMPLEADO de la nómina de una empresa.
   *
   * Sólo entonces se muestran "¿Requiere adherentes?" e "Incluye Plan Materno":
   * son opciones del funcionario, no de su hijo ni de su cónyuge. Antes vivían
   * en la pestaña Básico, a nivel VENTA, donde no significaban nada en un
   * contrato corporativo (cada empleado contrata lo suyo).
   */
  esEmpleado?: boolean;
}

const formatAmountInput = (value: number) =>
  value ? value.toLocaleString('es-PY', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) : '';

const parseAmountInput = (value: string) => {
  const digitsOnly = value.replace(/\D/g, '');
  return digitsOnly ? Number(digitsOnly) : 0;
};

/**
 * Rótulo del vínculo. Un EMPLEADO se vincula con la empresa por su cargo; un
 * adherente de ese empleado se vincula con él por parentesco, aunque el
 * contrato sea de una empresa. Por eso no alcanza con `isCompany`.
 */
type VinculoCon = 'titular' | 'empleado';

const vinculoLabel = (isCompany: boolean, con: VinculoCon) =>
  con === 'titular' ? getRelationshipLabel({ isCompany }) : 'Parentesco';

/** Sólo el CARGO es texto libre. Un parentesco sale de la lista de siempre. */
const vinculoEsLibre = (isCompany: boolean, con: VinculoCon) =>
  isCompany && con === 'titular';

const vinculoEsObligatorio = (isCompany: boolean, con: VinculoCon) =>
  con === 'titular' ? isRelationshipRequired({ isCompany }) : true;

export const BeneficiaryFields: React.FC<BeneficiaryFieldsProps> = ({
  value,
  onChange,
  isCompany = false,
  vinculoCon = 'titular',
  plans,
  hidden = [],
  esEmpleado = false,
}) => {
  const oculto = (campo: PersonaFieldName) => hidden.includes(campo);
  const mostrarPlan = !!plans && !oculto('plan_id');

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
      <div className="space-y-2">
        <Label>Nombre *</Label>
        <Input
          value={value.first_name}
          onChange={(e) => onChange({ first_name: e.target.value })}
          placeholder="Nombre"
        />
      </div>

      <div className="space-y-2">
        <Label>Apellido *</Label>
        <Input
          value={value.last_name}
          onChange={(e) => onChange({ last_name: e.target.value })}
          placeholder="Apellido"
        />
      </div>

      {!oculto('dni') && (
        <div className="space-y-2">
          <Label>C.I.</Label>
          <Input
            value={value.dni}
            onChange={(e) => onChange({ dni: e.target.value })}
            placeholder="Nº Documento"
          />
        </div>
      )}

      {!oculto('relationship') && (
        <div className="space-y-2">
          <Label>
            {vinculoLabel(isCompany, vinculoCon)}
            {vinculoEsObligatorio(isCompany, vinculoCon) ? ' *' : ''}
          </Label>
          {/* El cargo en una empresa es texto libre: la lista de parentescos no
              aplica. Los adherentes de un empleado sí son familiares y la usan. */}
          {vinculoEsLibre(isCompany, vinculoCon) ? (
            <Input
              value={value.relationship}
              onChange={(e) => onChange({ relationship: e.target.value })}
              placeholder="Ej: Gerente de Operaciones"
            />
          ) : (
            <Select value={value.relationship} onValueChange={(v) => onChange({ relationship: v })}>
              <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="conyuge">Cónyuge</SelectItem>
                <SelectItem value="hijo">Hijo/a</SelectItem>
                <SelectItem value="padre">Padre/Madre</SelectItem>
                <SelectItem value="hermano">Hermano/a</SelectItem>
                <SelectItem value="otro">Otro</SelectItem>
              </SelectContent>
            </Select>
          )}
        </div>
      )}

      {mostrarPlan && (
        <div className="space-y-2">
          <Label>Plan *</Label>
          <Select value={value.plan_id} onValueChange={(v) => onChange({ plan_id: v })}>
            <SelectTrigger><SelectValue placeholder="Seleccionar plan" /></SelectTrigger>
            <SelectContent>
              {plans!.map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {!oculto('birth_date') && (
        <div className="space-y-2">
          <Label>Fecha de Nacimiento</Label>
          {/* El valor va y vuelve como "YYYY-MM-DD" sin pasar por Date: parsearlo
              con new Date() resta un día en Paraguay (UTC-4). */}
          <Input
            type="date"
            value={value.birth_date}
            onChange={(e) => onChange({ birth_date: e.target.value })}
          />
        </div>
      )}

      {!oculto('gender') && (
        <div className="space-y-2">
          <Label>Género</Label>
          <Select value={value.gender} onValueChange={(v) => onChange({ gender: v })}>
            <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="masculino">Masculino</SelectItem>
              <SelectItem value="femenino">Femenino</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      {!oculto('phone') && (
        <div className="space-y-2">
          <Label>Teléfono *</Label>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground whitespace-nowrap">+595</span>
            <Input
              value={value.phone}
              onChange={(e) => onChange({ phone: e.target.value.replace(/\D/g, '') })}
              placeholder="981123456"
            />
          </div>
        </div>
      )}

      {!oculto('email') && (
        <div className="space-y-2">
          <Label>Email</Label>
          <Input
            type="email"
            value={value.email}
            onChange={(e) => onChange({ email: e.target.value })}
            placeholder="email@ejemplo.com"
          />
        </div>
      )}

      {!oculto('amount') && (
        <div className="space-y-2">
          <Label>Monto (Gs.)</Label>
          <Input
            inputMode="numeric"
            value={formatAmountInput(value.amount)}
            onChange={(e) => onChange({ amount: parseAmountInput(e.target.value) })}
            placeholder="0"
          />
        </div>
      )}

      {!oculto('address') && (
        <div className="space-y-2">
          <Label>Domicilio</Label>
          <Input
            value={value.address}
            onChange={(e) => onChange({ address: e.target.value })}
            placeholder="Ej: Boquerón 123"
          />
        </div>
      )}

      {!oculto('barrio') && (
        <div className="space-y-2">
          <Label>Barrio</Label>
          <Input
            value={value.barrio}
            onChange={(e) => onChange({ barrio: e.target.value })}
            placeholder="Ej: Villa Morra"
          />
        </div>
      )}

      {!oculto('city') && (
        <div className="space-y-2">
          <Label>Ciudad</Label>
          <Input
            value={value.city}
            onChange={(e) => onChange({ city: e.target.value })}
            placeholder="Ciudad"
          />
        </div>
      )}

      {!oculto('entry_date') && (
        <div className="space-y-2">
          <Label>Fecha de Ingreso</Label>
          <Input
            type="date"
            value={value.entry_date}
            onChange={(e) => onChange({ entry_date: e.target.value })}
          />
        </div>
      )}

      {!oculto('vi') && (
        <div className="space-y-2">
          <Label>Vigencia Inmediata (V.I.)</Label>
          <Select
            value={value.vi || 'heredar'}
            onValueChange={(v) => onChange({ vi: v === 'heredar' ? '' : (v as 'si' | 'no') })}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="heredar">Según la venta</SelectItem>
              <SelectItem value="si">Sí</SelectItem>
              <SelectItem value="no">No</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      {esEmpleado && (
        <div className="col-span-2 lg:col-span-3 space-y-2">
          <label className="flex items-start gap-3 rounded-xl border border-input bg-background/80 p-3.5 cursor-pointer">
            <Checkbox
              checked={value.requires_adherents}
              onCheckedChange={(v) => onChange({ requires_adherents: v === true })}
              className="mt-0.5"
            />
            <span className="space-y-1">
              <span className="block text-sm font-medium leading-none">
                ¿Requiere adherentes/grupo familiar?
              </span>
              <span className="block text-xs text-muted-foreground">
                Habilita cargarle adherentes a este empleado en la nómina.
              </span>
            </span>
          </label>

          <label className="flex items-start gap-3 rounded-xl border border-input bg-background/80 p-3.5 cursor-pointer">
            <Checkbox
              checked={value.maternity_bonus}
              onCheckedChange={(v) => onChange({ maternity_bonus: v === true })}
              className="mt-0.5"
            />
            <span className="space-y-1">
              <span className="block text-sm font-medium leading-none">Incluye Plan Materno</span>
              <span className="block text-xs text-muted-foreground">
                Se contrata junto al plan de este empleado. Con al menos uno marcado se
                habilita la pestaña “Campos del Plan”, que se completa una sola vez para
                todo el contrato.
              </span>
            </span>
          </label>
        </div>
      )}
    </div>
  );
};

export default BeneficiaryFields;
