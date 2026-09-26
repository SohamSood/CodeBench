// ===================================================================
// CodeJudge - Syntax Highlighter Web Worker
// Performs tokenization and syntax highlighting off the main thread.
// ===================================================================

function escapeHtml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
} //before making it safe to render in HTML, we need to escape special characters like <, >, and & to prevent XSS attacks and ensure proper rendering.

function highlight(code, language) {
  if (!code) return ""; //no code

  // Regex patterns based on language
  let commentRegex, stringRegex, keywordRegex, typeRegex, builtInRegex, preprocRegex;

  if (language === "python") {
    commentRegex = /#[^\n]*|"""[\s\S]*?"""|'''[\s\S]*?'''/;
    stringRegex = /"([^"\\\n]|\\.)*"|'([^'\\\n]|\\.)*'/;
    keywordRegex = /\b(def|class|return|if|elif|else|for|while|in|not|and|or|is|import|from|as|try|except|finally|raise|with|lambda|pass|continue|break|yield|global|nonlocal|assert|async|await)\b/;
    typeRegex = /\b(int|float|str|bool|list|dict|set|tuple|List|Dict|Set|Tuple|Optional|Any|Solution)\b/;
    builtInRegex = /\b(True|False|None|self|print|len|range|enumerate|zip|min|max|sum|sorted|map|filter)\b/;
    preprocRegex = /@\w+/;
  } else if (language === "js" || language === "javascript") {
    commentRegex = /\/\/[^\n]*|\/\*[\s\S]*?\*\//;
    stringRegex = /"([^"\\\n]|\\.)*"|'([^'\\\n]|\\.)*'|`([^`\\]|\\.)*`/;
    keywordRegex = /\b(function|const|let|var|return|if|else|for|while|do|switch|case|default|break|continue|try|catch|finally|throw|new|this|class|extends|super|import|export|from|async|await|typeof|instanceof|in|of|yield|void|delete)\b/;
    typeRegex = /\b(Array|Object|String|Number|Boolean|Function|Map|Set|Promise|Symbol|BigInt)\b/;
    builtInRegex = /\b(true|false|null|undefined|NaN|Infinity|console|log|Math|floor|ceil|round|max|min|abs|JSON|stringify|parse)\b/;
    preprocRegex = null;
  } else {
    // C++ and Java
    commentRegex = /\/\/[^\n]*|\/\*[\s\S]*?\*\//;
    stringRegex = /"([^"\\\n]|\\.)*"|'([^'\\\n]|\\.)*'/;
    keywordRegex = /\b(class|public|private|protected|virtual|override|namespace|using|template|typename|struct|const|constexpr|auto|new|delete|this|super|return|if|else|for|while|do|switch|case|default|break|continue|try|catch|throw|throws|finally|sizeof|static|final|abstract|interface|extends|implements|package|import|instanceof)\b/;
    typeRegex = /\b(int|long|float|double|char|bool|boolean|void|string|String|vector|List|ArrayList|Map|HashMap|Set|HashSet|unordered_map|unordered_set|pair|Solution|Integer|Double|Boolean|Character|size_t)\b/;
    builtInRegex = /\b(true|false|null|nullptr|std|cout|cin|endl|System|out|println)\b/;
    preprocRegex = /#\s*(include|define|ifdef|ifndef|endif)\b[^\n]*/;
  }

  // Combined master regex with named groups
  const parts = [
    `(?<comment>${commentRegex.source})`,
    `(?<string>${stringRegex.source})`,
    preprocRegex ? `(?<preproc>${preprocRegex.source})` : null,
    `(?<keyword>${keywordRegex.source})`,
    `(?<type>${typeRegex.source})`,
    `(?<builtin>${builtInRegex.source})`,
    `(?<number>\\b\\d+(\\.\\d+)?\\b)`,
    `(?<func>\\b[a-zA-Z_]\\w*(?=\\s*\\())`,
    `(?<bracket_curly>[{}])`,
    `(?<bracket_paren>[()])`,
    `(?<bracket_square>[\\[\\]])`
  ].filter(Boolean);

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

    if (groups.comment) {
      result += `<span class="token-comment">${text}</span>`;
    } else if (groups.string) {
      result += `<span class="token-string">${text}</span>`;
    } else if (groups.preproc) {
      result += `<span class="token-preproc">${text}</span>`;
    } else if (groups.keyword) {
      result += `<span class="token-keyword">${text}</span>`;
    } else if (groups.type) {
      result += `<span class="token-type">${text}</span>`;
    } else if (groups.builtin) {
      result += `<span class="token-builtin">${text}</span>`;
    } else if (groups.number) {
      result += `<span class="token-number">${text}</span>`;
    } else if (groups.func) {
      result += `<span class="token-function">${text}</span>`;
    } else if (groups.bracket_curly) {
      result += `<span class="token-bracket-curly">${text}</span>`;
    } else if (groups.bracket_paren) {
      result += `<span class="token-bracket-paren">${text}</span>`;
    } else if (groups.bracket_square) {
      result += `<span class="token-bracket-square">${text}</span>`;
    } else {
      result += text;
    }

    lastIndex = masterRegex.lastIndex;
  }

  if (lastIndex < code.length) {
    result += escapeHtml(code.slice(lastIndex));
  }

  // Ensure trailing newline renders properly in pre tag
  if (code.endsWith("\n")) {
    result += " ";
  }

  return result;
}

// Listen for messages from main thread
self.onmessage = function(e) {
  const { code, language, id } = e.data;
  const html = highlight(code, language);
  self.postMessage({ html, id });
};
