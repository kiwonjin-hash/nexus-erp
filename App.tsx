import React, { useState } from 'react';
import Layout from './components/Layout';
import { PageView } from './types';
import Dashboard from './pages/Dashboard';
import Inbound from './pages/Inbound';
import Outbound from './pages/Outbound';
import Inventory from './pages/Inventory';
import Logs from './pages/Logs';

const App: React.FC = () => {
  const [currentPage, setCurrentPage] = useState<PageView>('DASHBOARD');

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

  return (
    <Layout currentPage={currentPage} onNavigate={setCurrentPage}>
      {renderPage()}
    </Layout>
  );
};

export default App;