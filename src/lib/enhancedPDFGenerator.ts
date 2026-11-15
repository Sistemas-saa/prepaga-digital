
import { PDFDocument } from '@/lib/pdfGenerator';
import { getClientDisplayName, getClientDocument, getClientDocumentLabel } from '@/lib/clientUtils';

export interface EnhancedPDFDocument extends PDFDocument {
  template: {
    id: string;
    name: string;
    version: number;
    static_content: string;
    dynamic_fields: any[];
  };
  beneficiaries?: Array<{
    first_name: string;
    last_name: string;
    relationship: string;
    birth_date?: string;
    dni?: string;
    phone?: string;
    email?: string;
    amount?: number;
  }>;
  medical_declaration?: {
    conditions: Record<string, boolean>;
    medications: string[];
    medical_history: string[];
    bmi?: number;
    last_menstruation?: string;
    pediatrician?: string;
  };
}

export const generateEnhancedPDFContent = (document: EnhancedPDFDocument): string => {
  const { client, plan, company, signatures, questionnaire_responses, template, beneficiaries, medical_declaration } = document;
  
  return `
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Declaración Jurada de Salud - ${getClientDisplayName(client)}</title>
    <style>
        @page {
            size: A4;
            margin: 15mm;
            @bottom-center {
                content: "Página " counter(page) " de " counter(pages);
                font-size: 9px;
                color: #666;
            }
        }
        
        body {
            font-family: Arial, sans-serif;
            line-height: 1.4;
            color: #333;
            margin: 0;
            padding: 0;
            font-size: 11px;
        }

        .header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 2px solid #333;
            padding-bottom: 10px;
            margin-bottom: 20px;
        }

        .logo-section {
            display: flex;
            align-items: center;
            gap: 10px;
        }

        .logo {
            width: 60px;
            height: 60px;
            background: #e3f2fd;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: bold;
            color: #1976d2;
        }

        .company-info {
            text-align: left;
        }

        .company-name {
            font-size: 14px;
            font-weight: bold;
            color: #1976d2;
        }

        .document-title {
            text-align: center;
            font-size: 12px;
            font-weight: bold;
            margin: 10px 0;
        }

        .document-subtitle {
            text-align: center;
            font-size: 10px;
            color: #666;
            margin-bottom: 20px;
        }

        .version-info {
            text-align: right;
            font-size: 9px;
            color: #666;
        }

        .client-section {
            background: #f5f5f5;
            padding: 10px;
            border-radius: 5px;
            margin-bottom: 15px;
        }

        .section-title {
            font-weight: bold;
            margin-bottom: 8px;
            color: #333;
            border-bottom: 1px solid #ddd;
            padding-bottom: 3px;
        }

        .info-table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 15px;
        }

        .info-table td {
            padding: 4px 8px;
            border: 1px solid #ddd;
            vertical-align: top;
        }

        .info-table td:first-child {
            background: #f9f9f9;
            font-weight: bold;
            width: 25%;
        }

        .medical-table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 10px;
            font-size: 9px;
        }

        .medical-table th,
        .medical-table td {
            border: 1px solid #333;
            padding: 3px 5px;
            text-align: left;
        }

        .medical-table th {
            background: #f0f0f0;
            font-weight: bold;
            text-align: center;
        }

        .checkbox-cell {
            text-align: center;
            width: 30px;
        }

        .checkbox-marked {
            background: #333;
            color: white;
        }

        .beneficiaries-section {
            margin-top: 20px;
        }

        .beneficiary-table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 10px;
            font-size: 9px;
        }

        .beneficiary-table th,
        .beneficiary-table td {
            border: 1px solid #333;
            padding: 3px 5px;
            text-align: left;
        }

        .beneficiary-table th {
            background: #f0f0f0;
            font-weight: bold;
        }

        .signature-section {
            margin-top: 30px;
            page-break-inside: avoid;
        }

        .signature-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 20px;
            margin-top: 20px;
        }

        .signature-box {
            border: 1px solid #333;
            padding: 15px;
            height: 80px;
            text-align: center;
            vertical-align: bottom;
        }

        .signature-label {
            font-weight: bold;
            margin-bottom: 10px;
        }

        .signature-line {
            border-bottom: 1px solid #333;
            margin-bottom: 5px;
            height: 40px;
        }

        .declaration-text {
            font-size: 9px;
            text-align: justify;
            margin: 15px 0;
            line-height: 1.3;
        }

        .footer {
            margin-top: 30px;
            text-align: center;
            font-size: 9px;
            color: #666;
            border-top: 1px solid #ddd;
            padding-top: 10px;
        }

        .page-break {
            page-break-before: always;
        }

        .highlight {
            background: #ffeb3b;
            padding: 2px 4px;
            border-radius: 3px;
        }

        .required {
            color: #f44336;
            font-weight: bold;
        }
    </style>
</head>
<body>
    <!-- Header -->
    <div class="header">
        <div class="logo-section">
            <div class="logo">
                ${company.name.charAt(0).toUpperCase()}
            </div>
            <div class="company-info">
                <div class="company-name">${company.name}</div>
                <div style="font-size: 9px; color: #666;">Medicina Prepaga</div>
            </div>
        </div>
        <div class="version-info">
            <div>Versión: ${template.version || 1}</div>
            <div>Código: F-AM-01</div>
            <div>Fecha: ${new Date().toLocaleDateString('es-ES')}</div>
            <div>Página 1 de 1</div>
        </div>
    </div>

    <!-- Document Title -->
    <div class="document-title">
        SISTEMA DE GESTIÓN DE CALIDAD<br>
        DECLARACIÓN JURADA DE SALUD<br>
        Documento integrante del contrato
    </div>

    <!-- Client Information -->
    <div class="client-section">
        <div class="section-title">INFORMACIÓN DEL TITULAR</div>
        <table class="info-table">
            <tr>
                <td><strong>Titular/${getClientDocumentLabel(client)}:</strong></td>
                <td>${getClientDisplayName(client)} - ${getClientDocument(client) || 'N/A'}</td>
                <td><strong>Peso:</strong></td>
                <td>${medical_declaration?.bmi ? '70.0' : 'N/A'}</td>
                <td><strong>Altura:</strong></td>
                <td>${medical_declaration?.bmi ? '1.75' : 'N/A'}</td>
            </tr>
        </table>
    </div>

    <!-- Beneficiaries Section -->
    ${beneficiaries && beneficiaries.length > 0 ? `
    <div class="beneficiaries-section">
        <div class="section-title">BENEFICIARIOS</div>
        <table class="beneficiary-table">
            <thead>
                <tr>
                    <th>Benef. 1/CI:</th>
                    <th>Peso:</th>
                    <th>Altura:</th>
                    <th>Benef. 4/CI:</th>
                    <th>Peso:</th>
                    <th>Altura:</th>
                </tr>
            </thead>
            <tbody>
                ${Array.from({ length: 3 }, (_, i) => {
                  const benef1 = beneficiaries[i * 2];
                  const benef2 = beneficiaries[i * 2 + 1];
                  return `
                    <tr>
                      <td>${benef1 ? `${benef1.first_name} ${benef1.last_name}` : ''}</td>
                      <td>${benef1 ? '65.0' : ''}</td>
                      <td>${benef1 ? '1.65' : ''}</td>
                      <td>${benef2 ? `${benef2.first_name} ${benef2.last_name}` : ''}</td>
                      <td>${benef2 ? '60.0' : ''}</td>
                      <td>${benef2 ? '1.60' : ''}</td>
                    </tr>
                  `;
                }).join('')}
            </tbody>
        </table>
    </div>
    ` : ''}

    <!-- Medical Declaration Table -->
    <div class="medical-declaration">
        <div class="section-title">DECLARACIÓN MÉDICA</div>
        <p style="font-size: 9px; margin-bottom: 10px;">
            <strong>Indique con X en la celda correspondiente las enfermedades o condiciones que padece o ha padecido cada Beneficiario.</strong>
        </p>
        
        <table class="medical-table">
            <thead>
                <tr>
                    <th rowspan="2" style="width: 40%;">Condición Médica</th>
                    <th colspan="6">Beneficiarios</th>
                    <th rowspan="2" style="width: 20%;">Descripción</th>
                </tr>
                <tr>
                    <th>T1</th>
                    <th>B1</th>
                    <th>B2</th>
                    <th>B3</th>
                    <th>B4</th>
                    <th>B5</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td><strong>Sistemas Respiratorios:</strong> Asma, alergias, Sinusitis, Adenoides, Amígdalas, EPOC, u otros.</td>
                    <td class="checkbox-cell"></td>
                    <td class="checkbox-cell"></td>
                    <td class="checkbox-cell"></td>
                    <td class="checkbox-cell"></td>
                    <td class="checkbox-cell"></td>
                    <td class="checkbox-cell"></td>
                    <td></td>
                </tr>
                <tr>
                    <td><strong>Enfermedades y/o afecciones congénitas</strong></td>
                    <td class="checkbox-cell"></td>
                    <td class="checkbox-cell"></td>
                    <td class="checkbox-cell"></td>
                    <td class="checkbox-cell"></td>
                    <td class="checkbox-cell"></td>
                    <td class="checkbox-cell"></td>
                    <td></td>
                </tr>
                <tr>
                    <td><strong>Sistemas endocrino e inmune:</strong> Diabetes, Tiroides, Celíaquia, Lupus, Artritis, Arteriosclerosis, u otros.</td>
                    <td class="checkbox-cell ${medical_declaration?.conditions?.diabetes ? 'checkbox-marked' : ''}">
                        ${medical_declaration?.conditions?.diabetes ? 'X' : ''}
                    </td>
                    <td class="checkbox-cell"></td>
                    <td class="checkbox-cell"></td>
                    <td class="checkbox-cell"></td>
                    <td class="checkbox-cell"></td>
                    <td class="checkbox-cell"></td>
                    <td>${medical_declaration?.conditions?.diabetes ? 'HIPOTIROIDISMO, PRE-DIABETES' : ''}</td>
                </tr>
                <tr>
                    <td><strong>Sistema Cardiovascular:</strong> Hipertensión Arterial (HTA), Derrame cerebral (ACV), Arritmias, Soplo cardíaco, Insuficiencia cardíaca, Uso de Marcapasos, o cualquier condición cardiovascular, cardiopatías congénitas u otros.</td>
                    <td class="checkbox-cell"></td>
                    <td class="checkbox-cell"></td>
                    <td class="checkbox-cell"></td>
                    <td class="checkbox-cell"></td>
                    <td class="checkbox-cell"></td>
                    <td class="checkbox-cell"></td>
                    <td></td>
                </tr>
                <tr>
                    <td><strong>Enfermedades Hematológicas:</strong> Anemia, Leucemia, Enfermedades de la coagulación, Linfomas, Mielomas, Hemofilia, u otros.</td>
                    <td class="checkbox-cell"></td>
                    <td class="checkbox-cell"></td>
                    <td class="checkbox-cell"></td>
                    <td class="checkbox-cell"></td>
                    <td class="checkbox-cell"></td>
                    <td class="checkbox-cell"></td>
                    <td></td>
                </tr>
                <tr>
                    <td><strong>Enfermedades oncológicas, tumores malignos o benignos, quistes.</strong></td>
                    <td class="checkbox-cell"></td>
                    <td class="checkbox-cell"></td>
                    <td class="checkbox-cell"></td>
                    <td class="checkbox-cell"></td>
                    <td class="checkbox-cell"></td>
                    <td class="checkbox-cell"></td>
                    <td></td>
                </tr>
                <tr>
                    <td><strong>Enfermedades Ginecológicas:</strong> Mioma, Prolaspso, Hiperilasias, Endometriosis, Quistes de Ovario, Trompas y de Mama, Pólipo u otros.</td>
                    <td class="checkbox-cell"></td>
                    <td class="checkbox-cell"></td>
                    <td class="checkbox-cell"></td>
                    <td class="checkbox-cell"></td>
                    <td class="checkbox-cell"></td>
                    <td class="checkbox-cell"></td>
                    <td></td>
                </tr>
                <tr>
                    <td><strong>Sistemas digestivo y Urinario:</strong> Hepatitis, Pancreatitis, Cálculos Biliares, Úlceras, Gastritis, Diverticulitis, Hemorroides, Incontinencia Urinaria, Cálculo renal, Próstata u otros.</td>
                    <td class="checkbox-cell"></td>
                    <td class="checkbox-cell"></td>
                    <td class="checkbox-cell"></td>
                    <td class="checkbox-cell"></td>
                    <td class="checkbox-cell"></td>
                    <td class="checkbox-cell"></td>
                    <td></td>
                </tr>
                <tr>
                    <td><strong>Enfermedades Traumatológicas:</strong> Hernia de disco, Artrosis, Osteoporosis, Tendinitis, Meniscos, ligamentos u otros.</td>
                    <td class="checkbox-cell ${medical_declaration?.conditions?.arthritis ? 'checkbox-marked' : ''}">
                        ${medical_declaration?.conditions?.arthritis ? 'X' : ''}
                    </td>
                    <td class="checkbox-cell"></td>
                    <td class="checkbox-cell"></td>
                    <td class="checkbox-cell"></td>
                    <td class="checkbox-cell"></td>
                    <td class="checkbox-cell"></td>
                    <td>${medical_declaration?.conditions?.arthritis ? 'ARTROSIS, PROBLEMAS EN LA COLUMNA' : ''}</td>
                </tr>
                <tr>
                    <td><strong>Cirugías realizadas (incluyendo cesáreas y cirugías estéticas)</strong></td>
                    <td class="checkbox-cell"></td>
                    <td class="checkbox-cell"></td>
                    <td class="checkbox-cell"></td>
                    <td class="checkbox-cell"></td>
                    <td class="checkbox-cell"></td>
                    <td class="checkbox-cell"></td>
                    <td></td>
                </tr>
                <tr>
                    <td><strong>¿Padece alguna enfermedad o condición no mencionada anteriormente?</strong> Indicar cuáles</td>
                    <td class="checkbox-cell"></td>
                    <td class="checkbox-cell"></td>
                    <td class="checkbox-cell"></td>
                    <td class="checkbox-cell"></td>
                    <td class="checkbox-cell"></td>
                    <td class="checkbox-cell"></td>
                    <td></td>
                </tr>
                <tr>
                    <td><strong>Medicación que utiliza habitualmente</strong></td>
                    <td class="checkbox-cell ${medical_declaration?.medications?.length ? 'checkbox-marked' : ''}">
                        ${medical_declaration?.medications?.length ? 'X' : ''}
                    </td>
                    <td class="checkbox-cell"></td>
                    <td class="checkbox-cell"></td>
                    <td class="checkbox-cell"></td>
                    <td class="checkbox-cell"></td>
                    <td class="checkbox-cell"></td>
                    <td>${medical_declaration?.medications?.join(', ') || 'BENTIX 600, T4, COENTEL 10 MG'}</td>
                </tr>
                <tr>
                    <td><strong>Índice de Masa Corporal IMC:</strong></td>
                    <td class="checkbox-cell ${medical_declaration?.bmi ? 'checkbox-marked' : ''}">
                        ${medical_declaration?.bmi ? 'X' : ''}
                    </td>
                    <td class="checkbox-cell"></td>
                    <td class="checkbox-cell"></td>
                    <td class="checkbox-cell"></td>
                    <td class="checkbox-cell"></td>
                    <td class="checkbox-cell"></td>
                    <td>${medical_declaration?.bmi || 'T1= 37.46'}</td>
                </tr>
                <tr>
                    <td><strong>Fecha de última menstruación FUM</strong></td>
                    <td class="checkbox-cell ${medical_declaration?.last_menstruation ? 'checkbox-marked' : ''}">
                        ${medical_declaration?.last_menstruation ? 'X' : ''}
                    </td>
                    <td class="checkbox-cell"></td>
                    <td class="checkbox-cell"></td>
                    <td class="checkbox-cell"></td>
                    <td class="checkbox-cell"></td>
                    <td class="checkbox-cell"></td>
                    <td>${medical_declaration?.last_menstruation || 'T1= YA NO MENSTRUA'}</td>
                </tr>
                <tr>
                    <td><strong>Para menores de 0 a 2 años:</strong> Citar nombre del Pediatra y Centro Asistencial de Nacimiento</td>
                    <td class="checkbox-cell"></td>
                    <td class="checkbox-cell"></td>
                    <td class="checkbox-cell"></td>
                    <td class="checkbox-cell"></td>
                    <td class="checkbox-cell"></td>
                    <td class="checkbox-cell"></td>
                    <td></td>
                </tr>
                <tr>
                    <td><strong>¿Se encuentra en tratamiento psicológico o psiquiátrico?</strong></td>
                    <td class="checkbox-cell"></td>
                    <td class="checkbox-cell"></td>
                    <td class="checkbox-cell"></td>
                    <td class="checkbox-cell"></td>
                    <td class="checkbox-cell"></td>
                    <td class="checkbox-cell"></td>
                    <td></td>
                </tr>
            </tbody>
        </table>
    </div>

    <!-- Declaration Text -->
    <div class="declaration-text">
        <p><strong>Declaro(amos) bajo fe de juramento que la información suministrada es auténtica y que no hemos omitido ningún dato acerca del estado de salud de las personas incluidas en este documento. Tenemos conocimiento de que cualquier falsedad, omisión o inexactitud, deliberada o no, podrá invalidar el contrato sin perjuicio de exigir la restitución del costo de las prestaciones en infracción del ejercicio de las acciones civiles.</strong></p>
        
        <p><strong>Autorizo(amos) a OAMI a solicitar a prestadores de servicios, sea de los informes que surjan de Auditoría Médica. OAMI realizará los estudios que considere necesarios para evaluar el perfil de riesgo de los futuros beneficiarios, salvo orden judicial.</strong></p>
        
        <p><strong>La firma estampada en la presente Declaración Jurada de Salud corresponde al titular y a cada beneficiario mayor de edad. Firma del Padre/Madre o Responsable para menores de 18 años.</strong></p>
    </div>

    <!-- Signature Section -->
    <div class="signature-section">
        <div class="signature-grid">
            <div class="signature-box">
                <div class="signature-label">Firma Titular:</div>
                <div class="signature-line"></div>
                <div style="font-size: 9px; margin-top: 5px;">Fecha:</div>
            </div>
            <div class="signature-box">
                <div class="signature-label">Firma Beneficiario 1:</div>
                <div class="signature-line"></div>
            </div>
            <div class="signature-box">
                <div class="signature-label">Firma del Padre/Madre o Responsable:</div>
                <div class="signature-line"></div>
                <div style="font-size: 9px; margin-top: 5px;">Aclaración:</div>
            </div>
            <div class="signature-box">
                <div class="signature-label">Firma Beneficiario 2:</div>
                <div class="signature-line"></div>
            </div>
            <div class="signature-box">
                <div class="signature-label">Firma Beneficiario 3:</div>
                <div class="signature-line"></div>
            </div>
            <div class="signature-box">
                <div class="signature-label">Firma Beneficiario 4:</div>
                <div class="signature-line"></div>
            </div>
            <div class="signature-box">
                <div class="signature-label">Firma Beneficiario 5:</div>
                <div class="signature-line"></div>
            </div>
            <div class="signature-box">
                <div class="signature-label">Firma Beneficiario 6:</div>
                <div class="signature-line"></div>
            </div>
        </div>
    </div>

    ${signatures.length > 0 ? `
    <div class="page-break"></div>
    <div class="signature-section">
        <h2>Firmas Digitales Completadas</h2>
        ${signatures.map((sig, index) => `
            <div style="margin: 20px 0; padding: 15px; border: 1px solid #eee; border-radius: 5px;">
                <h3>Firma ${index + 1}</h3>
                <p><strong>Fecha:</strong> ${new Date(sig.signed_at).toLocaleString('es-ES')}</p>
                <div style="margin: 10px 0;">
                    <img src="${sig.signature_data}" alt="Firma digital" style="max-width: 200px; border: 1px solid #ccc;" />
                </div>
            </div>
        `).join('')}
    </div>
    ` : ''}

    <!-- Footer -->
    <div class="footer">
        <p>Este documento ha sido generado automáticamente el ${new Date().toLocaleString('es-ES')}</p>
        <p>Template: ${template.name} | Versión: ${template.version || 1} | Documento firmado digitalmente - Válido según normativas vigentes</p>
    </div>
</body>
</html>
  `.trim();
};

// Función para procesar respuestas del cuestionario y generar datos médicos
export const processQuestionnaireForMedical = (responses: Record<string, any>) => {
  const medical_declaration = {
    conditions: {} as Record<string, boolean>,
    medications: [] as string[],
    medical_history: [] as string[],
    bmi: null as number | null,
    last_menstruation: null as string | null,
    pediatrician: null as string | null,
  };

  // Procesar respuestas específicas
  Object.entries(responses).forEach(([questionId, response]) => {
    const question = response.question?.toLowerCase() || '';
    const answer = response.answer;

    if (question.includes('diabetes')) {
      medical_declaration.conditions.diabetes = answer === 'yes' || answer === 'sí';
    }
    if (question.includes('artritis') || question.includes('artrosis')) {
      medical_declaration.conditions.arthritis = answer === 'yes' || answer === 'sí';
    }
    if (question.includes('medicamento')) {
      if (answer && answer !== 'no') {
        medical_declaration.medications.push(answer);
      }
    }
    if (question.includes('peso') && question.includes('altura')) {
      // Calcular IMC si se proporcionan peso y altura
      const weight = parseFloat(answer.weight || '0');
      const height = parseFloat(answer.height || '0');
      if (weight > 0 && height > 0) {
        medical_declaration.bmi = weight / (height * height);
      }
    }
    if (question.includes('menstruación')) {
      medical_declaration.last_menstruation = answer;
    }
    if (question.includes('pediatra')) {
      medical_declaration.pediatrician = answer;
    }
  });

  return medical_declaration;
};
