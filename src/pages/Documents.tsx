
import React, { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useDocument, useDocumentsList, useDocuments } from "@/hooks/useDocuments";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Plus, FileText, Search, Download, ChevronDown, ChevronRight, Eye, Trash2, ChevronsLeft, ChevronsRight } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useSalesLookup } from "@/hooks/useSales";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { DocumentPreview } from "@/components/DocumentPreview";
import { useNavigate } from "react-router-dom";
import { getDocumentAccessUrl } from "@/lib/assetUrlHelper";

interface SaleGroup {
  saleId: string;
  contractNumber: string;
  clientName: string;
  planName: string;
  saleStatus: string;
  documents: any[];
}

type NormalizedDocumentType = "contrato" | "ddjj_salud" | "anexo";

const normalizeDocumentType = (document: {
  document_type?: string | null;
  name?: string | null;
}): NormalizedDocumentType => {
  const rawType = (document.document_type || "").toLowerCase();
  const rawName = (document.name || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  if (
    rawType === "ddjj_salud" ||
    rawType.includes("ddjj") ||
    rawName.includes("ddjj") ||
    rawName.includes("declaracion jurada")
  ) {
    return "ddjj_salud";
  }

  if (
    rawType === "contrato" ||
    rawType === "contract" ||
    rawType.includes("contrato") ||
    rawName.includes("contrato")
  ) {
    return "contrato";
  }

  return "anexo";
};

const getDocumentTypeLabel = (document: {
  document_type?: string | null;
  name?: string | null;
}) => {
  const normalizedType = normalizeDocumentType(document);

  if (normalizedType === "ddjj_salud") {
    return "DDJJ Salud";
  }

  if (normalizedType === "contrato") {
    return "Contrato";
  }

  return "Anexo";
};

const Documents: React.FC = () => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null);
  const [expandedSales, setExpandedSales] = useState<Set<string>>(new Set());

  // Form state
  const [docName, setDocName] = useState("");
  const [docType, setDocType] = useState("contract");
  const [docContent, setDocContent] = useState("");
  const [docSaleId, setDocSaleId] = useState("");

  const {
    data: documentPage,
    isLoading,
    error: documentsError,
  } = useDocumentsList({ page, pageSize: 25, search });
  const { createDocument, deleteDocument } = useDocuments();
  const { data: sales } = useSalesLookup(showCreateForm);
  const {
    data: selectedDocument,
    isLoading: isLoadingSelectedDocument,
    error: selectedDocumentError,
  } = useDocument(selectedDocumentId);

  useEffect(() => {
    setPage(1);
  }, [search]);

  useEffect(() => {
    const firstDocument = documentPage?.documents?.[0];
    if (!firstDocument) {
      setSelectedDocumentId(null);
      return;
    }

    const selectedStillVisible = documentPage.documents.some((document) => document.id === selectedDocumentId);
    if (!selectedDocumentId || !selectedStillVisible) {
      setSelectedDocumentId(firstDocument.id);
    }
  }, [documentPage, selectedDocumentId]);

  // Group documents by sale
  const groupedBySale = useMemo(() => {
    if (!documentPage?.documents) return [];

    const groups: Record<string, SaleGroup> = {};

    for (const doc of documentPage.documents) {
      const sale = doc.sales as any;
      const saleId = doc.sale_id;

      if (!groups[saleId]) {
        groups[saleId] = {
          saleId,
          contractNumber: sale?.contract_number || `VTA-${saleId.slice(-6)}`,
          clientName: sale?.clients
            ? `${sale.clients.first_name} ${sale.clients.last_name}`
            : "Sin cliente",
          planName: sale?.plans?.name || "Sin plan",
          saleStatus: sale?.status || "desconocido",
          documents: [],
        };
      }

      groups[saleId].documents.push({
        ...doc,
        normalizedDocumentType: normalizeDocumentType(doc),
        documentTypeLabel: getDocumentTypeLabel(doc),
      });
    }

    return Object.values(groups);
  }, [documentPage]);

  const toggleSale = (saleId: string) => {
    setExpandedSales((prev) => {
      const next = new Set(prev);
      if (next.has(saleId)) next.delete(saleId);
      else next.add(saleId);
      return next;
    });
  };

  const handleCreateDocument = () => {
    setShowCreateForm(true);
    setDocName("");
    setDocType("contract");
    setDocContent("");
    setDocSaleId("");
  };

  const handleSubmitDocument = (e: React.FormEvent) => {
    e.preventDefault();
    if (!docName.trim() || !docSaleId) {
      toast({ title: "Error", description: "Nombre y venta son requeridos", variant: "destructive" });
      return;
    }
    createDocument({
      name: docName,
      document_type: docType,
      content: docContent,
      sale_id: docSaleId,
      status: "pendiente" as const,
    });
    setShowCreateForm(false);
  };

  const getStatusBadge = (status: string) => {
    const map: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
      borrador: { label: "Borrador", variant: "secondary" },
      pendiente: { label: "Pendiente", variant: "outline" },
      enviado: { label: "Enviado", variant: "default" },
      firmado: { label: "Firmado", variant: "default" },
      completado: { label: "Completado", variant: "default" },
      cancelado: { label: "Cancelado", variant: "destructive" },
    };
    const info = map[status] || { label: status, variant: "secondary" as const };
    return <Badge variant={info.variant}>{info.label}</Badge>;
  };

  const getDocStatusBadge = (status: string | null) => {
    if (!status) return null;
    const map: Record<string, { label: string; className: string }> = {
      pendiente: { label: "Pendiente", className: "bg-amber-100 text-amber-800" },
      firmado: { label: "Firmado", className: "bg-green-100 text-green-800" },
      draft: { label: "Borrador", className: "bg-muted text-muted-foreground" },
    };
    const info = map[status] || { label: status, className: "bg-muted text-muted-foreground" };
    return <Badge className={info.className}>{info.label}</Badge>;
  };

  const totalDocs = documentPage?.total || 0;

  const openDocumentFile = async (fileUrl: string | null | undefined) => {
    if (!fileUrl) {
      toast({
        title: "Documento sin archivo",
        description: "Este documento no tiene un archivo descargable asociado.",
        variant: "destructive",
      });
      return;
    }

    const accessUrl = await getDocumentAccessUrl(fileUrl);
    if (!accessUrl) {
      toast({
        title: "Error",
        description: "No se pudo abrir el documento.",
        variant: "destructive",
      });
      return;
    }

    window.open(accessUrl, "_blank", "noopener,noreferrer");
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="animate-pulse">
          <div className="h-8 bg-muted rounded mb-4" />
          <div className="h-64 bg-muted rounded" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Documentos</h1>
          <p className="text-muted-foreground">
            {totalDocs} documentos · página {documentPage?.page || 1} de {documentPage?.totalPages || 1}
          </p>
        </div>
        <Button onClick={handleCreateDocument} className="flex items-center gap-2">
          <Plus className="h-4 w-4" />
          Nuevo Documento
        </Button>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por nombre de documento..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10"
        />
      </div>

      {(documentsError || selectedDocumentError) && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="space-y-1">
            {documentsError && (
              <p>
                Error cargando documentos: {(documentsError as Error).message}
              </p>
            )}
            {selectedDocumentError && (
              <p>
                Error cargando vista previa: {(selectedDocumentError as Error).message}
              </p>
            )}
          </AlertDescription>
        </Alert>
      )}

      {/* Grouped documents */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <div className="lg:col-span-3 space-y-3">
          {groupedBySale.length > 0 ? (
            groupedBySale.map((group) => {
              const isExpanded = expandedSales.has(group.saleId);
              return (
                <Card key={group.saleId}>
                  <Collapsible open={isExpanded} onOpenChange={() => toggleSale(group.saleId)}>
                    <CollapsibleTrigger asChild>
                      <CardHeader className="cursor-pointer hover:bg-muted/30 transition-colors py-3 px-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            {isExpanded ? (
                              <ChevronDown className="h-4 w-4 text-muted-foreground" />
                            ) : (
                              <ChevronRight className="h-4 w-4 text-muted-foreground" />
                            )}
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-semibold text-sm">{group.contractNumber}</span>
                                {getStatusBadge(group.saleStatus)}
                              </div>
                              <p className="text-sm text-muted-foreground">
                                {group.clientName} · {group.planName}
                              </p>
                            </div>
                          </div>
                          <Badge variant="outline" className="text-xs">
                            {group.documents.length} doc{group.documents.length !== 1 ? "s" : ""}
                          </Badge>
                        </div>
                      </CardHeader>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <CardContent className="pt-0 pb-3 px-4">
                        <div className="space-y-2 border-t pt-3">
                          {group.documents.map((doc: any) => (
                            <div
                              key={doc.id}
                              className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-colors ${
                                  selectedDocumentId === doc.id
                                  ? "border-primary bg-primary/5"
                                  : "hover:bg-muted/50"
                              }`}
                              onClick={() => setSelectedDocumentId(doc.id)}
                            >
                              <div className="flex items-center gap-3 min-w-0">
                                <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                                <div className="min-w-0">
                                  <p className="text-sm font-medium truncate">{doc.name}</p>
                                  <p className="text-xs text-muted-foreground">
                                    {doc.documentTypeLabel} · {new Date(doc.created_at).toLocaleDateString()}
                                  </p>
                                </div>
                              </div>
                              <div className="flex items-center gap-2 flex-shrink-0">
                                {getDocStatusBadge(doc.status)}
                                {doc.file_url && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7"
                                    onClick={async (e) => {
                                      e.stopPropagation();
                                      await openDocumentFile(doc.file_url);
                                    }}
                                  >
                                    <Download className="h-3.5 w-3.5" />
                                  </Button>
                                )}
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 text-destructive hover:text-destructive"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (confirm("¿Eliminar este documento?")) {
                                      deleteDocument(doc.id);
                                      if (selectedDocumentId === doc.id) setSelectedDocumentId(null);
                                    }
                                  }}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </div>
                          ))}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="w-full text-xs"
                            onClick={() => navigate(`/sales/${group.saleId}`)}
                          >
                            <Eye className="h-3.5 w-3.5 mr-1" />
                            Ver Venta
                          </Button>
                        </div>
                      </CardContent>
                    </CollapsibleContent>
                  </Collapsible>
                </Card>
              );
            })
          ) : (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                No hay documentos disponibles
              </CardContent>
            </Card>
          )}

          {documentPage && documentPage.totalPages > 1 && (
            <div className="flex items-center justify-between pt-2">
              <p className="text-sm text-muted-foreground">
                Mostrando {(page - 1) * documentPage.pageSize + 1}
                {" - "}
                {Math.min(page * documentPage.pageSize, documentPage.total)} de {documentPage.total}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page === 1}
                  onClick={() => setPage((prev) => Math.max(prev - 1, 1))}
                >
                  <ChevronsLeft className="h-4 w-4 mr-1" />
                  Anterior
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= documentPage.totalPages}
                  onClick={() => setPage((prev) => Math.min(prev + 1, documentPage.totalPages))}
                >
                  Siguiente
                  <ChevronsRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Preview panel */}
        <div className="lg:col-span-2">
          <Card className="sticky top-4">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">
                {selectedDocument ? selectedDocument.name : "Vista previa"}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoadingSelectedDocument ? (
                <p className="text-center py-8 text-muted-foreground text-sm">
                  Cargando documento...
                </p>
              ) : selectedDocument ? (
                <div className="space-y-3">
                  <div className="text-sm space-y-1">
                    <p><span className="text-muted-foreground">Tipo:</span> {getDocumentTypeLabel(selectedDocument)}</p>
                    <p><span className="text-muted-foreground">Estado:</span> {selectedDocument.status}</p>
                    <p><span className="text-muted-foreground">Creado:</span> {new Date(selectedDocument.created_at).toLocaleString()}</p>
                  </div>
                  {selectedDocument.content && (
                    <DocumentPreview
                      content={selectedDocument.content}
                      dynamicFields={[]}
                      templateType={normalizeDocumentType(selectedDocument)}
                      templateName={selectedDocument.name || "documento"}
                    />
                  )}
                  {selectedDocument.file_url && (
                    <Button
                      className="w-full"
                      onClick={() => void openDocumentFile(selectedDocument.file_url)}
                    >
                      <Download className="h-4 w-4 mr-2" />
                      Descargar Documento
                    </Button>
                  )}
                </div>
              ) : (
                <p className="text-center py-8 text-muted-foreground text-sm">
                  Selecciona un documento para ver la vista previa
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Create Document Dialog */}
      <Dialog open={showCreateForm} onOpenChange={setShowCreateForm}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Crear Nuevo Documento</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmitDocument} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="docName">Nombre del Documento *</Label>
              <Input
                id="docName"
                value={docName}
                onChange={(e) => setDocName(e.target.value)}
                placeholder="Ingrese el nombre del documento"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="docSaleId">Venta Asociada *</Label>
              {sales && sales.length > 0 ? (
                <Select value={docSaleId} onValueChange={setDocSaleId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecciona una venta" />
                  </SelectTrigger>
                  <SelectContent>
                    {sales.map((sale) => (
                      <SelectItem key={sale.id} value={sale.id}>
                        {sale.contract_number || `VTA-${sale.id.slice(-4)}`} - {sale.clients?.first_name} {sale.clients?.last_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    No hay ventas disponibles. Primero debes crear una venta.
                  </AlertDescription>
                </Alert>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="docType">Tipo de Documento</Label>
              <Select value={docType} onValueChange={setDocType}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona el tipo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="contract">Contrato</SelectItem>
                  <SelectItem value="policy">Póliza</SelectItem>
                  <SelectItem value="declaration">Declaración</SelectItem>
                  <SelectItem value="report">Reporte</SelectItem>
                  <SelectItem value="certificate">Certificado</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="docContent">Contenido</Label>
              <Textarea
                id="docContent"
                value={docContent}
                onChange={(e) => setDocContent(e.target.value)}
                placeholder="Ingrese el contenido del documento"
                rows={6}
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowCreateForm(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={!docSaleId}>
                Crear Documento
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Documents;
