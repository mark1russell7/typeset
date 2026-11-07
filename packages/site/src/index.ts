/** The pure logic of the site. The page script `app.ts` uses it, and the tests examine it. */
export { armOfEngine, engineChoices, engineForAgent, fontChoice, fontChoices, scriptLabels, scriptOrder, shapedScripts, type EngineChoice, type FontChoice } from "./catalog.ts";
export { formatPx, formatSigned, heatBins, heatLabel, heatLevel } from "./heat.ts";
export { labResult, previewFit, sampleText, sweepClasses, sweepSummary, sweepTask, type GlyphView, type LabInput, type LabResult, type WordView } from "./lab-model.ts";
export {
  allLeftOut,
  armMatrix,
  armOrder,
  readSnapshot,
  snapshotOf,
  snapshotSchema,
  stackLimit64,
  stackMatrix,
  stackWorstPx,
  statOf,
  type ArmSnapshot,
  type ExtraSummary,
  type MatrixRow,
  type ModelChoice,
  type RunInfo,
  type Snapshot,
  type StackRow,
  type Statistic,
  type Summary,
} from "./snapshot.ts";
