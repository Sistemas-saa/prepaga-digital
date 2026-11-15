
import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { CheckCircle, XCircle, Clock, AlertCircle, MessageSquare, Edit, FileText } from 'lucide-react';
import { SaleForm } from '@/components/SaleForm';
import { formatCurrency } from '@/lib/utils';
import { getClientDisplayName, getClientDocument, getClientDocumentLabel } from '@/lib/clientUtils';

interface AuditSaleDetailsProps {
  sale: any;
  onApprove: (saleId: string, notes: string) => void;
  onReject: (saleId: string, notes: string) => void;
  isUpdating: boolean;
}

export const AuditSaleDetails: React.FC<AuditSaleDetailsProps> = ({
  sale,
  onApprove,
  onReject,
  isUpdating
}) => {
  const [notes, setNotes] = useState('');
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [informationRequest, setInformationRequest] = useState('');
  const { toast } = useToast();

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'borrador':
        return <Badge variant="outline" className="text-yellow-600"><Clock className="w-3 h-3 mr-1" />Borrador</Badge>;
      case 'enviado':
        return <Badge variant="outline" className="text-blue-600"><AlertCircle className="w-3 h-3 mr-1" />Enviado</Badge>;
      case 'completado':
        return <Badge variant="outline" className="text-green-600"><CheckCircle className="w-3 h-3 mr-1" />Completado</Badge>;
      case 'cancelado':
        return <Badge variant="outline" className="text-red-600"><XCircle className="w-3 h-3 mr-1" />Cancelado</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const handleRequestInformation = () => {
    if (!informationRequest.trim()) {
      toast({
        title: "Error",
        description: "Por favor ingresa la información solicitada",
        variant: "destructive"
      });
      return;
    }

    toast({
      title: "Solicitud enviada",
      description: "Se ha enviado la solicitud de información al vendedor",
    });
    setInformationRequest('');
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h3 className="text-xl font-semibold">Detalles de la Venta</h3>
          {getStatusBadge(sale.status)}
        </div>
        <div className="flex gap-2">
          <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm">
                <Edit className="w-4 h-4 mr-2" />
                Editar Venta
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-4xl">
              <DialogHeader>
                <DialogTitle>Editar Venta</DialogTitle>
              </DialogHeader>
              <SaleForm
                open={showEditDialog}
                onOpenChange={setShowEditDialog}
                sale={sale}
              />
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Información del Cliente */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Información del Cliente</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label className="text-sm font-medium text-muted-foreground">Nombre</Label>
              <p className="text-sm font-medium">
                {sale.clients ? getClientDisplayName(sale.clients) : 'No asignado'}
              </p>
            </div>
            <div>
              <Label className="text-sm font-medium text-muted-foreground">Email</Label>
              <p className="text-sm">{sale.clients?.email || 'No especificado'}</p>
            </div>
            <div>
              <Label className="text-sm font-medium text-muted-foreground">Teléfono</Label>
              <p className="text-sm">{sale.clients?.phone || 'No especificado'}</p>
            </div>
            <div>
              <Label className="text-sm font-medium text-muted-foreground">{getClientDocumentLabel(sale.clients)}</Label>
              <p className="text-sm">{getClientDocument(sale.clients) || 'No especificado'}</p>
            </div>
          </CardContent>
        </Card>

        {/* Información del Plan */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Información del Plan</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label className="text-sm font-medium text-muted-foreground">Plan</Label>
              <p className="text-sm font-medium">{sale.plans?.name || 'No asignado'}</p>
            </div>
            <div>
              <Label className="text-sm font-medium text-muted-foreground">Precio Titular</Label>
              <p className="text-sm">
                {formatCurrency(Number(
                  sale.beneficiaries?.find((b: any) => b.is_primary)?.amount || sale.plans?.price || 0
                ))}
              </p>
            </div>
            <div>
              <Label className="text-sm font-medium text-muted-foreground">Monto Total</Label>
              <p className="text-sm font-semibold">
                {formatCurrency(Number(sale.total_amount || 0))}
              </p>
            </div>
            <div>
              <Label className="text-sm font-medium text-muted-foreground">Contrato #</Label>
              <p className="text-sm">{sale.contract_number || 'No asignado'}</p>
            </div>
            <div>
              <Label className="text-sm font-medium text-muted-foreground">Vendedor</Label>
              <p className="text-sm">
                {sale.salesperson ? `${sale.salesperson.first_name} ${sale.salesperson.last_name}` : 'No asignado'}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Información Laboral */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Información Laboral</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label className="text-sm font-medium text-muted-foreground">Lugar de Trabajo</Label>
              <p className="text-sm">{sale.workplace || 'No especificado'}</p>
            </div>
            <div>
              <Label className="text-sm font-medium text-muted-foreground">Profesión</Label>
              <p className="text-sm">{sale.profession || 'No especificada'}</p>
            </div>
            <div>
              <Label className="text-sm font-medium text-muted-foreground">Teléfono Laboral</Label>
              <p className="text-sm">{sale.work_phone || 'No especificado'}</p>
            </div>
            <div>
              <Label className="text-sm font-medium text-muted-foreground">Dirección Laboral</Label>
              <p className="text-sm">{sale.work_address || 'No especificada'}</p>
            </div>
          </CardContent>
        </Card>

        {/* Información Contractual */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Información Contractual</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label className="text-sm font-medium text-muted-foreground">Número de Contrato</Label>
              <p className="text-sm">{sale.contract_number || 'No asignado'}</p>
            </div>
            <div>
              <Label className="text-sm font-medium text-muted-foreground">Modalidad de Firma</Label>
              <p className="text-sm">{sale.signature_modality || 'No especificada'}</p>
            </div>
            <div>
              <Label className="text-sm font-medium text-muted-foreground">Prima de Maternidad</Label>
              <p className="text-sm">{sale.maternity_bonus ? 'Sí' : 'No'}</p>
            </div>
            <div>
              <Label className="text-sm font-medium text-muted-foreground">Vigencia Inmediata</Label>
              <p className="text-sm">{sale.immediate_validity ? 'Sí' : 'No'}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Notas de la Venta */}
      {sale.notes && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Notas de la Venta</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm">{sale.notes}</p>
          </CardContent>
        </Card>
      )}

      <Separator />

      {/* Solicitar Información */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <MessageSquare className="w-5 h-5" />
            Solicitar Información Adicional
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="information-request">Descripción de la información solicitada</Label>
            <Textarea
              id="information-request"
              placeholder="Describe qué información necesitas del vendedor o cliente..."
              value={informationRequest}
              onChange={(e) => setInformationRequest(e.target.value)}
              rows={3}
            />
          </div>
          <Button 
            onClick={handleRequestInformation}
            variant="outline"
            className="w-full"
          >
            <MessageSquare className="w-4 h-4 mr-2" />
            Enviar Solicitud
          </Button>
        </CardContent>
      </Card>

      {/* Acciones de Auditoría */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Acciones de Auditoría</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="audit-notes">Notas de Auditoría</Label>
            <Textarea
              id="audit-notes"
              placeholder="Agrega comentarios sobre tu decisión de auditoría..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
            />
          </div>
          
          <div className="flex gap-3">
            <Button
              onClick={() => onApprove(sale.id, notes)}
              disabled={isUpdating}
              className="flex-1 bg-green-600 hover:bg-green-700"
            >
              <CheckCircle className="w-4 h-4 mr-2" />
              {isUpdating ? "Procesando..." : "Aprobar Venta"}
            </Button>
            <Button
              onClick={() => onReject(sale.id, notes)}
              disabled={isUpdating}
              variant="destructive"
              className="flex-1"
            >
              <XCircle className="w-4 h-4 mr-2" />
              {isUpdating ? "Procesando..." : "Rechazar Venta"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
