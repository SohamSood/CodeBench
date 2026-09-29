# CodeJudge 🚀

A lightweight, LeetCode-like online coding platform frontend built with **Vanilla HTML, CSS, and JavaScript**.

---

## 🌟 Features Added

1. **Real-time Syntax Highlighting (Colors while coding)**:
   - Tokenizes and highlights keywords, types, strings, numbers, comments, built-ins, and functions.
   - Built with a fast, zero-dependency tokenizer.
2. **Web Worker Integration (`highlighter.worker.js`)**:
   - Tokenization and syntax highlighting run completely off the main thread in a dedicated Web Worker to ensure 60fps lag-free typing.
   - Includes automatic, graceful fallback to synchronous main-thread highlighting if opened directly via `file:///`.
3. **Auto-Indentation**:
   - Pressing **Enter** maintains the current line's leading indentation.
   - Pressing **Enter** after `{` or `:` automatically increases indentation by 4 spaces.
   - Pressing **Enter** between `{` and `}` expands into a properly indented block:
     ```text
     {
         |
     }
     ```
   - Pressing **Tab** inserts 4 spaces or indents multi-line selections.
   - Pressing **Shift + Tab** unindents lines by 4 spaces.
4. **Brackets & Quotes Automation ("Brackets Stuff")**:
   - Auto-closing pairs for `( )`, `[ ]`, `{ }`, `" "`, and `' '`.
   - **Overtype Skip**: Typing a closing bracket when the cursor is already before it skips over it instead of duplicating.
   - **Pair Backspace**: Pressing Backspace between empty pairs (`()`, `[]`, `{}`, `""`, `''`) deletes both brackets.
   - **Rainbow Bracket Colors**: Different bracket types have distinct, harmonious colors (Yellow `{ }`, Violet `( )`, Sky Blue `[ ]`).
5. **IDE Line Numbers**:
   - Dedicated gutter showing line numbers, synchronized with scrolling.
6. **Compiler / Judge Integration**:
   - Configurable local judge API endpoint (`http://localhost:5000/judge`).
   - Integrated with **OnlineCompiler.io API** using your active API key (`8f4116741c0bc3c69222801807ef3f33`).

---

## 📁 Project Structure

```text
Compiler/
│
├── index.html                 # Main application UI & layout
├── styles.css                 # Dark theme & syntax highlighting tokens
├── app.js                     # Core application logic & bracket/indent engine
├── highlighter.worker.js      # Web Worker for background syntax highlighting
│
├── problems/                  # Problem catalog
│   ├── two-sum/
│   │   ├── problem.json
│   │   ├── tests.json
│   │   ├── cpp/template.cpp
│   │   ├── java/template.java
│   │   └── python/template.py
│   ├── binary-search/
│   │   └── ...
│   └── maximum-element/
│       └── ...
│
└── README.md
```

---

## ⚙️ Compiler / Judge Configuration

In [app.js](file:///c:/Users/soodn/vscode/Compiler/app.js#L8-L23):

```javascript
// Local Judge API
const API_URL = "http://localhost:5000/judge";

// OnlineCompiler.io Live API Configuration
const ONLINECOMPILER_CONFIG = {
  url: "https://api.onlinecompiler.io/api/run-code-sync/",
  apiKey: "8f4116741c0bc3c69222801807ef3f33",
  compilers: {
    cpp: "g++-15",
    java: "openjdk-25",
    python: "python-3.14"
  }
};
```
