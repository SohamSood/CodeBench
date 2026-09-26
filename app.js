// Base path helper: problem files load directly from problems/
const BASE_PATH = "";

// List of available problems on the platform
const PROBLEMS = [
  { id: "two-sum", title: "1. Two Sum", difficulty: "Easy" },
  { id: "binary-search", title: "2. Binary Search", difficulty: "Easy" },
  { id: "maximum-element", title: "3. Maximum Element", difficulty: "Easy" }
];

// Judge0 Language IDs and extensions mapping
// 63: JavaScript (Node.js 12.14.0), 71: Python (3.8.1), 54: C++ (GCC 9.2.0), 62: Java (OpenJDK 13.0.1)
const LANGUAGE_CONFIG = {
  js: { name: "JavaScript", ext: "js", id: 63 },
  python: { name: "Python", ext: "py", id: 71 },
  cpp: { name: "C++", ext: "cpp", id: 54 },
  java: { name: "Java", ext: "java", id: 62 }
};

// Application State
let currentProblemId = "two-sum";
let currentLanguage = "js";

// DOM Elements
const problemSelect = document.getElementById("problemSelect");
const languageSelect = document.getElementById("languageSelect");

const problemTitle = document.getElementById("problemTitle");
const problemDifficulty = document.getElementById("problemDifficulty");
const problemDescription = document.getElementById("problemDescription");
const problemExamples = document.getElementById("problemExamples");
const problemConstraints = document.getElementById("problemConstraints");

const activeLangTag = document.getElementById("activeLangTag");
const codeEditor = document.getElementById("codeEditor");

// ===================================================================
// Problem Management & Template Loading
// ===================================================================

function populateProblemDropdown() {
  problemSelect.innerHTML = "";
  PROBLEMS.forEach((prob) => {
    const option = document.createElement("option");
    option.value = prob.id;
    option.textContent = `${prob.title} (${prob.difficulty})`;
    problemSelect.appendChild(option);
  });
}

function onProblemChange(e) {
  currentProblemId = e.target.value;
  const url = new URL(window.location);
  url.searchParams.set("problem", currentProblemId);
  window.history.pushState({}, "", url);
  loadProblem(currentProblemId);
}

async function loadProblem(problemId) {
  try {
    // 1. Fetch problem metadata from problem.json
    const problemPath = `${BASE_PATH}problems/${problemId}/problem.json`;
    const res = await fetch(problemPath);
    if (!res.ok) throw new Error(`Failed to load problem metadata: ${problemPath}`);
    const problemData = await res.json();
    renderProblemDetails(problemData);

    // 2. Load code template or restored code
    await loadCodeTemplate();
  } catch (err) {
    console.error("Error loading problem:", err);
    problemTitle.textContent = "Error loading problem";
    problemDescription.textContent = err.message;
  }
}

function renderProblemDetails(data) {
  problemTitle.textContent = data.title;
  problemDifficulty.textContent = data.difficulty;

  problemDifficulty.className = "badge";
  if (data.difficulty.toLowerCase() === "easy") {
    problemDifficulty.classList.add("badge-easy");
  } else if (data.difficulty.toLowerCase() === "medium") {
    problemDifficulty.classList.add("badge-medium");
  } else {
    problemDifficulty.classList.add("badge-hard");
  }

  problemDescription.textContent = data.description;

  // Render Examples
  problemExamples.innerHTML = "";
  if (data.examples && data.examples.length > 0) {
    data.examples.forEach((ex, idx) => {
      const card = document.createElement("div");
      card.className = "example-card";
      let html = `<div class="example-header">Example ${idx + 1}:</div>`;
      html += `<div class="example-field"><span class="example-label">Input:</span> <span class="example-val">${formatValue(ex.input)}</span></div>`;
      html += `<div class="example-field"><span class="example-label">Output:</span> <span class="example-val">${formatValue(ex.output)}</span></div>`;
      if (ex.explanation) {
        html += `<div class="example-field"><span class="example-label">Explanation:</span> ${ex.explanation}</div>`;
      }
      card.innerHTML = html;
      problemExamples.appendChild(card);
    });
  }

  // Render Constraints
  problemConstraints.innerHTML = "";
  if (data.constraints && data.constraints.length > 0) {
    data.constraints.forEach((c) => {
      const li = document.createElement("li");
      li.textContent = c;
      problemConstraints.appendChild(li);
    });
  }
}

function onLanguageChange(e) {
  currentLanguage = e.target.value;
  activeLangTag.textContent = LANGUAGE_CONFIG[currentLanguage]?.name || currentLanguage.toUpperCase();
  loadCodeTemplate();
}

async function loadCodeTemplate() {
  const ext = LANGUAGE_CONFIG[currentLanguage]?.ext || "txt";
  const templatePath = `${BASE_PATH}problems/${currentProblemId}/${currentLanguage}/template.${ext}`;

  try {
    const res = await fetch(templatePath);
    if (!res.ok) throw new Error(`Template not found at ${templatePath}`);
    const templateText = await res.text();
    codeEditor.value = templateText;
  } catch (err) {
    console.info("Defaulting starter template:", err.message);
    codeEditor.value = `// Write your ${currentLanguage} solution here\n`;
  }
}

function formatValue(val) {
  if (typeof val === "object" && val !== null) {
    return JSON.stringify(val);
  }
  return String(val);
}

// ===================================================================
// Application Startup
// ===================================================================

function init() {
  // 3. Populate problem options & setup initial language
  populateProblemDropdown();

  const urlParams = new URLSearchParams(window.location.search);
  const problemParam = urlParams.get("problem");
  if (problemParam && PROBLEMS.some((p) => p.id === problemParam)) {
    currentProblemId = problemParam;
  }
  problemSelect.value = currentProblemId;
  languageSelect.value = currentLanguage;

  // 4. Attach Event Listeners
  problemSelect.addEventListener("change", onProblemChange);
  languageSelect.addEventListener("change", onLanguageChange);

  // 5. Load the initial problem
  loadProblem(currentProblemId);
}

document.addEventListener("DOMContentLoaded", init);