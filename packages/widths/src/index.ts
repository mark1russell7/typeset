export {
  bounds,
  checkBounds,
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
export { allArms, score, scoreCauses, scoreGsub, unroundedArms, type ArmFile, type Outcome } from "./score.ts";
export { breakdownOf, exactDeltaErrors, featureSettings, substitutionTrace, summarizeFeatures, type BreakdownRow, type FeatureGroup, type FeatureRecord, type FeatureSetting, type FeatureSummary, type SubstitutionStep } from "./features.ts";
export { cssInstance, extraSource, extraWeights, fileName, fontsCommit, fontSources, scriptTags, sourceUrl, type FontSource } from "./sources.ts";
