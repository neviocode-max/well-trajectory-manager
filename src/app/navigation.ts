export type ModuleId =
  | 'dashboard'
  | 'calculator'
  | 'database'
  | 'splitter'
  | 'studio'
  | 'distance'
  | 'coordinate';

export interface NavModule {
  id: ModuleId;
  label: string;
  icon: string;
  group: 'Workspace' | 'Tools';
  title: string;
  subtitle: string;
  migrated: boolean;
}

export const NAV_MODULES: NavModule[] = [
  { id: 'dashboard', label: 'Dashboard', icon: '⌂', group: 'Workspace', title: 'Dashboard', subtitle: 'Project overview and survey data viewer.', migrated: true },
  { id: 'calculator', label: 'Trajectory Converter', icon: '⇄', group: 'Workspace', title: 'Trajectory Converter', subtitle: 'Migration scheduled for Phase 4.', migrated: false },
  { id: 'database', label: 'Database Manager', icon: '▦', group: 'Workspace', title: 'Database Manager', subtitle: 'Import, inspect, QC, edit and export trajectory data.', migrated: true },
  { id: 'splitter', label: 'Trajectory Splitter', icon: '⋮', group: 'Tools', title: 'Trajectory Splitter', subtitle: 'Migration scheduled for Phase 4.', migrated: false },
  { id: 'studio', label: 'Trajectory Studio', icon: '◫', group: 'Tools', title: 'Trajectory Studio', subtitle: 'Migration scheduled for Phase 6.', migrated: false },
  { id: 'distance', label: 'Well Distance', icon: '↔', group: 'Tools', title: 'Well Distance', subtitle: 'Migration scheduled for Phase 5.', migrated: false },
  { id: 'coordinate', label: 'Coordinate Converter', icon: '⌖', group: 'Tools', title: 'Coordinate Converter', subtitle: 'Migration scheduled for Phase 4.', migrated: false },
];
