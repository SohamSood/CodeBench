// ===================================================================
// CodeBench - Frontend Application Logic (Vanilla JavaScript)
// ===================================================================
import { runWithWasm } from "./wasmRunner.js";
// Base path helper: problem files load directly from problems/
const BASE_PATH = "";

// List of available problems on the platform
const PROBLEMS = [
  { id: "two-sum", title: "1. Two Sum", difficulty: "Easy" },
  { id: "binary-search", title: "2. Binary Search", difficulty: "Easy" },
  { id: "maximum-element", title: "3. Maximum Element", difficulty: "Easy" }
];

// Judge0 Language IDs and extensions mapping
const LANGUAGE_CONFIG = {
  js: { name: "JavaScript", ext: "js", id: 63 },
  python: { name: "Python", ext: "py", id: 71 },
  cpp: { name: "C++", ext: "cpp", id: 54 },
  java: { name: "Java", ext: "java", id: 62 }
};

// C++ execution: "judge0", "wasm", or "judge0-fallback-wasm".
// The fallback mode uses WASM only when the Judge0 request itself fails.
const CPP_EXECUTION_MODE = "judge0-fallback-wasm";

// Application State
let currentProblemId = "two-sum";
let currentLanguage = "js";
let testCases = []; // Array of test cases: [{ input: ..., expected: ... }]
let highlightWorker = null;
let currentHighlightId = 0;
let saveDebounceTimer = null; // Used for debouncing localStorage writes with setTimeout

// DOM Elements
const problemSelect = document.getElementById("problemSelect");
const languageSelect = document.getElementById("languageSelect");
const resetCodeBtn = document.getElementById("resetCodeBtn");
const timerControl = document.getElementById("timerControl");
const timerToggleBtn = document.getElementById("timerToggleBtn");
const timerDisplay = document.getElementById("timerDisplay");
const timerResetBtn = document.getElementById("timerResetBtn");

const problemTitle = document.getElementById("problemTitle");
const problemDifficulty = document.getElementById("problemDifficulty");
const problemDescription = document.getElementById("problemDescription");
const problemExamples = document.getElementById("problemExamples");
const problemConstraints = document.getElementById("problemConstraints");

const activeLangTag = document.getElementById("activeLangTag");
const lineNumbers = document.getElementById("lineNumbers");
const codePre = document.getElementById("codePre");
const codeHighlight = document.getElementById("codeHighlight");
const codeEditor = document.getElementById("codeEditor");
const runBtn = document.getElementById("runBtn");
const submitBtn = document.getElementById("submitBtn");
const analyzeCodeBtn = document.getElementById("analyzeCodeBtn");

const tabTestCasesBtn = document.getElementById("tabTestCasesBtn");
const tabOutputBtn = document.getElementById("tabOutputBtn");
const testCasesView = document.getElementById("testCasesView");
const outputView = document.getElementById("outputView");

const testCaseCount = document.getElementById("testCaseCount");
const testCasesContainer = document.getElementById("testCasesContainer");

const outputPlaceholder = document.getElementById("outputPlaceholder");
const outputDetails = document.getElementById("outputDetails");
const outputStatus = document.getElementById("outputStatus");
const outputMessage = document.getElementById("outputMessage");
const metricPassed = document.getElementById("metricPassed");
const metricTime = document.getElementById("metricTime");
const metricMemory = document.getElementById("metricMemory");
const errorBox = document.getElementById("errorBox");
const errorContent = document.getElementById("errorContent");
const resultsList = document.getElementById("resultsList");

/**
 * BaseRunner - Base class encapsulating common execution metadata.
 * Demonstrates: class declaration, constructor, and prototype methods.
 */
class BaseRunner {
  constructor(language, languageId) {
    this.language = language;
    this.languageId = languageId;
  }

  // Prototype method: formats the submission payload
  formatPayload(sourceCode, stdin = "") {
    return {
      language_id: this.languageId,
      source_code: sourceCode,
      stdin: stdin
    };
  }
}

function toBase64(str) {
  return btoa(unescape(encodeURIComponent(str || "")));
}

function fromBase64(str) {
  if (!str) return "";
  try {
    return decodeURIComponent(escape(atob(str)));
  } catch {
    return atob(str);
  }
}

class JudgeRunner extends BaseRunner {
  constructor(language, languageId) {
    super(language, languageId);
    this.apiUrl = "https://ce.judge0.com/submissions/?base64_encoded=true&wait=true";
  }

  formatPayload(sourceCode, stdin = "") {
    return {
      language_id: this.languageId,
      source_code: toBase64(sourceCode),
      stdin: toBase64(stdin)
    };
  }

  // Executes code via Judge0 public API
  async execute(sourceCode, stdin = "") {
    const payload = this.formatPayload(sourceCode, stdin);
    try {
      const response = await fetch(this.apiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });
      if (!response.ok) {
        throw new Error(`Judge0 HTTP ${response.status}: ${response.statusText}`);
      }
      const data = await response.json();
      if (data.stdout) data.stdout = fromBase64(data.stdout);
      if (data.stderr) data.stderr = fromBase64(data.stderr);
      if (data.compile_output) data.compile_output = fromBase64(data.compile_output);
      if (data.message) data.message = fromBase64(data.message);
      return data;
    } catch (error) {
      console.error("Error executing code:", error);
      throw error;
    }
  }
}

/**
 * Utility: Promise-based delay using setTimeout
 * Demonstrates: new Promise constructor & setTimeout for clean async waiting
 */
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Utility: Wraps Web Worker message exchange into a Promise
 * Demonstrates: Converting event-based Worker communication into a modern Promise
 */
function sendToWorker(worker, messageData) {
  return new Promise((resolve, reject) => {
    if (!worker) {
      reject(new Error("Worker not available"));
      return;
    }

    const handler = (e) => {
      if (e.data && e.data.id === messageData.id) {
        worker.removeEventListener("message", handler);
        resolve(e.data);
      }
    };

    worker.addEventListener("message", handler);
    worker.postMessage(messageData);
  });
}

async function fetchInspirationQuote() {
  try {
    const response = await fetch("https://dummyjson.com/quotes/random");
    if (!response.ok) return;

    const data = await response.json();
    if (data && data.quote) {
      // Display quote in placeholder as a motivational developer tip
      outputPlaceholder.innerHTML = `
        <div style="max-width: 500px; text-align: center;">
          <p style="margin-bottom: 12px; color: var(--text-primary); font-size: 0.95rem; font-style: italic;">
            "${data.quote}"
          </p>
          <p style="margin-bottom: 20px; color: var(--accent-blue); font-size: 0.85rem; font-weight: 500;">
            — ${data.author}
          </p>
          <div style="font-size: 0.85rem; color: var(--text-muted);">
            Click <strong>Run</strong> to test with visible test cases, or <strong>Submit</strong> to evaluate all test cases.
          </div>
        </div>
      `;
    }
  } catch (err) {
    console.info("Second API (Quotes) skipped or unavailable:", err.message);
  }
}


function registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker
      .register("./sw.js")
      .then((reg) => console.log("Service Worker registered successfully. Scope:", reg.scope))
      .catch((err) => console.info("Service Worker registration skipped (e.g. file:// protocol):", err.message));
  }
}

function initHighlightWorker() {
  try {
    const workerPath = "./highlighter.worker.js";
    highlightWorker = new Worker(workerPath);

    highlightWorker.onerror = function (err) {
      console.warn("Web Worker error, falling back to main-thread highlighting:", err);
      highlightWorker = null;
      triggerCodeHighlight();
    };
  } catch (e) {
    console.info("Web Worker restricted (e.g. file:// protocol). Using synchronous fallback.");
    highlightWorker = null;
  }
}

function escapeHtml(text) {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// Synchronous syntax highlighter fallback for file:// or when Web Worker is blocked
function highlightCodeSync(code, language) {
  if (!code) return "";

  let commentRegex, stringRegex, keywordRegex, typeRegex, builtInRegex;

  if (language === "python") {
    commentRegex = /#[^\n]*|"""[\s\S]*?"""|'''[\s\S]*?'''/;
    stringRegex = /"([^"\\\n]|\\.)*"|'([^'\\\n]|\\.)*'/;
    keywordRegex = /\b(def|class|return|if|elif|else|for|while|in|not|and|or|is|import|from|as|try|except|finally|raise|with|lambda|pass|continue|break|yield|global|nonlocal|assert|async|await)\b/;
    typeRegex = /\b(int|float|str|bool|list|dict|set|tuple|List|Dict|Set|Tuple|Optional|Any|Solution)\b/;
    builtInRegex = /\b(True|False|None|self|print|len|range|enumerate|zip|min|max|sum|sorted|map|filter)\b/;
  } else if (language === "js") {
    commentRegex = /\/\/[^\n]*|\/\*[\s\S]*?\*\//;
    stringRegex = /"([^"\\\n]|\\.)*"|'([^'\\\n]|\\.)*'|`([^`\\]|\\.)*`/;
    keywordRegex = /\b(function|const|let|var|return|if|else|for|while|do|switch|case|default|break|continue|try|catch|finally|throw|new|this|class|extends|super|import|export|from|async|await|typeof|instanceof|in|of|yield|void|delete)\b/;
    typeRegex = /\b(Array|Object|String|Number|Boolean|Function|Map|Set|Promise|Symbol|BigInt)\b/;
    builtInRegex = /\b(true|false|null|undefined|NaN|Infinity|console|log|Math|floor|ceil|round|max|min|abs|JSON|stringify|parse)\b/;
  } else {
    commentRegex = /\/\/[^\n]*|\/\*[\s\S]*?\*\//;
    stringRegex = /"([^"\\\n]|\\.)*"|'([^'\\\n]|\\.)*'/;
    keywordRegex = /\b(class|public|private|protected|virtual|override|namespace|using|template|typename|struct|const|auto|new|delete|this|super|return|if|else|for|while|do|switch|case|default|break|continue|try|catch|throw|throws|finally|static|final|abstract|interface|extends|implements|import)\b/;
    typeRegex = /\b(int|long|float|double|char|bool|boolean|void|string|String|vector|List|ArrayList|Map|HashMap|Set|Solution)\b/;
    builtInRegex = /\b(true|false|null|nullptr|std|cout|cin|endl|System|out|println)\b/;
  }

  const parts = [
    `(?<comment>${commentRegex.source})`,
    `(?<string>${stringRegex.source})`,
    `(?<keyword>${keywordRegex.source})`,
    `(?<type>${typeRegex.source})`,
    `(?<builtin>${builtInRegex.source})`,
    `(?<number>\\b\\d+(\\.\\d+)?\\b)`,
    `(?<func>\\b[a-zA-Z_]\\w*(?=\\s*\\())`,
    `(?<bracket_curly>[{}])`,
    `(?<bracket_paren>[()])`,
    `(?<bracket_square>[\\[\\]])`
  ];

  const masterRegex = new RegExp(parts.join("|"), "g");
  let result = "";
  let lastIndex = 0;
  let match;

  while ((match = masterRegex.exec(code)) !== null) {
    if (match.index > lastIndex) {
      result += escapeHtml(code.slice(lastIndex, match.index));
    }

    const groups = match.groups || {};
    const text = escapeHtml(match[0]);

    if (groups.comment) result += `<span class="token-comment">${text}</span>`;
    else if (groups.string) result += `<span class="token-string">${text}</span>`;
    else if (groups.keyword) result += `<span class="token-keyword">${text}</span>`;
    else if (groups.type) result += `<span class="token-type">${text}</span>`;
    else if (groups.builtin) result += `<span class="token-builtin">${text}</span>`;
    else if (groups.number) result += `<span class="token-number">${text}</span>`;
    else if (groups.func) result += `<span class="token-function">${text}</span>`;
    else if (groups.bracket_curly) result += `<span class="token-bracket-curly">${text}</span>`;
    else if (groups.bracket_paren) result += `<span class="token-bracket-paren">${text}</span>`;
    else if (groups.bracket_square) result += `<span class="token-bracket-square">${text}</span>`;
    else result += text;

    lastIndex = masterRegex.lastIndex;
  }

  if (lastIndex < code.length) {
    result += escapeHtml(code.slice(lastIndex));
  }
  if (code.endsWith("\n")) result += " ";

  return result;
}

// Request syntax highlighting via Web Worker (using Promise wrapper) or fallback
async function triggerCodeHighlight() {
  const code = codeEditor.value;
  currentHighlightId++;
  const highlightId = currentHighlightId;

  if (highlightWorker) {
    try {
      const data = await sendToWorker(highlightWorker, {
        code: code,
        language: currentLanguage,
        id: highlightId
      });
      if (data.id === currentHighlightId) {
        codeHighlight.innerHTML = data.html;
        updateLineNumbers();
      }
    } catch {
      codeHighlight.innerHTML = highlightCodeSync(code, currentLanguage);
      updateLineNumbers();
    }
  } else {
    codeHighlight.innerHTML = highlightCodeSync(code, currentLanguage);
    updateLineNumbers();
  }
}

function updateLineNumbers() {
  const lines = codeEditor.value.split("\n").length;
  let nums = "";
  for (let i = 1; i <= lines; i++) {
    nums += i + "\n";
  }
  lineNumbers.textContent = nums;
}

function syncEditorScroll() {
  codePre.scrollTop = codeEditor.scrollTop;
  codePre.scrollLeft = codeEditor.scrollLeft;
  lineNumbers.scrollTop = codeEditor.scrollTop;
}

/**
 * Editor Input Handler
 * Demonstrates Concept: setTimeout for debouncing localStorage auto-save
 */
function onCodeInput() {
  triggerCodeHighlight();

  // Debounce saving to localStorage by 300ms to avoid unnecessary writes on every keystroke
  clearTimeout(saveDebounceTimer);
  saveDebounceTimer = setTimeout(() => {
    saveCodeToLocalStorage();
  }, 300);
}

// ===================================================================
// Advanced Editor Behavior: Tab, Indentation & Auto-Closing Brackets
// ===================================================================
function handleEditorKeydown(e) {
  // Allow Ctrl/Cmd combinations to bypass editor formatting and trigger global shortcuts
  if (e.ctrlKey || e.metaKey) {
    return;
  }

  const start = this.selectionStart;
  const end = this.selectionEnd;
  const val = this.value;

  // 1. Tab & Shift+Tab Indentation
  if (e.key === "Tab") {
    e.preventDefault();

    if (!e.shiftKey) {
      if (start === end) {
        this.value = val.substring(0, start) + "    " + val.substring(end);
        this.selectionStart = this.selectionEnd = start + 4;
      } else {
        const lineStart = val.lastIndexOf("\n", start - 1) + 1;
        const lineEnd = val.indexOf("\n", end);
        const targetEnd = lineEnd === -1 ? val.length : lineEnd;
        const lines = val.substring(lineStart, targetEnd).split("\n");
        const indented = lines.map((l) => "    " + l).join("\n");
        this.value = val.substring(0, lineStart) + indented + val.substring(targetEnd);
        this.selectionStart = start + 4;
        this.selectionEnd = end + lines.length * 4;
      }
    } else {
      const lineStart = val.lastIndexOf("\n", start - 1) + 1;
      const lineEnd = val.indexOf("\n", end);
      const targetEnd = lineEnd === -1 ? val.length : lineEnd;
      const lines = val.substring(lineStart, targetEnd).split("\n");
      let removedTotal = 0;
      let firstLineRemoved = 0;

      const unindented = lines
        .map((l, idx) => {
          const match = l.match(/^( {1,4}|\t)/);
          if (match) {
            const removed = match[0].length;
            removedTotal += removed;
            if (idx === 0) firstLineRemoved = removed;
            return l.slice(removed);
          }
          return l;
        })
        .join("\n");

      this.value = val.substring(0, lineStart) + unindented + val.substring(targetEnd);
      this.selectionStart = Math.max(lineStart, start - firstLineRemoved);
      this.selectionEnd = Math.max(lineStart, end - removedTotal);
    }

    onCodeInput();
    return;
  }

  // 2. Auto-Indentation on Enter
  if (e.key === "Enter") {
    e.preventDefault();

    const lastNewline = val.lastIndexOf("\n", start - 1);
    const currentLine = val.substring(lastNewline + 1, start);
    const matchIndent = currentLine.match(/^[ \t]*/);
    let indent = matchIndent ? matchIndent[0] : "";
    const trimmedLine = currentLine.trim();

    // Check if cursor is directly between '{' and '}'
    if (val[start - 1] === "{" && val[end] === "}") {
      const extraIndent = indent + "    ";
      const insertText = "\n" + extraIndent + "\n" + indent;
      this.value = val.substring(0, start) + insertText + val.substring(end);
      this.selectionStart = this.selectionEnd = start + 1 + extraIndent.length;
      onCodeInput();
      return;
    }

    if (trimmedLine.endsWith("{") || trimmedLine.endsWith(":")) {
      indent += "    ";
    }

    const insertText = "\n" + indent;
    this.value = val.substring(0, start) + insertText + val.substring(end);
    this.selectionStart = this.selectionEnd = start + insertText.length;
    onCodeInput();
    return;
  }

  // 3. Auto-Closing Brackets & Quotes
  const openPairs = { "(": ")", "[": "]", "{": "}", '"': '"', "'": "'" };
  const closePairs = [")", "]", "}", '"', "'"];

  if (closePairs.includes(e.key) && start === end && val[start] === e.key) {
    e.preventDefault();
    this.selectionStart = this.selectionEnd = start + 1;
    return;
  }

  if (openPairs[e.key] && start === end) {
    const openChar = e.key;
    const closeChar = openPairs[openChar];
    e.preventDefault();
    this.value = val.substring(0, start) + openChar + closeChar + val.substring(start);
    this.selectionStart = this.selectionEnd = start + 1;
    onCodeInput();
    return;
  }

  // 4. Backspace Pair Deletion
  if (e.key === "Backspace" && start === end) {
    const before = val[start - 1];
    const after = val[start];
    if (
      (before === "(" && after === ")") ||
      (before === "[" && after === "]") ||
      (before === "{" && after === "}") ||
      (before === '"' && after === '"') ||
      (before === "'" && after === "'")
    ) {
      e.preventDefault();
      this.value = val.substring(0, start - 1) + val.substring(start + 1);
      this.selectionStart = this.selectionEnd = start - 1;
      onCodeInput();
      return;
    }
  }
}

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

    // 2. Fetch test cases from tests.json
    const testsPath = `${BASE_PATH}problems/${problemId}/tests.json`;
    const testRes = await fetch(testsPath);
    if (testRes.ok) {
      const testsData = await testRes.json();
      testCases = testsData.visible || [];
    } else {
      testCases = [];
    }
    renderTestCases();

    // 3. Load code template or restored code
    await loadCodeTemplate();
    resetJudgeOutput();
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
  const storageKey = `code-${currentProblemId}-${currentLanguage}`;
  const savedCode = localStorage.getItem(storageKey);

  // Restore user's previous code from localStorage if available
  if (savedCode !== null && savedCode.trim() !== "") {
    codeEditor.value = savedCode;
    triggerCodeHighlight();
    return;
  }

  // Otherwise fetch default template file
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

  triggerCodeHighlight();
}

function saveCodeToLocalStorage() {
  const storageKey = `code-${currentProblemId}-${currentLanguage}`;
  localStorage.setItem(storageKey, codeEditor.value);
}

async function onResetCode() {
  const confirmReset = confirm("Reset code to starter template? Your unsaved edits will be discarded.");
  if (confirmReset) {
    const storageKey = `code-${currentProblemId}-${currentLanguage}`;
    localStorage.removeItem(storageKey);
    await loadCodeTemplate();
  }
}

// ===================================================================
// Test Cases Management (Up to 20 test cases)
// ===================================================================

function renderTestCases() {
  testCasesContainer.innerHTML = "";
  testCaseCount.textContent = testCases.length;

  testCases.forEach((tc, index) => {
    const card = document.createElement("div");
    card.className = "testcase-card";

    const header = document.createElement("div");
    header.className = "testcase-header-row";
    header.innerHTML = `<span>Case ${index + 1}</span>`;

    const fields = document.createElement("div");
    fields.className = "testcase-fields";

    // Input Box
    const inputGroup = document.createElement("div");
    inputGroup.className = "field-group";
    inputGroup.innerHTML = `<label class="field-label">Input (JSON/Text):</label>`;
    const inputField = document.createElement("input");
    inputField.type = "text";
    inputField.className = "field-input";
    inputField.value = formatValue(tc.input);
    inputField.addEventListener("input", (e) => {
      testCases[index].input = parseValue(e.target.value);
    });
    inputGroup.appendChild(inputField);

    // Expected Output Box
    const expectedGroup = document.createElement("div");
    expectedGroup.className = "field-group";
    expectedGroup.innerHTML = `<label class="field-label">Expected Output:</label>`;
    const expectedField = document.createElement("input");
    expectedField.type = "text";
    expectedField.className = "field-input";
    expectedField.value = formatValue(tc.expected);
    expectedField.addEventListener("input", (e) => {
      testCases[index].expected = parseValue(e.target.value);
    });
    expectedGroup.appendChild(expectedField);

    fields.appendChild(inputGroup);
    fields.appendChild(expectedGroup);

    card.appendChild(header);
    card.appendChild(fields);
    testCasesContainer.appendChild(card);
  });
}

function addTestCase() {
  if (testCases.length >= 20) {
    alert("Maximum limit of 20 test cases reached.");
    return;
  }
  testCases.push({ input: "", expected: "" });
  renderTestCases();
}

function formatValue(val) {
  if (typeof val === "object" && val !== null) {
    return JSON.stringify(val);
  }
  return String(val);
}

function parseValue(str) {
  try {
    return JSON.parse(str);
  } catch {
    return str;
  }
}

// ===================================================================
// Tab Switching
// ===================================================================
function switchTab(tabName) {
  if (tabName === "testcases") {
    tabTestCasesBtn.classList.add("active");
    tabOutputBtn.classList.remove("active");
    testCasesView.classList.add("active");
    outputView.classList.remove("active");
  } else {
    tabOutputBtn.classList.add("active");
    tabTestCasesBtn.classList.remove("active");
    outputView.classList.add("active");
    testCasesView.classList.remove("active");
  }
}

// ===================================================================
// Test Harness Generator for Judge0
// Wraps user's solution with test cases to evaluate directly on Judge0
// ===================================================================

function buildJsTestHarness(userCode, testCasesList, problemId) {
  return `
${userCode}

// --- Injected Evaluation Harness ---
const _tests = ${JSON.stringify(testCasesList)};
const _results = [];

for (let i = 0; i < _tests.length; i++) {
  const tc = _tests[i];
  try {
    let actual;
    if ('${problemId}' === 'two-sum') {
      actual = typeof twoSum === 'function' ? twoSum(tc.input.nums, tc.input.target) : null;
    } else if ('${problemId}' === 'binary-search') {
      actual = typeof search === 'function' ? search(tc.input.nums, tc.input.target) : null;
    } else if ('${problemId}' === 'maximum-element') {
      actual = typeof findMax === 'function' ? findMax(tc.input.nums || tc.input) : null;
    } else {
      actual = typeof twoSum === 'function' ? twoSum(tc.input) : null;
    }

    const expStr = JSON.stringify(tc.expected);
    const actStr = JSON.stringify(actual);

    // Order-insensitive comparison for Two Sum indices
    let passed = expStr === actStr;
    if (!passed && '${problemId}' === 'two-sum' && Array.isArray(actual) && Array.isArray(tc.expected)) {
      passed = JSON.stringify(actual.slice().sort()) === JSON.stringify(tc.expected.slice().sort());
    }

    _results.push({
      testCase: i + 1,
      status: passed ? 'Passed' : 'Wrong Answer',
      expected: tc.expected,
      actual: actual
    });
  } catch (err) {
    _results.push({
      testCase: i + 1,
      status: 'Runtime Error',
      expected: tc.expected,
      actual: err.message
    });
  }
}

console.log("---TEST_BREAKDOWN_START---");
console.log(JSON.stringify(_results));
console.log("---TEST_BREAKDOWN_END---");
`;
}

function buildPythonTestHarness(userCode, testCasesList, problemId) {
  return `
${userCode}

import json

_tests = ${JSON.stringify(testCasesList)}
_results = []
_sol = Solution()

for _i, _tc in enumerate(_tests):
    try:
        _inp = _tc["input"]
        if "${problemId}" == "two-sum":
            _actual = _sol.twoSum(_inp["nums"], _inp["target"])
        elif "${problemId}" == "binary-search":
            _actual = _sol.search(_inp["nums"], _inp["target"])
        elif "${problemId}" == "maximum-element":
            _nums = _inp.get("nums", _inp) if isinstance(_inp, dict) else _inp
            _actual = _sol.findMax(_nums)
        else:
            _actual = None

        _exp = _tc["expected"]
        _passed = _actual == _exp
        if not _passed and "${problemId}" == "two-sum" and isinstance(_actual, list) and isinstance(_exp, list):
            _passed = sorted(_actual) == sorted(_exp)

        _results.append({
            "testCase": _i + 1,
            "status": "Passed" if _passed else "Wrong Answer",
            "expected": _exp,
            "actual": _actual
        })
    except Exception as _e:
        _results.append({
            "testCase": _i + 1,
            "status": "Runtime Error",
            "expected": _tc.get("expected"),
            "actual": str(_e)
        })

print("---TEST_BREAKDOWN_START---")
print(json.dumps(_results))
print("---TEST_BREAKDOWN_END---")
`;
}

function buildCppTestHarness(userCode, testCasesList, problemId) {
  let testsLogic = "";
  testCasesList.forEach((tc, i) => {
    const caseNum = i + 1;
    if (problemId === "two-sum") {
      const numsStr = Array.isArray(tc.input.nums) ? tc.input.nums.join(",") : "";
      const target = tc.input.target;
      testsLogic += `
      {
        std::vector<int> nums = {${numsStr}};
        std::vector<int> actual = sol.twoSum(nums, ${target});
        bool passed = false;
        if (actual.size() == 2) {
          int e0 = ${tc.expected[0]}, e1 = ${tc.expected[1]};
          passed = (actual[0] == e0 && actual[1] == e1) || (actual[0] == e1 && actual[1] == e0);
        }
        std::string actStr = "[";
        for (size_t k = 0; k < actual.size(); ++k) actStr += (k > 0 ? "," : "") + std::to_string(actual[k]);
        actStr += "]";
        if (${i} > 0) std::cout << ",";
        std::cout << "{\\"testCase\\": ${caseNum}, \\"status\\": \\"" << (passed ? "Passed" : "Wrong Answer") 
                  << "\\", \\"expected\\": [${tc.expected.join(",")}], \\"actual\\": " << actStr << "}";
      }
      `;
    } else if (problemId === "binary-search") {
      const numsStr = Array.isArray(tc.input.nums) ? tc.input.nums.join(",") : "";
      const target = tc.input.target;
      testsLogic += `
      {
        std::vector<int> nums = {${numsStr}};
        int actual = sol.search(nums, ${target});
        bool passed = (actual == ${tc.expected});
        if (${i} > 0) std::cout << ",";
        std::cout << "{\\"testCase\\": ${caseNum}, \\"status\\": \\"" << (passed ? "Passed" : "Wrong Answer") 
                  << "\\", \\"expected\\": ${tc.expected}, \\"actual\\": " << actual << "}";
      }
      `;
    } else if (problemId === "maximum-element") {
      const rawNums = Array.isArray(tc.input) ? tc.input : (tc.input.nums || []);
      const numsStr = rawNums.join(",");
      testsLogic += `
      {
        std::vector<int> nums = {${numsStr}};
        int actual = sol.findMax(nums);
        bool passed = (actual == ${tc.expected});
        if (${i} > 0) std::cout << ",";
        std::cout << "{\\"testCase\\": ${caseNum}, \\"status\\": \\"" << (passed ? "Passed" : "Wrong Answer") 
                  << "\\", \\"expected\\": ${tc.expected}, \\"actual\\": " << actual << "}";
      }
      `;
    }
  });

  return `
${userCode}

#include <iostream>
#include <vector>
#include <string>

int main() {
    Solution sol;
    std::cout << "---TEST_BREAKDOWN_START---\\n[";
    ${testsLogic}
    std::cout << "]\\n---TEST_BREAKDOWN_END---\\n";
    return 0;
}
`;
}

function buildJavaTestHarness(userCode, testCasesList, problemId) {
  let testsLogic = "";
  testCasesList.forEach((tc, i) => {
    const caseNum = i + 1;
    if (problemId === "two-sum") {
      const numsStr = Array.isArray(tc.input.nums) ? tc.input.nums.join(",") : "";
      const target = tc.input.target;
      testsLogic += `
      {
        int[] actual = sol.twoSum(new int[]{${numsStr}}, ${target});
        boolean passed = false;
        if (actual != null && actual.length == 2) {
          int e0 = ${tc.expected[0]}, e1 = ${tc.expected[1]};
          passed = (actual[0] == e0 && actual[1] == e1) || (actual[0] == e1 && actual[1] == e0);
        }
        if (${i} > 0) System.out.print(",");
        System.out.print("{\\"testCase\\": ${caseNum}, \\"status\\": \\"" + (passed ? "Passed" : "Wrong Answer") + 
                         "\\", \\"expected\\": [${tc.expected.join(",")}], \\"actual\\": " + java.util.Arrays.toString(actual) + "}");
      }
      `;
    } else if (problemId === "binary-search") {
      const numsStr = Array.isArray(tc.input.nums) ? tc.input.nums.join(",") : "";
      const target = tc.input.target;
      testsLogic += `
      {
        int actual = sol.search(new int[]{${numsStr}}, ${target});
        boolean passed = (actual == ${tc.expected});
        if (${i} > 0) System.out.print(",");
        System.out.print("{\\"testCase\\": ${caseNum}, \\"status\\": \\"" + (passed ? "Passed" : "Wrong Answer") + 
                         "\\", \\"expected\\": ${tc.expected}, \\"actual\\": " + actual + "}");
      }
      `;
    } else if (problemId === "maximum-element") {
      const rawNums = Array.isArray(tc.input) ? tc.input : (tc.input.nums || []);
      const numsStr = rawNums.join(",");
      testsLogic += `
      {
        int actual = sol.findMax(new int[]{${numsStr}});
        boolean passed = (actual == ${tc.expected});
        if (${i} > 0) System.out.print(",");
        System.out.print("{\\"testCase\\": ${caseNum}, \\"status\\": \\"" + (passed ? "Passed" : "Wrong Answer") + 
                         "\\", \\"expected\\": ${tc.expected}, \\"actual\\": " + actual + "}");
      }
      `;
    }
  });

  return `
${userCode}

public class Main {
    public static void main(String[] args) {
        Solution sol = new Solution();
        System.out.println("---TEST_BREAKDOWN_START---");
        System.out.print("[");
        ${testsLogic}
        System.out.println("]");
        System.out.println("---TEST_BREAKDOWN_END---");
    }
}
`;
}

// ===================================================================
// Code Execution via WebAssembly or Judge0 (Run & Submit)
// Demonstrates: async/await, try/catch, and language-specific runners
// ===================================================================

async function runCode() {
  await executeWithJudge("run");
}

async function submitCode() {
  await executeWithJudge("submit");
}

async function executeWithJudge(mode) {
  const code = codeEditor.value.trim();
  if (!code) {
    switchTab("output");
    showErrorMessage("Code is empty! Please write some code before running.");
    return;
  }

  switchTab("output");
  const executionService = currentLanguage !== "cpp" || CPP_EXECUTION_MODE === "judge0"
    ? "Judge0"
    : CPP_EXECUTION_MODE === "wasm"
      ? "local WebAssembly"
      : "Judge0 with local WebAssembly fallback";
  setLoadingState(
    true,
    mode === "run"
      ? `Running visible test cases via ${executionService}...`
      : `Evaluating submission via ${executionService}...`
  );

  // Concept: small status transition using setTimeout / Promise delay
  await delay(50);

  try {
    // 1. Determine test cases
    let casesToRun = testCases;
    if (mode === "submit") {
      try {
        const testsRes = await fetch(`${BASE_PATH}problems/${currentProblemId}/tests.json`);
        if (testsRes.ok) {
          const allTests = await testsRes.json();
          casesToRun = [...(allTests.visible || []), ...(allTests.hidden || [])];
        }
      } catch {
        casesToRun = testCases;
      }
    }

    if (casesToRun.length === 0) {
      showErrorMessage("No test cases available to evaluate.");
      return;
    }

    // 2. Prepare runner metadata
    const langInfo = LANGUAGE_CONFIG[currentLanguage] || LANGUAGE_CONFIG.js;

    // 3. Prepare source code with test harness for active language
    let codeToSend = code;
    if (currentLanguage === "js") {
      codeToSend = buildJsTestHarness(code, casesToRun, currentProblemId);
    } else if (currentLanguage === "python") {
      codeToSend = buildPythonTestHarness(code, casesToRun, currentProblemId);
    } else if (currentLanguage === "cpp") {
      codeToSend = buildCppTestHarness(code, casesToRun, currentProblemId);
    } else if (currentLanguage === "java") {
      codeToSend = buildJavaTestHarness(code, casesToRun, currentProblemId);
    }

    // 4. Use the configured C++ runner; other languages always use Judge0.
    let result;
    let executionPlatform = "Judge0";
    if (currentLanguage === "cpp" && CPP_EXECUTION_MODE === "wasm") {
      result = await runWithWasm(codeToSend, "");
      executionPlatform = "WebAssembly";
    } else {
      try {
        result = await new JudgeRunner(currentLanguage, langInfo.id).execute(codeToSend, "");
      } catch (error) {
        if (currentLanguage !== "cpp" || CPP_EXECUTION_MODE !== "judge0-fallback-wasm") {
          throw error;
        }

        console.warn("Judge0 request failed; retrying C++ execution locally with WebAssembly.", error);
        result = await runWithWasm(codeToSend, "");
        executionPlatform = "WebAssembly";
      }
    }
    console.log(`${executionPlatform} Response:`, result);

    // 5. Handle and display output
    handleJudgeResponse(result, casesToRun, executionPlatform);
  } catch (error) {
    console.error("Execution error:", error);
    const service = currentLanguage === "cpp" && CPP_EXECUTION_MODE === "wasm"
      ? "WebAssembly runner"
      : "Judge0 or its configured WebAssembly fallback";
    showErrorMessage(`${service} Error: ${error.message}\n\nPlease check your internet connection.`);
  } finally {
    setLoadingState(false);
  }
}

// Parses and maps Judge0 response into the UI
function handleJudgeResponse(result, casesToRun, executionPlatform = "Judge0") {
  if (!result) {
    showErrorMessage("No response received from Judge0.");
    return;
  }

  // Check for Compilation or Runtime Errors
  if (result.compile_output) {
    showErrorMessage(`Compilation Error:\n\n${result.compile_output}`);
    return;
  }

  if (result.stderr && !result.stdout) {
    showErrorMessage(`Runtime Error:\n\n${result.stderr}`);
    return;
  }

  const stdout = result.stdout || "";
  const executionTime = result.time ? Math.round(parseFloat(result.time) * 1000) : 0;
  const memoryMB = result.memory ? (parseInt(result.memory, 10) / 1024).toFixed(1) : "-";
  // Check if structured test breakdown was returned
  if (stdout.includes("---TEST_BREAKDOWN_START---") && stdout.includes("---TEST_BREAKDOWN_END---")) {
    const rawJson = stdout.split("---TEST_BREAKDOWN_START---")[1].split("---TEST_BREAKDOWN_END---")[0].trim();
    try {
      const breakdown = JSON.parse(rawJson);
      const passedCount = breakdown.filter((b) => b.status === "Passed").length;
      const isAccepted = passedCount === breakdown.length;

      displayResult({
        status: isAccepted ? "Accepted" : "Wrong Answer",
        message: isAccepted
          ? `All test cases passed on ${executionPlatform}!`
          : `${breakdown.length - passedCount} test case(s) failed.`,
        passed: passedCount,
        total: breakdown.length,
        executionTime: executionTime,
        memory: memoryMB,
        error: result.stderr || "",
        results: breakdown
      });
      return;
    } catch (e) {
      console.warn("Could not parse test breakdown JSON:", e);
    }
  }

  // Fallback for general script execution or non-JS languages
  const isAccepted = result.status?.id === 3; // 3 = Accepted
  displayResult({
    status: result.status?.description || (isAccepted ? "Accepted" : "Finished"),
    message: result.message || "Executed on Judge0",
    passed: isAccepted ? casesToRun.length : 0,
    total: casesToRun.length,
    executionTime: executionTime,
    memory: memoryMB,
    error: result.stderr || "",
    results: casesToRun.map((tc, idx) => ({
      testCase: idx + 1,
      status: isAccepted ? "Passed" : "Checked",
      expected: formatValue(tc.expected),
      actual: stdout.trim() || "(No stdout)"
    }))
  });
}

// ===================================================================
// Judge Result Display & Error UI
// ===================================================================

function setLoadingState(isLoading, message = "") {
  runBtn.disabled = isLoading;
  submitBtn.disabled = isLoading;

  if (isLoading) {
    outputPlaceholder.style.display = "flex";
    outputPlaceholder.innerHTML = `<span style="color: var(--accent-blue); font-weight: 500;">&#9696; ${message}</span>`;
    outputDetails.style.display = "none";
  }
}

function resetJudgeOutput() {
  outputPlaceholder.style.display = "flex";
  outputDetails.style.display = "none";
  fetchInspirationQuote();
}

function showErrorMessage(message) {
  outputPlaceholder.style.display = "none";
  outputDetails.style.display = "flex";

  outputStatus.textContent = "Error";
  outputStatus.className = "status-badge status-wrong";
  outputMessage.textContent = "Execution Notice";

  metricPassed.textContent = "-";
  metricTime.textContent = "-";
  metricMemory.textContent = "-";

  errorBox.style.display = "block";
  errorContent.textContent = message;

  resultsList.innerHTML = "";
}

function displayResult(result) {
  outputPlaceholder.style.display = "none";
  outputDetails.style.display = "flex";

  const status = result.status || "Unknown";
  outputStatus.textContent = status;
  outputStatus.className = "status-badge";

  if (status === "Accepted") {
    outputStatus.classList.add("status-accepted");
  } else if (status === "Wrong Answer") {
    outputStatus.classList.add("status-wrong");
  } else {
    outputStatus.classList.add("status-error");
  }

  outputMessage.textContent = result.message || "";

  // Metrics
  const passed = result.passed !== undefined ? result.passed : 0;
  const total = result.total !== undefined ? result.total : 0;
  metricPassed.textContent = `${passed} / ${total}`;
  metricTime.textContent = result.executionTime ? `${result.executionTime} ms` : "-";
  metricMemory.textContent = result.memory ? `${result.memory} MB` : "-";

  // Error Log
  if (result.error || status.includes("Error")) {
    errorBox.style.display = "block";
    errorContent.textContent = result.error || "An error occurred during execution.";
  } else {
    errorBox.style.display = "none";
  }

  // Test Case Breakdown Cards
  resultsList.innerHTML = "";
  if (result.results && Array.isArray(result.results) && result.results.length > 0) {
    result.results.forEach((item, idx) => {
      const caseNumber = item.testCase || idx + 1;
      const itemStatus = item.status || "Pending";
      const isPassed = itemStatus === "Passed" || itemStatus === "Accepted";

      const card = document.createElement("div");
      card.className = "result-item";

      let html = `
        <div class="result-item-header">
          <span class="result-item-title">Test Case ${caseNumber}</span>
          <span class="result-item-tag ${isPassed ? "tag-pass" : "tag-fail"}">${itemStatus}</span>
        </div>
      `;

      if (item.expected !== undefined || item.actual !== undefined) {
        html += `
          <div class="result-item-comparison">
            <div class="comp-box">
              <span class="comp-label">Expected:</span>
              <span class="comp-val">${formatValue(item.expected)}</span>
            </div>
            <div class="comp-box">
              <span class="comp-label">Actual:</span>
              <span class="comp-val">${formatValue(item.actual)}</span>
            </div>
          </div>
        `;
      }

      card.innerHTML = html;
      resultsList.appendChild(card);
    });
  } else {
    resultsList.innerHTML = `<div style="color: var(--text-muted); font-size: 0.85rem;">No individual test case results provided.</div>`;
  }
}

// ===================================================================
// AI Analysis Module (Client-Side Modular Integration)
// ===================================================================

const AI_KEY_STORAGE = "codebench_ai_key";
const AI_PROVIDER_STORAGE = "codebench_ai_provider";
const AI_CONFIGURED_FLAG = "aiApiKeyConfigured";

function generateMockAnalysis() {
  const prob = problemTitle?.textContent || "Problem Solution";
  const lang = LANGUAGE_CONFIG[currentLanguage]?.name || currentLanguage;
  return `### 1. Time & Space Complexity
- **Time Complexity:** O(N) — Linear scan over the primary collection.
- **Space Complexity:** O(N) — Auxiliary memory for state storage and lookups.

### 2. Correctness & Edge Cases
- **Standard Cases:** The current solution handles standard scenarios for **${prob}**.
- **Edge Cases to Watch:**
  - Empty or single-element inputs.
  - Large boundary input sizes and negative numbers.
  - Duplicates in input arrays.

### 3. Optimization Opportunities
- Use hash maps for O(1) lookups instead of nested iterations.
- Minimize redundant allocations inside loops.
- Add early boundary guard checks.

### 4. Code Explanation
- The ${lang} implementation solves the problem by iterating elements and tracking required state to guarantee correct results.`;
}

async function callAiWithKey(apiKey, prompt) {
  const cleanKey = (apiKey || "").trim().replace(/^["']|["']$/g, "");
  if (!cleanKey) {
    throw new Error("API key is missing or empty. Please enter your OpenRouter API key.");
  }

  // 1. Mock / Demo key support for instant testing
  if (cleanKey.toLowerCase().startsWith("demo") || cleanKey.toLowerCase().startsWith("test")) {
    return generateMockAnalysis();
  }

  // 2. OpenRouter API
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${cleanKey}`,
      "HTTP-Referer": window.location.origin || "http://localhost:8080",
      "X-Title": "CodeBench"
    },
    body: JSON.stringify({
      model: "deepseek/deepseek-chat",
      models: [
        "deepseek/deepseek-chat",
        "meta-llama/llama-3.3-70b-instruct:free"
      ],
      messages: [
        {
          role: "system",
          content: "You are an expert algorithmic technical reviewer. Provide a strictly concise, structured review with clear bullet points. Avoid conversational filler, introductory greetings, or boilerplate. Keep explanations compact and high-signal."
        },
        { role: "user", content: prompt }
      ]
    })
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error?.message || `OpenRouter request failed (${res.status})`);
  }

  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new Error("No response received from OpenRouter.");
  return text;
}

function renderMarkdown(md) {
  if (!md) return "";
  let html = escapeHtml(md);

  // Fenced code blocks
  html = html.replace(/```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g, (match, lang, code) => {
    return `<pre><code>${code.trim()}</code></pre>`;
  });

  // Inline code
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");

  // Headings
  html = html.replace(/^### (.*$)/gim, "<h4>$1</h4>");
  html = html.replace(/^## (.*$)/gim, "<h3>$1</h3>");
  html = html.replace(/^# (.*$)/gim, "<h3>$1</h3>");

  // Bold & Italic
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*([^*]+)\*/g, "<em>$1</em>");

  // Bullet items
  html = html.replace(/^\s*[-*]\s+(.*$)/gim, "<li>$1</li>");
  html = html.replace(/(<li>[\s\S]*?<\/li>)/g, "<ul>$1</ul>");
  html = html.replace(/<\/ul>\s*<ul>/g, "");

  // Paragraphs
  const paragraphs = html.split(/\n{2,}/);
  return paragraphs
    .map((p) => {
      const trimmed = p.trim();
      if (!trimmed) return "";
      if (trimmed.startsWith("<h") || trimmed.startsWith("<pre") || trimmed.startsWith("<ul")) {
        return trimmed;
      }
      return `<p>${trimmed.replace(/\n/g, "<br>")}</p>`;
    })
    .filter(Boolean)
    .join("\n");
}

function setAiStep(stepName) {
  const steps = {
    intro: document.getElementById("aiStepIntro"),
    keyConfig: document.getElementById("aiStepKeyConfig"),
    results: document.getElementById("aiStepResults")
  };
  Object.keys(steps).forEach((k) => {
    if (steps[k]) steps[k].style.display = k === stepName ? "flex" : "none";
  });
}

let isAiAnalyzing = false;

async function runAiAnalysis(options = {}) {
  const fromInsideModal = options.fromInsideModal || false;
  if (isAiAnalyzing) return;

  const rawKey = localStorage.getItem(AI_KEY_STORAGE);
  const cleanKey = (rawKey || "").trim().replace(/^["']|["']$/g, "");
  const aiModal = document.getElementById("aiModal");
  const aiTargetProblem = document.getElementById("aiTargetProblem");
  const aiLoading = document.getElementById("aiLoading");
  const aiResultsError = document.getElementById("aiResultsError");
  const aiAnalysisOutput = document.getElementById("aiAnalysisOutput");
  const aiReanalyzeBtn = document.getElementById("aiReanalyzeBtn");

  if (!cleanKey) {
    setAiStep("keyConfig");
    if (aiModal) aiModal.style.display = "flex";
    return;
  }

  isAiAnalyzing = true;
  let originalBtnHtml = "";
  if (analyzeCodeBtn) {
    originalBtnHtml = analyzeCodeBtn.innerHTML;
    analyzeCodeBtn.disabled = true;
    analyzeCodeBtn.innerHTML = `<span class="ai-btn-spinner"></span> Analyzing...`;
  }

  if (fromInsideModal) {
    if (aiLoading) aiLoading.style.display = "flex";
    if (aiAnalysisOutput) aiAnalysisOutput.style.display = "none";
    if (aiResultsError) aiResultsError.style.display = "none";
    if (aiReanalyzeBtn) aiReanalyzeBtn.disabled = true;
  }

  if (aiTargetProblem) {
    aiTargetProblem.textContent = `Analyzing: ${problemTitle?.textContent || "Current Solution"}`;
  }

  const code = codeEditor.value.trim();
  const problem = problemTitle.textContent || "Coding Problem";
  const desc = problemDescription.textContent || "";
  const langName = LANGUAGE_CONFIG[currentLanguage]?.name || currentLanguage;

  const prompt = `Analyze this ${langName} solution for the problem "${problem}".

Problem Context:
${desc.slice(0, 450)}

Solution Code:
\`\`\`${currentLanguage}
${code}
\`\`\`

Provide a strictly concise, structured technical review formatted in markdown with bullet points:
### ⏱️ Time & Space Complexity
- **Time Complexity:** O(...) — (one-sentence rationale)
- **Space Complexity:** O(...) — (one-sentence rationale)

### ⚠️ Bugs & Edge Cases
- (1-2 bullet points: potential edge cases like empty input, overflows, or state bugs; if none, state "Clean")

### 💡 Key Optimization
- (1-2 bullet points on the most impactful optimization or alternative approach)

### 📝 Summary
- (1-2 sentences summarizing the core idea)`;

  try {
    const resultText = await callAiWithKey(cleanKey, prompt);

    if (aiAnalysisOutput) {
      aiAnalysisOutput.innerHTML = renderMarkdown(resultText);
      aiAnalysisOutput.style.display = "block";
    }
    if (aiResultsError) aiResultsError.style.display = "none";
    if (aiLoading) aiLoading.style.display = "none";

    // Display the box only when the answer is ready
    setAiStep("results");
    if (aiModal) aiModal.style.display = "flex";
  } catch (err) {
    if (aiResultsError) {
      aiResultsError.textContent = `Analysis failed: ${err.message || "An unexpected error occurred."}`;
      aiResultsError.style.display = "block";
    }
    if (aiAnalysisOutput) aiAnalysisOutput.style.display = "none";
    if (aiLoading) aiLoading.style.display = "none";

    if (err.message && (err.message.includes("Authentication") || err.message.includes("401") || err.message.includes("API key"))) {
      setAiStep("keyConfig");
    } else {
      setAiStep("results");
    }
    if (aiModal) aiModal.style.display = "flex";
  } finally {
    isAiAnalyzing = false;
    if (analyzeCodeBtn) {
      analyzeCodeBtn.disabled = false;
      analyzeCodeBtn.innerHTML = originalBtnHtml || "AI Analysis";
    }
    if (aiReanalyzeBtn) {
      aiReanalyzeBtn.disabled = false;
    }
  }
}

function handleAiButtonClick() {
  const rawKey = localStorage.getItem(AI_KEY_STORAGE);
  const cleanKey = (rawKey || "").trim().replace(/^["']|["']$/g, "");

  if (!cleanKey) {
    // If no key configured yet, show intro modal
    setAiStep("intro");
    const aiModal = document.getElementById("aiModal");
    if (aiModal) aiModal.style.display = "flex";
  } else {
    // Key configured: run non-blockingly in background, user can keep typing!
    runAiAnalysis({ fromInsideModal: false });
  }
}

function closeAiModal() {
  const aiModal = document.getElementById("aiModal");
  if (aiModal) aiModal.style.display = "none";
}

function initAiAnalysis() {
  const aiModal = document.getElementById("aiModal");
  const aiModalCloseBtn = document.getElementById("aiModalCloseBtn");
  const aiIntroCloseBtn = document.getElementById("aiIntroCloseBtn");
  const aiIntroGetStartedBtn = document.getElementById("aiIntroGetStartedBtn");
  const aiApiKeyInput = document.getElementById("aiApiKeyInput");
  const aiToggleKeyVisibilityBtn = document.getElementById("aiToggleKeyVisibilityBtn");
  const aiKeyError = document.getElementById("aiKeyError");
  const aiKeyBackBtn = document.getElementById("aiKeyBackBtn");
  const aiKeyContinueBtn = document.getElementById("aiKeyContinueBtn");
  const aiChangeKeyBtn = document.getElementById("aiChangeKeyBtn");
  const aiRemoveKeyBtn = document.getElementById("aiRemoveKeyBtn");
  const aiReanalyzeBtn = document.getElementById("aiReanalyzeBtn");
  const aiCloseResultsBtn = document.getElementById("aiCloseResultsBtn");

  if (analyzeCodeBtn) {
    analyzeCodeBtn.addEventListener("click", handleAiButtonClick);
  }

  if (aiModalCloseBtn) aiModalCloseBtn.addEventListener("click", closeAiModal);
  if (aiIntroCloseBtn) aiIntroCloseBtn.addEventListener("click", closeAiModal);
  if (aiCloseResultsBtn) aiCloseResultsBtn.addEventListener("click", closeAiModal);

  if (aiModal) {
    aiModal.addEventListener("click", (e) => {
      if (e.target === aiModal) closeAiModal();
    });
  }

  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && aiModal && aiModal.style.display === "flex") {
      closeAiModal();
    }
  });

  if (aiIntroGetStartedBtn) {
    aiIntroGetStartedBtn.addEventListener("click", () => {
      if (aiApiKeyInput) aiApiKeyInput.value = (localStorage.getItem(AI_KEY_STORAGE) || "").trim();
      if (aiKeyError) aiKeyError.style.display = "none";
      setAiStep("keyConfig");
      if (aiApiKeyInput) aiApiKeyInput.focus();
    });
  }

  if (aiKeyBackBtn) {
    aiKeyBackBtn.addEventListener("click", () => {
      setAiStep("intro");
    });
  }

  if (aiToggleKeyVisibilityBtn && aiApiKeyInput) {
    aiToggleKeyVisibilityBtn.addEventListener("click", () => {
      aiApiKeyInput.type = aiApiKeyInput.type === "password" ? "text" : "password";
    });
  }

  if (aiKeyContinueBtn) {
    aiKeyContinueBtn.addEventListener("click", () => {
      const raw = aiApiKeyInput ? aiApiKeyInput.value : "";
      const key = (raw || "").trim().replace(/^["']|["']$/g, "");
      if (!key) {
        if (aiKeyError) {
          aiKeyError.textContent = "Please enter your OpenRouter API key to continue.";
          aiKeyError.style.display = "block";
        }
        return;
      }

      localStorage.setItem(AI_KEY_STORAGE, key);
      localStorage.setItem(AI_CONFIGURED_FLAG, "true");

      closeAiModal();
      runAiAnalysis({ fromInsideModal: false });
    });
  }

  if (aiChangeKeyBtn) {
    aiChangeKeyBtn.addEventListener("click", () => {
      if (aiApiKeyInput) aiApiKeyInput.value = (localStorage.getItem(AI_KEY_STORAGE) || "").trim();
      if (aiKeyError) aiKeyError.style.display = "none";
      setAiStep("keyConfig");
      if (aiApiKeyInput) aiApiKeyInput.focus();
    });
  }

  if (aiRemoveKeyBtn) {
    aiRemoveKeyBtn.addEventListener("click", () => {
      if (confirm("Are you sure you want to remove your stored API key?")) {
        localStorage.removeItem(AI_KEY_STORAGE);
        localStorage.removeItem(AI_CONFIGURED_FLAG);
        if (aiApiKeyInput) aiApiKeyInput.value = "";
        setAiStep("intro");
      }
    });
  }

  if (aiReanalyzeBtn) {
    aiReanalyzeBtn.addEventListener("click", () => {
      runAiAnalysis({ fromInsideModal: true });
    });
  }
}

// ===================================================================
// Application Startup
// ===================================================================

function init() {
  // 1. Register Service Worker for offline static file caching
  registerServiceWorker();

  // 2. Initialize Syntax Highlighter Web Worker
  initHighlightWorker();

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
  resetCodeBtn.addEventListener("click", onResetCode);

  runBtn.addEventListener("click", runCode);
  submitBtn.addEventListener("click", submitCode);

  tabTestCasesBtn.addEventListener("click", () => switchTab("testcases"));
  tabOutputBtn.addEventListener("click", () => switchTab("output"));

  codeEditor.addEventListener("input", onCodeInput);
  codeEditor.addEventListener("keydown", handleEditorKeydown);
  codeEditor.addEventListener("scroll", syncEditorScroll);

  // Global Keyboard Shortcuts: Ctrl + ' to Run, Ctrl + Enter to Submit
  window.addEventListener("keydown", (e) => {
    if (e.ctrlKey || e.metaKey) {
      if (e.key === "'") {
        e.preventDefault();
        runCode();
      } else if (e.key === "Enter") {
        e.preventDefault();
        submitCode();
      }
    }
  });

  // 5. Load the initial problem
  loadProblem(currentProblemId);

  // 6. Fetch inspiration quote from Second Public REST API
  fetchInspirationQuote();

  // 7. Initialize AI Analysis integration
  initAiAnalysis();

  // 8. Initialize LeetCode-style stopwatch timer
  initStopwatch();
}

// ===================================================================
// LeetCode-style Timer / Stopwatch (Independent, Timestamp-based)
// ===================================================================

const MAX_STOPWATCH_MS = 100 * 3600 * 1000; // 100 hours (wraps back to 00:00:00 after 99:59:59)

let timerStartTime = null;
let timerAccumulatedMs = 0;
let timerIntervalId = null;
let isTimerRunning = false;

function formatStopwatchTime(totalMs) {
  const safeMs = Math.max(0, Math.floor(totalMs)) % MAX_STOPWATCH_MS;
  const totalSeconds = Math.floor(safeMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const pad = (num) => String(num).padStart(2, "0");
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

function getElapsedStopwatchMs() {
  if (!isTimerRunning || timerStartTime === null) {
    return timerAccumulatedMs % MAX_STOPWATCH_MS;
  }
  const currentElapsed = timerAccumulatedMs + (Date.now() - timerStartTime);
  return currentElapsed % MAX_STOPWATCH_MS;
}

function updateTimerDisplay() {
  if (!timerDisplay) return;
  const elapsed = getElapsedStopwatchMs();
  timerDisplay.textContent = formatStopwatchTime(elapsed);
}

function startTimer() {
  if (isTimerRunning) return;
  isTimerRunning = true;
  timerStartTime = Date.now();

  const iconPlay = timerToggleBtn ? timerToggleBtn.querySelector(".icon-play") : null;
  const iconPause = timerToggleBtn ? timerToggleBtn.querySelector(".icon-pause") : null;

  if (iconPlay) iconPlay.style.display = "none";
  if (iconPause) iconPause.style.display = "block";
  if (timerToggleBtn) {
    timerToggleBtn.title = "Pause (⏸)";
    timerToggleBtn.setAttribute("aria-label", "Pause stopwatch");
  }
  if (timerControl) {
    timerControl.classList.add("is-running");
  }

  updateTimerDisplay();

  // Calculate elapsed time using timestamps (Date.now()) on each tick to eliminate drift
  clearInterval(timerIntervalId);
  timerIntervalId = setInterval(() => {
    // If accumulated + elapsed reached 100 hours, normalize timestamps safely
    if (timerStartTime !== null && (timerAccumulatedMs + (Date.now() - timerStartTime)) >= MAX_STOPWATCH_MS) {
      const wrapped = (timerAccumulatedMs + (Date.now() - timerStartTime)) % MAX_STOPWATCH_MS;
      timerAccumulatedMs = wrapped;
      timerStartTime = Date.now();
    }
    updateTimerDisplay();
  }, 250);
}

function pauseTimer() {
  if (!isTimerRunning) return;
  isTimerRunning = false;
  clearInterval(timerIntervalId);
  timerIntervalId = null;

  if (timerStartTime !== null) {
    timerAccumulatedMs = (timerAccumulatedMs + (Date.now() - timerStartTime)) % MAX_STOPWATCH_MS;
    timerStartTime = null;
  }

  const iconPlay = timerToggleBtn ? timerToggleBtn.querySelector(".icon-play") : null;
  const iconPause = timerToggleBtn ? timerToggleBtn.querySelector(".icon-pause") : null;

  if (iconPlay) iconPlay.style.display = "block";
  if (iconPause) iconPause.style.display = "none";
  if (timerToggleBtn) {
    timerToggleBtn.title = "Resume (▶)";
    timerToggleBtn.setAttribute("aria-label", "Resume stopwatch");
  }
  if (timerControl) {
    timerControl.classList.remove("is-running");
  }

  updateTimerDisplay();
}

function resetTimer() {
  isTimerRunning = false;
  clearInterval(timerIntervalId);
  timerIntervalId = null;
  timerStartTime = null;
  timerAccumulatedMs = 0;

  const iconPlay = timerToggleBtn ? timerToggleBtn.querySelector(".icon-play") : null;
  const iconPause = timerToggleBtn ? timerToggleBtn.querySelector(".icon-pause") : null;

  if (iconPlay) iconPlay.style.display = "block";
  if (iconPause) iconPause.style.display = "none";
  if (timerToggleBtn) {
    timerToggleBtn.title = "Start (▶)";
    timerToggleBtn.setAttribute("aria-label", "Start stopwatch");
  }
  if (timerControl) {
    timerControl.classList.remove("is-running");
  }

  if (timerDisplay) {
    timerDisplay.textContent = "00:00:00";
  }
}

function toggleTimer() {
  if (isTimerRunning) {
    pauseTimer();
  } else {
    startTimer();
  }
}

function initStopwatch() {
  if (!timerToggleBtn || !timerResetBtn || !timerDisplay) return;

  timerToggleBtn.addEventListener("click", toggleTimer);
  timerResetBtn.addEventListener("click", resetTimer);
  timerDisplay.addEventListener("click", toggleTimer);

  // Eliminate any visual throttling when switching browser tabs
  document.addEventListener("visibilitychange", () => {
    if (isTimerRunning) {
      updateTimerDisplay();
    }
  });

  resetTimer();
}

document.addEventListener("DOMContentLoaded", init);
