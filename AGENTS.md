# RiboTE Desktop Development Notes

## Project Paths

- Desktop project root: `D:\OBS录像\桌面\RiboTE_Tauri_windows`
- Original RiboTE Shiny + React source: `D:\OBS录像\桌面\生物信息学相关\RiboTE\new`
- Reference RNAmeta desktop project: `D:\OBS录像\桌面\RNAmeta_Tauri_windows`
- Original RNAmeta Shiny + React source: `D:\OBS录像\桌面\生物信息学相关\RNAmeta\new`
- Portable R directory copied into the desktop project: `D:\OBS录像\桌面\RiboTE_Tauri_windows\r-lang`

## User Rules

- Do not create `plans` files or planning documents unless the user explicitly asks.
- Do not run regression tests unless the user explicitly grants permission.
- TypeScript/static checks are acceptable when needed, for example `pnpm exec tsc --noEmit`.
- Keep communication concise and direct, preferably in Chinese.
- Preserve the RiboTE web color palette and current desktop visual language.
- Avoid reverting unrelated user changes. The worktree may be dirty.

## Engineering Rules

- Keep files focused and split large files before they become hard to maintain.
- React component files should usually stay under 300 lines. If a file approaches 400 lines, split it.
- Utility files should usually stay under 250 lines. If a utility grows beyond one clear responsibility, split it by concern.
- Rust command files should usually stay under 350 lines. Move parsing, process execution, and data models into separate modules when the command layer grows.
- R scripts should usually stay under 350 lines. Split shared preprocessing helpers, annotation helpers, and output serialization when logic expands.
- CSS files should usually stay under 500 lines. If a feature adds many styles, create a feature CSS file and import it from `src/index.css`.
- Prefer feature folders for non-trivial modules, for example:
  - `src/modules/DataPreprocess/DataPreprocessModule.tsx`
  - `src/modules/DataPreprocess/d3Charts.ts`
  - `src/modules/DataPreprocess/exportSvg.ts`
- Do not place heavy module-specific logic in `WorkspaceModule.tsx`; that file should stay as the generic placeholder module only.
- Keep Tauri commands thin. Commands should validate inputs, call focused helpers/scripts, and return typed JSON.
- Keep state ownership explicit:
  - persisted cross-module state belongs in `src/store/useAppStore.ts`;
  - temporary form state belongs inside the module component;
  - expensive computed/chart logic belongs in feature utilities.
- Avoid duplicating web reference code blindly. Port the behavior and visual style, but adapt structure to desktop React/Tauri boundaries.
- When adding a new analysis module, first create a dedicated folder instead of expanding the generic workspace renderer.
- If a change requires more than one screen of unrelated logic, split it before continuing.
- Every new exported function should have one clear responsibility and a name that describes the domain action.

## Run Commands

- Start frontend only: `pnpm dev`
- Start Tauri app: `pnpm tauri:dev`
- If port `1420` is already in use, close the existing Vite/Tauri process before starting again.

## Architecture

- App shell: Tauri v2 + Vite + React + TypeScript.
- Main route selection is in `src/App.tsx`.
- Navigation shell is in `src/layout/MainLayout.tsx`.
- Module metadata lives in `src/data/moduleCatalog.tsx`.
- Global app state uses Zustand in `src/store/useAppStore.ts`.
- Generic downstream modules render through `src/modules/Workspace/WorkspaceModule.tsx`.
- Project Configuration is `src/modules/Welcome/WelcomeModule.tsx`.
- Load Data is `src/modules/LoadData/LoadDataModule.tsx`.
- Rust commands are in `src-tauri/src/lib.rs`.

## Current Implemented State

- The UI currently follows the RNAmeta desktop layout structure but uses RiboTE web colors.
- Sidebar modules are expanded directly, not grouped under Foundation / Interpretation / Support.
- `welcome` has been renamed visually to `Project Configuration`.
- Project Configuration includes species selection, annotation directory selection, annotation bundle verification, and project status.
- Annotation validation expects files directly under the chosen directory, for example `选择目录/hg38.gff.rda`; no compatibility with nested annotation subfolders is required.
- Species-specific annotation resources must be resolved by the active species id, for example `hg38.geneInfo.sqlite`. Do not scan arbitrary `*geneInfo.sqlite` files as a fallback when Project Configuration already validates the exact bundle.
- Annotation Library now revalidates while the Project Configuration page is open:
  - immediately after selecting/changing directory;
  - after species changes;
  - every 2.5 seconds silently;
  - on window focus / visibility return.
- `r-lang` is ignored by Vite file watching and `.taurignore` to avoid slow startup/scanning.
- Portable R library has `xtail` copied from `D:\R\R-4.3.0\library`.

## Load Data State

- Load Data lets the user choose a local expression matrix file.
- Matrix preview shows the first 10 rows.
- Matrix table header and cells are `1rem`.
- Sample Pairing uses custom pointer drag, not native HTML draggable.
- Sample cards must be dragged into RNA-seq and Ribo-seq buckets first.
- There is no `ADD PAIR` button.
- Draft Load Data state is persisted in Zustand so switching modules does not reset unsaved UI state.
- Clicking `Save` stores `loadDataContext`; downstream analysis gating depends on this saved state.

## Analysis Gating

- All generic downstream `Run ...` analysis buttons are disabled unless both conditions are true:
  - `annotationValidation?.isValid === true`
  - `loadDataContext` exists
- When disabled, the generic workspace page shows an `Analysis locked` reason.
- If the annotation bundle later becomes incomplete through real-time revalidation, downstream buttons must become disabled again.

## Current Data Preprocess State

- The generic module hero descriptions no longer show a leading icon.
- Data Preprocess does not show the placeholder titles `Filtering and QC`, `Preprocess analysis stage`, or `Result Views`.
- Data Preprocess is now an independent React module at `src\modules\DataPreprocess\DataPreprocessModule.tsx`.
- The module runs portable R through the Tauri command `run_data_preprocess`.
- The R script is `src-tauri\resources\r-scripts\data_preprocess.R`.
- Processing follows the RiboTE web logic for:
  - duplicate/NA gene ID cleanup;
  - numeric count conversion;
  - zero-only sample removal;
  - row SD ordering;
  - zero or median missing-value imputation;
  - row sum filter;
  - CPM filter using `Min. CPM` and `n Libraries`;
  - library size data;
  - gene biotype summary from the current species exact `${speciesId}.geneInfo.sqlite`;
  - rRNA fraction summary from gene biotype annotation.
- Data Preprocess passes the active Project Configuration species id into the Tauri/R request. Species-dependent result signatures and caches must include `speciesId` so results are not reused across different species.
- Do not add generic annotation-file fallback logic to Data Preprocess. If the exact current-species annotation file is missing, treat it as a validation/configuration problem rather than silently using another species file.
- Data Preprocess parameter UI:
  - `Missing Value Estimation`: custom themed dropdown with `Zero Imputation` and `Median Imputation`.
  - `Min. CPM`: number input default `0.5`, min `0`, step `0.1`.
  - `n Libraries`: number input default `1`, min `1`, step `1`.
- The custom dropdown should stay visually aligned with the RiboTE theme: light blue surface, teal focus border, rounded menu, selected state, and non-native appearance.
- Result UI includes:
  - first 10 processed matrix rows;
  - D3 Library Size chart;
  - D3 QC charts for gene biotype and rRNA fraction, stacked vertically;
  - a unified export button that opens an export dialog before downloading;
  - data CSV export from the processed matrix cache path;
  - figure PNG/PDF export from the current SVG result view.
- Data Preprocess analysis should expand the console automatically while running, log percentage progress, and collapse the console when the run finishes.

## Important Source References

- RiboTE Data Preprocess web config: `D:\OBS录像\桌面\生物信息学相关\RiboTE\new\modules\data_preprocess\data_preprocess.shared.R`
- RiboTE Data Preprocess web UI: `D:\OBS录像\桌面\生物信息学相关\RiboTE\new\modules\data_preprocess\data_preprocess.ui.R`
- RiboTE global module registry reference: `D:\OBS录像\桌面\生物信息学相关\RiboTE\new\services\module_registry.R`

## Additional User Rules From This Session

- Prefer root-cause debugging over visual guesswork. When web and desktop differ, inspect the web source first and match the real implementation.
- For web-style parity work, use the local web source as the authority instead of inferring from screenshots.
- Do not create extra planning artifacts just to continue development. Update `AGENTS.md` instead when the user asks for handoff context.
- Keep using `pnpm exec tsc --noEmit` for lightweight verification. Do not run full regression or broad end-to-end test suites unless the user explicitly opens that permission.
- The desktop app must not depend on internet access at runtime. Fonts and required assets must be available locally in the packaged app.
- Visible desktop copy should avoid implementation/platform wording such as `web`, `Shiny`, `portable R`, or `便携式 R`. Use biological workflow wording instead. It is acceptable for Help to link to the online RiboTE entry at `https://rnainformatics.cn/RiboTE/`.
- When Project Configuration validates exact species resources, downstream modules should not add broad file-name scanning fallbacks that can mask the wrong species.

## Current Shared UX / Visual Rules

- Keep the desktop visual language aligned with the RiboTE web app, not a generic desktop redesign.
- Avoid oversized controls and exaggerated rounding. Radius should stay consistent across inputs, selects, buttons, status banners, and cards.
- Warning and gating copy should use normal title case / sentence case where the user asked, not forced all-caps.
- Console should auto-expand during long analysis runs and auto-collapse when the run finishes.
- For module parity tasks, prefer reproducing the web layout structure first, then refine desktop-specific spacing only where necessary.
- Custom controls embedded in table/list rows must match neighboring row height, padding, border, and typography; do not let native browser controls or shared dropdown defaults change row alignment.
- Parameter labels should use title case / sentence case rather than forced all-caps unless the surrounding module intentionally uses all-caps section badges.

## Current Translation Efficiency State

- Translation Efficiency is a dedicated desktop analysis module, not just the generic placeholder.
- Portable R TE analysis is wired and follows the web logic closely.
- TE results include:
  - paged result table;
  - volcano plot;
  - TE scatter plot group.
- TE scatter plots are subset-limited for rendering performance, while table values and exported data still use the full result set.
- TE result export is shown from the `Result Workspace` header, matching the Data Preprocess placement pattern.
- The TE table should not include the extra `significance` column because the web table does not expose it.

## Current PCA State

- PCA is a dedicated downstream analysis module with portable R integration.
- Plot styling has been adjusted toward the web version:
  - sans-serif in SVG;
  - centered legend;
  - title typography adjustments;
  - progress logging with more than start/end stages.
- PCA export is exposed from the `Result Workspace` header like the other dedicated modules.

## Current Clustering State

- Clustering is implemented as a dedicated module with a main heatmap and a detail heatmap.
- The main heatmap supports brush selection, and the detail heatmap reflects the selected subset.
- Main and detail heatmaps are intended to keep the same height.
- Inner plot borders were removed; only the outer card border should remain.
- Tooltip clipping and label clipping were iteratively addressed. If regressions appear, inspect the `overflow` and host-container interplay in `analysis-results.css` before changing chart code.

## Current GSEA / Enrichment State

- GSEA and Enrichment are wired to local `hg38` annotation resources under `D:\OBS录像\桌面\ribote_test\hg38`.
- These annotation resources are validated at module runtime, not in `Project Configuration`.
- GSEA uses local GMT resources and desktop rendering aligned to the web version.
- Enrichment uses web-style ORA logic and has its own table + overview views.
- Their pagination should visually match the other desktop tables rather than browser-default buttons.

## Current Network State

- Network is a dedicated module with portable R backend logic and D3 rendering.
- The network view has:
  - fit view control;
  - label toggle;
  - draggable nodes;
  - threshold-based edge display.
- The default displayed node count should honor the module parameter default rather than leaking values from other modules.
- Network zoom range has already been widened beyond the earlier tight desktop limit.

## Current SignalP State

- SignalP is implemented as a dedicated module with portable R analysis and D3 summary chart.
- Signal peptide / membrane resources are read from local annotation files in the selected annotation directory.
- The SignalP chart and table are arranged vertically.
- The inner chart border was removed so only the outer panel frame remains.
- Watch for title clipping and excess whitespace in the plot host when adjusting chart height.

## Current Codon State

- Codon is no longer rendered through the generic configured workspace. It has its own module:
  - `src\modules\Codon\CodonModule.tsx`
- Sidebar children for Codon are implemented and should drive the active sub-workspace:
  - `INPUT AND USAGE`
  - `CODON BIAS`
  - `TE SHIFT AND ENRICHMENT`
  - `PATTERN VIEWS`
  - `CODON RUNS`
- The sidebar expand/collapse already has animation.
- When `INPUT AND USAGE` is active, the parent `Codon` item should not also appear active; only the child should be highlighted.
- Only `INPUT AND USAGE` shows a parameter panel. The other Codon child sections should present results without that setup card.
- The codon picker is implemented as a standalone modal workflow like the web app:
  - `Choose Codons` button;
  - selection summary;
  - modal with search and codon grid.
- The codon picker hint should only appear when:
  - upstream gating is satisfied; and
  - no codons are currently selected.
- The `Choose Codons` trigger should not span the full row. It should be roughly the width of the parameter controls below it and have a visible hover state.
- `Codon Workspace Setup` heading has been removed per user request.
- Codon should show the same `Analysis Results` / export workspace structure as other dedicated modules before analysis.
- Codon export buttons should use the shared `action-button analysis-export-button` styling and `config-card__head--with-action` placement rather than a module-specific visual style.

## Current Load Data State Additions

- `Group Role` uses the shared themed dropdown rather than a native `<select>`.
- The `Group Role` dropdown height must remain aligned with adjacent RNA-seq and Ribo-seq sample boxes in each pairing row.

## Current Help State

- Help is a desktop-oriented guide page, not a direct clone of the online layout.
- Help content should explain the biological workflow without exposing implementation details.
- Help includes the official online RiboTE link: `https://rnainformatics.cn/RiboTE/`.
- In the Overview section, `What RiboTE helps you answer` and `A practical analysis order` are combined to avoid large empty right-side panels.

## Current Font / Typography State

- The app currently uses `sans-serif` for body/display typography instead of packaged Montserrat assets.
- `src\styles\tokens.css` remains the single source of truth for body/display font variables.
- If the desktop app still looks heavier than the web app, inspect:
  - WebView2 rendering differences versus Chrome;
  - local `font-weight` / `letter-spacing` overrides before changing type scale.

## Current Codon / Web Parity References

- Web codon controls and picker implementation:
  - `D:\OBS录像\桌面\生物信息学相关\RiboTE\new\frontend\app_shell\src\components\ModuleControls.jsx`
- Web codon / control styling:
  - `D:\OBS录像\桌面\生物信息学相关\RiboTE\new\frontend\app_shell\src\styles\ribote-controls.css`
- Web global layout font rule:
  - `D:\OBS录像\桌面\生物信息学相关\RiboTE\new\frontend\app_shell\src\styles\layout.css`

## Current Likely Next Work

- Continue Codon parity work for all five child sections and their subviews.
- Keep checking Codon result grouping, charts, and export behavior against the web implementation.
- If visual mismatches remain, inspect the web source code first and treat screenshots only as confirmation, not as the source of truth.
