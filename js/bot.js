// حلبة v1 — البوت: خصم بسرعة تكرارات مبرمجة (3 مستويات)، يعمل بلا إنترنت.
// كل تكرار يُجدول بفاصل عشوائي حول المتوسط (±25%) حتى لا يبدو آلياً تماماً.
(function (root) {
  'use strict';

  var LEVELS = {
    easy:   { label: 'سهل',    rating: 800,  meanMs: 3000 },
    medium: { label: 'متوسط',  rating: 1200, meanMs: 2000 },
    hard:   { label: 'صعب',    rating: 1600, meanMs: 1300 }
  };

  function createBot(levelKey) {
    var cfg = LEVELS[levelKey] || LEVELS.medium;
    var reps = 0;
    var timer = null;
    var running = false;
    var onRep = null;

    function schedule() {
      if (!running) return;
      var delay = cfg.meanMs * (0.75 + Math.random() * 0.5);
      timer = setTimeout(function () {
        if (!running) return;
        reps++;
        if (onRep) onRep(reps);
        schedule();
      }, delay);
    }

    return {
      level: levelKey,
      label: cfg.label,
      rating: cfg.rating,
      get reps() { return reps; },
      onRep: function (fn) { onRep = fn; },
      start: function () {
        if (running) return;
        running = true;
        schedule();
      },
      stop: function () {
        running = false;
        if (timer) { clearTimeout(timer); timer = null; }
      }
    };
  }

  root.FitBot = { LEVELS: LEVELS, createBot: createBot };
})(typeof self !== 'undefined' ? self : this);
