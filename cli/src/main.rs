mod client;
mod paths;
mod daemon;

use anyhow::Result;
use clap::{Parser, Subcommand};
use serde_json::json;

#[derive(Parser)]
#[command(name = "lattice", about = "LLM-native work management CLI for Claude Code.\n\nWorkflow: Project → Plan (approve) → Phase → Bolt (activate) → Step\n\nPlan must be approved (draft → active) before steps can be started.\nBolt must be activated (planning → active) before steps can be started.\nPhase is a pure grouping entity with no status.\nStep is the only entity managed directly: todo → in_progress → done/cancelled.\nCompleted bolts cannot be restarted — create a new one.\n\nQuick start:\n  lattice project new \"my-app\" --cwd .\n  lattice plan new --project PROJ-my-app \"MVP\"\n  lattice plan approve PLAN-xxx\n  lattice phase new --plan PLAN-xxx \"Phase 1\"\n  lattice bolt new --project PROJ-my-app \"Sprint 1\"\n  lattice bolt activate BOLT-xxx\n  lattice step new \"Build login\" --assignee main\n  lattice step update STEP-xxx --status in_progress\n  lattice step update STEP-xxx --status done")]
struct Cli {
    /// Output format: json (default), table, yaml
    #[arg(long, global = true, default_value = "json")]
    format: String,
    /// Quiet mode: only output the entity ID
    #[arg(short, long, global = true)]
    quiet: bool,
    #[command(subcommand)]
    command: Command,
}

#[derive(Subcommand)]
enum Command {
    /// Show work dashboard for current project (SessionStart context injection)
    Dashboard {
        /// Working directory to detect project
        #[arg(long)]
        cwd: Option<String>,
        /// Filter: active | next | all (default: all)
        #[arg(long, default_value = "all")]
        show: String,
    },
    /// Manage latticed daemon
    #[command(alias = "d")]
    Daemon {
        #[command(subcommand)]
        action: DaemonAction,
    },
    /// Manage projects
    #[command(alias = "proj")]
    Project {
        #[command(subcommand)]
        action: ProjectAction,
    },
    /// Manage plans
    #[command(alias = "pl")]
    Plan {
        #[command(subcommand)]
        action: PlanAction,
    },
    /// Manage phases
    #[command(alias = "ph")]
    Phase {
        #[command(subcommand)]
        action: PhaseAction,
    },
    /// Manage bolts (sprint / AIDLC bolt cycles)
    #[command(alias = "b")]
    Bolt {
        #[command(subcommand)]
        action: BoltAction,
    },
    /// Manage steps
    #[command(alias = "s")]
    Step {
        #[command(subcommand)]
        action: StepAction,
    },
    /// Manage artifacts
    #[command(alias = "art")]
    Artifact {
        #[command(subcommand)]
        action: ArtifactAction,
    },
    /// Manage runs
    #[command(alias = "r")]
    Run {
        #[command(subcommand)]
        action: RunAction,
    },
    /// Manage step comments
    #[command(alias = "c")]
    Comment {
        #[command(subcommand)]
        action: CommentAction,
    },
    /// Manage questions
    #[command(alias = "q")]
    Question {
        #[command(subcommand)]
        action: QuestionAction,
    },
}

// ========== Daemon ==========
#[derive(Subcommand)]
pub enum DaemonAction {
    Start,
    Stop,
    Status,
    Restart,
}

// ========== Project ==========
#[derive(Subcommand)]
enum ProjectAction {
    /// Create a new project. Each project maps to one or more working directories.
    New {
        /// Project name (used to generate ID: PROJ-<slugified-name>)
        name: String,
        /// Project description
        #[arg(long)]
        description: Option<String>,
        /// Working directory to associate (defaults to current dir)
        #[arg(long)]
        cwd: Option<String>,
        /// Short uppercase key for ticket numbers (e.g. LAT → LAT-1, LAT-2)
        #[arg(long)]
        key: Option<String>,
    },
    /// Show project details by ID
    Show { id: String },
    /// List all projects
    List,
    /// Update project properties
    Update {
        id: String,
        #[arg(long)]
        name: Option<String>,
        #[arg(long)]
        description: Option<String>,
        /// Wiki root paths as JSON array, e.g. '["docs","wiki","/absolute/path"]'
        #[arg(long)]
        wiki_paths: Option<String>,
    },
    /// Delete a project and all associated data
    Delete { id: String },
    /// Add a working directory to the project
    #[command(name = "add-cwd")]
    AddCwd {
        id: String,
        /// Directory path to add
        #[arg(long)]
        cwd: Option<String>,
    },
    /// Remove a working directory from the project
    #[command(name = "remove-cwd")]
    RemoveCwd {
        id: String,
        /// Directory path to remove
        #[arg(long)]
        cwd: String,
    },
}

// ========== Plan ==========
#[derive(Subcommand)]
enum PlanAction {
    /// Create a new plan. Plans start as 'draft' and must be approved before work can begin.
    /// Steps can be created under draft plans (as todo) but cannot be started (in_progress).
    New {
        /// Plan title
        title: String,
        /// Project ID this plan belongs to
        #[arg(long)]
        project: String,
        /// Plan description
        #[arg(long)]
        description: Option<String>,
        /// Source: manual (default) or import
        #[arg(long, default_value = "manual")]
        source: String,
        /// Source file path (for imported plans)
        #[arg(long)]
        source_path: Option<String>,
    },
    /// Show plan details
    Show { id: String },
    /// List plans with optional filters
    List {
        /// Filter by project ID
        #[arg(long)]
        project_id: Option<String>,
        /// Filter by status: draft, active, completed
        #[arg(long)]
        status: Option<String>,
    },
    /// Update plan properties. Status: draft, active, completed
    Update {
        id: String,
        #[arg(long)]
        title: Option<String>,
        #[arg(long)]
        description: Option<String>,
        /// Plan status: draft, active, completed. Use 'approve' command for draft → active.
        #[arg(long)]
        status: Option<String>,
    },
    /// Delete a plan
    Delete { id: String },
    /// Approve a draft plan (draft → active). Required before steps can be started.
    Approve { id: String },
    /// Import a plan from a markdown file
    Import {
        /// Path to plan markdown file
        file: String,
        #[arg(long)]
        project: Option<String>,
        #[arg(long)]
        cwd: Option<String>,
        #[arg(long, default_value = "import")]
        source: String,
        #[arg(long)]
        dry_run: bool,
    },
}

// ========== Phase ==========
#[derive(Subcommand)]
enum PhaseAction {
    /// Create a new phase. Phase is a pure grouping entity (no status).
    /// Organize steps into logical groups within a plan.
    New {
        /// Phase title
        title: String,
        /// Plan ID this phase belongs to
        #[arg(long)]
        plan: String,
        /// Phase goal description
        #[arg(long)]
        goal: Option<String>,
        /// Sort order within plan
        #[arg(long)]
        idx: Option<i64>,
    },
    /// Show phase details
    Show { id: String },
    /// List phases with optional filters
    List {
        /// Filter by plan ID
        #[arg(long)]
        plan_id: Option<String>,
    },
    /// Update phase title or goal
    Update {
        id: String,
        #[arg(long)]
        title: Option<String>,
        #[arg(long)]
        goal: Option<String>,
    },
    /// Delete a phase
    Delete { id: String },
}

// ========== Bolt ==========
#[derive(Subcommand)]
enum BoltAction {
    /// Create a new bolt (sprint). Starts in 'planning' status.
    /// Bolts are time-boxed iterations that pull steps from any phase/plan.
    /// Multiple active bolts per project are supported (parallel bolts).
    New {
        /// Bolt title (e.g. "Sprint 1", "v2.0 Bolt")
        title: String,
        /// Project ID this bolt belongs to
        #[arg(long)]
        project: String,
        /// Sprint goal
        #[arg(long)]
        goal: Option<String>,
        /// Sort order
        #[arg(long)]
        idx: Option<i64>,
    },
    /// Show bolt details
    Show { id: String },
    /// List bolts with optional filters
    List {
        /// Filter by project ID
        #[arg(long)]
        project_id: Option<String>,
        /// Filter by status: planning, active, completed
        #[arg(long)]
        status: Option<String>,
    },
    /// Update bolt properties. Status: planning, active, completed.
    /// Completed bolts cannot be restarted — create a new bolt instead.
    Update {
        id: String,
        #[arg(long)]
        title: Option<String>,
        #[arg(long)]
        goal: Option<String>,
        /// Status: planning, active, completed
        #[arg(long)]
        status: Option<String>,
    },
    /// Delete a bolt (unassigns all steps)
    Delete { id: String },
    /// Activate a planning bolt (planning → active). Required before steps can be started.
    Activate { id: String },
    /// List steps assigned to this bolt
    Steps { id: String },
    /// List backlog steps (not assigned to any bolt) for a project
    Backlog {
        /// Project ID
        #[arg(long)]
        project: String,
    },
}

// ========== Step ==========
#[derive(Subcommand)]
enum StepAction {
    /// Create a new step (atomic work unit). Requires phase and bolt.
    /// Status: todo → in_progress → done/cancelled. Blocked for external dependencies.
    New {
        /// Step title describing the work
        title: String,
        /// Phase ID (auto-inferred from active plan if omitted)
        #[arg(long)]
        phase: Option<String>,
        /// Detailed description (markdown supported)
        #[arg(long, allow_hyphen_values = true)]
        body: Option<String>,
        /// Agent or person responsible (e.g. "main", "sub-agent-1")
        #[arg(long)]
        assignee: Option<String>,
        /// Sort order within phase
        #[arg(long)]
        idx: Option<i64>,
        /// Comma-separated step IDs this step depends on
        #[arg(long, value_delimiter = ',')]
        depends_on: Vec<String>,
        /// Parent step ID for sub-tasks
        #[arg(long)]
        parent_step: Option<String>,
        /// Priority: critical, high, medium, low
        #[arg(long, default_value = "medium")]
        priority: String,
        /// Complexity estimate (freeform, e.g. "high", "3 files")
        #[arg(long)]
        complexity: Option<String>,
        /// Estimated number of file edits
        #[arg(long)]
        estimated_edits: Option<i64>,
        /// Bolt ID (auto-inferred from active bolt if omitted)
        #[arg(long)]
        bolt: Option<String>,
        /// Step type: task, bug, feature, enhancement, refactor, docs, test, chore
        #[arg(long, default_value = "task")]
        r#type: String,
    },
    /// Show step details by ID
    Show { id: String },
    /// List steps with optional filters
    List {
        /// Filter by phase ID
        #[arg(long)]
        phase_id: Option<String>,
        /// Filter by plan ID
        #[arg(long)]
        plan_id: Option<String>,
        /// Filter by status: todo, in_progress, blocked, done, cancelled
        #[arg(long)]
        status: Option<String>,
    },
    /// Update step fields. Status values: todo, in_progress, blocked, done, cancelled
    Update {
        id: String,
        #[arg(long)]
        title: Option<String>,
        /// Status: todo, in_progress, blocked, done, cancelled
        #[arg(long)]
        status: Option<String>,
        /// Agent or person responsible
        #[arg(long)]
        assignee: Option<String>,
        #[arg(long)]
        session_id: Option<String>,
        #[arg(long, default_value = "main")]
        agent: String,
        /// Priority: critical, high, medium, low
        #[arg(long)]
        priority: Option<String>,
        #[arg(long)]
        complexity: Option<String>,
        #[arg(long)]
        estimated_edits: Option<i64>,
        #[arg(long)]
        parent_step: Option<String>,
        #[arg(long)]
        bolt: Option<String>,
    },
    Delete { id: String },
    AppendBody {
        id: String,
        #[arg(long, allow_hyphen_values = true)]
        text: String,
    },
    Search {
        query: String,
        #[arg(long, default_value = "20")]
        limit: u32,
    },
}

// ========== Artifact ==========
#[derive(Subcommand)]
enum ArtifactAction {
    New {
        title: String,
        #[arg(long)]
        r#type: String,
        #[arg(long)]
        step: Option<String>,
        #[arg(long)]
        phase: Option<String>,
        #[arg(long)]
        plan: Option<String>,
        #[arg(long, allow_hyphen_values = true)]
        content: Option<String>,
        #[arg(long, default_value = "md")]
        content_format: String,
        #[arg(long)]
        parent: Option<String>,
    },
    Show { id: String },
    List {
        #[arg(long)]
        step_id: Option<String>,
        #[arg(long)]
        phase_id: Option<String>,
        #[arg(long)]
        plan_id: Option<String>,
        #[arg(long)]
        r#type: Option<String>,
    },
    Delete { id: String },
    /// Search wiki artifacts (FTS5 + vector hybrid)
    Search {
        query: String,
        /// Search mode: keyword | semantic | hybrid
        #[arg(long, default_value = "hybrid")]
        mode: String,
        /// Filter by scope: rag | reference | archive
        #[arg(long, default_value = "rag")]
        scope: String,
        #[arg(long, default_value = "20")]
        limit: u32,
    },
    /// Import docs/ files as Artifacts
    Import {
        /// Working directory to scan docs/ from
        #[arg(long)]
        cwd: String,
        #[arg(long)]
        plan_id: Option<String>,
        #[arg(long)]
        phase_id: Option<String>,
        /// Scope for imported artifacts: rag | reference | archive
        #[arg(long, default_value = "reference")]
        scope: String,
        /// Preview without creating
        #[arg(long)]
        dry_run: bool,
    },
    /// Export Artifacts to docs/ directory
    Export {
        #[arg(long)]
        cwd: String,
        #[arg(long)]
        plan_id: Option<String>,
        #[arg(long)]
        phase_id: Option<String>,
    },
}

// ========== Run ==========
#[derive(Subcommand)]
enum RunAction {
    Start {
        #[arg(long)]
        step: String,
        #[arg(long)]
        session_id: Option<String>,
        #[arg(long, default_value = "main")]
        agent: String,
    },
    Finish {
        id: String,
        #[arg(long)]
        result: String,
        #[arg(long, allow_hyphen_values = true)]
        notes: Option<String>,
    },
    Show { id: String },
    List {
        #[arg(long)]
        step_id: Option<String>,
        #[arg(long)]
        session_id: Option<String>,
    },
}

// ========== Question ==========
#[derive(Subcommand)]
enum QuestionAction {
    New {
        body: String,
        #[arg(long)]
        plan: Option<String>,
        #[arg(long)]
        phase: Option<String>,
        #[arg(long)]
        step: Option<String>,
        #[arg(long, default_value = "clarification")]
        kind: String,
        #[arg(long, default_value = "prompt")]
        origin: String,
        #[arg(long, default_value = "main")]
        asked_by: String,
    },
    Answer {
        id: String,
        #[arg(long, allow_hyphen_values = true)]
        text: String,
        #[arg(long, default_value = "human")]
        by: String,
    },
    Show { id: String },
    List {
        #[arg(long)]
        plan_id: Option<String>,
        #[arg(long)]
        phase_id: Option<String>,
        #[arg(long)]
        step_id: Option<String>,
        #[arg(long)]
        pending: Option<bool>,
    },
}

// ========== Comment ==========
#[derive(Subcommand)]
enum CommentAction {
    New {
        #[arg(long)]
        step: String,
        #[arg(long, allow_hyphen_values = true)]
        body: String,
        #[arg(long, default_value = "main")]
        author: String,
    },
    List {
        #[arg(long)]
        step_id: String,
    },
    Delete { id: String },
}

fn strip_nulls(val: &serde_json::Value) -> serde_json::Value {
    match val {
        serde_json::Value::Object(map) => {
            let filtered: serde_json::Map<String, serde_json::Value> = map.iter()
                .filter(|(_, v)| !v.is_null())
                .map(|(k, v)| (k.clone(), strip_nulls(v)))
                .collect();
            serde_json::Value::Object(filtered)
        }
        serde_json::Value::Array(arr) => {
            serde_json::Value::Array(arr.iter().map(strip_nulls).collect())
        }
        other => other.clone(),
    }
}

fn output_fmt(val: &serde_json::Value, format: &str) {
    match format {
        "table" => print_table(val),
        "yaml" => print_yaml(val, 0),
        _ => println!("{}", serde_json::to_string(&strip_nulls(val)).unwrap()),
    }
}

fn print_table(val: &serde_json::Value) {
    match val {
        serde_json::Value::Array(arr) if !arr.is_empty() => {
            if let Some(first) = arr[0].as_object() {
                let keys: Vec<&String> = first.keys().collect();
                // Filter out long fields
                let visible: Vec<&&String> = keys.iter()
                    .filter(|k| !["body", "content", "depends_on"].contains(&k.as_str()))
                    .collect();
                let headers: Vec<&str> = visible.iter().map(|k| k.as_str()).collect();
                let rows: Vec<Vec<String>> = arr.iter().map(|item| {
                    visible.iter().map(|k| {
                        let v = item.get(k.as_str()).unwrap_or(&serde_json::Value::Null);
                        let s = match v {
                            serde_json::Value::Null => String::new(),
                            serde_json::Value::String(s) => s.clone(),
                            serde_json::Value::Number(n) => n.to_string(),
                            serde_json::Value::Bool(b) => b.to_string(),
                            _ => serde_json::to_string(v).unwrap_or_default(),
                        };
                        if s.chars().count() > 50 {
                            let truncated: String = s.chars().take(47).collect();
                            format!("{}...", truncated)
                        } else { s }
                    }).collect()
                }).collect();
                // Compute widths (use Unicode display width for CJK chars)
                fn display_width(s: &str) -> usize {
                    s.chars().map(|c| if c.is_ascii() { 1 } else { 2 }).sum()
                }
                fn pad_to_width(s: &str, target: usize) -> String {
                    let w = display_width(s);
                    if w >= target { s.to_string() } else { format!("{}{}", s, " ".repeat(target - w)) }
                }
                let widths: Vec<usize> = headers.iter().enumerate().map(|(i, h)| {
                    let max_row = rows.iter().map(|r| r.get(i).map_or(0, |c| display_width(c))).max().unwrap_or(0);
                    display_width(h).max(max_row)
                }).collect();
                let sep: String = format!("+{}+", widths.iter().map(|w| "-".repeat(w + 2)).collect::<Vec<_>>().join("+"));
                let fmt_row = |cells: &[String]| -> String {
                    format!("| {} |", cells.iter().enumerate().map(|(i, c)| pad_to_width(c, widths[i])).collect::<Vec<_>>().join(" | "))
                };
                println!("{}", sep);
                println!("{}", fmt_row(&headers.iter().map(|s| s.to_string()).collect::<Vec<_>>()));
                println!("{}", sep);
                for row in &rows { println!("{}", fmt_row(row)); }
                println!("{}", sep);
            }
        }
        serde_json::Value::Object(obj) => {
            for (k, v) in obj {
                let s = match v {
                    serde_json::Value::String(s) => s.clone(),
                    serde_json::Value::Null => String::new(),
                    _ => serde_json::to_string(v).unwrap_or_default(),
                };
                println!("{}: {}", k, if s.len() > 80 { format!("{}...", &s[..77]) } else { s });
            }
        }
        _ => println!("{}", serde_json::to_string(val).unwrap()),
    }
}

fn print_yaml(val: &serde_json::Value, indent: usize) {
    let pad = "  ".repeat(indent);
    match val {
        serde_json::Value::Null => println!("{}null", pad),
        serde_json::Value::Bool(b) => println!("{}{}", pad, b),
        serde_json::Value::Number(n) => println!("{}{}", pad, n),
        serde_json::Value::String(s) => println!("{}{}", pad, s),
        serde_json::Value::Array(arr) => {
            for item in arr {
                print!("{}- ", pad);
                if item.is_object() {
                    println!();
                    print_yaml(item, indent + 1);
                } else {
                    let s = serde_json::to_string(item).unwrap_or_default();
                    println!("{}", s);
                }
            }
        }
        serde_json::Value::Object(obj) => {
            for (k, v) in obj {
                match v {
                    serde_json::Value::Object(_) | serde_json::Value::Array(_) => {
                        println!("{}{}:", pad, k);
                        print_yaml(v, indent + 1);
                    }
                    _ => {
                        let s = match v {
                            serde_json::Value::Null => "null".to_string(),
                            serde_json::Value::String(s) => s.clone(),
                            _ => serde_json::to_string(v).unwrap_or_default(),
                        };
                        println!("{}{}: {}", pad, k, s);
                    }
                }
            }
        }
    }
}

fn query_string(params: &[(&str, &Option<String>)]) -> String {
    let pairs: Vec<String> = params
        .iter()
        .filter_map(|(k, v)| v.as_ref().map(|val| format!("{}={}", k, urlenc(val))))
        .collect();
    if pairs.is_empty() { String::new() } else { format!("?{}", pairs.join("&")) }
}

fn urlenc(s: &str) -> String {
    s.replace('%', "%25")
        .replace(' ', "%20")
        .replace('&', "%26")
        .replace('=', "%3D")
        .replace('#', "%23")
}

#[tokio::main(flavor = "current_thread")]
async fn main() -> Result<()> {
    let cli = Cli::parse();
    let fmt = cli.format.clone();
    let quiet = cli.quiet;

    match cli.command {
        Command::Daemon { action } => {
            return daemon::run(action).await;
        }
        _ => {}
    }

    let c = client::make_client();
    let output = |val: &serde_json::Value| {
        if quiet {
            // In quiet mode, just print the ID field if present
            if let Some(id) = val.get("id").and_then(|v| v.as_str()) {
                println!("{}", id);
            } else if let serde_json::Value::Array(arr) = val {
                for item in arr {
                    if let Some(id) = item.get("id").and_then(|v| v.as_str()) {
                        println!("{}", id);
                    }
                }
            }
        } else {
            output_fmt(val, &fmt);
        }
    };

    match cli.command {
        Command::Daemon { .. } => unreachable!(),

        Command::Dashboard { cwd, show } => {
            let cwd = cwd.unwrap_or_else(|| std::env::current_dir().unwrap().to_string_lossy().to_string());
            let qs = format!("?cwd={}&show={}", urlenc(&cwd), urlenc(&show));
            let val = client::get(&c, &format!("/dashboard{qs}")).await?;
            // Print the context string directly (not JSON) for hook injection
            if let Some(ctx) = val.get("context").and_then(|v| v.as_str()) {
                print!("{ctx}");
            }
        }

        // ===== Project =====
        Command::Project { action } => match action {
            ProjectAction::New { name, description, cwd, key } => {
                let cwd = cwd.or_else(|| Some(std::env::current_dir().unwrap().to_string_lossy().to_string()));
                let val = client::request(&c, "POST", "/projects", Some(json!({
                    "name": name, "description": description, "cwd": cwd, "key": key
                }))).await?;
                output(&val);
            }
            ProjectAction::Show { id } => output(&client::get(&c, &format!("/projects/{id}")).await?),
            ProjectAction::List => output(&client::get(&c, "/projects").await?),
            ProjectAction::Update { id, name, description, wiki_paths } => {
                let mut body = json!({});
                if let Some(v) = name { body["name"] = json!(v); }
                if let Some(v) = description { body["description"] = json!(v); }
                if let Some(v) = wiki_paths {
                    let parsed: serde_json::Value = serde_json::from_str(&v)
                        .unwrap_or_else(|_| json!([v]));
                    body["wiki_paths"] = parsed;
                }
                output(&client::request(&c, "PATCH", &format!("/projects/{id}"), Some(body)).await?);
            }
            ProjectAction::Delete { id } => {
                output(&client::request(&c, "DELETE", &format!("/projects/{id}"), None).await?);
            }
            ProjectAction::AddCwd { id, cwd } => {
                let cwd = cwd.unwrap_or_else(|| std::env::current_dir().unwrap().to_string_lossy().to_string());
                output(&client::request(&c, "POST", &format!("/projects/{id}/cwds"), Some(json!({"cwd": cwd}))).await?);
            }
            ProjectAction::RemoveCwd { id, cwd } => {
                output(&client::request(&c, "DELETE", &format!("/projects/{id}/cwds"), Some(json!({"cwd": cwd}))).await?);
            }
        },

        // ===== Plan =====
        Command::Plan { action } => match action {
            PlanAction::New { title, project, description, source, source_path } => {
                output(&client::request(&c, "POST", "/plans", Some(json!({
                    "project_id": project, "title": title, "description": description,
                    "source": source, "source_path": source_path,
                }))).await?);
            }
            PlanAction::Show { id } => output(&client::get(&c, &format!("/plans/{id}")).await?),
            PlanAction::List { project_id, status } => {
                let qs = query_string(&[("project_id", &project_id), ("status", &status)]);
                output(&client::get(&c, &format!("/plans{qs}")).await?);
            }
            PlanAction::Update { id, title, description, status } => {
                let mut body = json!({});
                if let Some(v) = title { body["title"] = json!(v); }
                if let Some(v) = description { body["description"] = json!(v); }
                if let Some(v) = status { body["status"] = json!(v); }
                output(&client::request(&c, "PATCH", &format!("/plans/{id}"), Some(body)).await?);
            }
            PlanAction::Delete { id } => {
                output(&client::request(&c, "DELETE", &format!("/plans/{id}"), None).await?);
            }
            PlanAction::Approve { id } => {
                output(&client::request(&c, "POST", &format!("/plans/{id}/approve"), None).await?);
            }
            PlanAction::Import { file, project, cwd, source, dry_run } => {
                output(&client::request(&c, "POST", "/plans/import", Some(json!({
                    "file": file, "project": project, "cwd": cwd, "source": source, "dryRun": dry_run,
                }))).await?);
            }
        },

        // ===== Phase =====
        Command::Phase { action } => match action {
            PhaseAction::New { title, plan, goal, idx } => {
                output(&client::request(&c, "POST", "/phases", Some(json!({
                    "plan_id": plan, "title": title, "goal": goal, "idx": idx,
                }))).await?);
            }
            PhaseAction::Show { id } => output(&client::get(&c, &format!("/phases/{id}")).await?),
            PhaseAction::List { plan_id } => {
                let qs = query_string(&[("plan_id", &plan_id)]);
                output(&client::get(&c, &format!("/phases{qs}")).await?);
            }
            PhaseAction::Update { id, title, goal } => {
                let mut body = json!({});
                if let Some(v) = title { body["title"] = json!(v); }
                if let Some(v) = goal { body["goal"] = json!(v); }
                output(&client::request(&c, "PATCH", &format!("/phases/{id}"), Some(body)).await?);
            }
            PhaseAction::Delete { id } => {
                output(&client::request(&c, "DELETE", &format!("/phases/{id}"), None).await?);
            }
        },

        // ===== Bolt =====
        Command::Bolt { action } => match action {
            BoltAction::New { title, project, goal, idx } => {
                output(&client::request(&c, "POST", "/bolts", Some(json!({
                    "project_id": project, "title": title, "goal": goal, "idx": idx,
                }))).await?);
            }
            BoltAction::Show { id } => output(&client::get(&c, &format!("/bolts/{id}")).await?),
            BoltAction::List { project_id, status } => {
                let qs = query_string(&[("project_id", &project_id), ("status", &status)]);
                output(&client::get(&c, &format!("/bolts{qs}")).await?);
            }
            BoltAction::Update { id, title, goal, status } => {
                let mut body = json!({});
                if let Some(v) = title { body["title"] = json!(v); }
                if let Some(v) = goal { body["goal"] = json!(v); }
                if let Some(v) = status { body["status"] = json!(v); }
                output(&client::request(&c, "PATCH", &format!("/bolts/{id}"), Some(body)).await?);
            }
            BoltAction::Delete { id } => {
                output(&client::request(&c, "DELETE", &format!("/bolts/{id}"), None).await?);
            }
            BoltAction::Activate { id } => {
                output(&client::request(&c, "POST", &format!("/bolts/{id}/activate"), None).await?);
            }
            BoltAction::Steps { id } => {
                output(&client::get(&c, &format!("/bolts/{id}/steps")).await?);
            }
            BoltAction::Backlog { project } => {
                let qs = format!("?project_id={}", urlenc(&project));
                output(&client::get(&c, &format!("/backlog{qs}")).await?);
            }
        },

        // ===== Step =====
        Command::Step { action } => match action {
            StepAction::New { title, phase, body, assignee, idx, depends_on, parent_step, priority, complexity, estimated_edits, bolt, r#type } => {
                let cwd = std::env::current_dir().ok().map(|p| p.to_string_lossy().to_string());
                let type_val = r#type;
                output(&client::request(&c, "POST", "/steps", Some(json!({
                    "phase_id": phase, "title": title, "body": body.unwrap_or_default(),
                    "assignee": assignee, "idx": idx, "depends_on": depends_on,
                    "parent_step_id": parent_step, "priority": priority,
                    "complexity": complexity, "estimated_edits": estimated_edits,
                    "bolt_id": bolt, "cwd": cwd, "type": type_val,
                }))).await?);
            }
            StepAction::Show { id } => output(&client::get(&c, &format!("/steps/{id}")).await?),
            StepAction::List { phase_id, plan_id, status } => {
                let qs = query_string(&[("phase_id", &phase_id), ("plan_id", &plan_id), ("status", &status)]);
                output(&client::get(&c, &format!("/steps{qs}")).await?);
            }
            StepAction::Update { id, title, status, assignee, session_id, agent, priority, complexity, estimated_edits, parent_step, bolt } => {
                let mut body = json!({});
                if let Some(v) = title { body["title"] = json!(v); }
                if let Some(v) = status { body["status"] = json!(v); }
                if let Some(v) = assignee { body["assignee"] = json!(v); }
                if let Some(v) = session_id { body["_session_id"] = json!(v); }
                body["_agent"] = json!(agent);
                if let Some(v) = priority { body["priority"] = json!(v); }
                if let Some(v) = complexity { body["complexity"] = json!(v); }
                if let Some(v) = estimated_edits { body["estimated_edits"] = json!(v); }
                if let Some(v) = parent_step { body["parent_step_id"] = json!(v); }
                if let Some(v) = bolt { body["bolt_id"] = json!(v); }
                output(&client::request(&c, "PATCH", &format!("/steps/{id}"), Some(body)).await?);
            }
            StepAction::Delete { id } => {
                output(&client::request(&c, "DELETE", &format!("/steps/{id}"), None).await?);
            }
            StepAction::AppendBody { id, text } => {
                output(&client::request(&c, "POST", &format!("/steps/{id}/body"), Some(json!({"text": text}))).await?);
            }
            StepAction::Search { query, limit } => {
                let qs = format!("?q={}&limit={limit}", urlenc(&query));
                output(&client::get(&c, &format!("/steps/search{qs}")).await?);
            }
        },

        // ===== Artifact =====
        Command::Artifact { action } => match action {
            ArtifactAction::New { title, r#type, step, phase, plan, content, content_format, parent } => {
                output(&client::request(&c, "POST", "/artifacts", Some(json!({
                    "type": r#type, "title": title, "step_id": step, "phase_id": phase,
                    "plan_id": plan, "content": content.unwrap_or_default(), "content_format": content_format,
                    "parent_id": parent,
                }))).await?);
            }
            ArtifactAction::Show { id } => output(&client::get(&c, &format!("/artifacts/{id}")).await?),
            ArtifactAction::List { step_id, phase_id, plan_id, r#type } => {
                let type_opt = r#type;
                let qs = query_string(&[
                    ("step_id", &step_id), ("phase_id", &phase_id), ("plan_id", &plan_id), ("type", &type_opt)
                ]);
                output(&client::get(&c, &format!("/artifacts{qs}")).await?);
            }
            ArtifactAction::Delete { id } => {
                output(&client::request(&c, "DELETE", &format!("/artifacts/{id}"), None).await?);
            }
            ArtifactAction::Search { query, mode, scope, limit } => {
                let qs = format!("?q={}&mode={}&scope={}&limit={}", urlenc(&query), mode, scope, limit);
                output(&client::get(&c, &format!("/artifacts/search{qs}")).await?);
            }
            ArtifactAction::Import { cwd, plan_id, phase_id, scope, dry_run } => {
                output(&client::request(&c, "POST", "/artifacts/import", Some(json!({
                    "cwd": cwd, "plan_id": plan_id, "phase_id": phase_id, "scope": scope, "dry_run": dry_run,
                }))).await?);
            }
            ArtifactAction::Export { cwd, plan_id, phase_id } => {
                output(&client::request(&c, "POST", "/artifacts/export", Some(json!({
                    "cwd": cwd, "plan_id": plan_id, "phase_id": phase_id,
                }))).await?);
            }
        },

        // ===== Run =====
        Command::Run { action } => match action {
            RunAction::Start { step, session_id, agent } => {
                output(&client::request(&c, "POST", "/runs", Some(json!({
                    "step_id": step, "session_id": session_id, "agent": agent,
                }))).await?);
            }
            RunAction::Finish { id, result, notes } => {
                output(&client::request(&c, "POST", &format!("/runs/{id}/finish"), Some(json!({
                    "result": result, "notes": notes,
                }))).await?);
            }
            RunAction::Show { id } => output(&client::get(&c, &format!("/runs/{id}")).await?),
            RunAction::List { step_id, session_id } => {
                let qs = query_string(&[("step_id", &step_id), ("session_id", &session_id)]);
                output(&client::get(&c, &format!("/runs{qs}")).await?);
            }
        },

        // ===== Comment =====
        Command::Comment { action } => match action {
            CommentAction::New { step, body, author } => {
                output(&client::request(&c, "POST", &format!("/steps/{step}/comments"), Some(json!({
                    "author": author, "body": body,
                }))).await?);
            }
            CommentAction::List { step_id } => {
                output(&client::get(&c, &format!("/steps/{step_id}/comments")).await?);
            }
            CommentAction::Delete { id } => {
                output(&client::request(&c, "DELETE", &format!("/comments/{id}"), None).await?);
            }
        },

        // ===== Question =====
        Command::Question { action } => match action {
            QuestionAction::New { body, plan, phase, step, kind, origin, asked_by } => {
                output(&client::request(&c, "POST", "/questions", Some(json!({
                    "plan_id": plan, "phase_id": phase, "step_id": step,
                    "kind": kind, "origin": origin, "body": body, "asked_by": asked_by,
                }))).await?);
            }
            QuestionAction::Answer { id, text, by } => {
                output(&client::request(&c, "POST", &format!("/questions/{id}/answer"), Some(json!({
                    "answer": text, "answered_by": by,
                }))).await?);
            }
            QuestionAction::Show { id } => output(&client::get(&c, &format!("/questions/{id}")).await?),
            QuestionAction::List { plan_id, phase_id, step_id, pending } => {
                let pending_str = pending.map(|b| b.to_string());
                let qs = query_string(&[
                    ("plan_id", &plan_id), ("phase_id", &phase_id), ("step_id", &step_id), ("pending", &pending_str)
                ]);
                output(&client::get(&c, &format!("/questions{qs}")).await?);
            }
        },
    }

    Ok(())
}
