import React from 'react';
import { AuthProvider, useAuth } from './AuthContext';
import Auth from './Auth';
import ThermalCalculator from './ThermalCalculator';
import AdminPanel from './AdminPanel';
import { LogOut, Shield, Calculator, AlertTriangle, Mail, HelpCircle } from 'lucide-react';
import { auth } from './firebase';
import { signOut } from 'firebase/auth';

function AppContent() {
  const { user, profile, loading, isAdmin, isTrialExpired } = useAuth();
  const [view, setView] = React.useState<'calc' | 'admin'>('calc');

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
            <a 
              href="mailto:patricioaug@gmail.com?subject=Ajuda HVAC Master"
              className="p-2 text-gray-400 hover:text-green-500 hover:bg-green-500/10 rounded-lg transition-all"
              title="Ajuda / Suporte"
            >
              <HelpCircle className="w-5 h-5" />
            </a>

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
