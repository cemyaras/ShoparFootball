/* Shared outcome descriptors. Keep attacking interception failure distinct from a defensive win. */
(() => {
  'use strict';
  function failure(title, text, sub, color, flight, delay = 1.35, sound) {
    return { success: false, stat: 'misses', title, banner: { text, sub, color, time: 2, max: 2 }, flight, delay, sound };
  }
  function ballWon(title, sub) {
    return { success: true, stat: 'tackles', title, effect: 'ballWon', sound: 'tap',
      banner: { text: title, sub, color: '#d0f69a', time: 1.4, max: 1.4 }, flight: title, delay: 2.1 };
  }
  const attack = {
    goal: { success: true, stat: 'goals', effect: 'goal', sound: 'goal', delay: 2.1,
      title: chip => chip ? 'Over the keeper!' : 'GOAL!',
      banner: chip => ({ text: 'GOAL!', sub: chip ? 'CHIPPED OVER THE KEEPER' : 'BELOW THE BAR. IN THE NET.', color: '#d0f69a', time: 2.4, max: 2.4 }),
      flight: chip => chip ? 'GOAL · OVER THE KEEPER, INTO THE NET' : 'GOAL · BELOW THE BAR, INTO THE NET',
      detail: chip => chip ? 'Your chip cleared the goalkeeper and crossed below the bar.' : 'The ball crossed the goal line between the posts and below the bar.' },
    save: { ...failure('Saved!', 'SAVED!', 'KEEPER DENIES!', '#ff5252', 'SAVED · THE KEEPER HAS IT', 1.35, 'save'), symbol: '⊘' },
    blocked: failure('Blocked!', 'BLOCKED!', 'DEFENDER STEPS IN', '#ff9800', 'BLOCKED BY THE DEFENDER'),
    intercepted: failure('Intercepted!', 'INTERCEPTED!', 'PASS CUT OUT', '#ff9800', 'PASS INTERCEPTED'),
    high: failure('Over the crossbar.', 'OVER THE BAR!', 'TOO MUCH LOFT', '#90caf9', 'OVER THE BAR · GOAL KICK', 2.4),
    wide: failure('Wide!', 'WIDE OF POST!', 'OFF TARGET', '#90caf9', 'WIDE · GOAL KICK', 2.4),
    weak: failure('Too weak!', 'TOO WEAK!', 'MORE POWER NEEDED', '#cfd8dc', 'THE BALL RUNS OUT OF PACE'),
    lost: failure('Chance missed!', 'CHANCE GONE!', 'TOO LATE', '#cfd8dc', 'CHANCE MISSED'),
    bar: failure('Crossbar!', 'CROSSBAR!', 'OFF THE FRAME, BACK OUT', '#ffb74d', 'CROSSBAR · THE BALL COMES BACK OUT'),
    post: failure('Off the post!', 'OFF THE POST!', 'THE BALL STAYS OUT', '#ffb74d', 'OFF THE POST · NO GOAL')
  };
  const tackle = {
    ball_won: ballWon('BALL WON!', 'CLEAN TACKLE'),
    missed_tackle: failure('MISSED TACKLE!', 'MISSED TACKLE!', 'POSITION · TIMING', '#ffb074', 'MISSED TACKLE!'),
    opponent_escaped: failure('OPPONENT ESCAPED!', 'OPPONENT ESCAPED!', 'CUT OFF THE RUN', '#ff8b79', 'OPPONENT ESCAPED!')
  };
  const cutPass = {
    pass_won: ballWon('INTERCEPTED!', 'PASS CUT OUT'),
    pass_through: failure('PASS GOT THROUGH!', 'PASS GOT THROUGH!', 'CLOSE THE LANE SOONER', '#ff8b79', 'PASS GOT THROUGH!')
  };
  window.ShoparFootball.OutcomeDefinitions = {
    attack, tackle, cutPass, all: { ...attack, ...tackle, ...cutPass },
    fallback: failure('The chance slips away.', 'CHANCE MISSED!', 'KEEP YOUR HEAD UP', '#f48fb1', undefined)
  };
})();
