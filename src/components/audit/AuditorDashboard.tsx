
import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { useSimpleAuthContext } from '@/components/SimpleAuthProvider';
import { formatCurrency } from '@/lib/utils';
import { getDocumentAccessUrl } from '@/lib/assetUrlHelper';
import { Skeleton } from '@/components/ui/skeleton';
import {
  CheckCircle, XCircle, Clock, AlertCircle, Eye, Search,
  FileText, User, DollarSign, Calendar, Filter, Download,
  HeartPulse
} from 'lucide-react';
import { ImageLightbox } from '@/components/ui/image-lightbox';

const AUDIT_PAGE_SIZE = 10;

const HEALTH_QUESTIONS = [
  '1. ¿Padece alguna enfermedad crónica (diabetes, hipertensión, asma, EPOC, reumatológicas, tiroideas, insuficiencia renal u otras)?',
  '2. ¿Padece o ha padecido alguna enfermedad o trastorno mental o neurológico (ansiedad, depresión, convulsiones u otros)?',
  '3. ¿Padece o ha padecido enfermedad cardiovascular o coronaria, o se ha sometido a procedimientos (marcapasos, bypass, cateterismo, etc.)?',
  '4. ¿Posee o ha poseído quistes, tumores o enfermedades oncológicas que hayan requerido cirugía, quimioterapia o radioterapia?',
  '5. ¿Ha sido internado/a o sometido/a a alguna cirugía?',
  '6. ¿Consume medicamentos, sustancias o se somete a tratamientos, de origen médico, natural o experimental?',
  '7. Otras enfermedades o condiciones no mencionadas',
];

const HABITS_LABELS = ['Fuma', 'Vapea', 'Consume bebidas alcohólicas'];

interface ParsedHealthData {
  peso: string;
  altura: string;
  answers: ('si' | 'no' | '')[];
  details: string[];
  habits: boolean[];
  lastMenstruation: string;
}

const parseHealthDetail = (detail: string | null, hasPreexisting: boolean | null): ParsedHealthData => {
  const data: ParsedHealthData = {
    peso: '', altura: '',
    answers: new Array(HEALTH_QUESTIONS.length).fill(''),
    details: new Array(HEALTH_QUESTIONS.length).fill(''),
    habits: [false, false, false],
    lastMenstruation: '',
  };
  if (!detail && !hasPreexisting) return data;
  if (detail) {
    const parts = detail.split('; ');
    for (const part of parts) {
      const qMatch = HEALTH_QUESTIONS.findIndex(q => part.startsWith(q));
      if (qMatch >= 0) {
        data.answers[qMatch] = 'si';
        const colonIdx = part.indexOf(': ', HEALTH_QUESTIONS[qMatch].length - 5);
        if (colonIdx >= 0) data.details[qMatch] = part.substring(colonIdx + 2);
        continue;
      }
      if (part.startsWith('Hábitos: ')) {
        const habitList = part.replace('Hábitos: ', '').split(', ');
        HABITS_LABELS.forEach((h, i) => { if (habitList.includes(h)) data.habits[i] = true; });
        continue;
      }
      if (part.startsWith('Última menstruación/embarazo: ')) {
        data.lastMenstruation = part.replace('Última menstruación/embarazo: ', '');
        continue;
      }
      if (part.startsWith('Peso: ')) { data.peso = part.replace('Peso: ', '').replace(' kg', ''); continue; }
      if (part.startsWith('Estatura: ')) { data.altura = part.replace('Estatura: ', '').replace(' cm', ''); continue; }
    }
  }
  return data;
};

const logBestEffortInsertError = (tableName: string, error: any) => {
  if (!error) return;
  console.error(`Best-effort insert failed for ${tableName}:`, error);
};

const BeneficiaryHealthView: React.FC<{ beneficiary: any }> = ({ beneficiary }) => {
  const health = parseHealthDetail(beneficiary.preexisting_conditions_detail, beneficiary.has_preexisting_conditions);
  const hasData = beneficiary.preexisting_conditions_detail || beneficiary.has_preexisting_conditions !== null;

  if (!hasData) {
    return (
      <div className="text-sm text-muted-foreground italic py-2">
        Sin declaración jurada completada
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Biometría */}
      <div className="flex flex-wrap gap-4">
        {health.peso && (
          <div className="text-sm"><span className="font-medium">Peso:</span> {health.peso} kg</div>
        )}
        {health.altura && (
          <div className="text-sm"><span className="font-medium">Estatura:</span> {health.altura} cm</div>
        )}
        {health.lastMenstruation && (
          <div className="text-sm"><span className="font-medium">Últ. menstruación:</span> {health.lastMenstruation}</div>
        )}
      </div>

      {/* Hábitos */}
      <div className="flex flex-wrap gap-2">
        {HABITS_LABELS.map((label, i) => (
          <Badge key={i} variant="outline" className={health.habits[i] ? "text-orange-600 border-orange-300" : "text-muted-foreground"}>
            {health.habits[i] ? '✓' : '✗'} {label}
          </Badge>
        ))}
      </div>

      {/* Preguntas - show all 7 */}
      <div className="space-y-1.5">
        {HEALTH_QUESTIONS.map((q, i) => {
          const shortQ = q.replace(/^\d+\.\s*/, '').substring(0, 80) + (q.length > 83 ? '...' : '');
          const answer = health.answers[i];
          // Default to 'no' if not answered
          const displayAnswer = answer || 'no';
          return (
            <div key={i} className="flex items-start gap-2 text-sm">
              {displayAnswer === 'si' ? (
                <Badge variant="destructive" className="text-[10px] px-1.5 py-0 shrink-0 mt-0.5">Sí</Badge>
              ) : (
                <Badge variant="outline" className="text-green-600 border-green-300 text-[10px] px-1.5 py-0 shrink-0 mt-0.5">No</Badge>
              )}
              <div>
                <span className="text-muted-foreground">{shortQ}</span>
                {health.details[i] && (
                  <span className="ml-1 font-medium text-foreground">— {health.details[i]}</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export const AuditorDashboard: React.FC = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { profile, userRole, user } = useSimpleAuthContext();
  const isVendedor = userRole === 'vendedor';
  const [selectedSaleId, setSelectedSaleId] = useState<string | null>(null);
  const [auditNotes, setAuditNotes] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('pending');
  const [currentPage, setCurrentPage] = useState(1);
  const [lightboxUrl, setLightboxUrl] = useState('');
  const [lightboxName, setLightboxName] = useState('');
  const [lightboxType, setLightboxType] = useState('');
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const canViewAllAuditSales = userRole === 'auditor' || userRole === 'admin' || userRole === 'super_admin' || userRole === 'supervisor';

  const openAttachedDocument = async (fileUrl: string | null | undefined) => {
    if (!fileUrl) {
      toast({
        title: 'Documento sin archivo',
        description: 'No se encontro un archivo para este documento.',
        variant: 'destructive',
      });
      return;
    }

    const accessUrl = await getDocumentAccessUrl(fileUrl);
    if (!accessUrl) {
      toast({
        title: 'Error',
        description: 'No se pudo abrir el documento adjunto.',
        variant: 'destructive',
      });
      return;
    }

    window.open(accessUrl, '_blank', 'noopener,noreferrer');
  };

  // Fetch sales for the audit list using a lightweight projection.
  const { data: sales = [], isLoading, refetch } = useQuery({
    queryKey: ['auditor-sales-list', user?.id, isVendedor],
    queryFn: async () => {
      let query = supabase
        .from('sales')
        .select(`
          id,
          client_id,
          plan_id,
          salesperson_id,
          status,
          audit_status,
          total_amount,
          contract_number,
          created_at,
          clients:client_id (id, first_name, last_name),
          plans:plan_id (id, name)
        `)
        .order('created_at', { ascending: false });

      if (!canViewAllAuditSales && user?.id) {
        query = query.eq('salesperson_id', user.id);
      }

      const { data, error } = await query;
      if (error) throw error;

      // Fetch salesperson profiles separately
      const salespersonIds = [...new Set((data || []).map((s: any) => s.salesperson_id).filter(Boolean))];
      let profilesMap: Record<string, any> = {};
      if (salespersonIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, first_name, last_name, email')
          .in('id', salespersonIds);
        profilesMap = (profiles || []).reduce((acc: any, p: any) => { acc[p.id] = p; return acc; }, {});
      }

      return (data || []).map((s: any) => ({
        ...s,
        profiles: profilesMap[s.salesperson_id] || null,
      }));
    },
    refetchInterval: 30_000,
    staleTime: 10_000,
  });

  const {
    data: selectedSale,
    isLoading: isLoadingSelectedSale,
    isError: isSelectedSaleError,
    error: selectedSaleError,
  } = useQuery({
    queryKey: ['auditor-sale-detail', selectedSaleId],
    enabled: !!selectedSaleId,
    queryFn: async () => {
      let saleQuery = supabase
        .from('sales')
        .select(`
          id,
          client_id,
          plan_id,
          salesperson_id,
          status,
          audit_status,
          total_amount,
          contract_number,
          immediate_coverage,
          sale_type,
          clients:client_id (id, first_name, last_name, email, phone, dni, birth_date, address, barrio, city),
          plans:plan_id (id, name)
        `)
        .eq('id', selectedSaleId);

      if (!canViewAllAuditSales && user?.id) {
        saleQuery = saleQuery.eq('salesperson_id', user.id);
      }

      const { data: sale, error } = await saleQuery.single();

      if (error) throw error;

      const [
        { data: salespersonProfile },
        { data: beneficiaries, error: beneficiariesError },
        { data: documents, error: documentsError },
        { data: saleDocuments, error: saleDocumentsError },
      ] = await Promise.all([
        sale?.salesperson_id
          ? supabase
              .from('profiles')
              .select('id, first_name, last_name, email')
              .eq('id', sale.salesperson_id)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null }),
        supabase
          .from('beneficiaries')
          .select('id, is_primary, first_name, last_name, relationship, dni, birth_date, email, phone, address, barrio, city, amount, preexisting_conditions_detail, has_preexisting_conditions')
          .eq('sale_id', selectedSaleId)
          .order('created_at', { ascending: true }),
        supabase
          .from('documents')
          .select('id, name, status, file_url')
          .eq('sale_id', selectedSaleId)
          .order('created_at', { ascending: false }),
        supabase
          .from('sale_documents')
          .select('id, file_name, file_url, file_size, file_type, created_at')
          .eq('sale_id', selectedSaleId)
          .order('created_at', { ascending: false }),
      ]);

      if (beneficiariesError) throw beneficiariesError;
      if (documentsError) throw documentsError;
      if (saleDocumentsError) throw saleDocumentsError;

      const beneficiaryIds = (beneficiaries || []).map((b: any) => b.id).filter(Boolean);
      const beneficiaryDocsMap: Record<string, any[]> = {};
      if (beneficiaryIds.length > 0) {
        const { data: benDocs, error: benDocsError } = await supabase
          .from('beneficiary_documents')
          .select('*')
          .in('beneficiary_id', beneficiaryIds)
          .order('created_at', { ascending: false });

        if (benDocsError) throw benDocsError;

        (benDocs || []).forEach((doc: any) => {
          if (!beneficiaryDocsMap[doc.beneficiary_id]) beneficiaryDocsMap[doc.beneficiary_id] = [];
          beneficiaryDocsMap[doc.beneficiary_id].push(doc);
        });
      }

      return {
        ...sale,
        profiles: salespersonProfile,
        beneficiaries: (beneficiaries || []).map((b: any) => ({
          ...b,
          beneficiary_documents: beneficiaryDocsMap[b.id] || [],
        })),
        documents: documents || [],
        attached_documents: saleDocuments || [],
        attached_docs_count: saleDocuments?.length || 0,
        last_doc_uploaded_at: saleDocuments?.[0]?.created_at || null,
      };
    },
    staleTime: 10_000,
  });

  const isOwnSelectedSale = !!selectedSale && !!user?.id && selectedSale.salesperson_id === user.id;
  const canApproveSelectedSale = !!selectedSale && (canViewAllAuditSales || (isVendedor && isOwnSelectedSale));
  const canRejectOrRequestInfoSelectedSale = !!selectedSale && canViewAllAuditSales;

  const assertAuditActionAllowed = (sale: any, action: 'approve' | 'reject' | 'request_info') => {
    if (!sale) {
      throw new Error('No se encontró la venta seleccionada');
    }

    const isOwnSale = !!user?.id && sale.salesperson_id === user.id;

    if (action === 'approve') {
      if (canViewAllAuditSales) return;
      if (isVendedor && isOwnSale) return;
      throw new Error('No tienes permiso para aprobar esta venta');
    }

    if (canViewAllAuditSales) return;

    if (action === 'reject' || action === 'request_info') {
      throw new Error('Solo auditoría, admin o super admin pueden rechazar o solicitar información');
    }
  };

  // Realtime: auto-refresh when sales, sale_documents or documents change
  useEffect(() => {
    refetch();

    const channel = supabase
      .channel('auditor-realtime')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'sales' },
        () => {
          queryClient.invalidateQueries({ queryKey: ['auditor-sales-list'] });
          if (selectedSaleId) {
            queryClient.invalidateQueries({ queryKey: ['auditor-sale-detail', selectedSaleId] });
          }
        }
      )
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'sale_documents' },
        () => {
          if (selectedSaleId) {
            queryClient.invalidateQueries({ queryKey: ['auditor-sale-detail', selectedSaleId] });
          }
        }
      )
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'documents' },
        () => {
          if (selectedSaleId) {
            queryClient.invalidateQueries({ queryKey: ['auditor-sale-detail', selectedSaleId] });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient, refetch, selectedSaleId]);

  // Approve sale - changes status to 'aprobado_para_templates' (approved, ready for next steps)
  const approveSale = useMutation({
    mutationFn: async (saleId: string) => {
      const saleData = sales.find((s: any) => s.id === saleId);
      assertAuditActionAllowed(saleData, 'approve');
      const previousStatus = saleData?.status || 'pendiente';

      // Calculate contract_start_date: first day of the approval month
      const now = new Date();
      const contractStartDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;

      const { error } = await supabase
        .from('sales')
        .update({
          audit_status: 'aprobado',
          auditor_id: profile?.id,
          audited_at: new Date().toISOString(),
          audit_notes: auditNotes || 'Aprobado sin observaciones',
          status: 'aprobado_para_templates' as any,
          contract_start_date: contractStartDate,
        } as any)
        .eq('id', saleId);

      if (error) throw error;

      // Auxiliary audit traces are best-effort because production RLS may block direct inserts.
      const { error: workflowError } = await supabase.from('sale_workflow_states').insert({
        sale_id: saleId,
        previous_status: previousStatus,
        new_status: 'aprobado_para_templates',
        changed_by: profile?.id,
        change_reason: `Aprobado por auditor: ${auditNotes || 'Sin observaciones'}`,
        metadata: { audit_notes: auditNotes },
      });
      logBestEffortInsertError('sale_workflow_states', workflowError);

      const { error: traceError } = await supabase.from('process_traces').insert({
        sale_id: saleId,
        action: 'audit_approved',
        user_id: profile?.id,
        details: { audit_notes: auditNotes, new_status: 'aprobado_para_templates' },
      });
      logBestEffortInsertError('process_traces', traceError);

      // Notify vendedor
      // saleData already declared above
      if (saleData?.salesperson_id) {
        const { error: notificationError } = await supabase.from('notifications').insert({
          user_id: saleData.salesperson_id,
          title: 'Venta aprobada por auditoría',
          message: `La venta #${saleData.contract_number || saleId.slice(-4)} ha sido aprobada. ${auditNotes || ''}`,
          type: 'success',
          link: `/sales/${saleId}/edit`,
        });
        logBestEffortInsertError('notifications', notificationError);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['audit-sales'] });
      queryClient.invalidateQueries({ queryKey: ['sales'] });
      setSelectedSaleId(null);
      setAuditNotes('');
      toast({
        title: 'Venta aprobada',
        description: 'La venta ha sido aprobada y pasa a estado Aprobado.',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'No se pudo aprobar la venta.',
        variant: 'destructive',
      });
    },
  });

  // Reject sale - returns to 'rechazado' so vendedor can fix and resubmit
  const rejectSale = useMutation({
    mutationFn: async (saleId: string) => {
      const saleData = sales.find((s: any) => s.id === saleId);
      assertAuditActionAllowed(saleData, 'reject');
      if (!auditNotes.trim()) {
        throw new Error('Debe proporcionar un motivo de rechazo');
      }
      const previousStatus = saleData?.status || 'pendiente';

      const { error } = await supabase
        .from('sales')
        .update({
          audit_status: 'rechazado',
          auditor_id: profile?.id,
          audited_at: new Date().toISOString(),
          audit_notes: auditNotes,
          status: 'rechazado' as any,
        })
        .eq('id', saleId);

      if (error) throw error;

      const { error: workflowError } = await supabase.from('sale_workflow_states').insert({
        sale_id: saleId,
        previous_status: previousStatus,
        new_status: 'rechazado',
        changed_by: profile?.id,
        change_reason: `Rechazado: ${auditNotes}`,
      });
      logBestEffortInsertError('sale_workflow_states', workflowError);

      const { error: traceError } = await supabase.from('process_traces').insert({
        sale_id: saleId,
        action: 'audit_rejected',
        user_id: profile?.id,
        details: { audit_notes: auditNotes, new_status: 'rechazado' },
      });
      logBestEffortInsertError('process_traces', traceError);

      // Notify vendedor
      // saleData already declared above
      if (saleData?.salesperson_id) {
        const { error: notificationError } = await supabase.from('notifications').insert({
          user_id: saleData.salesperson_id,
          title: 'Venta rechazada por auditoría',
          message: `La venta #${saleData.contract_number || saleId.slice(-4)} fue rechazada. Motivo: ${auditNotes}`,
          type: 'error',
          link: `/sales/${saleId}/edit`,
        });
        logBestEffortInsertError('notifications', notificationError);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['audit-sales'] });
      queryClient.invalidateQueries({ queryKey: ['sales'] });
      setSelectedSaleId(null);
      setAuditNotes('');
      toast({
        title: 'Venta rechazada',
        description: 'La venta ha sido rechazada y devuelta al vendedor.',
        variant: 'destructive',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'No se pudo rechazar la venta.',
        variant: 'destructive',
      });
    },
  });

  // Request more info
  const requestMoreInfo = useMutation({
    mutationFn: async (saleId: string) => {
      const saleData = sales.find((s: any) => s.id === saleId);
      assertAuditActionAllowed(saleData, 'request_info');
      if (!auditNotes.trim()) {
        throw new Error('Debe especificar qué información adicional necesita');
      }
      const previousStatus = saleData?.status || 'pendiente';

      const { error } = await supabase
        .from('sales')
        .update({
          audit_status: 'requiere_info',
          auditor_id: profile?.id,
          audit_notes: auditNotes,
          status: 'rechazado' as any,
        })
        .eq('id', saleId);

      if (error) throw error;

      // Create information request
      const { error: infoRequestError } = await supabase.from('information_requests').insert({
        sale_id: saleId,
        request_type: 'audit',
        description: auditNotes,
        requested_by: profile?.id,
      });
      if (infoRequestError) throw infoRequestError;

      const { error: workflowError } = await supabase.from('sale_workflow_states').insert({
        sale_id: saleId,
        previous_status: previousStatus,
        new_status: 'rechazado',
        changed_by: profile?.id,
        change_reason: `Información requerida: ${auditNotes}`,
        metadata: { audit_notes: auditNotes, reason: 'requiere_info' },
      });
      logBestEffortInsertError('sale_workflow_states', workflowError);

      const { error: traceError } = await supabase.from('process_traces').insert({
        sale_id: saleId,
        action: 'audit_request_info',
        user_id: profile?.id,
        details: { audit_notes: auditNotes, new_status: 'rechazado' },
      });
      logBestEffortInsertError('process_traces', traceError);

      // Notify vendedor
      // saleData already declared above
      if (saleData?.salesperson_id) {
        const { error: notificationError } = await supabase.from('notifications').insert({
          user_id: saleData.salesperson_id,
          title: 'Solicitud de información - Auditoría',
          message: `Se requiere información adicional para la venta #${saleData.contract_number || saleId.slice(-4)}: ${auditNotes}`,
          type: 'warning',
          link: `/sales/${saleId}/edit`,
        });
        logBestEffortInsertError('notifications', notificationError);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['audit-sales'] });
      queryClient.invalidateQueries({ queryKey: ['sales'] });
      setSelectedSaleId(null);
      setAuditNotes('');
      toast({
        title: 'Solicitud enviada',
        description: 'Se ha solicitado información adicional al vendedor.',
      });
    },
  });

  const getStatusBadge = (status: string, auditStatus: string | null) => {
    switch (status) {
      case 'borrador':
        return <Badge variant="outline"><Clock className="h-3 w-3 mr-1" />Borrador</Badge>;
      case 'en_auditoria':
      case 'pendiente':
        return <Badge variant="outline" className="text-yellow-600 border-yellow-600"><Clock className="h-3 w-3 mr-1" />Pendiente</Badge>;
      case 'aprobado_para_templates':
        return <Badge className="bg-green-600"><CheckCircle className="h-3 w-3 mr-1" />Aprobado</Badge>;
      case 'enviado':
        return <Badge variant="outline" className="text-blue-600">Enviado</Badge>;
      case 'firmado':
        return <Badge variant="outline" className="text-indigo-600">Firmado</Badge>;
      case 'completado':
        return <Badge className="bg-green-700"><CheckCircle className="h-3 w-3 mr-1" />Completado</Badge>;
      case 'rechazado':
        return <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" />Rechazado</Badge>;
      case 'cancelado':
        return <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" />Cancelado</Badge>;
      default:
        if (auditStatus === 'requiere_info') {
          return <Badge variant="outline" className="text-orange-600"><AlertCircle className="h-3 w-3 mr-1" />Info Requerida</Badge>;
        }
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  // Classify each sale for filtering and stats
  const classifySale = (sale: any): string => {
    if (sale.audit_status === 'aprobado') return 'aprobado';
    if (sale.audit_status === 'rechazado') return 'rechazado';
    if (sale.audit_status === 'requiere_info') return 'requiere_info';
    return 'pending';
  };

  // Stats from ALL sales
  const stats = {
    pending: sales.filter((s: any) => classifySale(s) === 'pending').length,
    approved: sales.filter((s: any) => classifySale(s) === 'aprobado').length,
    rejected: sales.filter((s: any) => classifySale(s) === 'rechazado').length,
    infoRequired: sales.filter((s: any) => classifySale(s) === 'requiere_info').length,
  };

  // Filter by status tab, then by search
  const filteredSales = sales
    .filter((sale: any) => {
      if (statusFilter === 'pending') return classifySale(sale) === 'pending';
      if (statusFilter === 'aprobado') return classifySale(sale) === 'aprobado';
      if (statusFilter === 'rechazado') return classifySale(sale) === 'rechazado';
      if (statusFilter === 'requiere_info') return classifySale(sale) === 'requiere_info';
      return true; // 'all'
    })
    .filter((sale: any) => {
      if (!searchTerm) return true;
      const searchLower = searchTerm.toLowerCase();
      return (
        sale.clients?.first_name?.toLowerCase().includes(searchLower) ||
        sale.clients?.last_name?.toLowerCase().includes(searchLower) ||
        sale.contract_number?.toLowerCase().includes(searchLower) ||
        sale.plans?.name?.toLowerCase().includes(searchLower)
      );
    });

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredSales.length / AUDIT_PAGE_SIZE));
  const currentPageSafe = Math.min(currentPage, totalPages);
  const paginatedSales = filteredSales.slice(
    (currentPageSafe - 1) * AUDIT_PAGE_SIZE,
    currentPageSafe * AUDIT_PAGE_SIZE
  );

  const detailView = selectedSaleId ? (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold">Detalle de Auditoría</h2>
          <Button variant="outline" onClick={() => setSelectedSaleId(null)}>
            ← Volver al listado
          </Button>
        </div>

        {isLoadingSelectedSale ? (
          <Card>
            <CardContent className="py-8">
              <div className="space-y-4">
                <Skeleton className="h-6 w-48" />
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <Skeleton className="h-48 w-full" />
                  <Skeleton className="h-48 w-full" />
                  <Skeleton className="h-56 w-full lg:col-span-2" />
                  <Skeleton className="h-56 w-full lg:col-span-2" />
                </div>
              </div>
            </CardContent>
          </Card>
        ) : isSelectedSaleError ? (
          <Card>
            <CardContent className="py-8">
              <div className="space-y-4 text-center">
                <p className="text-base font-medium">No se pudo cargar el detalle de auditoría</p>
                <p className="text-sm text-muted-foreground">
                  {selectedSaleError instanceof Error
                    ? selectedSaleError.message
                    : 'Ocurrió un error al consultar la venta seleccionada.'}
                </p>
                <div className="flex items-center justify-center gap-2">
                  <Button variant="outline" onClick={() => setSelectedSaleId(null)}>
                    Volver al listado
                  </Button>
                  <Button
                    onClick={() => {
                      queryClient.invalidateQueries({ queryKey: ['auditor-sale-detail', selectedSaleId] });
                    }}
                  >
                    Reintentar
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ) : !selectedSale ? (
          <Card>
            <CardContent className="py-8">
              <div className="space-y-4 text-center">
                <p className="text-base font-medium">La venta seleccionada no está disponible</p>
                <p className="text-sm text-muted-foreground">
                  Puede haber cambiado de estado o ya no pertenecer al conjunto de auditoría.
                </p>
                <Button variant="outline" onClick={() => setSelectedSaleId(null)}>
                  Volver al listado
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Sale Info */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="h-5 w-5" />
                Información del Cliente
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <span className="font-medium">Nombre: </span>
                {selectedSale.clients?.first_name} {selectedSale.clients?.last_name}
              </div>
              <div>
                <span className="font-medium">Email: </span>
                {selectedSale.clients?.email || 'No especificado'}
              </div>
              <div>
                <span className="font-medium">Teléfono: </span>
                {selectedSale.clients?.phone || 'No especificado'}
              </div>
              <div>
                <span className="font-medium">C.I.: </span>
                {selectedSale.clients?.dni || 'No especificado'}
              </div>
              {selectedSale.clients?.birth_date && (
                <div>
                  <span className="font-medium">Fecha Nac.: </span>
                  {new Date(selectedSale.clients.birth_date).toLocaleDateString('es-PY')}
                </div>
              )}
              {selectedSale.clients?.address && (
                <div>
                  <span className="font-medium">Dirección: </span>
                  {selectedSale.clients.address}
                </div>
              )}
              {selectedSale.clients?.barrio && (
                <div>
                  <span className="font-medium">Barrio: </span>
                  {selectedSale.clients.barrio}
                </div>
              )}
              {selectedSale.clients?.city && (
                <div>
                  <span className="font-medium">Ciudad: </span>
                  {selectedSale.clients.city}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <DollarSign className="h-5 w-5" />
                Información del Plan
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <span className="font-medium">Plan: </span>
                {selectedSale.plans?.name}
              </div>
              <div>
                <span className="font-medium">Precio Titular: </span>
                {formatCurrency(Number(
                  selectedSale.beneficiaries?.find((b: any) => b.is_primary === true)?.amount || 
                  selectedSale.total_amount || 0
                ))}
              </div>
              <div>
                <span className="font-medium">Monto Total: </span>
                {formatCurrency(Number(selectedSale.total_amount || 0))}
              </div>
              <div>
                <span className="font-medium">Contrato #: </span>
                {selectedSale.contract_number || 'Sin asignar'}
              </div>
              {selectedSale.profiles && (
                <div>
                  <span className="font-medium">Vendedor: </span>
                  {selectedSale.profiles.first_name} {selectedSale.profiles.last_name}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Información Laboral y Contractual */}
          {(selectedSale.immediate_coverage !== null && selectedSale.immediate_coverage !== undefined) || selectedSale.sale_type ? (
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Información Adicional</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {selectedSale.immediate_coverage !== null && selectedSale.immediate_coverage !== undefined && (
                    <div><span className="font-medium">Vigencia Inmediata: </span>{selectedSale.immediate_coverage ? 'Sí' : 'No'}</div>
                  )}
                  {selectedSale.sale_type && (
                    <div><span className="font-medium">Tipo de Venta: </span>{selectedSale.sale_type}</div>
                  )}
                </div>
              </CardContent>
            </Card>
          ) : null}

          {/* Adherentes (excluye titular) */}
          {(() => {
            const adherentes = (selectedSale.beneficiaries || []).filter((b: any) => !b.is_primary);
            if (adherentes.length === 0) return null;
            return (
              <Card className="lg:col-span-2">
                <CardHeader>
                  <CardTitle>Adherentes ({adherentes.length})</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {adherentes.map((ben: any) => (
                      <div key={ben.id} className="p-3 border rounded-lg space-y-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="font-medium">
                              {ben.first_name} {ben.last_name}
                            </div>
                            <div className="text-sm text-muted-foreground">
                              {ben.relationship} • C.I.: {ben.dni || 'No especificado'}
                              {ben.birth_date && ` • Nac: ${new Date(ben.birth_date).toLocaleDateString('es-PY')}`}
                              {ben.email && ` • ${ben.email}`}
                              {ben.phone && ` • Tel: ${ben.phone}`}
                            </div>
                            {(ben.address || ben.barrio || ben.city) && (
                              <div className="text-sm text-muted-foreground">
                                {[ben.address, ben.barrio, ben.city].filter(Boolean).join(', ')}
                              </div>
                            )}
                            {ben.amount > 0 && (
                              <div className="text-sm text-muted-foreground">
                                Monto: {formatCurrency(Number(ben.amount))}
                              </div>
                            )}
                          </div>
                        </div>
                        {/* Beneficiary Documents */}
                        {ben.beneficiary_documents && ben.beneficiary_documents.length > 0 && (
                          <div className="border-t pt-2 space-y-1">
                            <p className="text-xs font-medium text-muted-foreground">Documentos adjuntos ({ben.beneficiary_documents.length})</p>
                            {ben.beneficiary_documents.map((doc: any) => (
                              <div key={doc.id} className="flex items-center justify-between p-2 bg-muted/30 rounded text-sm">
                                <div className="flex items-center gap-2">
                                  <FileText className="h-3 w-3" />
                                  <span>{doc.file_name}</span>
                                  {doc.is_verified && (
                                    <Badge variant="outline" className="text-green-600 border-green-600 text-[10px]">
                                      <CheckCircle className="h-2 w-2 mr-1" />Verificado
                                    </Badge>
                                  )}
                                </div>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={async () => {
                                    const { data } = await supabase.storage
                                      .from('documents')
                                      .createSignedUrl(doc.file_url, 3600);
                                    if (data?.signedUrl) {
                                      setLightboxUrl(data.signedUrl);
                                      setLightboxName(doc.file_name);
                                      setLightboxType(doc.file_type || '');
                                      setLightboxOpen(true);
                                    }
                                  }}
                                >
                                  <Eye className="h-3 w-3 mr-1" />
                                  Ver
                                </Button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            );
          })()}

          {/* Declaración Jurada de Salud */}
          {selectedSale.beneficiaries?.length > 0 && (
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <HeartPulse className="h-5 w-5" />
                  Declaración Jurada de Salud
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {selectedSale.beneficiaries.map((ben: any) => (
                    <div key={ben.id} className="p-3 border rounded-lg space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{ben.first_name} {ben.last_name}</span>
                        {ben.is_primary && <Badge variant="outline" className="text-xs">Titular</Badge>}
                        {!ben.is_primary && ben.relationship && (
                          <Badge variant="outline" className="text-xs">{ben.relationship}</Badge>
                        )}
                      </div>
                      <BeneficiaryHealthView beneficiary={ben} />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Documents (generated) */}
          {selectedSale.documents?.length > 0 && (
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Documentos Generados ({selectedSale.documents.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {selectedSale.documents.map((doc: any) => (
                    <div key={doc.id} className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4" />
                        <span>{doc.name}</span>
                      </div>
                      <Badge variant={doc.status === 'firmado' ? 'default' : 'outline'}>
                        {doc.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Attached Documents (sale_documents from view) */}
          {selectedSale.attached_documents?.length > 0 && (
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Documentos Adjuntos ({selectedSale.attached_docs_count || selectedSale.attached_documents.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {selectedSale.attached_documents.map((doc: any) => (
                    <div key={doc.id} className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-muted-foreground" />
                        <span>{doc.file_name}</span>
                        {doc.file_size && (
                          <span className="text-xs text-muted-foreground">
                            {(doc.file_size / 1024 / 1024).toFixed(2)} MB
                          </span>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => void openAttachedDocument(doc.file_url)}
                      >
                        <Eye className="h-3 w-3 mr-1" />
                        Ver
                      </Button>
                    </div>
                  ))}
                  {selectedSale.last_doc_uploaded_at && (
                    <p className="text-xs text-muted-foreground mt-2">
                      Último documento: {new Date(selectedSale.last_doc_uploaded_at).toLocaleString('es-PY')}
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Show message if no documents at all */}
          {(!selectedSale.documents?.length && !selectedSale.attached_documents?.length) && (
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Documentos
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground text-center py-4">No hay documentos cargados para esta venta</p>
              </CardContent>
            </Card>
          )}

          {/* Audit Actions */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Decisión de Auditoría</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium">Notas de Auditoría</label>
                <Textarea
                  value={auditNotes}
                  onChange={(e) => setAuditNotes(e.target.value)}
                  placeholder="Escriba sus observaciones aquí..."
                  rows={4}
                />
              </div>
              <div className="flex flex-wrap gap-3">
                <Button
                  onClick={() => approveSale.mutate(selectedSale.id)}
                  disabled={approveSale.isPending || !canApproveSelectedSale}
                  className="bg-green-600 hover:bg-green-700"
                >
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Aprobar Venta
                </Button>
                <Button
                  variant="outline"
                  onClick={() => requestMoreInfo.mutate(selectedSale.id)}
                  disabled={requestMoreInfo.isPending || !auditNotes.trim() || !canRejectOrRequestInfoSelectedSale}
                >
                  <AlertCircle className="h-4 w-4 mr-2" />
                  Solicitar Información
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => rejectSale.mutate(selectedSale.id)}
                  disabled={rejectSale.isPending || !auditNotes.trim() || !canRejectOrRequestInfoSelectedSale}
                >
                  <XCircle className="h-4 w-4 mr-2" />
                  Rechazar
                </Button>
              </div>
              {isVendedor && (
                <p className="text-sm text-muted-foreground">
                  Como vendedor solo puedes aprobar ventas propias. Rechazar o solicitar información queda reservado para auditoría.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
        )}
      </div>
  ) : null;

  const listView = (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Panel de Auditoría</h1>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className={`cursor-pointer transition-shadow hover:shadow-md ${statusFilter === 'pending' ? 'ring-2 ring-yellow-500' : ''}`} onClick={() => setStatusFilter('pending')}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Clock className="h-4 w-4 text-yellow-500" />
              Pendientes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.pending}</div>
          </CardContent>
        </Card>
        <Card className={`cursor-pointer transition-shadow hover:shadow-md ${statusFilter === 'aprobado' ? 'ring-2 ring-green-500' : ''}`} onClick={() => setStatusFilter('aprobado')}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-500" />
              Aprobados
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{stats.approved}</div>
          </CardContent>
        </Card>
        <Card className={`cursor-pointer transition-shadow hover:shadow-md ${statusFilter === 'rechazado' ? 'ring-2 ring-red-500' : ''}`} onClick={() => setStatusFilter('rechazado')}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <XCircle className="h-4 w-4 text-red-500" />
              Rechazados
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">{stats.rejected}</div>
          </CardContent>
        </Card>
        <Card className={`cursor-pointer transition-shadow hover:shadow-md ${statusFilter === 'requiere_info' ? 'ring-2 ring-orange-500' : ''}`} onClick={() => setStatusFilter('requiere_info')}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-orange-500" />
              Info Requerida
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">{stats.infoRequired}</div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por cliente, contrato o plan..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[200px]">
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Filtrar por estado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="pending">Pendientes</SelectItem>
                <SelectItem value="aprobado">Aprobados</SelectItem>
                <SelectItem value="rechazado">Rechazados</SelectItem>
                <SelectItem value="requiere_info">Info Requerida</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Sales List */}
      <Card>
        <CardHeader>
          <CardTitle>Ventas para Auditar</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto" />
            </div>
          ) : paginatedSales.length > 0 ? (
            <div className="space-y-3">
              {paginatedSales.map((sale: any) => (
                <div
                  key={sale.id}
                  className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-3">
                      <span className="font-medium">
                        {sale.clients?.first_name} {sale.clients?.last_name}
                      </span>
                      {getStatusBadge(sale.status, sale.audit_status)}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {sale.plans?.name} • {formatCurrency(Number(sale.total_amount || 0))}
                      {sale.contract_number && ` • #${sale.contract_number}`}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Vendedor: {sale.profiles?.first_name} {sale.profiles?.last_name}
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    onClick={() => setSelectedSaleId(sale.id)}
                  >
                    <Eye className="h-4 w-4 mr-2" />
                    Revisar
                  </Button>
                </div>
              ))}

              {totalPages > 1 && (
                <div className="flex items-center justify-between pt-2">
                  <p className="text-sm text-muted-foreground">
                    Página {currentPageSafe} de {totalPages} · {filteredSales.length} ventas
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                      disabled={currentPageSafe === 1}
                    >
                      Anterior
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                      disabled={currentPageSafe === totalPages}
                    >
                      Siguiente
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              No hay ventas que coincidan con los filtros
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );

  return (
    <>
      {selectedSaleId ? detailView : listView}
      <ImageLightbox
        open={lightboxOpen}
        onOpenChange={setLightboxOpen}
        src={lightboxUrl}
        fileName={lightboxName}
        fileType={lightboxType}
      />
    </>
  );
};
