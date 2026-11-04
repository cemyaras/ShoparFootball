/* Independent highlights in playing order. */
(() => {
  'use strict';
  const registry = window.ShoparFootball.Highlights;
  const outcomes = window.ShoparFootball.OutcomeDefinitions;

  registry.register({ id: 'one-on-one', category: 'attack', keeperEligible: true, create: context => new window.ShoparFootball.AttackController(context), outcomes: outcomes.attack, title: 'One on one.', tag: 'IN THE SPOTLIGHT', description: 'Just you and the keeper. Pick your corner. Hold your nerve.', intro: 'A great chance! You’re through on goal.', player: [500, 365], mates: [], defenders: [], tip: 'Aim away from the keeper. A firm shot into a corner is hard to stop.' });
  registry.register({ id: 'from-distance', category: 'attack', keeperEligible: true, create: context => new window.ShoparFootball.AttackController(context), outcomes: outcomes.attack, title: 'From distance.', tag: 'A LITTLE AMBITION', description: 'Outside the box. A sliver of space. Give the keeper something to think about.', intro: 'Space opens up outside the area. Have a go!', player: [540, 520], mates: [[735, 345]], defenders: [[408, 320], [657, 268]], tip: 'You’ll need power from here. Tap below the ball’s center for a little lift.' });
  registry.register({ id: 'through-ball', category: 'attack', keeperEligible: true, create: context => new window.ShoparFootball.AttackController(context), outcomes: outcomes.attack, runMarker: 'through', title: 'The through ball.', tag: 'SEE IT BEFORE THEY DO', description: 'Your teammate is on the move. Find the space, then find the finish.', intro: 'A runner breaks free on the left. Lead the pass!', player: [600, 476], mates: [[340, 390]], defenders: [[516, 308], [730, 278]], tip: 'Pass toward the mint run marker. Your teammate will chase the ball, then you can shoot.' });
  registry.register({ id: 'two-against-two', category: 'attack', keeperEligible: true, create: context => new window.ShoparFootball.AttackController(context), outcomes: outcomes.attack, title: 'Two against two.', tag: 'BETTER TOGETHER', description: 'Two shirts ahead of you. A teammate to your right. Find your way through.', intro: 'Two against two. Combine, or back yourself.', player: [379, 425], mates: [[680, 350]], defenders: [[464, 300], [590, 263]], tip: 'A ground pass across to your teammate can open a better angle. Or take the shot.' });
  registry.register({ id: 'read-the-game', category: 'attack', keeperEligible: true, create: context => new window.ShoparFootball.ReceptionController(context), outcomes: outcomes.attack, cameraExtraX: [180, 865], title: 'Read the game.', tag: 'RIGHT PLACE. RIGHT TIME.', description: 'The ball is on its way. Read the pass, get there, and make it yours.', intro: 'An incoming pass! Tap the marked space to meet it.', player: [485, 428], mates: [[200, 320]], defenders: [[737, 292]], tip: 'Tap ahead of the moving ball, near the mint ring. You move automatically.' });
  registry.register({ id: 'win-the-ball', category: 'defense', keeperEligible: false, create: context => new window.ShoparFootball.WinBallController(context), outcomes: outcomes.tackle, title: 'Win the Ball', kind: 'defense', player: [370, 520], mates: [], defenders: [[535, 350]] });
  registry.register({ id: 'cut-the-pass', category: 'defense', keeperEligible: false, create: context => new window.ShoparFootball.CutPassController(context), outcomes: outcomes.cutPass, title: 'Cut the Pass', kind: 'pass_defense', player: [550, 530], mates: [], defenders: [[340, 350], [760, 370]] });
  registry.register({ id: 'save-the-penalty', category: 'defense', keeperEligible: false, title: 'Save the Penalty', player: [500, 400], mates: [], defenders: [[500, 250]], outcomes: outcomes.penalty, create: context => new window.ShoparFootball.PenaltySaveController(context) });
  registry.register({ id: 'save-the-shot', category: 'defense', keeperEligible: false, title: 'Save the Shot', player: [500, 440], mates: [], defenders: [[440, 350]], outcomes: outcomes.shot, create: context => new window.ShoparFootball.PenaltySaveController(context, true) });
  registry.register({ id: 'take-the-penalty', category: 'attack', keeperEligible: false, title: 'Take the Penalty', tag: 'FROM THE SPOT', description: 'You and the keeper. Make it count.', intro: 'A penalty for SFC. Pick your corner.', player: [500, 250], mates: [], defenders: [], tip: 'Place your shot away from the keeper.', outcomes: outcomes.attack, create: context => new window.ShoparFootball.AttackController(context) });
  registry.register({
    id: 'draw-the-shot', title: 'Draw the Shot', category: 'attack', practiceOnly: true, keeperEligible: false,
    player: [500, 365], mates: [], defenders: [[530, 235]],
    outcomes: { ...outcomes.attack,
      save: { ...outcomes.attack.save, detail: 'The keeper reached your shot. Try a curve toward the far corner.' },
      blocked: { ...outcomes.attack.blocked, detail: 'A defender reached your shot. Draw a path around the defender.' },
      weak: { ...outcomes.attack.weak, detail: 'The ball ran out of pace. Draw a longer path toward goal.' } },
    intro: 'Draw to a height in goal. CHIP adds a lob.', tip: 'Draw from the ball, finish higher for height, or turn CHIP on before drawing a lob.',
    create: context => window.ShoparFootball.DrawShotController.create(context)
  });
  registry.register({
    id: 'precision-pass', title: 'Precision Pass', category: 'attack', practiceOnly: true, keeperEligible: false,
    player: [350, 560], mates: [[650, 450], [440, 300]], defenders: [[500, 380], [580, 320]],
    create: context => window.ShoparFootball.PrecisionPassController.create(context),
    outcomes: {
      pass_complete: { success: true, stat: 'passes', title: 'PASS COMPLETE!', detail: 'Your teammate reached and controlled the moving ball.', sound: 'tap', delay: 1.5,
        banner: { text: 'PASS COMPLETE!', sub: 'DIRECTION · TIMING · POWER', color: '#d0f69a', time: 1.5, max: 1.5 }, flight: 'PASS COMPLETE' },
      pass_intercepted: { ...outcomes.attack.intercepted, detail: 'A defender reached the passing lane first. Look for another angle or lead the run.' },
      pass_short: { ...outcomes.attack.weak, title: 'PASS TOO SHORT', detail: 'The ball lost pace before reaching your target. Hold longer for a longer pass.',
        banner: { text: 'PASS TOO SHORT', sub: 'HOLD FOR MORE POWER', color: '#cfd8dc', time: 1.6, max: 1.6 }, flight: 'PASS TOO SHORT' },
      pass_missed: { ...outcomes.attack.wide, title: 'PASS MISSED', detail: 'The receiver could not control the pass. Try less power, a better direction or earlier timing.',
        banner: { text: 'PASS MISSED', sub: 'TIMING · DIRECTION · PACE', color: '#90caf9', time: 1.6, max: 1.6 }, flight: 'PASS MISSED' }
    }
  });
})();
