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
  CodeMirror.defineOption('selectionPointer', false, (cm, val) => {
    let data = cm.state.selectionPointer;
    if (data) {
      CodeMirror.off(cm.getWrapperElement(), 'mousemove', data.mousemove);
      CodeMirror.off(cm.getWrapperElement(), 'mouseout', data.mouseout);
      CodeMirror.off(window, 'scroll', data.windowScroll);
      cm.off('cursorActivity', reset);
      cm.off('scroll', reset);
      cm.state.selectionPointer = null;
      cm.display.lineDiv.style.cursor = '';
    }
    if (val) {
      data = cm.state.selectionPointer = {
        value: typeof val === 'string' ? val : 'default',
        mousemove(event) {
          mousemove(cm, event);
        },
        mouseout(event) {
          mouseout(cm, event);
        },
        windowScroll() {
          reset(cm);
        },
        rects: null,
        mouseX: null,
        mouseY: null,
        willUpdate: false,
      };
      CodeMirror.on(cm.getWrapperElement(), 'mousemove', data.mousemove);
      CodeMirror.on(cm.getWrapperElement(), 'mouseout', data.mouseout);
      CodeMirror.on(window, 'scroll', data.windowScroll);
      cm.on('cursorActivity', reset);
      cm.on('scroll', reset);
    }
  });

  function mousemove(cm, event) {
    const data = cm.state.selectionPointer;
    if (event.buttons == null ? event.which : event.buttons) {
      data.mouseX = data.mouseY = null;
    } else {
      data.mouseX = event.clientX;
      data.mouseY = event.clientY;
    }
    scheduleUpdate(cm);
  }

  function mouseout(cm, event) {
    if (!cm.getWrapperElement().contains(event.relatedTarget)) {
      const data = cm.state.selectionPointer;
      data.mouseX = data.mouseY = null;
      scheduleUpdate(cm);
    }
  }

  function reset(cm) {
    cm.state.selectionPointer.rects = null;
    scheduleUpdate(cm);
  }

  function scheduleUpdate(cm) {
    if (!cm.state.selectionPointer.willUpdate) {
      cm.state.selectionPointer.willUpdate = true;
      setTimeout(() => {
        update(cm);
        cm.state.selectionPointer.willUpdate = false;
      }, 50);
    }
  }

  function update(cm) {
    const data = cm.state.selectionPointer;
    if (!data) return;
    if (data.rects == null && data.mouseX != null) {
      data.rects = [];
      if (cm.somethingSelected()) {
        for (
          let sel = cm.display.selectionDiv.firstChild;
          sel;
          sel = sel.nextSibling
        )
          data.rects.push(sel.getBoundingClientRect());
      }
    }
    let inside = false;
    if (data.mouseX != null)
      for (let i = 0; i < data.rects.length; i++) {
        const rect = data.rects[i];
        if (
          rect.left <= data.mouseX &&
          rect.right >= data.mouseX &&
          rect.top <= data.mouseY &&
          rect.bottom >= data.mouseY
        )
          inside = true;
      }
    const cursor = inside ? data.value : '';
    if (cm.display.lineDiv.style.cursor != cursor)
      cm.display.lineDiv.style.cursor = cursor;
  }
});
