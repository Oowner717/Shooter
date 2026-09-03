// What energy buys. Permanent for the run, gone on reset.
//
// Three axes, so a pick is an identity rather than a number: AMMO sharpens
// what you shoot, FIELD is what happens without you, TURRET is the machine.
// A run picks its way across the three, so it reads as a shape.
//
// Every effect here is a scalar on `world.up`, read at the point of use. That
// is the whole contract: nothing in this file reaches into a subsystem, and
// adding an upgrade is an entry plus one place that reads it.

/** Defaults. Anything not listed is off. */
import { CFG } from './config.js';
import { svgMark } from './util.js';
import { ARSENAL } from './arsenal.js';
import { ABILITIES } from './abilities.js';
import { LOCKABLE, FIRST_USE } from './tutorial.js';

export function freshUpgrades() {
  return {
    // ammo
    damage: 1,
    rate: 1, // lower is faster; applied as a divisor
    speed: 1,
    bounces: 0,
    impulse: 1,
    blastR: 1,
    cluster: false, // HE's burst throws four smaller ones outward
    arcJumps: 0,
    arcFalloff: 0, // set, not scaled: what a link keeps when SUPERCONDUCTOR is in
    arcRange: 1, // and how far a link will reach for the next body
    // BOLT's own three. Nothing else in the rack reads them.
    boltBounce: 0, // extra ricochets, off walls and now off bodies
    boltLife: 1,
    boltRebound: 0, // bodies a BOLT may bounce off instead of stopping in
    spineTap: 0, // follow-up darts behind every SPINE
    shotPellets: 0, // extra pellets in a SHOT
    shotRange: 1, // and how far they get before they expire
    titheStep: 1, // how fast TITHE's mark deepens its own bite
    titheMarks: 0, // and how deep it may go past the eight it starts with
    salvo: 0, // every Nth shot fires three
    pierce: 0, // extra bodies a SPINE carries on through
    spineFade: 0, // set, not scaled: what it keeps per body when ANNEALED is in
    spineShred: 0, // fraction of a body's armour a SPINE ignores
    spineSplit: 0, // SLIVER: how many times a spine may come apart on the way through
    slug: 1, // how hard a SLUG shoves
    chill: 1, // how long RIME drags something down for
    patchR: 1, // how wide a SPORE patch burns...
    patchCap: 0, // ...and how many more than three may burn at once
    bounty: 1, // TITHE's multiplier on a marked body
    // How far a PULSE reaches and how hard it throws. Both, because "push
    // distance" is both: the speed cap clips a light body's shove hard --
    // measured, a MOTE takes 23% of PULSE's rated impulse -- so impulse alone
    // is an upgrade that does almost nothing to the most common thing on the
    // field, and reach is what decides whether it is touched at all.
    pulseR: 1,
    pulsePush: 1,
    // field
    // The cap, the lifetime and the throw clock are fixed in config and no
    // upgrade may move any of them. What an upgrade may do is put more down
    // per throw, arm them sooner, or make a spent one worth something.
    mineSalvo: 0, // extra mines laid per throw
    mineEvery: 1, // multiplier on the wait between throws
    mineFizzle: false, // a mine that runs out its life goes off instead
    mineBlast: 1, // radius of a blast mine and of a knell's tolls
    mineDamage: 1, // and how hard both of them land
    mineHold: 1, // seconds a snare keeps what it caught
    mineTolls: 0, // extra rings on a knell
    spallPellets: 1, // how much a spall throws...
    spallBurst: 1, // ...and how wide each pellet goes off where it lands
    // WARD: how far the shell stands out, how hard it cuts and how many arcs
    // it throws at once. It held a fourth, `wardLife`, from the day WARD
    // landed -- one reader in the constructor and no writer anywhere, because
    // the duration node the comment promised was never authored. That is the
    // `world.endless` shape CLAUDE.md records; the seconds are `CFG.ward.life`
    // and nothing is for sale against them.
    wardR: 1,
    wardCut: 1,
    wardArcs: 0,
    lodeReach: 1, // how far a lode pushes, and how hard
    lodePush: 1,
    wireDamage: 1, // per second of contact on a wire
    mineTrigger: 1,
    voidReach: 1, // VOID's mouth alone, which nothing else widens
    intake: false, // energy that touches the turret is taken in without a PULSE
    cooldown: 1, // multiplier on every ability's cooldown
    // turret
    slew: 1,
    aimRange: 1, // how far auto aim will reach for a target
    /*
     * How far the assist's screen has been opened, as a count rather than a
     * flag: 0 refuses DRIFT, 1 adds a position that takes grey alone, 2 adds
     * one that takes everything. See Game.aimModes.
     */
    driftAim: 0,
    pile: 0, // levels of the weight in the deck that answers what closes in
    casing: 0, // damage a second to whatever is touching the turret
    insulation: 1, // multiplier on how much corruption costs the intake
  };
}


/*
 * A mark per upgrade. The offer is read in the two seconds before a tap, and a
 * name is slower to recognise than a shape — especially for the repeatable
 * ones, where what matters is "the one I already have three of".
 */

const g = svgMark;

const MARK = {
  // --- ammo ---
  hollowpoint: g('<path d="M12 21V9"/><path d="M12 3 7.5 9.5h9z" fill="currentColor" stroke="none"/><path d="M18 18h4M20 16v4"/>'),
  tracer: g('<path d="M3 12h9"/><path d="M12.5 7.5 20 12l-7.5 4.5z" fill="currentColor" stroke="none"/><path d="M4 7.5h5M4 16.5h5" opacity=".5"/>'),
  ricochet: g('<path d="M3 3v18M21 3v18" opacity=".45"/><path d="M4 7l16 6-16 5"/>'),
  heavy: g('<rect x="13" y="8" width="8" height="8" rx="1"/><path d="M2 12h8"/><path d="M7 8.5 10.5 12 7 15.5"/>'),
  overpressure: g('<circle cx="12" cy="12" r="2.6" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="6" opacity=".6"/><circle cx="12" cy="12" r="9.6" opacity=".3"/>'),
  fifthlink: g('<circle cx="5" cy="17" r="2.2"/><circle cx="12" cy="8" r="2.2"/><circle cx="19" cy="16" r="2.2"/><path d="M6.4 15.3 10.6 9.8M13.5 9.5l4.2 4.7"/>'),
  // A mark that compounds on itself.
  compound: g('<path d="M4 19.4 9 13l3.6 3.2L20 5.6"/><path d="M15.6 5.6H20v4.4" fill="none"/><circle cx="9" cy="13" r="1.6" fill="currentColor" stroke="none"/><circle cx="12.6" cy="16.2" r="1.6" fill="currentColor" stroke="none"/>'),
  // The shell, standing further out.
  bulwarkmark: g('<circle cx="12" cy="12" r="4.4"/><circle cx="12" cy="12" r="9.2" stroke-dasharray="2.4 2.6" opacity=".7"/>'
    + '<path d="M12 2.2v2.4M12 19.4v2.4M2.2 12h2.4M19.4 12h2.4"/>'),
  // ...cutting harder: a surface with something breaking on it.
  edgemark: g('<circle cx="12" cy="12" r="8"/><path d="M4.6 7.2 19.4 16.8" opacity=".9"/>'
    + '<path d="m9 9.6 1.8 1.8M13.2 12.6l1.8 1.8" opacity=".7"/>'
    + '<circle cx="12" cy="12" r="1.7" fill="currentColor" stroke="none"/>'),
  // ...and one more arc off it.
  forkmark: g('<circle cx="6.4" cy="12" r="2.4" fill="currentColor" stroke="none"/>'
    + '<path d="M8.6 11 15 6.6M8.6 13 15 17.4M8.8 12h6.4" opacity=".9"/>'
    + '<circle cx="17" cy="6" r="1.5" fill="currentColor" stroke="none"/>'
    + '<circle cx="17" cy="18" r="1.5" fill="currentColor" stroke="none"/>'
    + '<circle cx="17" cy="12" r="1.5" fill="currentColor" stroke="none" opacity=".55"/>'),
  salvo: g('<path d="M5 21V7M12 21V4M19 21V7"/><path d="M2.6 9.4 5 7l2.4 2.4M9.6 6.4 12 4l2.4 2.4M16.6 9.4 19 7l2.4 2.4"/>'),
  // --- build 54: BOLT, HE, SCATTER, ARC and SPINE each get their own ---
  // A round coming off a body at an angle rather than stopping in it.
  overstuffed: g('<circle cx="17" cy="7.6" r="2.6"/><path d="M2.6 4.4 14.6 9.4"/><path d="M14.8 10.4 4.6 19.6"/><path d="M5.4 15.6 4 20.6l5-1.4" fill="currentColor" stroke="none"/>'),
  // One trigger pull, two rounds out of it.
  doubletap: g('<circle cx="8.4" cy="6.6" r="2.4" fill="currentColor" stroke="none"/><path d="M8.4 21V10.4"/><circle cx="16.6" cy="10.4" r="2.4" fill="currentColor" stroke="none" opacity=".7"/><path d="M16.6 21v-7.4" opacity=".7"/>'),
  // One burst becoming five.
  cluster: g('<circle cx="12" cy="12" r="2.8"/><circle cx="5" cy="6.4" r="1.8" fill="currentColor" stroke="none"/><circle cx="19" cy="6.4" r="1.8" fill="currentColor" stroke="none"/><circle cx="5" cy="17.6" r="1.8" fill="currentColor" stroke="none"/><circle cx="19" cy="17.6" r="1.8" fill="currentColor" stroke="none"/><path d="M9.9 9.9 6.4 7.4M14.1 9.9l3.5-2.5M9.9 14.1l-3.5 2.5M14.1 14.1l3.5 2.5" opacity=".45"/>'),
  // More of them in the same cone.
  doubleo: g('<path d="M12 21.4 6 9.6M12 21.4 9.6 8.6M12 21.4V8M12 21.4l2.4-13.4M12 21.4 18 9.6" opacity=".55"/><circle cx="7.4" cy="5.4" r="1.5" fill="currentColor" stroke="none"/><circle cx="12" cy="4" r="1.5" fill="currentColor" stroke="none"/><circle cx="16.6" cy="5.4" r="1.5" fill="currentColor" stroke="none"/>'),
  // The same cone, arriving further away.
  longshot: g('<path d="M12 21.6 8 11M12 21.6V10.4M12 21.6 16 11"/><path d="M6.6 7.4 12 2l5.4 5.4" opacity=".85"/><path d="M3.4 12h1.8M18.8 12h1.8" opacity=".4"/>'),
  // A chain that does not weaken.
  superconductor: g('<circle cx="4.6" cy="12" r="2.2" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="2.2" fill="currentColor" stroke="none"/><circle cx="19.4" cy="12" r="2.2" fill="currentColor" stroke="none"/><path d="M6.8 12h3M14.2 12h3"/><path d="M12 4.6v2.6M12 16.8v2.6" opacity=".5"/>'),
  // A link that reaches further for the next one.
  longlead: g('<circle cx="4.6" cy="17.4" r="2.2"/><circle cx="19.4" cy="6.6" r="2.2"/><path d="M6.4 16.1 17.6 7.9" stroke-dasharray="2.4 2.2"/><path d="M11.2 4.4 13 8.2l-4.2.4z" fill="currentColor" stroke="none" opacity=".8"/>'),
  // A round that keeps its weight all the way through.
  annealed: g('<path d="M2.4 12h19.2"/><circle cx="7.6" cy="12" r="2.4"/><circle cx="15" cy="12" r="2.4"/><path d="M3.4 8.6v6.8M20.6 8.6v6.8" opacity=".5"/>'),
  // Straight through the plate rather than into it.
  railed: g('<path d="M12 2.8 19 6v5.8c0 4-2.9 6.3-7 7.7-4.1-1.4-7-3.7-7-7.7V6z" stroke-dasharray="2.8 2.4"/><path d="M2 15h20"/><path d="M18.6 12.4 21.8 15l-3.2 2.6" fill="currentColor" stroke="none"/>'),
  // --- field ---
  deepmag: g('<ellipse cx="12" cy="7" rx="7.5" ry="2.8"/><path d="M4.5 7v5c0 1.6 3.4 2.8 7.5 2.8s7.5-1.2 7.5-2.8V7"/><path d="M4.5 12v5c0 1.6 3.4 2.8 7.5 2.8s7.5-1.2 7.5-2.8v-5"/>'),
  quicklay: g('<circle cx="15" cy="14" r="5"/><path d="M2 8h7M2 12h5M2 16h4" opacity=".7"/>'),
  // --- build 51: the ten new types ---
  // A dart coming apart into an arc of smaller ones.
  sliver: g('<path d="M2.6 12h6.2"/><circle cx="10.4" cy="12" r="1.7" fill="currentColor" stroke="none"/>'
    + '<path d="m11.8 11 7.4-3.6M12 12h7.6M11.8 13l7.4 3.6"/>'
    + '<path d="M17.8 5.6 21.4 7.4l-3.2 2.2M18.4 14.2l3 2.2-3.6 1.8" fill="currentColor" stroke="none" opacity=".85"/>'),
  // One more body to go through.
  throughandthrough: g('<path d="M2.5 12h19"/><circle cx="8" cy="12" r="2.4"/><circle cx="15" cy="12" r="2.4"/><path d="M19 9.6 21.6 12 19 14.4" fill="currentColor" stroke="none"/>'),
  // A shove with more behind it.
  sledge: g('<rect x="3" y="9.4" width="7" height="5.2" rx="1"/><path d="M10 12h7"/><path d="M14.6 8.6 18.6 12l-4 3.4"/><path d="M20.6 8.4v7.2" opacity=".6"/>'),
  // Colder, for longer.
  deepfreeze: g('<path d="M12 3v18M4.2 7.5l15.6 9M19.8 7.5 4.2 16.5"/><circle cx="12" cy="12" r="2.6" fill="currentColor" stroke="none"/>'),
  // The patch, wider.
  bloomout: g('<circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="6.6" stroke-dasharray="2.2 2.6"/><circle cx="12" cy="12" r="10" stroke-dasharray="2.2 3.4" opacity=".6"/>'),
  // One more patch of ground alight: two grounds, the second only just taken.
  secondgrowth: g('<ellipse cx="7.6" cy="16.4" rx="5" ry="3.2"/><ellipse cx="16.6" cy="16.4" rx="5" ry="3.2" stroke-dasharray="2.2 2.4"/><path d="M7.6 13.2V8.6M16.6 13.2v-3" opacity=".8"/><circle cx="7.6" cy="6.6" r="1.7" fill="currentColor" stroke="none"/><circle cx="16.6" cy="8.4" r="1.4" fill="currentColor" stroke="none" opacity=".75"/>'),
  // A mark worth more.
  levy: g('<path d="M12 3.4 19.4 8v8L12 20.6 4.6 16V8z"/><path d="M12 7.6v8.8M9.6 9.8h4.8M9.6 14.2h4.8"/><path d="M16.6 4.4h4M18.6 2.4v4" opacity=".8"/>'),
  // More thrown, one way.
  // A pellet, and the ground it takes with it.
  splinter: g('<path d="M12 3.4v6.2"/><path d="M9.6 9.6 12 12l2.4-2.4"/>'
    + '<circle cx="12" cy="13.4" r="1.7" fill="currentColor" stroke="none"/>'
    + '<path d="M6.4 15.6a8 8 0 0 0 11.2 0" opacity=".85"/>'
    + '<path d="M3.4 18.6a12.4 12.4 0 0 0 17.2 0" opacity=".5"/>'
    + '<path d="M5.6 8.2 3.4 6M18.4 8.2 20.6 6" opacity=".6"/>'),
  buckshot: g('<path d="M4.6 20h14.8"/><path d="M12 16V9M8 16 6 9.6M16 16l2-6.4M4.6 15 3 10M19.4 15 21 10" opacity=".95"/><circle cx="12" cy="6.4" r="1.6" fill="currentColor" stroke="none"/>'),
  // The wave off the mount, wider and harder. Three fronts, the outer two
  // opening: PULSE is the only thing that answers something already on you,
  // and this is that answer arriving from further out.
  shockfront: g('<circle cx="12" cy="12" r="2.2" fill="currentColor" stroke="none"/>'
    + '<path d="M6.6 6.6a7.6 7.6 0 0 0 0 10.8"/><path d="M17.4 6.6a7.6 7.6 0 0 1 0 10.8"/>'
    + '<path d="M3.1 3.1a12.6 12.6 0 0 0 0 17.8" opacity=".55"/>'
    + '<path d="M20.9 3.1a12.6 12.6 0 0 1 0 17.8" opacity=".55"/>'
    + '<path d="M8.8 12h6.4M13.4 9.9 15.5 12l-2.1 2.1" opacity=".9"/>'),
  // A field that reaches further and shoves harder.
  repulsor: g('<circle cx="12" cy="12" r="2.6" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="6" stroke-dasharray="2.4 2.6"/><path d="M12 5.4V2.6M12 18.6v2.8M5.4 12H2.6M18.6 12h2.8"/><path d="M10.4 4.2 12 2.6l1.6 1.6M10.4 19.8 12 21.4l1.6-1.6" fill="currentColor" stroke="none" opacity=".85"/>'),
  // A charge going off wider than it used to: the same centre, one ring further.
  deepcharge: g('<circle cx="12" cy="12" r="2.2" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="5.6"/><circle cx="12" cy="12" r="9.4" stroke-dasharray="2.6 2.8"/><path d="M12 2.6v1.6M12 19.8v1.6M2.6 12h1.6M19.8 12h1.6" opacity=".7"/>'),
  widemouth: g('<circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="9" stroke-dasharray="2.4 3"/>'),
  // A fuse with more of itself left to burn.
  longfuse: g('<path d="M4 18h6.5"/><path d="M10.5 18c3.4 0 3.4-9 6.8-9" stroke-dasharray="2.4 2.4"/><circle cx="19.4" cy="8.6" r="2.2" fill="currentColor" stroke="none"/><path d="M3 15.6v4.8" opacity=".7"/>'),
  // Fragments thrown out of a centre, rather than a wider ring.
  shrapnel: g('<circle cx="12" cy="12" r="2.4" fill="currentColor" stroke="none"/><path d="M12 8.6 11 3.4M15.4 10.4 19.6 7M15.4 13.6l4.6 2.4M12 15.4l1.2 5.2M8.6 13.6 4 16.4M8.6 10.4 4.4 7"/>'),
  // A weight on what has been caught: it stays down longer.
  deadweight: g('<path d="M8.4 8h7.2l2.4 12H6z"/><path d="M9.6 8V6.2a2.4 2.4 0 0 1 4.8 0V8"/><path d="M3 22h18" opacity=".6"/>'),
  // The line, with heat coming off it.
  hotwire: g('<path d="M2.5 14h19"/><path d="M4.5 10.5v7M19.5 10.5v7"/><path d="M8.5 9.4c0-1.6 1.6-1.6 1.6-3.2M13.9 9.4c0-1.6 1.6-1.6 1.6-3.2" opacity=".85"/>'),
  // One more ring than the bell had.
  fourthbell: g('<path d="M7 15.4c0-5 1.3-8 5-8s5 3 5 8z"/><path d="M5.6 15.4h12.8"/><circle cx="12" cy="18" r="1.4" fill="currentColor" stroke="none"/><path d="M19.6 5.6a5.6 5.6 0 0 1 0 6.4M21.8 3.4a8.8 8.8 0 0 1 0 10.8" opacity=".6"/>'),
  // A claim that runs deeper than it used to.
  lien: g('<path d="M12 3.2 19.6 7.6v8.8L12 20.8 4.4 16.4V7.6z"/><path d="M12 8v8M9.4 10.2h5.2M9.4 13.8h5.2" opacity=".9"/><path d="M12 20.8v-2M12 5.2v-2" opacity=".55"/>'),
  // A mouth that reaches much further than the thing itself.
  eventhorizon: g('<circle cx="12" cy="12" r="3" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="6.4" opacity=".6"/><circle cx="12" cy="12" r="10" stroke-dasharray="2.2 2.6"/><path d="M12 2v1.6M12 20.4V22M2 12h1.6M20.4 12H22" opacity=".7"/>'),
  intake: g('<circle cx="12" cy="12" r="2.4" fill="currentColor" stroke="none"/><path d="M12 2.5v4M9.8 4.6 12 6.9l2.2-2.3"/><path d="M12 21.5v-4M9.8 19.4 12 17.1l2.2 2.3"/><path d="M2.5 12h4M4.6 9.8 6.9 12l-2.3 2.2"/><path d="M21.5 12h-4M19.4 9.8 17.1 12l2.3 2.2"/>'),
  standing: g('<circle cx="12" cy="13" r="7.5"/><path d="M12 8.5V13l3 2"/><path d="M8.5 2.5h7" opacity=".6"/><path d="M17.5 20h4"/>'),
  // --- turret ---
  rate: g('<path d="M12 21V8"/><path d="M8.4 11.4 12 7l3.6 4.4"/><path d="M8.4 16.4 12 12l3.6 4.4" opacity=".5"/>'),
  slew: g('<path d="M4 16a8 8 0 0 1 16 0" stroke-dasharray="2.6 2.6"/><path d="M12 16V6"/><path d="M9 8.5 12 5.5l3 3"/><path d="M17 6.5l3 1.5-3 1.5" opacity=".7"/>'),
  // A weight in a slot, and the wave going out under it.
  pile: g('<rect x="8.4" y="3" width="7.2" height="5.2" rx="1" fill="currentColor" stroke="none"/>'
    + '<path d="M12 8.6v3.4"/><path d="M6.6 13.4h10.8"/>'
    + '<path d="M4.2 16.4a11 11 0 0 0 15.6 0" opacity=".8"/>'
    + '<path d="M2 19.8a15 15 0 0 0 20 0" opacity=".45"/>'),
  casing: g('<path d="M12 2.6 20 6v6.6c0 4.6-3.4 7.2-8 8.8-4.6-1.6-8-4.2-8-8.8V6z"/><path d="M12 8v8M8 12h8"/>'),
  insulation: g('<path d="M12 2.6 20 6v6.6c0 4.6-3.4 7.2-8 8.8-4.6-1.6-8-4.2-8-8.8V6z"/><path d="M7.5 12.5c1.6-2 3.4-2 4.5 0s2.9 2 4.5 0" opacity=".85"/>'),
  // A dish on a stem, and the sweep coming back off something further out.
  aimrange: g('<path d="M4.6 18.4 9.4 13.6"/><path d="M3 20l3.2-3.2" opacity=".6"/><path d="M8 12.8a5.4 5.4 0 0 1 7.6 7.6z" fill="currentColor" stroke="none" opacity=".9"/><path d="M13.4 9.6a8.6 8.6 0 0 1 1 1M15.6 6.8a12 12 0 0 1 1.6 1.6M17.8 4a15.4 15.4 0 0 1 2.2 2.2" opacity=".85"/>'),
  // A hole opened in something, with a way through it.
  aperture: g('<circle cx="12" cy="12" r="9.2" stroke-dasharray="2.6 2.8"/><circle cx="12" cy="12" r="5.2"/><path d="M12 6.8 15 12l-3 5.2-3-5.2z" fill="currentColor" stroke="none" opacity=".85"/><path d="M12 1.6v2.4M12 20v2.4M1.6 12H4M20 12h2.4" opacity=".7"/>'),
  // A screen with the small stuff passing through it and the rest held back.
  driftaim: g('<path d="M3.4 8.6h17.2M3.4 12h17.2M3.4 15.4h17.2" opacity=".75"/>'
    + '<path d="M7.4 5.2v13.6M12 5.2v13.6M16.6 5.2v13.6" opacity=".75"/>'
    + '<circle cx="9.7" cy="10.3" r="1.5" fill="currentColor" stroke="none"/>'
    + '<circle cx="14.3" cy="13.7" r="1.5" fill="currentColor" stroke="none"/>'
    + '<path d="M2 21.4 22 2.6" opacity=".45"/>'),
  // Something coming apart and reassembling as something else.
  recast: g('<path d="M12 2.6 19 6.4v7.2L12 17.4 5 13.6V6.4z"/><path d="M12 9.4l3.2 1.8v3.4L12 16.4l-3.2-1.8v-3.4z" fill="currentColor" stroke="none" opacity=".8"/><path d="M4.4 19.4a9 9 0 0 0 15.2 0" stroke-dasharray="2.4 2.6"/><path d="M2.6 17.2 4.4 20l2.8-1" fill="none"/>'),
};

const bump = (key, by) => (up) => { up[key] += by; };
const scale = (key, by) => (up) => { up[key] *= by; };
const set = (key, v) => (up) => { up[key] = v; };
/** Lower is faster, and repeats have to compound rather than run to zero. */
const quicken = (key, by) => (up) => { up[key] *= by; };

/*
 * A hue per boss. Seven of them, well apart from each other and from every
 * colour the field already uses -- the turret's cyan, the mines' orange, the
 * abilities' violet, TOW's lime, DRIFT's grey. ORDINAL has the first one and
 * has had it since it arrived; the other six are reserved, and a boss taking
 * one is how the tree will say which boss it is without being read.
 */
/*
 * The seven colours, re-exported from the one table that holds them.
 *
 * They were written down twice -- once here for the tree and once in the
 * HUD's bar -- which is exactly the sort of pair that ends up disagreeing.
 * anomaly.js owns the identity of a boss now; this is the tree's view of it.
 */
export { BOSS_TONE } from './anomaly.js';
import { BOSS_TONE as TONES, ANOMALIES } from './anomaly.js';

/*
 * II through VII: a door, a colour, and -- for one of them now -- something
 * behind it.
 *
 * Built from the anomaly table rather than written out, so a boss becomes
 * buyable by being built rather than by somebody remembering to edit this
 * list too. A slot that is not built stays dormant: a way in that opens onto
 * nothing is worse than a door that plainly does not open.
 *
 * No slot is gated behind another. A way in that exists is for sale, and the
 * price is the whole of what it costs -- gating them in a chain meant a
 * player who wanted the amber one had to go and break the magenta one first,
 * which is a queue rather than a choice. The `needs` mechanism is still in
 * the tree for anything that genuinely has to wait on progress; nothing uses
 * it today.
 *
 * A slot that is not built stays sealed, and says so honestly rather than
 * pretending something would open it.
 */
const HINT = {
  2: 'Something in here keeps the hours.',
  3: 'Something in here repeats itself.',
  4: 'Something in here is oscillating.',
  5: 'Something in here draws current.',
  6: 'Something in here has a twin.',
  7: 'Something in here is the edge of the field.',
};

const SLEEPING = ANOMALIES.slice(1).map((a) => {
  const common = {
    id: a.key,
    name: `${a.name} APERTURE`,
    repeat: true,
    step: 0,
    tone: a.tone,
    icon: MARK.aperture,
  };
  if (!a.built) {
    return {
      ...common,
      dormant: true,
      cost: CFG.ordinal.cost,
      line: `Not cut yet. ${HINT[a.n]}`,
      apply: () => {},
    };
  }
  return {
    ...common,
    /*
     * One door at a time. `needs` is an anomaly number that has to be in
     * world.reconciled before Game.available() will open this node, so the
     * way in to the second boss is shut until the first has been put down.
     *
     * The rest of the tree has no order and is not meant to look as though
     * it has one. These are the exception: they are a sequence, they are
     * numbered, and each is built on the last -- so the sequence is enforced
     * rather than merely implied by price.
     */
    needs: a.n - 1,
    // Priced by its own config, which scripts/check-build.mjs holds it to.
    cost: CFG[a.cfg].cost,
    line: `A way in to ${a.name}. ${HINT[a.n]}`,
    apply: (up, world) => { world.apertures[a.n] = (world.apertures[a.n] | 0) + 1; },
  };
});

export const UPGRADES = {
  AMMO: [
    /*
     * 1.4 a level from build 215, up from 1.25.
     *
     * SIGHT was a second 1.25^3 on the same quantity -- conditional on
     * hands-off, and it went when PILE took its socket. That is a 1.95x cut
     * to what a fully bought gun does, and it is too much: the suite's "does
     * anything in the rack still answer the top of the ladder" case went red,
     * with all nine rounds failing to clear a band-5 wave at tier 20. This
     * puts most of it back, unconditionally and on the node whose whole job
     * is damage, rather than by giving a defensive upgrade a damage term it
     * has no business having. 1.5^3 / 1.25^3 = 1.73 of the 1.95, which leaves
     * a fully bought gun at 88% of what it was.
     *
     * 1.4 first, and it was not enough: the ladder case passed on one run and
     * failed on the next, which is a gun sitting exactly on the wall rather
     * than one that clears it. A threshold a build lands on half the time is
     * not a number anybody chose.
     */
    { id: 'hollowpoint', name: 'HOLLOWPOINT', line: '+50% damage.', apply: scale('damage', 1.5) , icon: MARK.hollowpoint },
    // Two levels, not the default three. tree.js reads `u.levels ?? 3`, so an
    // uncapped node is sold three times whatever the author intended.
    { id: 'tracer', name: 'TRACER', levels: 2, line: '+35% round speed.', apply: scale('speed', 1.35) , icon: MARK.tracer },
    { id: 'ricochet', name: 'RICOCHET', line: '+1 bounce off the arena edges.', apply: bump('bounces', 1) , icon: MARK.ricochet },
    { id: 'heavy', name: 'HEAVY', levels: 2, line: '2x knockback on every hit.', apply: scale('impulse', 2) , icon: MARK.heavy },
    { id: 'overpressure', name: 'OVERPRESSURE', line: '+40% HE blast radius.', apply: scale('blastR', 1.4) , icon: MARK.overpressure },
    /*
     * ONE level, because the node is named after the number it produces.
     * `CFG.rounds.arc.jumps` is 4, so one more is the fifth link the row is
     * selling. It had no `levels` at all, and `tree.js` reads `u.levels ?? 3`
     * -- so the tree sold three and an ARC made SEVEN jumps. SECOND GROWTH,
     * authored later against the same shape ("+1 patch"), does carry its cap.
     */
    { id: 'fifthlink', name: 'FIFTH LINK', levels: 1, line: 'ARC jumps 1 more time.', apply: bump('arcJumps', 1) , icon: MARK.fifthlink },
    /*
     * The header that used to sit here explained a node that added a second
     * ARM and argued it down to one level. COMPOUND is a percentage dial on
     * TITHE's bite and IS on the default three, so the comment said the
     * opposite of what was true of the node it had come to sit above. It was
     * orphaned by a deletion, the way `windAt`/`rateAt` were in build 217.
     */
    { id: 'compound', name: 'COMPOUND', line: '+60% tithe mark bite.', apply: scale('titheStep', 1.6) , icon: MARK.compound },
    { id: 'throughandthrough', name: 'THROUGH AND THROUGH', line: '+2 bodies a spine pierces.', apply: bump('pierce', 2) , icon: MARK.throughandthrough },
    { id: 'sledge', name: 'SLEDGE', line: '+60% slug knockback.', apply: scale('slug', 1.6) , icon: MARK.sledge },
    { id: 'deepfreeze', name: 'DEEP FREEZE', line: '+70% rime chill time.', apply: scale('chill', 1.7) , icon: MARK.deepfreeze },
    { id: 'levy', name: 'LEVY', line: '+50% tithe energy mark.', apply: scale('bounty', 1.5) , icon: MARK.levy },
    { id: 'lien', name: 'LIEN', levels: 1,
      line: 'A TITHE mark runs to 14 instead of 8. Far more on one long body.',
      apply: bump('titheMarks', 6), icon: MARK.lien },
    // --- build 54: the rounds that had nothing of their own ---
    { id: 'overstuffed', name: 'OVERSTUFFED', levels: 4,
      line: 'BOLT bounces off bodies instead of stopping. +1 rebound, +30% life.',
      apply: (u) => { u.boltRebound += 1; u.boltBounce += 1; u.boltLife *= 1.3; }, icon: MARK.overstuffed },
    /*
     * One step, from build 189. It had two: TRIPLE TAP put a third BOLT
     * behind the second and was the single largest jump in the whole damage
     * line -- scripts/tiers.mjs measured rounds a second going 7.6 to 25.9
     * across one tier of income when it landed, which is not a step in a
     * ladder, it is a cliff with the rest of the tree at the bottom of it.
     * The second level is gone rather than retuned: a trigger pull is two
     * rounds now and the tail of it is worth 1.5 rather than 1.75.
     */
    { id: 'doubletap', name: 'DOUBLE TAP', levels: 1,
      line: 'A second SPINE follows every shot, a beat behind and half as hard.',
      apply: bump('spineTap', 1), icon: MARK.doubletap },
    { id: 'cluster', name: 'CLUSTER', levels: 1,
      line: 'An HE burst throws four smaller ones outward.',
      apply: set('cluster', true), icon: MARK.cluster },
    { id: 'doubleo', name: 'DOUBLE-O', levels: 2,
      line: '+3 pellets in every SCATTER.',
      apply: bump('shotPellets', 3), icon: MARK.doubleo },
    /*
     * LONG SHOT until build 184. The round it belongs to is SCATTER now, and
     * an upgrade named after a round that no longer exists is a row nobody can
     * connect to anything -- the pun was the only thing holding the name on.
     */
    { id: 'longshot', name: 'LONG THROW', levels: 1,
      line: '+55% SCATTER range. The cone still ends, but further out.',
      apply: scale('shotRange', 1.55), icon: MARK.longshot },
    { id: 'superconductor', name: 'SUPERCONDUCTOR', levels: 1,
      line: 'An ARC link keeps 95% of its damage instead of 86%.',
      apply: set('arcFalloff', 0.95), icon: MARK.superconductor },
    { id: 'longlead', name: 'LONG LEAD', levels: 1,
      line: '+60% ARC jump range. It works on a spread field, not only a packed one.',
      apply: scale('arcRange', 1.6), icon: MARK.longlead },
    /*
     * Two levels, and the second is worth more than the first because it is
     * multiplicative: three fragments become nine. Named SLIVER rather than
     * SPLINTER, which is SPALL's node from build 216 -- ids have to be unique
     * and two upgrades called the same thing in one tree would be worse than
     * a clash the build check would have caught anyway.
     */
    { id: 'sliver', name: 'SLIVER', levels: 2,
      line: 'A spine comes apart into an arc of fragments through the first body it hits.',
      apply: bump('spineSplit', 1), icon: MARK.sliver },
    { id: 'annealed', name: 'ANNEALED', levels: 1,
      line: 'A SPINE keeps 92% of its damage per body instead of 78%.',
      apply: set('spineFade', 0.92), icon: MARK.annealed },
    { id: 'railed', name: 'RAILED', levels: 1,
      line: 'SPINE ignores armour completely.',
      apply: set('spineShred', 1), icon: MARK.railed },
    { id: 'salvo', name: 'SALVO', line: 'Every 8th shot fires 3 rounds.', levels: 1, apply: set('salvo', 8) , icon: MARK.salvo },
  ],
  FIELD: [
    /*
     * ONE level, because the mine cap eats the rest.
     *
     * `CFG.mines.cap` is 5 and its own comment calls it "a contract with the
     * player rather than a balance dial: nothing may move it". Uncapped this
     * node laid FOUR mines a throw against a fully bought QUICK LAY interval
     * of 8.4 seconds and a 15-second life -- measured, two throws put eight
     * on the field and left five, so three were retired before they had
     * armed. The player pays for the third level and watches it evicted.
     * At one level a throw lays two, two throws leave four, and the cap is
     * still the backstop it was authored as.
     */
    { id: 'paired', name: 'PAIRED CHARGE', levels: 1, line: '+1 mine laid per throw.', apply: bump('mineSalvo', 1) , icon: MARK.deepmag },
    /*
     * The wait BETWEEN throws, which is the half of the sentence the node
     * this replaces did not touch.
     *
     * QUICK ARM sold the settling time -- 0.4s to 0.8s between a mine landing
     * and it being able to trigger -- and its line, "a mine arms twice as
     * fast after it lands", was read as the throw cooldown by everyone who
     * read it, because that is the wait a player actually feels. It was a
     * fifth of a second off a fifteen-second cycle. This is the wait itself.
     */
    { id: 'quicklay', name: 'QUICK LAY', levels: 2,
      line: '-25% wait between mine throws.',
      apply: scale('mineEvery', 0.75), icon: MARK.quicklay },
    { id: 'deepcharge', name: 'DEEP CHARGE', line: '+35% mine blast radius.', apply: scale('mineBlast', 1.35) , icon: MARK.deepcharge },
    { id: 'widemouth', name: 'WIDE MOUTH', line: '+40% mine trigger range.', apply: scale('mineTrigger', 1.4) , icon: MARK.widemouth },
    { id: 'eventhorizon', name: 'EVENT HORIZON', levels: 1,
      line: 'A VOID reaches for what comes near, not just what touches it.',
      apply: scale('voidReach', 2.2), icon: MARK.eventhorizon },
    { id: 'salted', name: 'SALTED', line: 'A spent mine goes off instead of fizzling.', levels: 1, apply: set('mineFizzle', true) , icon: MARK.longfuse },
    { id: 'shrapnel', name: 'SHRAPNEL', line: '+45% mine blast damage.', apply: scale('mineDamage', 1.45) , icon: MARK.shrapnel },
    { id: 'deadweight', name: 'DEAD WEIGHT', line: '+65% snare hold time.', apply: scale('mineHold', 1.65) , icon: MARK.deadweight },
    { id: 'hotwire', name: 'HOT WIRE', line: '+50% wire damage.', apply: scale('wireDamage', 1.5) , icon: MARK.hotwire },
    /*
     * TWO levels, which is what `CFG.knell.tolls` says in as many words:
     * "was 3; FOURTH BELL buys the third back and a fourth beyond it". Two
     * from a base of two is four. It had no `levels`, so the tree sold three
     * and a knell rang FIVE times -- and each toll is wider and lands its own
     * blast, so the node the config describes as buying one bell back was
     * buying three.
     */
    { id: 'fourthbell', name: 'FOURTH BELL', levels: 2, line: '+1 toll on every knell.', apply: bump('mineTolls', 1) , icon: MARK.fourthbell },
    /*
     * Size only, and capped at two. It sold burn as well until build 212, and
     * with no `levels` the tree sold it three times -- so it was worth 2.46x
     * the radius and 3.05x the damage, on THORN's ground as much as on
     * SPORE's, which took a THORN mine to 518 damage a second on its own.
     * What SPORE wants from an upgrade is reach, because reach is what makes
     * a patch worth placing; the damage it already has.
     */
    { id: 'bloomout', name: 'BLOOM OUT', levels: 2, line: '+35% patch size.', apply: scale('patchR', 1.35) , icon: MARK.bloomout },
    { id: 'secondgrowth', name: 'SECOND GROWTH', levels: 1,
      line: '+1 patch of burning ground at once.',
      apply: bump('patchCap', 1), icon: MARK.secondgrowth },
    /*
     * Two levels, written out. It had none, and `tree.js` reads
     * `u.levels ?? 3` -- so it was sold three times and a fully bought SPALL
     * threw 14 * 1.6^3 = 57 projectiles in one frame, from up to four mines
     * at once with PAIRED CHARGE. That is the HOT LOAD trap CLAUDE.md
     * records, on a node that also happens to be a particle budget.
     */
    { id: 'buckshot', name: 'BUCKSHOT', levels: 2, line: '+60% spall pellets.', apply: scale('spallPellets', 1.6) , icon: MARK.buckshot },
    { id: 'splinter', name: 'SPLINTER', levels: 2,
      line: '+55% spall pellet blast radius.',
      apply: scale('spallBurst', 1.55), icon: MARK.splinter },
    /*
     * Two levels, written out. It had none, and `tree.js` reads
     * `u.levels ?? 3` -- so it was sold three times and a fully bought LODE
     * reached 94 * 1.4^3 = 258 units and pushed 2.74x as hard. At two it is
     * 184 units and 1.96x, which is still the widest field any mine makes.
     *
     * That radius is also drawn: the dashed ring and the chevrons are
     * computed from `up.lodeReach`, so the third level was the most
     * expensive circle on the field as well as the loudest.
     */
    { id: 'repulsor', name: 'REPULSOR', levels: 2, line: '+40% lode reach and push.', apply: (u) => { u.lodeReach *= 1.4; u.lodePush *= 1.4; } , icon: MARK.repulsor },
    { id: 'intake', name: 'INTAKE', levels: 1,
      line: 'Energy is taken in on contact, no PULSE needed. Louvres cut through the skirt.',
      apply: set('intake', true), icon: MARK.intake },
    { id: 'shockfront', name: 'SHOCKFRONT', levels: 2,
      line: '+30% PULSE reach and push.',
      apply: (u) => { u.pulseR *= 1.3; u.pulsePush *= 1.3; }, icon: MARK.shockfront },
    /*
     * WARD's three. It is the second ability in the tree with shaping of its
     * own (SPIRAL had one, PULSE has SHOCKFRONT) and it earns three because
     * it is the only one that is a STATE rather than an event: how far it
     * stands, how hard it cuts and how many arcs it throws are three separate
     * decisions about the same six seconds.
     */
    { id: 'standoff', name: 'STANDOFF', levels: 2,
      line: '+22% WARD radius.',
      apply: scale('wardR', 1.22), icon: MARK.bulwarkmark },
    { id: 'edged', name: 'EDGED', levels: 2,
      line: '+35% WARD damage.',
      apply: scale('wardCut', 1.35), icon: MARK.edgemark },
    { id: 'fork', name: 'FORK', levels: 1,
      line: '+1 arc off the WARD at a time.',
      apply: bump('wardArcs', 1), icon: MARK.forkmark },
    /*
     * Two levels, written out -- 0.64 of every cooldown. It had none, and
     * `tree.js` reads `u.levels ?? 3`, so the one node in this branch that
     * touches all eight buttons was the one node in this branch with no cap:
     * 0.8^3 = 0.512, half of every clock on the bar, against neighbours that
     * all name their own number (STANDOFF 2, EDGED 2, FORK 1, SHOCKFRONT 2).
     * The HOT LOAD and REPULSOR trap for the third time; see CLAUDE.md.
     */
    { id: 'standing', name: 'STANDING ORDER', levels: 2, line: '-20% ability cooldowns.', apply: quicken('cooldown', 0.8) , icon: MARK.standing },
  ],
  TURRET: [
    /*
     * One step, from build 178. It had two -- FEED and RUNAWAY FEED, 0.64 of
     * the interval between them -- and before that no `levels` at all, which
     * means Infinity here: it could be taken over and over for the same 20%,
     * a stack rather than a ladder.
     *
     * The second step went because the cadence at the top was too high and
     * this is the honest place to take it off: a level of an upgrade, priced
     * and named, rather than a slope quietly retuned underneath one. What it
     * is worth is 20% of the interval instead of 36%.
     *
     * It was worth knowing what this did NOT fix. scripts/tiers.mjs measured
     * the whole cadence ladder on build 177: FEED's two levels together came
     * to 1.56x on rounds a second, and DOUBLE TAP into TRIPLE TAP came to 3x
     * on top of it -- the cliff was the taps, not this. TRIPLE TAP itself
     * went in build 189, which is the last of that ladder. See
     * CFG.rounds.standard.tapFade and docs/pacing.md.
     */
    /*
     * This branch is named for what it bolts on rather than for the stat it
     * moves. Every one of them puts a visible fitting on the machine — see
     * Shooter.drawRig() — and a row that says GIMBAL and then grows a gimbal
     * ring is a row you can point at. The line still states the effect,
     * because the effect is what is being paid for.
     */
    { id: 'rate', name: 'FEED', levels: 1,
      line: '+10% fire rate. A belt box on the breech flank.',
      apply: quicken('rate', 0.9), icon: MARK.rate },
    { id: 'slew', name: 'GIMBAL', line: '+50% auto aim turn speed. Another row of teeth on the bearing.', apply: scale('slew', 1.5) , icon: MARK.slew },
    /*
     * The only thing on the machine that acts without being asked, and it is
     * deliberately not an ability: no charge, no slot, nothing on the bar.
     * See CFG.pile for why it is a ring that travels outward rather than a
     * blast, and why that is what keeps the glitch fuse answerable.
     */
    { id: 'pile', name: 'PILE', levels: 3,
      line: 'A wave through the floor every 8s: what is closing gets thrown back. A weight in the deck.',
      apply: bump('pile', 1), icon: MARK.pile },
    /*
     * 40 a level to 70 in build 218. At 120 a second fully bought it took 4.2
     * seconds to kill a tier-20 body standing on the turret, against a fuse
     * that runs out in fourteen -- so three levels of it bought about a third
     * of an answer to the one thing it is for. At 210 that is 2.4 seconds,
     * which is a plate stack that actually holds the mount.
     */
    { id: 'casing', name: 'SPINES', line: 'Objects touching you take 70 damage a second. Armour plates round the deck.', apply: bump('casing', 70) , icon: MARK.casing },
    { id: 'insulation', name: 'SHROUD', line: 'Corruption costs half as much energy. A mantlet closing round the breech.', apply: scale('insulation', 0.5) , icon: MARK.insulation },
    /*
     * Two steps, and the only thing in the branch that changes what auto aim
     * can see rather than how it behaves once it has seen it. GIMBAL is how
     * fast the barrel comes round; this is whether there is anything there to
     * come round to. Base reach is CFG.shooter.aimRange — see the note there
     * for why 400 and what 841 buys.
     */
    /*
     * The one part in the branch that changes what the assist is willing to
     * shoot rather than how well it shoots it.
     *
     * DRIFT is the only thing on the field auto aim has ever refused. That is
     * deliberate -- grey is harmless, the bonus wave is grey and nothing else,
     * and "the assists are dead weight here, aim it yourself" is the whole
     * beat of that wave. This sells the other option: a screen across the
     * array's mouth that lets the grey through as a target, and a third
     * position on the AUTO AIM button that hunts it and nothing else.
     *
     * Two levels, and the second is the automation. The first sells the
     * CHOICE -- grey instead of the field, which is a trade, because sweeping
     * salvage and answering a wave are not the same job. The second sells the
     * end of the choice: both at once, no decision to make, the least manual
     * the turret ever gets. That is worth paying for twice and worth being
     * two rungs apart, which is why it is not one level that does both.
     *
     * Nothing else in the branch is a mode. This one has to be -- see
     * Game.aimModes and the row the AUTO AIM cell opens.
     */
    { id: 'driftaim', name: 'SIEVE', levels: 2,
      line: 'A third position on AUTO AIM: hunt DRIFT and nothing else. A sorting screen over the array.',
      tiers: [null, {
        name: 'OPEN SIEVE',
        line: 'A fourth position: grey and hostile together. The turret stops needing to be told which.',
      }],
      apply: bump('driftAim', 1), icon: MARK.driftaim },
    { id: 'aimrange', name: 'ARRAY', levels: 2,
      line: '+45% auto aim range. A flat fin off the back.',
      tiers: [null, { name: 'DEEP ARRAY', line: '+45% again, on top of ARRAY. A second fin, and the sweep reaches the top of the field.' }],
      apply: scale('aimRange', 1.45), icon: MARK.aimrange },
  ],
  /*
   * ---- the way in ----
   *
   * Not an upgrade of anything. It buys one arrival: the banner lights, and
   * pressing it opens the hole ORDINAL comes out of. Its own axis because it
   * belongs to none of the three a run is a shape of, always available
   * because it hangs off a category rather than behind anything, and
   * flat-priced because the only gate on it is meant to be energy.
   *
   * Repeatable with no ceiling. It was `levels: 9`, which is a ceiling on how
   * many have ever been *bought* rather than on how many are held -- so a long
   * session that opened the way nine times could never buy a tenth, with
   * nothing held and nothing to show for it.
   */
  /*
   * ---- the ways in ----
   *
   * One slot per boss, and a colour each. ORDINAL is the only one behind a
   * door so far; the other six are the doors, standing there unopened, and
   * they are named by number until there is something to name them after.
   *
   * The colours are the point of showing them at all. Each boss owns a hue
   * that nothing else on the field uses, so ORDINAL's magenta means ORDINAL
   * the way DRIFT's grey means harmless — and the ANOMALY heading carries all
   * seven at once, which is the only place in the game that says how many
   * there are going to be.
   */
  /*
   * Not upgrades to the machine, the rack or the field: two decisions about
   * the WAVE that is running. They sit at the top of the tree beside RECAST
   * for the same reason it does -- there is no category they are a member of.
   */
  WAVE: [
    /*
     * ---- the wave sheet's two decisions (build 205) ----
     *
     * Not abilities: the strip is full at eight, and neither of these is
     * something the turret DOES -- they are things done to a wave. They live
     * on the rail's own sheet, and `rung` seals them until a run has stood on
     * rung 10, which is where the ladder starts asking questions worth
     * answering.
     */
    { id: 'recall', name: 'RECALL', levels: 1, rung: 10,
      line: 'End the running wave and take what is cleared. One, then a minute.',
      apply: (up, world) => {
        world.director.recall.max = 1;
        world.director.recall.held = 1;
      }, icon: MARK.standing },
    { id: 'overclock', name: 'OVERCLOCK', levels: 1, rung: 10,
      line: 'The next wave arrives twice as fast and pays double.',
      apply: (up, world) => {
        world.director.overclock.max = 1;
        world.director.overclock.held = 1;
      }, icon: MARK.standing },
  ],
  ANOMALY: [
    { id: 'aperture', name: 'ORDINAL APERTURE', repeat: true,
      cost: CFG.ordinal.cost, step: 0,
      line: 'Opens the way. Something on the other side has been counting, and it will come through.',
      apply: (up, world) => { world.aperture = (world.aperture || 0) + 1; },
      tone: TONES[0], icon: MARK.aperture },
    ...SLEEPING,
    /*
     * ---- what the count leaves behind ----
     *
     * Paid for in REMAINDERs, not energy: one boss, one REMAINDER, one
     * RECAST. It is the only thing in the game with a currency of its own,
     * which is the whole reason to have one -- an upgrade that cannot be
     * ground out is a different kind of decision from one that can.
     *
     * It sits above every category in the tree rather than inside one,
     * because it is not an upgrade to the machine or the rack or the field:
     * it is what you do with what the bosses leave.
     *
     * It does nothing yet, and says so. What it will do is change what the
     * turret *is* rather than what it has: every other purchase bolts
     * something onto the machine, and this one is meant to replace it.
     */
    { id: 'recast', name: 'RECAST', repeat: true,
      currency: 'remainder', cost: CFG.ordinal.recast, step: 0,
      line: 'A new form for the turret. Not yet built — the REMAINDER is spent and nothing changes.',
      apply: () => {},
      tone: '#ffd9f6', icon: MARK.recast },
  ],
};

export const AXES = ['AMMO', 'FIELD', 'TURRET', 'WAVE', 'ANOMALY'];

/*
 * The other two kinds of permanent thing the tree sells. They are not
 * axes — a card is one of these or one of the three above — but they are what
 * the tier is mostly for now: the turret starts with BOLT and PULSE, and every
 * other round, mine and ability is bought here.
 */

/** The mark for a locked thing is the mark it will have once it is unlocked. */
const armIcon = (key) => (ARSENAL.find((a) => a.key === key) || {}).icon
  || (ABILITIES.find((a) => a.id === key) || {}).icon
  || '';

const armName = (key) => (ARSENAL.find((a) => a.key === key) || {}).label
  || (ABILITIES.find((a) => a.id === key) || {}).name
  || key.toUpperCase();

/**
 * One card per locked thing, carrying the same sentence the caption will give
 * on first use — the card that hands you a round and the caption that greets
 * you using it say the same thing, so neither has to be read twice.
 */
export const UNLOCKS = Object.values(LOCKABLE).flat().map((key) => ({
  id: `open_${key}`,
  key,
  axis: 'UNLOCK',
  name: armName(key),
  // The caption's own name prefix comes off — the card already has the name in
  // its heading — and its authored line break with it, because a card is one
  // paragraph and not two lines. For a round or a mine that leaves the damage
  // and the effect exactly as the loadout sheet states them.
  line: (FIRST_USE[key] || '').replace(/^[A-Z ]+\. /, '').replace(/\s+/g, ' '),
  icon: armIcon(key),
  apply: (up, world) => {
    world.unlocked.add(key);
    // A round or a mine goes onto the strip if there is a free cell for it.
    // The game does the placing, because it also has to rebuild the strip.
    if (world.carry) world.carry(key);
  },
}));

/**
 * A second use of one ability, held in hand. Only ever offered for an ability
 * that has actually been unlocked, and only once each — offering a charge for
 * something the player has never seen is a card that cannot be read.
 */
export const CHARGES = ABILITIES.map((a) => ({
  id: `charge_${a.id}`,
  key: a.id,
  axis: 'CHARGE',
  name: `${a.name} x2`,
  line: 'Hold a second use of it, ready before the wait.',
  icon: a.icon,
  apply: (up, world) => { world.abilities.grantCharge(a.id); },
}));
export const ALL_UPGRADES = AXES.flatMap((a) => UPGRADES[a].map((u) => ({ ...u, axis: a })));

/**
 * Every permanent thing the tree can hand over, by id. A saved run keeps
 * the ids it accepted rather than the numbers they produced, and replaying
 * them through this rebuilds world.up, the ability charges and the held counts
 * from the table that defines them — so a retuned upgrade is retuned for a
 * resumed run too, instead of the save carrying a stale figure forever.
 */
export const BY_ID = new Map(
  [...ALL_UPGRADES, ...UNLOCKS, ...CHARGES].map((u) => [u.id, u]),
);

/*
 * Everything, flat, for the tests and the record.
 *
 * UPGRADES, AXES, UNLOCKS, CHARGES and ALL_UPGRADES are exported and nothing
 * in src/ imports them: the per-feature suite does, and they are the seam it
 * reads a run's whole offer table through. Deleting them because a dead-export
 * scan flags them would take the tests with them. Same for events.rollSmall
 * and save.captureRun.
 */


/**
 * One from each axis. An upgrade that cannot stack is not offered twice; the
 * repeatable ones can come round again, which is what makes a long run able to
 * lean rather than merely collect.
 */
/*
 * How many times one upgrade may ever be taken, and what its card says at each
 * level.
 *
 * **`levels` absent means THREE.** `tree.js` reads `u.levels ?? 3`, and the
 * only thing that means "without limit" is `repeat`. This paragraph said the
 * opposite for a long time -- "`levels` absent means without limit, which is
 * still the right answer for a plain scalar" -- and it is the documentation
 * the trap keeps being read out of: six nodes have now shipped uncapped
 * because their author read this and believed it. HOT LOAD (build 193, 0.85
 * cubed on the fire interval, worth more than the FEED nerf that had just
 * been made for the same reason), BUCKSHOT (217), REPULSOR and STANDING
 * ORDER (219, the latter halving every clock on the ability bar against a row
 * that says -20%), then FIFTH LINK, FOURTH BELL and PAIRED CHARGE (220), each
 * of which is named after the number it was supposed to produce and produced
 * a larger one.
 *
 * `levels: 1` is the one-shot: a switch cannot be thrown twice. Anything in
 * between is an upgrade with a shape to it, and `tiers` lets a level be a
 * different card: a second level of SIEVE is not "SIEVE again", it is OPEN
 * SIEVE and it hands over a position the first one did not, and the offer
 * should say so.
 *
 * Write the number. A percentage dial that genuinely wants three is one word
 * longer and costs nothing; a node with no `levels` is indistinguishable from
 * one whose author forgot.
 */



