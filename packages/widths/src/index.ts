export { advanceModelNames, advanceModelRow, diagnosticWeights, type AdvanceModelName, type AdvanceModelRow, type ModelError } from "./advances.ts";
export {
  bounds,
  checkBounds,
  engineRecords,
  fractionsOf,
  missingGlyphs,
  probeCharacters,
  probeInstance,
  recordsOf,
  summarize,
  tasksOf,
  type Bound,
  type Cell,
  type FontTask,
  type Fractions,
  type InstanceProbe,
  type WidthRecord,
} from "./compare.ts";
export { allArms, arabicNoRegressionScripts, engineScripts, floatSumScripts, score, scoreAdvances, scoreArabic, scoreCauses, scoreEngines, scoreFloatSum, scoreGsub, scoreKana, unroundedArms, type ArmFile, type Outcome } from "./score.ts";
export { breakdownOf, exactDeltaErrors, featureSettings, substitutionTrace, summarizeFeatures, type BreakdownRow, type FeatureGroup, type FeatureRecord, type FeatureSetting, type FeatureSummary, type SubstitutionStep } from "./features.ts";
export { drawnTexts, fontStacks, markTexts, missingInStack, missingRuns, mixedTexts, runTexts, setOf, stackCells, stackFont, stackRecords, type FontStack, type MissingRun, type StackCell, type StackRecord, type StackSet, type StackText } from "./stacks.ts";
export { breakCells, breakRecord, breakSizes, breakWidths, lineFactor, linesOf, sameLines, withRunWidths, type BreakCell, type BreakRecord, type DomCluster } from "./breaks.ts";
export { breakBar, breakGaps, breakVerdict, stackGate, withVerdicts, type BreakCellVerdict, type BreakGap, type BreakVerdict, type GateRow, type StackArm } from "./stack-gate.ts";
export { cssInstance, extraSource, extraWeights, fileName, fontsCommit, fontSources, scriptTags, sourceUrl, type FontSource } from "./sources.ts";
