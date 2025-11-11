const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

const COL = 'teacherinfo';

function esc(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function mkRe(s) { return db.RegExp({ regexp: esc(s), options: 'i' }); }
function splitAreas(str) {
  if (!str) return [];
  return String(str)
    .split(/[、，,;；\s\/\|]+/)
    .map(s => s.trim())
    .filter(Boolean);
}

exports.main = async (event, context) => {
  try {
    const { q = '', tags = [], page = 1, pageSize = 5, sortBy = 'time' } = event || {};
    const tokens = String(q || '').split(/[\s，,]+/).map(s => s.trim()).filter(Boolean);

    // 1) 条件构造：tags 对 研究方向 模糊匹配；q 对多个中文字段 OR 匹配
    const conds = [];
    if (tags && tags.length) {
      conds.push(_.or(tags.map(t => ({ ['研究方向']: mkRe(t) }))));
    }
    for (const t of tokens) {
      conds.push(_.or([
        { ['中文名']: mkRe(t) },
        { ['院系']: mkRe(t) },
        { ['单位']: mkRe(t) },
        { ['研究方向']: mkRe(t) },
        { ['个人简介']: mkRe(t) },
        { info3: mkRe(t) },
        { info4: mkRe(t) },
        { info5: mkRe(t) },
        { info6: mkRe(t) },
        { ['邮箱']: mkRe(t) },
        { url: mkRe(t) },
      ]));
    }
    const where = conds.length ? _.and(conds) : {};

    const countRes = await db.collection(COL).where(where).count();
    const total = countRes.total || 0;

    const skip = Math.max(0, (page - 1) * pageSize);
    const fetchSize = Math.min(pageSize * 3, 100);

    // teacherinfo 未必有 updatedAt，用 _id 兜底
    const orderField = 'updatedAt';
    let query = db.collection(COL).where(where);
    try {
      query = query.orderBy(orderField, 'desc');
    } catch (e) {
      query = query.orderBy('_id', 'desc');
    }
    const res = await query.skip(skip).limit(fetchSize).get();

    const docs = res.data || [];
    const scoreDoc = (doc) => {
      if (sortBy === 'time') return 0;
      let s = 0;
      const name = String(doc['中文名'] || doc['教师姓名'] || '');
      const school = String(doc['院系'] || doc['单位'] || '');
      const areas = String(doc['研究方向'] || '');
      const infos = [doc['个人简介'], doc.info3, doc.info4, doc.info5, doc.info6].filter(Boolean).join(' ');
      for (const t of tokens) {
        const re = new RegExp(esc(t), 'i');
        if (re.test(name)) s += 3;
        if (re.test(areas)) s += 2;
        if (re.test(infos)) s += 1;
        if (re.test(school)) s += 1;
      }
      return s;
    };

    const withScore = docs.map(d => ({ ...d, _score: scoreDoc(d) }));
    withScore.sort((a, b) => {
      if (sortBy === 'time') return ((b.updatedAt || 0) - (a.updatedAt || 0)) || (String(b._id).localeCompare(String(a._id)));
      if ((b._score || 0) !== (a._score || 0)) return (b._score || 0) - (a._score || 0);
      return ((b.updatedAt || 0) - (a.updatedAt || 0)) || (String(b._id).localeCompare(String(a._id)));
    });

    const list = withScore.slice(0, pageSize).map(d => ({
      profId: String(d._id || d.id || ''),
      name: d['中文名'] || d['教师姓名'] || '',
      school: d['院系'] || d['单位'] || '',
      areas: splitAreas(d['研究方向']),
      email: d['邮箱'] || null,
      homepage: d['url'] || null,
      highlights: [d.info3, d.info4, d.info5, d.info6, d['个人简介']].filter(Boolean),
      updatedAt: d.updatedAt || 0,
    }));

    return { code: 0, data: { list, total, page, pageSize } };
  } catch (e) {
    return { code: 500, message: e.message || 'error' };
  }
}; 