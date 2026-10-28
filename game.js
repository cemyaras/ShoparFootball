/* Shopar Football — dependency-free, procedural Canvas football.
   World units remain constant; pointer and renderer use the same viewport transform. */
(() => {
  'use strict';

  const State = Object.freeze({ TITLE:'TITLE', HIGHLIGHT_INTRO:'HIGHLIGHT_INTRO', AIMING:'AIMING', BALL_CONTACT:'BALL_CONTACT', BALL_IN_MOTION:'BALL_IN_MOTION', INTERCEPTION:'INTERCEPTION', RESULT:'RESULT', SESSION_SUMMARY:'SESSION_SUMMARY' });
  const W = 1000, H = 740;
  const FIELD = { left:76, right:924, top:84, bottom:684, goalLeft:400, goalRight:600, crossbar:44 };
  const CONTACT_TIME = 6;
  const $ = id => document.getElementById(id);
  const clamp = (v,a,b) => Math.max(a,Math.min(b,v));
  const lerp = (a,b,t) => a+(b-a)*t;
  const length = (x,y) => Math.hypot(x,y);
  const distance = (a,b) => length(a.x-b.x,a.y-b.y);
  const SCENARIOS = [
    { title:'One on one.', tag:'IN THE SPOTLIGHT', description:'Just you and the keeper. Pick your corner. Hold your nerve.', intro:'A great chance! You’re through on goal.', action:'SHOOT', player:[500,365], mates:[], defenders:[], tip:'Aim away from the keeper. A firm shot into a corner is hard to stop.' },
    { title:'From distance.', tag:'A LITTLE AMBITION', description:'Outside the box. A sliver of space. Give the keeper something to think about.', intro:'Space opens up outside the area. Have a go!', action:'SHOOT', player:[540,520], mates:[[735,345]], defenders:[[408,320],[657,268]], tip:'You’ll need power from here. Tap below the ball’s center for a little lift.' },
    { title:'The through ball.', tag:'SEE IT BEFORE THEY DO', description:'Your teammate is on the move. Find the space, then find the finish.', intro:'A runner breaks free on the left. Lead the pass!', action:'PASS', player:[600,476], mates:[[340,390]], defenders:[[516,308],[730,278]], tip:'Pass toward the mint run marker. Your teammate will chase the ball, then you can shoot.' },
    { title:'Two against two.', tag:'BETTER TOGETHER', description:'Two shirts ahead of you. A teammate to your right. Find your way through.', intro:'Two against two. Combine, or back yourself.', action:'PASS', player:[379,425], mates:[[680,350]], defenders:[[464,300],[590,263]], tip:'A ground pass across to your teammate can open a better angle. Or take the shot.' },
    { title:'Read the game.', tag:'RIGHT PLACE. RIGHT TIME.', description:'The ball is on its way. Read the pass, get there, and make it yours.', intro:'An incoming pass! Tap the marked space to meet it.', action:'SHOOT', player:[485,428], mates:[[200,320]], defenders:[[737,292]], tip:'Tap ahead of the moving ball, near the mint ring. You move automatically.' }
  ];

  class AudioSystem {
    constructor(){ this.enabled=false; this.context=null; }
    toggle(){
      this.enabled=!this.enabled;
      if(this.enabled){
        try { this.context ||= new (window.AudioContext || window.webkitAudioContext)(); this.context.resume().catch(()=>{}); } catch { this.enabled=false; }
      }
      $('sound-button').setAttribute('aria-pressed',String(this.enabled));
      $('sound-button').setAttribute('aria-label',this.enabled?'Mute sound':'Enable sound');
      $('sound-waves').setAttribute('d',this.enabled?'M15 8c3 2 3 6 0 8m3-11c5 4 5 10 0 14':'m16 9 5 6m0-6-5 6');
      if(this.enabled) this.play('tap');
    }
    play(kind){
      if(!this.enabled || !this.context) return;
      const ctx=this.context, now=ctx.currentTime;
      const notes=kind==='goal'?[440,554,659,880]:kind==='kick'?[140,75]:kind==='save'?[220,110]:[520];
      notes.forEach((frequency,i)=>{
        const osc=ctx.createOscillator(), gain=ctx.createGain(), at=now+i*.09;
        osc.type=kind==='kick'?'triangle':'sine'; osc.frequency.setValueAtTime(frequency,at);
        gain.gain.setValueAtTime(.0001,at); gain.gain.exponentialRampToValueAtTime(kind==='kick'?.14:.065,at+.012); gain.gain.exponentialRampToValueAtTime(.0001,at+.18);
        osc.connect(gain); gain.connect(ctx.destination); osc.start(at); osc.stop(at+.2);
      });
    }
  }

  class FootballGame {
    constructor(){
      this.canvas=$('game'); this.ctx=this.canvas.getContext('2d'); this.audio=new AudioSystem();
      this.state=State.TITLE; this.stateTime=0; this.time=0; this.index=0; this.mode='SHOOT';
      this.stats={goals:0,passes:0,misses:0,receives:0}; this.outcomes=[];
      this.pointer=null; this.aim=null; this.kick=null; this.contact=null;
      this.particles=[]; this.trail=[]; this.ripples=[]; this.toastTime=0; this.shake=0; this.flash=0;
      this.view={scale:1,x:0,y:0,width:1000,height:740}; this.lastTime=null;
      this.reducedMotion=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      this.handlers=[]; this.loadActors(0); this.bindEvents(); this.resize(); this.updateUI();
      this.resizeObserver=new ResizeObserver(()=>this.resize()); this.resizeObserver.observe($('canvas-wrap'));
      this.frame=this.frame.bind(this); this.raf=requestAnimationFrame(this.frame);
    }
    listen(target,type,handler,options){ target.addEventListener(type,handler,options); this.handlers.push(()=>target.removeEventListener(type,handler,options)); }
    bindEvents(){
      this.listen(this.canvas,'pointerdown',e=>this.onPointerDown(e));
      this.listen(this.canvas,'pointermove',e=>this.onPointerMove(e));
      this.listen(this.canvas,'pointerup',e=>this.onPointerUp(e));
      this.listen(this.canvas,'pointercancel',e=>this.cancelPointer(e.pointerId));
      this.listen(this.canvas,'lostpointercapture',e=>{if(this.pointer?.id===e.pointerId) this.cancelPointer(e.pointerId);});
      this.listen(this.canvas,'contextmenu',e=>e.preventDefault());
      this.listen($('play-button'),'click',()=>this.startSession());
      this.listen($('again-button'),'click',()=>this.startSession());
      this.listen($('next-button'),'click',()=>this.nextHighlight());
      this.listen($('restart-button'),'click',()=>{if(![State.TITLE,State.SESSION_SUMMARY].includes(this.state)) this.restart();});
      this.listen($('shoot-button'),'click',()=>this.selectMode('SHOOT'));
      this.listen($('pass-button'),'click',()=>this.selectMode('PASS'));
      this.listen($('sound-button'),'click',()=>this.audio.toggle());
      this.listen(window,'resize',()=>this.resize());
      this.listen(window,'blur',()=>this.cancelPointer(this.pointer?.id));
      this.listen(document,'visibilitychange',()=>{this.lastTime=null;if(document.hidden) this.cancelPointer(this.pointer?.id);});
    }
    destroy(){ this.handlers.forEach(remove=>remove()); this.resizeObserver.disconnect(); cancelAnimationFrame(this.raf); this.audio.context?.close(); }
    resize(){
      const rect=this.canvas.getBoundingClientRect(), dpr=Math.min(window.devicePixelRatio||1,3);
      this.canvas.width=Math.round(rect.width*dpr); this.canvas.height=Math.round(rect.height*dpr);
      this.dpr=dpr;
      const scale=Math.min(rect.width/W,rect.height/H);
      this.view={width:rect.width,height:rect.height,scale,x:(rect.width-W*scale)/2,y:(rect.height-H*scale)/2};
    }
    toWorld(e){ const r=this.canvas.getBoundingClientRect(),v=this.view; return {x:(e.clientX-r.left-v.x)/v.scale,y:(e.clientY-r.top-v.y)/v.scale}; }
    maxDrag(){ return clamp(100/this.view.scale,160,280); }
    contactGeometry(){ return {x:500,y:405,r:clamp(82/this.view.scale,115,215)}; }
    makePlayer(x,y,team,number){return {x,y,startX:x,startY:y,tx:x,ty:y,team,number,step:0,celebration:0};}
    loadActors(index){
      const s=SCENARIOS[index];
      this.player=this.makePlayer(...s.player,'blue',9); this.controlled=this.player;
      this.mates=s.mates.map((p,i)=>this.makePlayer(...p,'blue',7+i*4));
      this.defenders=s.defenders.map((p,i)=>this.makePlayer(...p,'red',4+i));
      this.keeper={...this.makePlayer(500,112,'keeper',1),reaction:.25,dive:0,diveCooldown:0,targetX:500};
      this.ball={x:this.player.x,y:this.player.y-17,z:0,vx:0,vy:0,vz:0,spin:0,rotation:0,age:0};
      this.trail=[]; this.particles=[]; this.ripples=[]; this.pointer=null; this.aim=null; this.contact=null; this.kick=null;
      this.pendingResult=null;
      this.interceptTarget=null; this.interceptSuggested={x:500,y:320}; this.passCount=0; this.motionTime=0; this.shake=0;
      this.scenarioSnapshot={...this.stats}; this.mode=s.action;
    }
    transition(next){
      this.cancelPointer(this.pointer?.id); this.state=next; this.stateTime=0;
      document.body.classList.toggle('is-playing',next!==State.TITLE);
      $('title-overlay').classList.toggle('hidden',next!==State.TITLE);
      $('result-overlay').classList.toggle('hidden',next!==State.RESULT);
      $('summary-overlay').classList.toggle('hidden',next!==State.SESSION_SUMMARY);
      $('contact-heading').classList.toggle('hidden',next!==State.BALL_CONTACT);
      $('contact-footer').classList.toggle('hidden',next!==State.BALL_CONTACT);
      this.updateUI();
    }
    startSession(){
      if(![State.TITLE,State.SESSION_SUMMARY].includes(this.state)) return;
      this.stats={goals:0,passes:0,misses:0,receives:0}; this.outcomes=[]; this.index=0; this.beginHighlight(); this.audio.play('tap');
    }
    beginHighlight(){
      this.loadActors(this.index); this.transition(State.HIGHLIGHT_INTRO);
      this.toast(SCENARIOS[this.index].intro,2.8);
    }
    restart(){
      this.stats={...this.scenarioSnapshot}; this.outcomes[this.index]=undefined; this.beginHighlight();
    }
    nextHighlight(){
      if(this.state!==State.RESULT) return;
      if(this.index===4){this.showSummary();return;}
      this.index++; this.beginHighlight();
    }
    selectMode(mode){
      if(this.state!==State.AIMING || this.pointer) return;
      this.mode=mode; this.aim=null; this.updatePower(0); this.updateUI(); this.audio.play('tap');
    }
    updateUI(){
      const s=SCENARIOS[this.index], enabled=this.state===State.AIMING;
      $('score').textContent=this.stats.goals;
      $('chapter-number').innerHTML=`${String(this.index+1).padStart(2,'0')} <span>/ 05</span>`;
      $('scenario-title').textContent=s.title; $('scenario-tag').textContent=s.tag; $('scenario-description').textContent=s.description;
      $('shoot-button').classList.toggle('selected',this.mode==='SHOOT'); $('pass-button').classList.toggle('selected',this.mode==='PASS');
      for(const mode of ['SHOOT','PASS']){const button=$(mode.toLowerCase()+'-button');button.disabled=!enabled;button.setAttribute('aria-pressed',String(this.mode===mode));}
      $('restart-button').disabled=[State.TITLE,State.SESSION_SUMMARY].includes(this.state);
      const status={TITLE:'READY WHEN YOU ARE',HIGHLIGHT_INTRO:'A MOMENT OF POSSIBILITY',AIMING:'YOUR BALL. YOUR CALL.',BALL_CONTACT:'FIND YOUR TOUCH',BALL_IN_MOTION:'WATCH IT UNFOLD',INTERCEPTION:'READ THE PASS',RESULT:'MOMENT COMPLETE',SESSION_SUMMARY:'THAT’S FULL TIME'};
      $('match-status').textContent=status[this.state];
      $('pitch-label').textContent=this.state===State.TITLE?'YOUR NEXT BIG MOMENT':`HIGHLIGHT ${String(this.index+1).padStart(2,'0')} / ${s.title.toUpperCase().replace('.','')}`;
      $('phase-label').textContent=this.state===State.BALL_CONTACT?'02 — STRIKE':this.state===State.INTERCEPTION?'01 — MEET IT':this.state===State.BALL_IN_MOTION?'03 — IN PLAY':'01 — AIM';
      let coachTitle='Pull back. Let fly.',coachCopy='Drag back from the ball to aim. Release, then tap the big ball to add your finishing touch.',icon='↙';
      if(this.state===State.BALL_CONTACT){coachTitle='It’s all in the contact.';coachCopy='Center for a straight ball. Left or right for curve. Below center for loft. You have six seconds.';icon='◎';}
      else if(this.state===State.INTERCEPTION){coachTitle='Be there before the ball.';coachCopy=SCENARIOS[4].tip;icon='⌖';}
      else if(this.state===State.BALL_IN_MOTION){coachTitle=this.mode==='PASS'?'Find your teammate.':'Let the ball do the talking.';coachCopy='Watch the play unfold. Possession returns to you when a teammate receives your pass.';icon='↗';}
      else if(this.state===State.RESULT){coachTitle='Another moment awaits.';coachCopy='Keep going, or restart this highlight to try a different approach.';icon='→';}
      else if(this.state===State.AIMING){coachCopy=s.tip;}
      $('coach-title').textContent=coachTitle; $('coach-copy').textContent=coachCopy; $('coach-icon').textContent=icon;
      $('bottom-hint').textContent=this.state===State.INTERCEPTION?'Tap the pitch to meet the incoming pass.':this.state===State.AIMING?'Drag back from the ball. Release to choose your contact.':this.state===State.BALL_CONTACT?'Your touch changes everything.':'A little instinct goes a long way.';
      if(this.state===State.BALL_IN_MOTION && this.contact){
        const curve=this.contact.x<-.15?'Rightward curve':this.contact.x>.15?'Leftward curve':'Straight contact';
        const flight=this.contact.y>.25?'lofted flight':this.contact.y<-.2?'low flight':'clean strike';
        $('bottom-hint').textContent=`${curve} · ${flight}`;
      }
      [...$('chapter-progress').children].forEach((el,i)=>{el.className=i===this.index?'current':i<this.index?'done':'';});
      [...$('scenario-list').children].forEach((el,i)=>{el.className='moment'+(i===this.index?' active':'')+(this.outcomes[i]===true?' complete':this.outcomes[i]===false?' failed':'');el.querySelector('i').textContent=this.outcomes[i]===true?'✓':this.outcomes[i]===false?'×':i===this.index?'↗':'·';});
    }
    updatePower(power){$('power-fill').style.width=`${Math.round(power*100)}%`;$('power-value').textContent=power?`${Math.round(power*100)}%`:'—';}
    toast(message,seconds=2.2){$('toast').textContent=message;$('toast').classList.remove('hidden');this.toastTime=seconds;}
    onPointerDown(e){
      if(e.button!==0 || this.pointer || e.isPrimary===false) return;
      const p=this.toWorld(e);
      if(this.state===State.TITLE){this.startSession();return;}
      if(this.state===State.INTERCEPTION){
        e.preventDefault(); this.interceptTarget={x:clamp(p.x,FIELD.left+12,FIELD.right-12),y:clamp(p.y,FIELD.top+25,FIELD.bottom-20)};
        this.ripples.push({...this.interceptTarget,age:0});this.audio.play('tap');return;
      }
      if(this.state===State.AIMING){
        if(distance(p,this.ball)>Math.max(72,35/this.view.scale)){this.toast('Start your drag near the glowing ball.',1.8);return;}
        e.preventDefault();this.pointer={id:e.pointerId,start:p,last:p};this.aim={dx:0,dy:-1,power:0,distance:0};this.canvas.setPointerCapture(e.pointerId);this.toastTime=0;
      } else if(this.state===State.BALL_CONTACT && !this.contact){
        e.preventDefault();this.pointer={id:e.pointerId,start:p,last:p};this.canvas.setPointerCapture(e.pointerId);
      }
    }
    onPointerMove(e){
      if(!this.pointer || e.pointerId!==this.pointer.id) return;
      e.preventDefault();this.pointer.last=this.toWorld(e);
      if(this.state===State.AIMING){
        const dx=this.pointer.start.x-this.pointer.last.x,dy=this.pointer.start.y-this.pointer.last.y,d=length(dx,dy);
        this.aim={dx:d>0?dx/d:0,dy:d>0?dy/d:-1,power:clamp(d/this.maxDrag(),0,1),distance:d};this.updatePower(this.aim.power);
      }
    }
    onPointerUp(e){
      if(!this.pointer || e.pointerId!==this.pointer.id) return;
      e.preventDefault();const p=this.toWorld(e),aim=this.aim;
      if(this.state===State.AIMING){
        this.onPointerMove(e);
        const finalAim=this.aim;
        this.releasePointer();
        if(!finalAim || finalAim.distance<Math.max(13,7/this.view.scale)){this.aim=null;this.updatePower(0);return;}
        this.kick={dx:finalAim.dx,dy:finalAim.dy,power:Math.max(.16,finalAim.power),mode:this.mode};
        this.aim=null; this.transition(State.BALL_CONTACT); this.audio.play('tap');
      } else if(this.state===State.BALL_CONTACT){
        this.releasePointer();const g=this.contactGeometry();
        if(distance(p,g)<=g.r){this.chooseContact((p.x-g.x)/g.r,(p.y-g.y)/g.r,false);}
        else this.toast('Tap inside the ball to strike it.',1.4);
      } else {this.releasePointer();this.aim=aim;}
    }
    releasePointer(){const p=this.pointer;this.pointer=null;if(p && this.canvas.hasPointerCapture(p.id)) this.canvas.releasePointerCapture(p.id);}
    cancelPointer(id){if(this.pointer && id===this.pointer.id){this.releasePointer();if(this.state===State.AIMING){this.aim=null;this.updatePower(0);}}}
    chooseContact(x,y,timedOut){
      if(this.state!==State.BALL_CONTACT || this.contact) return;
      this.contact={x:clamp(x,-1,1),y:clamp(y,-1,1),timedOut,age:0};this.audio.play('tap');
      if(timedOut) this.toast('Late contact — a little less power and accuracy.',2);
    }
    // The same velocity/height/spin model drives both live kicks and the aim preview.
    kickVelocity(kick,contact){
      const r=length(contact.x,contact.y),edge=Math.max(0,r-.78),accuracy=contact.timedOut?.15:edge*.18;
      const angle=Math.atan2(kick.dy,kick.dx)+(contact.timedOut?.12:contact.x*accuracy);
      const speed=(kick.mode==='SHOOT'?220+kick.power*530:155+kick.power*370)*(1-edge*.2)*(contact.timedOut?.68:1);
      return {vx:Math.cos(angle)*speed,vy:Math.sin(angle)*speed,vz:Math.max(0,(kick.mode==='SHOOT'?62:22)+contact.y*(kick.mode==='SHOOT'?245:175)),spin:-contact.x*.82};
    }
    executeKick(){
      if(!this.kick || !this.contact) return;
      Object.assign(this.ball,this.kickVelocity(this.kick,this.contact),{age:0,z:0});
      this.ball.x=this.controlled.x;this.ball.y=this.controlled.y-17;
      this.motionTime=0;this.trail=[];this.keeper.reaction=.24;this.keeper.dive=0;this.keeper.diveCooldown=0;
      this.mode=this.kick.mode;this.kicker=this.controlled;this.audio.play('kick');
      this.shake=this.mode==='SHOOT'&&this.kick.power>.78&&!this.reducedMotion?5:0;
      this.transition(State.BALL_IN_MOTION);
    }
    startInterception(){
      Object.assign(this.ball,{x:200,y:320,z:0,vx:215,vy:0,vz:0,spin:0,age:0});
      this.controlled=this.player;this.interceptTarget=null;this.motionTime=0;this.transition(State.INTERCEPTION);
      this.toast('Tap the mint ring to meet the pass.',2.3);
    }
    receive(player,offBall=false){
      this.controlled=player;this.ball.x=player.x;this.ball.y=player.y-17;
      Object.assign(this.ball,{z:0,vx:0,vy:0,vz:0,spin:0});this.trail=[];this.aim=null;this.contact=null;this.kick=null;
      if(offBall) this.stats.receives++; else {this.stats.passes++;this.passCount++;}
      this.mode='SHOOT';this.transition(State.AIMING);this.updatePower(0);this.audio.play('tap');
      this.toast(offBall?'Beautifully read. Now find the finish.':'Pass complete. You control the receiver — take your shot!',2.8);
    }
    finish(kind,detail){
      if([State.RESULT,State.SESSION_SUMMARY].includes(this.state)) return;
      const success=kind==='goal';this.outcomes[this.index]=success;
      if(success){this.stats.goals++;this.audio.play('goal');this.celebrate();this.flash=.2;}
      else {this.stats.misses++;if(kind==='save')this.audio.play('save');}
      const titles={goal:'A little bit of magic.',save:'The keeper had answers.',blocked:'No way through.',intercepted:'They read the pass.',wide:'Just off the mark.',high:'A little too ambitious.',weak:'Needed a little more.',lost:'A moment too late.'};
      $('result-title').textContent=titles[kind]||'The chance slips away.';
      $('result-symbol').textContent=success?'↗':kind==='save'?'⊘':'↘';
      $('result-symbol').style.color=success?'var(--mint)':'#f4ae8f';
      $('result-kicker').textContent=success?'GOAL / THAT’S YOUR MOMENT':kind==='save'?'SAVED / TRY A DIFFERENT CORNER':'CHANCE MISSED / KEEP YOUR HEAD UP';
      $('result-detail').textContent=detail;
      $('next-button').innerHTML=this.index===4?'See your performance <span>→</span>':'Next highlight <span>→</span>';
      // Leave the action visible before bringing up the result card.
      this.pendingResult={kind,wait:success?1.25:.95};this.aim=null;this.updateUI();
    }
    celebrate(){
      for(let i=0;i<65;i++) this.particles.push({x:lerp(365,635,Math.random()),y:90,vx:(Math.random()-.5)*250,vy:80+Math.random()*210,life:1.5+Math.random(),max:2.5,color:['#d0f69a','#f8e0a0','#6cc0f5','#f4f4dd'][i%4],size:3+Math.random()*4});
      this.player.celebration=2.5;this.mates.forEach(p=>p.celebration=2.5);
    }
    showSummary(){
      const score=clamp(Math.round(this.stats.goals*16+Math.min(this.stats.passes,3)*4+this.stats.receives*8),0,100);
      $('rating').textContent=score;$('total-goals').textContent=this.stats.goals;$('total-passes').textContent=this.stats.passes;$('total-misses').textContent=this.stats.misses;
      $('summary-title').textContent=score>=75?'You made it beautiful.':score>=40?'Some moments of magic.':'The next moment is yours.';
      $('summary-detail').textContent=score>=75?'Vision, touch, and a little nerve. A performance to remember.':'Every chance teaches you something. Go again and find your touch.';
      this.toastTime=0;this.transition(State.SESSION_SUMMARY);
    }
    frame(timestamp){
      const dt=this.lastTime===null?0:Math.min((timestamp-this.lastTime)/1000,.05);this.lastTime=timestamp;
      this.update(dt);this.render();this.raf=requestAnimationFrame(this.frame);
    }
    update(dt){
      this.time+=dt;this.stateTime+=dt;
      if(this.toastTime>0){this.toastTime-=dt;if(this.toastTime<=0)$('toast').classList.add('hidden');}
      else $('toast').classList.add('hidden');
      this.shake=Math.max(0,this.shake-dt*16);this.flash=Math.max(0,this.flash-dt);
      this.particles=this.particles.filter(p=>{p.life-=dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=180*dt;return p.life>0;});
      this.ripples=this.ripples.filter(p=>(p.age+=dt)<1);
      for(const p of [this.player,...this.mates])p.celebration=Math.max(0,p.celebration-dt);
      if(this.pendingResult){
        this.pendingResult.wait-=dt;
        if(this.pendingResult.kind==='goal'){
          this.ball.y+=this.ball.vy*dt*.2;this.ball.x+=this.ball.vx*dt*.2;this.ball.y=Math.max(57,this.ball.y);this.ball.vy*=Math.exp(-dt*5);this.ball.vx*=Math.exp(-dt*5);
        }
        if(this.pendingResult.wait<=0){this.pendingResult=null;this.transition(State.RESULT);}return;
      }
      if(this.state===State.HIGHLIGHT_INTRO && this.stateTime>.85){
        if(this.index===4)this.startInterception();else {this.transition(State.AIMING);this.updatePower(0);}
      } else if(this.state===State.BALL_CONTACT){
        $('contact-timer-fill').style.width=`${Math.max(0,1-this.stateTime/CONTACT_TIME)*100}%`;
        if(this.contact){this.contact.age+=dt;if(this.contact.age>.23)this.executeKick();}
        else if(this.stateTime>=CONTACT_TIME)this.chooseContact(.32,.15,true);
      } else if(this.state===State.BALL_IN_MOTION || this.state===State.INTERCEPTION){
        this.motionTime+=dt;
        const steps=Math.max(1,Math.ceil(dt/(1/120))),step=dt/steps;
        for(let i=0;i<steps&&!this.pendingResult;i++){
          if(![State.BALL_IN_MOTION,State.INTERCEPTION].includes(this.state))break;
          if(this.state===State.INTERCEPTION)this.updateInterception(step);else this.updateMotion(step);
        }
      }
    }
    integrateBall(ball,dt,pass=false){
      const speed=length(ball.vx,ball.vy),spin=ball.spin;
      const ax=-ball.vy*spin*.80,ay=ball.vx*spin*.80;
      ball.vx+=ax*dt;ball.vy+=ay*dt;
      const friction=ball.z>1?.10:pass?.74:.49;
      const decay=Math.exp(-friction*dt);ball.vx*=decay;ball.vy*=decay;
      ball.x+=ball.vx*dt;ball.y+=ball.vy*dt;
      if(ball.z>0 || ball.vz>0){ball.vz-=260*dt;ball.z+=ball.vz*dt;if(ball.z<0){ball.z=0;ball.vz=Math.abs(ball.vz)>65?-ball.vz*.23:0;}}
      ball.spin*=Math.exp(-dt*.23);ball.rotation+=speed*dt*.045+spin*dt*4;ball.age+=dt;
    }
    movePlayer(p,tx,ty,speed,dt){
      const dx=tx-p.x,dy=ty-p.y,d=length(dx,dy),move=Math.min(d,speed*dt);
      if(d>.1){p.x+=dx/d*move;p.y+=dy/d*move;p.step+=move*.085;}p.tx=tx;p.ty=ty;
    }
    updateKeeper(dt){
      const k=this.keeper,b=this.ball;k.reaction-=dt;k.diveCooldown=Math.max(0,k.diveCooldown-dt);
      if(k.reaction>0)return;
      // Reaction follows the current ball with limited anticipation, never the planned aim.
      k.targetX=clamp(b.x+(b.vy<0?b.vx*.08:0),FIELD.goalLeft+18,FIELD.goalRight-18);
      const danger=b.y<255 && b.vy<-50;
      if(danger && !k.diveCooldown && Math.abs(b.x-k.x)>22){k.dive=.42;k.diveCooldown=1.1;k.diveDirection=Math.sign(b.x-k.x);}
      k.dive=Math.max(0,k.dive-dt);
      this.movePlayer(k,k.targetX,112,k.dive>0?185:105,dt);
    }
    updateAI(dt){
      this.updateKeeper(dt);const b=this.ball;
      for(const d of this.defenders){
        const react=b.age>.18,near=distance(d,b)<210;
        const tx=react&&near?b.x+b.vx*.13:d.startX,ty=react&&near?b.y+b.vy*.13:d.startY;
        this.movePlayer(d,clamp(tx,100,900),clamp(ty,132,630),react&&near?84:22,dt);
      }
      if(this.mode==='PASS'){
        let receiver=null,best=Infinity;
        for(const p of [this.player,...this.mates]){
          if(p===this.kicker)continue;
          const score=distance(p,{x:b.x+b.vx*.38,y:b.y+b.vy*.38});
          if(score<best){best=score;receiver=p;}
        }
        for(const p of [this.player,...this.mates]){
          if(p===this.kicker)continue;
          if(p===receiver && best<365){
            // Run onto a pass and attack its landing point, including a lofted through ball.
            const lookAhead=clamp(distance(p,b)/260,.08,.5);
            this.movePlayer(p,clamp(b.x+b.vx*lookAhead,100,900),clamp(b.y+b.vy*lookAhead,135,650),132,dt);
          } else this.movePlayer(p,p.startX,p.startY-28,65,dt);
        }
      }else for(const p of this.mates){if(p!==this.controlled)this.movePlayer(p,p.startX,p.startY-35,55,dt);}
    }
    updateMotion(dt){
      this.updateAI(dt);const b=this.ball,previous={x:b.x,y:b.y,z:b.z};this.integrateBall(b,dt,this.mode==='PASS');
      if(b.age>.035){this.trail.push({x:b.x,y:b.y,z:b.z,age:0});if(this.trail.length>70)this.trail.shift();}
      this.trail.forEach(t=>t.age+=dt);
      if(previous.y>=FIELD.top && b.y<FIELD.top){
        const t=(previous.y-FIELD.top)/(previous.y-b.y),x=lerp(previous.x,b.x,t),z=lerp(previous.z,b.z,t);
        if(x>FIELD.goalLeft+5 && x<FIELD.goalRight-5 && z<FIELD.crossbar){this.finish('goal',this.mode==='PASS'?'Your pass found the net. Sometimes instinct is everything.':Math.abs(this.contact?.x||0)>.2?'A touch of curve. A perfectly placed finish.':'Picked your spot and made it count. Beautifully done.');}
        else this.finish(z>=FIELD.crossbar&&x>FIELD.goalLeft&&x<FIELD.goalRight?'high':'wide',z>=FIELD.crossbar?'Over the bar. Try a little less loft on the contact.':'Wide of the goal. Aim inside the posts and keep the contact clean.');
        return;
      }
      if(b.x<FIELD.left || b.x>FIELD.right || b.y>FIELD.bottom){this.finish('wide','Out of play. A little less power or curve may keep the next one in.');return;}
      if(b.age>.12 && b.z<37){
        const k=this.keeper,radius=k.dive>0?32:23;
        if(length(b.x-k.x,b.y-(k.y-7))<radius){
          this.ball.vx=0;this.ball.vy=0;this.ball.vz=0;k.dive=.65;
          this.finish('save','The keeper gets behind it. Try a firmer strike toward either corner.');return;
        }
      }
      if(b.age>.14 && b.z<26){
        for(const d of this.defenders)if(length(b.x-d.x,b.y-(d.y-7))<22){this.ball.vx*=.12;this.ball.vy*=.12;this.finish(this.mode==='PASS'?'intercepted':'blocked',this.mode==='PASS'?'A defender stepped into the passing lane. Look for the open teammate.':'A red shirt gets in the way. A pass or a little loft could open the angle.');return;}
      }
      if(this.mode==='PASS' && b.age>.16 && b.z<24){
        for(const p of [this.player,...this.mates])if(p!==this.kicker && distance(p,b)<31){
          if(this.passCount>=3){this.mode='SHOOT';this.toast('Time to finish. Take your shot!',2);}this.receive(p);return;
        }
      }
      if((length(b.vx,b.vy)<38 && b.z<3 && b.age>.7) || this.motionTime>6){
        this.finish('weak',this.mode==='PASS'?'The pass ran out of room. Aim closer to your teammate and use a firm touch.':'The ball runs out of pace. Pull back farther to add power.');
      }
    }
    updateInterception(dt){
      const b=this.ball;b.age+=dt;b.x+=b.vx*dt;b.rotation+=dt*6;
      this.trail.push({x:b.x,y:b.y,z:0,age:0});if(this.trail.length>40)this.trail.shift();this.trail.forEach(t=>t.age+=dt);
      if(this.interceptTarget)this.movePlayer(this.player,this.interceptTarget.x,this.interceptTarget.y,168,dt);
      for(const d of this.defenders)if(b.x>565)this.movePlayer(d,b.x,b.y,75,dt);
      if(distance(this.player,b)<29){this.receive(this.player,true);return;}
      for(const d of this.defenders)if(distance(d,b)<24){this.finish('intercepted','The defender got there first. Next time, meet the pass earlier.');return;}
      if(b.x>890 || this.motionTime>4.2)this.finish('lost','The pass slipped past. Tap the mint ring early and let your player meet the ball.');
    }

    // Rendering has no gameplay side effects.
    render(){
      const c=this.ctx,v=this.view;
      c.setTransform(this.dpr,0,0,this.dpr,0,0);c.fillStyle='#2e5642';c.fillRect(0,0,v.width,v.height);
      c.save();c.translate(v.x,v.y);c.scale(v.scale,v.scale);
      if(this.shake>0)c.translate(Math.sin(this.time*86)*this.shake,Math.cos(this.time*73)*this.shake*.55);
      this.drawPitch(c);this.drawRunMarkers(c);
      if(this.state===State.AIMING && this.aim?.power>.03)this.drawAim(c);
      this.drawTrail(c);
      const actors=[this.player,...this.mates,...this.defenders,this.keeper].sort((a,b)=>a.y-b.y);
      actors.forEach(p=>this.drawPlayer(c,p));this.drawBall(c,this.ball);
      this.drawGoalFront(c);
      for(const r of this.ripples){c.strokeStyle=`rgba(207,246,155,${1-r.age})`;c.lineWidth=2;c.beginPath();c.arc(r.x,r.y,16+r.age*25,0,Math.PI*2);c.stroke();}
      for(const p of this.particles){c.save();c.globalAlpha=Math.min(1,p.life);c.fillStyle=p.color;c.translate(p.x,p.y);c.rotate(p.life*4);c.fillRect(-p.size/2,-p.size/2,p.size,p.size*.6);c.restore();}
      if(this.state===State.AIMING && !this.aim)this.drawPossessionHint(c);
      if(this.state===State.BALL_CONTACT)this.drawContact(c);
      if(this.flash>0&&!this.reducedMotion){c.fillStyle=`rgba(228,255,178,${this.flash*.35})`;c.fillRect(0,0,W,H);}
      c.restore();
    }
    drawPitch(c){
      c.fillStyle='#2e5642';c.fillRect(-1000,-1000,3000,3000);
      // Soft stadium surrounds and original procedural advertising boards.
      c.fillStyle='#263e34';c.fillRect(36,39,928,668);
      c.fillStyle='#233d31';c.fillRect(60,60,880,640);
      for(let i=0;i<10;i++){c.fillStyle=i%2?'#396d4c':'#356646';c.fillRect(FIELD.left,FIELD.top+i*60,848,60);}
      const shade=c.createLinearGradient(0,84,1000,684);shade.addColorStop(0,'#a1ca4710');shade.addColorStop(.5,'#12351a00');shade.addColorStop(1,'#112f1c28');c.fillStyle=shade;c.fillRect(76,84,848,600);
      // Deterministic grass grain: no external textures or per-frame random flicker.
      c.fillStyle='#daf2ab0b';for(let i=0;i<180;i++){const x=83+(i*137)%830,y=90+(i*97)%585;c.fillRect(x,y,2,5);}
      c.strokeStyle='#e3edd288';c.lineWidth=2.2;c.strokeRect(76,84,848,600);
      c.strokeRect(280,84,440,180);c.strokeRect(386,84,228,68);
      c.beginPath();c.arc(500,210,88,.65,Math.PI-.65);c.stroke();
      c.beginPath();c.arc(500,210,3,0,Math.PI*2);c.fillStyle='#e3edd2a0';c.fill();
      c.beginPath();c.moveTo(76,619);c.lineTo(924,619);c.stroke();c.beginPath();c.arc(500,619,95,0,Math.PI*2);c.stroke();
      c.beginPath();c.arc(500,619,3,0,Math.PI*2);c.fill();
      for(const x of [76,924]){c.beginPath();c.arc(x,84,14,x===76?0:Math.PI/2,x===76?Math.PI/2:Math.PI);c.stroke();}
      // Goal depth and netting sit behind the players and ball.
      c.fillStyle='#172e27';c.fillRect(400,47,200,37);c.strokeStyle='#a5bca46b';c.lineWidth=1;
      for(let x=400;x<=600;x+=10){c.beginPath();c.moveTo(x,47);c.lineTo(x,84);c.stroke();}
      for(let y=47;y<85;y+=9){c.beginPath();c.moveTo(400,y);c.lineTo(600,y);c.stroke();}
      c.strokeStyle='#ebf1d7bd';c.lineWidth=3;c.strokeRect(400,47,200,37);
      c.save();c.font='700 9px Arial';c.textAlign='center';c.letterSpacing='3px';c.fillStyle='#a9bea17a';c.fillText('S H O P A R   F O O T B A L L   C L U B',500,32);c.restore();
      c.save();c.translate(49,392);c.rotate(-Math.PI/2);c.fillStyle='#b5d29455';c.font='700 10px Arial';c.textAlign='center';c.fillText('M A K E   I T   C O U N T',0,0);c.restore();
      c.save();c.translate(953,392);c.rotate(Math.PI/2);c.fillStyle='#b5d29455';c.font='700 10px Arial';c.textAlign='center';c.fillText('T H E   B E A U T I F U L   G A M E',0,0);c.restore();
      // Small corner flags.
      for(const x of [76,924]){c.strokeStyle='#c5cba9';c.lineWidth=2;c.beginPath();c.moveTo(x,81);c.lineTo(x,62);c.stroke();c.fillStyle='#d5ec9f';c.beginPath();c.moveTo(x,62);c.lineTo(x+12,65);c.lineTo(x,70);c.fill();}
    }
    drawGoalFront(c){
      c.strokeStyle='#f0f2dc';c.lineWidth=4;c.lineCap='round';c.beginPath();c.moveTo(400,84);c.lineTo(400,48);c.lineTo(600,48);c.lineTo(600,84);c.stroke();
      c.strokeStyle='#eef5df88';c.lineWidth=2;c.beginPath();c.moveTo(400,84);c.lineTo(600,84);c.stroke();c.lineCap='butt';
    }
    drawRunMarkers(c){
      if([State.TITLE,State.BALL_CONTACT,State.RESULT,State.SESSION_SUMMARY].includes(this.state))return;
      if(this.state===State.INTERCEPTION){
        const t=this.interceptSuggested;c.save();c.strokeStyle='#d2f59ac0';c.lineWidth=2;c.setLineDash([6,7]);
        c.beginPath();c.moveTo(this.ball.x,this.ball.y);c.lineTo(850,320);c.stroke();c.setLineDash([]);
        c.beginPath();c.arc(t.x,t.y,29+Math.sin(this.time*4)*4,0,Math.PI*2);c.stroke();c.fillStyle='#d2f59a1c';c.fill();
        c.fillStyle='#e2f2ce';c.font='bold 12px Arial';c.textAlign='center';c.fillText('MEET THE PASS',t.x,t.y-45);
        if(this.interceptTarget){c.strokeStyle='#d4f7a177';c.setLineDash([4,5]);c.beginPath();c.moveTo(this.player.x,this.player.y);c.lineTo(this.interceptTarget.x,this.interceptTarget.y);c.stroke();}
        c.restore();
      } else if(this.mode==='PASS' && this.state===State.AIMING){
        for(const p of [this.player,...this.mates])if(p!==this.controlled){
          const tx=this.index===2?p.x-22:p.x,ty=this.index===2?p.y-67:p.y-14;
          c.save();c.strokeStyle='#c9f39199';c.lineWidth=2;c.setLineDash([4,6]);c.beginPath();c.arc(tx,ty,29,0,Math.PI*2);c.stroke();c.setLineDash([]);
          if(this.index===2){c.beginPath();c.moveTo(p.x,p.y-22);c.lineTo(tx,ty+18);c.stroke();}
          c.fillStyle='#ddf4c8';c.font='bold 10px Arial';c.textAlign='center';c.fillText('INTO SPACE',tx,ty-42);c.restore();
        }
      }
    }
    drawPlayer(c,p){
      const isControlled=p===this.controlled && ![State.TITLE,State.BALL_CONTACT].includes(this.state),moving=[State.BALL_IN_MOTION,State.INTERCEPTION].includes(this.state);
      c.save();c.translate(p.x,p.y);
      if(isControlled){c.strokeStyle='#d1f79dcc';c.lineWidth=2;c.beginPath();c.ellipse(0,2,24,17,0,0,Math.PI*2);c.stroke();c.fillStyle='#c9f39118';c.fill();}
      c.fillStyle='#122a2a55';c.beginPath();c.ellipse(4,8,15,8,0,0,Math.PI*2);c.fill();
      if(p.celebration>0)c.translate(0,-Math.abs(Math.sin(p.celebration*9))*8);
      if(p.team==='keeper'&&p.dive>0)c.rotate((p.diveDirection||1)*-.75);
      const stride=moving?Math.sin(p.step)*4:0;
      // Legs, boots, sleeves, and shirt numbers retain a readable silhouette at small sizes.
      c.strokeStyle=p.team==='blue'?'#dbe6db':p.team==='red'?'#272f39':'#253833';c.lineWidth=5;c.lineCap='round';c.beginPath();c.moveTo(-5,2);c.lineTo(-6,10+stride);c.moveTo(5,2);c.lineTo(6,10-stride);c.stroke();
      c.strokeStyle='#142820';c.lineWidth=4;c.beginPath();c.moveTo(-6,11+stride);c.lineTo(-3,11+stride);c.moveTo(6,11-stride);c.lineTo(9,11-stride);c.stroke();
      const shirt=p.team==='blue'?'#5cb4f2':p.team==='red'?'#f17a70':'#edcd6c';
      c.strokeStyle=shirt;c.lineWidth=7;c.beginPath();c.moveTo(-8,-9);c.lineTo(-14,p.celebration>0?-22:p.team==='keeper'&&p.dive>0?-18:-2);c.moveTo(8,-9);c.lineTo(14,p.celebration>0?-22:p.team==='keeper'&&p.dive>0?-18:-2);c.stroke();
      c.fillStyle=p.team==='blue'?'#28658c':p.team==='red'?'#b04745':'#ad8a3f';c.fillRect(-8,-3,16,8);
      c.fillStyle=shirt;c.beginPath();c.roundRect(-10,-16,20,17,5);c.fill();
      c.fillStyle='#faf7e2d9';c.font='bold 8px Arial';c.textAlign='center';c.fillText(String(p.number),0,-5);
      c.fillStyle='#dcb58b';c.beginPath();c.arc(0,-20,6.7,0,Math.PI*2);c.fill();c.fillStyle='#322f2b';c.beginPath();c.arc(0,-22,6.3,Math.PI,Math.PI*2);c.fill();
      if(p.team==='keeper'){c.fillStyle='#eff0db';c.beginPath();c.arc(-14,p.dive>0?-18:-2,4,0,Math.PI*2);c.arc(14,p.dive>0?-18:-2,4,0,Math.PI*2);c.fill();}
      if(isControlled){c.fillStyle='#d1f79d';c.beginPath();c.moveTo(0,-45);c.lineTo(-5,-53);c.lineTo(5,-53);c.fill();}
      c.restore();
    }
    drawBall(c,b){
      const r=clamp(5.7/this.view.scale,8,13),height=b.z*.48;
      c.save();c.fillStyle=`rgba(9,30,16,${.36/(1+b.z*.014)})`;c.beginPath();c.ellipse(b.x+3,b.y+4,r*(1+b.z*.005),r*.48,0,0,Math.PI*2);c.fill();
      if(b.z>12){c.strokeStyle='#e7f0c833';c.lineWidth=1;c.setLineDash([3,4]);c.beginPath();c.moveTo(b.x,b.y);c.lineTo(b.x,b.y-height);c.stroke();c.setLineDash([]);}
      c.translate(b.x,b.y-height);c.rotate(b.rotation);
      c.shadowColor='#10281c77';c.shadowBlur=4;c.fillStyle='#fbf9df';c.beginPath();c.arc(0,0,r,0,Math.PI*2);c.fill();c.shadowBlur=0;
      c.fillStyle='#263a37';this.polygon(c,0,0,r*.39,5,-Math.PI/2);c.fill();
      for(let i=0;i<5;i++){const a=i*Math.PI*2/5;c.beginPath();c.arc(Math.cos(a)*r*.87,Math.sin(a)*r*.87,r*.23,0,Math.PI*2);c.fill();}
      c.restore();
    }
    polygon(c,x,y,r,sides,rotation=0){c.beginPath();for(let i=0;i<sides;i++){const a=rotation+i*Math.PI*2/sides;i?c.lineTo(x+Math.cos(a)*r,y+Math.sin(a)*r):c.moveTo(x+Math.cos(a)*r,y+Math.sin(a)*r);}c.closePath();}
    drawTrail(c){
      if(this.trail.length<2)return;
      c.save();c.lineCap='round';
      for(let i=1;i<this.trail.length;i++){
        const a=this.trail[i-1],b=this.trail[i],alpha=(i/this.trail.length)*.35*Math.max(0,1-b.age/1.4);
        c.strokeStyle=`rgba(${this.mode==='PASS'?'177,225,239':'228,245,171'},${alpha})`;c.lineWidth=2+i/this.trail.length*4;
        c.beginPath();c.moveTo(a.x,a.y-a.z*.48);c.lineTo(b.x,b.y-b.z*.48);c.stroke();
      }c.restore();
    }
    drawAim(c){
      const a=this.aim,preview={...this.ball,...this.kickVelocity({dx:a.dx,dy:a.dy,power:Math.max(.16,a.power),mode:this.mode},{x:0,y:0,timedOut:false})};
      c.save();c.strokeStyle='#def6acbb';c.lineWidth=2;c.setLineDash([5,8]);c.beginPath();c.moveTo(preview.x,preview.y);
      let end=preview;
      for(let i=0;i<38;i++){this.integrateBall(preview,.034,this.mode==='PASS');c.lineTo(preview.x,preview.y-preview.z*.48);end={...preview};if(preview.y<84||preview.x<76||preview.x>924)break;}
      c.stroke();c.setLineDash([]);c.fillStyle='#d1f79d';this.polygon(c,end.x,end.y-end.z*.48,6,3,Math.atan2(end.vy,end.vx));c.fill();
      // The rubber band points backwards; the dotted line points along the kick.
      const pull=Math.min(a.distance,this.maxDrag());c.strokeStyle='#d6f3a366';c.lineWidth=4;c.beginPath();c.moveTo(this.ball.x,this.ball.y);c.lineTo(this.ball.x-a.dx*pull,this.ball.y-a.dy*pull);c.stroke();
      c.strokeStyle='#d6f3a3cc';c.lineWidth=3;c.beginPath();c.arc(this.ball.x,this.ball.y,25,0,Math.PI*2*a.power);c.stroke();
      const label=`${Math.round(a.power*100)}%`;c.font='bold 13px Arial';c.textAlign='center';c.fillStyle='#ecf8d9';c.fillText(label,this.ball.x-a.dx*pull,this.ball.y-a.dy*pull+28);c.restore();
    }
    drawPossessionHint(c){
      const b=this.ball,pulse=1+Math.sin(this.time*3)*.08;
      c.save();c.strokeStyle='#d9f7a744';c.lineWidth=1.5;c.beginPath();c.arc(b.x,b.y,35*pulse,0,Math.PI*2);c.stroke();
      c.font='bold 10px Arial';c.textAlign='center';c.fillStyle='#e3f4c9';c.fillText('DRAG BACK TO AIM',b.x,b.y+57);
      c.strokeStyle='#d4efad88';c.lineWidth=1.5;c.beginPath();c.moveTo(b.x,b.y+69);c.lineTo(b.x,b.y+86);c.lineTo(b.x-4,b.y+82);c.moveTo(b.x,b.y+86);c.lineTo(b.x+4,b.y+82);c.stroke();c.restore();
    }
    drawContact(c){
      // A short push in, then a full-screen contact canvas, with a forgiving single tap.
      const g=this.contactGeometry(),appear=this.reducedMotion?1:clamp(this.stateTime/.18,0,1),r=g.r*(.88+appear*.12);
      c.save();c.fillStyle=`rgba(12,30,24,${.93*appear})`;c.fillRect(-1000,-1000,3000,3000);
      c.translate(g.x,g.y);
      c.strokeStyle='#c9f39125';c.lineWidth=1;c.beginPath();c.arc(0,0,r+18,0,Math.PI*2);c.stroke();
      c.fillStyle='#03191166';c.beginPath();c.ellipse(8,r+24,r*.85,16,0,0,Math.PI*2);c.fill();
      const gradient=c.createRadialGradient(-r*.35,-r*.45,2,0,0,r);gradient.addColorStop(0,'#fffef1');gradient.addColorStop(.65,'#ecefdc');gradient.addColorStop(1,'#a4b49d');
      c.beginPath();c.arc(0,0,r,0,Math.PI*2);c.fillStyle=gradient;c.fill();c.save();c.clip();
      c.fillStyle='#23372f';this.polygon(c,0,0,r*.29,5,-Math.PI/2);c.fill();
      for(let i=0;i<5;i++){
        const a=-Math.PI/2+i*Math.PI*2/5,x=Math.cos(a)*r*.85,y=Math.sin(a)*r*.85;
        this.polygon(c,x,y,r*.24,5,a+Math.PI);c.fill();c.strokeStyle='#687b6755';c.lineWidth=2;
        c.beginPath();c.moveTo(Math.cos(a)*r*.29,Math.sin(a)*r*.29);c.lineTo(x-Math.cos(a)*r*.22,y-Math.sin(a)*r*.22);c.stroke();
      }
      c.restore();c.strokeStyle='#c6d2bb';c.lineWidth=2;c.beginPath();c.arc(0,0,r,0,Math.PI*2);c.stroke();
      c.strokeStyle='#bdcfb466';c.lineWidth=1;c.setLineDash([4,6]);c.beginPath();c.moveTo(-r*.76,0);c.lineTo(r*.76,0);c.moveTo(0,-r*.76);c.lineTo(0,r*.76);c.stroke();c.setLineDash([]);
      c.font='bold 10px Arial';c.fillStyle='#c8dbb6';c.textAlign='center';
      if(this.view.scale>.45){c.fillText('CURVE →',-r-63,5);c.fillText('← CURVE',r+63,5);c.fillText('LOFT',0,r+65);}
      if(this.contact){
        const x=this.contact.x*r,y=this.contact.y*r;c.fillStyle='#cbf594aa';c.beginPath();c.arc(x,y,14+this.contact.age*22,0,Math.PI*2);c.fill();c.strokeStyle='#efffd9';c.lineWidth=2;c.beginPath();c.arc(x,y,9,0,Math.PI*2);c.stroke();
      }c.restore();
    }
  }

  window.footballGame=new FootballGame();
})();
