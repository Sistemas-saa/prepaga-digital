
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export const useSale = (saleId: string) => {
  const query = useQuery({
    queryKey: ['sale', saleId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sales')
        .select(`
          *,
          clients:client_id(first_name, last_name, email, phone, dni, client_type, razon_social, ruc),
          plans:plan_id(name, price, description, coverage_details),
          companies:company_id(name),
          templates:template_id(name, description)
        `)
        .eq('id', saleId)
        .single();

      if (error) throw error;

      // El perfil del vendedor es solo dato de visualización. Usamos maybeSingle()
      // (no .single()) para que 0 filas devuelvan null en vez de 406 Not Acceptable,
      // y nunca lanzamos: si no se puede leer el perfil, la venta igual debe cargar.
      const salespersonPromise = data.salesperson_id
        ? supabase
            .from('profiles')
            .select('first_name, last_name, email')
            .eq('id', data.salesperson_id)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null } as const);

      const [{ data: salesperson }] = await Promise.all([salespersonPromise]);

      return { ...data, salesperson, profiles: salesperson };
    },
    enabled: !!saleId,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
    // Al (re)entrar a la venta siempre revalidamos: se pinta la cache al instante y se refresca
    // en segundo plano. Sin esto, el staleTime de 5 min podia dejar la pantalla Editar Venta con
    // un audit_status viejo y bloquear la pestana Templates aunque auditoria ya hubiera aprobado.
    refetchOnMount: 'always',
  });

  return query;
};
