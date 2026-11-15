/**
 * Reglas de validación de una persona del contrato, compartidas por TODOS los
 * formularios que la cargan:
 *
 *   - src/components/beneficiaries/BeneficiaryForm.tsx  (detalle de la venta)
 *   - src/components/sale-form/SaleAdherentsTab.tsx     (alta de la venta)
 *   - src/components/sale-form/SaleEmployeesTab.tsx     (nómina de una empresa)
 *   - src/components/sale-form/SaleIncorporationsTab.tsx (movimientos de nómina)
 *
 * Hasta ahora cada uno validaba distinto: el primero exigía parentesco pero no
 * teléfono, el segundo exigía teléfono pero no parentesco. El mismo adherente
 * pasaba o no según la pantalla por la que se lo cargara.
 */

export type BeneficiaryValidationContext = {
  /** `true` si el titular del contrato es una empresa. */
  isCompany?: boolean;
};

export type BeneficiaryValidationInput = {
  first_name?: string | null;
  last_name?: string | null;
  relationship?: string | null;
  phone?: string | null;
  signature_required?: boolean | null;
};

/**
 * Cómo se llama el vínculo del adherente con el titular.
 *
 * En un contrato de empresa los adherentes son funcionarios, no familiares:
 * "Parentesco" no significa nada ahí. Se rotula "Cargo" y deja de ser
 * obligatorio, porque el cargo no siempre se conoce al cargar la nómina.
 */
export const getRelationshipLabel = (ctx?: BeneficiaryValidationContext): string =>
  ctx?.isCompany ? 'Cargo' : 'Parentesco';

export const isRelationshipRequired = (ctx?: BeneficiaryValidationContext): boolean =>
  !ctx?.isCompany;

/**
 * ¿Hace falta el teléfono?
 *
 * Sólo si el adherente tiene que firmar: el OTP de la firma se manda por
 * WhatsApp, así que sin teléfono el flujo se traba. Un adherente que no firma
 * (un hijo menor, por ejemplo) puede no tener teléfono propio, y exigírselo
 * bloqueaba una carga legítima.
 *
 * `signature_required` sin definir se toma como `true`, que es el default de la
 * columna en la base.
 */
export const isPhoneRequired = (input: BeneficiaryValidationInput): boolean =>
  input.signature_required !== false;

/**
 * Devuelve el primer error encontrado, o `null` si el adherente es válido.
 * El texto es el que se le muestra al usuario.
 */
export const validateBeneficiary = (
  input: BeneficiaryValidationInput,
  ctx?: BeneficiaryValidationContext,
): string | null => {
  if (!input.first_name?.trim() || input.first_name.trim().length < 2) {
    return 'El nombre debe tener al menos 2 caracteres';
  }
  if (!input.last_name?.trim() || input.last_name.trim().length < 2) {
    return 'El apellido debe tener al menos 2 caracteres';
  }
  if (isRelationshipRequired(ctx) && !input.relationship?.trim()) {
    return 'El parentesco es obligatorio';
  }
  if (isPhoneRequired(input) && !input.phone?.trim()) {
    return 'El teléfono es obligatorio para quien tiene que firmar';
  }
  return null;
};

/**
 * Un EMPLEADO de un contrato de empresa.
 *
 * Se valida distinto que un adherente porque es el titular de su propio plan
 * dentro del contrato: sin plan y sin monto no hay nada que facturar ni que
 * imprimir en la nómina, y el total del contrato saldría corto sin que nadie se
 * entere. En cambio su "Cargo" sigue siendo opcional, como cualquier vínculo de
 * empresa (`isRelationshipRequired`).
 *
 * Reusa `validateBeneficiary` en vez de repetir sus reglas: si mañana cambia el
 * mínimo de caracteres del nombre, cambia para los dos.
 */
export type EmployeeValidationInput = BeneficiaryValidationInput & {
  plan_id?: string | null;
  amount?: number | null;
};

export const validateEmployee = (input: EmployeeValidationInput): string | null => {
  const base = validateBeneficiary(input, { isCompany: true });
  if (base) return base;

  if (!input.plan_id?.trim()) {
    return 'El empleado necesita un plan: es lo que determina su cobertura y su cuota';
  }
  if (!input.amount || Number(input.amount) <= 0) {
    return 'El monto del empleado debe ser mayor a 0';
  }
  return null;
};

/**
 * Un adherente A CARGO DE UN EMPLEADO, dentro de un contrato de empresa.
 *
 * Ojo con el contexto: es `isCompany: false` a propósito. El contrato es de una
 * empresa, pero esta persona se vincula con SU EMPLEADO por parentesco, no con
 * la empresa por un cargo. Pasarle `isCompany: true` haría que el parentesco
 * dejara de ser obligatorio y la nómina quedaría sin decir quién es quién.
 */
export const validateEmployeeDependent = (
  input: EmployeeValidationInput,
): string | null => {
  const base = validateBeneficiary(input, { isCompany: false });
  if (base) return base;

  if (!input.plan_id?.trim()) {
    return 'El adherente necesita un plan';
  }
  if (!input.amount || Number(input.amount) <= 0) {
    return 'El monto del adherente debe ser mayor a 0';
  }
  return null;
};
