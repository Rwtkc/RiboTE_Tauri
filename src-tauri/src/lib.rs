use serde::{Deserialize, Serialize};
use serde_json::json;
use std::collections::HashSet;
use std::collections::hash_map::DefaultHasher;
use std::fs::{self, File};
use std::hash::{Hash, Hasher};
use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::{Mutex, OnceLock};
use std::time::{SystemTime, UNIX_EPOCH};
#[cfg(windows)]
use std::os::windows::process::CommandExt;

static ACTIVE_R_PROCESSES: OnceLock<Mutex<HashSet<u32>>> = OnceLock::new();
static TERMINATED_R_PROCESSES: OnceLock<Mutex<HashSet<u32>>> = OnceLock::new();
static SESSION_CACHE_DIRS: OnceLock<Mutex<HashSet<PathBuf>>> = OnceLock::new();
static CLEANED_CACHE_ROOTS: OnceLock<Mutex<HashSet<PathBuf>>> = OnceLock::new();
static CACHE_SESSION_ID: OnceLock<String> = OnceLock::new();
static EMBEDDED_R_SCRIPTS: &[(&str, &str)] = &[
    ("analysis_modules.R", include_str!("../resources/r-scripts/analysis_modules.R")),
    ("codon_desktop.R", include_str!("../resources/r-scripts/codon_desktop.R")),
    ("data_preprocess.R", include_str!("../resources/r-scripts/data_preprocess.R")),
    ("codon/module_shell.R", include_str!("../resources/r-scripts/codon/module_shell.R")),
    ("codon/codon.config.R", include_str!("../resources/r-scripts/codon/codon.config.R")),
    ("codon/codon.resources.R", include_str!("../resources/r-scripts/codon/codon.resources.R")),
    ("codon/codon.analysis.base.R", include_str!("../resources/r-scripts/codon/codon.analysis.base.R")),
    ("codon/codon.analysis.input_bias.R", include_str!("../resources/r-scripts/codon/codon.analysis.input_bias.R")),
    ("codon/codon.analysis.shift.R", include_str!("../resources/r-scripts/codon/codon.analysis.shift.R")),
    ("codon/codon.analysis.pattern.R", include_str!("../resources/r-scripts/codon/codon.analysis.pattern.R")),
    ("codon/codon.analysis.runs.R", include_str!("../resources/r-scripts/codon/codon.analysis.runs.R")),
    ("codon/codon.payload.R", include_str!("../resources/r-scripts/codon/codon.payload.R")),
];
#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AnnotationValidation {
    exists: bool,
    is_valid: bool,
    root_path: String,
    missing_items: Vec<String>,
    species_files: Vec<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct MatrixPreview {
    file_path: String,
    file_name: String,
    delimiter: String,
    columns: Vec<String>,
    rows: Vec<Vec<String>>,
    sample_names: Vec<String>,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct SamplePairInput {
    rna_sample: String,
    ribo_sample: String,
    group_role: String,
}

fn split_delimited_line(line: &str, delimiter: char) -> Vec<String> {
    line.trim_end_matches(&['\r', '\n'])
        .split(delimiter)
        .map(|value| value.trim_matches('"').to_string())
        .collect()
}

fn timestamp_suffix() -> String {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis().to_string())
        .unwrap_or_else(|_| "0".to_string())
}

fn cache_session_id() -> &'static str {
    CACHE_SESSION_ID
        .get_or_init(|| format!("session_{}_{}", timestamp_suffix(), std::process::id()))
        .as_str()
}

fn session_cache_dirs() -> &'static Mutex<HashSet<PathBuf>> {
    SESSION_CACHE_DIRS.get_or_init(|| Mutex::new(HashSet::new()))
}

fn cleaned_cache_roots() -> &'static Mutex<HashSet<PathBuf>> {
    CLEANED_CACHE_ROOTS.get_or_init(|| Mutex::new(HashSet::new()))
}

fn register_session_cache_dir(path: &Path) {
    if let Ok(mut dirs) = session_cache_dirs().lock() {
        dirs.insert(path.to_path_buf());
    }
}

fn cleanup_session_cache_dirs() {
    let dirs = session_cache_dirs()
        .lock()
        .map(|dirs| dirs.iter().cloned().collect::<Vec<_>>())
        .unwrap_or_default();

    for dir in dirs {
        let _ = fs::remove_dir_all(&dir);
        if let Some(parent) = dir.parent() {
            let is_empty = fs::read_dir(parent)
                .map(|mut entries| entries.next().is_none())
                .unwrap_or(false);
            if is_empty {
                let _ = fs::remove_dir(parent);
            }
        }
    }
}

fn cleanup_stale_cache_root(cache_root: &Path) {
    let normalized_root = cache_root
        .canonicalize()
        .unwrap_or_else(|_| cache_root.to_path_buf());
    let should_clean = cleaned_cache_roots()
        .lock()
        .map(|mut roots| roots.insert(normalized_root))
        .unwrap_or(false);

    if should_clean {
        let _ = fs::remove_dir_all(cache_root);
    }
}

fn annotation_cache_dir(annotation_dir: &str) -> Result<PathBuf, String> {
    let root = PathBuf::from(annotation_dir);
    if !root.is_dir() {
        return Err(format!("Annotation Library directory does not exist: {}", root.display()));
    }

    let cache_root = root.join(".ribote_desktop_cache");
    cleanup_stale_cache_root(&cache_root);

    let cache_dir = cache_root.join(cache_session_id());
    fs::create_dir_all(&cache_dir)
        .map_err(|error| format!("Failed to prepare temporary analysis files '{}': {error}", cache_dir.display()))?;
    register_session_cache_dir(&cache_dir);
    Ok(cache_dir)
}

fn stable_hash(value: &str) -> String {
    let mut hasher = DefaultHasher::new();
    value.hash(&mut hasher);
    format!("{:016x}", hasher.finish())
}

fn system_time_millis(value: SystemTime) -> u128 {
    value
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or(0)
}

fn file_fingerprint(path: &Path) -> String {
    match fs::metadata(path) {
        Ok(metadata) => format!(
            "{}|{}|{}",
            path.canonicalize().unwrap_or_else(|_| path.to_path_buf()).display(),
            metadata.len(),
            metadata.modified().map(system_time_millis).unwrap_or(0)
        ),
        Err(_) => format!("{}|missing", path.display()),
    }
}

fn directory_fingerprint(path: &Path) -> String {
    let mut entries = fs::read_dir(path)
        .map(|entries| {
            entries
                .filter_map(Result::ok)
                .filter(|entry| entry.path().is_file())
                .map(|entry| file_fingerprint(&entry.path()))
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    entries.sort();
    entries.join("\n")
}

fn remove_json_fields(value: &mut serde_json::Value, field_names: &[&str]) {
    if let Some(map) = value.as_object_mut() {
        for field_name in field_names {
            map.remove(*field_name);
        }
    }
}

fn cache_signature(value: &serde_json::Value, extra_parts: &[String]) -> String {
    let mut payload = serde_json::to_string(value).unwrap_or_default();
    for part in extra_parts {
        payload.push('\n');
        payload.push_str(part);
    }
    stable_hash(&payload)
}

fn read_cached_json(path: &Path) -> Result<serde_json::Value, String> {
    let text = fs::read_to_string(path)
        .map_err(|error| format!("Failed to read previous analysis result '{}': {error}", path.display()))?;
    serde_json::from_str(&text)
        .map_err(|error| format!("Failed to interpret previous analysis result '{}': {error}", path.display()))
}

fn active_r_processes() -> &'static Mutex<HashSet<u32>> {
    ACTIVE_R_PROCESSES.get_or_init(|| Mutex::new(HashSet::new()))
}

fn terminated_r_processes() -> &'static Mutex<HashSet<u32>> {
    TERMINATED_R_PROCESSES.get_or_init(|| Mutex::new(HashSet::new()))
}

fn register_r_process(pid: u32) {
    if let Ok(mut processes) = active_r_processes().lock() {
        processes.insert(pid);
    }
}

fn unregister_r_process(pid: u32) -> bool {
    if let Ok(mut processes) = active_r_processes().lock() {
        processes.remove(&pid);
    }

    if let Ok(mut terminated) = terminated_r_processes().lock() {
        return terminated.remove(&pid);
    }

    false
}

fn kill_process_tree(pid: u32) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        let status = Command::new("taskkill")
            .args(["/PID", &pid.to_string(), "/T", "/F"])
            .status()
            .map_err(|error| format!("Failed to run taskkill for PID {pid}: {error}"))?;

        if !status.success() {
            return Err(format!("taskkill failed for PID {pid} with status {status}"));
        }

        return Ok(());
    }

    #[cfg(not(target_os = "windows"))]
    {
        let status = Command::new("kill")
            .args(["-TERM", &pid.to_string()])
            .status()
            .map_err(|error| format!("Failed to terminate PID {pid}: {error}"))?;

        if !status.success() {
            return Err(format!("kill failed for PID {pid} with status {status}"));
        }

        Ok(())
    }
}

fn candidate_roots() -> Vec<PathBuf> {
    let mut roots = Vec::new();

    if let Ok(current_dir) = std::env::current_dir() {
        roots.push(current_dir.clone());
        roots.extend(current_dir.ancestors().map(Path::to_path_buf));
    }

    if let Ok(current_exe) = std::env::current_exe() {
        if let Some(exe_dir) = current_exe.parent() {
            roots.push(exe_dir.to_path_buf());
            roots.extend(exe_dir.ancestors().map(Path::to_path_buf));
        }
    }

    roots
}

fn find_existing_path(relative_candidates: &[&str]) -> Option<PathBuf> {
    for root in candidate_roots() {
        for relative in relative_candidates {
            let candidate = root.join(relative);
            if candidate.exists() {
                return Some(candidate);
            }
        }
    }

    None
}

fn find_portable_rscript() -> Result<PathBuf, String> {
    find_existing_path(&[
        "resources/r-lang/bin/Rscript.exe",
        "resources/r-lang/bin/x64/Rscript.exe",
        "r-lang/bin/Rscript.exe",
        "r-lang/bin/x64/Rscript.exe",
        "../resources/r-lang/bin/Rscript.exe",
        "../resources/r-lang/bin/x64/Rscript.exe",
        "../r-lang/bin/Rscript.exe",
        "../r-lang/bin/x64/Rscript.exe",
    ])
    .ok_or_else(|| "The local analysis environment was not found.".to_string())
}

fn prepare_embedded_r_scripts() -> Result<PathBuf, String> {
    let script_dir = std::env::temp_dir().join(format!(
        "ribote_r_scripts_{}_{}",
        std::process::id(),
        timestamp_suffix()
    ));

    for (relative_path, content) in EMBEDDED_R_SCRIPTS {
        let path = script_dir.join(relative_path);
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).map_err(|error| {
                format!("Failed to prepare analysis script directory '{}': {error}", parent.display())
            })?;
        }
        fs::write(&path, content).map_err(|error| {
            format!("Failed to prepare analysis script '{}': {error}", path.display())
        })?;
    }

    Ok(script_dir)
}

fn run_r_json_script(
    script_name: &str,
    input_path: &Path,
    output_path: &Path,
) -> Result<serde_json::Value, String> {
    let rscript = find_portable_rscript()?;
    let script_dir = prepare_embedded_r_scripts()?;
    let script = script_dir.join(script_name);
    let r_home = rscript
        .parent()
        .and_then(Path::parent)
        .map(Path::to_path_buf)
        .ok_or_else(|| "Unable to locate the local analysis environment.".to_string())?;
    let r_library = r_home.join("library");
    let mut command = Command::new(&rscript);
    command
        .arg(&script)
        .arg(input_path)
        .arg(output_path)
        .env("R_HOME", &r_home)
        .env("R_LIBS", &r_library)
        .env("R_LIBS_USER", &r_library)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    #[cfg(windows)]
    command.creation_flags(CREATE_NO_WINDOW);
    let child = command
        .spawn()
        .map_err(|error| format!("Failed to start analysis calculation: {error}"))?;
    let pid = child.id();
    register_r_process(pid);
    let output = child
        .wait_with_output()
        .map_err(|error| format!("Failed to wait for analysis task {pid}: {error}"))?;
    let _ = fs::remove_dir_all(&script_dir);
    let was_terminated = unregister_r_process(pid);

    if !output.status.success() {
        if was_terminated {
            return Err("Analysis terminated by user.".to_string());
        }

        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
        return Err(if stderr.is_empty() {
            if stdout.is_empty() {
                format!("Analysis calculation failed with status {}", output.status)
            } else {
                format!("Analysis calculation failed: {stdout}")
            }
        } else {
            stderr
        });
    }

    let output_text = fs::read_to_string(output_path)
        .map_err(|error| format!("Failed to read analysis result: {error}"))?;
    serde_json::from_str(&output_text)
        .map_err(|error| format!("Failed to interpret analysis result: {error}"))
}

#[tauri::command]
fn terminate_active_r_processes() -> Result<usize, String> {
    let pids = active_r_processes()
        .lock()
        .map_err(|_| "Failed to lock active R process registry.".to_string())?
        .iter()
        .copied()
        .collect::<Vec<_>>();

    if pids.is_empty() {
        return Ok(0);
    }

    let mut terminated_count = 0usize;
    let mut errors = Vec::new();

    for pid in pids {
        match kill_process_tree(pid) {
            Ok(()) => {
                terminated_count += 1;
                if let Ok(mut terminated) = terminated_r_processes().lock() {
                    terminated.insert(pid);
                }
            }
            Err(error) => errors.push(error),
        }
    }

    if !errors.is_empty() && terminated_count == 0 {
        return Err(errors.join("; "));
    }

    Ok(terminated_count)
}

fn detect_delimiter(lines: &[String]) -> char {
    let delimiters = ['\t', ',', ';', '|'];

    delimiters
        .into_iter()
        .max_by_key(|delimiter| {
            lines
                .iter()
                .take(5)
                .filter(|line| split_delimited_line(line, *delimiter).len() > 1)
                .count()
        })
        .unwrap_or('\t')
}

fn delimiter_label(delimiter: char) -> String {
    match delimiter {
        '\t' => "tab".to_string(),
        ',' => "comma".to_string(),
        ';' => "semicolon".to_string(),
        '|' => "pipe".to_string(),
        _ => delimiter.to_string(),
    }
}

#[tauri::command]
fn validate_annotation_directory(
    path: String,
    expected_files: Vec<String>,
) -> Result<AnnotationValidation, String> {
    let root = PathBuf::from(&path);
    let mut missing_items = Vec::new();
    let mut species_files = Vec::new();

    if !root.is_dir() {
        missing_items.push("annotation directory".to_string());
    }

    for expected in expected_files {
        let candidate = root.join(&expected);
        if candidate.exists() {
            species_files.push(candidate.display().to_string());
        } else {
            missing_items.push(candidate.display().to_string());
        }
    }

    Ok(AnnotationValidation {
        exists: root.is_dir(),
        is_valid: missing_items.is_empty(),
        root_path: path,
        missing_items,
        species_files,
    })
}

#[tauri::command]
fn read_matrix_preview(path: String, max_rows: Option<usize>) -> Result<MatrixPreview, String> {
    let matrix_path = PathBuf::from(&path);
    if !matrix_path.is_file() {
        return Err(format!(
            "Matrix file does not exist: {}",
            matrix_path.display()
        ));
    }

    let file = File::open(&matrix_path).map_err(|error| {
        format!(
            "Failed to open matrix file '{}': {error}",
            matrix_path.display()
        )
    })?;
    let reader = BufReader::new(file);
    let limit = max_rows.unwrap_or(10).max(1);
    let mut lines = Vec::new();

    for line in reader.lines().take(limit + 1) {
        lines.push(line.map_err(|error| {
            format!(
                "Failed to read matrix preview '{}': {error}",
                matrix_path.display()
            )
        })?);
    }

    if lines.is_empty() {
        return Err("Matrix file is empty.".to_string());
    }

    let delimiter = detect_delimiter(&lines);
    let columns = split_delimited_line(&lines[0], delimiter);
    let sample_names = if columns.len() > 1 {
        columns[1..].to_vec()
    } else {
        Vec::new()
    };
    let rows = lines
        .iter()
        .skip(1)
        .map(|line| split_delimited_line(line, delimiter))
        .collect::<Vec<_>>();
    let file_name = matrix_path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or(&path)
        .to_string();

    Ok(MatrixPreview {
        file_path: path,
        file_name,
        delimiter: delimiter_label(delimiter),
        columns,
        rows,
        sample_names,
    })
}

#[tauri::command]
async fn run_data_preprocess(
    matrix_path: String,
    annotation_dir: String,
    species_id: Option<String>,
    na_strategy: String,
    min_cpm: f64,
    min_libraries: u32,
    sample_pairs: Vec<SamplePairInput>,
) -> Result<serde_json::Value, String> {
    tauri::async_runtime::spawn_blocking(move || {
        run_data_preprocess_blocking(
            matrix_path,
            annotation_dir,
            species_id,
            na_strategy,
            min_cpm,
            min_libraries,
            sample_pairs,
        )
    })
    .await
    .map_err(|error| format!("Failed to join preprocess worker: {error}"))?
}

fn run_data_preprocess_blocking(
    matrix_path: String,
    annotation_dir: String,
    species_id: Option<String>,
    na_strategy: String,
    min_cpm: f64,
    min_libraries: u32,
    sample_pairs: Vec<SamplePairInput>,
) -> Result<serde_json::Value, String> {
    let species_id = species_id.unwrap_or_default();
    let temp_dir = std::env::temp_dir();
    let suffix = timestamp_suffix();
    let session_cache_dir = annotation_cache_dir(&annotation_dir)?;
    let input_path = temp_dir.join(format!("ribote_preprocess_input_{suffix}.json"));
    let output_path = temp_dir.join(format!("ribote_preprocess_output_{suffix}.json"));
    let matrix_fingerprint = file_fingerprint(Path::new(&matrix_path));
    let annotation_fingerprint = directory_fingerprint(Path::new(&annotation_dir));
    let base_signature = cache_signature(
        &json!({
            "kind": "data_preprocess_base",
            "matrixPath": matrix_path.clone(),
            "naStrategy": na_strategy.clone()
        }),
        &[matrix_fingerprint.clone()],
    );
    let mut signature_request = json!({
        "kind": "data_preprocess",
        "version": "data_preprocess_context_v1",
        "matrixPath": matrix_path.clone(),
        "annotationDir": annotation_dir.clone(),
        "speciesId": species_id.clone(),
        "naStrategy": na_strategy.clone(),
        "minCpm": min_cpm,
        "minLibraries": min_libraries,
        "samplePairs": sample_pairs.clone()
    });
    remove_json_fields(&mut signature_request, &["cachePath", "baseCachePath"]);
    let result_signature = cache_signature(
        &signature_request,
        &[matrix_fingerprint, annotation_fingerprint],
    );
    let cache_path = session_cache_dir.join(format!("data_preprocess_{result_signature}.csv"));
    let base_cache_path = session_cache_dir.join(format!("data_preprocess_base_{base_signature}.rds"));
    let cached_output_path = session_cache_dir.join(format!("data_preprocess_{result_signature}.json"));

    if cached_output_path.is_file() && cache_path.is_file() {
        return read_cached_json(&cached_output_path);
    }

    let request = json!({
        "matrixPath": matrix_path,
        "annotationDir": annotation_dir,
        "speciesId": species_id,
        "naStrategy": na_strategy,
        "minCpm": min_cpm,
        "minLibraries": min_libraries,
        "samplePairs": sample_pairs,
        "cachePath": cache_path.to_string_lossy(),
        "baseCachePath": base_cache_path.to_string_lossy()
    });
    let mut input_file = File::create(&input_path)
        .map_err(|error| format!("Failed to create preprocess input: {error}"))?;
    input_file
        .write_all(request.to_string().as_bytes())
        .map_err(|error| format!("Failed to write preprocess input: {error}"))?;

    let result = run_r_json_script("data_preprocess.R", &input_path, &output_path);
    if result.is_ok() {
        let _ = fs::copy(&output_path, &cached_output_path);
    } else {
        let _ = fs::remove_file(&cache_path);
        let _ = fs::remove_file(&cached_output_path);
    }
    let _ = fs::remove_file(&input_path);
    let _ = fs::remove_file(&output_path);
    result
}

#[tauri::command]
async fn run_ribote_analysis(
    module_id: String,
    request: serde_json::Value,
) -> Result<serde_json::Value, String> {
    tauri::async_runtime::spawn_blocking(move || run_ribote_analysis_blocking(module_id, request))
        .await
        .map_err(|error| format!("Failed to join analysis worker: {error}"))?
}

fn run_ribote_analysis_blocking(
    module_id: String,
    mut request: serde_json::Value,
) -> Result<serde_json::Value, String> {
    let temp_dir = std::env::temp_dir();
    let suffix = timestamp_suffix();
    let input_path = temp_dir.join(format!("ribote_analysis_input_{module_id}_{suffix}.json"));
    let output_path = temp_dir.join(format!("ribote_analysis_output_{module_id}_{suffix}.json"));
    let annotation_dir = request
        .get("annotationDir")
        .and_then(serde_json::Value::as_str)
        .ok_or_else(|| "Analysis request is missing annotationDir.".to_string())?
        .to_string();
    let session_cache_dir = annotation_cache_dir(&annotation_dir)?;
    let annotation_fingerprint = directory_fingerprint(Path::new(&annotation_dir));
    let preprocess_matrix_path = request
        .get("preprocessMatrixPath")
        .and_then(serde_json::Value::as_str)
        .map(PathBuf::from);
    let te_result_path = request
        .get("teResultPath")
        .and_then(serde_json::Value::as_str)
        .map(PathBuf::from);
    let mut signature_request = request.clone();
    signature_request["moduleId"] = json!(module_id);
    remove_json_fields(&mut signature_request, &["resultPath"]);
    let mut extra_parts = vec![annotation_fingerprint];
    if let Some(path) = preprocess_matrix_path.as_deref() {
        extra_parts.push(file_fingerprint(path));
    }
    if let Some(path) = te_result_path.as_deref() {
        extra_parts.push(file_fingerprint(path));
    }
    let result_signature = cache_signature(&signature_request, &extra_parts);
    let result_path = session_cache_dir.join(format!("analysis_{module_id}_{result_signature}.csv"));
    let cached_output_path = session_cache_dir.join(format!("analysis_{module_id}_{result_signature}.json"));

    if cached_output_path.is_file() && result_path.is_file() {
        return read_cached_json(&cached_output_path);
    }

    request["moduleId"] = json!(module_id);
    request["resultPath"] = json!(result_path.to_string_lossy());
    request["sessionCacheDir"] = json!(session_cache_dir.to_string_lossy());

    let mut input_file = File::create(&input_path)
        .map_err(|error| format!("Failed to create analysis input: {error}"))?;
    input_file
        .write_all(request.to_string().as_bytes())
        .map_err(|error| format!("Failed to write analysis input: {error}"))?;

    let result = run_r_json_script("analysis_modules.R", &input_path, &output_path);
    if result.is_ok() {
        let _ = fs::copy(&output_path, &cached_output_path);
    } else {
        let _ = fs::remove_file(&result_path);
        let _ = fs::remove_file(&cached_output_path);
    }
    let _ = fs::remove_file(&input_path);
    let _ = fs::remove_file(&output_path);
    result
}

#[tauri::command]
fn read_text_file(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|error| format!("Failed to read '{path}': {error}"))
}

#[tauri::command]
fn write_text_file(path: String, content: String) -> Result<(), String> {
    fs::write(&path, content).map_err(|error| format!("Failed to write '{path}': {error}"))
}


#[tauri::command]
fn write_binary_file(path: String, bytes: Vec<u8>) -> Result<(), String> {
    fs::write(&path, bytes).map_err(|error| format!("Failed to write '{path}': {error}"))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .on_window_event(|_window, event| {
            if matches!(event, tauri::WindowEvent::CloseRequested { .. }) {
                cleanup_session_cache_dirs();
            }
        })
        .invoke_handler(tauri::generate_handler![
            validate_annotation_directory,
            read_matrix_preview,
            run_data_preprocess,
            run_ribote_analysis,
            terminate_active_r_processes,
            read_text_file,
            write_text_file,
            write_binary_file
        ])
        .run(tauri::generate_context!())
        .expect("error while running RiboTE");
}
