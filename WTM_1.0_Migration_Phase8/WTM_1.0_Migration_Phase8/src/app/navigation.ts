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
  { id: 'calculator', label: 'Trajectory Converter', icon: '⇄', group: 'Workspace', title: 'Trajectory Converter', subtitle: 'Convert one or many trajectory references in an Excel-like grid.', migrated: true },
  { id: 'database', label: 'Database Manager', icon: '▦', group: 'Workspace', title: 'Database Manager', subtitle: 'Import, inspect, QC, edit and export trajectory data.', migrated: true },
  { id: 'splitter', label: 'Trajectory Splitter', icon: '⋮', group: 'Tools', title: 'Trajectory Splitter', subtitle: 'Resample a well into regular MD, TVD, or elevation intervals.', migrated: true },
  { id: 'studio', label: 'Trajectory Studio', icon: '◫', group: 'Tools', title: 'Trajectory Studio', subtitle: '3D, plan, geological section and directional diagnostic workspace.', migrated: true },
  { id: 'distance', label: 'Well Distance', icon: '↔', group: 'Tools', title: 'Well Distance', subtitle: 'Radius, pair, offset-corridor and XYZ point distance analysis.', migrated: true },
  { id: 'coordinate', label: 'Coordinate Converter', icon: '⌖', group: 'Tools', title: 'Coordinate Converter', subtitle: 'Convert one or many WGS84 geographic and UTM coordinates.', migrated: true },
];
