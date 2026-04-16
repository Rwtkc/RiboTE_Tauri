import type { MatrixPreview, SamplePair } from "@/store/useAppStore";

export interface LoadDataSaveValidationInput {
  matrix: MatrixPreview | null;
  rnaSamples: string[];
  riboSamples: string[];
  samplePairs: SamplePair[];
}

export interface LoadDataSaveValidation {
  canSave: boolean;
  message: string;
}

export function validateLoadDataSave({
  matrix,
  rnaSamples,
  riboSamples,
  samplePairs
}: LoadDataSaveValidationInput): LoadDataSaveValidation {
  if (!matrix) {
    return {
      canSave: false,
      message: "Select a count matrix before saving."
    };
  }

  if (!samplePairs.length) {
    return {
      canSave: false,
      message: "Move sample cards into RNA-seq and Ribo-seq before saving."
    };
  }

  if (rnaSamples.length !== riboSamples.length) {
    return {
      canSave: false,
      message: "Move every sample into RNA-seq or Ribo-seq. The two partitions must contain the same number of cards."
    };
  }

  if (!samplePairs.every((pair) => pair.rnaSample && pair.riboSample && pair.groupRole)) {
    return {
      canSave: false,
      message: "Complete every RNA-seq / Ribo-seq sample pair before saving."
    };
  }

  const roleCounts = countGroupRoles(samplePairs);
  if (roleCounts.Control === 0 || roleCounts.Treatment === 0) {
    return {
      canSave: false,
      message: "Set Group Role to include both Control and Treatment pairs before saving."
    };
  }

  if (roleCounts.Control !== roleCounts.Treatment) {
    return {
      canSave: false,
      message: `Group Role needs equal Control and Treatment pairs before saving. Current: ${roleCounts.Control} Control, ${roleCounts.Treatment} Treatment.`
    };
  }

  return {
    canSave: true,
    message: ""
  };
}

function countGroupRoles(samplePairs: SamplePair[]) {
  return samplePairs.reduce(
    (counts, pair) => {
      counts[pair.groupRole] += 1;
      return counts;
    },
    { Control: 0, Treatment: 0 }
  );
}