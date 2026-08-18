import React, { useState, useEffect } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { auth } from './firebase';
import Layout from './components/Layout';
import Login from './pages/Login';
import { PageView } from './types';
import Dashboard from './pages/Dashboard';
import Inbound from './pages/Inbound';
import Outbound from './pages/outbound';
import Inventory from './pages/Inventory';
import Logs from './pages/Logs';

const App: React.FC = () => {
  const [currentPage, setCurrentPage] = useState<PageView>('DASHBOARD');
  const [user, setUser] = useState<User | null>(null);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setIsCheckingAuth(false);
    });
    return unsubscribe;
  }, []);

  const renderPage = () => {
    switch (currentPage) {
      case 'DASHBOARD': return <Dashboard />;
      case 'INBOUND': return <Inbound />;
      case 'OUTBOUND': return <Outbound />;
      case 'INVENTORY': return <Inventory />;
      case 'LOGS': return <Logs />;
      default: return <Dashboard />;
    }
  };

  if (isCheckingAuth) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 text-slate-400 text-sm">
        로그인 확인 중...
      </div>
    );
  }

  if (!user) {
    return <Login />;
  }

  return (
    <Layout currentPage={currentPage} onNavigate={setCurrentPage}>
      {renderPage()}
    </Layout>
  );
};

export default App;