import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { DatabaseProvider, useDatabase, useDatabaseSnapshot } from './app/DatabaseContext';
import { AuthProvider, useAuth } from './app/AuthContext';
import { NAV_MODULES, type ModuleId } from './app/navigation';
import { Dashboard } from './pages/Dashboard';
import { DatabaseManager } from './pages/DatabaseManager';
import { TrajectoryConverter } from './pages/TrajectoryConverter';
import { TrajectorySplitter } from './pages/TrajectorySplitter';
import { CoordinateConverter } from './pages/CoordinateConverter';
import type { ClosestApproachHandoff } from './pages/WellDistance';
import type { ConverterFocusRequest, StudioFocusRequest } from './types/studio';
import { preferences, type Theme } from './services/preferences';
import { Icon } from './components/common/Icon';
import logoUrl from './assets/wtm-logo.png';

const WellDistance = lazy(() => import('./pages/WellDistance').then(module => ({ default: module.WellDistance })));
const TrajectoryStudio = lazy(() => import('./pages/TrajectoryStudio').then(module => ({ default: module.TrajectoryStudio })));

function ModuleLoading() {
  return (
    <div className="content">
      <div className="card loading-card"><span className="loading-spinner" /> Loading workspace…</div>
    </div>
  );
}

function WtmShell() {
  const database = useDatabase();
  const snapshot = useDatabaseSnapshot();
  const auth = useAuth();
  const [moduleId, setModuleId] = useState<ModuleId>('dashboard');
  const [theme, setTheme] = useState<Theme>(() => preferences.getTheme());
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [studioHandoff, setStudioHandoff] = useState<ClosestApproachHandoff | null>(null);
  const [studioFocus, setStudioFocus] = useState<StudioFocusRequest | null>(null);
  const [converterFocus, setConverterFocus] = useState<ConverterFocusRequest | null>(null);

  const module = useMemo(() => NAV_MODULES.find(item => item.id === moduleId) ?? NAV_MODULES[0], [moduleId]);
  const stats = database.stats();
  const projectName = snapshot.meta.project.trim() || 'Project not set';
  const crsName = snapshot.meta.crs.trim() || 'CRS not set';
  const databaseName = snapshot.lastImport || 'No database loaded';

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    preferences.setTheme(theme);
  }, [theme]);

  const selectModule = (id: ModuleId) => {
    setModuleId(id);
    setMobileNavOpen(false);
  };

  const openStudio = (request: StudioFocusRequest) => {
    setStudioHandoff(null);
    setStudioFocus(request);
    setModuleId('studio');
  };

  const openConverter = (request: ConverterFocusRequest) => {
    setConverterFocus(request);
    setModuleId('calculator');
  };

  const content = (() => {
    switch (moduleId) {
      case 'dashboard': return <Dashboard />;
      case 'database': return <DatabaseManager onPlotWell={well => openStudio({ well, token: Date.now() })} />;
      case 'calculator': return <TrajectoryConverter focusRequest={converterFocus} onFocusConsumed={() => setConverterFocus(null)} onShowInStudio={openStudio} />;
      case 'splitter': return <TrajectorySplitter />;
      case 'coordinate': return <CoordinateConverter />;
      case 'distance': return <WellDistance onShowClosestApproach={handoff => { setStudioFocus(null); setStudioHandoff(handoff); setModuleId('studio'); }} />;
      case 'studio': return <TrajectoryStudio
        handoff={studioHandoff}
        focusRequest={studioFocus}
        themeKey={theme}
        onHandoffConsumed={() => setStudioHandoff(null)}
        onFocusConsumed={() => setStudioFocus(null)}
        onShowInConverter={openConverter}
      />;
      default: return null;
    }
  })();

  return (
    <div className="app">
      <aside className={`sidebar ${mobileNavOpen ? 'open' : ''}`} aria-label="Primary navigation">
        <div className="brand">
          <img className="brand-logo" src={logoUrl} alt="WTM logo" />
          <div className="brand-copy">
            <h1>Well Trajectory Manager</h1>
            <p>Engineering workspace</p>
          </div>
          <span className="version-pill">v1.0</span>
        </div>

        <nav className="nav">
          {(['Workspace', 'Tools'] as const).map(group => (
            <div key={group} className="nav-group">
              <div className="nav-label">{group}</div>
              {NAV_MODULES.filter(item => item.group === group).map(item => (
                <button
                  key={item.id}
                  type="button"
                  className={`nav-item ${moduleId === item.id ? 'active' : ''}`}
                  onClick={() => selectModule(item.id)}
                  aria-current={moduleId === item.id ? 'page' : undefined}
                >
                  <span className="ico"><Icon name={item.id} size={17} /></span>
                  <span className="nav-item-label">{item.label}</span>
                </button>
              ))}
            </div>
          ))}
        </nav>

        <div className="side-foot">
          <div className="side-foot-head">
            <h4>Current Database</h4>
            <span className={`database-state ${stats.wells ? 'ready' : 'empty'}`}>{stats.wells ? 'Ready' : 'Empty'}</span>
          </div>
          <div className="dbinfo-row"><span>Wells</span><b>{stats.wells}</b></div>
          <div className="dbinfo-row"><span>Stations</span><b>{stats.stations}</b></div>
          <div className="file" title={databaseName}>{databaseName}</div>
          <div className="project-label" title={projectName}>{projectName}</div>
          <button className="theme-btn" type="button" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
            <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={15} />
            {theme === 'dark' ? 'Light theme' : 'Dark theme'}
          </button>
        </div>
      </aside>

      {mobileNavOpen ? <button type="button" aria-label="Close navigation" className="mobile-scrim" onClick={() => setMobileNavOpen(false)} /> : null}

      <main className={`main ${moduleId === 'studio' ? 'studio-main-shell' : ''}`}>
        <header className="topbar">
          <button type="button" className="mobile-menu" onClick={() => setMobileNavOpen(!mobileNavOpen)} aria-label="Open navigation">
            <Icon name="menu" size={20} />
          </button>
          <div className="topbar-copy">
            <h2>{module.title}</h2>
            <p>{module.subtitle}</p>
          </div>
          <div className="spacer" />
          {auth.config.authMode === 'appservice' ? (
            <span className={`auth-badge ${auth.user ? 'ok' : 'warn'}`} title={auth.user?.name || 'Microsoft Entra authentication is enabled by App Service'}>
              {auth.loading ? 'Checking sign-in…' : auth.user ? auth.user.name : 'Entra authentication'}
            </span>
          ) : null}
          <span className={`workspace-state ${stats.wells ? 'ready' : ''}`}>
            <span className="dot" />{stats.wells ? 'Database ready' : 'No database loaded'}
          </span>
        </header>
        <Suspense fallback={<ModuleLoading />}>{content}</Suspense>
      </main>

      <footer className="statusbar" aria-label="Application status">
        <div className="seg status-ready"><span className="dot" /><b>Ready</b></div>
        <span className="sep" />
        <div className="seg">Database <b>{stats.wells} wells</b></div>
        <span className="sep" />
        <div className="seg"><b>{stats.stations}</b> stations</div>
        <div className="push seg status-context" title={`${projectName} · ${crsName}`}>
          <span>{projectName}</span><span className="status-context-sep">·</span><span>{crsName}</span>
        </div>
      </footer>
    </div>
  );
}

export function App() {
  return (
    <AuthProvider>
      <DatabaseProvider>
        <WtmShell />
      </DatabaseProvider>
    </AuthProvider>
  );
}
