
import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2, Users, AlertCircle, Pencil } from 'lucide-react';
import { useBeneficiaries, useCreateBeneficiary, useDeleteBeneficiary, useUpdateBeneficiary } from '@/hooks/useBeneficiaries';
import { toast } from 'sonner';
import { formatCurrency } from '@/lib/utils';

interface SaleAdherentsTabProps {
  saleId?: string;
  disabled?: boolean;
}

type BeneficiaryFormData = {
  first_name: string;
  last_name: string;
  dni: string;
  relationship: string;
  birth_date: string;
  gender: string;
  phone: string;
  email: string;
  address: string;
  barrio: string;
  city: string;
  amount: number;
};

const emptyForm: BeneficiaryFormData = {
  first_name: '', last_name: '', dni: '', relationship: '', birth_date: '',
  gender: '', phone: '', email: '', address: '', barrio: '', city: '', amount: 0,
};

const formatAmountInput = (value: number) => {
  if (!value) return '';
  return value.toLocaleString('es-PY', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
};

const parseAmountInput = (value: string) => {
  const digitsOnly = value.replace(/\D/g, '');
  return digitsOnly ? Number(digitsOnly) : 0;
};

const validateForm = (data: BeneficiaryFormData): boolean => {
  if (!data.first_name || !data.last_name) {
    toast.error('Nombre y apellido son obligatorios');
    return false;
  }
  if (!data.phone) {
    toast.error('El número de teléfono es obligatorio para el adherente');
    return false;
  }
  return true;
};

interface BeneficiaryFormProps {
  data: BeneficiaryFormData;
  onChange: (data: BeneficiaryFormData) => void;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
  title: string;
  saveLabel: string;
}

const BeneficiaryForm: React.FC<BeneficiaryFormProps> = ({ data, onChange, onSave, onCancel, saving, title, saveLabel }) => (
  <Card>
    <CardHeader>
      <CardTitle className="text-base">{title}</CardTitle>
    </CardHeader>
    <CardContent className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Nombre *</Label>
          <Input value={data.first_name} onChange={(e) => onChange({ ...data, first_name: e.target.value })} placeholder="Nombre" />
        </div>
        <div className="space-y-2">
          <Label>Apellido *</Label>
          <Input value={data.last_name} onChange={(e) => onChange({ ...data, last_name: e.target.value })} placeholder="Apellido" />
        </div>
        <div className="space-y-2">
          <Label>C.I.</Label>
          <Input value={data.dni} onChange={(e) => onChange({ ...data, dni: e.target.value })} placeholder="Nº Documento" />
        </div>
        <div className="space-y-2">
          <Label>Parentesco</Label>
          <Select value={data.relationship} onValueChange={(v) => onChange({ ...data, relationship: v })}>
            <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="conyuge">Cónyuge</SelectItem>
              <SelectItem value="hijo">Hijo/a</SelectItem>
              <SelectItem value="padre">Padre/Madre</SelectItem>
              <SelectItem value="hermano">Hermano/a</SelectItem>
              <SelectItem value="otro">Otro</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Fecha de Nacimiento</Label>
          <Input type="date" value={data.birth_date} onChange={(e) => onChange({ ...data, birth_date: e.target.value })} />
        </div>
        <div className="space-y-2">
          <Label>Género</Label>
          <Select value={data.gender} onValueChange={(v) => onChange({ ...data, gender: v })}>
            <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="masculino">Masculino</SelectItem>
              <SelectItem value="femenino">Femenino</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Teléfono *</Label>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground whitespace-nowrap">+595</span>
            <Input value={data.phone} onChange={(e) => onChange({ ...data, phone: e.target.value.replace(/\D/g, '') })} placeholder="981123456" />
          </div>
        </div>
        <div className="space-y-2">
          <Label>Monto (Gs.)</Label>
          <Input inputMode="numeric" value={formatAmountInput(data.amount)} onChange={(e) => onChange({ ...data, amount: parseAmountInput(e.target.value) })} placeholder="0" />
        </div>
        <div className="space-y-2">
          <Label>Domicilio</Label>
          <Input value={data.address} onChange={(e) => onChange({ ...data, address: e.target.value })} placeholder="Ej: Boquerón 123" />
        </div>
        <div className="space-y-2">
          <Label>Barrio</Label>
          <Input value={data.barrio} onChange={(e) => onChange({ ...data, barrio: e.target.value })} placeholder="Ej: Villa Morra" />
        </div>
        <div className="space-y-2">
          <Label>Ciudad</Label>
          <Input value={data.city} onChange={(e) => onChange({ ...data, city: e.target.value })} placeholder="Ciudad" />
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>Cancelar</Button>
        <Button type="button" onClick={onSave} disabled={saving}>{saveLabel}</Button>
      </div>
    </CardContent>
  </Card>
);

const SaleAdherentsTab: React.FC<SaleAdherentsTabProps> = ({ saleId, disabled }) => {
  const { data: beneficiaries, isLoading } = useBeneficiaries(saleId || '');
  const createBeneficiary = useCreateBeneficiary();
  const deleteBeneficiary = useDeleteBeneficiary();
  const updateBeneficiary = useUpdateBeneficiary();

  const [showForm, setShowForm] = useState(false);
  const [newBeneficiary, setNewBeneficiary] = useState<BeneficiaryFormData>({ ...emptyForm });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editData, setEditData] = useState<BeneficiaryFormData>({ ...emptyForm });

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

  const handleAdd = async () => {
    if (!validateForm(newBeneficiary)) return;
    try {
      await createBeneficiary.mutateAsync({ ...newBeneficiary, sale_id: saleId });
      setNewBeneficiary({ ...emptyForm });
      setShowForm(false);
    } catch (error) {
      console.error('Error adding beneficiary:', error);
    }
  };

  const handleEdit = (b: any) => {
    setEditingId(b.id);
    setEditData({
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
    });
  };

  const handleSaveEdit = async () => {
    if (!editingId || !validateForm(editData)) return;
    try {
      await updateBeneficiary.mutateAsync({ id: editingId, ...editData });
      setEditingId(null);
    } catch (error) {
      console.error('Error updating beneficiary:', error);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteBeneficiary.mutateAsync(id);
    } catch (error) {
      console.error('Error deleting beneficiary:', error);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5" />
          <h3 className="text-lg font-semibold">Adherentes ({beneficiaries?.filter(b => !b.is_primary).length || 0})</h3>
        </div>
        {!disabled && (
          <Button type="button" size="sm" onClick={() => setShowForm(!showForm)}>
            <Plus className="h-4 w-4 mr-1" />
            Agregar
          </Button>
        )}
      </div>

      {showForm && (
        <BeneficiaryForm
          data={newBeneficiary}
          onChange={setNewBeneficiary}
          onSave={handleAdd}
          onCancel={() => setShowForm(false)}
          saving={createBeneficiary.isPending}
          title="Nuevo Adherente"
          saveLabel="Guardar Adherente"
        />
      )}

      {isLoading ? (
        <div className="text-center py-8 text-muted-foreground">Cargando adherentes...</div>
      ) : beneficiaries && beneficiaries.filter(b => !b.is_primary).length > 0 ? (
        <div className="space-y-2">
          {beneficiaries.filter(b => !b.is_primary).map((b) => (
            editingId === b.id ? (
              <BeneficiaryForm
                key={b.id}
                data={editData}
                onChange={setEditData}
                onSave={handleSaveEdit}
                onCancel={() => setEditingId(null)}
                saving={updateBeneficiary.isPending}
                title="Editar Adherente"
                saveLabel="Guardar Cambios"
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
