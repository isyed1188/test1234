import { useState } from 'react';
import Header from './components/Header.jsx';
import Dashboard from './components/Dashboard.jsx';
import SearchPanel from './components/SearchPanel.jsx';
import Applications from './components/Applications.jsx';
import ResumeManager from './components/ResumeManager.jsx';
import ProfileManager from './components/ProfileManager.jsx';
import NotificationsPanel from './components/NotificationsPanel.jsx';
import LogsViewer from './components/LogsViewer.jsx';

export default function App() {
  const [tab, setTab] = useState('dashboard');

  const tabs = [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'search', label: 'Search & Import' },
    { id: 'applications', label: 'Applications' },
    { id: 'resumes', label: 'Resume Manager' },
    { id: 'profile', label: 'Profile' },
    { id: 'notifications', label: 'Notifications & Settings' },
    { id: 'logs', label: 'Logs' }
  ];

  return (
    <div className="app">
      <Header tabs={tabs} active={tab} onSelect={setTab} />
      <main className="content">
        {tab === 'dashboard' && <Dashboard onGo={setTab} />}
        {tab === 'search' && <SearchPanel />}
        {tab === 'applications' && <Applications />}
        {tab === 'resumes' && <ResumeManager />}
        {tab === 'profile' && <ProfileManager />}
        {tab === 'notifications' && <NotificationsPanel />}
        {tab === 'logs' && <LogsViewer />}
      </main>
    </div>
  );
}
