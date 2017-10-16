// CodeMirror, copyright (c) by Marijn Haverbeke and others
// Distributed under an MIT license: http://codemirror.net/LICENSE

(function(mod) {
  if (typeof exports === 'object' && typeof module === 'object')
    // CommonJS
    mod(require('../../lib/codemirror'));
  else if (typeof define === 'function' && define.amd)
    // AMD
    define(['../../lib/codemirror'], mod); // Plain browser env
  else mod(CodeMirror);
})(CodeMirror => {
  function forEach(arr, f) {
    for (let i = 0; i < arr.length; i++) f(arr[i], i);
  }
  function some(arr, f) {
    for (let i = 0; i < arr.length; i++) if (f(arr[i], i)) return true;
    return false;
  }

  CodeMirror.defineMode('dylan', _config => {
    // Words
    const words = {
      // Words that introduce unnamed definitions like "define interface"
      unnamedDefinition: ['interface'],

      // Words that introduce simple named definitions like "define library"
      namedDefinition: [
        'module',
        'library',
        'macro',
        'C-struct',
        'C-union',
        'C-function',
        'C-callable-wrapper',
      ],

      // Words that introduce type definitions like "define class".
      // These are also parameterized like "define method" and are
      // appended to otherParameterizedDefinitionWords
      typeParameterizedDefinition: ['class', 'C-subtype', 'C-mapped-subtype'],

      // Words that introduce trickier definitions like "define method".
      // These require special definitions to be added to startExpressions
      otherParameterizedDefinition: [
        'method',
        'function',
        'C-variable',
        'C-address',
      ],

      // Words that introduce module constant definitions.
      // These must also be simple definitions and are
      // appended to otherSimpleDefinitionWords
      constantSimpleDefinition: ['constant'],

      // Words that introduce module variable definitions.
      // These must also be simple definitions and are
      // appended to otherSimpleDefinitionWords
      variableSimpleDefinition: ['variable'],

      // Other words that introduce simple definitions
      // (without implicit bodies).
      otherSimpleDefinition: ['generic', 'domain', 'C-pointer-type', 'table'],

      // Words that begin statements with implicit bodies.
      statement: [
        'if',
        'block',
        'begin',
        'method',
        'case',
        'for',
        'select',
        'when',
        'unless',
        'until',
        'while',
        'iterate',
        'profiling',
        'dynamic-bind',
      ],

      // Patterns that act as separators in compound statements.
      // This may include any general pattern that must be indented
      // specially.
      separator: [
        'finally',
        'exception',
        'cleanup',
        'else',
        'elseif',
        'afterwards',
      ],

      // Keywords that do not require special indentation handling,
      // but which should be highlighted
      other: [
        'above',
        'below',
        'by',
        'from',
        'handler',
        'in',
        'instance',
        'let',
        'local',
        'otherwise',
        'slot',
        'subclass',
        'then',
        'to',
        'keyed-by',
        'virtual',
      ],

      // Condition signaling function calls
      signalingCalls: [
        'signal',
        'error',
        'cerror',
        'break',
        'check-type',
        'abort',
      ],
    };

    words.otherDefinition = words.unnamedDefinition
      .concat(words.namedDefinition)
      .concat(words.otherParameterizedDefinition);

    words.definition = words.typeParameterizedDefinition.concat(
      words.otherDefinition,
    );

    words.parameterizedDefinition = words.typeParameterizedDefinition.concat(
      words.otherParameterizedDefinition,
    );

    words.simpleDefinition = words.constantSimpleDefinition
      .concat(words.variableSimpleDefinition)
      .concat(words.otherSimpleDefinition);

    words.keyword = words.statement.concat(words.separator).concat(words.other);

    // Patterns
    const symbolPattern = '[-_a-zA-Z?!*@<>$%]+';
    const symbol = new RegExp(`^${symbolPattern}`);
    const patterns = {
      // Symbols with special syntax
      symbolKeyword: `${symbolPattern}:`,
      symbolClass: `<${symbolPattern}>`,
      symbolGlobal: `\\*${symbolPattern}\\*`,
      symbolConstant: `\\$${symbolPattern}`,
    };
    const patternStyles = {
      symbolKeyword: 'atom',
      symbolClass: 'tag',
      symbolGlobal: 'variable-2',
      symbolConstant: 'variable-3',
    };

    // Compile all patterns to regular expressions
    for (const patternName in patterns)
      if (patterns.hasOwnProperty(patternName))
        patterns[patternName] = new RegExp(`^${patterns[patternName]}`);

    // Names beginning "with-" and "without-" are commonly
    // used as statement macro
    patterns.keyword = [/^with(?:out)?-[-_a-zA-Z?!*@<>$%]+/];

    const styles = {};
    styles.keyword = 'keyword';
    styles.definition = 'def';
    styles.simpleDefinition = 'def';
    styles.signalingCalls = 'builtin';

    // protected words lookup table
    const wordLookup = {};
    const styleLookup = {};

    forEach(
      ['keyword', 'definition', 'simpleDefinition', 'signalingCalls'],
      type => {
        forEach(words[type], word => {
          wordLookup[word] = type;
          styleLookup[word] = styles[type];
        });
      },
    );

    function chain(stream, state, f) {
      state.tokenize = f;
      return f(stream, state);
    }

    function tokenBase(stream, state) {
      // String
      let ch = stream.peek();
      if (ch == "'" || ch == '"') {
        stream.next();
        return chain(stream, state, tokenString(ch, 'string'));
      } else if (ch == '/') {
        // Comment
        stream.next();
        if (stream.eat('*')) {
          return chain(stream, state, tokenComment);
        } else if (stream.eat('/')) {
          stream.skipToEnd();
          return 'comment';
        }
        stream.backUp(1);
      } else if (/[+\-\d\.]/.test(ch)) {
        // Decimal
        if (
          stream.match(/^[+-]?[0-9]*\.[0-9]*([esdx][+-]?[0-9]+)?/i) ||
          stream.match(/^[+-]?[0-9]+([esdx][+-]?[0-9]+)/i) ||
          stream.match(/^[+-]?\d+/)
        ) {
          return 'number';
        }
      } else if (ch == '#') {
        // Hash
        stream.next();
        // Symbol with string syntax
        ch = stream.peek();
        if (ch == '"') {
          stream.next();
          return chain(stream, state, tokenString('"', 'string'));
        } else if (ch == 'b') {
          // Binary number
          stream.next();
          stream.eatWhile(/[01]/);
          return 'number';
        } else if (ch == 'x') {
          // Hex number
          stream.next();
          stream.eatWhile(/[\da-f]/i);
          return 'number';
        } else if (ch == 'o') {
          // Octal number
          stream.next();
          stream.eatWhile(/[0-7]/);
          return 'number';
        } else if (ch == '#') {
          // Token concatenation in macros
          stream.next();
          return 'punctuation';
        } else if (ch == '[' || ch == '(') {
          // Sequence literals
          stream.next();
          return 'bracket';
          // Hash symbol
        } else if (stream.match(/f|t|all-keys|include|key|next|rest/i)) {
          return 'atom';
        }
        stream.eatWhile(/[-a-zA-Z]/);
        return 'error';
      } else if (ch == '~') {
        stream.next();
        ch = stream.peek();
        if (ch == '=') {
          stream.next();
          ch = stream.peek();
          if (ch == '=') {
            stream.next();
            return 'operator';
          }
          return 'operator';
        }
        return 'operator';
      } else if (ch == ':') {
        stream.next();
        ch = stream.peek();
        if (ch == '=') {
          stream.next();
          return 'operator';
        } else if (ch == ':') {
          stream.next();
          return 'punctuation';
        }
      } else if ('[](){}'.indexOf(ch) != -1) {
        stream.next();
        return 'bracket';
      } else if ('.,'.indexOf(ch) != -1) {
        stream.next();
        return 'punctuation';
      } else if (stream.match('end')) {
        return 'keyword';
      }
      for (const name in patterns) {
        if (patterns.hasOwnProperty(name)) {
          const pattern = patterns[name];
          if (
            (pattern instanceof Array && some(pattern, p => stream.match(p))) ||
            stream.match(pattern)
          )
            return patternStyles[name];
        }
      }
      if (/[+\-*\/^=<>&|]/.test(ch)) {
        stream.next();
        return 'operator';
      }
      if (stream.match('define')) {
        return 'def';
      }
      stream.eatWhile(/[\w\-]/);
      // Keyword
      if (wordLookup.hasOwnProperty(stream.current())) {
        return styleLookup[stream.current()];
      } else if (stream.current().match(symbol)) {
        return 'variable';
      }
      stream.next();
      return 'variable-2';
    }

    function tokenComment(stream, state) {
      let maybeEnd = false,
        maybeNested = false,
        nestedCount = 0,
        ch;
      while ((ch = stream.next())) {
        if (ch == '/' && maybeEnd) {
          if (nestedCount > 0) {
            nestedCount--;
          } else {
            state.tokenize = tokenBase;
            break;
          }
        } else if (ch == '*' && maybeNested) {
          nestedCount++;
        }
        maybeEnd = ch == '*';
        maybeNested = ch == '/';
      }
      return 'comment';
    }

    function tokenString(quote, style) {
      return function(stream, state) {
        let escaped = false,
          next,
          end = false;
        while ((next = stream.next()) != null) {
          if (next == quote && !escaped) {
            end = true;
            break;
          }
          escaped = !escaped && next == '\\';
        }
        if (end || !escaped) {
          state.tokenize = tokenBase;
        }
        return style;
      };
    }

    // Interface
    return {
      startState() {
        return {
          tokenize: tokenBase,
          currentIndent: 0,
        };
      },
      token(stream, state) {
        if (stream.eatSpace()) return null;
        const style = state.tokenize(stream, state);
        return style;
      },
      blockCommentStart: '/*',
      blockCommentEnd: '*/',
    };
  });

  CodeMirror.defineMIME('text/x-dylan', 'dylan');
});
