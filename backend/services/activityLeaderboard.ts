import {query} from '../config/db.js';

export const activityPolicy = 'Activity ranking by total earned XP, including interview and achievement rewards. This is not a verified technical-skill ranking. Equal XP shares rank (1, 1, 3); ties display in stable account order. Participation is opt-in under a public alias.';

/** Rank all consenting participants before limiting output, so self keeps their global rank.
 * Persisted totals include historical awards and badges; the reward ledger alone is not a total.
 * No user/session identifiers or account profile fields leave this service. */
export async function activityLeaderboard(userId: string) {
  const [preferences, results] = await Promise.all([
    query('SELECT opted_in,display_name FROM practice_leaderboard_preferences WHERE user_id=$1', [userId]),
    query(`WITH ranked AS (
      SELECT p.user_id,p.display_name,coalesce(g.xp,u.xp,0) AS xp,
        coalesce(g.level,u.current_level,1) AS level,
        rank() OVER (ORDER BY coalesce(g.xp,u.xp,0) DESC) AS rank,
        row_number() OVER (ORDER BY coalesce(g.xp,u.xp,0) DESC,p.user_id) AS position,
        count(*) OVER () AS participants
      FROM practice_leaderboard_preferences p JOIN users u ON u.id=p.user_id
      LEFT JOIN gamification g ON g.user_id=p.user_id WHERE p.opted_in=true
    ) SELECT display_name,xp,level,rank,participants,user_id=$1 AS self
      FROM ranked WHERE position<=100 OR user_id=$1 ORDER BY position`, [userId])
  ]);
  const preference = preferences.rows[0];
  return {policy: activityPolicy, preference: {optedIn: preference?.opted_in===true, displayName: preference?.display_name||''},
    participants: Number(results.rows[0]?.participants||0),
    entries: results.rows.map(row=>({rank:Number(row.rank),name:row.display_name,level:row.level,xp:row.xp,self:row.self})),
    reason: preference?.opted_in ? null : 'You are not participating. Choose a public alias and opt in to show your XP.'};
}
