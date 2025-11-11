const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext();
  const { action } = event || {};

  if (!OPENID) {
    return { code: 401, message: 'unauthorized' };
  }

  try {
    if (action === 'add') {
      const { prof } = event;
      if (!prof || !prof.profId) return { code: 400, message: 'prof missing' };
      const score = Number(prof.displayScore || prof.score || 0) || 0;
      const doc = {
        openid: OPENID,
        profId: prof.profId,
        prof,
        score,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      // upsert: if exists, update; else add
      const existed = await db.collection('favorites').where({ openid: OPENID, profId: prof.profId }).get();
      if (existed.data && existed.data.length) {
        const id = existed.data[0]._id;
        await db.collection('favorites').doc(id).update({ data: { prof, score, updatedAt: Date.now() } });
        return { code: 0, message: 'updated' };
      } else {
        await db.collection('favorites').add({ data: doc });
        return { code: 0, message: 'added' };
      }
    }

    if (action === 'remove') {
      const { profId } = event;
      if (!profId) return { code: 400, message: 'profId missing' };
      await db.collection('favorites').where({ openid: OPENID, profId }).remove();
      return { code: 0, message: 'removed' };
    }

    if (action === 'list') {
      const { sortBy = 'time', order = 'desc' } = event;
      const field = sortBy === 'score' ? 'score' : 'updatedAt';
      const res = await db
        .collection('favorites')
        .where({ openid: OPENID })
        .orderBy(field, order === 'asc' ? 'asc' : 'desc')
        .get();
      const list = (res.data || []).map((d) => d.prof);
      return { code: 0, data: list };
    }

    return { code: 400, message: 'unknown action' };
  } catch (e) {
    return { code: 500, message: e.message || 'error', error: e };
  }
}; 