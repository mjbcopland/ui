import {
  isRadiant,
  isSupport,
  getLevelFromXp,
} from 'utility';
import heroes from 'dotaconstants/json/heroes.json';
import specific from 'dotaconstants/json/specific.json';
import laneRole from 'dotaconstants/json/lane_role.json';
import analysis from './analysis';

const expanded = {};
Object.keys(specific).forEach((key) => {
  for (let i = 1; i < 5; i += 1) {
    expanded[key.replace('#', i)] = specific[key];
  }
});

const getMaxKeyOfObject = field =>
  (field ? Object.keys(field).sort((a, b) => Number(b) - Number(a))[0] : '');

/**
 * Generates data for c3 charts in a match
 **/
function generateGraphData(match) {
  if (match.players && match.players[0] && match.radiant_gold_adv && match.radiant_xp_adv) {
    // compute graphs
    const goldDifference = ['Gold', ...match.radiant_gold_adv];
    const xpDifference = ['XP', ...match.radiant_xp_adv];
    const time = ['time', ...match.players[0].times];
    const data = {
      difference: [time, xpDifference, goldDifference],
      gold: [time],
      xp: [time],
      lh: [time],
    };
    match.players.forEach((player) => {
      let hero = heroes[player.hero_id] || {};
      hero = hero.localized_name;
      if (player.gold_t) {
        data.gold.push([hero, ...player.gold_t]);
      }
      if (player.xp_t) {
        data.xp.push([hero, ...player.xp_t]);
      }
      if (player.lh_t) {
        data.lh.push([hero, ...player.lh_t]);
      }
    });
    return data;
  }
  return {};
}

/**
 * Generates position data for a player
 * keysObject, a hash of keys to process
 * sourceObject, an object containing keys with values as position hashes
 * Returns a new object with the same keys as keysObject and the values as arrays of position data
 **/
function generatePositionData(keysObject, sourceObject) {
  // 64 is the offset of x and y values
  // subtracting y from 127 inverts from bottom/left origin to top/left origin
  const result = {};
  Object.keys(keysObject).forEach((key) => {
    const t = [];
    Object.keys(sourceObject[key]).forEach((x) => {
      Object.keys(sourceObject[key][x]).forEach((y) => {
        t.push({
          x: Number(x) - 64,
          y: 127 - (Number(y) - 64),
          value: sourceObject[key][x][y],
        });
      });
    });
    result[key] = t;
  });
  return result;
}

function generateTeamfights(match) {
  const computeTfData = (tf) => {
    const newtf = {
      ...tf,
      posData: [],
      radiant_gold_delta: 0,
      radiant_xp_delta: 0,
      radiant_participation: 0,
      radiant_deaths: 0,
      dire_participation: 0,
      dire_deaths: 0,
    };
    newtf.players = match.players.map((player) => {
      const tfplayer = tf.players[player.player_slot % (128 - 5)];
      // compute team gold/xp deltas
      if (isRadiant(player.player_slot)) {
        newtf.radiant_gold_delta += tfplayer.gold_delta;
        newtf.radiant_xp_delta += tfplayer.xp_delta;
        newtf.radiant_participation += tfplayer.participate ? 1 : 0;
        newtf.radiant_deaths += tfplayer.deaths ? 1 : 0;
      } else {
        newtf.radiant_gold_delta -= tfplayer.gold_delta;
        newtf.radiant_xp_delta -= tfplayer.xp_delta;
        newtf.dire_participation += tfplayer.participate ? 1 : 0;
        newtf.dire_deaths += tfplayer.deaths ? 1 : 0;
      }
      return {
        ...player,
        ...tfplayer,
        participate: tfplayer.deaths > 0 || tfplayer.damage > 0 || tfplayer.healing > 0,
        level_start: getLevelFromXp(tfplayer.xp_start),
        level_end: getLevelFromXp(tfplayer.xp_end),
        posData: generatePositionData({
          deaths_pos: 1,
        }, tfplayer),
      };
    });
    return newtf;
  };
  return (match.teamfights || []).map(tf => computeTfData(tf));
}

function renderMatch(m) {
  /*
  // Not using for MVP
  // originally implemented by @coreymaher
  m.hero_combat = {
    damage: {
      radiant: 0,
      dire: 0,
    },
    kills: {
      radiant: 0,
      dire: 0,
    },
  };
  m.players.forEach(pm => {
    // Compute combat k/d and damage tables
    pm.hero_combat = {
      damage: {
        total: 0,
      },
      taken: {
        total: 0,
      },
      kills: {
        total: 0,
      },
      deaths: {
        total: 0,
      },
    };
    m.players.forEach((other_pm) => {
      const team = (pm.isRadiant) ? 'radiant' : 'dire';
      const other_hero = heroes[other_pm.hero_id];
      let damage = 0;
      let taken = 0;
      let kills = 0;
      let deaths = 0;
      // Only care about enemy hero combat
      if (pm.isRadiant !== other_pm.isRadiant && pm.damage) {
        damage = (pm.damage[other_hero.name]) ? pm.damage[other_hero.name] : 0;
        taken = (pm.damage_taken[other_hero.name]) ? pm.damage_taken[other_hero.name] : 0;
      }
      if (pm.isRadiant !== other_pm.isRadiant && pm.killed) {
        kills = (pm.killed[other_hero.name]) ? pm.killed[other_hero.name] : 0;
        deaths = (pm.killed_by[other_hero.name]) ? pm.killed_by[other_hero.name] : 0;
      }
      pm.hero_combat.damage[other_hero.name] = damage;
      pm.hero_combat.taken[other_hero.name] = taken;
      pm.hero_combat.damage.total += damage;
      pm.hero_combat.taken.total += taken;
      pm.hero_combat.kills[other_hero.name] = kills;
      pm.hero_combat.deaths[other_hero.name] = deaths;
      pm.hero_combat.kills.total += kills;
      pm.hero_combat.deaths.total += deaths;
      m.hero_combat.damage[team] += damage;
      m.hero_combat.kills[team] += kills;
    });
  });
  });
  */
  const newPlayers = m.players.map((player) => {
    const newPlayer = {
      ...player,
      desc: [laneRole[player.lane_role], isSupport(player) ? 'Support' : 'Core'].join('/'),
      multi_kills_max: getMaxKeyOfObject(player.multi_kills),
      kill_streaks_max: getMaxKeyOfObject(player.kill_streaks),
      analysis: analysis(m, player),
    };
    // filter interval data to only be >= 0
    if (player.times) {
      const intervals = ['lh_t', 'gold_t', 'xp_t', 'times'];
      intervals.forEach((key) => {
        newPlayer[key] = player[key].filter((el, i) => player.times[i] >= 0);
      });
    }
    // compute damage to towers/rax/roshan
    if (player.damage) {
      // npc_dota_goodguys_tower2_top
      // npc_dota_goodguys_melee_rax_top
      // npc_dota_roshan
      // npc_dota_neutral_giant_wolf
      // npc_dota_creep
      newPlayer.objective_damage = {};
      Object.keys(player.damage).forEach((key) => {
        let identifier = null;
        if (key.indexOf('tower') !== -1) {
          identifier = key.split('_').slice(3).join('_');
        }
        if (key.indexOf('rax') !== -1) {
          identifier = key.split('_').slice(4).join('_');
        }
        if (key.indexOf('roshan') !== -1) {
          identifier = 'roshan';
        }
        if (key.indexOf('fort') !== -1) {
          identifier = 'fort';
        }
        newPlayer.objective_damage[identifier] = newPlayer.objective_damage[identifier] ?
          newPlayer.objective_damage[identifier] + player.damage[key] :
          player.damage[key];
      });
    }
    if (player.killed) {
      newPlayer.specific = {};
      // expand keys in specific by # (1-4)
      // map to friendly name
      // iterate through keys in killed
      // if in expanded, put in pm.specific
      Object.keys(player.killed).forEach((key) => {
        if (key in expanded) {
          const name = expanded[key];
          newPlayer.specific[name] = newPlayer.specific[name] ? newPlayer.specific[name] + newPlayer.killed[key] : newPlayer.killed[key];
        }
      });
    }
    if (player.purchase) {
      newPlayer.purchase_tpscroll = player.purchase.tpscroll;
      newPlayer.purchase_ward_observer = player.purchase.ward_observer;
      newPlayer.purchase_ward_sentry = player.purchase.ward_sentry;
      newPlayer.purchase_smoke_of_deceit = player.purchase.smoke_of_deceit;
      newPlayer.purchase_dust = player.purchase.dust;
      newPlayer.purchase_gem = player.purchase.gem;
    }
    return newPlayer;
  });
  return {
    ...m,
    graphData: generateGraphData(m),
    teamfights: generateTeamfights(m),
    players: newPlayers,
  };
}

export default renderMatch;
