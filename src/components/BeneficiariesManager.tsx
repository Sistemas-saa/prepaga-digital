
import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Trash2, Plus, Edit2, ChevronDown, FileText, UserCheck, AlertCircle } from 'lucide-react';
import { useBeneficiaries, useCreateBeneficiary, useUpdateBeneficiary, useDeleteBeneficiary } from '@/hooks/useBeneficiaries';
import { BeneficiaryForm, BeneficiaryFormData } from '@/components/beneficiaries/BeneficiaryForm';
import { BeneficiaryDocuments } from '@/components/beneficiaries/BeneficiaryDocuments';
import { useCurrencySettings } from '@/hooks/useCurrencySettings';
import { formatDateOnly } from '@/lib/dateOnly';

interface BeneficiariesManagerProps {
  saleId: string;
}

export const BeneficiariesManager: React.FC<BeneficiariesManagerProps> = ({ saleId }) => {
  const [showForm, setShowForm] = useState(false);
  const [editingBeneficiary, setEditingBeneficiary] = useState<any>(null);
  const [expandedBeneficiary, setExpandedBeneficiary] = useState<string | null>(null);

  const { data: allBeneficiaries = [], isLoading } = useBeneficiaries(saleId);
  const createBeneficiary = useCreateBeneficiary();
  const updateBeneficiary = useUpdateBeneficiary();
  const deleteBeneficiary = useDeleteBeneficiary();
  const { formatCurrency } = useCurrencySettings();

  // Filter out the titular — only show adherentes
  const beneficiaries = allBeneficiaries.filter(
    (b: any) => b.relationship !== 'titular' && !b.is_primary
  );

  const handleEdit = (beneficiary: any) => {
    setEditingBeneficiary(beneficiary);
    setShowForm(true);
  };

  const onSubmit = (data: BeneficiaryFormData) => {
    const beneficiaryData = {
      sale_id: saleId,
      first_name: data.first_name,
      last_name: data.last_name,
      relationship: data.relationship,
      birth_date: data.birth_date || null,
      amount: data.amount || 0,
      email: data.email || null,
      phone: data.phone || null,
      dni: data.dni || data.document_number || null,
      document_type: data.document_type || null,
      document_number: data.document_number || null,
      gender: data.gender || null,
      marital_status: data.marital_status || null,
      occupation: data.occupation || null,
      address: data.address || null,
      barrio: data.barrio || null,
      city: data.city || null,
      province: data.province || null,
      postal_code: data.postal_code || null,
      is_primary: data.is_primary || false,
      signature_required: data.signature_required ?? true,
      has_preexisting_conditions: data.has_preexisting_conditions || false,
      preexisting_conditions_detail: data.preexisting_conditions_detail || null,
    };

    if (editingBeneficiary) {
      updateBeneficiary.mutate(
        { id: editingBeneficiary.id, ...beneficiaryData },
        {
          onSuccess: () => {
            setShowForm(false);
            setEditingBeneficiary(null);
          },
        }
      );
    } else {
      createBeneficiary.mutate(beneficiaryData, {
        onSuccess: () => {
          setShowForm(false);
        },
      });
    }
  };

  const handleCancel = () => {
    setShowForm(false);
    setEditingBeneficiary(null);
  };

  const handleDelete = (id: string) => {
    if (confirm('¿Está seguro de que desea eliminar este beneficiario?')) {
      deleteBeneficiary.mutate(id);
    }
  };

  const toggleExpand = (id: string) => {
    setExpandedBeneficiary(expandedBeneficiary === id ? null : id);
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-8">
          <div className="flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center">
          <div>
            <CardTitle>Adherentes</CardTitle>
            <CardDescription>
              Gestiona los adherentes del titular ({beneficiaries.length} registrados)
            </CardDescription>
          </div>
          <Button onClick={() => setShowForm(true)} disabled={showForm}>
            <Plus className="h-4 w-4 mr-2" />
            Agregar Beneficiario
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {showForm && (
          <div className="border p-4 rounded-lg bg-muted/50">
            <h3 className="font-semibold mb-4">
              {editingBeneficiary ? 'Editar' : 'Nuevo'} Beneficiario
            </h3>
            <BeneficiaryForm
              defaultValues={editingBeneficiary || {}}
              onSubmit={onSubmit}
              onCancel={handleCancel}
              isSubmitting={createBeneficiary.isPending || updateBeneficiary.isPending}
              isEditing={!!editingBeneficiary}
            />
          </div>
        )}

        {beneficiaries.length > 0 ? (
          <div className="space-y-3">
            {beneficiaries.map((beneficiary: any) => (
              <Collapsible
                key={beneficiary.id}
                open={expandedBeneficiary === beneficiary.id}
                onOpenChange={() => toggleExpand(beneficiary.id)}
              >
                <div className="border rounded-lg">
                  <CollapsibleTrigger asChild>
                    <div className="flex items-center justify-between p-4 cursor-pointer hover:bg-muted/50">
                      <div className="flex items-center gap-4">
                        <ChevronDown 
                          className={`h-4 w-4 transition-transform ${
                            expandedBeneficiary === beneficiary.id ? 'rotate-180' : ''
                          }`} 
                        />
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium">
                              {beneficiary.first_name} {beneficiary.last_name}
                            </span>
                            {beneficiary.is_primary && (
                              <Badge variant="default" className="text-xs">
                                <UserCheck className="h-3 w-3 mr-1" />
                                Titular
                              </Badge>
                            )}
                            {beneficiary.has_preexisting_conditions && (
                              <Badge variant="outline" className="text-xs text-orange-600">
                                <AlertCircle className="h-3 w-3 mr-1" />
                                Preexistencias
                              </Badge>
                            )}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            {beneficiary.relationship && (
                              <span className="capitalize">{beneficiary.relationship}</span>
                            )}
                            {beneficiary.dni && (
                              <span> • DNI: {beneficiary.dni}</span>
                            )}
                            {beneficiary.email && (
                              <span> • {beneficiary.email}</span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="font-medium">
                          {formatCurrency(beneficiary.amount || 0)}
                        </span>
                        <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEdit(beneficiary)}
                          >
                            <Edit2 className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(beneficiary.id)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="border-t p-4 space-y-4 bg-muted/20">
                      {/* Additional Details */}
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                        <div>
                          <span className="text-muted-foreground">Teléfono:</span>
                          <p className="font-medium">{beneficiary.phone || '-'}</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Fecha Nacimiento:</span>
                          <p className="font-medium">
                            {formatDateOnly(beneficiary.birth_date)}
                          </p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Género:</span>
                          <p className="font-medium capitalize">{beneficiary.gender || '-'}</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Estado Civil:</span>
                          <p className="font-medium capitalize">{beneficiary.marital_status || '-'}</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Ocupación:</span>
                          <p className="font-medium">{beneficiary.occupation || '-'}</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Domicilio:</span>
                          <p className="font-medium">{beneficiary.address || '-'}</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Barrio:</span>
                          <p className="font-medium">{(beneficiary as any).barrio || '-'}</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Ciudad:</span>
                          <p className="font-medium">
                            {beneficiary.city}
                            {beneficiary.province && `, ${beneficiary.province}`}
                          </p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Requiere Firma:</span>
                          <p className="font-medium">
                            {beneficiary.signature_required ? 'Sí' : 'No'}
                          </p>
                        </div>
                      </div>

                      {beneficiary.has_preexisting_conditions && beneficiary.preexisting_conditions_detail && (
                        <div className="p-3 bg-orange-50 border border-orange-200 rounded-lg">
                          <p className="text-sm font-medium text-orange-800">Condiciones Preexistentes:</p>
                          <p className="text-sm text-orange-700">{beneficiary.preexisting_conditions_detail}</p>
                        </div>
                      )}

                      {/* Documents Section */}
                      <BeneficiaryDocuments
                        beneficiaryId={beneficiary.id}
                        beneficiaryName={`${beneficiary.first_name} ${beneficiary.last_name}`}
                      />
                    </div>
                  </CollapsibleContent>
                </div>
              </Collapsible>
            ))}

            {/* Total Summary */}
            <div className="flex justify-end pt-4 border-t">
              <div className="text-right">
                <span className="text-sm text-muted-foreground">Total cobertura:</span>
                <span className="ml-2 text-lg font-bold">
                  {formatCurrency(
                    beneficiaries.reduce((sum: number, b: any) => sum + (b.amount || 0), 0)
                  )}
                </span>
              </div>
            </div>
          </div>
        ) : (
          <p className="text-muted-foreground text-center py-8">
            No hay beneficiarios agregados. Haz clic en "Agregar Beneficiario" para comenzar.
          </p>
        )}
      </CardContent>
    </Card>
  );
};
