
import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Checkbox } from '@/components/ui/checkbox';
import { AlertCircle, HeartPulse, CheckCircle, Clock, Save, ChevronLeft, ChevronRight } from 'lucide-react';
import { useBeneficiaries } from '@/hooks/useBeneficiaries';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

interface SaleDDJJTabProps {
  saleId?: string;
}

const HEALTH_QUESTIONS = [
  '1. ¿Padece alguna enfermedad crónica (diabetes, hipertensión, asma, EPOC, reumatológicas, tiroideas, insuficiencia renal u otras)?',
  '2. ¿Padece o ha padecido alguna enfermedad o trastorno mental o neurológico (ansiedad, depresión, convulsiones u otros)?',
  '3. ¿Padece o ha padecido enfermedad cardiovascular o coronaria, o se ha sometido a procedimientos (marcapasos, bypass, cateterismo, etc.)?',
  '4. ¿Posee o ha poseído quistes, tumores o enfermedades oncológicas que hayan requerido cirugía, quimioterapia o radioterapia?',
  '5. ¿Ha sido internado/a o sometido/a a alguna cirugía?',
  '6. ¿Consume medicamentos, sustancias o se somete a tratamientos, de origen médico, natural o experimental?',
  '7. Otras enfermedades o condiciones no mencionadas',
];

const HABITS = ['Fuma', 'Vapea', 'Consume bebidas alcohólicas'];

interface BeneficiaryHealthData {
  peso: string;
  altura: string;
  answers: ('si' | 'no' | '')[];
  details: string[];
  habits: boolean[];
  lastMenstruation: string;
  saved: boolean;
}

const createEmptyData = (): BeneficiaryHealthData => ({
  peso: '',
  altura: '',
  answers: new Array(HEALTH_QUESTIONS.length).fill(''),
  details: new Array(HEALTH_QUESTIONS.length).fill(''),
  habits: new Array(HABITS.length).fill(false),
  lastMenstruation: '',
  saved: false,
});

const normalizeDDJJPlaceholder = (value?: string | null): string => {
  if (!value) return '';
  let normalized = value.trim();
  if (normalized.startsWith('{{') && normalized.endsWith('}}')) {
    normalized = normalized.slice(2, -2).trim();
  }
  if (normalized.startsWith('respuestas.')) {
    normalized = normalized.replace(/^respuestas\./, '');
  }
  return normalized;
};

const parseExistingData = (detail: string | null, hasPreexisting: boolean | null): BeneficiaryHealthData => {
  const data = createEmptyData();
  if (!detail && !hasPreexisting) return data;

  if (detail) {
    const parts = detail.split('; ');
    for (const part of parts) {
      const qMatch = HEALTH_QUESTIONS.findIndex(q => part.startsWith(q));
      if (qMatch >= 0) {
        data.answers[qMatch] = 'si';
        const colonIdx = part.indexOf(': ', HEALTH_QUESTIONS[qMatch].length - 5);
        if (colonIdx >= 0) {
          data.details[qMatch] = part.substring(colonIdx + 2);
        }
        continue;
      }
      if (part.startsWith('Hábitos: ')) {
        const habitList = part.replace('Hábitos: ', '').split(', ');
        HABITS.forEach((h, i) => { if (habitList.includes(h)) data.habits[i] = true; });
        continue;
      }
      if (part.startsWith('Última menstruación/embarazo: ')) {
        data.lastMenstruation = part.replace('Última menstruación/embarazo: ', '');
        continue;
      }
      if (part.startsWith('Peso: ')) {
        data.peso = part.replace('Peso: ', '').replace(' kg', '');
        continue;
      }
      if (part.startsWith('Estatura: ')) {
        data.altura = part.replace('Estatura: ', '').replace(' cm', '');
        continue;
      }
    }
  }

  if (hasPreexisting !== null) {
    data.answers = data.answers.map(a => a || 'no') as ('si' | 'no' | '')[];
    data.saved = true;
  }

  return data;
};

// Virtual titular type for when no is_primary beneficiary exists
interface VirtualTitular {
  id: string; // will be 'virtual-titular'
  first_name: string;
  last_name: string;
  dni: string | null;
  is_primary: boolean;
  relationship: string | null;
  has_preexisting_conditions: boolean | null;
  preexisting_conditions_detail: string | null;
  created_at: string | null;
  isVirtual: true;
}

const SaleDDJJTab: React.FC<SaleDDJJTabProps> = ({ saleId }) => {
  const { data: beneficiaries, isLoading } = useBeneficiaries(saleId || '');
  const queryClient = useQueryClient();
  const [healthData, setHealthData] = useState<Record<string, BeneficiaryHealthData>>({});
  const [currentStep, setCurrentStep] = useState(0);
  const [initialized, setInitialized] = useState(false);

  // Fetch the sale's client data for virtual titular
  const { data: saleClient } = useQuery({
    queryKey: ['sale-client-for-ddjj', saleId],
    queryFn: async () => {
      const { data: sale } = await supabase
        .from('sales')
        .select('client_id')
        .eq('id', saleId!)
        .single();
      if (!sale?.client_id) return null;
      const { data: client } = await supabase
        .from('clients')
        .select('first_name, last_name, dni, birth_date, gender, marital_status, phone, email, address, city, province, postal_code')
        .eq('id', sale.client_id)
        .single();
      return client ? { ...client, clientId: sale.client_id } : null;
    },
    enabled: !!saleId,
  });

  // Check if there's already a primary beneficiary
  const hasPrimaryBeneficiary = useMemo(() => {
    return beneficiaries?.some(b => b.is_primary) ?? false;
  }, [beneficiaries]);

  // Build the combined list: virtual titular (from client) if no is_primary exists, then adherents
  const sortedBeneficiaries = useMemo(() => {
    if (!beneficiaries) return [];

    const realBeneficiaries = [...beneficiaries].sort((a, b) => {
      if (a.is_primary && !b.is_primary) return -1;
      if (!a.is_primary && b.is_primary) return 1;
      return new Date(a.created_at || '').getTime() - new Date(b.created_at || '').getTime();
    });

    // If no primary beneficiary exists, prepend a virtual titular from the client
    if (!hasPrimaryBeneficiary && saleClient) {
      const virtualTitular: VirtualTitular = {
        id: 'virtual-titular',
        first_name: saleClient.first_name,
        last_name: saleClient.last_name,
        dni: saleClient.dni,
        is_primary: true,
        relationship: null,
        has_preexisting_conditions: null,
        preexisting_conditions_detail: null,
        created_at: null,
        isVirtual: true,
      };
      return [virtualTitular as any, ...realBeneficiaries];
    }

    return realBeneficiaries;
  }, [beneficiaries, hasPrimaryBeneficiary, saleClient]);

  // Initialize health data from DB
  useEffect(() => {
    if (!beneficiaries || beneficiaries.length === 0 || initialized) {
      // Also init virtual titular if needed
      if (!initialized && !hasPrimaryBeneficiary && saleClient && !healthData['virtual-titular']) {
        setHealthData(prev => ({ ...prev, 'virtual-titular': createEmptyData() }));
      }
      if (beneficiaries && beneficiaries.length > 0 && !initialized) {
        const initial: Record<string, BeneficiaryHealthData> = {};
        for (const b of beneficiaries) {
          initial[b.id] = parseExistingData(b.preexisting_conditions_detail, b.has_preexisting_conditions);
        }
        if (!hasPrimaryBeneficiary && saleClient) {
          initial['virtual-titular'] = createEmptyData();
        }
        setHealthData(initial);
        setInitialized(true);
      }
      return;
    }
    const initial: Record<string, BeneficiaryHealthData> = {};
    for (const b of beneficiaries) {
      initial[b.id] = parseExistingData(b.preexisting_conditions_detail, b.has_preexisting_conditions);
    }
    if (!hasPrimaryBeneficiary && saleClient) {
      initial['virtual-titular'] = createEmptyData();
    }
    setHealthData(initial);
    setInitialized(true);
  }, [beneficiaries, initialized, hasPrimaryBeneficiary, saleClient]);

  // Reset initialized when saleId changes
  useEffect(() => {
    setInitialized(false);
    setCurrentStep(0);
  }, [saleId]);

  const getData = (id: string) => healthData[id] || createEmptyData();

  const update = (id: string, patch: Partial<BeneficiaryHealthData>) => {
    setHealthData(prev => ({
      ...prev,
      [id]: { ...getData(id), ...prev[id], ...patch },
    }));
  };

  const setAnswer = (id: string, idx: number, val: 'si' | 'no') => {
    const d = getData(id);
    const answers = [...d.answers];
    answers[idx] = val;
    const details = [...d.details];
    if (val === 'no') details[idx] = '';
    update(id, { answers, details });
  };

  const setDetail = (id: string, idx: number, val: string) => {
    const d = getData(id);
    const details = [...d.details];
    details[idx] = val;
    update(id, { details });
  };

  const toggleHabit = (id: string, idx: number) => {
    const d = getData(id);
    const habits = [...d.habits];
    habits[idx] = !habits[idx];
    update(id, { habits });
  };

  const isComplete = (id: string): boolean => {
    const d = getData(id);
    return d.answers.every(a => a !== '') && d.saved;
  };

  const saveMutation = useMutation({
    mutationFn: async (beneficiaryId: string) => {
      const d = getData(beneficiaryId);

      const unanswered = d.answers.filter(a => a === '').length;
      if (unanswered > 0) {
        throw new Error(`Debe responder todas las preguntas (${unanswered} sin responder)`);
      }

      const hasPreexisting = d.answers.some(a => a === 'si') || d.habits.some(h => h);

      const detailParts: string[] = [];
      HEALTH_QUESTIONS.forEach((q, i) => {
        if (d.answers[i] === 'si') {
          detailParts.push(`${q}: ${d.details[i] || 'Sí'}`);
        }
      });
      const activeHabits = HABITS.filter((_, i) => d.habits[i]);
      if (activeHabits.length) detailParts.push(`Hábitos: ${activeHabits.join(', ')}`);
      if (d.lastMenstruation) detailParts.push(`Última menstruación/embarazo: ${d.lastMenstruation}`);
      if (d.peso) detailParts.push(`Peso: ${d.peso} kg`);
      if (d.altura) detailParts.push(`Estatura: ${d.altura} cm`);

      // If this is a virtual titular, create the beneficiary first
      if (beneficiaryId === 'virtual-titular') {
        if (!saleClient || !saleId) throw new Error('No se encontró el cliente de la venta');

        const { data: newBeneficiary, error: createError } = await supabase
          .from('beneficiaries')
          .insert({
            sale_id: saleId,
            first_name: saleClient.first_name,
            last_name: saleClient.last_name,
            dni: saleClient.dni,
            birth_date: saleClient.birth_date,
            gender: (saleClient as any).gender ?? null,
            marital_status: (saleClient as any).marital_status ?? null,
            phone: saleClient.phone,
            email: saleClient.email,
            address: saleClient.address,
            city: saleClient.city,
            province: saleClient.province,
            postal_code: saleClient.postal_code,
            is_primary: true,
            relationship: 'Titular',
            has_preexisting_conditions: hasPreexisting,
            preexisting_conditions_detail: detailParts.length > 0 ? detailParts.join('; ') : null,
          })
          .select()
          .single();

        if (createError) throw createError;

        // Move health data from virtual to real ID
        return { realId: newBeneficiary.id, wasVirtual: true };
      }

      // Normal update for existing beneficiaries
      const { error } = await supabase
        .from('beneficiaries')
        .update({
          has_preexisting_conditions: hasPreexisting,
          preexisting_conditions_detail: detailParts.length > 0 ? detailParts.join('; ') : null,
        })
        .eq('id', beneficiaryId);
      if (error) throw error;
      return { realId: beneficiaryId, wasVirtual: false };
    },
    onSuccess: async (result) => {
      const d = getData(result.wasVirtual ? 'virtual-titular' : result.realId);

      // Update health data immediately — keep virtual-titular key so isComplete works
      // before beneficiaries refetch replaces the sorted list
      if (result.wasVirtual) {
        setHealthData(prev => {
          const virtualData = prev['virtual-titular'];
          const next = { ...prev };
          // Keep virtual-titular marked as saved so stepper stays unlocked
          if (virtualData) {
            next['virtual-titular'] = { ...virtualData, saved: true };
            next[result.realId] = { ...virtualData, saved: true };
          }
          return next;
        });
      } else {
        setHealthData(prev => ({
          ...prev,
          [result.realId]: { ...prev[result.realId], saved: true },
        }));
      }

      // Show toast immediately (before template sync which can fail silently)
      toast.success('DDJJ de Salud guardada correctamente');

      // Auto-advance to next beneficiary step
      setCurrentStep(s => Math.min(s + 1, sortedBeneficiaries.length - 1));

      // Invalidate queries to refetch beneficiaries
      queryClient.invalidateQueries({ queryKey: ['beneficiaries'] });

      // Sync DDJJ answers to template_responses for template engine interpolation
      try {
        if (saleId) {
          const { data: saleTemplateRows } = await supabase
            .from('sale_templates')
            .select('template_id, templates:template_id(name)')
            .eq('sale_id', saleId);

          const ddjjTemplateIds = (saleTemplateRows || [])
            .filter((row: any) => {
              const norm = (row.templates?.name || '')
                .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
              return norm.includes('ddjj') || norm.includes('declaracion');
            })
            .map((row: any) => row.template_id)
            .filter(Boolean);

          if (ddjjTemplateIds.length > 0) {
            const { data: ddjiQuestions } = await supabase
              .from('template_questions')
              .select('id, template_id, placeholder_name, sort_order')
              .in('template_id', ddjjTemplateIds)
              .order('sort_order');

            if (ddjiQuestions && ddjiQuestions.length > 0) {
              const responseRows = ddjiQuestions.map((q: any) => {
                const placeholderName = normalizeDDJJPlaceholder(q.placeholder_name);
                let responseValue = '';
                if (placeholderName.startsWith('ddjj_pregunta_')) {
                  const idx = parseInt(placeholderName.replace('ddjj_pregunta_', '')) - 1;
                  responseValue = d.answers[idx] === 'si'
                    ? `Sí${d.details[idx] ? ': ' + d.details[idx] : ''}`
                    : d.answers[idx] === 'no' ? 'No' : '';
                } else if (placeholderName === 'ddjj_peso') {
                  responseValue = d.peso || '';
                } else if (placeholderName === 'ddjj_altura') {
                  responseValue = d.altura || '';
                } else if (placeholderName === 'ddjj_fuma') {
                  responseValue = d.habits[0] ? 'Sí' : 'No';
                } else if (placeholderName === 'ddjj_vapea') {
                  responseValue = d.habits[1] ? 'Sí' : 'No';
                } else if (placeholderName === 'ddjj_alcohol') {
                  responseValue = d.habits[2] ? 'Sí' : 'No';
                } else if (placeholderName === 'ddjj_menstruacion') {
                  responseValue = d.lastMenstruation || 'N/A';
                }

                return {
                  sale_id: saleId,
                  template_id: (q as any).template_id,
                  question_id: q.id,
                  response_value: responseValue,
                };
              });

              const { error: syncError } = await supabase.from('template_responses').upsert(
                responseRows,
                { onConflict: 'sale_id,template_id,question_id', ignoreDuplicates: false }
              );

              if (syncError && syncError.code !== '42501') {
                console.error('Template sync error:', syncError);
              }
            }
          }
        }
      } catch (e) {
        console.error('Template sync error:', e);
      }
    },
    onError: (e: any) => toast.error(e.message || 'Error al guardar'),
  });

  if (!saleId) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <AlertCircle className="h-12 w-12 text-muted-foreground mb-4" />
        <h3 className="text-lg font-semibold mb-2">Guarde la venta primero</h3>
        <p className="text-muted-foreground">Debe guardar la venta antes de gestionar las DDJJ de Salud.</p>
      </div>
    );
  }

  if (isLoading) {
    return <div className="text-center py-8 text-muted-foreground">Cargando datos de salud...</div>;
  }

  if (sortedBeneficiaries.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <Clock className="h-8 w-8 mx-auto mb-2" />
        No se encontró un cliente asociado a esta venta. Seleccione un cliente en la pestaña Básico.
      </div>
    );
  }

  const currentBeneficiary = sortedBeneficiaries[currentStep];
  if (!currentBeneficiary) return null;

  const d = getData(currentBeneficiary.id);
  const hasAny = d.answers.some(a => a === 'si') || d.habits.some(h => h);
  const canGoNext = currentStep < sortedBeneficiaries.length - 1 && isComplete(currentBeneficiary.id);
  const canGoPrev = currentStep > 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 mb-2">
        <HeartPulse className="h-5 w-5" />
        <h3 className="text-lg font-semibold">Declaración Jurada de Salud - SAMAP</h3>
      </div>
      <p className="text-sm text-muted-foreground">
        Complete la DDJJ de salud de forma secuencial. Primero el titular, luego cada adherente.
      </p>

      {/* Progress stepper */}
      <div className="flex items-center gap-2 flex-wrap">
        {sortedBeneficiaries.map((b: any, idx: number) => {
          const completed = isComplete(b.id);
          const isCurrent = idx === currentStep;
          const isLocked = idx > 0 && !isComplete(sortedBeneficiaries[idx - 1].id);
          return (
            <button
              key={b.id}
              onClick={() => !isLocked && setCurrentStep(idx)}
              disabled={isLocked}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                isCurrent
                  ? 'bg-primary text-primary-foreground'
                  : completed
                    ? 'bg-primary/20 text-primary cursor-pointer'
                    : isLocked
                      ? 'bg-muted text-muted-foreground cursor-not-allowed opacity-50'
                      : 'bg-muted text-muted-foreground cursor-pointer'
              }`}
            >
              {completed && <CheckCircle className="h-3 w-3" />}
              {b.is_primary ? 'Titular' : b.relationship || `Adherente ${idx}`}: {b.first_name}
            </button>
          );
        })}
      </div>

      {/* Current beneficiary form */}
      <Card className="border">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {currentBeneficiary.has_preexisting_conditions || hasAny ? (
                <AlertCircle className="h-5 w-5 text-destructive" />
              ) : (
                <CheckCircle className="h-5 w-5 text-primary" />
              )}
              <div>
                <CardTitle className="text-base">
                  {currentBeneficiary.first_name} {currentBeneficiary.last_name}
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                  {currentBeneficiary.is_primary ? 'Titular' : currentBeneficiary.relationship || 'Adherente'}{' '}
                  {currentBeneficiary.dni ? `• C.I.: ${currentBeneficiary.dni}` : ''}
                  {' '}— Paso {currentStep + 1} de {sortedBeneficiaries.length}
                </p>
              </div>
            </div>
            <Badge variant={hasAny || currentBeneficiary.has_preexisting_conditions ? 'destructive' : 'default'}>
              {hasAny || currentBeneficiary.has_preexisting_conditions ? 'Con preexistencias' : 'Sin preexistencias'}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          {HEALTH_QUESTIONS.map((question, idx) => (
            <div key={idx} className="space-y-2 border-b pb-4 last:border-b-0">
              <Label className="text-sm font-medium leading-tight">{question}</Label>
              <RadioGroup
                value={d.answers[idx] || ''}
                onValueChange={(val) => setAnswer(currentBeneficiary.id, idx, val as 'si' | 'no')}
                className="flex gap-6"
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="si" id={`${currentBeneficiary.id}-q${idx}-si`} />
                  <Label htmlFor={`${currentBeneficiary.id}-q${idx}-si`} className="cursor-pointer font-normal">SÍ</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="no" id={`${currentBeneficiary.id}-q${idx}-no`} />
                  <Label htmlFor={`${currentBeneficiary.id}-q${idx}-no`} className="cursor-pointer font-normal">NO</Label>
                </div>
              </RadioGroup>
              {d.answers[idx] === 'si' && (
                <Textarea
                  placeholder="Especificar..."
                  value={d.details[idx] || ''}
                  onChange={(e) => setDetail(currentBeneficiary.id, idx, e.target.value)}
                  className="text-sm"
                  rows={2}
                />
              )}
            </div>
          ))}

          <div className="space-y-2 border-b pb-4">
            <Label className="text-sm font-medium">Hábitos:</Label>
            <div className="flex flex-wrap gap-4">
              {HABITS.map((habit, idx) => (
                <div key={idx} className="flex items-center space-x-2">
                  <Checkbox
                    id={`${currentBeneficiary.id}-habit-${idx}`}
                    checked={d.habits[idx] || false}
                    onCheckedChange={() => toggleHabit(currentBeneficiary.id, idx)}
                  />
                  <label htmlFor={`${currentBeneficiary.id}-habit-${idx}`} className="text-sm cursor-pointer">
                    {habit}
                  </label>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-2 border-b pb-4">
            <Label className="text-sm font-medium">Fecha de última menstruación o embarazo (si corresponde):</Label>
            <Input
              type="date"
              placeholder="Seleccione fecha o deje vacío si N/A"
              value={d.lastMenstruation || ''}
              onChange={(e) => update(currentBeneficiary.id, { lastMenstruation: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Peso (kg)</Label>
              <Input
                type="number"
                placeholder="Ej: 70"
                value={d.peso}
                onChange={(e) => update(currentBeneficiary.id, { peso: e.target.value })}
              />
            </div>
            <div>
              <Label>Estatura (cm)</Label>
              <Input
                type="number"
                placeholder="Ej: 170"
                value={d.altura}
                onChange={(e) => update(currentBeneficiary.id, { altura: e.target.value })}
              />
            </div>
          </div>

          <p className="text-xs text-muted-foreground italic">
            Declaro que los datos precedentes son fieles a la verdad y me comprometo a informar cualquier modificación en mi estado de salud.
          </p>

          <Button
            onClick={() => saveMutation.mutate(currentBeneficiary.id)}
            disabled={saveMutation.isPending}
            className="w-full"
          >
            <Save className="h-4 w-4 mr-2" />
            Guardar DDJJ de {currentBeneficiary.first_name}
          </Button>

          {/* Navigation */}
          <div className="flex justify-between pt-2">
            <Button
              variant="outline"
              onClick={() => setCurrentStep(s => s - 1)}
              disabled={!canGoPrev}
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              Anterior
            </Button>
            <Button
              variant="outline"
              onClick={() => setCurrentStep(s => s + 1)}
              disabled={!canGoNext}
            >
              Siguiente
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default SaleDDJJTab;
