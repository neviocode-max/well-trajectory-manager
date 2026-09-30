import { AppError } from '../engine/errors';
import { reconstructDirectionalSurvey } from '../engine/directionalSurvey';
import { invalidImportMessage, normalizeFullTrajectory, parseDirectionalSurvey } from '../data/normalization';
import { parseDelimited } from './delimited';
import type {
  ParsedTrajectoryInput,
  SurveyInputStation,
  DirectionalSurveyGroup,
} from '../types/database';
import type { DirectionalTieIn, SurveyStation } from '../types/survey';

export interface ParsedFile {
  fileName: string;
  parsed: ParsedTrajectoryInput;
}

export async function parseTrajectoryFile(file: File): Promise<ParsedFile> {
  const text = await file.text();
  const rawRows = parseDelimited(text);
  if (!rawRows.length) throw new AppError('The file contains no data rows.');

  const full = normalizeFullTrajectory(rawRows);
  if (full.stations.length) return { fileName: file.name, parsed: full };

  const directional = parseDirectionalSurvey(rawRows);
  if (directional) return { fileName: file.name, parsed: directional };

  throw new AppError(invalidImportMessage(rawRows));
}

export function reconstructDirectionalGroup(
  group: DirectionalSurveyGroup,
  tie: DirectionalTieIn,
): SurveyStation[] {
  return reconstructDirectionalSurvey(group.rows, tie);
}

export function asSurveyInput(stations: SurveyStation[]): SurveyInputStation[] {
  return stations.map(station => ({ ...station }));
}
