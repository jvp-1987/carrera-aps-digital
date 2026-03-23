import { Toaster } from "sonner"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import { ImportProvider } from '@/lib/ImportContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';

import Layout from '@/components/Layout';
import Dashboard from '@/pages/Dashboard';
import Employees from '@/pages/Employees';
import EmployeeForm from '@/pages/EmployeeForm';
import EmployeeProfile from '@/pages/EmployeeProfile';
import TrainingModule from '@/pages/TrainingModule';
import Resolutions from '@/pages/Resolutions';
import Alerts from '@/pages/Alerts';
import BudgetProjection from '@/pages/BudgetProjection';
import ImportModule from '@/pages/ImportModule';
import GestionEspecial from '@/pages/GestionEspecial';
import DataAudit from '@/pages/DataAudit';
import AuditSolapamientos from '@/pages/AuditSolapamientos';
import ReimportarPeriodos from '@/pages/ReimportarPeriodos';

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin } = useAuth();

  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
      </div>
    );
  }

  if (authError) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    } else if (authError.type === 'auth_required') {
      navigateToLogin();
      return null;
    }
  }

  return (
    <Routes>
      <Route path="/" element={<Navigate to="/Dashboard" replace />} />
      <Route element={<Layout />}>
        <Route path="/Dashboard" element={<Dashboard />} />
        <Route path="/Employees" element={<Employees />} />
        <Route path="/EmployeeForm" element={<EmployeeForm />} />
        <Route path="/EmployeeProfile" element={<EmployeeProfile />} />
        <Route path="/TrainingModule" element={<TrainingModule />} />
        <Route path="/Resolutions" element={<Resolutions />} />
        <Route path="/Alerts" element={<Alerts />} />
        <Route path="/BudgetProjection" element={<BudgetProjection />} />
        <Route path="/ImportModule" element={<ImportModule />} />
        <Route path="/GestionEspecial" element={<GestionEspecial />} />
        <Route path="/DataAudit" element={<DataAudit />} />
        <Route path="/AuditSolapamientos" element={<AuditSolapamientos />} />
        <Route path="/ReimportarPeriodos" element={<ReimportarPeriodos />} />
      </Route>
      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
};

function App() {
  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <ImportProvider>
          <Router>
            <AuthenticatedApp />
            <Toaster richColors position="top-right" />
          </Router>
        </ImportProvider>
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App