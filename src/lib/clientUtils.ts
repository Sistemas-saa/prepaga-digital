/**
 * Utilidades de clientes (personas físicas y empresas).
 */

export type ClientType = 'persona' | 'empresa';

export const isCompanyClient = (client: any): boolean =>
  client?.client_type === 'empresa';

/**
 * Nombre a mostrar de un cliente, sirva para persona o empresa.
 *
 * NOTA IMPORTANTE SOBRE COMPATIBILIDAD
 * Hay 77 lugares en 42 archivos (más 6 edge functions) que componen el nombre
 * como `first_name + last_name`. Para no tocarlos —ni tener que quitarle el
 * NOT NULL a esas columnas, que haría fallar todo el código que asume string—
 * al guardar una EMPRESA también se escribe la razón social en `first_name`
 * (y `last_name` vacío). Ver buildClientNamePayload().
 *
 * Por eso este helper es una mejora de precisión, no un parche obligatorio:
 * el código viejo sigue mostrando el nombre correcto sin cambios.
 */
export const getClientDisplayName = (client: any): string => {
  if (!client) return '';
  if (isCompanyClient(client) && client.razon_social) {
    return String(client.razon_social).trim();
  }
  return `${client.first_name || ''} ${client.last_name || ''}`.trim();
};

/** Documento identificatorio: RUC para empresas, C.I. para personas. */
export const getClientDocument = (client: any): string => {
  if (!client) return '';
  return (isCompanyClient(client) ? client.ruc : client.dni) || '';
};

/**
 * Etiqueta del documento, para no rotular "C.I." el RUC de una empresa.
 *
 * OJO: sirve para lo que se arma desde código (PDFs generados, sello de firma,
 * pantallas). Las plantillas HTML ya guardadas en base tienen "C.I." escrito a
 * mano y este helper no las alcanza.
 */
export const getClientDocumentLabel = (client: any): string =>
  isCompanyClient(client) ? 'RUC' : 'C.I.';

/**
 * Arma los campos de nombre a guardar, manteniendo el espejo que hace que
 * todo el código existente siga funcionando sin modificaciones.
 */
export const buildClientNamePayload = (data: {
  client_type?: string | null;
  razon_social?: string | null;
  first_name?: string | null;
  last_name?: string | null;
}) => {
  if (data.client_type === 'empresa') {
    const razon = (data.razon_social || '').trim();
    return {
      // Espejo: los listados, PDFs y edge functions leen first_name/last_name.
      first_name: razon,
      last_name: '',
      razon_social: razon,
    };
  }
  return {
    first_name: (data.first_name || '').trim(),
    last_name: (data.last_name || '').trim(),
    razon_social: null,
  };
};
