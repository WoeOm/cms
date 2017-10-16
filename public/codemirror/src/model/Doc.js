import CodeMirror from '../edit/CodeMirror';
import { docMethodOp } from '../display/operations';
import { Line } from '../line/line_data';
import { clipPos, clipPosArray, Pos } from '../line/pos';
import { visualLine } from '../line/spans';
import {
  getBetween,
  getLine,
  getLines,
  isLine,
  lineNo,
} from '../line/utils_line';
import { classTest } from '../util/dom';
import { splitLinesAuto } from '../util/feature_detection';
import { createObj, map, isEmpty, sel_dontScroll } from '../util/misc';
import { ensureCursorVisible, scrollToCoords } from '../display/scrolling';

import {
  changeLine,
  makeChange,
  makeChangeFromHistory,
  replaceRange,
} from './changes';
import { computeReplacedSel } from './change_measurement';
import { BranchChunk, LeafChunk } from './chunk';
import { directionChanged, linkedDocs, updateDoc } from './document_data';
import { copyHistoryArray, History } from './history';
import { addLineWidget } from './line_widget';
import {
  copySharedMarkers,
  detachSharedMarkers,
  findSharedMarkers,
  markText,
} from './mark_text';
import { normalizeSelection, Range, simpleSelection } from './selection';
import {
  extendSelection,
  extendSelections,
  setSelection,
  setSelectionReplaceHistory,
  setSimpleSelection,
} from './selection_updates';

let nextDocId = 0;
const Doc = function(text, mode, firstLine, lineSep, direction) {
  if (!(this instanceof Doc))
    return new Doc(text, mode, firstLine, lineSep, direction);
  if (firstLine == null) firstLine = 0;

  BranchChunk.call(this, [new LeafChunk([new Line('', null)])]);
  this.first = firstLine;
  this.scrollTop = this.scrollLeft = 0;
  this.cantEdit = false;
  this.cleanGeneration = 1;
  this.modeFrontier = this.highlightFrontier = firstLine;
  const start = Pos(firstLine, 0);
  this.sel = simpleSelection(start);
  this.history = new History(null);
  this.id = ++nextDocId;
  this.modeOption = mode;
  this.lineSep = lineSep;
  this.direction = direction == 'rtl' ? 'rtl' : 'ltr';
  this.extend = false;

  if (typeof text === 'string') text = this.splitLines(text);
  updateDoc(this, { from: start, to: start, text });
  setSelection(this, simpleSelection(start), sel_dontScroll);
};

Doc.prototype = createObj(BranchChunk.prototype, {
  constructor: Doc,
  // Iterate over the document. Supports two forms -- with only one
  // argument, it calls that for each line in the document. With
  // three, it iterates over the range given by the first two (with
  // the second being non-inclusive).
  iter(from, to, op) {
    if (op) this.iterN(from - this.first, to - from, op);
    else this.iterN(this.first, this.first + this.size, from);
  },

  // Non-public interface for adding and removing lines.
  insert(at, lines) {
    let height = 0;
    for (let i = 0; i < lines.length; ++i) height += lines[i].height;
    this.insertInner(at - this.first, lines, height);
  },
  remove(at, n) {
    this.removeInner(at - this.first, n);
  },

  // From here, the methods are part of the public interface. Most
  // are also available from CodeMirror (editor) instances.

  getValue(lineSep) {
    const lines = getLines(this, this.first, this.first + this.size);
    if (lineSep === false) return lines;
    return lines.join(lineSep || this.lineSeparator());
  },
  setValue: docMethodOp(function(code) {
    let top = Pos(this.first, 0),
      last = this.first + this.size - 1;
    makeChange(
      this,
      {
        from: top,
        to: Pos(last, getLine(this, last).text.length),
        text: this.splitLines(code),
        origin: 'setValue',
        full: true,
      },
      true,
    );
    if (this.cm) scrollToCoords(this.cm, 0, 0);
    setSelection(this, simpleSelection(top), sel_dontScroll);
  }),
  replaceRange(code, from, to, origin) {
    from = clipPos(this, from);
    to = to ? clipPos(this, to) : from;
    replaceRange(this, code, from, to, origin);
  },
  getRange(from, to, lineSep) {
    const lines = getBetween(this, clipPos(this, from), clipPos(this, to));
    if (lineSep === false) return lines;
    return lines.join(lineSep || this.lineSeparator());
  },

  getLine(line) {
    const l = this.getLineHandle(line);
    return l && l.text;
  },

  getLineHandle(line) {
    if (isLine(this, line)) return getLine(this, line);
  },
  getLineNumber(line) {
    return lineNo(line);
  },

  getLineHandleVisualStart(line) {
    if (typeof line === 'number') line = getLine(this, line);
    return visualLine(line);
  },

  lineCount() {
    return this.size;
  },
  firstLine() {
    return this.first;
  },
  lastLine() {
    return this.first + this.size - 1;
  },

  clipPos(pos) {
    return clipPos(this, pos);
  },

  getCursor(start) {
    let range = this.sel.primary(),
      pos;
    if (start == null || start == 'head') pos = range.head;
    else if (start == 'anchor') pos = range.anchor;
    else if (start == 'end' || start == 'to' || start === false)
      pos = range.to();
    else pos = range.from();
    return pos;
  },
  listSelections() {
    return this.sel.ranges;
  },
  somethingSelected() {
    return this.sel.somethingSelected();
  },

  setCursor: docMethodOp(function(line, ch, options) {
    setSimpleSelection(
      this,
      clipPos(this, typeof line === 'number' ? Pos(line, ch || 0) : line),
      null,
      options,
    );
  }),
  setSelection: docMethodOp(function(anchor, head, options) {
    setSimpleSelection(
      this,
      clipPos(this, anchor),
      clipPos(this, head || anchor),
      options,
    );
  }),
  extendSelection: docMethodOp(function(head, other, options) {
    extendSelection(
      this,
      clipPos(this, head),
      other && clipPos(this, other),
      options,
    );
  }),
  extendSelections: docMethodOp(function(heads, options) {
    extendSelections(this, clipPosArray(this, heads), options);
  }),
  extendSelectionsBy: docMethodOp(function(f, options) {
    const heads = map(this.sel.ranges, f);
    extendSelections(this, clipPosArray(this, heads), options);
  }),
  setSelections: docMethodOp(function(ranges, primary, options) {
    if (!ranges.length) return;
    const out = [];
    for (let i = 0; i < ranges.length; i++)
      out[i] = new Range(
        clipPos(this, ranges[i].anchor),
        clipPos(this, ranges[i].head),
      );
    if (primary == null)
      primary = Math.min(ranges.length - 1, this.sel.primIndex);
    setSelection(this, normalizeSelection(out, primary), options);
  }),
  addSelection: docMethodOp(function(anchor, head, options) {
    const ranges = this.sel.ranges.slice(0);
    ranges.push(
      new Range(clipPos(this, anchor), clipPos(this, head || anchor)),
    );
    setSelection(this, normalizeSelection(ranges, ranges.length - 1), options);
  }),

  getSelection(lineSep) {
    let ranges = this.sel.ranges,
      lines;
    for (let i = 0; i < ranges.length; i++) {
      const sel = getBetween(this, ranges[i].from(), ranges[i].to());
      lines = lines ? lines.concat(sel) : sel;
    }
    if (lineSep === false) return lines;
    return lines.join(lineSep || this.lineSeparator());
  },
  getSelections(lineSep) {
    let parts = [],
      ranges = this.sel.ranges;
    for (let i = 0; i < ranges.length; i++) {
      let sel = getBetween(this, ranges[i].from(), ranges[i].to());
      if (lineSep !== false) sel = sel.join(lineSep || this.lineSeparator());
      parts[i] = sel;
    }
    return parts;
  },
  replaceSelection(code, collapse, origin) {
    const dup = [];
    for (let i = 0; i < this.sel.ranges.length; i++) dup[i] = code;
    this.replaceSelections(dup, collapse, origin || '+input');
  },
  replaceSelections: docMethodOp(function(code, collapse, origin) {
    let changes = [],
      sel = this.sel;
    for (let i = 0; i < sel.ranges.length; i++) {
      const range = sel.ranges[i];
      changes[i] = {
        from: range.from(),
        to: range.to(),
        text: this.splitLines(code[i]),
        origin,
      };
    }
    const newSel =
      collapse &&
      collapse != 'end' &&
      computeReplacedSel(this, changes, collapse);
    for (let i = changes.length - 1; i >= 0; i--) makeChange(this, changes[i]);
    if (newSel) setSelectionReplaceHistory(this, newSel);
    else if (this.cm) ensureCursorVisible(this.cm);
  }),
  undo: docMethodOp(function() {
    makeChangeFromHistory(this, 'undo');
  }),
  redo: docMethodOp(function() {
    makeChangeFromHistory(this, 'redo');
  }),
  undoSelection: docMethodOp(function() {
    makeChangeFromHistory(this, 'undo', true);
  }),
  redoSelection: docMethodOp(function() {
    makeChangeFromHistory(this, 'redo', true);
  }),

  setExtending(val) {
    this.extend = val;
  },
  getExtending() {
    return this.extend;
  },

  historySize() {
    let hist = this.history,
      done = 0,
      undone = 0;
    for (let i = 0; i < hist.done.length; i++) if (!hist.done[i].ranges) ++done;
    for (let i = 0; i < hist.undone.length; i++)
      if (!hist.undone[i].ranges) ++undone;
    return { undo: done, redo: undone };
  },
  clearHistory() {
    this.history = new History(this.history.maxGeneration);
  },

  markClean() {
    this.cleanGeneration = this.changeGeneration(true);
  },
  changeGeneration(forceSplit) {
    if (forceSplit)
      this.history.lastOp = this.history.lastSelOp = this.history.lastOrigin = null;
    return this.history.generation;
  },
  isClean(gen) {
    return this.history.generation == (gen || this.cleanGeneration);
  },

  getHistory() {
    return {
      done: copyHistoryArray(this.history.done),
      undone: copyHistoryArray(this.history.undone),
    };
  },
  setHistory(histData) {
    const hist = (this.history = new History(this.history.maxGeneration));
    hist.done = copyHistoryArray(histData.done.slice(0), null, true);
    hist.undone = copyHistoryArray(histData.undone.slice(0), null, true);
  },

  setGutterMarker: docMethodOp(function(line, gutterID, value) {
    return changeLine(this, line, 'gutter', line => {
      const markers = line.gutterMarkers || (line.gutterMarkers = {});
      markers[gutterID] = value;
      if (!value && isEmpty(markers)) line.gutterMarkers = null;
      return true;
    });
  }),

  clearGutter: docMethodOp(function(gutterID) {
    this.iter(line => {
      if (line.gutterMarkers && line.gutterMarkers[gutterID]) {
        changeLine(this, line, 'gutter', () => {
          line.gutterMarkers[gutterID] = null;
          if (isEmpty(line.gutterMarkers)) line.gutterMarkers = null;
          return true;
        });
      }
    });
  }),

  lineInfo(line) {
    let n;
    if (typeof line === 'number') {
      if (!isLine(this, line)) return null;
      n = line;
      line = getLine(this, line);
      if (!line) return null;
    } else {
      n = lineNo(line);
      if (n == null) return null;
    }
    return {
      line: n,
      handle: line,
      text: line.text,
      gutterMarkers: line.gutterMarkers,
      textClass: line.textClass,
      bgClass: line.bgClass,
      wrapClass: line.wrapClass,
      widgets: line.widgets,
    };
  },

  addLineClass: docMethodOp(function(handle, where, cls) {
    return changeLine(
      this,
      handle,
      where == 'gutter' ? 'gutter' : 'class',
      line => {
        const prop =
          where == 'text'
            ? 'textClass'
            : where == 'background'
              ? 'bgClass'
              : where == 'gutter' ? 'gutterClass' : 'wrapClass';
        if (!line[prop]) line[prop] = cls;
        else if (classTest(cls).test(line[prop])) return false;
        else line[prop] += ` ${cls}`;
        return true;
      },
    );
  }),
  removeLineClass: docMethodOp(function(handle, where, cls) {
    return changeLine(
      this,
      handle,
      where == 'gutter' ? 'gutter' : 'class',
      line => {
        const prop =
          where == 'text'
            ? 'textClass'
            : where == 'background'
              ? 'bgClass'
              : where == 'gutter' ? 'gutterClass' : 'wrapClass';
        const cur = line[prop];
        if (!cur) return false;
        else if (cls == null) line[prop] = null;
        else {
          const found = cur.match(classTest(cls));
          if (!found) return false;
          const end = found.index + found[0].length;
          line[prop] =
            cur.slice(0, found.index) +
              (!found.index || end == cur.length ? '' : ' ') +
              cur.slice(end) || null;
        }
        return true;
      },
    );
  }),

  addLineWidget: docMethodOp(function(handle, node, options) {
    return addLineWidget(this, handle, node, options);
  }),
  removeLineWidget(widget) {
    widget.clear();
  },

  markText(from, to, options) {
    return markText(
      this,
      clipPos(this, from),
      clipPos(this, to),
      options,
      (options && options.type) || 'range',
    );
  },
  setBookmark(pos, options) {
    const realOpts = {
      replacedWith:
        options && (options.nodeType == null ? options.widget : options),
      insertLeft: options && options.insertLeft,
      clearWhenEmpty: false,
      shared: options && options.shared,
      handleMouseEvents: options && options.handleMouseEvents,
    };
    pos = clipPos(this, pos);
    return markText(this, pos, pos, realOpts, 'bookmark');
  },
  findMarksAt(pos) {
    pos = clipPos(this, pos);
    let markers = [],
      spans = getLine(this, pos.line).markedSpans;
    if (spans)
      for (let i = 0; i < spans.length; ++i) {
        const span = spans[i];
        if (
          (span.from == null || span.from <= pos.ch) &&
          (span.to == null || span.to >= pos.ch)
        )
          markers.push(span.marker.parent || span.marker);
      }
    return markers;
  },
  findMarks(from, to, filter) {
    from = clipPos(this, from);
    to = clipPos(this, to);
    let found = [],
      lineNo = from.line;
    this.iter(from.line, to.line + 1, line => {
      const spans = line.markedSpans;
      if (spans)
        for (let i = 0; i < spans.length; i++) {
          const span = spans[i];
          if (
            !(
              (span.to != null && lineNo == from.line && from.ch >= span.to) ||
              (span.from == null && lineNo != from.line) ||
              (span.from != null && lineNo == to.line && span.from >= to.ch)
            ) &&
            (!filter || filter(span.marker))
          )
            found.push(span.marker.parent || span.marker);
        }
      ++lineNo;
    });
    return found;
  },
  getAllMarks() {
    const markers = [];
    this.iter(line => {
      const sps = line.markedSpans;
      if (sps)
        for (let i = 0; i < sps.length; ++i)
          if (sps[i].from != null) markers.push(sps[i].marker);
    });
    return markers;
  },

  posFromIndex(off) {
    let ch,
      lineNo = this.first,
      sepSize = this.lineSeparator().length;
    this.iter(line => {
      const sz = line.text.length + sepSize;
      if (sz > off) {
        ch = off;
        return true;
      }
      off -= sz;
      ++lineNo;
    });
    return clipPos(this, Pos(lineNo, ch));
  },
  indexFromPos(coords) {
    coords = clipPos(this, coords);
    let index = coords.ch;
    if (coords.line < this.first || coords.ch < 0) return 0;
    const sepSize = this.lineSeparator().length;
    this.iter(this.first, coords.line, line => {
      // iter aborts when callback returns a truthy value
      index += line.text.length + sepSize;
    });
    return index;
  },

  copy(copyHistory) {
    const doc = new Doc(
      getLines(this, this.first, this.first + this.size),
      this.modeOption,
      this.first,
      this.lineSep,
      this.direction,
    );
    doc.scrollTop = this.scrollTop;
    doc.scrollLeft = this.scrollLeft;
    doc.sel = this.sel;
    doc.extend = false;
    if (copyHistory) {
      doc.history.undoDepth = this.history.undoDepth;
      doc.setHistory(this.getHistory());
    }
    return doc;
  },

  linkedDoc(options) {
    if (!options) options = {};
    let from = this.first,
      to = this.first + this.size;
    if (options.from != null && options.from > from) from = options.from;
    if (options.to != null && options.to < to) to = options.to;
    const copy = new Doc(
      getLines(this, from, to),
      options.mode || this.modeOption,
      from,
      this.lineSep,
      this.direction,
    );
    if (options.sharedHist) copy.history = this.history;
    (this.linked || (this.linked = [])).push({
      doc: copy,
      sharedHist: options.sharedHist,
    });
    copy.linked = [
      { doc: this, isParent: true, sharedHist: options.sharedHist },
    ];
    copySharedMarkers(copy, findSharedMarkers(this));
    return copy;
  },
  unlinkDoc(other) {
    if (other instanceof CodeMirror) other = other.doc;
    if (this.linked)
      for (let i = 0; i < this.linked.length; ++i) {
        const link = this.linked[i];
        if (link.doc != other) continue;
        this.linked.splice(i, 1);
        other.unlinkDoc(this);
        detachSharedMarkers(findSharedMarkers(this));
        break;
      }
    // If the histories were shared, split them again
    if (other.history == this.history) {
      const splitIds = [other.id];
      linkedDocs(other, doc => splitIds.push(doc.id), true);
      other.history = new History(null);
      other.history.done = copyHistoryArray(this.history.done, splitIds);
      other.history.undone = copyHistoryArray(this.history.undone, splitIds);
    }
  },
  iterLinkedDocs(f) {
    linkedDocs(this, f);
  },

  getMode() {
    return this.mode;
  },
  getEditor() {
    return this.cm;
  },

  splitLines(str) {
    if (this.lineSep) return str.split(this.lineSep);
    return splitLinesAuto(str);
  },
  lineSeparator() {
    return this.lineSep || '\n';
  },

  setDirection: docMethodOp(function(dir) {
    if (dir != 'rtl') dir = 'ltr';
    if (dir == this.direction) return;
    this.direction = dir;
    this.iter(line => (line.order = null));
    if (this.cm) directionChanged(this.cm);
  }),
});

// Public alias.
Doc.prototype.eachLine = Doc.prototype.iter;

export default Doc;
