import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { IncidentForm } from '@/components/incidents/IncidentForm';
import { Button } from '@/components/ui/button';

export default function IncidentNew() {
  const navigate = useNavigate();

  return (
    <div className="min-h-full w-full overflow-x-hidden">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-4 sm:px-6 sm:py-6 lg:px-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Nueva incidencia</h1>
            <p className="max-w-3xl text-sm text-muted-foreground">
              Reporta el problema con contexto claro para que el analisis y la resolucion sean mas rapidos.
            </p>
          </div>

          <Button type="button" variant="outline" onClick={() => navigate('/incidents')} className="w-full sm:w-auto">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Volver
          </Button>
        </div>

        <section className="w-full min-w-0 rounded-lg border border-border bg-card p-4 shadow-sm sm:p-6">
          <IncidentForm
            onSuccess={(id) => navigate(`/incidents/${id}`)}
            onCancel={() => navigate('/incidents')}
          />
        </section>
      </div>
    </div>
  );
}
