import type { ModuleDefinition } from "@/data/moduleCatalog";

interface HelpModuleProps {
  module: ModuleDefinition;
}

interface HelpList {
  label: string;
  items: string[];
}

interface HelpBlock {
  title: string;
  paragraphs: string[];
  lists?: HelpList[];
}

interface HelpSection {
  id: string;
  label: string;
  summary: string;
  blocks: HelpBlock[];
}

const onlineRiboTeUrl = "https://rnainformatics.cn/RiboTE/";

const highlightCards = [
  {
    title: "From Counts to TE",
    copy: "Load paired RNA-seq and Ribo-seq counts, preprocess the matrix, then identify genes whose translation efficiency changes between conditions."
  },
  {
    title: "Interpret the Result",
    copy: "Use PCA, clustering, GSEA, enrichment, network, SignalP, and codon views to understand TE Up and TE Down biology."
  },
  {
    title: "Online RiboTE",
    copy: "The hosted entry is available at the official RiboTE site.",
    link: onlineRiboTeUrl
  }
];

const helpSections: HelpSection[] = [
  {
    id: "overview",
    label: "Overview",
    summary: "Learn what RiboTE is used for and how the analysis pages connect from count data to biological interpretation.",
    blocks: [
      {
        title: "What RiboTE helps you answer",
        paragraphs: [
          "RiboTE is designed for paired RNA-seq and ribosome profiling experiments. It helps compare RNA abundance, ribosome occupancy, and translation efficiency between control and treatment samples.",
          "The central question is whether a gene changes at the RNA level, the ribosome profiling level, or the translation efficiency level. Downstream modules then help explain the pattern with sample structure, gene sets, network context, protein signal information, and codon usage.",
          "Start with the input files and move step by step. Avoid interpreting codon, enrichment, clustering, or network views before the upstream translation efficiency result has been produced.",
          "If you change the input data or rerun an upstream analysis, rerun downstream analyses that depend on it so figures, tables, and exports stay consistent with the current experiment."
        ],
        lists: [
          {
            label: "What each analysis area is for",
            items: [
              "Project Configuration: choose species and reference annotation resources.",
              "Load Data: load the count matrix and define RNA / Ribo sample pairs.",
              "Data Preprocess: prepare counts and inspect library-level quality summaries.",
              "Translation Efficiency: identify TE Up, TE Down, and unchanged genes.",
              "PCA and Clustering: inspect sample separation and gene-pattern structure.",
              "GSEA and Enrichment: find pathways or gene sets associated with TE changes.",
              "Network, SignalP, and Codon: inspect regulatory context, signal peptides, and codon-level features."
            ]
          }
        ]
      }
    ]
  },
  {
    id: "getting-started",
    label: "Getting Started",
    summary: "Follow the recommended order: Project Configuration, Load Data, Data Preprocess, Translation Efficiency, then downstream interpretation.",
    blocks: [
      {
        title: "Step 1: Prepare the experiment context",
        paragraphs: [
          "Select the species and annotation library, then load the paired count matrix. Assign each sample as RNA-seq or Ribo-seq and match RNA samples with their corresponding Ribo samples.",
          "Control and Treatment labels are used throughout the analysis, so confirm them before moving to downstream modules."
        ]
      },
      {
        title: "Step 2: Run Data Preprocess",
        paragraphs: [
          "Data Preprocess prepares the count matrix for downstream analysis and shows quality-control summaries. Use this page to detect obvious library-size or count-distribution issues before interpreting translation efficiency."
        ]
      },
      {
        title: "Step 3: Run Translation Efficiency",
        paragraphs: [
          "Translation Efficiency compares treatment and control conditions after accounting for RNA abundance and ribosome profiling signal. The result separates genes into TE Up, TE Down, and Non groups.",
          "TE Up means translation efficiency is higher in treatment. TE Down means translation efficiency is lower in treatment. Non means the gene does not pass the current threshold for a TE change."
        ]
      }
    ]
  },
  {
    id: "module-guide",
    label: "Module Guide",
    summary: "Understand when to use the core downstream views and how to read their biological signals.",
    blocks: [
      {
        title: "PCA and Clustering",
        paragraphs: [
          "PCA reduces many genes into a sample map. Samples that appear close together have similar overall profiles in the selected data space.",
          "Clustering groups genes with similar patterns. Use the main heatmap to identify broad TE-ratio structures and the detail heatmap to inspect selected gene subsets."
        ]
      },
      {
        title: "GSEA and Enrichment",
        paragraphs: [
          "GSEA evaluates whether ranked genes show coordinated pathway-level shifts. Enrichment tests whether selected gene groups contain more annotated genes than expected.",
          "Read pathway p-values together with gene counts, direction, and the experiment design. Statistical significance alone is not a biological explanation."
        ]
      },
      {
        title: "Network, SignalP, and Codon",
        paragraphs: [
          "Network views place selected genes into relationship context. SignalP summarizes secretory or membrane-associated features. Codon views inspect codon usage, codon bias, TE-shift enrichment, sequence patterns, and codon runs.",
          "These modules should be interpreted after translation efficiency groups are available, because their input gene sets depend on the current TE result."
        ]
      }
    ]
  },
  {
    id: "export-results",
    label: "Export & Results",
    summary: "Export the active figure or result table after confirming that the visible view matches the current analysis state.",
    blocks: [
      {
        title: "Figure and data export",
        paragraphs: [
          "Most result workspaces export the active chart or active table. In modules with multiple subviews, switch to the view you want before exporting.",
          "Use exported tables for downstream reporting and use exported figures after checking that axis labels, selected groups, and active thresholds match the intended result."
        ]
      },
      {
        title: "When results should be rerun",
        paragraphs: [
          "Changing input data, preprocessing thresholds, sample pairing, species, or upstream TE parameters can make downstream results outdated.",
          "When an upstream result changes, rerun dependent modules before comparing figures or exporting final tables."
        ]
      }
    ]
  },
  {
    id: "online-entry",
    label: "Online Entry",
    summary: "Use the official online RiboTE entry when you need the hosted interface.",
    blocks: [
      {
        title: "Official RiboTE entry",
        paragraphs: [
          `Online RiboTE: ${onlineRiboTeUrl}`,
          "Use the local application for desktop analysis and local data handling. Use the official online entry when a hosted interface is required."
        ]
      }
    ]
  },
  {
    id: "faq",
    label: "FAQ / Troubleshooting",
    summary: "Resolve common issues with locked analysis buttons, delayed displays, subset plots, and significance interpretation.",
    blocks: [
      {
        title: "Why is a Run button disabled",
        paragraphs: [
          "A Run button is disabled when required upstream context is missing. Confirm the annotation library, saved count matrix, sample pairing, preprocessing result, and translation efficiency result for the module you want to run."
        ]
      },
      {
        title: "Why are fewer points displayed than genes measured",
        paragraphs: [
          "Large scatter plots may draw a deterministic display subset to keep interaction smooth. Summary statistics, result tables, and exports still use the full result set unless the view states otherwise."
        ]
      },
      {
        title: "How should I treat a significant p-value",
        paragraphs: [
          "A small p-value means the observed difference is unlikely under the test assumption, but it does not automatically mean the effect is large or causal. Read it together with effect size, plot shape, and biological context."
        ]
      }
    ]
  }
];

function HelpBlockView({ block }: { block: HelpBlock }) {
  return (
    <div className="help-panel help-panel--section">
      <h3 className="help-section-card__title">{block.title}</h3>
      {block.paragraphs.map((paragraph) => (
        <p key={paragraph} className="help-section-card__copy">
          {paragraph}
        </p>
      ))}
      {block.lists?.length ? (
        <div className="help-list-grid">
          {block.lists.map((list) => (
            <div key={list.label} className="help-list-card">
              <strong className="help-list-card__title">{list.label}</strong>
              <ul className="help-list-card__list">
                {list.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function HelpModule({ module }: HelpModuleProps) {
  return (
    <section className="module-page help-module-page">
      <article className="config-card help-desktop-hero">
        <div className="help-desktop-hero__copy">
          <div className="help-panel__eyebrow">RiboTE Desktop Guide</div>
          <h1 className="help-hero__title">RiboTE Help</h1>
          <p className="help-hero__copy">
            This guide explains what each analysis area means, when to run it, and how to interpret the results without focusing on implementation details.
          </p>
        </div>
        <div className="help-highlight-grid">
          {highlightCards.map((card) => (
            <div key={card.title} className="help-highlight-card">
              <h3 className="help-highlight-card__title">{card.title}</h3>
              <p className="help-highlight-card__copy">{card.copy}</p>
              {card.link ? (
                <a className="help-online-link" href={card.link} target="_blank" rel="noreferrer">
                  {card.link}
                </a>
              ) : null}
            </div>
          ))}
        </div>
      </article>

      <article className="config-card help-nav-card">
        <div className="config-card__head">
          <div className="config-card__copy">
            <h3>{module.title}</h3>
            <p>Use this guide for paired count loading, translation efficiency analysis, downstream biological interpretation, and result export.</p>
          </div>
        </div>
        <nav className="help-nav" aria-label="Help sections">
          {helpSections.map((section) => (
            <a key={section.id} className="help-nav__link" href={`#${section.id}`}>
              <span className="help-nav__label">{section.label}</span>
              <span className="help-nav__summary">{section.summary}</span>
            </a>
          ))}
        </nav>
      </article>

      <section className="help-main">
        {helpSections.map((section) => (
          <section key={section.id} id={section.id} className="help-topic">
            <div className="help-topic__head">
              <div className="help-topic__eyebrow">{section.label}</div>
              <h2 className="help-topic__title">{section.label}</h2>
              <p className="help-topic__summary">{section.summary}</p>
            </div>
            <div className="help-topic__stack">
              {section.blocks.map((block) => (
                <HelpBlockView key={block.title} block={block} />
              ))}
            </div>
          </section>
        ))}
      </section>
    </section>
  );
}
