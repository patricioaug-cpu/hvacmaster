import React from 'react';
import { AuthProvider, useAuth } from './AuthContext';
import Auth from './Auth';
import ThermalCalculator from './ThermalCalculator';
import AdminPanel from './AdminPanel';
import { LogOut, Shield, Calculator, AlertTriangle, Mail, HelpCircle, X } from 'lucide-react';
import { auth } from './firebase';
import { signOut } from 'firebase/auth';

function AppContent() {
  const { user, profile, loading, isAdmin, isTrialExpired } = useAuth();
  const [view, setView] = React.useState<'calc' | 'admin'>('calc');
  const [showHelp, setShowHelp] = React.useState(false);

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-green-500"></div>
      </div>
    );
  }

  if (!user) {
    return <Auth />;
  }

  if (isTrialExpired && !isAdmin) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center p-4">
        <div className="hvac-card max-w-md text-center">
          <AlertTriangle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold mb-4">Período de Avaliação Encerrado</h1>
          <p className="text-gray-400 mb-8">
            Seu período de 7 dias de teste terminou. Para continuar utilizando todas as ferramentas profissionais de dimensionamento, entre em contato.
          </p>
          <a 
            href="mailto:patricioaug@gmail.com" 
            className="hvac-button inline-flex items-center gap-2 w-full justify-center mb-4"
          >
            <Mail className="w-4 h-4" /> patricioaug@gmail.com
          </a>
          <button 
            onClick={() => signOut(auth)}
            className="text-gray-500 hover:text-white transition-colors text-sm"
          >
            Sair da conta
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white">
      <nav className="border-b border-[#333333] bg-[#0a0a0a] sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-green-600 p-1.5 rounded">
              <Calculator className="w-5 h-5 text-white" />
            </div>
            <span className="font-black text-xl tracking-tighter">HVAC<span className="text-green-500">MASTER</span></span>
          </div>

          <div className="flex items-center gap-4">
            <button 
              onClick={() => setShowHelp(true)}
              className="p-2 text-gray-400 hover:text-green-500 hover:bg-green-500/10 rounded-lg transition-all"
              title="Ajuda / Suporte"
            >
              <HelpCircle className="w-5 h-5" />
            </button>

            {isAdmin && (
              <button 
                onClick={() => setView(view === 'calc' ? 'admin' : 'calc')}
                className={`p-2 rounded-lg transition-colors ${view === 'admin' ? 'bg-green-600 text-white' : 'text-gray-400 hover:bg-white/5'}`}
                title="Painel Admin"
              >
                <Shield className="w-5 h-5" />
              </button>
            )}
            
            <div className="hidden md:block text-right mr-2">
              <div className="text-xs font-bold text-white leading-none">{profile?.name}</div>
              <div className="text-[10px] text-gray-500 uppercase tracking-widest">{profile?.status}</div>
            </div>

            <button 
              onClick={() => signOut(auth)}
              className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-all"
              title="Sair"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </nav>

      <main className="py-8">
        {view === 'admin' && isAdmin ? <AdminPanel /> : <ThermalCalculator />}
      </main>

      {showHelp && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="hvac-card max-w-2xl w-full max-h-[90vh] overflow-y-auto relative">
            <button 
              onClick={() => setShowHelp(false)}
              className="absolute top-4 right-4 text-gray-500 hover:text-white transition-colors"
            >
              <X className="w-6 h-6" />
            </button>

            <div className="flex items-center gap-3 mb-6">
              <HelpCircle className="w-8 h-8 text-green-500" />
              <h2 className="text-2xl font-bold">Guia de Utilização</h2>
            </div>

            <div className="space-y-6 text-gray-300">
              <section>
                <h3 className="text-white font-bold mb-2 flex items-center gap-2">
                  <Calculator className="w-4 h-4 text-green-500" /> O que o sistema calcula?
                </h3>
                <p className="text-sm leading-relaxed">
                  O HVAC Master realiza o dimensionamento da <strong>Carga Térmica</strong> de ambientes, calculando a quantidade de calor que deve ser removida para manter o conforto térmico. O cálculo considera:
                </p>
                <ul className="list-disc list-inside text-xs mt-2 space-y-1 ml-2">
                  <li>Ganhos de calor pela envoltória (paredes e telhados)</li>
                  <li>Radiação solar direta baseada na orientação geográfica</li>
                  <li>Cargas internas (pessoas, iluminação e equipamentos eletrônicos)</li>
                  <li>Ganhos de calor por superfícies envidraçadas</li>
                </ul>
              </section>

              <section>
                <h3 className="text-white font-bold mb-2">Como utilizar o aplicativo?</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                  <div className="bg-white/5 p-3 rounded border border-white/10">
                    <span className="text-green-500 font-bold block mb-1">Passo 1: Ambiente</span>
                    Informe a área, pé-direito e o tipo de uso do local.
                  </div>
                  <div className="bg-white/5 p-3 rounded border border-white/10">
                    <span className="text-green-500 font-bold block mb-1">Passo 2: Envoltória</span>
                    Selecione a orientação solar e os materiais de construção.
                  </div>
                  <div className="bg-white/5 p-3 rounded border border-white/10">
                    <span className="text-green-500 font-bold block mb-1">Passo 3: Cargas</span>
                    Insira o número de ocupantes e potência de equipamentos.
                  </div>
                  <div className="bg-white/5 p-3 rounded border border-white/10">
                    <span className="text-green-500 font-bold block mb-1">Passo 4: Resultado</span>
                    Analise o relatório e verifique se o equipamento escolhido é adequado.
                  </div>
                </div>
              </section>

              <div className="bg-red-900/20 border border-red-900/50 p-4 rounded-lg">
                <h3 className="text-red-500 font-bold mb-2 flex items-center gap-2 uppercase text-sm">
                  <AlertTriangle className="w-5 h-5" /> Advertência Importante
                </h3>
                <p className="text-xs text-red-200 leading-relaxed">
                  Este software é uma ferramenta de auxílio técnico baseada em normas (NBR 16401). Os resultados são estimativas e <strong>não substituem</strong> o projeto executivo. 
                  <br /><br />
                  <strong>É IMPRESCINDÍVEL</strong> consultar um <strong>Engenheiro Mecânico especialista em Ar Condicionado</strong> para a validação final do projeto, seleção de sistemas complexos e emissão de ART (Anotação de Responsabilidade Técnica).
                </p>
              </div>

              <div className="pt-4 border-t border-white/10 flex justify-between items-center">
                <p className="text-[10px] text-gray-500 italic">Suporte: patricioaug@gmail.com</p>
                <button onClick={() => setShowHelp(false)} className="hvac-button">Entendido</button>
              </div>
            </div>
          </div>
        </div>
      )}

      <footer className="border-t border-[#333333] py-8 mt-12 text-center text-gray-600 text-xs">
        <p>© 2026 HVAC Master - Dimensionamento Técnico Profissional</p>
        <p className="mt-1">Baseado na NBR 16401 e Métodos ASHRAE</p>
      </footer>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
