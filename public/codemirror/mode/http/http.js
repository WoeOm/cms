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
  CodeMirror.defineMode('http', () => {
    function failFirstLine(stream, state) {
      stream.skipToEnd();
      state.cur = header;
      return 'error';
    }

    function start(stream, state) {
      if (stream.match(/^HTTP\/\d\.\d/)) {
        state.cur = responseStatusCode;
        return 'keyword';
      } else if (stream.match(/^[A-Z]+/) && /[ \t]/.test(stream.peek())) {
        state.cur = requestPath;
        return 'keyword';
      }
      return failFirstLine(stream, state);
    }

    function responseStatusCode(stream, state) {
      const code = stream.match(/^\d+/);
      if (!code) return failFirstLine(stream, state);

      state.cur = responseStatusText;
      const status = Number(code[0]);
      if (status >= 100 && status < 200) {
        return 'positive informational';
      } else if (status >= 200 && status < 300) {
        return 'positive success';
      } else if (status >= 300 && status < 400) {
        return 'positive redirect';
      } else if (status >= 400 && status < 500) {
        return 'negative client-error';
      } else if (status >= 500 && status < 600) {
        return 'negative server-error';
      }
      return 'error';
    }

    function responseStatusText(stream, state) {
      stream.skipToEnd();
      state.cur = header;
      return null;
    }

    function requestPath(stream, state) {
      stream.eatWhile(/\S/);
      state.cur = requestProtocol;
      return 'string-2';
    }

    function requestProtocol(stream, state) {
      if (stream.match(/^HTTP\/\d\.\d$/)) {
        state.cur = header;
        return 'keyword';
      }
      return failFirstLine(stream, state);
    }

    function header(stream) {
      if (stream.sol() && !stream.eat(/[ \t]/)) {
        if (stream.match(/^.*?:/)) {
          return 'atom';
        }
        stream.skipToEnd();
        return 'error';
      }
      stream.skipToEnd();
      return 'string';
    }

    function body(stream) {
      stream.skipToEnd();
      return null;
    }

    return {
      token(stream, state) {
        const cur = state.cur;
        if (cur != header && cur != body && stream.eatSpace()) return null;
        return cur(stream, state);
      },

      blankLine(state) {
        state.cur = body;
      },

      startState() {
        return { cur: start };
      },
    };
  });

  CodeMirror.defineMIME('message/http', 'http');
});
