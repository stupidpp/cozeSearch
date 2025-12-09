// 云函数 addFeedback
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

exports.main = async (event, context) => {
  const db = cloud.database();
  const { feedback, conversationId, userId } = event;
  
  try {
    const result = await db.collection('feedback').add({
      data: {
        ...feedback,
        conversationId,
        userId,
        createTime: db.serverDate()
      }
    });
    
    return { code: 0, data: result, message: '评价提交成功' };
  } catch (err) {
    return { code: -1, message: '提交失败', error: err };
  }
};