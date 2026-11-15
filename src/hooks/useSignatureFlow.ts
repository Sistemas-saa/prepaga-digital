
import { useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useCreateSignature, useCompleteSignature } from '@/hooks/useSignature';
import { getClientDisplayName, getClientDocument, getClientDocumentLabel } from '@/lib/clientUtils';

export const useSignatureFlow = () => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const { toast } = useToast();
  const createSignature = useCreateSignature();
  const completeSignature = useCompleteSignature();

  const processSignature = async (
    saleData: any,
    signatureData: string,
    documentId: string
  ) => {
    setIsProcessing(true);
    try {
      setCurrentStep(1); // Guardando firma
      
      // 1. Guardar la firma
      await createSignature.mutateAsync({
        saleId: saleData.id,
        documentId: documentId,
        signatureData: signatureData,
      });

      setCurrentStep(2); // Obteniendo respuestas del cuestionario

      // 2. Obtener respuestas del cuestionario si existe template
      let questionnaireResponses: Record<string, any> = {};
      if (saleData.template_id) {
        const { data: responses, error: responsesError } = await supabase
          .from('template_responses')
          .select(`
            question_id,
            response_value,
            template_questions(question_text, question_type)
          `)
          .eq('template_id', saleData.template_id)
          .eq('sale_id', saleData.id);

        if (!responsesError && responses) {
          questionnaireResponses = responses.reduce((acc: Record<string, any>, response: any) => {
            const question = response.template_questions;
            if (question) {
              acc[response.question_id] = {
                question: question.question_text,
                answer: response.response_value,
                question_type: question.question_type
              };
            }
            return acc;
          }, {});
        }
      }

      setCurrentStep(3); // Generando documento PDF

      // 3. Generar contenido HTML para el PDF
      const htmlContent = generateContractHTML({
        sale: saleData,
        client: saleData.clients,
        plan: saleData.plans,
        signatures: [{
          signature_data: signatureData,
          signed_at: new Date().toISOString(),
          document_id: documentId,
        }],
        questionnaire_responses: questionnaireResponses,
      });

      setCurrentStep(4); // Creando PDF

      // 4. Generar PDF usando edge function
      const { data: pdfBlob, error: pdfError } = await supabase.functions.invoke('generate-pdf', {
        body: {
          htmlContent,
          filename: `Contrato-${saleData.clients?.first_name}-${saleData.clients?.last_name}.pdf`
        }
      });

      if (pdfError) throw pdfError;

      setCurrentStep(5); // Guardando documento

      // 5. Subir PDF a Storage
      const fileName = `contracts/${saleData.id}-signed.pdf`;
      const { error: uploadError } = await supabase.storage
        .from('documents')
        .upload(fileName, pdfBlob, {
          contentType: 'application/pdf',
          upsert: true
        });

      if (uploadError) throw uploadError;

      setCurrentStep(6); // Finalizando

      // 6. Actualizar venta con URL del documento firmado
      const { error: updateError } = await supabase
        .from('sales')
        .update({
          signed_document_url: fileName,
          status: 'firmado'
        })
        .eq('id', saleData.id);

      if (updateError) throw updateError;

      // 7. Completar el proceso de firma
      await completeSignature.mutateAsync(saleData.id);

      toast({
        title: "Proceso completado",
        description: "El documento ha sido firmado y guardado exitosamente.",
      });

      return { success: true, documentUrl: fileName };
    } catch (error: any) {
      console.error('Error en proceso de firma:', error);
      toast({
        title: "Error",
        description: error.message || "Error al procesar la firma.",
        variant: "destructive",
      });
      return { success: false, error: error.message };
    } finally {
      setIsProcessing(false);
      setCurrentStep(0);
    }
  };

  const generateContractHTML = (data: any) => {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Contrato de Seguro</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 20px; line-height: 1.6; }
          .header { text-align: center; margin-bottom: 30px; }
          .client-info { margin: 20px 0; }
          .plan-info { margin: 20px 0; }
          .signature-section { margin-top: 40px; border-top: 1px solid #ccc; padding-top: 20px; }
          .signature-image { max-width: 200px; height: auto; }
          .questionnaire { margin: 20px 0; }
          .question { margin: 10px 0; }
          .answer { font-weight: bold; color: #2563eb; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>CONTRATO DE SEGURO</h1>
          <p>Fecha: ${new Date().toLocaleDateString()}</p>
        </div>

        <div class="client-info">
          <h2>Información del Cliente</h2>
          <p><strong>Nombre:</strong> ${getClientDisplayName(data.client)}</p>
          <p><strong>Email:</strong> ${data.client?.email}</p>
          <p><strong>Teléfono:</strong> ${data.client?.phone || 'N/A'}</p>
          <p><strong>${getClientDocumentLabel(data.client)}:</strong> ${getClientDocument(data.client) || 'N/A'}</p>
        </div>

        <div class="plan-info">
          <h2>Plan Contratado</h2>
          <p><strong>Plan:</strong> ${data.plan?.name}</p>
          <p><strong>Precio:</strong> ${Number(data.plan?.price || 0).toLocaleString()} Gs.</p>
          <p><strong>Descripción:</strong> ${data.plan?.description || 'N/A'}</p>
        </div>

        ${Object.keys(data.questionnaire_responses || {}).length > 0 ? `
        <div class="questionnaire">
          <h2>Respuestas del Cuestionario</h2>
          ${Object.values(data.questionnaire_responses).map((response: any) => `
            <div class="question">
              <p><strong>Pregunta:</strong> ${response.question}</p>
              <p class="answer">Respuesta: ${response.answer}</p>
            </div>
          `).join('')}
        </div>
        ` : ''}

        <div class="signature-section">
          <h2>Firmas</h2>
          ${data.signatures.map((sig: any) => `
            <div>
              <p><strong>Firmado el:</strong> ${new Date(sig.signed_at).toLocaleString()}</p>
              <div>
                <img src="${sig.signature_data}" alt="Firma" class="signature-image" />
              </div>
            </div>
          `).join('')}
        </div>

        <div style="margin-top: 40px; text-align: center; font-size: 12px; color: #666;">
          <p>Este documento ha sido generado digitalmente y es válido sin firma manuscrita.</p>
          <p>Documento generado el ${new Date().toLocaleString()}</p>
        </div>
      </body>
      </html>
    `;
  };

  return {
    processSignature,
    isProcessing,
    currentStep,
  };
};
