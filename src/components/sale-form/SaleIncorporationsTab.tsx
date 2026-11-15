import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Plus, Trash2, UserPlus, ExternalLink, AlertCircle, Pencil, Ban, UserMinus } from 'lucide-react';
import { toast } from 'sonner';
import { formatCurrency } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useBeneficiaries } from '@/hooks/useBeneficiaries';
import { usePlans } from '@/hooks/usePlans';
import { useSaleClientType } from '@/hooks/useSaleClientType';
import { agruparNomina, estaActivo, montoDe, type NominaMember } from '@/lib/nomina';
import {
  useAdherentIncorporations,
  useCreateAdherentIncorporation,
  useCreateNominaTermination,
  useUpdateAdherentIncorporation,
  useCancelAdherentIncorporation,
  type IncorporationAdherentInput,
} from '@/hooks/useAdherentIncorporations';
import {
  BeneficiaryFields,
  emptyPersonaFields,
  type PersonaFieldsData,
} from './BeneficiaryFields';

interface SaleIncorporationsTabProps {
  saleId?: string;
  /** Estado del contrato madre: solo se mueve nómina sobre contratos firmados. */
  saleStatus?: string | null;
}

type Movimiento = 'alta' | 'baja';

/** Único estado desde el que la base deja tocar un movimiento. */
const EDITABLE = 'draft';

/**
 * Estados de la VENTA-OPERACIÓN en los que el anexo todavía se puede tocar.
 *
 * No alcanza con mirar `incorporacion.status`: nadie escribe nunca 'sent' ni
 * 'signed', así que sigue en 'draft' incluso después de que el titular firmó
 * (ahí la venta-operación ya está en 'firmado'). Gatear por el status de la
 * incorporación dejaba los botones vivos sobre un anexo ya firmado.
 * Los hooks repiten esta guarda: acá es sólo para no ofrecer lo imposible.
 */
const OP_EDITABLE = ['borrador'];
const OP_CANCELABLE = ['borrador', 'enviado', 'pendiente'];

/**
 * Fila de `adherent_incorporations`, tipada suelta: el componente la recibe ya
 * mezclada con el embed `operation_sale`, y enumerar las ~40 columnas acá no
 * agregaría seguridad real.
 */
type Movim = Record<string, any>;

const hoyISO = () => new Date().toISOString().slice(0, 10);

/** "YYYY-MM-DD" a "dd/mm/aaaa" sin pasar por Date (timezone PY = UTC-4). */
const formatFechaCorta = (iso?: string | null): string => {
  if (!iso) return '';
  const [y, m, d] = String(iso).slice(0, 10).split('-');
  return y && m && d ? `${d}/${m}/${y}` : '';
};

const nombreDe = (p: NominaMember) =>
  `${p.first_name || ''} ${p.last_name || ''}`.trim();

const rowFromMovimiento = (inc: Movim): PersonaFieldsData => ({
  ...emptyPersonaFields(),
  first_name: inc.adherent_first_name || '',
  last_name: inc.adherent_last_name || '',
  dni: inc.adherent_document_number || '',
  relationship: inc.adherent_relationship || '',
  birth_date: inc.adherent_birth_date || '',
  phone: inc.adherent_phone || '',
  email: inc.adherent_email || '',
  amount: Number(inc.adherent_amount) || 0,
  entry_date: inc.coverage_start_date || '',
  plan_id: inc.adherent_plan_id || '',
});

/**
 * MOVIMIENTOS DE NÓMINA sobre un contrato ya firmado.
 *
 * Dos operaciones, un solo documento: incorporar a alguien (alta) o
 * desvincularlo (baja). Las dos crean una VENTA-OPERACIÓN aparte con su anexo y
 * su ceremonia de firma; el contrato madre no se toca hasta que el anexo queda
 * firmado, y ahí lo actualiza el trigger `trg_activate_adherent_incorporation`.
 */
const SaleIncorporationsTab: React.FC<SaleIncorporationsTabProps> = ({ saleId, saleStatus }) => {
  const navigate = useNavigate();
  const { data: movimientos = [], isLoading } = useAdherentIncorporations(saleId);
  const { data: miembros = [] } = useBeneficiaries(saleId || '');
  const { data: plans } = usePlans();
  const { isCompany } = useSaleClientType(saleId);
  const crear = useCreateAdherentIncorporation();
  const darDeBaja = useCreateNominaTermination();
  const actualizar = useUpdateAdherentIncorporation();
  const cancelar = useCancelAdherentIncorporation();

  const [movimiento, setMovimiento] = useState<Movimiento>('alta');
  const [showForm, setShowForm] = useState(false);

  // ── Alta ────────────────────────────────────────────────────────────────
  const [rows, setRows] = useState<PersonaFieldsData[]>([emptyPersonaFields()]);
  /**
   * Grupo familiar de cada fila de `rows`, alineado por índice.
   *
   * Un empleado que entra a la nómina suele entrar con su familia, y hasta acá
   * eso eran DOS movimientos con DOS ceremonias de firma — y el segundo ni
   * siquiera se podía preparar hasta que el primero estuviera firmado. Se
   * mantiene aparte de `rows` para no cambiarle la forma a `PersonaFieldsData`,
   * que comparten las tres pantallas.
   */
  const [adherentesPorFila, setAdherentesPorFila] = useState<PersonaFieldsData[][]>([[]]);
  /** Contratos de empresa: qué se incorpora y de quién cuelga. */
  const [rolAlta, setRolAlta] = useState<'empleado' | 'adherente'>('empleado');
  const [empleadoDestino, setEmpleadoDestino] = useState('');

  // ── Baja ────────────────────────────────────────────────────────────────
  const [bajaTargetId, setBajaTargetId] = useState('');
  const [bajaFecha, setBajaFecha] = useState(hoyISO());
  const [bajaMotivo, setBajaMotivo] = useState('');
  const [bajaCascada, setBajaCascada] = useState(true);
  const [buscarPersona, setBuscarPersona] = useState('');

  /** Movimiento en edición (una persona a la vez). */
  const [editando, setEditando] = useState<{ id: string; row: PersonaFieldsData } | null>(null);

  const habilitado = saleStatus === 'firmado' || saleStatus === 'completado';

  const planOptions = useMemo(
    () => (plans || []).map((p: any) => ({ id: p.id, name: p.name, price: p.price })),
    [plans],
  );

  const nomina = useMemo(
    () => agruparNomina((miembros || []) as unknown as NominaMember[]),
    [miembros],
  );

  const empleadosActivos = useMemo(
    () => nomina.empleados.filter((g) => estaActivo(g.empleado)).map((g) => g.empleado),
    [nomina],
  );

  /** Todas las personas del contrato que todavía están cubiertas. */
  const personasActivas = useMemo(
    () =>
      ((miembros || []) as unknown as NominaMember[])
        .filter((m) => !m.is_primary && estaActivo(m))
        .sort((a, b) => nombreDe(a).localeCompare(nombreDe(b))),
    [miembros],
  );

  const personasFiltradas = useMemo(() => {
    const q = buscarPersona.trim().toLowerCase();
    if (!q) return personasActivas;
    // Se busca por nombre Y por documento: en una nómina grande el dato que el
    // área de RR.HH. tiene a mano es la cédula, no la ortografía del apellido.
    return personasActivas.filter(
      (p) =>
        nombreDe(p).toLowerCase().includes(q) ||
        String(p.dni || p.document_number || '').toLowerCase().includes(q),
    );
  }, [personasActivas, buscarPersona]);

  const personaElegida = personasActivas.find((p) => p.id === bajaTargetId);
  const dependientesDeLaBaja = useMemo(() => {
    if (!personaElegida || personaElegida.member_role !== 'empleado') return [];
    const grupo = nomina.empleados.find((g) => g.empleado.id === personaElegida.id);
    return (grupo?.adherentes || []).filter(estaActivo);
  }, [personaElegida, nomina]);

  if (!saleId) {
    return (
      <p className="text-sm text-muted-foreground">
        Guardá la venta primero para poder mover la nómina.
      </p>
    );
  }

  const updateRow = (i: number, patch: Partial<PersonaFieldsData>) =>
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  /** Alta anidada: sólo en contratos de empresa y sólo al incorporar empleados. */
  const altaAnidada = isCompany && rolAlta === 'empleado';

  const agregarFila = () => {
    setRows((p) => [...p, emptyPersonaFields()]);
    setAdherentesPorFila((p) => [...p, []]);
  };

  const quitarFila = (i: number) => {
    setRows((p) => p.filter((_, idx) => idx !== i));
    // El grupo familiar se va con su empleado: dejarlo huérfano lo mandaría al
    // anexo sin nadie de quien colgar.
    setAdherentesPorFila((p) => p.filter((_, idx) => idx !== i));
  };

  const agregarAdherenteDeFila = (i: number) =>
    setAdherentesPorFila((p) =>
      p.map((lista, idx) => {
        if (idx !== i) return lista;
        // El adherente hereda el plan de su empleado; se puede cambiar a mano.
        const base = emptyPersonaFields();
        const heredado = rows[i]?.plan_id || '';
        return [...lista, heredado ? { ...base, plan_id: heredado } : base];
      }),
    );

  const updateAdherenteDeFila = (i: number, j: number, patch: Partial<PersonaFieldsData>) =>
    setAdherentesPorFila((p) =>
      p.map((lista, idx) =>
        idx !== i ? lista : lista.map((a, jdx) => (jdx === j ? { ...a, ...patch } : a)),
      ),
    );

  const quitarAdherenteDeFila = (i: number, j: number) =>
    setAdherentesPorFila((p) =>
      p.map((lista, idx) => (idx !== i ? lista : lista.filter((_, jdx) => jdx !== j))),
    );

  const cerrarForm = () => {
    setShowForm(false);
    setRows([emptyPersonaFields()]);
    setAdherentesPorFila([[]]);
    setBajaTargetId('');
    setBajaMotivo('');
    setBajaFecha(hoyISO());
    setBajaCascada(true);
    setBuscarPersona('');
  };

  const handleCrearAlta = async () => {
    const completa = (r: PersonaFieldsData) => r.first_name.trim() && r.last_name.trim();

    // El movimiento se aplana ACÁ, no en el hook: las personas viajan en un
    // solo array y cada adherente anidado apunta a su empleado por índice.
    const plano: { persona: PersonaFieldsData; rol: 'empleado' | 'adherente'; padre: number | null }[] = [];
    rows.forEach((r, i) => {
      if (!completa(r)) return;
      const indiceEmpleado = plano.length;
      const hijos = altaAnidada ? (adherentesPorFila[i] || []).filter(completa) : [];
      plano.push({
        persona: {
          ...r,
          // Un empleado con familia cargada declara grupo familiar aunque el
          // tilde haya quedado en false: si no, llega al contrato madre sin el
          // flag y pierde el boton "Agregar adherente" justo donde mas hace
          // falta. Es el mismo criterio que usa la pestana Nomina para mostrarlo.
          requires_adherents: r.requires_adherents === true || hijos.length > 0,
        },
        rol: isCompany ? rolAlta : 'adherente',
        padre: null,
      });
      hijos.forEach((a) => {
        plano.push({
          // El plan se hereda al ENVIAR y no al agregar la fila: si el empleado
          // eligio su plan despues, el adherente ya lo tenia vacio.
          persona: { ...a, plan_id: a.plan_id || r.plan_id || '' },
          rol: 'adherente',
          padre: indiceEmpleado,
        });
      });
    });

    if (!plano.length) {
      toast.error('Cargá al menos una persona con nombre y apellido.');
      return;
    }
    const sinTelefono = plano.find((p) => !p.persona.phone?.trim());
    if (sinTelefono) {
      toast.error('El teléfono es obligatorio: es por donde le llega el enlace de firma.');
      return;
    }
    if (isCompany && rolAlta === 'adherente' && !empleadoDestino) {
      toast.error('Elegí de qué empleado depende esta persona.');
      return;
    }
    if (isCompany) {
      const sinPlan = plano.find((p) => !p.persona.plan_id);
      if (sinPlan) {
        toast.error('En un contrato de empresa cada persona necesita su plan.');
        return;
      }
    }

    const adherentes: IncorporationAdherentInput[] = plano.map(({ persona: r, rol, padre }) => ({
      first_name: r.first_name,
      last_name: r.last_name,
      dni: r.dni,
      relationship: r.relationship,
      gender: r.gender,
      phone: r.phone,
      email: r.email,
      address: r.address,
      barrio: r.barrio,
      city: r.city,
      amount: r.amount,
      birth_date: r.birth_date || null,
      entry_date: r.entry_date || null,
      immediate_coverage: r.vi === 'si' ? true : r.vi === 'no' ? false : null,
      member_role: rol,
      plan_id: r.plan_id || null,
      // Empleado que YA vive en el contrato madre (camino de siempre).
      parent_target_beneficiary_id:
        padre === null && isCompany && rolAlta === 'adherente' ? empleadoDestino : null,
      // Empleado que entra en ESTE mismo movimiento.
      parent_row_index: padre,
      requires_adherents: rol === 'empleado' ? r.requires_adherents === true : false,
      maternity_bonus: rol === 'empleado' ? r.maternity_bonus === true : false,
    }));

    try {
      const res = await crear.mutateAsync({ parentSaleId: saleId, adherents: adherentes });
      cerrarForm();
      // Se abre la operación para generar y enviar a firmar el anexo.
      if (res?.operationSale?.id) navigate(`/sales/${res.operationSale.id}/edit`);
    } catch {
      // El hook ya muestra el error.
    }
  };

  const handleCrearBaja = async () => {
    if (!bajaTargetId) {
      toast.error('Elegí a quién dar de baja.');
      return;
    }
    if (!bajaFecha) {
      toast.error('Indicá la fecha de baja.');
      return;
    }
    try {
      const res = await darDeBaja.mutateAsync({
        parentSaleId: saleId,
        termination: {
          targetBeneficiaryId: bajaTargetId,
          terminationDate: bajaFecha,
          reason: bajaMotivo || undefined,
          cascadeDependents: bajaCascada,
        },
      });
      cerrarForm();
      if (res?.operationSale?.id) navigate(`/sales/${res.operationSale.id}/edit`);
    } catch {
      // El hook ya muestra el error.
    }
  };

  /**
   * `adherent_incorporations` no guarda domicilio, barrio, ciudad ni género:
   * esos datos sólo viven en el beneficiario de la venta-operación. Hay que
   * traerlos antes de abrir el editor porque el hook de update reescribe el
   * beneficiario COMPLETO; si se enviaran vacíos se borrarían en silencio.
   */
  const abrirEdicion = async (inc: Movim) => {
    const row = rowFromMovimiento(inc);
    if (inc.operation_beneficiary_id) {
      const { data: ben, error } = await supabase
        .from('beneficiaries')
        .select('*')
        .eq('id', inc.operation_beneficiary_id)
        .maybeSingle();

      // Si no se pudo leer el beneficiario NO se abre el editor. Abrirlo con
      // estos campos vacíos sería peor que no editar: el hook de update
      // reescribe el beneficiario completo, así que guardar borraría domicilio,
      // barrio, ciudad y género en silencio —y esos datos se copian al contrato
      // madre en la activación—.
      if (error || !ben) {
        toast.error(
          'No se pudieron leer los datos de la persona. No se abre la edición para no borrar domicilio, barrio, ciudad ni género.',
        );
        return;
      }

      const b = ben as Record<string, any>;
      row.gender = b.gender || '';
      row.address = b.address || '';
      row.barrio = b.barrio || '';
      row.city = b.city || '';
      row.plan_id = b.plan_id || row.plan_id;
      row.vi = b.immediate_coverage === true ? 'si' : b.immediate_coverage === false ? 'no' : '';
    }
    setEditando({ id: inc.id, row });
  };

  const handleGuardarEdicion = async () => {
    if (!editando) return;
    const { row } = editando;
    if (!row.first_name.trim() || !row.last_name.trim()) {
      toast.error('El nombre y el apellido son obligatorios.');
      return;
    }
    if (!row.phone?.trim()) {
      toast.error('El teléfono es obligatorio: es por donde le llega el enlace de firma.');
      return;
    }

    try {
      await actualizar.mutateAsync({
        id: editando.id,
        adherent: {
          first_name: row.first_name,
          last_name: row.last_name,
          dni: row.dni,
          relationship: row.relationship,
          gender: row.gender,
          phone: row.phone,
          email: row.email,
          address: row.address,
          barrio: row.barrio,
          city: row.city,
          amount: row.amount,
          birth_date: row.birth_date || null,
          entry_date: row.entry_date || null,
          immediate_coverage: row.vi === 'si' ? true : row.vi === 'no' ? false : null,
          plan_id: row.plan_id || null,
        },
      });
      setEditando(null);
    } catch {
      // El hook ya muestra el error.
    }
  };

  // Cancelar una operación cancela TODAS sus personas: la venta-operación es
  // una sola y el anexo se firma completo o no se firma.
  const handleCancelarOperacion = async (personas: Movim[]) => {
    let canceladas = 0;
    try {
      for (const p of personas) {
        await cancelar.mutateAsync({ id: p.id });
        canceladas += 1;
      }
    } catch {
      // El hook ya muestra el error de la fila que falló, pero el primer
      // mutateAsync YA dejó la venta-operación en 'cancelado': las personas que
      // quedaron sin cancelar cuelgan de una operación cancelada. Se avisa
      // explícito para que no parezca que quedó todo bien.
      if (canceladas > 0 && canceladas < personas.length) {
        toast.error(
          `El anexo quedó cancelado a medias: ${canceladas} de ${personas.length} personas. Volvé a intentar para cancelar las que faltan.`,
        );
      }
    }
  };

  // Una operación puede mover varias personas: se agrupan para mostrarlas juntas.
  const porOperacion = movimientos.reduce((acc: Record<string, Movim[]>, inc: Movim) => {
    (acc[inc.operation_sale_id] ||= []).push(inc);
    return acc;
  }, {});

  const creando = crear.isPending || darDeBaja.isPending;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <UserPlus className="h-5 w-5" />
          <h3 className="text-lg font-semibold">
            Movimientos ({Object.keys(porOperacion).length})
          </h3>
        </div>
        {habilitado && !showForm && (
          <Button type="button" size="sm" onClick={() => setShowForm(true)}>
            <Plus className="h-4 w-4 mr-1" />
            Nuevo movimiento
          </Button>
        )}
      </div>

      {!habilitado && (
        <div className="flex items-start gap-2 rounded-md border border-dashed p-4 text-sm text-muted-foreground">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>
            Los movimientos de nómina están disponibles una vez que el contrato está{' '}
            <strong>firmado</strong>. Mientras tanto, cargá o quitá personas desde la pestaña{' '}
            "{isCompany ? 'Nómina' : 'Adherentes'}".
          </span>
        </div>
      )}

      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Nuevo movimiento</CardTitle>
            <p className="text-sm text-muted-foreground">
              Se genera un anexo con este movimiento. El contrato original no se modifica:
              se actualiza recién cuando el anexo queda firmado.
            </p>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Alta y baja usan el MISMO anexo y la misma serie: lo único que
                cambia es qué hace la activación al firmarse. */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Tipo de movimiento *</Label>
                <Select value={movimiento} onValueChange={(v) => setMovimiento(v as Movimiento)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="alta">Alta — incorporar</SelectItem>
                    <SelectItem value="baja">Baja — desvincular</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {movimiento === 'alta' && isCompany && (
                <>
                  <div className="space-y-2">
                    <Label>¿Qué se incorpora? *</Label>
                    <Select
                      value={rolAlta}
                      onValueChange={(v) => {
                        setRolAlta(v as 'empleado' | 'adherente');
                        // Un grupo familiar cargado bajo "Un empleado" no tiene
                        // de quién colgar si el movimiento pasa a ser de
                        // adherentes sueltos: se descarta explícitamente en vez
                        // de quedar escondido y viajar en el próximo alta.
                        setAdherentesPorFila(rows.map(() => []));
                      }}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="empleado">Un empleado</SelectItem>
                        <SelectItem value="adherente">Un adherente de un empleado</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {rolAlta === 'adherente' && (
                    <div className="space-y-2">
                      <Label>Depende de *</Label>
                      <Select value={empleadoDestino} onValueChange={setEmpleadoDestino}>
                        <SelectTrigger><SelectValue placeholder="Elegir empleado" /></SelectTrigger>
                        <SelectContent>
                          {empleadosActivos.map((e) => (
                            <SelectItem key={e.id} value={e.id}>
                              {nombreDe(e)}{e.dni ? ` — C.I. ${e.dni}` : ''}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </>
              )}
            </div>

            {movimiento === 'alta' ? (
              <>
                {rows.map((row, i) => (
                  <div key={i} className="rounded-md border p-4 space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">
                        {isCompany && rolAlta === 'empleado' ? 'Empleado' : 'Adherente'} {i + 1}
                      </span>
                      {rows.length > 1 && (
                        <Button
                          type="button" variant="ghost" size="sm"
                          onClick={() => quitarFila(i)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                    <BeneficiaryFields
                      value={row}
                      onChange={(patch) => updateRow(i, patch)}
                      isCompany={isCompany}
                      vinculoCon={isCompany && rolAlta === 'adherente' ? 'empleado' : 'titular'}
                      plans={isCompany ? planOptions : undefined}
                      esEmpleado={altaAnidada}
                      hidden={['gender', 'city']}
                    />

                    {/* Grupo familiar del empleado que entra en ESTE movimiento:
                        un solo anexo y una sola firma para toda la familia. */}
                    {altaAnidada && (
                      <div className="space-y-3 border-l-2 border-muted pl-4">
                        {(adherentesPorFila[i] || []).map((adh, j) => (
                          <div key={j} className="rounded-md border border-dashed p-4 space-y-4">
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-medium">
                                Adherente {j + 1} de{' '}
                                {row.first_name?.trim() || `el empleado ${i + 1}`}
                              </span>
                              <Button
                                type="button" variant="ghost" size="sm"
                                onClick={() => quitarAdherenteDeFila(i, j)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                            <BeneficiaryFields
                              value={adh}
                              onChange={(patch) => updateAdherenteDeFila(i, j, patch)}
                              isCompany={isCompany}
                              vinculoCon="empleado"
                              plans={planOptions}
                              hidden={['gender', 'city']}
                            />
                          </div>
                        ))}

                        {row.requires_adherents || (adherentesPorFila[i] || []).length > 0 ? (
                          <Button
                            type="button" variant="outline" size="sm"
                            onClick={() => agregarAdherenteDeFila(i)}
                          >
                            <UserPlus className="h-4 w-4 mr-1" />
                            Agregar adherente de este empleado
                          </Button>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            Marcá “¿Requiere adherentes?” para incorporar también a su grupo
                            familiar en este mismo anexo.
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                ))}

                <div className="flex items-center justify-between">
                  <Button
                    type="button" variant="outline" size="sm"
                    onClick={agregarFila}
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    Agregar otra persona
                  </Button>
                  <div className="flex gap-2">
                    <Button type="button" variant="outline" onClick={cerrarForm}>Cancelar</Button>
                    <Button type="button" onClick={handleCrearAlta} disabled={creando}>
                      {creando ? 'Creando...' : 'Crear alta'}
                    </Button>
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>¿A quién se da de baja? *</Label>
                    <Select value={bajaTargetId} onValueChange={setBajaTargetId}>
                      <SelectTrigger><SelectValue placeholder="Buscar por nombre o documento" /></SelectTrigger>
                      <SelectContent>
                        <div className="p-2">
                          <Input
                            placeholder="Nombre o C.I..."
                            value={buscarPersona}
                            onChange={(e) => setBuscarPersona(e.target.value)}
                            className="mb-2"
                          />
                        </div>
                        {personasFiltradas.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {nombreDe(p)}
                            {p.dni ? ` — C.I. ${p.dni}` : ''}
                            {p.member_role === 'empleado' ? ' (empleado)' : ''}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {personasActivas.length === 0 && (
                      <p className="text-xs text-muted-foreground">
                        Este contrato no tiene personas activas para dar de baja.
                      </p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label>Fecha de baja *</Label>
                    <Input type="date" value={bajaFecha} onChange={(e) => setBajaFecha(e.target.value)} />
                    <p className="text-xs text-muted-foreground">
                      Queda como fin de cobertura de quien sale.
                    </p>
                  </div>
                </div>

                {dependientesDeLaBaja.length > 0 && (
                  <div className="flex items-start gap-3 rounded-md border p-4">
                    <Switch checked={bajaCascada} onCheckedChange={setBajaCascada} className="mt-0.5" />
                    <div className="space-y-1">
                      <Label className="cursor-pointer">
                        Dar de baja también a sus {dependientesDeLaBaja.length} adherente(s)
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        {dependientesDeLaBaja.map(nombreDe).join(', ')}
                      </p>
                      {!bajaCascada && (
                        <p className="text-xs text-amber-600">
                          Sin esto, sus adherentes siguen cubiertos y facturando aunque el
                          empleado ya no esté en el contrato.
                        </p>
                      )}
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  <Label>Motivo</Label>
                  <Textarea
                    value={bajaMotivo}
                    onChange={(e) => setBajaMotivo(e.target.value)}
                    placeholder="Ej: desvinculación laboral"
                    rows={2}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">
                    {personaElegida
                      ? `La cuota del contrato baja ${formatCurrency(
                          montoDe(personaElegida) +
                            (bajaCascada
                              ? dependientesDeLaBaja.reduce((s, d) => s + montoDe(d), 0)
                              : 0),
                        )} cuando se firme el anexo.`
                      : ''}
                  </p>
                  <div className="flex gap-2">
                    <Button type="button" variant="outline" onClick={cerrarForm}>Cancelar</Button>
                    <Button type="button" onClick={handleCrearBaja} disabled={creando}>
                      {creando ? 'Creando...' : 'Crear baja'}
                    </Button>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <div className="py-8 text-center text-muted-foreground">Cargando movimientos...</div>
      ) : Object.keys(porOperacion).length === 0 ? (
        !showForm && (
          <div className="py-8 text-center text-muted-foreground">
            Este contrato todavía no tiene movimientos de nómina.
          </div>
        )
      ) : (
        <div className="space-y-2">
          {Object.entries(porOperacion).map(([operationSaleId, personas]) => {
            const lista = personas as Movim[];
            const op = lista[0]?.operation_sale;
            const esBaja = lista.every((p) => p.movement_type === 'baja');
            const total = lista.reduce((s, p) => s + (Number(p.adherent_amount) || 0), 0);
            // Editar/cancelar según el estado de la VENTA-OPERACIÓN, no el del
            // movimiento: ese se queda en 'draft' hasta la activación, así que
            // no distingue un anexo sin emitir de uno ya firmado.
            const estadoOp = op?.status as string | undefined;
            const sePuedeEditar =
              !esBaja &&
              lista.every((p) => p.status === EDITABLE) &&
              (!estadoOp || OP_EDITABLE.includes(estadoOp));
            const sePuedeCancelar =
              lista.every((p) => p.status === EDITABLE) &&
              (!estadoOp || OP_CANCELABLE.includes(estadoOp));

            return (
              <Card key={operationSaleId}>
                <CardContent className="space-y-3 py-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{op?.contract_number || 'Anexo'}</span>
                        <Badge variant={esBaja ? 'destructive' : 'default'}>
                          {esBaja ? (
                            <><UserMinus className="h-3 w-3 mr-1" />Baja</>
                          ) : (
                            <><UserPlus className="h-3 w-3 mr-1" />Alta</>
                          )}
                        </Badge>
                        <Badge variant="outline">{op?.status || 'borrador'}</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {lista.length} persona(s) · {esBaja ? '−' : ''}{formatCurrency(total)}
                        {esBaja && lista[0]?.termination_date
                          ? ` · desde ${formatFechaCorta(lista[0].termination_date)}`
                          : ''}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      {sePuedeCancelar && (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button type="button" variant="outline" size="sm" disabled={cancelar.isPending}>
                              <Ban className="h-4 w-4 mr-1" />
                              Cancelar
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>
                                ¿Cancelar {esBaja ? 'la baja' : 'la incorporación'}?
                              </AlertDialogTitle>
                              <AlertDialogDescription>
                                No se borra nada: el movimiento y su anexo quedan registrados
                                como cancelados. Para volver a hacerlo habrá que crear uno nuevo.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Volver</AlertDialogCancel>
                              <AlertDialogAction onClick={() => handleCancelarOperacion(lista)}>
                                Cancelar movimiento
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      )}
                      <Button
                        type="button" variant="outline" size="sm"
                        onClick={() => navigate(`/sales/${operationSaleId}/edit`)}
                      >
                        <ExternalLink className="h-4 w-4 mr-1" />
                        Abrir anexo
                      </Button>
                    </div>
                  </div>

                  <div className="divide-y rounded-md border">
                    {lista.map((p) => (
                      <div key={p.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                        <span className="min-w-0 truncate">
                          {`${p.adherent_first_name || ''} ${p.adherent_last_name || ''}`.trim() || '(sin nombre)'}
                          <span className="text-muted-foreground">
                            {' · '}{formatCurrency(Number(p.adherent_amount) || 0)}
                            {p.movement_type === 'baja' && p.cascade_dependents
                              ? ' · incluye a sus adherentes'
                              : ''}
                          </span>
                        </span>
                        {sePuedeEditar && (
                          <Button
                            type="button" variant="ghost" size="sm" className="shrink-0"
                            onClick={() => abrirEdicion(p)}
                          >
                            <Pencil className="h-4 w-4 mr-1" />
                            Editar
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Corrección de un alta todavía en borrador (típicamente un tipeo
          detectado antes de enviar el anexo a firmar). Una baja no se edita: sus
          datos son un snapshot de alguien que ya está en el contrato; si están
          mal, se cancela y se crea otra. */}
      <Dialog open={!!editando} onOpenChange={(open) => !open && setEditando(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Editar persona</DialogTitle>
          </DialogHeader>
          {editando && (
            <BeneficiaryFields
              value={editando.row}
              onChange={(patch) =>
                setEditando((prev) => (prev ? { ...prev, row: { ...prev.row, ...patch } } : prev))
              }
              isCompany={isCompany}
              plans={isCompany ? planOptions : undefined}
              hidden={['gender', 'city']}
            />
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setEditando(null)}>
              Cancelar
            </Button>
            <Button type="button" onClick={handleGuardarEdicion} disabled={actualizar.isPending}>
              {actualizar.isPending ? 'Guardando...' : 'Guardar cambios'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default SaleIncorporationsTab;
