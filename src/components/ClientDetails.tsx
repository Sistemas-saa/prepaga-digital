
import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { formatDateOnly } from '@/lib/dateOnly';

interface ClientDetailsProps {
  clientId: string;
}

export const ClientDetails: React.FC<ClientDetailsProps> = ({ clientId }) => {
  const { data: client, isLoading } = useQuery({
    queryKey: ['client', clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('clients')
        .select('*')
        .eq('id', clientId)
        .single();

      if (error) throw error;
      return data;
    },
    enabled: !!clientId,
  });

  if (isLoading) {
    return <div>Cargando información del cliente...</div>;
  }

  if (!client) {
    return <div>Cliente no encontrado.</div>;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Información del Cliente</CardTitle>
        <CardDescription>Detalles completos del cliente</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium text-muted-foreground">Nombre</label>
            <p className="text-sm">{client.first_name} {client.last_name}</p>
          </div>
          <div>
            <label className="text-sm font-medium text-muted-foreground">C.I.</label>
            <p className="text-sm">{client.dni || 'No proporcionado'}</p>
          </div>
          <div>
            <label className="text-sm font-medium text-muted-foreground">Email</label>
            <p className="text-sm">{client.email || 'No proporcionado'}</p>
          </div>
          <div>
            <label className="text-sm font-medium text-muted-foreground">Teléfono</label>
            <p className="text-sm">{client.phone || 'No proporcionado'}</p>
          </div>
          {client.birth_date && (
            <div>
              <label className="text-sm font-medium text-muted-foreground">Fecha de Nacimiento</label>
              <p className="text-sm">{formatDateOnly(client.birth_date)}</p>
            </div>
          )}
          {client.address && (
            <div>
              <label className="text-sm font-medium text-muted-foreground">Dirección</label>
              <p className="text-sm">{client.address}</p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
