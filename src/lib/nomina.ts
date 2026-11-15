/**
 * Nómina de un contrato de EMPRESA: empleados con sus adherentes a cargo.
 *
 * Un contrato corporativo es UNA venta cuyos `beneficiaries` forman dos niveles:
 *
 *   member_role='empleado'   → parent_beneficiary_id = null, plan y monto propios
 *     member_role='adherente' → parent_beneficiary_id = id del empleado
 *
 * Una venta a persona física no tiene ninguna de esas marcas (todas sus filas
 * nacen con el default `'adherente'` y sin padre), así que `agruparNomina` la
 * devuelve entera en `sueltos` y las pantallas de siempre no cambian.
 *
 * Este archivo lo comparten la UI (`SaleEmployeesTab`) y el motor de plantillas
 * (`enhancedTemplateEngine`), para que la tabla que se ve en pantalla y la que
 * sale impresa en el contrato se armen con la MISMA regla.
 */

/** Lo mínimo que necesita el agrupador. Deliberadamente laxo —con `[key: string]`—
 *  para que sirva tanto a la fila completa que devuelve Supabase como a un
 *  objeto armado a mano en un test, sin acoplar este archivo a `types.ts`. */
export interface NominaMember {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
  dni?: string | null;
  amount?: number | string | null;
  member_role?: string | null;
  parent_beneficiary_id?: string | null;
  plan_id?: string | null;
  status?: string | null;
  is_primary?: boolean | null;
  created_at?: string | null;
  [key: string]: unknown;
}

export interface EmpleadoConAdherentes<T extends NominaMember = NominaMember> {
  empleado: T;
  adherentes: T[];
  /** Empleado + sus adherentes ACTIVOS. Los dados de baja no facturan. */
  subtotal: number;
}

export interface NominaAgrupada<T extends NominaMember = NominaMember> {
  empleados: EmpleadoConAdherentes<T>[];
  /**
   * Filas que no entran en el árbol: los adherentes de una venta a persona
   * física, cualquier adherente cuyo empleado no esté en la lista, y una fila
   * `is_primary` si aparece en una venta con nómina.
   *
   * **Nunca se descarta una persona en silencio.** El total lo calcula la base
   * sobre TODAS las filas activas (`recalculate_sale_total_amount`), así que una
   * persona que la pantalla no muestre igual estaría facturando: sería un total
   * que no cierra con lo que se ve, que es exactamente el bug #10.
   */
  sueltos: T[];
}

export const ROL_EMPLEADO = 'empleado';
export const ROL_ADHERENTE = 'adherente';

export const STATUS_ACTIVO = 'active';
export const STATUS_INACTIVO = 'inactive';

/** Una persona da de baja cuando su fila deja de estar `active`. */
export const estaActivo = (m: Pick<NominaMember, 'status'>): boolean =>
  (m.status ?? STATUS_ACTIVO) === STATUS_ACTIVO;

export const esEmpleado = (m: Pick<NominaMember, 'member_role'>): boolean =>
  m.member_role === ROL_EMPLEADO;

export const montoDe = (m: Pick<NominaMember, 'amount'>): number =>
  Number(m.amount ?? 0) || 0;

/**
 * Arma el árbol empleado → adherentes.
 *
 * Conserva el orden de entrada, así que quien llama decide el criterio (la UI
 * ordena por `created_at` ascendente para que la nómina se lea en el orden en
 * que se cargó). Incluye a los dados de baja: ocultarlos dejaría al usuario sin
 * ver la historia del contrato. Lo que sí los excluye es el `subtotal`.
 */
export function agruparNomina<T extends NominaMember>(
  beneficiarios: T[] | null | undefined,
): NominaAgrupada<T> {
  const todas = beneficiarios || [];
  // La fila `is_primary` representa al titular y en una venta a persona física
  // se muestra por otro lado, así que no entra en el árbol. Pero tampoco se
  // descarta: en una venta de EMPRESA no debería existir (la razón social no es
  // beneficiaria de sí misma), y si aparece hay que verla, porque la base la
  // está sumando al total igual.
  const filas = todas.filter((b) => !b.is_primary);
  const primarios = todas.filter((b) => !!b.is_primary);

  const empleados = filas.filter(esEmpleado);
  const porEmpleadoId = new Map<string, EmpleadoConAdherentes<T>>(
    empleados.map((e) => [e.id, { empleado: e, adherentes: [], subtotal: 0 }]),
  );

  // Un primario sólo se reporta como suelto cuando hay nómina: en una venta a
  // persona física es el titular y mostrarlo acá sería ruido.
  const sueltos: T[] = empleados.length > 0 ? [...primarios] : [];

  for (const fila of filas) {
    if (esEmpleado(fila)) continue;

    const grupo = fila.parent_beneficiary_id
      ? porEmpleadoId.get(fila.parent_beneficiary_id)
      : undefined;

    if (grupo) {
      grupo.adherentes.push(fila);
    } else {
      // Sin padre = adherente de una venta a persona física. Con un padre que
      // no está en la lista = dato inconsistente; igual se muestra, para que se
      // note en vez de desaparecer.
      sueltos.push(fila);
    }
  }

  for (const grupo of porEmpleadoId.values()) {
    grupo.subtotal =
      (estaActivo(grupo.empleado) ? montoDe(grupo.empleado) : 0) +
      grupo.adherentes.reduce((s, a) => s + (estaActivo(a) ? montoDe(a) : 0), 0);
  }

  return {
    empleados: empleados
      .map((e) => porEmpleadoId.get(e.id))
      .filter((g): g is EmpleadoConAdherentes<T> => !!g),
    sueltos,
  };
}

/**
 * La nómina en el orden en que va impresa y en que se muestra: cada empleado
 * seguido de sus adherentes.
 *
 * Es lo que hace que el contrato de empresa se lea como una nómina y no como
 * una lista suelta de personas, sin necesidad de loops anidados en las
 * plantillas simples.
 */
export function aplanarNomina<T extends NominaMember>(
  agrupada: NominaAgrupada<T>,
): T[] {
  const salida: T[] = [];
  for (const grupo of agrupada.empleados) {
    salida.push(grupo.empleado);
    salida.push(...grupo.adherentes);
  }
  salida.push(...agrupada.sueltos);
  return salida;
}

/** ¿Esta venta tiene nómina cargada? Sirve para decidir si imprimir la tabla
 *  agrupada o la de siempre, sin depender del `client_type`. */
export function tieneNomina(beneficiarios: NominaMember[] | null | undefined): boolean {
  return (beneficiarios || []).some(esEmpleado);
}

/**
 * La nomina en el orden en que se cargo.
 *
 * `useBeneficiaries` trae DESCENDENTE por `created_at` y el arbol conserva el
 * orden de entrada, asi que quien agrupa tiene que invertirlo. Vive aca —y no
 * repetido en cada pantalla— porque la tabla que se ve y la que se guarda en
 * `sales.plan_id` tienen que salir de la misma primera fila.
 */
export function ordenarNomina<T extends NominaMember>(
  beneficiarios: T[] | null | undefined,
): T[] {
  return [...(beneficiarios || [])].sort((a, b) =>
    String(a.created_at || '').localeCompare(String(b.created_at || '')),
  );
}

/**
 * El plan que representa al contrato de empresa: el del primer empleado ACTIVO.
 *
 * En una venta corporativa el vendedor ya no elige un "plan de referencia" —lo
 * elige empleado por empleado— pero `sales.plan_id` no puede quedar en NULL: lo
 * leen la condicion `has_plan` del workflow configurable
 * (`useStateTransition.ts`), la herencia de plan de la venta-operacion de un
 * anexo (`useAdherentIncorporations`, `usePlanChanges`) y la resolucion de
 * reglas de comisiones, que nunca asume 0%. Se deriva en vez de pedirse.
 */
export function planDeReferenciaDeNomina(
  agrupada: NominaAgrupada,
): string | null {
  const primero = agrupada.empleados.find((g) => estaActivo(g.empleado));
  return (primero?.empleado.plan_id as string | null | undefined) || null;
}

/** ¿Algun empleado activo contrato el adicional Plan Materno? Es lo que habilita
 *  la pestaña "Campos del Plan", que se completa UNA vez para todo el contrato
 *  porque `template_responses` es por venta, no por persona. */
export function nominaTieneMaternidad(agrupada: NominaAgrupada): boolean {
  return agrupada.empleados.some(
    (g) => estaActivo(g.empleado) && g.empleado.maternity_bonus === true,
  );
}
