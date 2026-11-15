import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * ¿El titular de esta venta es una empresa?
 *
 * Los formularios de adherentes lo necesitan para rotular el vínculo ("Cargo"
 * en vez de "Parentesco") y para saber si es obligatorio. Trae sólo esa columna
 * en vez de la venta entera: los dos consumidores viven dentro de pantallas que
 * ya cargan bastante.
 */
export const useSaleClientType = (saleId?: string) => {
  const { data } = useQuery({
    queryKey: ['sale-client-type', saleId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sales')
        .select('clients:client_id (client_type)')
        .eq('id', saleId!)
        .maybeSingle();

      if (error) throw error;
      // El embed llega como objeto o como array de un elemento segun como
      // PostgREST resuelva la relacion; se contemplan los dos.
      const clients = (data as { clients?: { client_type?: string | null } | { client_type?: string | null }[] } | null)?.clients;
      const cliente = Array.isArray(clients) ? clients[0] : clients;
      return cliente?.client_type ?? null;
    },
    enabled: !!saleId,
    staleTime: 5 * 60 * 1000,
  });

  return { isCompany: data === 'empresa' };
};

/**
 * Igual que el anterior, pero cuando lo que se tiene a mano es el cliente y no
 * la venta: el formulario de alta conoce el `client_id` elegido antes de que la
 * venta exista.
 */
export const useClientIsCompany = (clientId?: string) => {
  const { data } = useQuery({
    queryKey: ['client-type', clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('clients')
        .select('client_type')
        .eq('id', clientId!)
        .maybeSingle();

      if (error) throw error;
      return data?.client_type ?? null;
    },
    enabled: !!clientId,
    staleTime: 5 * 60 * 1000,
  });

  return { isCompany: data === 'empresa' };
};
