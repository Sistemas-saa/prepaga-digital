import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useSale } from '@/hooks/useSale';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { SaleDetails } from '@/components/SaleDetails';
import { ClientDetails } from '@/components/ClientDetails';
import { DocumentsManager } from '@/components/DocumentsManager';
import { RequirementsManager } from '@/components/RequirementsManager';
import { NotesManager } from '@/components/NotesManager';
import { BeneficiariesManager } from '@/components/BeneficiariesManager';
import WhatsAppNotificationPanel from '@/components/WhatsAppNotificationPanel';
import { SignatureLinkGenerator } from '@/components/signature/SignatureLinkGenerator';
import { DocumentPackageSelector } from '@/components/documents/DocumentPackageSelector';
import { AuditCommentsPanel } from '@/components/audit/AuditCommentsPanel';
import { SaleWorkflowSteps } from '@/components/SaleWorkflowSteps';
import { Loader2, FileText, User, Users, MessageSquare, PenTool, Package, ClipboardCheck, LayoutDashboard, ListOrdered, ArrowLeft } from 'lucide-react';
import { useStateTransition } from '@/hooks/useStateTransition';
import { useRolePermissions } from '@/hooks/useRolePermissions';
import { canMutateBeneficiaries } from '@/lib/saleUtils';
import type { SaleStatus } from '@/types/workflow';

export default function SaleDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: sale, isLoading } = useSale(id!);
  const { canViewState } = useStateTransition();
  const { role } = useRolePermissions();
  const [activeTab, setActiveTab] = useState('details');
  const [viewMode, setViewMode] = useState<'display' | 'steps'>('display');
  const showAuditPanel = role === 'auditor' || role === 'admin' || role === 'super_admin' || role === 'vendedor';

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="ml-2">Cargando detalles de la venta...</span>
      </div>
    );
  }

  if (!sale) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <p className="text-muted-foreground">Venta no encontrada.</p>
      </div>
    );
  }

  if (!canViewState((sale.status || 'borrador') as SaleStatus)) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <p className="text-muted-foreground">
          No tienes permisos para visualizar esta venta en su estado actual.
        </p>
      </div>
    );
  }

  const client = sale.clients;
  const clientName = client ? `${client.first_name} ${client.last_name}` : '';
  const clientPhone = client?.phone || '';

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="outline" size="sm" onClick={() => navigate('/sales')} className="gap-2">
            <ArrowLeft className="h-4 w-4" />
            Volver
          </Button>
          <div>
            <h1 className="text-3xl font-bold">Detalle de Venta</h1>
          <p className="text-muted-foreground">
            {sale.contract_number ? `Contrato: ${sale.contract_number}` : `ID: ${id?.slice(0, 8)}`}
            </p>
          </div>
        </div>

        {/* Mode toggle */}
        <div className="flex items-center bg-muted rounded-lg p-1">
          <button
            onClick={() => setViewMode('display')}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              viewMode === 'display'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <LayoutDashboard className="h-4 w-4" />
            Display
          </button>
          <button
            onClick={() => setViewMode('steps')}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              viewMode === 'steps'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <ListOrdered className="h-4 w-4" />
            Pasos
          </button>
        </div>
      </div>

      {viewMode === 'display' ? (
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="flex-wrap h-auto gap-1">
            <TabsTrigger value="details" className="flex items-center gap-1.5">
              <FileText className="h-4 w-4" />
              Detalles
            </TabsTrigger>
            <TabsTrigger value="client" className="flex items-center gap-1.5">
              <User className="h-4 w-4" />
              Cliente
            </TabsTrigger>
            <TabsTrigger value="beneficiaries" className="flex items-center gap-1.5">
              <Users className="h-4 w-4" />
              Beneficiarios
            </TabsTrigger>
            <TabsTrigger value="documents" className="flex items-center gap-1.5">
              <FileText className="h-4 w-4" />
              Documentos
            </TabsTrigger>
            <TabsTrigger value="packages" className="flex items-center gap-1.5">
              <Package className="h-4 w-4" />
              Paquetes
            </TabsTrigger>
            <TabsTrigger value="signature" className="flex items-center gap-1.5">
              <PenTool className="h-4 w-4" />
              Firma
            </TabsTrigger>
            <TabsTrigger value="whatsapp" className="flex items-center gap-1.5">
              <MessageSquare className="h-4 w-4" />
              WhatsApp
            </TabsTrigger>
            {showAuditPanel && (
              <TabsTrigger value="audit" className="flex items-center gap-1.5">
                <ClipboardCheck className="h-4 w-4" />
                Auditoría
              </TabsTrigger>
            )}
            <TabsTrigger value="requirements">Requisitos</TabsTrigger>
            <TabsTrigger value="notes">Notas</TabsTrigger>
          </TabsList>

          <TabsContent value="details">
            <SaleDetails sale={sale} />
          </TabsContent>

          <TabsContent value="client">
            <ClientDetails clientId={sale.client_id!} />
          </TabsContent>

          <TabsContent value="beneficiaries">
            <BeneficiariesManager saleId={id!} canMutate={canMutateBeneficiaries(sale)} />
          </TabsContent>

          <TabsContent value="documents">
            <DocumentsManager saleId={id!} />
          </TabsContent>

          <TabsContent value="packages">
            <DocumentPackageSelector saleId={id!} />
          </TabsContent>

          <TabsContent value="signature">
            <SignatureLinkGenerator saleId={id!} />
          </TabsContent>

          <TabsContent value="whatsapp">
            <WhatsAppNotificationPanel
              saleId={id!}
              clientPhone={clientPhone}
              clientName={clientName}
            />
          </TabsContent>

          {showAuditPanel && (
            <TabsContent value="audit">
              <AuditCommentsPanel saleId={id!} saleStatus={sale.status || undefined} />
            </TabsContent>
          )}

          <TabsContent value="requirements">
            <RequirementsManager saleId={id!} />
          </TabsContent>

          <TabsContent value="notes">
            <NotesManager saleId={id!} />
          </TabsContent>
        </Tabs>
      ) : (
        <SaleWorkflowSteps sale={sale} saleId={id!} />
      )}
    </div>
  );
}
