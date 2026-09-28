import { useEffect, useMemo, useState } from 'react';
import { DatabaseProvider, useDatabase, useDatabaseSnapshot } from './app/DatabaseContext';
import { NAV_MODULES, type ModuleId } from './app/navigation';
import { Dashboard } from './pages/Dashboard';
import { DatabaseManager } from './pages/DatabaseManager';
import { preferences, type Theme } from './services/preferences';
import logoUrl from './assets/wtm-logo.png';

function Placeholder({ title, phase }: { title: string; phase: string }) {
  return (
    <div className="content">
      <section className="card placeholder-card">
        <div className="placeholder-icon">⌁</div>
        <h3>{title}</h3>
        <p>This module has not been migrated yet. Its WTM 4.3 implementation remains the source of truth.</p>
        <span className="migration-badge">Scheduled for {phase}</span>
      </section>
    </div>
  );
}

function WtmShell() {
  const database = useDatabase();
  const snapshot = useDatabaseSnapshot();
  const [moduleId, setModuleId] = useState<ModuleId>('dashboard');
  const [theme, setTheme] = useState<Theme>(() => preferences.getTheme());
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const module = useMemo(() => NAV_MODULES.find(item => item.id === moduleId) ?? NAV_MODULES[0], [moduleId]);
  const stats = database.stats();

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    preferences.setTheme(theme);
  }, [theme]);

  const selectModule = (id: ModuleId) => {
    setModuleId(id);
    setMobileNavOpen(false);
  };

  const content = (() => {
    switch (moduleId) {
      case 'dashboard': return <Dashboard />;
      case 'database': return <DatabaseManager />;
      case 'calculator': return <Placeholder title="Trajectory Converter" phase="Phase 4" />;
      case 'splitter': return <Placeholder title="Trajectory Splitter" phase="Phase 4" />;
      case 'coordinate': return <Placeholder title="Coordinate Converter" phase="Phase 4" />;
      case 'distance': return <Placeholder title="Well Distance" phase="Phase 5" />;
      case 'studio': return <Placeholder title="Trajectory Studio" phase="Phase 6" />;
      default: return null;
    }
  })();

  return (
    <div className="app">
      <aside className={`sidebar ${mobileNavOpen ? 'open' : ''}`}>
        <div className="brand">
          <img className="brand-logo" src={logoUrl} alt="WTM logo" />
          <div className="brand-copy">
            <h1>Well Trajectory Manager</h1>
            <p>Engineering trajectory workspace</p>
          </div>
          <span className="version-pill">1.0</span>
        </div>

        <nav className="nav">
          {(['Workspace', 'Tools'] as const).map(group => (
            <div key={group}>
              <div className="nav-label">{group}</div>
              {NAV_MODULES.filter(item => item.group === group).map(item => (
                <button
                  key={item.id}
                  type="button"
                  className={`nav-item ${moduleId === item.id ? 'active' : ''} ${!item.migrated ? 'planned' : ''}`}
                  onClick={() => selectModule(item.id)}
                >
                  <span className="ico">{item.icon}</span>
                  <span>{item.label}</span>
                  {!item.migrated ? <span className="tag">Next</span> : null}
                </button>
              ))}
            </div>
          ))}
        </nav>

        <div className="side-foot">
          <h4>Current Database</h4>
          <div className="dbinfo-row"><span>Wells</span><b>{stats.wells}</b></div>
          <div className="dbinfo-row"><span>Stations</span><b>{stats.stations}</b></div>
          <div className="file" title={snapshot.lastImport}>{snapshot.lastImport}</div>
          <button className="theme-btn" type="button" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
            {theme === 'dark' ? '☀ Light theme' : '☾ Dark theme'}
          </button>
        </div>
      </aside>

      {mobileNavOpen ? <button type="button" aria-label="Close navigation" className="mobile-scrim" onClick={() => setMobileNavOpen(false)} /> : null}

      <main className="main">
        <header className="topbar">
          <button type="button" className="mobile-menu" onClick={() => setMobileNavOpen(!mobileNavOpen)}>☰</button>
          <div>
            <h2>{module.title}</h2>
            <p>{module.subtitle}</p>
          </div>
          <div className="spacer" />
          <span className="phase-badge">Migration Phase 3</span>
        </header>
        {content}
      </main>

      <footer className="statusbar">
        <div className="seg"><span className="dot" /><b>WTM 1.0</b></div>
        <span className="sep" />
        <div className="seg">Database <b>{stats.wells} wells</b></div>
        <span className="sep" />
        <div className="seg"><b>{stats.stations}</b> stations</div>
        <div className="push seg">React · TypeScript · Empty DB</div>
      </footer>
    </div>
  );
}

export function App() {
  return (
    <DatabaseProvider>
      <WtmShell />
    </DatabaseProvider>
  );
}
