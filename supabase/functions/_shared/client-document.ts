/**
 * Nombre y documento de un cliente, sirva para persona física o EMPRESA.
 *
 * ⚠ COPIA DELIBERADA de `src/lib/clientUtils.ts`.
 * Deno no puede importar desde `src/`, así que la lógica vive duplicada.
 * **Si cambiás una, cambiá la otra**: los PDFs del cliente y los del servidor
 * tienen que decir lo mismo.
 *
 * El porqué: al guardar una empresa se escribe la razón social TAMBIÉN en
 * `first_name` (con `last_name` vacío), así que el NOMBRE se ve bien en todo el
 * código viejo. Pero el DOCUMENTO no tiene ese espejo: el RUC no se copia a
 * `dni`. Sin estos helpers, un PDF de empresa sale sin documento del titular.
 */

export const isCompanyClient = (client: unknown): boolean =>
  (client as { client_type?: string } | null)?.client_type === 'empresa';

/** Razón social para empresas, nombre + apellido para personas. */
export const getClientDisplayName = (client: unknown): string => {
  const c = client as {
    razon_social?: string | null;
    first_name?: string | null;
    last_name?: string | null;
  } | null;
  if (!c) return '';
  if (isCompanyClient(c) && c.razon_social) return String(c.razon_social).trim();
  return `${c.first_name || ''} ${c.last_name || ''}`.trim();
};

/** RUC para empresas, C.I. para personas. */
export const getClientDocument = (client: unknown): string => {
  const c = client as { ruc?: string | null; dni?: string | null } | null;
  if (!c) return '';
  return (isCompanyClient(c) ? c.ruc : c.dni) || '';
};

/** Etiqueta del documento, para no rotular "C.I." el RUC de una empresa. */
export const getClientDocumentLabel = (client: unknown): string =>
  isCompanyClient(client) ? 'RUC' : 'C.I.';
