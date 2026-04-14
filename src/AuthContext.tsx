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
  isDeviceBlocked: boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  loading: true,
  isAdmin: false,
  isTrialExpired: false,
  isDeviceBlocked: false,
});

// Helper to get or create a persistent Device ID
const getDeviceId = () => {
  let deviceId = localStorage.getItem('hvac_master_device_id');
  if (!deviceId) {
    deviceId = crypto.randomUUID();
    localStorage.setItem('hvac_master_device_id', deviceId);
  }
  return deviceId;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [isDeviceBlocked, setIsDeviceBlocked] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      setIsDeviceBlocked(false);
      
      if (firebaseUser) {
        const deviceId = getDeviceId();
        const deviceRef = doc(db, 'devices', deviceId);
        const deviceDoc = await getDoc(deviceRef);
        
        const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
        let currentProfile: UserProfile;
        
        if (userDoc.exists()) {
          currentProfile = userDoc.data() as UserProfile;
          setProfile(currentProfile);
        } else {
          // Create default profile for new user
          const now = new Date();
          const trialEnd = addDays(now, 7);
          
          currentProfile = {
            uid: firebaseUser.uid,
            name: firebaseUser.displayName || 'Usuário',
            email: firebaseUser.email || '',
            role: firebaseUser.email === 'patricioaug@gmail.com' ? 'admin' : 'user',
            status: 'trial',
            trialStart: now.toISOString(),
            trialEnd: trialEnd.toISOString(),
            createdAt: now.toISOString(),
          };
          
          await setDoc(doc(db, 'users', firebaseUser.uid), currentProfile);
          setProfile(currentProfile);
        }

        // Device Trial Logic
        const isAdminUser = currentProfile.role === 'admin' || firebaseUser.email === 'patricioaug@gmail.com';
        const isPaidUser = currentProfile.status === 'liberado';
        
        if (deviceDoc.exists()) {
          const deviceData = deviceDoc.data();
          const deviceTrialEnd = new Date(deviceData.trialEnd);
          
          // If device trial expired and user is not admin/paid, block device
          if (new Date() > deviceTrialEnd && !isAdminUser && !isPaidUser) {
            setIsDeviceBlocked(true);
          }
        } else {
          // Register this device with the current user's trial end
          await setDoc(deviceRef, {
            firstUser: firebaseUser.uid,
            firstEmail: firebaseUser.email,
            trialEnd: currentProfile.trialEnd,
            createdAt: new Date().toISOString()
          });
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
  const isTrialExpired = (profile?.status === 'trial' && new Date() > new Date(profile.trialEnd) && !isAdmin) || isDeviceBlocked;

  return (
    <AuthContext.Provider value={{ user, profile, loading, isAdmin, isTrialExpired, isDeviceBlocked }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
