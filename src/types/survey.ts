export interface SurveyMetadata {
  SURV_Type?: string;
  BHT?: string;
}

export interface SurveyStation extends SurveyMetadata {
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

export interface DirectionalSurveyStation extends SurveyMetadata {
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
