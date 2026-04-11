import React, { useState, useEffect } from 'react';
import { CalculationData, CalculationResult } from './types';
import { formatBTU, formatKW, cn } from './lib/utils';
import { Calculator, Sun, Users, Monitor, Lightbulb, ArrowRight, Save, Copy, Check, History, Trash2, Edit2, FileText, ChevronLeft, AlertTriangle, AlertCircle } from 'lucide-react';
import { db } from './firebase';
import { collection, addDoc, query, where, getDocs, orderBy, deleteDoc, doc, updateDoc } from 'firebase/firestore';
import { useAuth } from './AuthContext';

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
    equipmentSelection: {
      brand: '',
      model: '',
      voltage: '220V',
      capacity: 0,
      efficiency: 'A',
    }
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
    
    const orientFactor = data.orientation === 'N' || data.orientation === 'O' ? 1.2 : 1.0;
    sensibleBase *= orientFactor;
    
    const peopleSensible = data.peopleCount * 70;
    const peopleLatent = data.peopleCount * 55;
    const equipLoad = data.equipmentCount * 150;
    const lightFactor = data.lightingType === 'incandescente' ? 1.0 : data.lightingType === 'fluorescente' ? 0.8 : 0.5;
    const lightLoad = data.lightingPower * lightFactor;
    const glassGain = (data.area * (data.glassPercentage / 100)) * 250 * orientFactor;
    
    const totalSensible = sensibleBase + peopleSensible + equipLoad + lightLoad + glassGain;
    const totalLatent = peopleLatent + (data.area * 10);
    
    const totalW = totalSensible + totalLatent;
    const totalBTU = totalW * 3.41214;
    const safetyMargin = 0.15;
    const finalBTU = totalBTU * (1 + safetyMargin);
    
    const recommendedRange = `${Math.floor(finalBTU / 1000) * 1000} - ${Math.ceil((finalBTU * 1.2) / 1000) * 1000} BTU/h`;
    
    const justification = `Cálculo técnico baseado na NBR 16401. Foram considerados ganhos de calor por condução na envoltória (${data.wallType}), radiação solar direta na orientação ${data.orientation}, ocupação metabólica de ${data.peopleCount} pessoas e dissipação térmica de ${data.equipmentCount} equipamentos. Aplicada margem de segurança normativa de 15%.`;

    const newResult: CalculationResult = {
      totalBTU: finalBTU,
      sensibleBTU: totalSensible * 3.41214,
      latentBTU: totalLatent * 3.41214,
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
    setData(calc.data);
    setResult(calc.result);
    setEditingId(calc.id);
    setStep(1);
    setView('calculator');
  };

  const viewReport = (calc: any) => {
    setData(calc.data);
    setResult(calc.result);
    setView('report');
  };

  const copyToClipboard = () => {
    if (!result) return;
    const text = `
RELATÓRIO DE DIMENSIONAMENTO TÉCNICO HVAC
-------------------------------------------
Data: ${new Date().toLocaleDateString('pt-BR')}
Ambiente: ${data.type.toUpperCase()}
Área: ${data.area} m² | Pé-direito: ${data.height} m
Orientação: ${data.orientation}

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
        <div className="flex items-center justify-between mb-8 no-print">
          <button onClick={() => setView('history')} className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors">
            <ChevronLeft className="w-5 h-5" /> Voltar ao Histórico
          </button>
          <div className="flex gap-3">
            <button onClick={copyToClipboard} className="hvac-button flex items-center gap-2">
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              {copied ? "Copiado!" : "Copiar Dados"}
            </button>
          </div>
        </div>

        <div className="report-container mx-auto">
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
              </div>
            </section>
            <section>
              <h2 className="text-sm font-bold border-b border-gray-300 mb-3 uppercase">Equipamento Selecionado</h2>
              <div className="space-y-1 text-sm">
                <p><span className="font-semibold">Marca/Modelo:</span> {data.equipmentSelection?.brand || '-'} / {data.equipmentSelection?.model || '-'}</p>
                <p><span className="font-semibold">Tensão:</span> {data.equipmentSelection?.voltage || '-'}</p>
                <p><span className="font-semibold">Capacidade:</span> {data.equipmentSelection?.capacity ? formatBTU(data.equipmentSelection.capacity) : '-'}</p>
                <div className={cn(
                  "mt-2 p-2 rounded text-[10px] font-bold uppercase border",
                  !data.equipmentSelection?.capacity ? "hidden" :
                  data.equipmentSelection.capacity < result.totalBTU * 0.9 ? "bg-red-50 border-red-200 text-red-700" :
                  data.equipmentSelection.capacity > result.totalBTU * 1.3 ? "bg-yellow-50 border-yellow-200 text-yellow-700" :
                  "bg-green-50 border-green-200 text-green-700"
                )}>
                  {!data.equipmentSelection?.capacity ? "" :
                   data.equipmentSelection.capacity < result.totalBTU * 0.9 ? "Subdimensionado" :
                   data.equipmentSelection.capacity > result.totalBTU * 1.3 ? "Sobredimensionado" :
                   "Dimensionamento Correto"}
                </div>
              </div>
            </section>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 mb-8">
            <section>
              <h2 className="text-sm font-bold border-b border-gray-300 mb-3 uppercase">Carga Térmica Total</h2>
              <div className="bg-gray-50 p-4 rounded border border-gray-200">
                <div className="text-3xl font-black text-black">{formatBTU(result.totalBTU)}</div>
                <div className="text-lg text-gray-600">{formatKW(result.totalBTU)}</div>
                <div className="text-xs text-gray-400 mt-1">Inclui margem de segurança de {result.safetyMargin}%</div>
              </div>
            </section>
          </div>

          <section className="mb-8">
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
              <label className="text-sm text-gray-400 flex items-center gap-2"><Monitor className="w-4 h-4" /> Equipamentos (PCs, etc)</label>
              <input type="number" className="hvac-input" value={data.equipmentCount} onChange={e => setData({...data, equipmentCount: Number(e.target.value)})} />
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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="flex flex-col gap-2">
          <label className="text-sm text-gray-400">Marca do Equipamento</label>
          <input 
            type="text" 
            className="hvac-input" 
            list="brands"
            value={data.equipmentSelection?.brand}
            onChange={e => setData({...data, equipmentSelection: {...data.equipmentSelection!, brand: e.target.value}})}
            placeholder="Ex: LG, Samsung, Daikin"
          />
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
        </div>
        <div className="flex flex-col gap-2">
          <label className="text-sm text-gray-400">Modelo</label>
          <input 
            type="text" 
            className="hvac-input" 
            list="models"
            value={data.equipmentSelection?.model}
            onChange={e => setData({...data, equipmentSelection: {...data.equipmentSelection!, model: e.target.value}})}
            placeholder="Ex: S4-Q12JA3A"
          />
          <datalist id="models">
            <option value="Hi-Wall Inverter" />
            <option value="Hi-Wall On/Off" />
            <option value="Cassete Inverter" />
            <option value="Piso Teto" />
            <option value="Multi Split" />
            <option value="Duto / Central" />
          </datalist>
        </div>
        <div className="flex flex-col gap-2">
          <label className="text-sm text-gray-400">Tensão (V)</label>
          <select 
            className="hvac-input"
            value={data.equipmentSelection?.voltage}
            onChange={e => setData({...data, equipmentSelection: {...data.equipmentSelection!, voltage: e.target.value}})}
          >
            <option value="110V">110V</option>
            <option value="220V">220V</option>
            <option value="380V">380V</option>
          </select>
        </div>
        <div className="flex flex-col gap-2">
          <label className="text-sm text-gray-400">Capacidade Nominal (BTU/h)</label>
          <div className="flex gap-2">
            <select 
              className="hvac-input flex-1"
              value={[7000, 9000, 12000, 18000, 24000, 30000, 36000, 48000, 60000].includes(data.equipmentSelection?.capacity || 0) ? (data.equipmentSelection?.capacity || '') : 'custom'}
              onChange={e => {
                const val = e.target.value;
                if (val === 'custom') {
                  setData({...data, equipmentSelection: {...data.equipmentSelection!, capacity: 0}});
                } else {
                  setData({...data, equipmentSelection: {...data.equipmentSelection!, capacity: Number(val)}});
                }
              }}
            >
              <option value="">Selecionar...</option>
              {[7000, 9000, 12000, 18000, 24000, 30000, 36000, 48000, 60000].map(cap => (
                <option key={cap} value={cap}>{cap} BTU/h</option>
              ))}
              <option value="custom">Outra (Digitar)...</option>
            </select>
            {(data.equipmentSelection?.capacity === 0 || !data.equipmentSelection?.capacity) && (
              <button 
                onClick={() => {
                  const standardCapacities = [7000, 9000, 12000, 18000, 24000, 30000, 36000, 48000, 60000];
                  const suggested = standardCapacities.find(c => c >= result.totalBTU) || 60000;
                  setData({...data, equipmentSelection: {...data.equipmentSelection!, capacity: suggested}});
                }}
                className="text-[10px] bg-green-600/20 text-green-500 px-2 rounded hover:bg-green-600/30 transition-colors"
              >
                Sugerir
              </button>
            )}
          </div>
          {(![7000, 9000, 12000, 18000, 24000, 30000, 36000, 48000, 60000].includes(data.equipmentSelection?.capacity || 0) || data.equipmentSelection?.capacity === 0) && (
             <input 
              type="number" 
              className="hvac-input mt-2" 
              placeholder="Digite a capacidade em BTU/h"
              value={data.equipmentSelection?.capacity || ''}
              onChange={e => setData({...data, equipmentSelection: {...data.equipmentSelection!, capacity: Number(e.target.value)}})}
            />
          )}
        </div>
      </div>

      {data.equipmentSelection?.capacity ? (
        <div className={cn(
          "mt-6 p-4 rounded-lg border flex items-center gap-3",
          data.equipmentSelection.capacity < result.totalBTU * 0.9 ? "bg-red-900/20 border-red-900/50 text-red-500" :
          data.equipmentSelection.capacity > result.totalBTU * 1.3 ? "bg-yellow-900/20 border-yellow-900/50 text-yellow-500" :
          "bg-green-900/20 border-green-900/50 text-green-500"
        )}>
          <AlertTriangle className="w-6 h-6 shrink-0" />
          <div>
            <div className="font-bold uppercase text-xs">Análise de Dimensionamento</div>
            <div className="text-sm">
              {data.equipmentSelection.capacity < result.totalBTU * 0.9 ? "SUBDIMENSIONADO: O equipamento não suprirá a carga térmica necessária." :
               data.equipmentSelection.capacity > result.totalBTU * 1.3 ? "SOBREDIMENSIONADO: Capacidade excessiva pode gerar consumo desnecessário e ciclos curtos." :
               "DIMENSIONAMENTO CORRETO: O equipamento atende à carga térmica calculada."}
            </div>
          </div>
        </div>
      ) : null}

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
