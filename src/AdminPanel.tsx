import React, { useState, useEffect } from 'react';
import { db } from './firebase';
import { collection, query, getDocs, doc, updateDoc, orderBy } from 'firebase/firestore';
import { UserProfile } from './types';
import { Shield, Users, History, CheckCircle, XCircle, Clock } from 'lucide-react';
import { format } from 'date-fns';

export default function AdminPanel() {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [logins, setLogins] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'users' | 'logins'>('users');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const usersSnap = await getDocs(collection(db, 'users'));
      const usersList = usersSnap.docs.map(d => d.data() as UserProfile);
      setUsers(usersList);

      const loginsSnap = await getDocs(query(collection(db, 'logins'), orderBy('timestamp', 'desc')));
      const loginsList = loginsSnap.docs.map(d => d.data());
      setLogins(loginsList);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  const updateUserStatus = async (uid: string, status: UserProfile['status']) => {
    try {
      await updateDoc(doc(db, 'users', uid), { status });
      setUsers(users.map(u => u.uid === uid ? { ...u, status } : u));
    } catch (e) {
      console.error(e);
    }
  };

  if (loading) return <div className="p-8 text-center">Carregando dados administrativos...</div>;

  return (
    <div className="max-w-6xl mx-auto p-4">
      <div className="flex items-center gap-3 mb-8">
        <Shield className="w-8 h-8 text-green-500" />
        <h1 className="text-2xl font-bold">Painel do Administrador</h1>
      </div>

      <div className="flex gap-4 mb-6">
        <button 
          onClick={() => setTab('users')}
          className={cn("px-4 py-2 rounded-lg flex items-center gap-2", tab === 'users' ? "bg-green-600" : "bg-[#111111] hover:bg-[#222222]")}
        >
          <Users className="w-4 h-4" /> Usuários
        </button>
        <button 
          onClick={() => setTab('logins')}
          className={cn("px-4 py-2 rounded-lg flex items-center gap-2", tab === 'logins' ? "bg-green-600" : "bg-[#111111] hover:bg-[#222222]")}
        >
          <History className="w-4 h-4" /> Histórico de Logins
        </button>
      </div>

      {tab === 'users' ? (
        <div className="hvac-card overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-bottom border-[#333333] text-gray-500 text-sm">
                <th className="pb-4 font-medium">Nome / Email</th>
                <th className="pb-4 font-medium">Status</th>
                <th className="pb-4 font-medium">Trial Fim</th>
                <th className="pb-4 font-medium">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#333333]">
              {users.map(u => (
                <tr key={u.uid} className="hover:bg-white/5 transition-colors">
                  <td className="py-4">
                    <div className="font-bold">{u.name}</div>
                    <div className="text-xs text-gray-500">{u.email}</div>
                  </td>
                  <td className="py-4">
                    <span className={cn(
                      "px-2 py-1 rounded text-xs font-bold uppercase",
                      u.status === 'liberado' ? "bg-green-900/30 text-green-500" : 
                      u.status === 'trial' ? "bg-blue-900/30 text-blue-500" : "bg-red-900/30 text-red-500"
                    )}>
                      {u.status}
                    </span>
                  </td>
                  <td className="py-4 text-sm font-mono">
                    {format(new Date(u.trialEnd), 'dd/MM/yyyy')}
                  </td>
                  <td className="py-4">
                    <div className="flex gap-2">
                      <button 
                        onClick={() => updateUserStatus(u.uid, 'liberado')}
                        className="p-1 hover:text-green-500 transition-colors" title="Liberar"
                      >
                        <CheckCircle className="w-5 h-5" />
                      </button>
                      <button 
                        onClick={() => updateUserStatus(u.uid, 'bloqueado')}
                        className="p-1 hover:text-red-500 transition-colors" title="Bloquear"
                      >
                        <XCircle className="w-5 h-5" />
                      </button>
                      <button 
                        onClick={() => updateUserStatus(u.uid, 'trial')}
                        className="p-1 hover:text-blue-500 transition-colors" title="Reset Trial"
                      >
                        <Clock className="w-5 h-5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="hvac-card">
          <div className="space-y-4">
            {logins.map((l, i) => (
              <div key={i} className="flex justify-between items-center p-3 border-b border-[#333333] last:border-0">
                <div>
                  <div className="font-bold">{l.name}</div>
                  <div className="text-xs text-gray-400">{l.email}</div>
                </div>
                <div className="text-sm font-mono text-green-500">
                  {format(new Date(l.timestamp), 'dd/MM/yyyy HH:mm:ss')}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function cn(...inputs: any[]) {
  return inputs.filter(Boolean).join(' ');
}
