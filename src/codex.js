// The glossary, and the record of what has been seen.
//
// Entries unlock the first time you destroy one — the boss included — and the
// record survives a reset, because it was never yours: it is kept by whoever
// has been counting. Descriptions are field notes in the same voice as the
// story: flat, observed, second person where it helps, never a tutorial.

import { ANOMALIES } from './anomaly.js';
import { soak } from './ledger.js';

const KEY = 'sim7749-codex';

/*
 * Two categories, and the split is derived rather than written down.
 *
 * ANOMALIES.types is each boss's own roster -- the boss first, then what it
 * makes -- so `ANOMALY_IDS` is the authority on which entries belong to a
 * boss and the glossary cannot drift from the fights. Everything else is the
 * field: what comes down on its own, and what those break into.
 */
/** Every entry, in the order they are shown. `id` matches the object type. */
export const CODEX = [
  {
    id: 'mote',
    name: 'MOTE',
    line: 'Barely present. One round moves it further than it can move itself.',
  },
  {
    id: 'needle',
    name: 'NEEDLE',
    line: 'The quick one. Thin enough that arriving is the only thing it does well.',
  },
  {
    id: 'lurcher',
    name: 'LURCHER',
    line: 'Shoves itself forward in bursts and coasts between them. Heavy enough that a bolt is a suggestion.',
  },
  {
    id: 'splitter',
    name: 'SPLITTER',
    line: 'Comes apart into four, and the four carry on where it was going.',
  },
  {
    id: 'bloom',
    name: 'BLOOM',
    line: 'Its death is the point. Keep nothing beside it that you wanted.',
  },
  {
    id: 'bulwark',
    name: 'BULWARK',
    line: 'Armoured past the point of interest. Push it into something instead.',
  },
  {
    id: 'warden',
    name: 'WARDEN',
    line: 'Three plates orbit it and eat what you send. Take them first, or take them anyway.',
  },
  {
    id: 'plate',
    name: 'PLATE',
    line: 'A piece of a WARDEN with nothing left to guard. Whatever is still on the core when it goes comes at you.',
  },
  {
    id: 'prism',
    name: 'PRISM',
    line: 'Turns a glancing shot into somebody else’s problem. Hit it square, or aim the ricochet.',
  },
  {
    id: 'herald',
    name: 'HERALD',
    line: 'Covers what stands near it, and shows you it is doing so. The covering stops when it does.',
  },
  {
    id: 'glut',
    name: 'GLUT',
    line: 'Eats what you leave lying about. Every fragment on the floor is a decision you already made.',
  },
  {
    id: 'tow',
    name: 'TOW',
    line: 'Drags a weight on a cable. The weight does not steer, and it does not need to.',
  },
  {
    id: 'ordinal',
    name: 'ORDINAL',
    line: 'It has been counting since before you arrived. The frame is the count; the thing in the middle is what has been keeping it.',
  },
  {
    id: 'tally',
    name: 'TALLY',
    line: 'One segment of the count. Five strokes, and it goes out on the fifth.',
  },
  {
    id: 'digit',
    name: 'DIGIT',
    line: 'Garrisoned, not built in. It was only ever waiting for a door.',
  },
  {
    id: 'gnomon',
    name: 'GNOMON',
    line: 'It does not count you, it times you. The dial is the hour; the needle throws the shadow; the shadow is the only wall it ever really had.',
  },
  {
    id: 'dial',
    name: 'DIAL',
    line: 'One arc of the face. The hours cut into it go out as it does.',
  },
  {
    id: 'second',
    name: 'SECOND',
    line: 'It waited behind an hour for the hour to break. Nothing about the dial governs it now.',
  },
  {
    id: 'fractal',
    name: 'FRACTAL',
    line: 'It does not have parts, it has generations. Break one and you have not removed anything — you have let it go.',
  },
  {
    id: 'fraction',
    name: 'FRACTION',
    line: 'The middle of three. Armour on one side, and on the other, three things that were only ever waiting to be loose.',
  },
  {
    id: 'mite',
    name: 'MITE',
    line: 'The smallest part it believes in, which is not the same as the smallest part there is.',
  },
  {
    id: 'amplitude',
    name: 'AMPLITUDE',
    line: 'It has no middle. It is a period, and the head is only the part of it that arrives first.',
  },
  {
    id: 'crest',
    name: 'CREST',
    line: 'One segment of the wave. Break enough of them and what is left swings higher — it leans in as it loses.',
  },
  {
    id: 'droplet',
    name: 'DROPLET',
    line: 'Thrown off the top of the wave, from the part of it furthest from you.',
  },
  {
    id: 'dynamo',
    name: 'DYNAMO',
    line: 'It is never anywhere for long. While the circuit is closed it is armoured by its own legs; take those away and it stops needing the ground.',
  },
  {
    id: 'pylon',
    name: 'PYLON',
    line: 'One leg of the circuit. What it carries is not power, it is cover.',
  },
  {
    id: 'ion',
    name: 'ION',
    line: 'It travels the wire before it travels the field. You can see where it will be long before it is there.',
  },
  {
    id: 'parity',
    name: 'PARITY',
    line: 'Two halves of one account, and only ever one of them is real. Which one is a question it answers on a clock.',
  },
  {
    id: 'pane',
    name: 'PANE',
    line: 'A face of the mirror. It has a twin, and they go together — which is generous, and is paying for something.',
  },
  {
    id: 'echo',
    name: 'ECHO',
    line: 'There is always another one of these. Looking for it is how you find out which side of the line you are on.',
  },
  /*
   * TERMINUS and its two. They were missing entirely -- the seventh boss and
   * the only two things it puts on the field had no entries at all, which
   * nothing noticed while the glossary was one undivided list of thirty-four.
   * Splitting it into the field and the anomalies made a boss-shaped hole
   * obvious at once.
   */
  {
    id: 'terminus',
    name: 'TERMINUS',
    line: 'The last of them, and the only one that never throws anything. It closes instead: the room gets smaller until there is no room.',
  },
  {
    id: 'bound',
    name: 'BOUND',
    line: 'One segment of the boundary. The ring it belongs to is closed, so the only way through it is out.',
  },
  {
    id: 'limit',
    name: 'LIMIT',
    line: 'It comes in off a corner of the frame and walks. Nothing sent it; it was always going to arrive.',
  },
  {
    id: 'towMass',
    name: 'MASS',
    line: 'The far end of a cable. It arrives by being swung, and it arrives regardless.',
  },
  {
    id: 'scion',
    name: 'SCION',
    line: 'Worth more to the field dead than alive. What it throws goes looking for something to join.',
  },
  {
    id: 'seed',
    name: 'SEED',
    line: 'Harmless on its own, and it is not on its own for long. It rides whatever it reaches and closes that body\'s wounds — up to three of them at once. Shoot it in the air, or shoot it off afterwards.',
  },
  {
    id: 'drift',
    name: 'DRIFT',
    /*
     * ---- both figures in this line were wrong, and had been for a while ---
     *
     * It said "Worth 10 ENERGY against a MOTE's 4". `CFG.energy.drift` -- the
     * flat amount a harmless body is paid, and it IS flat, `bank()` takes it
     * instead of the mass worth -- has been 6, not 10; and a MOTE's "4" was
     * its `drops`, which is the NUMBER of motes it sheds and not what they
     * are worth. Measured off the config: a DRIFT pays 6.00 kB and a MOTE
     * 2.64 kB from its own mass. Rather than write two fresh numbers that can
     * go stale the same way, the line states the RATIO, which is what the
     * sentence was always about.
     */
    line: 'No heading, no destination, no threat. It is not counted, and AUTO AIM will not take it — a DRIFT is only ever shot on purpose. It is worth more than twice a MOTE, which is the reason to bother.',
  },
  {
    id: 'ember',
    name: 'EMBER',
    // The ratio, not a figure: `drops` and what a mote is worth both come off
    // the config, and DRIFT's line cost a build for quoting two numbers that
    // had gone stale. What the sentence is about is that it is leaving.
    line: 'Comes up off the floor instead of down out of the portal, and climbs for the rim with a little salvage in it. Not counted, not a threat, and gone in a few seconds with whatever it was carrying.',
  },
  {
    id: 'husk',
    name: 'HUSK',
    /*
     * ---- "the largest single payout" was FALSE and shipped in build 307 ----
     *
     * docs/objects.html says it and this line repeated it. Measured off the
     * code: a harmless body pays `drops` motes at the `minValue` floor plus
     * the flat `CFG.energy.drift`, so a HUSK is 12 + 6 = 18 kB -- against a
     * BULWARK's 112 kB and a boss core's 264 to 792. It is the largest among
     * the HARMLESS bodies, and only until LANTERN's 22 kB. Same fault as
     * DRIFT's old "worth 10 ENERGY against a MOTE's 4": a figure quoted in
     * prose rots, so the sentence states the comparison it was always about.
     */
    line: 'A wreck of something this simulation ran before, thrown across the field end over end. It wants nothing and it is leaving. Nothing else you can ignore is worth as much.',
  },
  {
    id: 'lantern',
    name: 'LANTERN',
    // No figure: what it is carrying is `drops`, and what that is worth moves
    // with the config. The sentence is the clock and the bill.
    line: 'Caged salvage on its way back out through the portal, climbing for the rim on a clock you can watch. It will not touch you and it does not have to: reach the rim and it takes the lot with it. The one harmless body worth a magazine.',
  },
  {
    id: 'filament',
    name: 'FILAMENT',
    line: 'Seven beads nose to tail, each following the one in front. It wants nothing from you and blocks nothing. Cut it anywhere and you have two shorter snakes, both still going, and the shape of what is left is different every time.',
  },
  {
    id: 'bell',
    name: 'BELL',
    line: 'Hangs in the middle band and bobs, and wants nothing. Break it and for a couple of seconds every object on the field shows you where it is going -- through a corrupted feed, which is exactly when you need it. One round, one harmless kill, and the only shot you take to see better rather than to break something.',
  },
  {
    id: 'spindle',
    name: 'SPINDLE',
    line: 'A bar turning end over end as it comes, and the only thing on the field that is not the same size from every angle. Broadside it is the widest target you will meet; edge-on it is thinner than a NEEDLE, and a round goes past it. Automatic fire will spend about half of itself on the edge. A thumb does not have to.',
  },
  {
    id: 'shoal',
    name: 'SHOAL',
    line: 'Fourteen at once, with no leader and nothing to break. They steer at each other and at you, so the school turns as one thing and closes whatever gap you make in it. A bolt takes one of fourteen; anything with a radius takes the school. It is the field telling you that aiming is not always the answer.',
  },
  {
    id: 'flint',
    name: 'FLINT',
    /*
     * Every counter here is MEASURED, against a 111-point blast and a
     * 100-point round on a flint facing the turret: a blast on the near face
     * 49.9, laid off to one side 111, a round head on 45, across the flank
     * 100, with no direction at all 100, and SPINE's shred 100.
     *
     * The first draft of this line named "ground it walks over" and
     * "something that goes off behind it", and both were wrong in the same
     * way. A mine is triggered at `m.r + trigger + e.r` -- 55 units -- so it
     * always goes off while the body is still up-field of it, which is to say
     * ON the plate: the more squarely the body walks over it, the less it
     * does. And a blast genuinely behind the body is full damage but cannot
     * be AIMED there, because every blast in the arsenal is sited toward the
     * turret -- HE and AIRBURST burst at the contact on the near face, PULSE
     * is radial from the machine, DECOY's parting blast sits between the two.
     * WELL is the only one that can land up-field and the player does not
     * choose where it goes.
     *
     * So the line names the three that a player can actually reach, and says
     * the mine thing as the trap it is rather than as the answer.
     *
     * Also deliberately does NOT name an emplacement off to one side, which
     * is the fourth answer `docs/objects.html` gives: this game has had no
     * emplacements since CFG.gun.inPlay went false at build 289, and a codex
     * line that names a system the player cannot reach is worse than a
     * shorter one. See the FLINT block in config.js.
     *
     * ...AND IT THEN NAMED ONE, IN THE SAME SENTENCE, ONE PARAGRAPH LATER.
     * `CFG.mines.inPlay` has been false since build 289 as well, so "a mine
     * it walks squarely over" was a counter out of a system with no door --
     * and the measured finding behind it, that a mine is triggered up-field
     * of the body and therefore always lands on the plate, is worth keeping
     * HERE and not in a line offering it as an answer. Corrected in build
     * 323, together with SHRIKE's, which was the same fault from build 317.
     * A rule written down is not a rule applied: the paragraph above was the
     * whole of the reasoning and it did not reach the two words beside it.
     */
    line: 'A wedge with a plate across one face, and it turns to keep that face toward the barrel. Head on it is the hardest small thing you will meet; from any other angle it is nothing at all. Which means anything arriving from where the gun stands arrives on the plate, whatever it is. What ignores the plate outright is a chain that jumps to it, ground already burning under it, and SPINE.',
  },
  {
    id: 'shrike',
    name: 'SHRIKE',
    /*
     * The mine is gone from this line and the reason is FLINT's, above:
     * `CFG.mines.inPlay` has been false since build 289, so the one counter
     * this sentence offered came out of a system with no door. What replaces
     * it is the telegraph itself, which is real and measured -- build 318's
     * `diveHeld` is seconds spent IN the lane before committing, and it
     * bleeds rather than resetting precisely so that the hold is long enough
     * to be read.
     */
    line: 'Holds height across the top, picks a line, and runs down the edge of the machine far faster than it walks -- then overshoots to the floor and climbs back out to do it again. It is only quick on the way down. Kill it on the climb: it holds on the line it means to use long enough to show you which one it is.',
  },
  {
    id: 'yoke',
    name: 'YOKE',
    line: 'Two halves on a rigid beam, sharing one pool of health between them. Damage anywhere drains the same number, so focusing one half buys you nothing -- but land half the pool on one and it comes off the beam, and the other keeps every point that is left, unencumbered and half again as fast. Take them together with something that reaches both.',
  },
  {
    id: 'latch',
    name: 'LATCH',
    /*
     * Every counter here is MEASURED, which is build 319's rule and the
     * reason that build had to rewrite FLINT's line: a counter named in prose
     * is a promise, and FLINT's named two answers that were worse than
     * useless. See the LATCH block in config.js for the rest of the numbers.
     *
     * A full ring of three on a BLOOM, six seconds of auto-fire, the host
     * healed every frame so only the balls can be what came off -- three
     * trials each:
     *
     *   BOLT      3 -> 0, 3 -> 1, 3 -> 0
     *   SCATTER   3 -> 0 every time
     *   HE        3 -> 0 every time
     *   one blast (4 x 110 at r 120)  3 -> 0 every time
     *   SPINE     3 -> 3, 3 -> 1, 3 -> 3
     *   ARC       3 -> 3 every time
     *
     * So the FIRST draft of this line was wrong in the same direction FLINT's
     * was. It said the gun would not pick the tick for you -- true of
     * `autoTarget`, which chooses bodies -- and left the player to infer that
     * ordinary fire is no use, when a round aimed at the host crosses the
     * ring at 1.45r on its way in and clears it in about six seconds. And
     * `docs/objects.html` names "SPINE's splinters" as an answer, which is
     * the one round measured here that is not: its splinters are born at the
     * exit and go outward from there, past a ring the round has already
     * crossed. What genuinely cannot touch a ball is ARC, because a chain
     * jumps between BODIES and `hitGraft` is not on that path at all -- which
     * is worth a sentence, because it is a trap rather than an absence.
     *
     * The line quotes no figure. "Closes wounds half again as fast as a SEED"
     * follows `rides.regen` (14 against 9 = 1.56x) and stays true through a
     * tuning pass; "14 a second" would not, which is the fix DRIFT's line
     * needed when both of its numbers turned out to be wrong.
     */
    line: 'It is not coming for you. It runs at the biggest body on the field and rides it, and while it is aboard that body turns away more of every hit and closes its wounds half again as fast as a SEED does -- three at once and you are shooting something that mends faster than you are breaking it. The ring is the cheap target, and rounds meant for the body cross it on the way in, so ordinary fire does clear it; one blast takes the whole ring at once. What will not touch it is a chain: ARC jumps between bodies, and a ball is not one.',
  },
  {
    id: 'chaff',
    name: 'CHAFF',
    /*
     * Every counter here is MEASURED, which is build 319's rule -- and this
     * line is where that rule caught something in the two lines above it.
     *
     * The counters, in the order the sentence names them:
     *
     *  - A round PASSES THROUGH a copy. Measured: fired at one it went 939
     *    units past it for 0 damage, where the same shot at a BULWARK stopped
     *    74 units short of its centre for 17.2. A copy is not in
     *    `world.enemies` and `updateProjectiles` is the only thing that can
     *    stop a round.
     *  - A BLAST does not find one. Measured: a 1000-point blast at 90 units
     *    delivered 0 to a copy and 992.8 to a MOTE in the same place.
     *    `applyBlast` walks the body list too, which is what makes PULSE the
     *    honest answer: it is radial from the machine, so it never picks a
     *    target at all.
     *  - AUTO AIM off cannot be fooled, and that is not a threshold:
     *    `Game.autoTarget` is the ONLY place in src/ that reads the copies,
     *    called from one site behind `w.autoAim`. Measured, 0 locked frames
     *    of 300 with copies standing on all 300 of them.
     *
     * The figure the line does quote is a SHARE and it is conditioned on the
     * count, because that is what it depends on: three chaff and three
     * LURCHERs over 330 frames, six runs, gave 0.280-0.358 of locked frames
     * and 0.250-0.375 of rounds fired, against EXACTLY ZERO with the lock
     * inheritance switched off. It would move if `CFG.shooter.aimStick` or
     * `CFG.chaff.ghost` moved, which is a narrower exposure than a figure off
     * a config constant and is the reason it is a third rather than 0.32.
     *
     * What the line deliberately does NOT name is a mine -- `CFG.mines.inPlay`
     * has been false since build 289, and build 319 wrote a whole paragraph
     * about not naming a system the player cannot reach and then named one.
     * See FLINT's and SHRIKE's lines, both corrected in this build.
     */
    line: 'It does not walk. It sits still, then crosses a hundred units sideways faster than anything else on the field -- and every jump leaves a copy of itself standing where it was for a second and a half. The copies are nothing: rounds pass straight through them and a blast does not find them. AUTO AIM cannot tell, and hands the lock to the copy at the moment of the jump -- with three of them up it spends about a third of its rounds on things that are not there. Aim it yourself, or answer it with something that never picks a target: PULSE goes off in a circle round the machine and there is nothing there to fool.',
  },
  {
    id: 'remnant',
    name: 'REMNANT',
    /*
     * Every figure in this line is measured or is a config constant, and the
     * line's whole job is to be the correction to the object guide that
     * `CFG.remnant` sets out at length. The guide's own counter -- "the second
     * arrival is the one to be standing ready for" -- is FALSE and is not
     * repeated here: measured at the rungs band 5 is played on with the whole
     * tree bought, the first body takes 0.70-0.80s to kill and the re-formed
     * one 0.53-0.58s, almost all of which is the round's flight time. It
     * arrives at half a dead body's health onto a field carrying 30-58 bodies.
     * So the second arrival is strictly LESS of an event than the first, and
     * the line says which of the two is worth answering.
     *
     * The counters, in the order the sentence names them:
     *
     *  - THE SALVAGE IS DEFERRED, NOT DENIED. `destroy` sheds nothing on the
     *    first death and the returning body carries `pay: 2`, so it banks
     *    exactly twice what an ordinary one does. Measured: 48,000 B in six
     *    motes against a control remnant's 24,000 B in six -- exactly double.
     *    Note what this is NOT: doubling the mote COUNT pays 1.0000x, because
     *    `shed` computes one worth and divides it by the count. The bounty is
     *    the dial.
     *  - THE CLOCK IS THE COST. `Director.standing` counts a pending return
     *    as a body still standing, so the wave cannot score while one is
     *    owed -- asserted in both directions by the case, because the second
     *    half is what says a game with no remnants in it counts its waves
     *    exactly as it did before. And the twenty clocks a real band-5 wave
     *    starts run CONCURRENTLY, so the cost is bounded at about one `back`
     *    per wave however many are in it: six seconds against a wave of 52 to
     *    120 seconds, which is 5-10%.
     *  - SHOOTING IT EARLY IS WHAT KEEPS THAT COST INSIDE THE WAVE. That is
     *    arithmetic off the mechanism rather than a measurement: the clock
     *    starts when the body dies, so a death late in a wave puts its six
     *    seconds AFTER everything else has been cleared, where they are six
     *    seconds of nothing happening. It is the one piece of advice this
     *    object actually supports.
     *
     * Exposed to three constants and no others: `respawn.back` (the six
     * seconds), `respawn.hp` (half the health) and `respawn.quick`, which is
     * why the speed is named as a direction rather than as a figure -- 1.4x
     * has no short English form that stays true if it is tuned.
     *
     * It deliberately does not name a mine (`CFG.mines.inPlay` has been false
     * since build 289) and does not name PULSE either: nothing about this
     * object is answered by the shape of what kills it, only by when.
     */
    line: 'Shoot one and nothing comes off it. No salvage, nothing counted against the wave, and a mark left standing where it was for six seconds -- then one body comes back out of the portal, weaker and quicker, once, and that one pays for both. Nothing is lost; it is owed. What it costs you is the clock: a wave cannot end while a return is still owed, and a field that will not thin is the next wave waiting behind it. The body that comes back is the smaller of the two, so it is the first one that is worth answering -- and answering it early is what keeps its six seconds inside the wave instead of after it.',
  },
  {
    /*
     * ANVIL's line, and the counter is the one thing about this object that
     * cannot be got wrong by being vague: there is no button.
     *
     * Measured before it was written, which is the rule build 319's FLINT
     * line was corrected for -- it had named two counters that did not work.
     * A 3000-unit impulse through `applyDamage` -- the shape PULSE, PILE,
     * HEAVE and HAIL all take -- moves an anvil by **0.00 u/s**, against
     * 91.45 for a BULWARK and 643 for a LURCHER on the same press. A hurled
     * MASS stops on it. So the line names the gun and the clock and nothing
     * else, and it names the clock as a comparison rather than a figure
     * (`speed` is derived from the crossing and a quoted number would rot).
     *
     * What it does NOT say, deliberately: anything about a mine
     * (`CFG.mines.inPlay` false since 289), and anything about hitting it
     * from a particular side -- `armor` here is ordinary all-round armour,
     * not FLINT's plate, and inviting the player to look for a face would be
     * FLINT's fault in reverse.
     */
    id: 'anvil',
    name: 'ANVIL',
    line: 'The heaviest thing that has ever walked down this field, and the only one that cannot be moved. It takes no lane and no evasive arc -- it simply comes, straight, slower than anything else on the field. Every shove in the game is refused: PULSE, PILE, HEAVE, a hurled MASS, the knockback of your own rounds. Nothing pushes it off the mount because nothing pushes it at all. What is left is the gun and the time it has to spend crossing, which is longer than any other body spends -- so it is a problem you answer early or answer with everything, and the things arriving beside it are what make that a choice.',
  },
  /*
   * MEASURED BEFORE IT WAS WRITTEN, which is build 319's correction applied
   * in advance -- and here it was the measurement that changed the line.
   *
   * The object guide's counter is "shoot the sheet, not what is behind it --
   * which is exactly the decision it exists to force", on the strength of the
   * assist being blinded by it. Measured over 1,348 frames of the real wave
   * at rung 32 with a fully bought turret, the assist's PICK is identical
   * with the occlusion rule on and off: it scores by distance, and a sheet
   * across the field is the nearest thing on it. So the decision is not
   * forced, the gun makes it for you, and a line promising otherwise would be
   * FLINT's fault again -- naming a counter nobody can use.
   *
   * What IS measured is what the sheet costs: **63% of every point of damage
   * the turret delivered went into membrane** (13,555 of 21,620 at rung 32,
   * 62% at rung 35), and a round aimed at anything behind one lands on it.
   * That is the sentence.
   *
   * And the counter named is the one that works and that this object is the
   * only body in the game to invert: it is the LIGHTEST thing on the field
   * for its size -- mass 946 against an ANVIL's 10,662 -- so the same press
   * that cannot move an anvil at all throws a sheet **528 u/s and 365 units**,
   * measured with the same 3000-impulse hit that read 0.00 on an anvil,
   * 91.45 on a BULWARK and 643 on a LURCHER. A blast takes it whole: 119.6 of
   * 120 landed.
   */
  {
    id: 'veil',
    name: 'VEIL',
    line: 'A membrane that goes wide before it comes down, and then simply hangs there across the field. It is not coming for you and it does not have to: every round aimed at anything behind it stops in it instead, and a sheet is a hundred units wide. Most of what your gun does while one stands is spent on cloth. It is the lightest thing out there for its size, though -- the one body a press throws right off the field, where an ANVIL will not move an inch -- so the answer is rarely the gun.',
  },
  /*
   * ---- LOOM's LINE NAMES THE TWO COUNTERS THAT WERE MEASURED -------------
   *
   * `docs/objects.html` offers "either end drops it... and a blast or a mine
   * reaches under the thread, which rounds do not". Two thirds of that is
   * true and measured here, and the mine is not: `CFG.mines.inPlay` has been
   * false since build 289, and builds 317 and 319 each shipped a codex line
   * offering a mine as an answer that 323 had to correct. A line is a
   * promise; this one does not make that one.
   *
   *   - EITHER END: a round aimed at a spool takes 26 of its health with the
   *     thread at full span, from both ends, because `threadSpan` insets each
   *     end by that body's own radius. The pair cannot hide behind its own
   *     cover.
   *   - A BLAST UNDERNEATH: 88.2 of 90 delivered to a LURCHER standing 40
   *     units behind a full-span thread, because `applyBlast` measures centre
   *     to centre and consults nothing in between. PULSE is the one every run
   *     owns -- it is `essential`, so no purchase and no hold can take it --
   *     and it is radial from the machine, so it never picks a target at all.
   *   - AND THE ROUNDS REALLY DO STOP: the same shot at the same body with
   *     the same geometry reads 0 damage with the thread up and 26 with it
   *     down, `beam` being the only difference. It is absorbed the way the
   *     era-2 wall absorbs -- `impacted` false -- so an HE does not even go
   *     off against it.
   *
   * The line does NOT say the gun will refuse the shot for you, because it
   * will not: the thread is deliberately outside `occluders` (see the type),
   * so an assist left to itself will spend rounds on cover. That is the cost
   * the object exists to impose and the reason the first four seconds matter
   * -- the blocking span is `len - 2r`, 16 units at release and 150 at full.
   */
  {
    id: 'loom',
    name: 'LOOM',
    line: 'Two spools that come down together and then walk apart, paying out a bright thread between them as they go. The thread is not aimed at you and it does not have to be: a round that meets it simply stops, whatever was behind it, and the longer the pair lives the more of the field it covers. Shoot it early, while the gap is still narrower than the bodies making it. After that, either spool drops the whole thing -- the thread never quite reaches them -- or put a blast underneath it, which reaches what your rounds cannot.',
  },
  /*
   * ---- MEASURED BEFORE IT WAS WRITTEN, and the guide's counter is struck --
   *
   * `docs/objects.html` offers "close the distance: it has no answer to
   * something already inside its range". There is no such move: the turret is
   * static (`invMass` 0, no `hp`, no `applyDamage`) and `CFG.gun.inPlay` has
   * been false since build 289, so the player cannot push up-field at all.
   * That is FLINT's fault again -- a counter named in prose that nobody can
   * use -- and it is the second half of the same sentence whose FIRST half
   * (the bolt) is build 336's.
   *
   * What IS measured, and what this line rests on:
   *
   *   - IT NEVER CLOSES. With kites alone on the field, over four cells of
   *     era and rung: **zero grip frames** and the deepest body 181 to 297
   *     units clear of the grab band. The wall's rank count is derived from
   *     exactly that bound (`standWall`).
   *   - ...BUT SOMETHING HEAVY WALKING THROUGH IT WILL PUSH ONE IN. The same
   *     four cells with the whole wave: 914 to 11,332 grip frames and the
   *     deepest kite 72 to 188 units PAST the grab line, all of it the
   *     BULWARK ploughing through the line. That is physics rather than the
   *     gait, it costs the kite (contact bills `impactDamage` both ways), and
   *     the line says it rather than promising it cannot happen.
   *   - IT STANDS AT 90% OF WHAT AN UNBOUGHT ASSIST CAN REACH: 360 of 400,
   *     a margin of exactly two radii, held at every viewport and both eras
   *     by construction. With ARRAY bought the margin is 481 -- so this is
   *     the one body that makes reach worth buying, which is the complement
   *     of build 323's finding that DEEP ARRAY makes CHAFF *worse*.
   *   - A PRESS CLEARS THE WHOLE LINE. It is the lightest body in the game
   *     (mass 1, tied with a MOTE at half its radius), so one PULSE leaves it
   *     at **713 u/s against a `thrownSpeed` cap of 720** -- the fastest
   *     anything can be thrown -- displacing the wall 434 units and buying
   *     **14.3 seconds** before it is back on station. All six survived, so
   *     it is time bought and not a kill. PULSE is `essential`: no purchase,
   *     and no anomaly can hold it.
   *   - AND THE WAVE CANNOT END WHILE ONE STANDS. `Director.standing` counts
   *     a kite like any hostile, so the tempo cost is real without anything
   *     being thrown: measured, the wave is the longest in band 5 at rung 35
   *     (116-128s against siblings at 55.7, 61.1 and 88.8) and straddles the
   *     120-second cap -- the same shape REMNANT's wave has, and for the same
   *     reason, the body's own transit. Recorded rather than tuned; band 5
   *     already misses that cap at four of seven rungs on the era-2 field
   *     (build 306).
   */
  {
    id: 'kite',
    name: 'KITE',
    line: 'The first hostile down this field that will not come to you. It closes to the far edge of what your gun can see -- ninety per cent of the way out, and no further -- and then simply hangs there, drifting along the line, with more of them in ranks behind the first. They are not coming for the mount and they do not need to: a wave does not end while one is still up there, so every second they hold is a second the next wave is not arriving in. The gun is the answer and the reach is the question -- this is the one body worth buying ARRAY for. Or press PULSE, which does reach them: there is nothing lighter on the field, so one press throws the whole line four hundred units up-field and buys fourteen seconds. And let something heavy through and it will shove one of them onto you, which is the only way they ever arrive.',
  },
  {
    id: 'quarry',
    name: 'QUARRY',
    line: 'One body that is nine, and the lines it will break along are already drawn on it. Each generation is smaller, faster and thinner-plated than the one it came out of, and nothing it does is aimed at you -- it takes no lane, crosses the field, turns off the walls and spins the whole way. Where you break it is the decision: high and the pieces have the field to spread in, low and they are already on the mount.',
  },
  {
    id: 'axiom',
    name: 'AXIOM',
    line: 'It states a rule and holds you to it. Nothing you carry is yours while its clauses stand.',
  },
  {
    id: 'clause',
    name: 'CLAUSE',
    line: 'One of your buttons, held shut. Break it and you have that much of yourself back.',
  },
  {
    id: 'lemma',
    name: 'LEMMA',
    line: 'A small argument in support of a larger one. It exists to keep you off the clause that sent it.',
  },
  {
    id: 'tessera',
    name: 'TESSERA',
    line: 'It does not come to you and it does not have to. It lays the ground between you and it, one tile at a time.',
  },
  {
    id: 'tile',
    name: 'TILE',
    line: 'Laid ground. Nothing you fire crosses it while it is down, and it has no interest in you at all.',
  },
  {
    id: 'shard',
    name: 'SHARD',
    line: 'What comes off a tile you have taken. Cutting the corridor is not free.',
  },
];

const IDS = new Set(CODEX.map((e) => e.id));

/**
 * What has been destroyed at least once, ever. Kept in localStorage, so it
 * outlives a reset the way a record outlives a session. Private browsing has
 * no store; the codex then simply lives for as long as the tab does.
 */
class Codex {
  constructor() {
    this.seen = new Set();
    this.load();
  }

  load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return;
      for (const id of JSON.parse(raw)) if (IDS.has(id)) this.seen.add(id);
    } catch {
      /* unreadable or unavailable: start empty and carry on */
    }
  }

  save() {
    try {
      localStorage.setItem(KEY, JSON.stringify([...this.seen]));
    } catch {
      /* no store available — the in-memory set still works for this tab */
    }
  }

  has(id) {
    return this.seen.has(id);
  }

  /** @returns true if this was the first one ever, which is worth announcing. */
  record(id) {
    if (!id || !IDS.has(id) || this.seen.has(id)) return false;
    this.seen.add(id);
    this.save();
    return true;
  }

  get found() {
    return this.seen.size;
  }

  get total() {
    return CODEX.length;
  }

  /** Debug only. */
  forget() {
    this.seen.clear();
    this.save();
  }

  unlockAll() {
    for (const e of CODEX) this.seen.add(e.id);
    this.save();
  }
}

export const codex = new Codex();

/** Every id any anomaly puts on the field, boss included. */
const ANOMALY_IDS = new Set(ANOMALIES.flatMap((a) => a.types));

/** The glossary in two halves: what the field sends, and what a boss makes. */
export const FIELD_ENTRIES = CODEX.filter((e) => !ANOMALY_IDS.has(e.id));
export const ANOMALY_ENTRIES = CODEX.filter((e) => ANOMALY_IDS.has(e.id));

/*
 * Two keys this build has no use for, and no readers left.
 *
 * `sim7749-cleared` recorded whether ORDINAL had been beaten, and has meant
 * nothing since build 81 took the boss out: every run is endless, so there is
 * nothing to have beaten and nothing it could gate. Its three readers were
 * kept on the grounds that the key was still on players' devices and removing
 * them would strand it — but a reader nobody calls does not un-strand
 * anything. They are gone, and migrateLines() deletes the key instead, which
 * is what not stranding it actually looks like.
 *
 * `sim7749-taught` is the flag the per-line record replaced in build 94. Read
 * once, by migrateLines(), then removed.
 */
const CLEARED = 'sim7749-cleared';
const TAUGHT = 'sim7749-taught';

/**
 * Which lines this device has already been told, one id at a time.
 *
 * It used to be a single flag: said, or not said, for the whole script at
 * once. That was fine until the script grew — the two lines about DRIFT were
 * written after most devices had already set the flag, so the game had
 * something to say and no way left to say it, and the only route back was
 * REPLAY OPENING in the menu, which you would have to already know about.
 *
 * Per line, a line added later is simply a line this device has not been told,
 * and one it has been told is never repeated. Held in memory as well, because
 * teach() asks this every frame.
 */
const LINES = 'sim7749-lines';
let _lines = null;

function loadLines() {
  if (_lines) return _lines;
  try {
    const raw = localStorage.getItem(LINES);
    _lines = new Set(raw ? JSON.parse(raw) : []);
  } catch {
    _lines = new Set();
  }
  return _lines;
}

export function lineSeen(id) {
  return loadLines().has(id);
}

export function markLine(id) {
  const set = loadLines();
  if (set.has(id)) return;
  set.add(id);
  try {
    localStorage.setItem(LINES, JSON.stringify([...set]));
  } catch { /* private mode: it will offer the line again next launch */ }
}

/**
 * Every trace of this player, gone: the glossary, every line already said, and
 * the two dead keys the migration would otherwise have to find later. What
 * RESET SIMULATION means — the next launch is a first launch.
 *
 * The volume is deliberately not here. It is a comfort setting rather than
 * progress, and a reset that unmutes a phone at midnight is a worse thing to
 * do to someone than a volume that outlives their run.
 */
export function forgetPlayer() {
  codex.forget();
  forgetLines();
  // The bench's lifetime record. Progress rather than comfort, so it goes the
  // way the glossary goes and not the way the volume does.
  soak.forget();
  try {
    // forget() leaves an empty record behind; a device that has never been
    // opened has no record at all, and that is what this is meant to look
    // like. The next thing destroyed writes it again.
    localStorage.removeItem(KEY);
    localStorage.removeItem(TAUGHT);
    localStorage.removeItem(CLEARED);
  } catch { /* nothing to forget */ }
}

export function forgetLines() {
  _lines = new Set();
  try {
    localStorage.removeItem(LINES);
  } catch { /* nothing to forget */ }
}

/**
 * The one-time move off the old flag.
 *
 * A device carrying `sim7749-taught` has been through an opening, but not
 * which one — there is no record of that to read. `ids` is what it is credited
 * with: the control lines, which have been in the opening since the first
 * build and are the ones nobody wants to sit through twice. Anything written
 * since is left unseen, which is the whole point of doing this at all.
 */
export function migrateLines(ids) {
  try {
    if (localStorage.getItem(LINES) !== null) return;
    if (localStorage.getItem(TAUGHT) !== '1') return;
    const set = loadLines();
    for (const id of ids) set.add(id);
    localStorage.setItem(LINES, JSON.stringify([...set]));
    localStorage.removeItem(TAUGHT);
    localStorage.removeItem(CLEARED); // dead since build 81; see the note above
  } catch { /* private mode: nothing was remembered to migrate */ }
}

