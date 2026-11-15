
import type { AppRole } from '@/types/roles';

const PRIVILEGED_ROLES: AppRole[] = ['super_admin', 'admin', 'auditor', 'supervisor', 'gestor'];

const LOCKED_STATUSES = ['completado', 'aprobado_para_templates', 'listo_para_enviar', 'enviado', 'firmado_parcial', 'firmado', 'expirado'];

/**
 * Returns true when the sale's core data should be read-only for the given role.
 * Privileged roles can always edit; everyone else is locked when audit_status
 * is 'aprobado' or the sale has progressed past audit.
 */
export const isSaleLocked = (
  sale: { audit_status?: string | null; status?: string | null } | null | undefined,
  userRole: AppRole,
): boolean => {
  if (!sale) return false;
  if (PRIVILEGED_ROLES.includes(userRole)) return false;
  if (sale.audit_status === 'aprobado') return true;
  if (LOCKED_STATUSES.includes(sale.status || '')) return true;
  return false;
};

export const isPrivilegedRole = (role: AppRole): boolean =>
  PRIVILEGED_ROLES.includes(role);

/**
 * Estados en los que el contrato ya fue firmado por alguien y su composición
 * familiar quedó sellada en un PDF firmado.
 */
const SIGNED_STATUSES = ['firmado_parcial', 'firmado', 'completado'];

/**
 * ¿Se pueden dar de alta, editar o eliminar adherentes de esta venta?
 *
 * A diferencia de `isSaleLocked`, acá NO hay roles exentos: con el contrato
 * firmado los adherentes son de sólo lectura para TODOS, incluidos admin y
 * super_admin. La composición del grupo familiar ya está sellada en un PDF con
 * firma PAdES; tocarla por atrás dejaría la base diciendo una cosa y el
 * documento firmado otra.
 *
 * La vía legítima para sumar gente a un contrato firmado es la Incorporación de
 * Adherente, que genera su propio anexo y su propia firma.
 *
 * Se mantiene aparte de `isSaleLocked` a propósito: ese helper responde otra
 * pregunta (si los datos comerciales se pueden editar durante la auditoría) y
 * sus exenciones por rol siguen siendo correctas para ese caso.
 */
export const canMutateBeneficiaries = (
  sale: { status?: string | null } | null | undefined,
): boolean => {
  if (!sale) return true;
  return !SIGNED_STATUSES.includes(sale.status || '');
};
