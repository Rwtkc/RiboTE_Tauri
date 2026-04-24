export interface SpeciesOption {
  label: string;
  name: string;
  assembly: string;
  id: string;
  expectedFiles: string[];
}

export const SPECIES_OPTIONS: SpeciesOption[] = [
  {
    label: "Homo sapiens (hg38)",
    name: "Homo sapiens",
    assembly: "hg38",
    id: "hg38",
    expectedFiles: [
      "hg38.geneInfo.sqlite",
      "hg38.gff.rda",
      "hg38.txlens.rda",
      "hg38.txdb.fa",
      "hg38.tai",
      "hg38.cds.m"
    ]
  },
  {
    label: "Oryza sativa (IRGSP 1.0)",
    name: "Oryza sativa",
    assembly: "IRGSP 1.0",
    id: "osa_IRGSP_1",
    expectedFiles: [
      "osa_IRGSP_1.geneInfo.sqlite",
      "osa_IRGSP_1.gff.rda",
      "osa_IRGSP_1.txlens.rda",
      "osa_IRGSP_1.txdb.fa",
      "osa_IRGSP_1.tai",
      "osa_IRGSP_1.cds.m"
    ]
  },
  {
    label: "Mus musculus (mm10)",
    name: "Mus musculus",
    assembly: "mm10",
    id: "mm10",
    expectedFiles: [
      "mm10.geneInfo.sqlite",
      "mm10.gff.rda",
      "mm10.txlens.rda",
      "mm10.txdb.fa",
      "mm10.tai",
      "mm10.cds.m"
    ]
  }
];
