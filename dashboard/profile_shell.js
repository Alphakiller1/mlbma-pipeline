/**
 * Shared profile shell helpers — decision strip, analyst take, verdict cards.
 */
(function(global) {
  'use strict';

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function cleanGlyphs(s) {
    return String(s == null ? '' : s)
      .replace(/\uFFFD/g, '\u2014')
      .replace(/\u0097/g, '\u2014')
      .replace(/\u0096/g, '\u2013');
  }

  function decisionCard(label, value, hint, tone) {
    tone = tone || '';
    var toneCls = tone ? ' profile-decision-card--' + tone : '';
    return '<article class="profile-decision-card' + toneCls + '">'
      + '<span class="profile-decision-card__label">' + esc(label) + '</span>'
      + '<strong class="profile-decision-card__value">' + esc(cleanGlyphs(value)) + '</strong>'
      + (hint ? '<span class="profile-decision-card__hint">' + esc(cleanGlyphs(hint)) + '</span>' : '')
      + '</article>';
  }

  function decisionStrip(cards) {
    if (!cards || !cards.length) return '';
    return '<div class="profile-decision-strip" role="group" aria-label="Profile decision summary">'
      + cards.filter(Boolean).join('')
      + '</div>';
  }

  function verdictCard(label, value, detail, tone) {
    tone = tone || 'respect';
    return '<div class="profile-verdict-card profile-verdict-card--' + esc(tone) + '">'
      + '<div class="profile-verdict-card__label">' + esc(label) + '</div>'
      + '<div class="profile-verdict-card__value">' + esc(cleanGlyphs(value)) + '</div>'
      + (detail ? '<p class="profile-verdict-card__detail">' + esc(cleanGlyphs(detail)) + '</p>' : '')
      + '</div>';
  }

  function analystTakeLine(text) {
    if (!text) {
      return '<div class="profile-analyst-take"><div class="profile-analyst-take__label">Analyst Take</div>'
        + '<p class="profile-analyst-take__text ca-helper">Insufficient data for a concise read in this split.</p></div>';
    }
    return '<div class="profile-analyst-take"><div class="profile-analyst-take__label">Analyst Take</div>'
      + '<p class="profile-analyst-take__text">' + esc(cleanGlyphs(text)) + '</p></div>';
  }

  function toneFromScore(v, invert) {
    if (v == null || isNaN(v)) return '';
    if (invert) {
      if (v <= 45) return 'elite';
      if (v <= 55) return 'watch';
      return 'risk';
    }
    if (v >= 65) return 'elite';
    if (v >= 50) return 'watch';
    return 'risk';
  }

  global.ProfileShell = {
    esc: esc,
    cleanGlyphs: cleanGlyphs,
    decisionCard: decisionCard,
    decisionStrip: decisionStrip,
    verdictCard: verdictCard,
    analystTakeLine: analystTakeLine,
    toneFromScore: toneFromScore
  };
})(typeof window !== 'undefined' ? window : this);
