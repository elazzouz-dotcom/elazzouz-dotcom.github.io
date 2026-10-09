(() => {
  'use strict';

  const get = (selector) => document.querySelector(selector);
  const sourceInput = get('#shell-source');
  const tokenList = get('#shell-token-list');
  const findingsList = get('#shell-findings');
  const analysisStatus = get('#shell-analysis-status');
  const quoteInput = get('#shell-literal');
  const quoteOutput = get('#shell-quote-output');
  const quoteStatus = get('#shell-quote-status');
  const variablesInput = get('#shell-variables');
  const expressionInput = get('#shell-expression');
  const expansionOutput = get('#shell-expansion-output');
  const expansionStatus = get('#shell-expansion-status');

  const sample = `name='Morris Worm'
printf '%s\\n' "$name"
for file in *.sh; do
  [ -f "$file" ] && printf '%s\\n' "$file"
done`;
  const reservedWords = new Set([
    '!', '{', '}', 'case', 'do', 'done', 'elif', 'else', 'esac', 'fi',
    'for', 'if', 'in', 'then', 'until', 'while'
  ]);
  const multiCharacterOperators = ['&&', '||', ';;', '<<-', '>>', '<&', '>&', '<>', '>|', '<<'];
  const singleCharacterOperators = new Set(['|', '&', ';', '<', '>', '(', ')']);

  function makeToken(kind, line, text) {
    return {
      kind,
      line,
      text
    };
  }

  function tokenize(source) {
    const tokens = [];
    const issues = [];
    let word = '';
    let wordLine = 1;
    let line = 1;
    let quote = '';
    let escaped = false;
    const substitutions = [];

    function pushWord() {
      if (!word) return;
      let kind = 'WORD';
      if (reservedWords.has(word)) kind = 'RESERVED';
      else if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(word)) kind = 'ASSIGNMENT';
      tokens.push(makeToken(kind, wordLine, word));
      word = '';
    }

    function append(character) {
      if (!word) wordLine = line;
      word += character;
    }

    for (let index = 0; index < source.length; index += 1) {
      const character = source[index];
      const next = source[index + 1] || '';

      if (character === '\n') {
        if (escaped) {
          escaped = false;
          if (word.endsWith('\\')) word = word.slice(0, -1);
          line += 1;
          continue;
        }
        if (!quote && substitutions.length === 0) {
          pushWord();
          tokens.push(makeToken('NEWLINE', line, '\\n'));
        } else {
          append(character);
        }
        line += 1;
        continue;
      }

      if (escaped) {
        append(character);
        escaped = false;
        continue;
      }

      if (quote === "'") {
        append(character);
        if (character === "'") quote = '';
        continue;
      }

      if (quote === '"') {
        append(character);
        if (character === '\\' && ['$', '`', '"', '\\'].includes(next)) {
          escaped = true;
          continue;
        }
        if (character === '"') {
          quote = '';
          continue;
        }
        if (character === '$' && next === '(') {
          substitutions.push({
            close: ')',
            depth: 1
          });
          append(next);
          index += 1;
          continue;
        }
        if (character === '$' && next === '{') {
          substitutions.push({
            close: '}',
            depth: 1
          });
          append(next);
          index += 1;
          continue;
        }
        if (character === '`') {
          if (substitutions.at(-1)?.close === '`') substitutions.pop();
          else substitutions.push({
            close: '`',
            depth: 1
          });
        }
        continue;
      }

      if (character === '\\') {
        append(character);
        escaped = true;
        continue;
      }
      if (character === "'" || character === '"') {
        append(character);
        quote = character;
        continue;
      }
      if (character === '$' && next === '(') {
        append(character);
        append(next);
        substitutions.push({
          close: ')',
          depth: 1
        });
        index += 1;
        continue;
      }
      if (character === '$' && next === '{') {
        append(character);
        append(next);
        substitutions.push({
          close: '}',
          depth: 1
        });
        index += 1;
        continue;
      }
      if (character === '`') {
        append(character);
        if (substitutions.at(-1)?.close === '`') substitutions.pop();
        else substitutions.push({
          close: '`',
          depth: 1
        });
        continue;
      }

      const activeSubstitution = substitutions.at(-1);
      if (activeSubstitution) {
        append(character);
        if (character === activeSubstitution.close) {
          activeSubstitution.depth -= 1;
          if (activeSubstitution.depth === 0) substitutions.pop();
        } else if (activeSubstitution.close === ')' && character === '(') {
          activeSubstitution.depth += 1;
        } else if (activeSubstitution.close === '}' && character === '{') {
          activeSubstitution.depth += 1;
        }
        continue;
      }

      if (character === '#' && !word) {
        let comment = '';
        while (index < source.length && source[index] !== '\n') {
          comment += source[index];
          index += 1;
        }
        index -= 1;
        tokens.push(makeToken('COMMENT', line, comment));
        continue;
      }

      if (character === ' ' || character === '\t' || character === '\r') {
        pushWord();
        continue;
      }

      const operator = multiCharacterOperators.find((candidate) => source.startsWith(candidate, index));
      if (operator) {
        pushWord();
        tokens.push(makeToken('OPERATOR', line, operator));
        index += operator.length - 1;
        continue;
      }
      if (singleCharacterOperators.has(character)) {
        pushWord();
        tokens.push(makeToken('OPERATOR', line, character));
        continue;
      }
      append(character);
    }

    pushWord();
    if (quote) issues.push(`اقتباس ${quote === "'" ? 'مفرد' : 'مزدوج'} غير مغلق قرب نهاية النص.`);
    if (escaped) issues.push('شرطة عكسية أخيرة بلا حرف تالٍ.');
    if (substitutions.length) issues.push('توسعة $() أو ${} أو backquote لم تُغلق.');

    tokens.forEach((token, index) => {
      if (token.kind === 'WORD' && /^\d+$/.test(token.text) && tokens[index + 1]?.kind === 'OPERATOR' && /^[<>]/.test(tokens[index + 1].text)) {
        token.kind = 'IO_NUMBER';
      }
    });
    return {
      tokens,
      issues
    };
  }

  function renderAnalysis() {
    const result = tokenize(sourceInput.value);
    tokenList.replaceChildren();
    findingsList.replaceChildren();

    result.tokens.forEach((token) => {
      const row = document.createElement('tr');
      row.className = 'border-t border-[var(--color-border)]';
      const kind = document.createElement('td');
      kind.className = 'p-3 font-bold text-[var(--color-primary)]';
      kind.textContent = token.kind;
      const line = document.createElement('td');
      line.className = 'p-3 text-[var(--color-muted)]';
      line.textContent = String(token.line);
      const text = document.createElement('td');
      text.className = 'fox-code whitespace-pre-wrap break-all p-3 text-[var(--color-text)]';
      text.textContent = token.text;
      row.append(kind, line, text);
      tokenList.append(row);
    });

    const findings = result.issues.length ? result.issues : ['لم يجد الفحص التقريبي اقتباسًا غير مغلق. هذا لا يثبت صحة الأمر أو سلامته.'];
    findings.forEach((message) => {
      const item = document.createElement('li');
      item.className = 'rounded-[calc(var(--radius)*0.5)] bg-[var(--color-bg)] p-3';
      item.textContent = message;
      findingsList.append(item);
    });
    analysisStatus.textContent = `${result.tokens.length} رمزًا مستخرجًا. الفحص لغوي تقريبي ولا ينفّذ النص.`;
  }

  function renderQuote() {
    quoteOutput.textContent = `'${quoteInput.value.replace(/'/g, "'\\''")}'`;
  }

  function parseVariables() {
    const values = Object.create(null);
    variablesInput.value.split(/\r?\n/).forEach((line) => {
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
      if (!match) return;
      let value = match[2];
      if ((value.startsWith("'") && value.endsWith("'")) || (value.startsWith('"') && value.endsWith('"'))) {
        value = value.slice(1, -1);
      }
      values[match[1]] = value;
    });
    return values;
  }

  function globToRegExp(pattern) {
    const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`^${escaped.replace(/\*/g, '.*').replace(/\?/g, '.')}$`);
  }

  function expandSimpleWord(word, variables) {
    return word.replace(/\$([A-Za-z_][A-Za-z0-9_]*)/g, (_, name) => variables[name] ?? '');
  }

  function simulateExpansion() {
    const variables = parseVariables();
    const expression = expressionInput.value.trim();
    const braced = expression.match(/^\$\{([\s\S]*)\}$/);
    if (!braced) {
      expansionOutput.textContent = 'اكتب توسعة واحدة بصيغة ${name} أو $name.';
      expansionStatus.textContent = 'لم تُجرَ محاكاة.';
      return;
    }

    const body = braced[1];
    if (body.startsWith('#') && /^[A-Za-z_][A-Za-z0-9_]*$/.test(body.slice(1))) {
      const value = variables[body.slice(1)];
      expansionOutput.textContent = value === undefined ? 'خطأ: المتغير غير مضبوط.' : String([...value].length);
      expansionStatus.textContent = 'محاكاة لطول القيمة؛ لا يوجد تنفيذ shell.';
      return;
    }

    const match = body.match(/^([A-Za-z_][A-Za-z0-9_]*)(:-|:=|:\?|:\+|##|%%|#|%|-|=|\?|\+)([\s\S]*)$/);
    const name = match ? match[1] : body;
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
      expansionOutput.textContent = 'خطأ: صيغة المتغير غير مدعومة في هذا المحاكي.';
      expansionStatus.textContent = 'يدعم المختبر توسعات بسيطة فقط؛ command substitution غير مدعوم عمدًا.';
      return;
    }

    const current = variables[name];
    if (!match) {
      expansionOutput.textContent = current === undefined ? '' : current;
      expansionStatus.textContent = current === undefined ? 'المتغير غير مضبوط؛ توسع إلى قيمة فارغة في هذا النموذج.' : `قيمة ${name} من جدول المتغيرات التجريبي.`;
      return;
    }

    const operator = match[2];
    const word = expandSimpleWord(match[3], variables);
    const isUnset = current === undefined;
    const isNull = current === '';
    const isUnsetOrNull = isUnset || isNull;
    let output;
    let note = '';

    if (operator === ':-') output = isUnsetOrNull ? word : current;
    else if (operator === '-') output = isUnset ? word : current;
    else if (operator === ':+') output = isUnsetOrNull ? '' : word;
    else if (operator === '+') output = isUnset ? '' : word;
    else if (operator === ':=') {
      output = isUnsetOrNull ? word : current;
      if (isUnsetOrNull) {
        variables[name] = word;
        note = ` وتم تعيين ${name} محليًا في المحاكاة.`;
      }
    } else if (operator === '=') {
      output = isUnset ? word : current;
      if (isUnset) {
        variables[name] = word;
        note = ` وتم تعيين ${name} محليًا في المحاكاة.`;
      }
    } else if (operator === ':?' || operator === '?') {
      if (operator === ':?' ? isUnsetOrNull : isUnset) throw new Error(word || `${name} غير مضبوط.`);
      output = current;
    } else if (operator === '#' || operator === '##') {
      const pattern = globToRegExp(word);
      const indexes = [...current.matchAll(/[ -]/g)];
      void indexes;
      const candidates = Array.from({
        length: current.length + 1
      }, (_, index) => current.slice(0, index));
      const matching = candidates.filter((candidate) => pattern.test(candidate));
      const removed = matching.length ? (operator === '#' ? matching.sort((a, b) => a.length - b.length)[0] : matching.sort((a, b) => b.length - a.length)[0]) : '';
      output = current.slice(removed.length);
    } else {
      const pattern = globToRegExp(word);
      const candidates = Array.from({
        length: current.length + 1
      }, (_, index) => current.slice(index));
      const matching = candidates.filter((candidate) => pattern.test(candidate));
      const removed = matching.length ? (operator === '%' ? matching.sort((a, b) => a.length - b.length)[0] : matching.sort((a, b) => b.length - a.length)[0]) : '';
      output = removed ? current.slice(0, current.length - removed.length) : current;
    }

    expansionOutput.textContent = String(output ?? '');
    expansionStatus.textContent = `حُسبت ${expression} باستخدام متغيرات الصفحة فقط.${note} لم تُنفّذ أي أوامر.`;
  }

  get('#shell-load-sample').addEventListener('click', () => {
    sourceInput.value = sample;
    renderAnalysis();
  });
  get('#shell-analyze').addEventListener('click', renderAnalysis);
  get('#shell-clear').addEventListener('click', () => {
    sourceInput.value = '';
    renderAnalysis();
    sourceInput.focus();
  });
  sourceInput.addEventListener('input', renderAnalysis);
  quoteInput.addEventListener('input', renderQuote);
  get('#shell-copy-quote').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(quoteOutput.textContent);
      quoteStatus.textContent = 'نُسخت الصيغة المقتبسة؛ لم يتم تشغيلها.';
    } catch {
      quoteStatus.textContent = 'الحافظة غير متاحة؛ حدّد الصيغة وانسخها يدويًا.';
    }
  });
  get('#shell-expand').addEventListener('click', () => {
    try {
      simulateExpansion();
    } catch (error) {
      expansionOutput.textContent = `خطأ محاكى: ${error.message}`;
      expansionStatus.textContent = 'لم يتم تشغيل shell أو تنفيذ command substitution.';
    }
  });

  renderAnalysis();
  renderQuote();
})();
