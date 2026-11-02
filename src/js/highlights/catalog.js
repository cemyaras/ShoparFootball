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
    create: context => new window.ShoparFootball.DrawShotController(context)
  });
})();
