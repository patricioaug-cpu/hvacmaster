import React, { useState, useEffect, useRef } from 'react';
import { CalculationData, CalculationResult } from './types';
import { formatBTU, formatKW, cn } from './lib/utils';
import { Calculator, Sun, Users, Monitor, Lightbulb, ArrowRight, Save, Copy, Check, History, Trash2, Edit2, FileText, ChevronLeft, AlertTriangle, AlertCircle, Plus, Trash, Map, DoorOpen, Download, Printer } from 'lucide-react';
import html2pdf from 'html2pdf.js';
import { db } from './firebase';
import { collection, addDoc, query, where, getDocs, orderBy, deleteDoc, doc, updateDoc } from 'firebase/firestore';
import { useAuth } from './AuthContext';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';

export default function ThermalCalculator() {
  const { user } = useAuth();
  const [view, setView] = useState<'calculator' | 'history' | 'report'>('calculator');
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [savedCalculations, setSavedCalculations] = useState<any[]>([]);
  const [notification, setNotification] = useState<{message: string, type: 'success' | 'error'} | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [showClimateMap, setShowClimateMap] = useState(false);
  const reportRef = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState(false);
  
  const showNotification = (message: string, type: 'success' | 'error' = 'success') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 3000);
  };
  
  const [data, setData] = useState<CalculationData>({
    type: 'residencial',
    area: 20,
    height: 2.7,
    orientation: 'N',
    wallType: 'simples',
    roofType: 'laje',
    glassType: 'simples',
    glassPercentage: 15,
    peopleCount: 2,
    equipmentCount: 1,
    lightingType: 'led',
    lightingPower: 100,
    selectedEquipments: [
      { brand: '', model: '', voltage: '220V', capacity: 0, quantity: 1, numFases: '', pipeType: '', notes: '' }
    ],
    internalEquipments: [
      { type: 'Computador', power: 150, quantity: 1 }
    ],
    airRenewal: {
      enabled: false,
      flowRate: 27,
      method: 'person'
    },
    usageHours: 8,
    peopleTurnover: 'baixa',
    insulationLevel: 'medio',
    floorType: 'laje',
    climateFactor: 1.0,
    openings: [],
    doors: []
  });

  const [result, setResult] = useState<CalculationResult | null>(null);

  useEffect(() => {
    if (view === 'history' && user) {
      fetchHistory();
    }
  }, [view, user]);

  const fetchHistory = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const q = query(
        collection(db, 'calculations'),
        where('userId', '==', user.uid),
        orderBy('createdAt', 'desc')
      );
      const snap = await getDocs(q);
      setSavedCalculations(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  const calculate = () => {
    setLoading(true);
    
    // ASHRAE/NBR 16401 logic
    const baseLoad = data.type === 'residencial' ? 100 : 150;
    let sensibleBase = data.area * baseLoad;
    
    // Fator de isolamento
    const insulationFactor = data.insulationLevel === 'baixo' ? 1.2 : data.insulationLevel === 'alto' ? 0.85 : 1.0;
    sensibleBase *= insulationFactor;

    const orientFactor = data.orientation === 'N' || data.orientation === 'O' ? 1.2 : 1.0;
    sensibleBase *= orientFactor;
    
    // Rotatividade de pessoas (aumenta carga latente e sensível por infiltração)
    const turnoverFactor = data.peopleTurnover === 'alta' ? 1.3 : data.peopleTurnover === 'media' ? 1.15 : 1.0;
    const peopleSensible = (data.peopleCount * 70) * turnoverFactor;
    const peopleLatent = (data.peopleCount * 55) * turnoverFactor;
    
    const equipLoad = (data.internalEquipments || []).reduce((acc, eq) => acc + (eq.power * eq.quantity), 0);
    const lightFactor = data.lightingType === 'incandescente' ? 1.0 : data.lightingType === 'fluorescente' ? 0.8 : 0.5;
    const lightLoad = data.lightingPower * lightFactor;
    const glassGain = (data.area * (data.glassPercentage / 100)) * 250 * orientFactor;
    
    // Horas de uso (afeta a inércia térmica - uso curto exige pulldown mais rápido)
    const usageFactor = data.usageHours < 4 ? 1.2 : data.usageHours > 12 ? 0.95 : 1.0;

    const totalSensible = (sensibleBase + peopleSensible + equipLoad + lightLoad + glassGain) * usageFactor;
    const totalLatent = peopleLatent + (data.area * 10);
    
    let renewalSensible = 0;
    let renewalLatent = 0;
    let renewalFlowTotal = 0;

    if (data.airRenewal?.enabled) {
      if (data.airRenewal.method === 'person') {
        renewalFlowTotal = data.peopleCount * data.airRenewal.flowRate;
      } else if (data.airRenewal.method === 'area') {
        renewalFlowTotal = data.area * data.airRenewal.flowRate;
      } else {
        renewalFlowTotal = data.airRenewal.flowRate;
      }

      // Estimativa de carga térmica por renovação (Delta T = 11K, Delta W = 8g/kg)
      renewalSensible = renewalFlowTotal * 3.7; // Watts
      renewalLatent = renewalFlowTotal * 6.8; // Watts
    }

    let openingsSensible = 0;
    let openingsLatent = 0;
    (data.openings || []).forEach(op => {
      const area = op.width * op.height;
      const flow = area * 0.4; // 0.4 m/s velocity (NBR 16401-3)
      openingsSensible += flow * 1.2 * 11 * 1000 / 3600; 
      openingsLatent += flow * 3000 * 0.008 * 1000 / 3600;
    });

    let doorsSensible = 0;
    let doorsLatent = 0;
    (data.doors || []).forEach(door => {
      const area = door.width * door.height;
      let factor = 1.0;
      if (door.frequency === 'media') factor = 2.8;
      if (door.frequency === 'alta') factor = 6.5;
      
      doorsSensible += (area / 1.68) * 180 * factor;
      doorsLatent += (area / 1.68) * 120 * factor;
    });

    const totalW = (totalSensible + totalLatent + renewalSensible + renewalLatent + openingsSensible + openingsLatent + doorsSensible + doorsLatent) * data.climateFactor;
    const totalBTU = totalW * 3.41214;
    const safetyMargin = 0.15;
    const finalBTU = totalBTU * (1 + safetyMargin);
    
    const recommendedRange = `${Math.floor(finalBTU / 1000) * 1000} - ${Math.ceil((finalBTU * 1.2) / 1000) * 1000} BTU/h`;
    
    const justification = `Cálculo técnico baseado na NBR 16401. Foram considerados ganhos de calor por condução na envoltória (${data.wallType}), nível de isolamento ${data.insulationLevel}, radiação solar direta na orientação ${data.orientation}, ocupação metabólica de ${data.peopleCount} pessoas com rotatividade ${data.peopleTurnover} e dissipação térmica de ${data.internalEquipments?.length || 0} tipos de equipamentos. Regime de uso de ${data.usageHours}h/dia.${data.airRenewal?.enabled ? ` Incluída renovação de ar de ${renewalFlowTotal} m³/h.` : ''}${data.openings?.length ? ` Consideradas ${data.openings.length} aberturas permanentes.` : ''}${data.doors?.length ? ` Consideradas perdas por ${data.doors.length} portas com fluxo de abertura.` : ''} Aplicado fator climático de ${data.climateFactor}x e margem de segurança normativa de 15%.`;

    const newResult: CalculationResult = {
      totalBTU: finalBTU,
      sensibleBTU: (totalSensible + renewalSensible + openingsSensible + doorsSensible) * 3.41214,
      latentBTU: (totalLatent + renewalLatent + openingsLatent + doorsLatent) * 3.41214,
      safetyMargin: 15,
      recommendedRange,
      justification,
      calculationMemory: {
        baseLoad: sensibleBase * 3.41214,
        orientFactor,
        peopleSensible: peopleSensible * 3.41214,
        peopleLatent: peopleLatent * 3.41214,
        equipLoad: equipLoad * 3.41214,
        lightLoad: lightLoad * 3.41214,
        glassGain: glassGain * 3.41214,
        totalSensible: totalSensible * 3.41214,
        totalLatent: totalLatent * 3.41214,
        renewalSensible: renewalSensible * 3.41214,
        renewalLatent: renewalLatent * 3.41214,
        openingsSensible: openingsSensible * 3.41214,
        openingsLatent: openingsLatent * 3.41214,
        doorsSensible: doorsSensible * 3.41214,
        doorsLatent: doorsLatent * 3.41214,
      }
    };

    setResult(newResult);
    setLoading(false);
    setStep(5);
  };

  const saveOrUpdateCalculation = async () => {
    if (!user || !result) return;
    setLoading(true);
    try {
      const payload = {
        userId: user.uid,
        data,
        result,
        createdAt: new Date().toISOString(),
      };

      if (editingId) {
        await updateDoc(doc(db, 'calculations', editingId), payload);
        showNotification("Cálculo atualizado com sucesso!");
      } else {
        await addDoc(collection(db, 'calculations'), payload);
        showNotification("Cálculo salvo com sucesso!");
      }
      setView('history');
    } catch (e) {
      console.error(e);
      showNotification("Erro ao salvar cálculo.", 'error');
    }
    setLoading(false);
  };

  const deleteCalculation = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'calculations', id));
      setSavedCalculations(prev => prev.filter(c => c.id !== id));
      showNotification("Cálculo excluído com sucesso!");
      setDeleteConfirmId(null);
    } catch (e) {
      console.error(e);
      showNotification("Erro ao excluir cálculo.", 'error');
    }
  };

  const editCalculation = (calc: any) => {
    let calculationData = { ...calc.data };
    // Migração de dados legados
    if (calculationData.equipmentSelection && !calculationData.selectedEquipments) {
      calculationData.selectedEquipments = [{
        brand: calculationData.equipmentSelection.brand || '',
        model: calculationData.equipmentSelection.model || '',
        voltage: calculationData.equipmentSelection.voltage || '220V',
        capacity: calculationData.equipmentSelection.capacity || 0,
        quantity: 1,
        numFases: '',
        pipeType: '',
        notes: ''
      }];
    }
    if (!calculationData.airRenewal) {
      calculationData.airRenewal = {
        enabled: false,
        flowRate: 27,
        method: 'person'
      };
    }
    if (calculationData.usageHours === undefined) calculationData.usageHours = 8;
    if (calculationData.peopleTurnover === undefined) calculationData.peopleTurnover = 'baixa';
    if (calculationData.insulationLevel === undefined) calculationData.insulationLevel = 'medio';
    if (calculationData.floorType === undefined) calculationData.floorType = 'laje';
    if (calculationData.internalEquipments === undefined) calculationData.internalEquipments = [];
    if (calculationData.climateFactor === undefined) calculationData.climateFactor = 1.0;
    if (calculationData.openings === undefined) calculationData.openings = [];
    if (calculationData.doors === undefined) calculationData.doors = [];

    setData(calculationData);
    setResult(calc.result);
    setEditingId(calc.id);
    setStep(1);
    setView('calculator');
  };

  const viewReport = (calc: any) => {
    let calculationData = { ...calc.data };
    // Migração de dados legados
    if (calculationData.equipmentSelection && !calculationData.selectedEquipments) {
      calculationData.selectedEquipments = [{
        brand: calculationData.equipmentSelection.brand || '',
        model: calculationData.equipmentSelection.model || '',
        voltage: calculationData.equipmentSelection.voltage || '220V',
        capacity: calculationData.equipmentSelection.capacity || 0,
        quantity: 1,
        numFases: '',
        pipeType: '',
        notes: ''
      }];
    }
    if (!calculationData.airRenewal) {
      calculationData.airRenewal = {
        enabled: false,
        flowRate: 27,
        method: 'person'
      };
    }
    if (calculationData.usageHours === undefined) calculationData.usageHours = 8;
    if (calculationData.peopleTurnover === undefined) calculationData.peopleTurnover = 'baixa';
    if (calculationData.insulationLevel === undefined) calculationData.insulationLevel = 'medio';
    if (calculationData.floorType === undefined) calculationData.floorType = 'laje';
    if (calculationData.internalEquipments === undefined) calculationData.internalEquipments = [];
    if (calculationData.climateFactor === undefined) calculationData.climateFactor = 1.0;
    if (calculationData.openings === undefined) calculationData.openings = [];
    if (calculationData.doors === undefined) calculationData.doors = [];

    setData(calculationData);
    setResult(calc.result);
    setView('report');
  };

  const copyToClipboard = () => {
    if (!result) return;
    
    const equipmentsText = data.selectedEquipments?.map(eq => 
      `- ${eq.quantity}x ${eq.brand} ${eq.model} (${formatBTU(eq.capacity)}) - ${eq.voltage}${eq.numFases ? ` | Fases: ${eq.numFases}` : ''}${eq.pipeType ? ` | Tubulação: ${eq.pipeType}` : ''}${eq.notes ? ` | Obs: ${eq.notes}` : ''}`
    ).join('\n') || 'Nenhum equipamento selecionado';

    const internalEquipsText = data.internalEquipments?.map(eq =>
      `- ${eq.type || 'Equipamento'}: ${eq.quantity}x ${eq.power}W`
    ).join('\n') || 'Nenhum equipamento interno';

    const openingsText = [
      ...(data.openings || []).map((op, i) => `- Vão #${i+1}: ${op.width}x${op.height}m`),
      ...(data.doors || []).map((d, i) => `- Porta #${i+1}: ${d.width}x${d.height}m (Freq: ${d.frequency})`)
    ].join('\n') || 'Nenhuma abertura/porta registrada';

    const text = `
RELATÓRIO DE DIMENSIONAMENTO TÉCNICO HVAC
-------------------------------------------
Data: ${new Date().toLocaleDateString('pt-BR')}
Ambiente: ${data.type.toUpperCase()}
Área: ${data.area} m² | Pé-direito: ${data.height} m
Orientação: ${data.orientation}
Uso: ${data.usageHours}h/dia | Rotatividade: ${data.peopleTurnover}
Isolamento: ${data.insulationLevel} | Piso: ${data.floorType}
Fator Climático: ${data.climateFactor}x

ABERTURAS E PORTAS (INFILTRAÇÃO)
${openingsText}

CARGAS INTERNAS (EQUIPAMENTOS)
${internalEquipsText}

EQUIPAMENTOS SELECIONADOS
${equipmentsText}

CARGA TÉRMICA CALCULADA
Total: ${formatBTU(result.totalBTU)} (${formatKW(result.totalBTU)})
Sensível: ${formatBTU(result.sensibleBTU)}
Latente: ${formatBTU(result.latentBTU)}

MEMÓRIA DE CÁLCULO (BTU/h)
- Carga Base (Área/Orientação): ${result.calculationMemory ? formatBTU(result.calculationMemory.baseLoad) : 'N/A'}
- Ocupação (Sensível): ${result.calculationMemory ? formatBTU(result.calculationMemory.peopleSensible) : 'N/A'}
- Ocupação (Latente): ${result.calculationMemory ? formatBTU(result.calculationMemory.peopleLatent) : 'N/A'}
- Equipamentos: ${result.calculationMemory ? formatBTU(result.calculationMemory.equipLoad) : 'N/A'}
- Iluminação: ${result.calculationMemory ? formatBTU(result.calculationMemory.lightLoad) : 'N/A'}
- Ganhos por Vidros: ${result.calculationMemory ? formatBTU(result.calculationMemory.glassGain) : 'N/A'}
- Renovação de Ar (Sensível): ${result.calculationMemory?.renewalSensible ? formatBTU(result.calculationMemory.renewalSensible) : '0 BTU/h'}
- Renovação de Ar (Latente): ${result.calculationMemory?.renewalLatent ? formatBTU(result.calculationMemory.renewalLatent) : '0 BTU/h'}
- Aberturas/Portas (Sensível): ${result.calculationMemory?.openingsSensible ? formatBTU(result.calculationMemory.openingsSensible + (result.calculationMemory.doorsSensible || 0)) : '0 BTU/h'}
- Aberturas/Portas (Latente): ${result.calculationMemory?.openingsLatent ? formatBTU(result.calculationMemory.openingsLatent + (result.calculationMemory.doorsLatent || 0)) : '0 BTU/h'}

RECOMENDAÇÃO
Faixa sugerida: ${result.recommendedRange}
Margem de segurança: ${result.safetyMargin}%

JUSTIFICATIVA TÉCNICA
${result.justification}
-------------------------------------------
Gerado por HVAC Master
    `;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const exportToPDF = () => {
    if (!reportRef.current) return;
    setExporting(true);

    const element = reportRef.current;
    
    // Temporarily force a narrower width for the export to allow for PDF margins
    const originalWidth = element.style.width;
    const originalMaxWidth = element.style.maxWidth;
    const originalPadding = element.style.padding;
    
    element.style.width = '190mm'; // 210mm (A4) - 20mm (margins)
    element.style.maxWidth = 'none';
    element.style.padding = '15mm'; // Internal padding

    const opt = {
      margin: 10,
      filename: `Relatorio_HVAC_${new Date().toISOString().split('T')[0]}.pdf`,
      image: { type: 'jpeg' as const, quality: 0.90 },
      html2canvas: { 
        scale: 1, // Reduced from 2 to 1 to prevent memory crashes on mobile/APK
        useCORS: true, 
        logging: false,
        windowWidth: 718,
        letterRendering: true
      },
      jsPDF: { 
        unit: 'mm' as const, 
        format: 'a4' as const, 
        orientation: 'portrait' as const,
        compress: true // Enable PDF compression
      }
    };

    html2pdf().set(opt).from(element).save().then(() => {
      element.style.width = originalWidth;
      element.style.maxWidth = originalMaxWidth;
      element.style.padding = originalPadding;
      setExporting(false);
    }).catch((err: any) => {
      element.style.width = originalWidth;
      element.style.maxWidth = originalMaxWidth;
      element.style.padding = originalPadding;
      console.error('Erro ao gerar PDF:', err);
      setExporting(false);
      showNotification('Erro ao gerar PDF (Memória insuficiente?)', 'error');
    });
  };

  const handlePrint = () => {
    try {
      // Focus window before printing - helps some WebViews
      window.focus();
      
      // Small delay to ensure UI is ready
      setTimeout(() => {
        if (typeof window.print === 'function') {
          window.print();
        } else {
          // Fallback for very limited WebViews
          showNotification('Recurso de impressão não disponível neste dispositivo', 'error');
        }
      }, 250);
    } catch (e) {
      console.error('Print error:', e);
      showNotification('Erro ao tentar imprimir', 'error');
    }
  };

  if (view === 'history') {
    return (
      <div className="max-w-4xl mx-auto p-4 animate-in fade-in">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <History className="w-8 h-8 text-green-500" />
            <h1 className="text-2xl font-bold">Histórico de Cálculos</h1>
          </div>
          <button onClick={() => { setView('calculator'); setEditingId(null); setStep(1); setResult(null); }} className="hvac-button flex items-center gap-2">
            <Calculator className="w-4 h-4" /> Novo Cálculo
          </button>
        </div>

        {loading ? (
          <div className="text-center py-12 text-gray-500">Carregando histórico...</div>
        ) : savedCalculations.length === 0 ? (
          <div className="hvac-card text-center py-12">
            <FileText className="w-12 h-12 text-gray-700 mx-auto mb-4" />
            <p className="text-gray-400">Nenhum cálculo salvo encontrado.</p>
          </div>
        ) : (
          <div className="grid gap-4">
            {savedCalculations.map(calc => (
              <div key={calc.id} className="hvac-card flex flex-col md:flex-row justify-between items-start md:items-center gap-4 hover:border-green-600/30 transition-all">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-bold uppercase text-green-500">{calc.data.type}</span>
                    <span className="text-xs text-gray-500">• {new Date(calc.createdAt).toLocaleDateString('pt-BR')}</span>
                  </div>
                  <div className="text-lg font-bold">{formatBTU(calc.result.totalBTU)}</div>
                  <div className="text-xs text-gray-400">{calc.data.area}m² • {calc.data.orientation}</div>
                </div>
                <div className="flex gap-2 w-full md:w-auto">
                  {deleteConfirmId === calc.id ? (
                    <div className="flex items-center gap-2 animate-in fade-in zoom-in-95">
                      <span className="text-[10px] font-bold text-red-500 uppercase">Excluir?</span>
                      <button onClick={() => deleteCalculation(calc.id)} className="p-2 bg-red-600 text-white rounded hover:bg-red-700 transition-colors">
                        Sim
                      </button>
                      <button onClick={() => setDeleteConfirmId(null)} className="p-2 bg-gray-700 text-white rounded hover:bg-gray-600 transition-colors">
                        Não
                      </button>
                    </div>
                  ) : (
                    <>
                      <button onClick={() => viewReport(calc)} className="flex-1 md:flex-none p-2 bg-green-600/10 text-green-500 rounded hover:bg-green-600/20 transition-colors" title="Ver Relatório">
                        <FileText className="w-5 h-5 mx-auto" />
                      </button>
                      <button onClick={() => editCalculation(calc)} className="flex-1 md:flex-none p-2 bg-blue-600/10 text-blue-500 rounded hover:bg-blue-600/20 transition-colors" title="Editar">
                        <Edit2 className="w-5 h-5 mx-auto" />
                      </button>
                      <button onClick={() => setDeleteConfirmId(calc.id)} className="flex-1 md:flex-none p-2 bg-red-600/10 text-red-500 rounded hover:bg-red-600/20 transition-colors" title="Excluir">
                        <Trash2 className="w-5 h-5 mx-auto" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (view === 'report' && result) {
    return (
      <div className="max-w-4xl mx-auto p-4 animate-in fade-in">
        <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 no-print gap-4">
          <button onClick={() => setView('history')} className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors">
            <ChevronLeft className="w-5 h-5" /> Voltar ao Histórico
          </button>
          <div className="flex flex-wrap justify-end gap-2">
            <button 
              onClick={handlePrint}
              className="hvac-button-outline flex items-center gap-2 text-sm"
            >
              <Printer className="w-4 h-4" />
              Imprimir
            </button>
            <button 
              onClick={exportToPDF} 
              disabled={exporting}
              className="hvac-button-outline flex items-center gap-2 text-sm"
            >
              {exporting ? <div className="w-4 h-4 border-2 border-green-500 border-t-transparent rounded-full animate-spin" /> : <Download className="w-4 h-4" />}
              {exporting ? "Gerando..." : "Exportar PDF"}
            </button>
            <button onClick={copyToClipboard} className="hvac-button flex items-center gap-2 text-sm">
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              {copied ? "Copiado!" : "Copiar Texto"}
            </button>
          </div>
        </div>

        <div className="report-container mx-auto" ref={reportRef}>
          <div className="flex justify-between items-start border-b-2 border-black pb-4 mb-8">
            <div>
              <h1 className="text-2xl font-black tracking-tighter">HVAC MASTER</h1>
              <p className="text-xs uppercase tracking-widest text-gray-600">Dimensionamento Técnico Profissional</p>
            </div>
            <div className="text-right text-xs text-gray-500">
              <p>Data: {new Date().toLocaleDateString('pt-BR')}</p>
              <p>Responsável: {user?.displayName || user?.email}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 mb-8">
            <section>
              <h2 className="text-sm font-bold border-b border-gray-300 mb-3 uppercase">Dados do Ambiente</h2>
              <div className="space-y-1 text-sm">
                <p><span className="font-semibold">Tipo:</span> {data.type.toUpperCase()}</p>
                <p><span className="font-semibold">Área:</span> {data.area} m²</p>
                <p><span className="font-semibold">Pé-direito:</span> {data.height} m</p>
                <p><span className="font-semibold">Orientação:</span> {data.orientation}</p>
                <p><span className="font-semibold">Envoltória:</span> {data.wallType} / {data.roofType}</p>
                <p><span className="font-semibold">Isolamento:</span> {data.insulationLevel.toUpperCase()}</p>
                <p><span className="font-semibold">Uso:</span> {data.usageHours}h/dia | Rotatividade: {data.peopleTurnover}</p>
                <p><span className="font-semibold">Fator Climático:</span> {data.climateFactor}x</p>
              </div>
            </section>
            <section>
              <h2 className="text-sm font-bold border-b border-gray-300 mb-3 uppercase">Equipamentos Selecionados</h2>
              <div className="space-y-3">
                {data.selectedEquipments?.map((eq, idx) => (
                  <div key={idx} className="text-sm border-b border-gray-100 pb-2 last:border-0">
                    <p className="font-semibold">{eq.quantity}x {eq.brand} - {eq.model}</p>
                    <p className="text-gray-600 text-xs">{formatBTU(eq.capacity)} • {eq.voltage}</p>
                    {(eq.numFases || eq.pipeType) && (
                      <p className="text-gray-500 text-[10px] mt-1">
                        {eq.numFases && `Fases: ${eq.numFases}`}
                        {eq.numFases && eq.pipeType && ' | '}
                        {eq.pipeType && `Tubulação: ${eq.pipeType}`}
                      </p>
                    )}
                    {eq.notes && (
                      <p className="text-gray-400 text-[10px] mt-1 italic">
                        Obs: {eq.notes}
                      </p>
                    )}
                  </div>
                ))}
                {(!data.selectedEquipments || data.selectedEquipments.length === 0) && (
                  <p className="text-sm text-gray-400 italic">Nenhum equipamento selecionado.</p>
                )}
                
                {data.selectedEquipments && data.selectedEquipments.length > 0 && (
                  <div className={cn(
                    "mt-2 p-2 rounded text-[10px] font-bold uppercase border",
                    (() => {
                      const totalCap = data.selectedEquipments.reduce((acc, eq) => acc + (eq.capacity * eq.quantity), 0);
                      if (totalCap < result.totalBTU * 0.9) return "bg-red-50 border-red-200 text-red-700";
                      if (totalCap > result.totalBTU * 1.3) return "bg-yellow-50 border-yellow-200 text-yellow-700";
                      return "bg-green-50 border-green-200 text-green-700";
                    })()
                  )}>
                    {(() => {
                      const totalCap = data.selectedEquipments.reduce((acc, eq) => acc + (eq.capacity * eq.quantity), 0);
                      if (totalCap < result.totalBTU * 0.9) return "Subdimensionado";
                      if (totalCap > result.totalBTU * 1.3) return "Sobredimensionado";
                      return "Dimensionamento Correto";
                    })()}
                  </div>
                )}
              </div>
            </section>
          </div>

          <section className="mb-8">
            <h2 className="text-sm font-bold border-b border-gray-300 mb-3 uppercase">Cargas Térmicas Internas (Equipamentos)</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2">
              {(data.internalEquipments || []).map((eq, idx) => (
                <div key={idx} className="text-sm flex justify-between border-b border-gray-100 pb-1">
                  <span>{eq.type || 'Equipamento'} ({eq.quantity}x {eq.power}W):</span>
                  <span className="font-mono">{eq.quantity * eq.power}W</span>
                </div>
              ))}
              {(data.internalEquipments || []).length === 0 && (
                <p className="text-sm text-gray-400 italic">Nenhum equipamento interno registrado.</p>
              )}
            </div>
          </section>

          {(data.openings?.length || 0) + (data.doors?.length || 0) > 0 && (
            <section className="mb-8">
              <h2 className="text-sm font-bold border-b border-gray-300 mb-3 uppercase">Aberturas e Portas (Infiltração)</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2">
                {data.openings?.map((op, idx) => (
                  <div key={`op-${idx}`} className="text-sm flex justify-between border-b border-gray-100 pb-1">
                    <span>Vão Livre #{idx + 1} ({op.width}x{op.height}m):</span>
                    <span className="font-mono">{op.width * op.height} m²</span>
                  </div>
                ))}
                {data.doors?.map((door, idx) => (
                  <div key={`door-${idx}`} className="text-sm flex justify-between border-b border-gray-100 pb-1">
                    <span>Porta #{idx + 1} ({door.width}x{door.height}m - Freq: {door.frequency}):</span>
                    <span className="font-mono">{door.width * door.height} m²</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 mb-8">
            <section>
              <h2 className="text-sm font-bold border-b border-gray-300 mb-3 uppercase">Carga Térmica Total</h2>
              <div className="bg-gray-50 p-4 rounded border border-gray-200">
                <div className="text-3xl font-black text-black">{formatBTU(result.totalBTU)}</div>
                <div className="text-lg text-gray-600">{formatKW(result.totalBTU)}</div>
                <div className="text-xs text-gray-400 mt-1">Inclui margem de segurança de {result.safetyMargin}%</div>
              </div>
            </section>

            <section>
              <h2 className="text-sm font-bold border-b border-gray-300 mb-3 uppercase">Distribuição de Carga</h2>
              <div className="h-[150px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={[
                        { name: 'Sensível', value: result.sensibleBTU },
                        { name: 'Latente', value: result.latentBTU }
                      ]}
                      cx="50%"
                      cy="50%"
                      innerRadius={40}
                      outerRadius={60}
                      paddingAngle={5}
                      dataKey="value"
                    >
                      <Cell fill="#3b82f6" />
                      <Cell fill="#ef4444" />
                    </Pie>
                    <Tooltip 
                      formatter={(value: number) => formatBTU(value)}
                      contentStyle={{ backgroundColor: '#fff', borderRadius: '8px', border: '1px solid #e5e7eb', fontSize: '12px' }}
                    />
                    <Legend verticalAlign="middle" align="right" layout="vertical" wrapperStyle={{ fontSize: '12px' }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </section>
          </div>

          <section className="mb-8">
            <h2 className="text-sm font-bold border-b border-gray-300 mb-3 uppercase">Análise Detalhada dos Ganhos</h2>
            <div className="h-[280px] w-full bg-gray-50 p-4 rounded border border-gray-100 mb-4">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={[
                    { name: 'Base', value: result.calculationMemory.baseLoad },
                    { name: 'Vidros', value: result.calculationMemory.glassGain },
                    { name: 'Pessoas', value: result.calculationMemory.peopleSensible + result.calculationMemory.peopleLatent },
                    { name: 'Equip.', value: result.calculationMemory.equipLoad },
                    { name: 'Ilum.', value: result.calculationMemory.lightLoad },
                    { name: 'Renov.', value: (result.calculationMemory.renewalSensible || 0) + (result.calculationMemory.renewalLatent || 0) },
                    { name: 'Infilt.', value: (result.calculationMemory.openingsSensible || 0) + (result.calculationMemory.openingsLatent || 0) + (result.calculationMemory.doorsSensible || 0) + (result.calculationMemory.doorsLatent || 0) },
                  ].filter(d => d.value > 0)}
                  margin={{ top: 10, right: 10, left: 0, bottom: 40 }}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                  <XAxis 
                    dataKey="name" 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fontSize: 9, fill: '#6b7280', angle: -45, textAnchor: 'end' }}
                    interval={0}
                    height={60}
                  />
                  <YAxis 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fontSize: 10, fill: '#6b7280' }}
                    tickFormatter={(value) => `${Math.round(value/1000)}k`}
                  />
                  <Tooltip 
                    formatter={(value: number) => [formatBTU(value), 'Carga']}
                    contentStyle={{ backgroundColor: '#fff', borderRadius: '8px', border: '1px solid #e5e7eb', fontSize: '12px' }}
                    cursor={{ fill: '#f3f4f6' }}
                  />
                  <Bar dataKey="value" fill="#10b981" radius={[4, 4, 0, 0]} barSize={30} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <h2 className="text-sm font-bold border-b border-gray-300 mb-3 uppercase">Memória de Cálculo Detalhada</h2>
            {result.calculationMemory ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-2 text-sm">
                <div className="flex justify-between border-b border-gray-100 py-1">
                  <span>Carga Base (Envoltória/Sol):</span>
                  <span className="font-mono">{formatBTU(result.calculationMemory.baseLoad)}</span>
                </div>
                <div className="flex justify-between border-b border-gray-100 py-1">
                  <span>Ganhos por Vidros/Aberturas:</span>
                  <span className="font-mono">{formatBTU(result.calculationMemory.glassGain)}</span>
                </div>
                <div className="flex justify-between border-b border-gray-100 py-1">
                  <span>Ocupação (Calor Sensível):</span>
                  <span className="font-mono">{formatBTU(result.calculationMemory.peopleSensible)}</span>
                </div>
                <div className="flex justify-between border-b border-gray-100 py-1">
                  <span>Ocupação (Calor Latente):</span>
                  <span className="font-mono">{formatBTU(result.calculationMemory.peopleLatent)}</span>
                </div>
                <div className="flex justify-between border-b border-gray-100 py-1">
                  <span>Equipamentos Eletrônicos:</span>
                  <span className="font-mono">{formatBTU(result.calculationMemory.equipLoad)}</span>
                </div>
                <div className="flex justify-between border-b border-gray-100 py-1">
                  <span>Iluminação Artificial:</span>
                  <span className="font-mono">{formatBTU(result.calculationMemory.lightLoad)}</span>
                </div>
                {result.calculationMemory.renewalSensible && result.calculationMemory.renewalSensible > 0 && (
                  <div className="flex justify-between border-b border-gray-100 py-1">
                    <span>Renovação de Ar (Sensível):</span>
                    <span className="font-mono">{formatBTU(result.calculationMemory.renewalSensible)}</span>
                  </div>
                )}
                {result.calculationMemory.renewalLatent && result.calculationMemory.renewalLatent > 0 && (
                  <div className="flex justify-between border-b border-gray-100 py-1">
                    <span>Renovação de Ar (Latente):</span>
                    <span className="font-mono">{formatBTU(result.calculationMemory.renewalLatent)}</span>
                  </div>
                )}
                {((result.calculationMemory.openingsSensible || 0) + (result.calculationMemory.doorsSensible || 0)) > 0 && (
                  <div className="flex justify-between border-b border-gray-100 py-1">
                    <span>Infiltração Vãos/Portas (Sensível):</span>
                    <span className="font-mono">{formatBTU((result.calculationMemory.openingsSensible || 0) + (result.calculationMemory.doorsSensible || 0))}</span>
                  </div>
                )}
                {((result.calculationMemory.openingsLatent || 0) + (result.calculationMemory.doorsLatent || 0)) > 0 && (
                  <div className="flex justify-between border-b border-gray-100 py-1">
                    <span>Infiltração Vãos/Portas (Latente):</span>
                    <span className="font-mono">{formatBTU((result.calculationMemory.openingsLatent || 0) + (result.calculationMemory.doorsLatent || 0))}</span>
                  </div>
                )}
                <div className="flex justify-between font-bold pt-2 text-green-700">
                  <span>TOTAL SENSÍVEL:</span>
                  <span className="font-mono">{formatBTU(result.calculationMemory.totalSensible)}</span>
                </div>
                <div className="flex justify-between font-bold pt-2 text-blue-700">
                  <span>TOTAL LATENTE:</span>
                  <span className="font-mono">{formatBTU(result.calculationMemory.totalLatent)}</span>
                </div>
              </div>
            ) : (
              <p className="text-sm text-gray-500 italic">Memória de cálculo não disponível para registros antigos.</p>
            )}
          </section>

          <section className="mb-8">
            <h2 className="text-sm font-bold border-b border-gray-300 mb-3 uppercase">Recomendação Técnica</h2>
            <div className="p-4 border-2 border-black rounded">
              <p className="text-lg font-bold mb-1">Capacidade Sugerida: {result.recommendedRange}</p>
              <p className="text-sm text-gray-600">Recomenda-se a utilização de sistemas com tecnologia Inverter para maior eficiência energética.</p>
            </div>
          </section>

          <section>
            <h2 className="text-sm font-bold border-b border-gray-300 mb-3 uppercase">Justificativa e Notas</h2>
            <p className="text-sm text-justify leading-relaxed text-gray-700">{result.justification}</p>
          </section>

          <div className="mt-12 pt-8 border-t border-gray-200 text-[10px] text-gray-400 text-center">
            Este relatório é um documento técnico gerado pelo software HVAC Master. Os cálculos seguem as premissas da NBR 16401.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-4">
      {notification && (
        <div className={cn(
          "fixed top-4 right-4 z-50 p-4 rounded-lg shadow-2xl animate-in slide-in-from-right-8",
          notification.type === 'success' ? "bg-green-600 text-white" : "bg-red-600 text-white"
        )}>
          <div className="flex items-center gap-2">
            {notification.type === 'success' ? <Check className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
            <span className="font-bold">{notification.message}</span>
          </div>
        </div>
      )}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <Calculator className="w-8 h-8 text-green-500" />
          <h1 className="text-2xl font-bold">{editingId ? "Editar Cálculo" : "Calculadora de Carga Térmica"}</h1>
        </div>
        <button onClick={() => setView('history')} className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors">
          <History className="w-5 h-5" /> Ver Histórico
        </button>
      </div>

      {step === 1 && (
        <div className="hvac-card animate-in fade-in slide-in-from-bottom-4">
          <h2 className="text-xl font-semibold mb-6 flex items-center gap-2">
            <span className="bg-green-600 text-white w-6 h-6 rounded-full flex items-center justify-center text-sm">1</span>
            Caracterização do Ambiente
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="flex flex-col gap-2">
              <label className="text-sm text-gray-400">Tipo de Ambiente</label>
              <select 
                className="hvac-input"
                value={data.type}
                onChange={e => setData({...data, type: e.target.value as any})}
              >
                <option value="residencial">Residencial</option>
                <option value="comercial">Comercial</option>
                <option value="escritorio">Escritório</option>
                <option value="loja">Loja</option>
              </select>
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-sm text-gray-400">Área (m²)</label>
              <input 
                type="number" 
                className="hvac-input" 
                value={data.area}
                onChange={e => setData({...data, area: Number(e.target.value)})}
              />
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-sm text-gray-400">Pé-direito (m)</label>
              <input 
                type="number" 
                step="0.1"
                className="hvac-input" 
                value={data.height}
                onChange={e => setData({...data, height: Number(e.target.value)})}
              />
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-sm text-gray-400">Horas de Uso por Dia</label>
              <input 
                type="number" 
                min="1"
                max="24"
                className="hvac-input" 
                value={data.usageHours}
                onChange={e => setData({...data, usageHours: Number(e.target.value)})}
              />
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-sm text-gray-400 flex items-center justify-between">
                Fator Climático (Região)
                <button 
                  onClick={() => setShowClimateMap(!showClimateMap)}
                  className="text-[10px] text-green-500 hover:underline flex items-center gap-1"
                >
                  <Map className="w-3 h-3" /> {showClimateMap ? 'Ocultar Mapa' : 'Ver Mapa'}
                </button>
              </label>
              <select 
                className="hvac-input"
                value={data.climateFactor}
                onChange={e => setData({...data, climateFactor: Number(e.target.value)})}
              >
                <option value={1.0}>1.0 - Temperado (Sul/Sudeste)</option>
                <option value={1.1}>1.1 - Quente (Centro-Oeste/Nordeste)</option>
                <option value={1.2}>1.2 - Muito Quente (Norte/Litoral)</option>
              </select>
            </div>
            
            {showClimateMap && (
              <div className="md:col-span-2 bg-white/5 p-4 rounded-lg border border-white/10 animate-in zoom-in-95">
                <div className="flex flex-col md:flex-row gap-6 items-center">
                  <div className="w-full md:w-1/2">
                    <svg viewBox="0 0 500 500" className="w-full h-auto drop-shadow-lg">
                      {/* Brazil Outline */}
                      <path d="M160,20 Q200,0 250,20 T350,40 Q400,60 440,120 T460,240 Q440,300 380,360 T280,480 Q240,500 200,460 T100,320 Q60,260 40,200 T100,80 T160,20 Z" fill="#1a1a1a" stroke="#333" strokeWidth="2" />
                      
                      {/* Norte - 1.2 */}
                      <path d="M160,20 Q200,0 250,20 T350,40 L350,180 L80,180 Q60,140 100,80 T160,20 Z" fill="#ef4444" opacity="0.6" />
                      <text x="160" y="110" fill="white" fontSize="22" fontWeight="bold">NORTE (1.2)</text>
                      
                      {/* Nordeste - 1.1 */}
                      <path d="M350,40 Q400,60 440,120 T460,240 L330,240 L350,40 Z" fill="#f59e0b" opacity="0.6" />
                      <text x="360" y="160" fill="white" fontSize="16" fontWeight="bold">NE (1.1)</text>
                      
                      {/* Centro-Oeste - 1.1 */}
                      <path d="M80,180 L350,180 L330,300 L150,300 L80,180 Z" fill="#f59e0b" opacity="0.6" />
                      <text x="180" y="250" fill="white" fontSize="16" fontWeight="bold">CO (1.1)</text>
                      
                      {/* Sudeste - 1.0 */}
                      <path d="M330,240 T460,240 Q440,300 380,360 L280,360 L330,240 Z" fill="#10b981" opacity="0.6" />
                      <text x="330" y="310" fill="white" fontSize="16" fontWeight="bold">SE (1.0)</text>
                      
                      {/* Sul - 1.0 */}
                      <path d="M150,300 L330,300 L280,360 T280,480 Q240,500 200,460 T150,300 Z" fill="#10b981" opacity="0.6" />
                      <text x="200" y="410" fill="white" fontSize="16" fontWeight="bold">SUL (1.0)</text>
                    </svg>
                  </div>
                  <div className="w-full md:w-1/2 space-y-4">
                    <h3 className="text-sm font-bold text-green-500 uppercase">Guia de Regiões (NBR 16401)</h3>
                    <div className="space-y-2 text-xs text-gray-400">
                      <p><strong className="text-white">Fator 1.2:</strong> Região Norte e Litoral do Nordeste. Clima equatorial/tropical úmido com altas temperaturas constantes.</p>
                      <p><strong className="text-white">Fator 1.1:</strong> Centro-Oeste, Interior do Nordeste e Norte de Minas. Clima tropical com estações bem definidas e picos de calor.</p>
                      <p><strong className="text-white">Fator 1.0:</strong> Sul, Sudeste (exceto Norte de MG) e áreas serranas. Clima temperado/subtropical com variações sazonais maiores.</p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
          <div className="mt-8 flex justify-end">
            <button onClick={() => setStep(2)} className="hvac-button flex items-center gap-2">
              Próximo <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="hvac-card animate-in fade-in slide-in-from-right-4">
          <h2 className="text-xl font-semibold mb-6 flex items-center gap-2">
            <span className="bg-green-600 text-white w-6 h-6 rounded-full flex items-center justify-center text-sm">2</span>
            Envoltória e Orientação
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="flex flex-col gap-2">
              <label className="text-sm text-gray-400">Orientação Solar Principal</label>
              <div className="grid grid-cols-4 gap-2">
                {['N', 'S', 'L', 'O'].map(o => (
                  <button 
                    key={o}
                    onClick={() => setData({...data, orientation: o as any})}
                    className={cn(
                      "py-2 rounded border transition-all",
                      data.orientation === o ? "bg-green-600 border-green-600" : "border-[#333333] hover:border-green-500"
                    )}
                  >
                    {o}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-sm text-gray-400">Paredes</label>
              <select className="hvac-input" value={data.wallType} onChange={e => setData({...data, wallType: e.target.value as any})}>
                <option value="simples">Alvenaria Simples</option>
                <option value="dupla">Alvenaria Dupla</option>
                <option value="isolada">Isolada Termicamente</option>
              </select>
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-sm text-gray-400">Cobertura</label>
              <select className="hvac-input" value={data.roofType} onChange={e => setData({...data, roofType: e.target.value as any})}>
                <option value="telha">Telha Cerâmica/Fibro</option>
                <option value="laje">Laje Maciça</option>
              </select>
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-sm text-gray-400">Vidros</label>
              <select className="hvac-input" value={data.glassType} onChange={e => setData({...data, glassType: e.target.value as any})}>
                <option value="simples">Simples</option>
                <option value="duplo">Duplo / Insulado</option>
                <option value="pelicula">Com Película Térmica</option>
              </select>
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-sm text-gray-400">Nível de Isolamento Geral</label>
              <select className="hvac-input" value={data.insulationLevel} onChange={e => setData({...data, insulationLevel: e.target.value as any})}>
                <option value="baixo">Baixo (Muitas frestas/Sem isolamento)</option>
                <option value="medio">Médio (Padrão)</option>
                <option value="alto">Alto (Construção Térmica/Hermético)</option>
              </select>
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-sm text-gray-400">Tipo de Piso</label>
              <select className="hvac-input" value={data.floorType} onChange={e => setData({...data, floorType: e.target.value as any})}>
                <option value="terra">Contato com o Solo</option>
                <option value="laje">Laje (Andar Intermediário)</option>
                <option value="isolado">Piso Isolado</option>
              </select>
            </div>

            <div className="md:col-span-2 border-t border-[#333333] pt-6 mt-2">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
                <h3 className="text-sm font-bold text-gray-300 uppercase flex items-center gap-2">
                  <DoorOpen className="w-4 h-4 text-green-500" /> Aberturas e Portas (NBR 16401)
                </h3>
                <div className="flex gap-2">
                  <button 
                    onClick={() => setData({...data, openings: [...(data.openings || []), { width: 1.0, height: 1.0, type: 'vao_livre' }]})}
                    className="text-[10px] bg-green-600/20 text-green-500 px-2 py-1 rounded hover:bg-green-600/30 transition-all"
                  >
                    + Vão Livre
                  </button>
                  <button 
                    onClick={() => setData({...data, doors: [...(data.doors || []), { width: 0.8, height: 2.1, frequency: 'baixa' }]})}
                    className="text-[10px] bg-blue-600/20 text-blue-500 px-2 py-1 rounded hover:bg-blue-600/30 transition-all"
                  >
                    + Porta
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Openings List */}
                <div className="space-y-3">
                  <h4 className="text-[10px] font-bold text-gray-500 uppercase">Vãos e Aberturas Permanentes</h4>
                  {(data.openings || []).map((op, idx) => (
                    <div key={idx} className="bg-white/5 p-3 rounded border border-white/5 flex flex-col gap-2">
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] font-bold text-green-500">VÃO #{idx + 1}</span>
                        <button onClick={() => setData({...data, openings: data.openings?.filter((_, i) => i !== idx)})} className="text-red-500 hover:text-red-400">
                          <Trash className="w-3 h-3" />
                        </button>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="flex flex-col gap-1">
                          <label className="text-[9px] text-gray-500 uppercase">Largura (m)</label>
                          <input type="number" step="0.1" className="hvac-input py-1 text-xs" value={op.width} onChange={e => {
                            const newList = [...(data.openings || [])];
                            newList[idx].width = Number(e.target.value);
                            setData({...data, openings: newList});
                          }} />
                        </div>
                        <div className="flex flex-col gap-1">
                          <label className="text-[9px] text-gray-500 uppercase">Altura (m)</label>
                          <input type="number" step="0.1" className="hvac-input py-1 text-xs" value={op.height} onChange={e => {
                            const newList = [...(data.openings || [])];
                            newList[idx].height = Number(e.target.value);
                            setData({...data, openings: newList});
                          }} />
                        </div>
                      </div>
                    </div>
                  ))}
                  {(data.openings || []).length === 0 && <p className="text-[10px] text-gray-600 italic">Nenhum vão livre registrado.</p>}
                </div>

                {/* Doors List */}
                <div className="space-y-3">
                  <h4 className="text-[10px] font-bold text-gray-500 uppercase">Portas com Fluxo de Abertura</h4>
                  {(data.doors || []).map((door, idx) => (
                    <div key={idx} className="bg-white/5 p-3 rounded border border-white/5 flex flex-col gap-2">
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] font-bold text-blue-500">PORTA #{idx + 1}</span>
                        <button onClick={() => setData({...data, doors: data.doors?.filter((_, i) => i !== idx)})} className="text-red-500 hover:text-red-400">
                          <Trash className="w-3 h-3" />
                        </button>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <div className="flex flex-col gap-1">
                          <label className="text-[9px] text-gray-500 uppercase">Larg. (m)</label>
                          <input type="number" step="0.1" className="hvac-input py-1 text-xs" value={door.width} onChange={e => {
                            const newList = [...(data.doors || [])];
                            newList[idx].width = Number(e.target.value);
                            setData({...data, doors: newList});
                          }} />
                        </div>
                        <div className="flex flex-col gap-1">
                          <label className="text-[9px] text-gray-500 uppercase">Alt. (m)</label>
                          <input type="number" step="0.1" className="hvac-input py-1 text-xs" value={door.height} onChange={e => {
                            const newList = [...(data.doors || [])];
                            newList[idx].height = Number(e.target.value);
                            setData({...data, doors: newList});
                          }} />
                        </div>
                        <div className="flex flex-col gap-1">
                          <label className="text-[9px] text-gray-500 uppercase">Freq.</label>
                          <select className="hvac-input py-1 text-xs" value={door.frequency} onChange={e => {
                            const newList = [...(data.doors || [])];
                            newList[idx].frequency = e.target.value as any;
                            setData({...data, doors: newList});
                          }}>
                            <option value="baixa">Baixa</option>
                            <option value="media">Média</option>
                            <option value="alta">Alta</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  ))}
                  {(data.doors || []).length === 0 && <p className="text-[10px] text-gray-600 italic">Nenhuma porta registrada.</p>}
                </div>
              </div>
            </div>
          </div>
          <div className="mt-8 flex justify-between">
            <button onClick={() => setStep(1)} className="hvac-button-outline flex items-center gap-2">
              <ChevronLeft className="w-4 h-4" /> Voltar
            </button>
            <button onClick={() => setStep(3)} className="hvac-button flex items-center gap-2">
              Próximo <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="hvac-card animate-in fade-in slide-in-from-right-4">
          <h2 className="text-xl font-semibold mb-6 flex items-center gap-2">
            <span className="bg-green-600 text-white w-6 h-6 rounded-full flex items-center justify-center text-sm">3</span>
            Cargas Internas
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="flex flex-col gap-2">
              <label className="text-sm text-gray-400 flex items-center gap-2"><Users className="w-4 h-4" /> Nº de Pessoas</label>
              <input type="number" className="hvac-input" value={data.peopleCount} onChange={e => setData({...data, peopleCount: Number(e.target.value)})} />
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-sm text-gray-400">Rotatividade de Pessoas</label>
              <select className="hvac-input" value={data.peopleTurnover} onChange={e => setData({...data, peopleTurnover: e.target.value as any})}>
                <option value="baixa">Baixa (Permanência longa)</option>
                <option value="media">Média (Entra e sai moderado)</option>
                <option value="alta">Alta (Fluxo constante/Portas abrindo)</option>
              </select>
            </div>

            <div className="flex flex-col gap-4 md:col-span-2 border-t border-[#333333] pt-6 mt-2">
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-bold text-gray-300 flex items-center gap-2">
                  <Monitor className="w-4 h-4 text-blue-500" /> Equipamentos Eletrônicos
                </label>
                <button 
                  onClick={() => setData({
                    ...data, 
                    internalEquipments: [...(data.internalEquipments || []), { type: '', power: 150, quantity: 1 }]
                  })}
                  className="text-xs bg-blue-600/20 text-blue-500 px-2 py-1 rounded hover:bg-blue-600/30 transition-all flex items-center gap-1"
                >
                  <Plus className="w-3 h-3" /> Adicionar
                </button>
              </div>
              
              <div className="space-y-3">
                {(data.internalEquipments || []).map((eq, idx) => (
                  <div key={idx} className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end bg-white/5 p-3 rounded border border-white/5">
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] text-gray-500 uppercase">Tipo</label>
                      <input 
                        type="text" 
                        className="hvac-input py-1 text-sm" 
                        placeholder="Ex: Computador"
                        value={eq.type}
                        onChange={e => {
                          const newList = [...(data.internalEquipments || [])];
                          newList[idx].type = e.target.value;
                          setData({...data, internalEquipments: newList});
                        }}
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] text-gray-500 uppercase">Potência (W)</label>
                      <input 
                        type="number" 
                        className="hvac-input py-1 text-sm" 
                        value={eq.power}
                        onChange={e => {
                          const newList = [...(data.internalEquipments || [])];
                          newList[idx].power = Number(e.target.value);
                          setData({...data, internalEquipments: newList});
                        }}
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] text-gray-500 uppercase">Qtd</label>
                      <input 
                        type="number" 
                        className="hvac-input py-1 text-sm" 
                        value={eq.quantity}
                        onChange={e => {
                          const newList = [...(data.internalEquipments || [])];
                          newList[idx].quantity = Number(e.target.value);
                          setData({...data, internalEquipments: newList});
                        }}
                      />
                    </div>
                    <button 
                      onClick={() => {
                        const newList = (data.internalEquipments || []).filter((_, i) => i !== idx);
                        setData({...data, internalEquipments: newList});
                      }}
                      className="p-2 text-red-500 hover:bg-red-500/10 rounded transition-all"
                    >
                      <Trash className="w-4 h-4 mx-auto" />
                    </button>
                  </div>
                ))}
                {(data.internalEquipments || []).length === 0 && (
                  <p className="text-xs text-gray-500 italic text-center py-2">Nenhum equipamento adicionado.</p>
                )}
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-sm text-gray-400 flex items-center gap-2"><Lightbulb className="w-4 h-4" /> Tipo de Iluminação</label>
              <select className="hvac-input" value={data.lightingType} onChange={e => setData({...data, lightingType: e.target.value as any})}>
                <option value="led">LED</option>
                <option value="fluorescente">Fluorescente</option>
                <option value="incandescente">Incandescente</option>
              </select>
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-sm text-gray-400">Potência Iluminação (W)</label>
              <input type="number" className="hvac-input" value={data.lightingPower} onChange={e => setData({...data, lightingPower: Number(e.target.value)})} />
            </div>

            <div className="flex flex-col gap-2 md:col-span-2 border-t border-[#333333] pt-6 mt-2">
              <div className="flex items-center justify-between mb-4">
                <label className="text-sm font-bold text-gray-300 flex items-center gap-2">
                  <Sun className="w-4 h-4 text-yellow-500" /> Renovação de Ar (NBR 16401)
                </label>
                <button 
                  onClick={() => setData({...data, airRenewal: {
                    enabled: !data.airRenewal?.enabled,
                    flowRate: data.airRenewal?.flowRate || 27,
                    method: data.airRenewal?.method || 'person'
                  }})}
                  className={cn(
                    "relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none",
                    data.airRenewal?.enabled ? "bg-green-600" : "bg-gray-700"
                  )}
                >
                  <span className={cn(
                    "inline-block h-4 w-4 transform rounded-full bg-white transition-transform",
                    data.airRenewal?.enabled ? "translate-x-6" : "translate-x-1"
                  )} />
                </button>
              </div>
              
              {data.airRenewal?.enabled && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-in fade-in slide-in-from-top-2">
                  <div className="flex flex-col gap-2">
                    <label className="text-xs text-gray-500 uppercase">Método de Cálculo</label>
                    <select 
                      className="hvac-input"
                      value={data.airRenewal.method}
                      onChange={e => setData({...data, airRenewal: {...data.airRenewal!, method: e.target.value as any}})}
                    >
                      <option value="person">Por Pessoa (m³/h/pessoa)</option>
                      <option value="area">Por Área (m³/h/m²)</option>
                      <option value="fixed">Vazão Fixa (m³/h)</option>
                    </select>
                  </div>
                  <div className="flex flex-col gap-2">
                    <label className="text-xs text-gray-500 uppercase">
                      {data.airRenewal.method === 'person' ? 'Vazão por Pessoa' : data.airRenewal.method === 'area' ? 'Vazão por Área' : 'Vazão Total'}
                    </label>
                    <input 
                      type="number" 
                      className="hvac-input" 
                      value={data.airRenewal.flowRate}
                      onChange={e => setData({...data, airRenewal: {...data.airRenewal!, flowRate: Number(e.target.value)}})}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
          <div className="mt-8 flex justify-between">
            <button onClick={() => setStep(2)} className="hvac-button-outline flex items-center gap-2">
              <ChevronLeft className="w-4 h-4" /> Voltar
            </button>
            <button onClick={() => setStep(4)} className="hvac-button flex items-center gap-2">
              Próximo <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {step === 4 && (
        <div className="hvac-card animate-in fade-in zoom-in-95">
          <h2 className="text-xl font-semibold mb-6">Método de Cálculo</h2>
          <div className="grid grid-cols-1 gap-4">
            <button 
              onClick={calculate}
              className="p-6 border border-green-600/30 bg-green-600/10 rounded-xl hover:bg-green-600/20 transition-all text-left group"
            >
              <div className="flex justify-between items-center mb-2">
                <span className="text-lg font-bold text-green-500">Método Detalhado (NBR 16401)</span>
                <Check className="w-6 h-6 text-green-500 opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
              <p className="text-sm text-gray-400">Cálculo completo considerando ganhos sensíveis, latentes, orientação solar e envoltória técnica.</p>
            </button>
            
            <button 
              onClick={calculate}
              className="p-6 border border-[#333333] bg-[#1a1a1a] rounded-xl hover:border-gray-500 transition-all text-left"
            >
              <span className="text-lg font-bold text-gray-300 block mb-2">Método Simplificado</span>
              <p className="text-sm text-gray-500">Uso rápido baseado em médias de mercado com justificativa técnica gerada.</p>
            </button>
          </div>
          <div className="mt-8 flex justify-start">
            <button onClick={() => setStep(3)} className="hvac-button-outline flex items-center gap-2">
              <ChevronLeft className="w-4 h-4" /> Voltar
            </button>
          </div>
        </div>
      )}

      {step === 5 && result && (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-8">
          <div className="hvac-card border-green-600/50 bg-green-900/10">
            <div className="flex justify-between items-start mb-6">
              <div>
                <h2 className="text-sm uppercase tracking-wider text-green-500 font-bold">Resultado do Dimensionamento</h2>
                <div className="text-4xl font-black mt-1">{formatBTU(result.totalBTU)}</div>
                <div className="text-xl text-gray-400">{formatKW(result.totalBTU)}</div>
              </div>
              <div className="text-right">
                <div className="text-xs text-gray-500 uppercase">Margem de Segurança</div>
                <div className="text-lg font-bold text-green-500">+{result.safetyMargin}%</div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-6">
              <div className="bg-black/40 p-3 rounded border border-[#333333]">
                <div className="text-xs text-gray-500 uppercase">Calor Sensível</div>
                <div className="font-mono">{formatBTU(result.sensibleBTU)}</div>
              </div>
              <div className="bg-black/40 p-3 rounded border border-[#333333]">
                <div className="text-xs text-gray-500 uppercase">Calor Latente</div>
                <div className="font-mono">{formatBTU(result.latentBTU)}</div>
              </div>
            </div>

            <div className="p-4 bg-green-600/10 border border-green-600/20 rounded-lg mb-6">
              <h3 className="text-sm font-bold text-green-500 uppercase mb-2">Recomendação de Equipamento</h3>
              <p className="text-lg font-semibold">Faixa ideal: {result.recommendedRange}</p>
              <p className="text-xs text-gray-400 mt-2">Sugerido: Split Hi-Wall Inverter ou Cassete (dependendo da aplicação).</p>
            </div>

            <div className="text-sm text-gray-400 italic border-l-2 border-green-600 pl-4 py-1">
              {result.justification}
            </div>
          </div>

      <div className="space-y-6">
        <h3 className="text-lg font-bold text-green-500 uppercase flex items-center gap-2">
          <Calculator className="w-5 h-5" /> Seleção de Equipamentos do Projeto
        </h3>
        
        {data.selectedEquipments?.map((eq, idx) => (
          <div key={idx} className="bg-black/40 p-4 rounded-xl border border-[#333333] relative animate-in fade-in slide-in-from-left-4">
            {data.selectedEquipments!.length > 1 && (
              <button 
                onClick={() => {
                  const newList = [...data.selectedEquipments!];
                  newList.splice(idx, 1);
                  setData({...data, selectedEquipments: newList});
                }}
                className="absolute top-4 right-4 text-red-500 hover:text-red-400 p-1"
                title="Remover Equipamento"
              >
                <Trash className="w-4 h-4" />
              </button>
            )}
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="flex flex-col gap-2">
                <label className="text-xs text-gray-500 uppercase font-bold">Marca</label>
                <input 
                  type="text" 
                  className="hvac-input" 
                  list="brands"
                  value={eq.brand}
                  onChange={e => {
                    const newList = [...data.selectedEquipments!];
                    newList[idx].brand = e.target.value;
                    setData({...data, selectedEquipments: newList});
                  }}
                  placeholder="Ex: LG, Samsung"
                />
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-xs text-gray-500 uppercase font-bold">Modelo</label>
                <input 
                  type="text" 
                  className="hvac-input" 
                  list="models"
                  value={eq.model}
                  onChange={e => {
                    const newList = [...data.selectedEquipments!];
                    newList[idx].model = e.target.value;
                    setData({...data, selectedEquipments: newList});
                  }}
                  placeholder="Ex: Hi-Wall Inverter"
                />
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-xs text-gray-500 uppercase font-bold">Quantidade</label>
                <input 
                  type="number" 
                  min="1"
                  className="hvac-input" 
                  value={eq.quantity}
                  onChange={e => {
                    const newList = [...data.selectedEquipments!];
                    newList[idx].quantity = Math.max(1, Number(e.target.value));
                    setData({...data, selectedEquipments: newList});
                  }}
                />
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-xs text-gray-500 uppercase font-bold">Nº de Fases</label>
                <input 
                  type="text" 
                  className="hvac-input" 
                  list="fases-options"
                  value={eq.numFases || ''}
                  onChange={e => {
                    const newList = [...data.selectedEquipments!];
                    newList[idx].numFases = e.target.value;
                    setData({...data, selectedEquipments: newList});
                  }}
                  placeholder="Ex: 3 fases"
                />
                <datalist id="fases-options">
                  <option value="2 fases" />
                  <option value="3 fases" />
                  <option value="4 fases" />
                  <option value="2 fases + Terra" />
                  <option value="3 fases + Terra" />
                  <option value="4 fases + Terra" />
                </datalist>
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-xs text-gray-500 uppercase font-bold">Tipo de Tubulação</label>
                <input 
                  type="text" 
                  className="hvac-input" 
                  list="pipe-options"
                  value={eq.pipeType || ''}
                  onChange={e => {
                    const newList = [...data.selectedEquipments!];
                    newList[idx].pipeType = e.target.value;
                    setData({...data, selectedEquipments: newList});
                  }}
                  placeholder="Ex: Cobre 3/8 e 5/8"
                />
                <datalist id="pipe-options">
                  <option value="Cobre 1/4 e 3/8" />
                  <option value="Cobre 1/4 e 1/2" />
                  <option value="Cobre 3/8 e 5/8" />
                  <option value="Cobre 3/8 e 3/4" />
                  <option value="Cobre 1/2 e 3/4" />
                  <option value="Alumínio" />
                </datalist>
              </div>
              <div className="flex flex-col gap-2 md:col-span-3">
                <label className="text-xs text-gray-500 uppercase font-bold">Observações do Equipamento</label>
                <textarea 
                  className="hvac-input min-h-[60px] py-2" 
                  value={eq.notes || ''}
                  onChange={e => {
                    const newList = [...data.selectedEquipments!];
                    newList[idx].notes = e.target.value;
                    setData({...data, selectedEquipments: newList});
                  }}
                  placeholder="Ex: Instalar unidade externa em suporte de parede com amortecedores."
                />
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-xs text-gray-500 uppercase font-bold">Tensão (V)</label>
                <select 
                  className="hvac-input"
                  value={eq.voltage}
                  onChange={e => {
                    const newList = [...data.selectedEquipments!];
                    newList[idx].voltage = e.target.value;
                    setData({...data, selectedEquipments: newList});
                  }}
                >
                  <option value="110V">110V</option>
                  <option value="220V">220V</option>
                  <option value="380V">380V</option>
                </select>
              </div>
              <div className="flex flex-col gap-2 md:col-span-2">
                <label className="text-xs text-gray-500 uppercase font-bold">Capacidade Nominal (BTU/h)</label>
                <div className="flex gap-2">
                  <select 
                    className="hvac-input flex-1"
                    value={[7000, 9000, 12000, 18000, 24000, 30000, 36000, 48000, 60000].includes(eq.capacity) ? eq.capacity : 'custom'}
                    onChange={e => {
                      const val = e.target.value;
                      const newList = [...data.selectedEquipments!];
                      if (val === 'custom') {
                        newList[idx].capacity = 0;
                      } else {
                        newList[idx].capacity = Number(val);
                      }
                      setData({...data, selectedEquipments: newList});
                    }}
                  >
                    <option value="">Selecionar...</option>
                    {[7000, 9000, 12000, 18000, 24000, 30000, 36000, 48000, 60000].map(cap => (
                      <option key={cap} value={cap}>{cap} BTU/h</option>
                    ))}
                    <option value="custom">Outra (Digitar)...</option>
                  </select>
                  {eq.capacity === 0 && (
                    <button 
                      onClick={() => {
                        const standardCapacities = [7000, 9000, 12000, 18000, 24000, 30000, 36000, 48000, 60000];
                        const suggested = standardCapacities.find(c => c >= result.totalBTU) || 60000;
                        const newList = [...data.selectedEquipments!];
                        newList[idx].capacity = suggested;
                        setData({...data, selectedEquipments: newList});
                      }}
                      className="text-[10px] bg-green-600/20 text-green-500 px-2 rounded hover:bg-green-600/30 transition-colors"
                    >
                      Sugerir
                    </button>
                  )}
                </div>
                {(![7000, 9000, 12000, 18000, 24000, 30000, 36000, 48000, 60000].includes(eq.capacity) || eq.capacity === 0) && (
                   <input 
                    type="number" 
                    className="hvac-input mt-2" 
                    placeholder="Digite a capacidade em BTU/h"
                    value={eq.capacity || ''}
                    onChange={e => {
                      const newList = [...data.selectedEquipments!];
                      newList[idx].capacity = Number(e.target.value);
                      setData({...data, selectedEquipments: newList});
                    }}
                  />
                )}
              </div>
            </div>
          </div>
        ))}

        <button 
          onClick={() => {
            setData({
              ...data, 
              selectedEquipments: [
                ...data.selectedEquipments!, 
                { brand: '', model: '', voltage: '220V', capacity: 0, quantity: 1 }
              ]
            });
          }}
          className="w-full py-3 border-2 border-dashed border-[#333333] rounded-xl text-gray-500 hover:border-green-600/50 hover:text-green-500 transition-all flex items-center justify-center gap-2"
        >
          <Plus className="w-4 h-4" /> Adicionar Outro Equipamento ao Projeto
        </button>

        <datalist id="brands">
          <option value="LG" />
          <option value="Samsung" />
          <option value="Daikin" />
          <option value="Carrier" />
          <option value="Gree" />
          <option value="Midea" />
          <option value="Fujitsu" />
          <option value="Elgin" />
          <option value="Springer" />
          <option value="Consul" />
        </datalist>

        <datalist id="models">
          <option value="Hi-Wall Inverter" />
          <option value="Hi-Wall On/Off" />
          <option value="Cassete Inverter" />
          <option value="Piso Teto" />
          <option value="Multi Split" />
          <option value="Duto / Central" />
        </datalist>
      </div>

      {(() => {
        const totalCap = data.selectedEquipments?.reduce((acc, eq) => acc + (eq.capacity * eq.quantity), 0) || 0;
        if (totalCap === 0) return null;
        
        return (
          <div className={cn(
            "mt-6 p-4 rounded-lg border flex items-center gap-3",
            totalCap < result.totalBTU * 0.9 ? "bg-red-900/20 border-red-900/50 text-red-500" :
            totalCap > result.totalBTU * 1.3 ? "bg-yellow-900/20 border-yellow-900/50 text-yellow-500" :
            "bg-green-900/20 border-green-900/50 text-green-500"
          )}>
            <AlertTriangle className="w-6 h-6 shrink-0" />
            <div>
              <div className="font-bold uppercase text-xs">Análise de Dimensionamento Combinado</div>
              <div className="text-sm">
                {totalCap < result.totalBTU * 0.9 ? `SUBDIMENSIONADO: A soma das capacidades (${formatBTU(totalCap)}) não supre a carga térmica necessária.` :
                 totalCap > result.totalBTU * 1.3 ? `SOBREDIMENSIONADO: A soma das capacidades (${formatBTU(totalCap)}) é excessiva para este ambiente.` :
                 `DIMENSIONAMENTO CORRETO: A soma das capacidades (${formatBTU(totalCap)}) atende à carga térmica calculada.`}
              </div>
            </div>
          </div>
        );
      })()}

      <div className="flex flex-wrap gap-4 no-print mt-8">
            <button onClick={() => setView('report')} className="hvac-button flex items-center gap-2">
              <FileText className="w-4 h-4" /> Ver Relatório Completo
            </button>
            <button onClick={saveOrUpdateCalculation} disabled={loading} className="hvac-button-outline flex items-center gap-2">
              <Save className="w-4 h-4" /> {editingId ? "Atualizar Cálculo" : "Salvar Cálculo"}
            </button>
            <button onClick={() => setStep(1)} className="text-gray-400 hover:text-white transition-colors">
              Novo Cálculo
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
