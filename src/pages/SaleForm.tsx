
import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { useCreateSale, useUpdateSale, useSales } from '@/hooks/useSales';
import { useClients } from '@/hooks/useClients';
import { usePlans } from '@/hooks/usePlans';
import { useCompanies } from '@/hooks/useCompanies';
import { useSimpleAuthContext } from '@/components/SimpleAuthProvider';
import { ClientForm } from '@/components/ClientForm';
import { Loader2, Plus } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';

interface SaleFormData {
  client_id: string;
  plan_id: string;
  company_id: string;
  total_amount: number;
  notes?: string;
}

const SaleForm = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isEditing = Boolean(id);

  const { profile } = useSimpleAuthContext();
  const createSale = useCreateSale();
  const updateSale = useUpdateSale();
  const { data: sales } = useSales();
  const { data: clients, isLoading: clientsLoading } = useClients();
  const { data: plans, isLoading: plansLoading } = usePlans();
  const { data: companies, isLoading: companiesLoading } = useCompanies();

  const [loading, setLoading] = useState(false);
  const [searchClient, setSearchClient] = useState('');
  const [searchPlan, setSearchPlan] = useState('');
  const [showClientModal, setShowClientModal] = useState(false);
  const [prevClientCount, setPrevClientCount] = useState<number | null>(null);

  const { register, handleSubmit, formState: { errors }, setValue, watch, reset } = useForm<SaleFormData>({
    defaultValues: {
      client_id: '',
      plan_id: '',
      company_id: profile?.company_id || '',
      total_amount: 0,
      notes: ''
    }
  });

  const selectedPlanId = watch('plan_id');
  const selectedPlan = plans?.find(p => p.id === selectedPlanId);

  useEffect(() => {
    if (selectedPlan) {
      setValue('total_amount', selectedPlan.price || 0);
    }
  }, [selectedPlan, setValue]);

  useEffect(() => {
    if (profile?.company_id) {
      setValue('company_id', profile.company_id);
    }
  }, [profile, setValue]);

  // Auto-select newly created client when modal closes
  useEffect(() => {
    if (prevClientCount !== null && clients && clients.length > prevClientCount) {
      // The newest client is at index 0 (ordered by created_at desc)
      const newestClient = clients[0];
      if (newestClient) {
        setValue('client_id', newestClient.id);
      }
      setPrevClientCount(null);
    }
  }, [clients, prevClientCount, setValue]);

  useEffect(() => {
    if (isEditing && id && sales) {
      const sale = sales.find(s => s.id === id);
      if (sale) {
        reset({
          client_id: sale.client_id || '',
          plan_id: sale.plan_id || '',
          company_id: sale.company_id || '',
          total_amount: sale.total_amount || 0,
          notes: sale.notes || ''
        });
      }
    }
  }, [id, isEditing, sales, reset]);

  const onSubmit = async (data: SaleFormData) => {
    try {
      setLoading(true);
      
      const saleData = {
        ...data,
        salesperson_id: profile?.id,
        status: 'borrador' as const
      };
      
      if (isEditing && id) {
        await updateSale.mutateAsync({ id, ...saleData });
        toast.success('Venta actualizada exitosamente');
      } else {
        await createSale.mutateAsync(saleData);
        toast.success('Venta creada exitosamente');
      }
      
      navigate('/sales');
    } catch (error: any) {
      console.error('Error saving sale:', error);
      toast.error(error.message || 'Error al guardar la venta');
    } finally {
      setLoading(false);
    }
  };

  const filteredClients = clients?.filter(client =>
    `${client.first_name} ${client.last_name}`.toLowerCase().includes(searchClient.toLowerCase()) ||
    client.email?.toLowerCase().includes(searchClient.toLowerCase())
  ) || [];

  const filteredPlans = plans?.filter(plan =>
    plan.name.toLowerCase().includes(searchPlan.toLowerCase())
  ) || [];

  if (clientsLoading || plansLoading || companiesLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">{isEditing ? 'Editar Venta' : 'Nueva Venta'}</h1>
        <p className="text-muted-foreground">
          {isEditing ? 'Modificar los datos de la venta' : 'Crear una nueva venta'}
        </p>
      </div>

      <div className="max-w-2xl">
        <Card>
          <CardHeader>
            <CardTitle>{isEditing ? 'Editar Venta' : 'Nueva Venta'}</CardTitle>
            <CardDescription>
              {isEditing ? 'Modifique los datos de la venta' : 'Complete la información para crear una nueva venta'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
              {/* Client Selection */}
              <div className="space-y-2">
                <Label htmlFor="client_id">Cliente *</Label>
                <div className="flex gap-2">
                  <div className="flex-1">
                    <Select
                      value={watch('client_id')}
                      onValueChange={(value) => setValue('client_id', value)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccionar cliente" />
                      </SelectTrigger>
                      <SelectContent>
                        <div className="p-2">
                          <Input
                            placeholder="Buscar cliente..."
                            value={searchClient}
                            onChange={(e) => setSearchClient(e.target.value)}
                            className="mb-2"
                          />
                        </div>
                        {filteredClients.map((client) => (
                          <SelectItem key={client.id} value={client.id}>
                            {client.first_name} {client.last_name} - {client.email}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setPrevClientCount(clients?.length ?? 0);
                      setShowClientModal(true);
                    }}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                {errors.client_id && (
                  <p className="text-sm text-red-500">Cliente es requerido</p>
                )}
              </div>

              {/* Plan Selection */}
              <div className="space-y-2">
                <Label htmlFor="plan_id">Plan *</Label>
                <Select
                  value={watch('plan_id')}
                  onValueChange={(value) => setValue('plan_id', value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar plan" />
                  </SelectTrigger>
                  <SelectContent>
                    <div className="p-2">
                      <Input
                        placeholder="Buscar plan..."
                        value={searchPlan}
                        onChange={(e) => setSearchPlan(e.target.value)}
                        className="mb-2"
                      />
                    </div>
                    {filteredPlans.map((plan) => (
                      <SelectItem key={plan.id} value={plan.id}>
                        {plan.name} - {formatCurrency(Number(plan.price) || 0)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.plan_id && (
                  <p className="text-sm text-red-500">Plan es requerido</p>
                )}
              </div>

              {/* Total Amount */}
              <div className="space-y-2">
                <Label htmlFor="total_amount">Monto Total *</Label>
                <Input
                  id="total_amount"
                  type="number"
                  step="1"
                  {...register('total_amount', {
                    required: 'El monto es requerido',
                    valueAsNumber: true,
                    min: { value: 1, message: 'El monto debe ser mayor a 0' }
                  })}
                  placeholder="0"
                />
                {errors.total_amount && (
                  <p className="text-sm text-red-500">{errors.total_amount.message}</p>
                )}
              </div>

              {/* Notes */}
              <div className="space-y-2">
                <Label htmlFor="notes">Notas</Label>
                <Textarea
                  id="notes"
                  {...register('notes')}
                  placeholder="Notas adicionales sobre la venta..."
                  rows={3}
                />
              </div>

              <div className="flex justify-end space-x-2 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => navigate('/sales')}
                  disabled={loading}
                >
                  Cancelar
                </Button>
                <Button type="submit" disabled={loading}>
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {isEditing ? 'Actualizar' : 'Crear'} Venta
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>

      <ClientForm
        open={showClientModal}
        onOpenChange={setShowClientModal}
      />
    </div>
  );
};

export default SaleForm;
