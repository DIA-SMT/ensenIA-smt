import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import MainLayout from './layouts/MainLayout';
import Dashboard from './pages/Dashboard';
import Agenda from './pages/Agenda';
import Planner from './pages/Planner';
import Students from './pages/Students';
import Evaluations from './pages/Evaluations';
import IALab from './pages/IALab';
import Materials from './pages/Materials';
import Alerts from './pages/Alerts';
import Settings from './pages/Settings';
import DirectorDashboard from './pages/DirectorDashboard';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<MainLayout />}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="agenda" element={<Agenda />} />
          <Route path="planner" element={<Planner />} />
          <Route path="students" element={<Students />} />
          <Route path="evaluations" element={<Evaluations />} />
          <Route path="ia-lab" element={<IALab />} />
          <Route path="materials" element={<Materials />} />
          <Route path="alerts" element={<Alerts />} />
          <Route path="settings" element={<Settings />} />
          <Route path="director" element={<DirectorDashboard />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
