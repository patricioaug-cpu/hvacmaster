import React, { useState } from 'react';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, sendPasswordResetEmail } from 'firebase/auth';
import { auth } from './firebase';
import { LogIn, UserPlus, Mail, Lock, User as UserIcon, AlertCircle, Check, Calculator, HelpCircle } from 'lucide-react';

export default function Auth() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  const handleResetPassword = async () => {
    if (!email) {
      setError('Por favor, insira seu e-mail para redefinir a senha.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await sendPasswordResetEmail(auth, email);
      setResetSent(true);
      setError('');
    } catch (err: any) {
      console.error(err);
      setError('Erro ao enviar e-mail de redefinição. Verifique o endereço digitado.');
    }
    setLoading(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (isLogin) {
        await signInWithEmailAndPassword(auth, email, password);
      } else {
        await createUserWithEmailAndPassword(auth, email, password);
        // Profile creation is handled in AuthContext.tsx via onAuthStateChanged
      }
    } catch (err: any) {
      console.error(err);
      let message = 'Ocorreu um erro na autenticação.';
      
      switch (err.code) {
        case 'auth/email-already-in-use':
          message = 'Este e-mail já está em uso por outra conta.';
          break;
        case 'auth/invalid-email':
          message = 'O endereço de e-mail não é válido.';
          break;
        case 'auth/weak-password':
          message = 'A senha é muito fraca. Use pelo menos 6 caracteres.';
          break;
        case 'auth/user-not-found':
        case 'auth/wrong-password':
        case 'auth/invalid-credential':
          message = 'E-mail ou senha incorretos. Verifique seus dados ou use "Esqueceu a senha?".';
          break;
        case 'auth/too-many-requests':
          message = 'Muitas tentativas malsucedidas. Tente novamente mais tarde.';
          break;
      }
      
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[80vh] flex items-center justify-center p-4">
      <div className="hvac-card w-full max-w-md">
        <div className="flex justify-center mb-6">
          <div className="flex items-center gap-2">
            <div className="bg-green-600 p-2 rounded-lg">
              <Calculator className="w-8 h-8 text-white" />
            </div>
            <span className="font-black text-3xl tracking-tighter text-white">HVAC<span className="text-green-500">MASTER</span></span>
          </div>
        </div>
        <div className="text-center mb-8">
          <div className="bg-green-600/20 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
            {isLogin ? <LogIn className="text-green-500 w-8 h-8" /> : <UserPlus className="text-green-500 w-8 h-8" />}
          </div>
          <h1 className="text-2xl font-bold">{isLogin ? 'Bem-vindo de volta' : 'Crie sua conta'}</h1>
          <p className="text-gray-400 text-sm mt-2">
            {isLogin ? 'Acesse o sistema de dimensionamento técnico' : 'Comece seu período de avaliação de 7 dias'}
          </p>
        </div>

        {resetSent && (
          <div className="bg-green-900/20 border border-green-900/50 text-green-500 p-3 rounded-lg mb-6 flex items-center gap-2 text-sm">
            <Check className="w-4 h-4 shrink-0" />
            E-mail de redefinição enviado! Verifique sua caixa de entrada.
          </div>
        )}

        {error && (
          <div className="bg-red-900/20 border border-red-900/50 text-red-500 p-3 rounded-lg mb-6 flex items-center gap-2 text-sm">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {!isLogin && (
            <div className="space-y-1">
              <label className="text-xs text-gray-500 uppercase font-bold">Nome Completo</label>
              <div className="relative">
                <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                <input 
                  type="text" 
                  required 
                  className="hvac-input-with-icon w-full" 
                  placeholder="Seu nome"
                  value={name}
                  onChange={e => setName(e.target.value)}
                />
              </div>
            </div>
          )}

          <div className="space-y-1">
            <label className="text-xs text-gray-500 uppercase font-bold">E-mail</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <input 
                type="email" 
                required 
                className="hvac-input-with-icon w-full" 
                placeholder="exemplo@email.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1">
            <div className="flex justify-between items-center">
              <label className="text-xs text-gray-500 uppercase font-bold">Senha</label>
              {isLogin && (
                <button 
                  type="button"
                  onClick={handleResetPassword}
                  className="text-[10px] text-green-500 hover:underline"
                >
                  Esqueceu a senha?
                </button>
              )}
            </div>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <input 
                type="password" 
                required 
                className="hvac-input-with-icon w-full" 
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
              />
            </div>
          </div>

          <button 
            type="submit" 
            disabled={loading}
            className="hvac-button w-full mt-4 py-3"
          >
            {loading ? 'Processando...' : (isLogin ? 'Entrar' : 'Cadastrar')}
          </button>
        </form>

        <div className="mt-6 text-center">
          <button 
            onClick={() => setIsLogin(!isLogin)}
            className="text-sm text-green-500 hover:text-green-400 transition-colors"
          >
            {isLogin ? 'Não tem uma conta? Cadastre-se' : 'Já tem uma conta? Entre aqui'}
          </button>
        </div>
      </div>
    </div>
  );
}
