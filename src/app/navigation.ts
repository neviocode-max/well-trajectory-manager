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
  group: 'Workspace' | 'Tools';
  title: string;
  subtitle: string;
}

export const NAV_MODULES: NavModule[] = [
  { id: 'dashboard', label: 'Dashboard', group: 'Workspace', title: 'Dashboard', subtitle: 'Database overview and survey data viewer.' },
  { id: 'calculator', label: 'Trajectory Converter', group: 'Workspace', title: 'Trajectory Converter', subtitle: 'Convert trajectory references in a spreadsheet-style workspace.' },
  { id: 'database', label: 'Database Manager', group: 'Workspace', title: 'Database Manager', subtitle: 'Import, inspect, quality-check, edit and export trajectory data.' },
  { id: 'splitter', label: 'Trajectory Splitter', group: 'Tools', title: 'Trajectory Splitter', subtitle: 'Resample a trajectory at regular MD, TVD or elevation intervals.' },
  { id: 'studio', label: 'Trajectory Studio', group: 'Tools', title: 'Trajectory Studio', subtitle: '3D, plan, section and directional-diagnostic workspace.' },
  { id: 'distance', label: 'Well Distance', group: 'Tools', title: 'Well Distance', subtitle: 'Radius, well-pair, offset-corridor and point-distance analysis.' },
  { id: 'coordinate', label: 'Coordinate Converter', group: 'Tools', title: 'Coordinate Converter', subtitle: 'Convert WGS84 geographic and UTM coordinates.' },
];
