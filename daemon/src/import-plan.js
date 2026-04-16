import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { projects, plans, units, tasks } from './repo.js';

// Parse a Claude Code plan markdown file into Clawket entities.
// Rules (deterministic, no LLM):
//   - First `# <title>` line is the Plan title.
//   - `## Unit N: <title>` (or `## Unit: <title>`) sections become Unit rows.
//     If no explicit Unit heading found, the whole plan becomes a single "Unit 1".
//   - Within a Unit, `### <title>` headings become Tasks.
//     Or, if the Unit contains a numbered list ("1. foo", "2. bar") at the top level,
//     those become Tasks instead.
//   - The text content between headings becomes the body of the enclosing entity.

export function parsePlanMarkdown(md) {
  const lines = md.split('\n');
  const plan = { title: null, description: '', units: [] };

  // Find plan title
  const titleMatch = lines.find(l => /^#\s+/.test(l));
  if (titleMatch) plan.title = titleMatch.replace(/^#\s+/, '').trim();

  // Find unit sections by looking for ## Unit N: or ## Unit: headings
  const unitHeadingRe = /^##\s+Unit\s*(\d+)?\s*[:.]?\s*(.*)$/i;

  // Locate unit headings
  const unitMarkers = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(unitHeadingRe);
    if (m) {
      unitMarkers.push({
        lineIdx: i,
        idx: unitMarkers.length,
        title: (m[2] && m[2].trim()) || `Unit ${m[1] || unitMarkers.length + 1}`,
      });
    }
  }

  if (unitMarkers.length === 0) {
    // No explicit Unit section: synthesize a single Unit containing all content
    plan.units.push({
      idx: 0,
      title: 'Unit 1',
      goal: null,
      body: lines.join('\n').trim(),
      tasks: extractTasksFromBody(lines, 0, lines.length),
    });
  } else {
    // Description = content from start to first unit
    plan.description = lines.slice(0, unitMarkers[0].lineIdx).join('\n').trim();

    for (let p = 0; p < unitMarkers.length; p++) {
      const start = unitMarkers[p].lineIdx;
      const end = p + 1 < unitMarkers.length ? unitMarkers[p + 1].lineIdx : lines.length;
      plan.units.push({
        idx: p,
        title: unitMarkers[p].title,
        goal: null,
        body: lines.slice(start, end).join('\n').trim(),
        tasks: extractTasksFromBody(lines, start + 1, end),
      });
    }
  }

  return plan;
}

function extractTasksFromBody(lines, start, end) {
  // Prefer ### subheadings as tasks
  const h3Re = /^###\s+(.+)$/;
  const h3Indices = [];
  for (let i = start; i < end; i++) {
    const m = lines[i].match(h3Re);
    if (m) h3Indices.push({ lineIdx: i, title: m[1].trim() });
  }

  if (h3Indices.length > 0) {
    const out = [];
    for (let j = 0; j < h3Indices.length; j++) {
      const s = h3Indices[j].lineIdx;
      const e = j + 1 < h3Indices.length ? h3Indices[j + 1].lineIdx : end;
      out.push({
        idx: j,
        title: h3Indices[j].title,
        body: lines.slice(s + 1, e).join('\n').trim(),
      });
    }
    return out;
  }

  // Fallback: look for numbered list items at paragraph starts
  const numberedRe = /^\s*\d+\.\s+\*?\*?([^*]+)\*?\*?(.*)$/;
  const out = [];
  for (let i = start; i < end; i++) {
    const m = lines[i].match(numberedRe);
    if (m) {
      out.push({
        idx: out.length,
        title: (m[1] || '').trim(),
        body: ((m[2] || '') + '\n' + gatherContinuation(lines, i + 1, end)).trim(),
      });
    }
  }
  return out;
}

function gatherContinuation(lines, from, end) {
  // Collect lines until next list item or heading
  const out = [];
  for (let i = from; i < end; i++) {
    if (/^##?#?\s+/.test(lines[i]) || /^\s*\d+\.\s+/.test(lines[i])) break;
    out.push(lines[i]);
  }
  return out.join('\n');
}

export function importPlanFile(filePath, { projectName = null, cwd = null, source = 'import', dryRun = false } = {}) {
  const md = readFileSync(filePath, 'utf8');
  const parsed = parsePlanMarkdown(md);
  if (!parsed.title) throw new Error('no plan title (first # heading) found');

  // Resolve project
  let project;
  if (projectName) {
    project = projects.getByName(projectName);
    if (!project) {
      project = projects.create({ name: projectName, cwd: cwd || process.cwd() });
    }
  } else {
    project = projects.getByCwd(cwd || process.cwd());
    if (!project) {
      const fallback = basename(filePath, '.md').slice(0, 40);
      project = projects.create({ name: fallback, cwd: cwd || process.cwd() });
    }
  }

  if (dryRun) {
    return {
      dryRun: true,
      project: project,
      plan_title: parsed.title,
      unit_count: parsed.units.length,
      task_count: parsed.units.reduce((n, u) => n + u.tasks.length, 0),
      units: parsed.units.map(u => ({ title: u.title, tasks: u.tasks.map(t => t.title) })),
    };
  }

  // Create plan
  const plan = plans.create({
    project_id: project.id,
    title: parsed.title,
    description: parsed.description || null,
    source,
    source_path: filePath,
  });

  // Create units + tasks
  const createdUnits = [];
  for (const u of parsed.units) {
    const unitRow = units.create({
      plan_id: plan.id,
      title: u.title,
      goal: null,
      idx: u.idx,
      approval_required: false,
    });
    const createdTasks = [];
    for (const t of u.tasks) {
      const taskRow = tasks.create({
        unit_id: unitRow.id,
        title: t.title,
        body: t.body,
        idx: t.idx,
      });
      createdTasks.push(taskRow);
    }
    createdUnits.push({ unit: unitRow, tasks: createdTasks });
  }

  return {
    project,
    plan,
    units: createdUnits,
    summary: {
      unit_count: createdUnits.length,
      task_count: createdUnits.reduce((n, u) => n + u.tasks.length, 0),
    },
  };
}
