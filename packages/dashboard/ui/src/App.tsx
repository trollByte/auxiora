import { Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Login } from './pages/Login';
import { Behaviors } from './pages/Behaviors';
import { Webhooks } from './pages/Webhooks';
import { Sessions } from './pages/Sessions';
import { AuditLog } from './pages/AuditLog';

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<Layout />}>
        <Route index element={<Behaviors />} />
        <Route path="webhooks" element={<Webhooks />} />
        <Route path="sessions" element={<Sessions />} />
        <Route path="audit" element={<AuditLog />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
