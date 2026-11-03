import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Tables, TablesInsert, TablesUpdate } from "@/integrations/supabase/types";
import { useToast } from "@/hooks/use-toast";
import { useSimpleAuthContext } from "@/components/SimpleAuthProvider";

type Document = Tables<"documents">;
type DocumentInsert = TablesInsert<"documents">;
type DocumentUpdate = TablesUpdate<"documents">;

interface UseDocumentsListParams {
  page: number;
  pageSize?: number;
  search?: string;
}

/**
 * Sólo mutaciones (crear / actualizar / borrar documentos).
 *
 * ⚠️ Este hook NO lista documentos, a propósito. Hasta 2026-11 hacía además un
 * `select('*', sales(...))` de TODA la tabla `documents` —sin filtro ni límite,
 * con el HTML completo de cada uno (~240 MB en BR prod, docs de hasta 11 MB por
 * las imágenes base64)— y se disparaba con sólo montar la página Documentos,
 * aunque esa página sólo usaba `createDocument`/`deleteDocument`. Eso agotó el
 * Disk IO Budget del t4g.micro el 2026-11-03 (base colgada ~45 min).
 *
 * Para listar: `useDocumentsList` (paginado, sin `content`).
 * Para ver uno: `useDocument(id)`.
 */
export const useDocuments = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const createDocumentMutation = useMutation({
    mutationFn: async (document: DocumentInsert) => {
      const { data, error } = await supabase
        .from("documents")
        .insert([document])
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["documents"] });
      queryClient.invalidateQueries({ queryKey: ["documents-list"] });
      toast({
        title: "Documento creado",
        description: "El documento se ha creado exitosamente.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "No se pudo crear el documento.",
        variant: "destructive",
      });
    },
  });

  const updateDocumentMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: DocumentUpdate }) => {
      const { data, error } = await supabase
        .from("documents")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["documents"] });
      queryClient.invalidateQueries({ queryKey: ["documents-list"] });
      queryClient.invalidateQueries({ queryKey: ["document", data.id] });
      toast({
        title: "Documento actualizado",
        description: "El documento se ha actualizado exitosamente.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "No se pudo actualizar el documento.",
        variant: "destructive",
      });
    },
  });

  const deleteDocumentMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("documents")
        .delete()
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ["documents"] });
      queryClient.invalidateQueries({ queryKey: ["documents-list"] });
      queryClient.removeQueries({ queryKey: ["document", id] });
      toast({
        title: "Documento eliminado",
        description: "El documento se ha eliminado exitosamente.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "No se pudo eliminar el documento.",
        variant: "destructive",
      });
    },
  });

  return {
    createDocument: createDocumentMutation.mutate,
    updateDocument: updateDocumentMutation.mutate,
    deleteDocument: deleteDocumentMutation.mutate,
    isCreating: createDocumentMutation.isPending,
    isUpdating: updateDocumentMutation.isPending,
    isDeleting: deleteDocumentMutation.isPending,
  };
};

export const useDocumentsList = ({
  page,
  pageSize = 25,
  search = "",
}: UseDocumentsListParams) => {
  const { user, loading } = useSimpleAuthContext();

  return useQuery({
    queryKey: ["documents-list", user?.id, page, pageSize, search],
    queryFn: async () => {
      const from = Math.max((page - 1) * pageSize, 0);
      const to = from + pageSize - 1;

      let countQuery = supabase
        .from("documents")
        .select("id", { count: "exact", head: true });

      let documentsQuery = supabase
        .from("documents")
        .select(
          `
            id,
            sale_id,
            name,
            document_type,
            status,
            file_url,
            created_at
          `,
        )
        .order("created_at", { ascending: false })
        .range(from, to);

      if (search.trim()) {
        const pattern = `%${search.trim()}%`;
        countQuery = countQuery.ilike("name", pattern);
        documentsQuery = documentsQuery.ilike("name", pattern);
      }

      const [
        { data: documentsData, error: documentsError },
        { count, error: countError },
      ] = await Promise.all([documentsQuery, countQuery]);

      if (documentsError) throw documentsError;
      if (countError) throw countError;

      const saleIds = [...new Set((documentsData || []).map((document) => document.sale_id).filter(Boolean))];
      let salesMap: Record<string, any> = {};

      if (saleIds.length > 0) {
        const { data: salesData, error: salesError } = await supabase
          .from("sales")
          .select(`
            id,
            status,
            contract_number,
            clients:client_id(first_name, last_name),
            plans:plan_id(name)
          `)
          .in("id", saleIds);

        if (salesError) throw salesError;

        salesMap = (salesData || []).reduce((acc, sale) => {
          acc[sale.id] = sale;
          return acc;
        }, {} as Record<string, any>);
      }

      const documents = (documentsData || []).map((document) => ({
        ...document,
        sales: document.sale_id ? salesMap[document.sale_id] || null : null,
      }));

      return {
        documents,
        total: count || 0,
        page,
        pageSize,
        totalPages: Math.max(Math.ceil((count || 0) / pageSize), 1),
      };
    },
    retry: 2,
    placeholderData: (prev) => prev,
    enabled: !loading && !!user,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
  });
};

export const useDocument = (documentId?: string | null) => {
  const { user, loading } = useSimpleAuthContext();

  return useQuery({
    queryKey: ["document", user?.id, documentId],
    queryFn: async () => {
      if (!documentId) return null;

      const { data, error } = await supabase
        .from("documents")
        .select(`
          *,
          sales:sale_id(
            id,
            status,
            contract_number,
            clients:client_id(first_name, last_name),
            plans:plan_id(name)
          )
        `)
        .eq("id", documentId)
        .single();

      if (error) throw error;
      return data;
    },
    enabled: !loading && !!user && !!documentId,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
  });
};
