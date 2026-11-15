
import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Plus, Trash2, Users, AlertCircle, Pencil } from 'lucide-react';
import { useBeneficiaries, useCreateBeneficiary, useDeleteBeneficiary, useUpdateBeneficiary } from '@/hooks/useBeneficiaries';
import { toast } from 'sonner';
import { formatCurrency } from '@/lib/utils';
import { validateBeneficiary } from '@/lib/beneficiaryValidation';
import { useSaleClientType } from '@/hooks/useSaleClientType';
import {
  BeneficiaryFields,
  emptyPersonaFields,
  type PersonaFieldsData,
} from './BeneficiaryFields';
import { esEmpleado } from '@/lib/nomina';

interface SaleAdherentsTabProps {
  saleId?: string;
  disabled?: boolean;
  /**
   * El contrato ya esta firmado: el grupo familiar es de solo lectura para
   * TODOS los roles, porque ya quedo sellado en un PDF con firma PAdES.
   */
  signedLock?: boolean;
  /** Salta a la pestana Movimientos; `undefined` si no esta disponible. */
  onIrAMovimientos?: () => void;
}

/**
 * Un `catch` que solo hace `console.error` deja al usuario mirando un boton que
 * no hace nada: el guard de contrato firmado y el trigger de la base rechazan
 * con un mensaje que explica que hacer, y tiene que llegar a la pantalla.
 */
const mensajeDeError = (e: unknown, porDefecto: string): string =>
  e instanceof Error && e.message ? e.message : porDefecto;

/**
 * Los campos los pinta `BeneficiaryFields`, compartido con la nómina de empresa
 * y con los movimientos. Acá sólo queda la lógica de esta pantalla: qué se
 * guarda, cuándo y con qué mensaje.
 */

/**
 * Las columnas `date` de Postgres no aceptan cadena vacía (da
 * "invalid input syntax for type date"), así que se mandan como NULL.
 */
const toPayload = (data: PersonaFieldsData) => ({
  first_name: data.first_name,
  last_name: data.last_name,
  dni: data.dni,
  relationship: data.relationship,
  gender: data.gender,
  phone: data.phone,
  email: data.email,
  address: data.address,
  barrio: data.barrio,
  city: data.city,
  amount: data.amount,
  birth_date: data.birth_date || null,
  entry_date: data.entry_date || null,
  immediate_coverage:
    data.vi === 'si' ? true
    : data.vi === 'no' ? false
    : null,
});

const fromBeneficiary = (b: any): PersonaFieldsData => ({
  ...emptyPersonaFields(),
  first_name: b.first_name || '',
  last_name: b.last_name || '',
  dni: b.dni || '',
  relationship: b.relationship || '',
  birth_date: b.birth_date || '',
  gender: b.gender || '',
  phone: b.phone || '',
  email: b.email || '',
  address: b.address || '',
  barrio: b.barrio || '',
  city: b.city || '',
  amount: b.amount || 0,
  entry_date: b.entry_date || '',
  vi:
    b.immediate_coverage === true ? 'si'
    : b.immediate_coverage === false ? 'no'
    : '',
});

const validateForm = (data: PersonaFieldsData, isCompany: boolean): boolean => {
  const error = validateBeneficiary(data, { isCompany });
  if (error) {
    toast.error(error);
    return false;
  }
  return true;
};

interface AdherenteFormProps {
  data: PersonaFieldsData;
  onChange: (patch: Partial<PersonaFieldsData>) => void;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
  title: string;
  saveLabel: string;
  isCompany: boolean;
}

const AdherenteForm: React.FC<AdherenteFormProps> = ({
  data, onChange, onSave, onCancel, saving, title, saveLabel, isCompany,
}) => (
  <Card>
    <CardHeader>
      <CardTitle className="text-base">{title}</CardTitle>
    </CardHeader>
    <CardContent className="space-y-4">
      {/* Sin selector de plan: en una venta a persona física el plan es único y
          vive en `sales.plan_id`. El plan por persona es de los contratos de
          empresa (ver SaleEmployeesTab). */}
      <BeneficiaryFields value={data} onChange={onChange} isCompany={isCompany} vinculoCon="titular" />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>Cancelar</Button>
        <Button type="button" onClick={onSave} disabled={saving}>{saveLabel}</Button>
      </div>
    </CardContent>
  </Card>
);

const SaleAdherentsTab: React.FC<SaleAdherentsTabProps> = ({
  saleId, disabled, signedLock, onIrAMovimientos,
}) => {
  const { data: beneficiaries, isLoading } = useBeneficiaries(saleId || '');
  const createBeneficiary = useCreateBeneficiary();
  const deleteBeneficiary = useDeleteBeneficiary();
  const updateBeneficiary = useUpdateBeneficiary();
  const { isCompany } = useSaleClientType(saleId);

  const [showForm, setShowForm] = useState(false);
  const [newBeneficiary, setNewBeneficiary] = useState<PersonaFieldsData>(emptyPersonaFields());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editData, setEditData] = useState<PersonaFieldsData>(emptyPersonaFields());

  if (!saleId) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <AlertCircle className="h-12 w-12 text-muted-foreground mb-4" />
        <h3 className="text-lg font-semibold mb-2">Guarde la venta primero</h3>
        <p className="text-muted-foreground">
          Debe guardar la venta en la pestaña "Básico" antes de agregar adherentes.
        </p>
      </div>
    );
  }

  // Los empleados de un contrato de empresa se gestionan en la pestaña Nómina,
  // con su plan y sus propios adherentes. Acá no tienen nada que hacer.
  const adherentes = (beneficiaries || []).filter((b: any) => !b.is_primary && !esEmpleado(b));

  const handleAdd = async () => {
    if (!validateForm(newBeneficiary, isCompany)) return;
    try {
      await createBeneficiary.mutateAsync({ ...toPayload(newBeneficiary), sale_id: saleId } as any);
      setNewBeneficiary(emptyPersonaFields());
      setShowForm(false);
    } catch (error) {
      console.error('Error adding beneficiary:', error);
      toast.error(mensajeDeError(error, 'No se pudo agregar el adherente.'));
    }
  };

  const handleEdit = (b: any) => {
    setEditingId(b.id);
    setEditData(fromBeneficiary(b));
  };

  const handleSaveEdit = async () => {
    if (!editingId || !validateForm(editData, isCompany)) return;
    try {
      await updateBeneficiary.mutateAsync({ id: editingId, ...toPayload(editData) } as any);
      setEditingId(null);
    } catch (error) {
      console.error('Error updating beneficiary:', error);
      toast.error(mensajeDeError(error, 'No se pudo guardar el cambio.'));
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteBeneficiary.mutateAsync(id);
    } catch (error) {
      console.error('Error deleting beneficiary:', error);
      toast.error(mensajeDeError(error, 'No se pudo eliminar al adherente.'));
    }
  };

  return (
    <div className="space-y-4">
      {signedLock && (
        <div className="flex flex-wrap items-start justify-between gap-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm dark:bg-amber-950/30">
          <div className="flex gap-2">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <p>
              Este contrato ya está firmado: el grupo familiar quedó sellado en el PDF firmado y
              no se puede editar acá.{' '}
              {onIrAMovimientos ? (
                <>
                  Para sumar o dar de baja gente usá la pestaña <strong>Movimientos</strong>, que
                  genera su propio anexo y su propia firma.
                </>
              ) : (
                <>
                  Cuando termine de firmarlo todo el mundo se habilita la pestaña{' '}
                  <strong>Movimientos</strong>, que es por donde se suma o se da de baja gente.
                </>
              )}
            </p>
          </div>
          {onIrAMovimientos && (
            <Button type="button" variant="outline" size="sm" onClick={onIrAMovimientos}>
              Ir a Movimientos
            </Button>
          )}
        </div>
      )}

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5" />
          <h3 className="text-lg font-semibold">Adherentes ({adherentes.length})</h3>
        </div>
        {!disabled && (
          <Button type="button" size="sm" onClick={() => setShowForm(!showForm)}>
            <Plus className="h-4 w-4 mr-1" />
            Agregar
          </Button>
        )}
      </div>

      {showForm && (
        <AdherenteForm
          data={newBeneficiary}
          onChange={(patch) => setNewBeneficiary((prev) => ({ ...prev, ...patch }))}
          onSave={handleAdd}
          onCancel={() => setShowForm(false)}
          saving={createBeneficiary.isPending}
          title="Nuevo Adherente"
          saveLabel="Guardar Adherente"
          isCompany={isCompany}
        />
      )}

      {isLoading ? (
        <div className="text-center py-8 text-muted-foreground">Cargando adherentes...</div>
      ) : adherentes.length > 0 ? (
        <div className="space-y-2">
          {adherentes.map((b: any) => (
            editingId === b.id ? (
              <AdherenteForm
                key={b.id}
                data={editData}
                onChange={(patch) => setEditData((prev) => ({ ...prev, ...patch }))}
                onSave={handleSaveEdit}
                onCancel={() => setEditingId(null)}
                saving={updateBeneficiary.isPending}
                title="Editar Adherente"
                saveLabel="Guardar Cambios"
                isCompany={isCompany}
              />
            ) : (
              <Card key={b.id}>
                <CardContent className="flex items-center justify-between py-3 px-4">
                  <div>
                    <div className="font-medium">{b.first_name} {b.last_name}</div>
                    <div className="text-sm text-muted-foreground">
                      {b.dni && `C.I.: ${b.dni}`} {b.relationship && `• ${b.relationship}`}
                      {b.phone && ` • Tel: +595${b.phone}`}
                      {b.amount ? ` • ${formatCurrency(Number(b.amount) || 0)}` : ''}
                    </div>
                  </div>
                  {!disabled && (
                    <div className="flex items-center gap-2">
                      <Button type="button" variant="ghost" size="sm" onClick={() => handleEdit(b)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button type="button" variant="ghost" size="sm" onClick={() => handleDelete(b.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            )
          ))}
        </div>
      ) : (
        <div className="text-center py-8 text-muted-foreground">
          No hay adherentes registrados. Haga clic en "Agregar" para empezar.
        </div>
      )}
    </div>
  );
};

export default SaleAdherentsTab;
