
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { UserPlus, Pencil, Trash2, Mail, Phone, Search, FilterX } from "lucide-react";
import { ClientForm } from "@/components/ClientForm";
import { useClients, useDeleteClient } from "@/hooks/useClients";
import { Database } from "@/integrations/supabase/types";
import { useSimpleAuthContext } from "@/components/SimpleAuthProvider";
import { formatDateOnly } from "@/lib/dateOnly";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger } from
"@/components/ui/alert-dialog";

type Client = Database['public']['Tables']['clients']['Row'];

export function ClientsList() {
  const [showClientForm, setShowClientForm] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [emailFilter, setEmailFilter] = useState<"all" | "with" | "without">("all");
  const [phoneFilter, setPhoneFilter] = useState<"all" | "with" | "without">("all");
  const { user, profile, userRole } = useSimpleAuthContext();
  const { data: clients = [], isLoading } = useClients();
  const deleteClient = useDeleteClient();

  const handleEditClient = (client: Client) => {
    setEditingClient(client);
    setShowClientForm(true);
  };

  const handleDeleteClient = async (clientId: string) => {
    await deleteClient.mutateAsync(clientId);
  };

  const handleCloseForm = () => {
    setShowClientForm(false);
    setEditingClient(null);
  };

  const filteredClients = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();

    return clients.filter((client) => {
      const fullName = `${client.first_name || ''} ${client.last_name || ''}`.trim().toLowerCase();
      const email = (client.email || '').toLowerCase();
      const phone = (client.phone || '').toLowerCase();
      const dni = (client.dni || '').toLowerCase();

      const matchesSearch =
        normalizedSearch.length === 0 ||
        fullName.includes(normalizedSearch) ||
        email.includes(normalizedSearch) ||
        phone.includes(normalizedSearch) ||
        dni.includes(normalizedSearch);

      const hasEmail = Boolean(client.email && client.email.trim().length > 0);
      const hasPhone = Boolean(client.phone && client.phone.trim().length > 0);
      const matchesEmail = emailFilter === "all" || (emailFilter === "with" ? hasEmail : !hasEmail);
      const matchesPhone = phoneFilter === "all" || (phoneFilter === "with" ? hasPhone : !hasPhone);

      return matchesSearch && matchesEmail && matchesPhone;
    });
  }, [clients, searchTerm, emailFilter, phoneFilter]);

  const clearFilters = () => {
    setSearchTerm("");
    setEmailFilter("all");
    setPhoneFilter("all");
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-gray-900"></div>
      </div>);

  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          
          <p className="text-muted-foreground">
            Gestiona la información de tus clientes
          </p>
        </div>
        <Button onClick={() => setShowClientForm(true)}>
          <UserPlus className="mr-2 h-4 w-4" />
          Agregar Cliente
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Lista de Clientes</CardTitle>
          <CardDescription>
            Mostrando {filteredClients.length} de {clients.length} cliente{clients.length !== 1 ? 's' : ''} registrado{clients.length !== 1 ? 's' : ''}
          </CardDescription>
          {clients.length === 0 && user && !profile?.company_id && userRole !== 'super_admin' &&
          <p className="text-sm text-amber-600">
              Tu usuario no tiene `company_id` en `profiles`. Con RLS activo no podrás ver clientes hasta corregirlo.
            </p>
          }
        </CardHeader>
        <CardContent>
          <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-4">
            <div className="relative md:col-span-2">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar por nombre, email, teléfono o DNI/CI"
                className="pl-9"
              />
            </div>
            <Select value={emailFilter} onValueChange={(value: "all" | "with" | "without") => setEmailFilter(value)}>
              <SelectTrigger>
                <SelectValue placeholder="Filtrar por email" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Email: todos</SelectItem>
                <SelectItem value="with">Con email</SelectItem>
                <SelectItem value="without">Sin email</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex gap-2">
              <Select value={phoneFilter} onValueChange={(value: "all" | "with" | "without") => setPhoneFilter(value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Filtrar por teléfono" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Teléfono: todos</SelectItem>
                  <SelectItem value="with">Con teléfono</SelectItem>
                  <SelectItem value="without">Sin teléfono</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" onClick={clearFilters} title="Limpiar filtros">
                <FilterX className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Teléfono</TableHead>
                <TableHead>DNI/CI</TableHead>
                <TableHead>Fecha Nac.</TableHead>
                <TableHead>Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredClients.map((client) =>
              <TableRow key={client.id}>
                  <TableCell className="font-medium">
                    {client.first_name} {client.last_name}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center space-x-2">
                      <Mail className="h-4 w-4 text-muted-foreground" />
                      <span>{client.email}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    {client.phone ?
                  <div className="flex items-center space-x-2">
                        <Phone className="h-4 w-4 text-muted-foreground" />
                        <span>{client.phone}</span>
                      </div> :

                  '-'
                  }
                  </TableCell>
                  <TableCell>{client.dni || '-'}</TableCell>
                  <TableCell>{formatDateOnly(client.birth_date, 'es-PY')}</TableCell>
                  <TableCell>
                    <div className="flex space-x-2">
                      <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleEditClient(client)}>
                      
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="destructive" size="sm">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>¿Eliminar cliente?</AlertDialogTitle>
                            <AlertDialogDescription>
                              Esta acción no se puede deshacer. Se eliminará permanentemente el cliente "{client.first_name} {client.last_name}".
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction
                            onClick={() => handleDeleteClient(client.id)}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                            
                              Eliminar
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>

          {clients.length === 0 &&
          <div className="text-center py-8">
              <p className="text-muted-foreground">No hay clientes registrados</p>
              <Button className="mt-4" onClick={() => setShowClientForm(true)}>
                <UserPlus className="mr-2 h-4 w-4" />
                Registrar primer cliente
              </Button>
            </div>
          }
          {clients.length > 0 && filteredClients.length === 0 && (
            <div className="text-center py-8">
              <p className="text-muted-foreground">No se encontraron clientes con esos filtros</p>
              <Button className="mt-4" variant="outline" onClick={clearFilters}>
                Limpiar filtros
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <ClientForm
        open={showClientForm}
        onOpenChange={handleCloseForm}
        client={editingClient} />
      
    </div>);

}
