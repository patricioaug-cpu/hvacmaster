import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, getDoc, setDoc, collection, addDoc } from 'firebase/firestore';
import { auth, db } from './firebase';
import { UserProfile } from './types';
import { addDays } from 'date-fns';

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  isAdmin: boolean;
  isTrialExpired: boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  loading: true,
  isAdmin: false,
  isTrialExpired: false,
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      
      if (firebaseUser) {
        const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
        
        if (userDoc.exists()) {
          setProfile(userDoc.data() as UserProfile);
        } else {
          // Create default profile for new user
          const now = new Date();
          const trialEnd = addDays(now, 7);
          
          const newProfile: UserProfile = {
            uid: firebaseUser.uid,
            name: firebaseUser.displayName || 'Usuário',
            email: firebaseUser.email || '',
            role: firebaseUser.email === 'patricioaug@gmail.com' ? 'admin' : 'user',
            status: 'trial',
            trialStart: now.toISOString(),
            trialEnd: trialEnd.toISOString(),
            createdAt: now.toISOString(),
          };
          
          await setDoc(doc(db, 'users', firebaseUser.uid), newProfile);
          setProfile(newProfile);
        }

        // Log login and send alert via server
        try {
          await fetch('/api/log-login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: firebaseUser.displayName || 'Usuário',
              email: firebaseUser.email,
              timestamp: new Date().toISOString(),
            }),
          });
          
          await addDoc(collection(db, 'logins'), {
            userId: firebaseUser.uid,
            email: firebaseUser.email,
            name: firebaseUser.displayName || 'Usuário',
            timestamp: new Date().toISOString(),
          });
        } catch (e) {
          console.error("Error logging login", e);
        }
      } else {
        setProfile(null);
      }
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  const isAdmin = profile?.role === 'admin' || user?.email === 'patricioaug@gmail.com';
  const isTrialExpired = profile?.status === 'trial' && new Date() > new Date(profile.trialEnd) && !isAdmin;

  return (
    <AuthContext.Provider value={{ user, profile, loading, isAdmin, isTrialExpired }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
