// CodeMirror, copyright (c) by Marijn Haverbeke and others
// Distributed under an MIT license: http://codemirror.net/LICENSE

// A rough approximation of Sublime Text's keybindings
// Depends on addon/search/searchcursor.js and optionally addon/dialog/dialogs.js

(function(mod) {
  if (typeof exports === 'object' && typeof module === 'object')
    // CommonJS
    mod(
      require('../lib/codemirror'),
      require('../addon/search/searchcursor'),
      require('../addon/edit/matchbrackets'),
    );
  else if (typeof define === 'function' && define.amd)
    // AMD
    define(
      [
        '../lib/codemirror',
        '../addon/search/searchcursor',
        '../addon/edit/matchbrackets',
      ],
      mod,
    ); // Plain browser env
  else mod(CodeMirror);
})(CodeMirror => {
  const map = (CodeMirror.keyMap.sublime = { fallthrough: 'default' });
  const cmds = CodeMirror.commands;
  const Pos = CodeMirror.Pos;
  const mac = CodeMirror.keyMap.default == CodeMirror.keyMap.macDefault;
  const ctrl = mac ? 'Cmd-' : 'Ctrl-';

  // This is not exactly Sublime's algorithm. I couldn't make heads or tails of that.
  function findPosSubword(doc, start, dir) {
    if (dir < 0 && start.ch == 0) return doc.clipPos(Pos(start.line - 1));
    const line = doc.getLine(start.line);
    if (dir > 0 && start.ch >= line.length)
      return doc.clipPos(Pos(start.line + 1, 0));
    let state = 'start',
      type;
    for (
      var pos = start.ch, e = dir < 0 ? 0 : line.length, i = 0;
      pos != e;
      pos += dir, i++
    ) {
      const next = line.charAt(dir < 0 ? pos - 1 : pos);
      let cat = next != '_' && CodeMirror.isWordChar(next) ? 'w' : 'o';
      if (cat == 'w' && next.toUpperCase() == next) cat = 'W';
      if (state == 'start') {
        if (cat != 'o') {
          state = 'in';
          type = cat;
        }
      } else if (state == 'in') {
        if (type != cat) {
          if (type == 'w' && cat == 'W' && dir < 0) pos--;
          if (type == 'W' && cat == 'w' && dir > 0) {
            type = 'w';
            continue;
          }
          break;
        }
      }
    }
    return Pos(start.line, pos);
  }

  function moveSubword(cm, dir) {
    cm.extendSelectionsBy(range => {
      if (cm.display.shift || cm.doc.extend || range.empty())
        return findPosSubword(cm.doc, range.head, dir);
      return dir < 0 ? range.from() : range.to();
    });
  }

  const goSubwordCombo = mac ? 'Ctrl-' : 'Alt-';

  cmds[(map[`${goSubwordCombo}Left`] = 'goSubwordLeft')] = function(cm) {
    moveSubword(cm, -1);
  };
  cmds[(map[`${goSubwordCombo}Right`] = 'goSubwordRight')] = function(cm) {
    moveSubword(cm, 1);
  };

  if (mac) map['Cmd-Left'] = 'goLineStartSmart';

  const scrollLineCombo = mac ? 'Ctrl-Alt-' : 'Ctrl-';

  cmds[(map[`${scrollLineCombo}Up`] = 'scrollLineUp')] = function(cm) {
    const info = cm.getScrollInfo();
    if (!cm.somethingSelected()) {
      const visibleBottomLine = cm.lineAtHeight(
        info.top + info.clientHeight,
        'local',
      );
      if (cm.getCursor().line >= visibleBottomLine) cm.execCommand('goLineUp');
    }
    cm.scrollTo(null, info.top - cm.defaultTextHeight());
  };
  cmds[(map[`${scrollLineCombo}Down`] = 'scrollLineDown')] = function(cm) {
    const info = cm.getScrollInfo();
    if (!cm.somethingSelected()) {
      const visibleTopLine = cm.lineAtHeight(info.top, 'local') + 1;
      if (cm.getCursor().line <= visibleTopLine) cm.execCommand('goLineDown');
    }
    cm.scrollTo(null, info.top + cm.defaultTextHeight());
  };

  cmds[(map[`Shift-${ctrl}L`] = 'splitSelectionByLine')] = function(cm) {
    let ranges = cm.listSelections(),
      lineRanges = [];
    for (let i = 0; i < ranges.length; i++) {
      let from = ranges[i].from(),
        to = ranges[i].to();
      for (let line = from.line; line <= to.line; ++line)
        if (!(to.line > from.line && line == to.line && to.ch == 0))
          lineRanges.push({
            anchor: line == from.line ? from : Pos(line, 0),
            head: line == to.line ? to : Pos(line),
          });
    }
    cm.setSelections(lineRanges, 0);
  };

  map['Shift-Tab'] = 'indentLess';

  cmds[(map.Esc = 'singleSelectionTop')] = function(cm) {
    const range = cm.listSelections()[0];
    cm.setSelection(range.anchor, range.head, { scroll: false });
  };

  cmds[(map[`${ctrl}L`] = 'selectLine')] = function(cm) {
    let ranges = cm.listSelections(),
      extended = [];
    for (let i = 0; i < ranges.length; i++) {
      const range = ranges[i];
      extended.push({
        anchor: Pos(range.from().line, 0),
        head: Pos(range.to().line + 1, 0),
      });
    }
    cm.setSelections(extended);
  };

  map['Shift-Ctrl-K'] = 'deleteLine';

  function insertLine(cm, above) {
    if (cm.isReadOnly()) return CodeMirror.Pass;
    cm.operation(() => {
      let len = cm.listSelections().length,
        newSelection = [],
        last = -1;
      for (let i = 0; i < len; i++) {
        const head = cm.listSelections()[i].head;
        if (head.line <= last) continue;
        const at = Pos(head.line + (above ? 0 : 1), 0);
        cm.replaceRange('\n', at, null, '+insertLine');
        cm.indentLine(at.line, null, true);
        newSelection.push({ head: at, anchor: at });
        last = head.line + 1;
      }
      cm.setSelections(newSelection);
    });
    cm.execCommand('indentAuto');
  }

  cmds[(map[`${ctrl}Enter`] = 'insertLineAfter')] = function(cm) {
    return insertLine(cm, false);
  };

  cmds[(map[`Shift-${ctrl}Enter`] = 'insertLineBefore')] = function(cm) {
    return insertLine(cm, true);
  };

  function wordAt(cm, pos) {
    let start = pos.ch,
      end = start,
      line = cm.getLine(pos.line);
    while (start && CodeMirror.isWordChar(line.charAt(start - 1))) --start;
    while (end < line.length && CodeMirror.isWordChar(line.charAt(end))) ++end;
    return {
      from: Pos(pos.line, start),
      to: Pos(pos.line, end),
      word: line.slice(start, end),
    };
  }

  cmds[(map[`${ctrl}D`] = 'selectNextOccurrence')] = function(cm) {
    let from = cm.getCursor('from'),
      to = cm.getCursor('to');
    let fullWord = cm.state.sublimeFindFullWord == cm.doc.sel;
    if (CodeMirror.cmpPos(from, to) == 0) {
      const word = wordAt(cm, from);
      if (!word.word) return;
      cm.setSelection(word.from, word.to);
      fullWord = true;
    } else {
      const text = cm.getRange(from, to);
      const query = fullWord ? new RegExp(`\\b${text}\\b`) : text;
      let cur = cm.getSearchCursor(query, to);
      let found = cur.findNext();
      if (!found) {
        cur = cm.getSearchCursor(query, Pos(cm.firstLine(), 0));
        found = cur.findNext();
      }
      if (!found || isSelectedRange(cm.listSelections(), cur.from(), cur.to()))
        return CodeMirror.Pass;
      cm.addSelection(cur.from(), cur.to());
    }
    if (fullWord) cm.state.sublimeFindFullWord = cm.doc.sel;
  };

  function addCursorToSelection(cm, dir) {
    let ranges = cm.listSelections(),
      newRanges = [];
    for (let i = 0; i < ranges.length; i++) {
      const range = ranges[i];
      const newAnchor = cm.findPosV(range.anchor, dir, 'line');
      const newHead = cm.findPosV(range.head, dir, 'line');
      const newRange = { anchor: newAnchor, head: newHead };
      newRanges.push(range);
      newRanges.push(newRange);
    }
    cm.setSelections(newRanges);
  }

  const addCursorToLineCombo = mac ? 'Shift-Cmd' : 'Alt-Ctrl';
  cmds[(map[`${addCursorToLineCombo}Up`] = 'addCursorToPrevLine')] = function(
    cm,
  ) {
    addCursorToSelection(cm, -1);
  };
  cmds[(map[`${addCursorToLineCombo}Down`] = 'addCursorToNextLine')] = function(
    cm,
  ) {
    addCursorToSelection(cm, 1);
  };

  function isSelectedRange(ranges, from, to) {
    for (let i = 0; i < ranges.length; i++)
      if (ranges[i].from() == from && ranges[i].to() == to) return true;
    return false;
  }

  const mirror = '(){}[]';
  function selectBetweenBrackets(cm) {
    let ranges = cm.listSelections(),
      newRanges = [];
    for (let i = 0; i < ranges.length; i++) {
      let range = ranges[i],
        pos = range.head,
        opening = cm.scanForBracket(pos, -1);
      if (!opening) return false;
      for (;;) {
        const closing = cm.scanForBracket(pos, 1);
        if (!closing) return false;
        if (closing.ch == mirror.charAt(mirror.indexOf(opening.ch) + 1)) {
          newRanges.push({
            anchor: Pos(opening.pos.line, opening.pos.ch + 1),
            head: closing.pos,
          });
          break;
        }
        pos = Pos(closing.pos.line, closing.pos.ch + 1);
      }
    }
    cm.setSelections(newRanges);
    return true;
  }

  cmds[(map[`Shift-${ctrl}Space`] = 'selectScope')] = function(cm) {
    selectBetweenBrackets(cm) || cm.execCommand('selectAll');
  };
  cmds[(map[`Shift-${ctrl}M`] = 'selectBetweenBrackets')] = function(cm) {
    if (!selectBetweenBrackets(cm)) return CodeMirror.Pass;
  };

  cmds[(map[`${ctrl}M`] = 'goToBracket')] = function(cm) {
    cm.extendSelectionsBy(range => {
      const next = cm.scanForBracket(range.head, 1);
      if (next && CodeMirror.cmpPos(next.pos, range.head) != 0) return next.pos;
      const prev = cm.scanForBracket(range.head, -1);
      return (prev && Pos(prev.pos.line, prev.pos.ch + 1)) || range.head;
    });
  };

  const swapLineCombo = mac ? 'Cmd-Ctrl-' : 'Shift-Ctrl-';

  cmds[(map[`${swapLineCombo}Up`] = 'swapLineUp')] = function(cm) {
    if (cm.isReadOnly()) return CodeMirror.Pass;
    let ranges = cm.listSelections(),
      linesToMove = [],
      at = cm.firstLine() - 1,
      newSels = [];
    for (let i = 0; i < ranges.length; i++) {
      let range = ranges[i],
        from = range.from().line - 1,
        to = range.to().line;
      newSels.push({
        anchor: Pos(range.anchor.line - 1, range.anchor.ch),
        head: Pos(range.head.line - 1, range.head.ch),
      });
      if (range.to().ch == 0 && !range.empty()) --to;
      if (from > at) linesToMove.push(from, to);
      else if (linesToMove.length) linesToMove[linesToMove.length - 1] = to;
      at = to;
    }
    cm.operation(() => {
      for (let i = 0; i < linesToMove.length; i += 2) {
        let from = linesToMove[i],
          to = linesToMove[i + 1];
        const line = cm.getLine(from);
        cm.replaceRange('', Pos(from, 0), Pos(from + 1, 0), '+swapLine');
        if (to > cm.lastLine())
          cm.replaceRange(`\n${line}`, Pos(cm.lastLine()), null, '+swapLine');
        else cm.replaceRange(`${line}\n`, Pos(to, 0), null, '+swapLine');
      }
      cm.setSelections(newSels);
      cm.scrollIntoView();
    });
  };

  cmds[(map[`${swapLineCombo}Down`] = 'swapLineDown')] = function(cm) {
    if (cm.isReadOnly()) return CodeMirror.Pass;
    let ranges = cm.listSelections(),
      linesToMove = [],
      at = cm.lastLine() + 1;
    for (let i = ranges.length - 1; i >= 0; i--) {
      let range = ranges[i],
        from = range.to().line + 1,
        to = range.from().line;
      if (range.to().ch == 0 && !range.empty()) from--;
      if (from < at) linesToMove.push(from, to);
      else if (linesToMove.length) linesToMove[linesToMove.length - 1] = to;
      at = to;
    }
    cm.operation(() => {
      for (let i = linesToMove.length - 2; i >= 0; i -= 2) {
        let from = linesToMove[i],
          to = linesToMove[i + 1];
        const line = cm.getLine(from);
        if (from == cm.lastLine())
          cm.replaceRange('', Pos(from - 1), Pos(from), '+swapLine');
        else cm.replaceRange('', Pos(from, 0), Pos(from + 1, 0), '+swapLine');
        cm.replaceRange(`${line}\n`, Pos(to, 0), null, '+swapLine');
      }
      cm.scrollIntoView();
    });
  };

  cmds[(map[`${ctrl}/`] = 'toggleCommentIndented')] = function(cm) {
    cm.toggleComment({ indent: true });
  };

  cmds[(map[`${ctrl}J`] = 'joinLines')] = function(cm) {
    let ranges = cm.listSelections(),
      joined = [];
    for (let i = 0; i < ranges.length; i++) {
      let range = ranges[i],
        from = range.from();
      let start = from.line,
        end = range.to().line;
      while (i < ranges.length - 1 && ranges[i + 1].from().line == end)
        end = ranges[++i].to().line;
      joined.push({ start, end, anchor: !range.empty() && from });
    }
    cm.operation(() => {
      let offset = 0,
        ranges = [];
      for (let i = 0; i < joined.length; i++) {
        const obj = joined[i];
        var anchor = obj.anchor && Pos(obj.anchor.line - offset, obj.anchor.ch),
          head;
        for (let line = obj.start; line <= obj.end; line++) {
          const actual = line - offset;
          if (line == obj.end)
            head = Pos(actual, cm.getLine(actual).length + 1);
          if (actual < cm.lastLine()) {
            cm.replaceRange(
              ' ',
              Pos(actual),
              Pos(actual + 1, /^\s*/.exec(cm.getLine(actual + 1))[0].length),
            );
            ++offset;
          }
        }
        ranges.push({ anchor: anchor || head, head });
      }
      cm.setSelections(ranges, 0);
    });
  };

  cmds[(map[`Shift-${ctrl}D`] = 'duplicateLine')] = function(cm) {
    cm.operation(() => {
      const rangeCount = cm.listSelections().length;
      for (let i = 0; i < rangeCount; i++) {
        const range = cm.listSelections()[i];
        if (range.empty())
          cm.replaceRange(
            `${cm.getLine(range.head.line)}\n`,
            Pos(range.head.line, 0),
          );
        else
          cm.replaceRange(cm.getRange(range.from(), range.to()), range.from());
      }
      cm.scrollIntoView();
    });
  };

  if (!mac) map[`${ctrl}T`] = 'transposeChars';

  function sortLines(cm, caseSensitive) {
    if (cm.isReadOnly()) return CodeMirror.Pass;
    let ranges = cm.listSelections(),
      toSort = [],
      selected;
    for (let i = 0; i < ranges.length; i++) {
      const range = ranges[i];
      if (range.empty()) continue;
      let from = range.from().line,
        to = range.to().line;
      while (i < ranges.length - 1 && ranges[i + 1].from().line == to)
        to = ranges[++i].to().line;
      if (!ranges[i].to().ch) to--;
      toSort.push(from, to);
    }
    if (toSort.length) selected = true;
    else toSort.push(cm.firstLine(), cm.lastLine());

    cm.operation(() => {
      const ranges = [];
      for (let i = 0; i < toSort.length; i += 2) {
        let from = toSort[i],
          to = toSort[i + 1];
        let start = Pos(from, 0),
          end = Pos(to);
        const lines = cm.getRange(start, end, false);
        if (caseSensitive) lines.sort();
        else
          lines.sort((a, b) => {
            let au = a.toUpperCase(),
              bu = b.toUpperCase();
            if (au != bu) {
              a = au;
              b = bu;
            }
            return a < b ? -1 : a == b ? 0 : 1;
          });
        cm.replaceRange(lines, start, end);
        if (selected) ranges.push({ anchor: start, head: Pos(to + 1, 0) });
      }
      if (selected) cm.setSelections(ranges, 0);
    });
  }

  cmds[(map.F9 = 'sortLines')] = function(cm) {
    sortLines(cm, true);
  };
  cmds[(map[`${ctrl}F9`] = 'sortLinesInsensitive')] = function(cm) {
    sortLines(cm, false);
  };

  cmds[(map.F2 = 'nextBookmark')] = function(cm) {
    const marks = cm.state.sublimeBookmarks;
    if (marks)
      while (marks.length) {
        const current = marks.shift();
        const found = current.find();
        if (found) {
          marks.push(current);
          return cm.setSelection(found.from, found.to);
        }
      }
  };

  cmds[(map['Shift-F2'] = 'prevBookmark')] = function(cm) {
    const marks = cm.state.sublimeBookmarks;
    if (marks)
      while (marks.length) {
        marks.unshift(marks.pop());
        const found = marks[marks.length - 1].find();
        if (!found) marks.pop();
        else return cm.setSelection(found.from, found.to);
      }
  };

  cmds[(map[`${ctrl}F2`] = 'toggleBookmark')] = function(cm) {
    const ranges = cm.listSelections();
    const marks = cm.state.sublimeBookmarks || (cm.state.sublimeBookmarks = []);
    for (let i = 0; i < ranges.length; i++) {
      let from = ranges[i].from(),
        to = ranges[i].to();
      const found = cm.findMarks(from, to);
      for (var j = 0; j < found.length; j++) {
        if (found[j].sublimeBookmark) {
          found[j].clear();
          for (let k = 0; k < marks.length; k++)
            if (marks[k] == found[j]) marks.splice(k--, 1);
          break;
        }
      }
      if (j == found.length)
        marks.push(
          cm.markText(from, to, {
            sublimeBookmark: true,
            clearWhenEmpty: false,
          }),
        );
    }
  };

  cmds[(map[`Shift-${ctrl}F2`] = 'clearBookmarks')] = function(cm) {
    const marks = cm.state.sublimeBookmarks;
    if (marks) for (let i = 0; i < marks.length; i++) marks[i].clear();
    marks.length = 0;
  };

  cmds[(map['Alt-F2'] = 'selectBookmarks')] = function(cm) {
    let marks = cm.state.sublimeBookmarks,
      ranges = [];
    if (marks)
      for (let i = 0; i < marks.length; i++) {
        const found = marks[i].find();
        if (!found) marks.splice(i--, 0);
        else ranges.push({ anchor: found.from, head: found.to });
      }
    if (ranges.length) cm.setSelections(ranges, 0);
  };

  map['Alt-Q'] = 'wrapLines';

  const cK = `${ctrl}K `;

  function modifyWordOrSelection(cm, mod) {
    cm.operation(() => {
      let ranges = cm.listSelections(),
        indices = [],
        replacements = [];
      for (var i = 0; i < ranges.length; i++) {
        var range = ranges[i];
        if (range.empty()) {
          indices.push(i);
          replacements.push('');
        } else replacements.push(mod(cm.getRange(range.from(), range.to())));
      }
      cm.replaceSelections(replacements, 'around', 'case');
      for (var i = indices.length - 1, at; i >= 0; i--) {
        var range = ranges[indices[i]];
        if (at && CodeMirror.cmpPos(range.head, at) > 0) continue;
        const word = wordAt(cm, range.head);
        at = word.from;
        cm.replaceRange(mod(word.word), word.from, word.to);
      }
    });
  }

  map[`${cK + ctrl}Backspace`] = 'delLineLeft';

  cmds[(map.Backspace = 'smartBackspace')] = function(cm) {
    if (cm.somethingSelected()) return CodeMirror.Pass;

    cm.operation(() => {
      const cursors = cm.listSelections();
      const indentUnit = cm.getOption('indentUnit');

      for (let i = cursors.length - 1; i >= 0; i--) {
        const cursor = cursors[i].head;
        const toStartOfLine = cm.getRange({ line: cursor.line, ch: 0 }, cursor);
        const column = CodeMirror.countColumn(
          toStartOfLine,
          null,
          cm.getOption('tabSize'),
        );

        // Delete by one character by default
        let deletePos = cm.findPosH(cursor, -1, 'char', false);

        if (
          toStartOfLine &&
          !/\S/.test(toStartOfLine) &&
          column % indentUnit == 0
        ) {
          const prevIndent = new Pos(
            cursor.line,
            CodeMirror.findColumn(
              toStartOfLine,
              column - indentUnit,
              indentUnit,
            ),
          );

          // Smart delete only if we found a valid prevIndent location
          if (prevIndent.ch != cursor.ch) deletePos = prevIndent;
        }

        cm.replaceRange('', deletePos, cursor, '+delete');
      }
    });
  };

  cmds[(map[`${cK + ctrl}K`] = 'delLineRight')] = function(cm) {
    cm.operation(() => {
      const ranges = cm.listSelections();
      for (let i = ranges.length - 1; i >= 0; i--)
        cm.replaceRange(
          '',
          ranges[i].anchor,
          Pos(ranges[i].to().line),
          '+delete',
        );
      cm.scrollIntoView();
    });
  };

  cmds[(map[`${cK + ctrl}U`] = 'upcaseAtCursor')] = function(cm) {
    modifyWordOrSelection(cm, str => str.toUpperCase());
  };
  cmds[(map[`${cK + ctrl}L`] = 'downcaseAtCursor')] = function(cm) {
    modifyWordOrSelection(cm, str => str.toLowerCase());
  };

  cmds[(map[`${cK + ctrl}Space`] = 'setSublimeMark')] = function(cm) {
    if (cm.state.sublimeMark) cm.state.sublimeMark.clear();
    cm.state.sublimeMark = cm.setBookmark(cm.getCursor());
  };
  cmds[(map[`${cK + ctrl}A`] = 'selectToSublimeMark')] = function(cm) {
    const found = cm.state.sublimeMark && cm.state.sublimeMark.find();
    if (found) cm.setSelection(cm.getCursor(), found);
  };
  cmds[(map[`${cK + ctrl}W`] = 'deleteToSublimeMark')] = function(cm) {
    const found = cm.state.sublimeMark && cm.state.sublimeMark.find();
    if (found) {
      let from = cm.getCursor(),
        to = found;
      if (CodeMirror.cmpPos(from, to) > 0) {
        const tmp = to;
        to = from;
        from = tmp;
      }
      cm.state.sublimeKilled = cm.getRange(from, to);
      cm.replaceRange('', from, to);
    }
  };
  cmds[(map[`${cK + ctrl}X`] = 'swapWithSublimeMark')] = function(cm) {
    const found = cm.state.sublimeMark && cm.state.sublimeMark.find();
    if (found) {
      cm.state.sublimeMark.clear();
      cm.state.sublimeMark = cm.setBookmark(cm.getCursor());
      cm.setCursor(found);
    }
  };
  cmds[(map[`${cK + ctrl}Y`] = 'sublimeYank')] = function(cm) {
    if (cm.state.sublimeKilled != null)
      cm.replaceSelection(cm.state.sublimeKilled, null, 'paste');
  };

  map[`${cK + ctrl}G`] = 'clearBookmarks';
  cmds[(map[`${cK + ctrl}C`] = 'showInCenter')] = function(cm) {
    const pos = cm.cursorCoords(null, 'local');
    cm.scrollTo(
      null,
      (pos.top + pos.bottom) / 2 - cm.getScrollInfo().clientHeight / 2,
    );
  };

  const selectLinesCombo = mac ? 'Ctrl-Shift-' : 'Ctrl-Alt-';
  cmds[(map[`${selectLinesCombo}Up`] = 'selectLinesUpward')] = function(cm) {
    cm.operation(() => {
      const ranges = cm.listSelections();
      for (let i = 0; i < ranges.length; i++) {
        const range = ranges[i];
        if (range.head.line > cm.firstLine())
          cm.addSelection(Pos(range.head.line - 1, range.head.ch));
      }
    });
  };
  cmds[(map[`${selectLinesCombo}Down`] = 'selectLinesDownward')] = function(
    cm,
  ) {
    cm.operation(() => {
      const ranges = cm.listSelections();
      for (let i = 0; i < ranges.length; i++) {
        const range = ranges[i];
        if (range.head.line < cm.lastLine())
          cm.addSelection(Pos(range.head.line + 1, range.head.ch));
      }
    });
  };

  function getTarget(cm) {
    let from = cm.getCursor('from'),
      to = cm.getCursor('to');
    if (CodeMirror.cmpPos(from, to) == 0) {
      var word = wordAt(cm, from);
      if (!word.word) return;
      from = word.from;
      to = word.to;
    }
    return { from, to, query: cm.getRange(from, to), word };
  }

  function findAndGoTo(cm, forward) {
    const target = getTarget(cm);
    if (!target) return;
    const query = target.query;
    let cur = cm.getSearchCursor(query, forward ? target.to : target.from);

    if (forward ? cur.findNext() : cur.findPrevious()) {
      cm.setSelection(cur.from(), cur.to());
    } else {
      cur = cm.getSearchCursor(
        query,
        forward ? Pos(cm.firstLine(), 0) : cm.clipPos(Pos(cm.lastLine())),
      );
      if (forward ? cur.findNext() : cur.findPrevious())
        cm.setSelection(cur.from(), cur.to());
      else if (target.word) cm.setSelection(target.from, target.to);
    }
  }
  cmds[(map[`${ctrl}F3`] = 'findUnder')] = function(cm) {
    findAndGoTo(cm, true);
  };
  cmds[(map[`Shift-${ctrl}F3`] = 'findUnderPrevious')] = function(cm) {
    findAndGoTo(cm, false);
  };
  cmds[(map['Alt-F3'] = 'findAllUnder')] = function(cm) {
    const target = getTarget(cm);
    if (!target) return;
    const cur = cm.getSearchCursor(target.query);
    const matches = [];
    let primaryIndex = -1;
    while (cur.findNext()) {
      matches.push({ anchor: cur.from(), head: cur.to() });
      if (
        cur.from().line <= target.from.line &&
        cur.from().ch <= target.from.ch
      )
        primaryIndex++;
    }
    cm.setSelections(matches, primaryIndex);
  };

  map[`Shift-${ctrl}[`] = 'fold';
  map[`Shift-${ctrl}]`] = 'unfold';
  map[`${cK + ctrl}0`] = map[`${cK + ctrl}J`] = 'unfoldAll';

  map[`${ctrl}I`] = 'findIncremental';
  map[`Shift-${ctrl}I`] = 'findIncrementalReverse';
  map[`${ctrl}H`] = 'replace';
  map.F3 = 'findNext';
  map['Shift-F3'] = 'findPrev';

  CodeMirror.normalizeKeyMap(map);
});
