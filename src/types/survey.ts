export interface SurveyStation {
  Well: string;
  MD: number;
  X: number;
  Y: number;
  Z: number;
  TVD: number;
  Azimuth: number;
  Inclination: number;
  Derived?: boolean;
}

export interface DirectionalSurveyStation {
  MD: number;
  Azimuth: number;
  Inclination: number;
}

export interface DirectionalTieIn {
  well: string;
  MD: number;
  X: number;
  Y: number;
  Z: number;
  TVD: number;
}
