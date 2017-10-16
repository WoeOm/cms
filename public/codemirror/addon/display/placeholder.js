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
  CodeMirror.defineOption('placeholder', '', (cm, val, old) => {
    const prev = old && old != CodeMirror.Init;
    if (val && !prev) {
      cm.on('blur', onBlur);
      cm.on('change', onChange);
      cm.on('swapDoc', onChange);
      onChange(cm);
    } else if (!val && prev) {
      cm.off('blur', onBlur);
      cm.off('change', onChange);
      cm.off('swapDoc', onChange);
      clearPlaceholder(cm);
      const wrapper = cm.getWrapperElement();
      wrapper.className = wrapper.className.replace(' CodeMirror-empty', '');
    }

    if (val && !cm.hasFocus()) onBlur(cm);
  });

  function clearPlaceholder(cm) {
    if (cm.state.placeholder) {
      cm.state.placeholder.parentNode.removeChild(cm.state.placeholder);
      cm.state.placeholder = null;
    }
  }
  function setPlaceholder(cm) {
    clearPlaceholder(cm);
    const elt = (cm.state.placeholder = document.createElement('pre'));
    elt.style.cssText = 'height: 0; overflow: visible';
    elt.className = 'CodeMirror-placeholder';
    let placeHolder = cm.getOption('placeholder');
    if (typeof placeHolder === 'string')
      placeHolder = document.createTextNode(placeHolder);
    elt.appendChild(placeHolder);
    cm.display.lineSpace.insertBefore(elt, cm.display.lineSpace.firstChild);
  }

  function onBlur(cm) {
    if (isEmpty(cm)) setPlaceholder(cm);
  }
  function onChange(cm) {
    let wrapper = cm.getWrapperElement(),
      empty = isEmpty(cm);
    wrapper.className =
      wrapper.className.replace(' CodeMirror-empty', '') +
      (empty ? ' CodeMirror-empty' : '');

    if (empty) setPlaceholder(cm);
    else clearPlaceholder(cm);
  }

  function isEmpty(cm) {
    return cm.lineCount() === 1 && cm.getLine(0) === '';
  }
});
