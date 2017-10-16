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
  CodeMirror.defineOption('rulers', false, (cm, val) => {
    if (cm.state.rulerDiv) {
      cm.state.rulerDiv.parentElement.removeChild(cm.state.rulerDiv);
      cm.state.rulerDiv = null;
      cm.off('refresh', drawRulers);
    }
    if (val && val.length) {
      cm.state.rulerDiv = cm.display.lineSpace.parentElement.insertBefore(
        document.createElement('div'),
        cm.display.lineSpace,
      );
      cm.state.rulerDiv.className = 'CodeMirror-rulers';
      drawRulers(cm);
      cm.on('refresh', drawRulers);
    }
  });

  function drawRulers(cm) {
    cm.state.rulerDiv.textContent = '';
    const val = cm.getOption('rulers');
    const cw = cm.defaultCharWidth();
    const left = cm.charCoords(CodeMirror.Pos(cm.firstLine(), 0), 'div').left;
    cm.state.rulerDiv.style.minHeight = `${cm.display.scroller.offsetHeight +
      30}px`;
    for (let i = 0; i < val.length; i++) {
      const elt = document.createElement('div');
      elt.className = 'CodeMirror-ruler';
      var col,
        conf = val[i];
      if (typeof conf === 'number') {
        col = conf;
      } else {
        col = conf.column;
        if (conf.className) elt.className += ` ${conf.className}`;
        if (conf.color) elt.style.borderColor = conf.color;
        if (conf.lineStyle) elt.style.borderLeftStyle = conf.lineStyle;
        if (conf.width) elt.style.borderLeftWidth = conf.width;
      }
      elt.style.left = `${left + col * cw}px`;
      cm.state.rulerDiv.appendChild(elt);
    }
  }
});
