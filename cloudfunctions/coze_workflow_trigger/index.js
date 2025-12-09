const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event) => {
  const { input,conversation_id,conversation_history } = event
  // 1. 在数据库创建任务记录
  const taskRes = await db.collection('search_tasks').add({
    data: {
      status: 'processing', // 状态：处理中
      query: input,
      result: {},
      createdAt: db.serverDate(),
      updatedAt: db.serverDate(),
      conversation_id: conversation_id,
      conversation_history: conversation_history  // 保存到数据库
    }
  })
  const taskId = taskRes._id

  // 2. 重要：异步触发耗时函数，不等待结果
  // 使用 catch 防止触发错误影响主流程
  cloud.callFunction({
    name: 'coze_workflow', // 调用你的工作函数
    data: {
      taskId: taskId,
      input: input,
      conversation_id: conversation_id,
        conversation_history: conversation_history,  // 关键：传过去
    },
  }).catch(err => {
    // 判断如果是超时错误，只记录警告，不影响主流程
    if (err.errMsg && err.errMsg.includes('ESOCKETTIMEDOUT')) {
      console.warn('⚠️ 触发后台任务请求超时，但任务可能已在后端执行。错误详情:', err);
    } else {
      // 其他错误仍需关注
      console.error('❌ 触发后台任务发生未知错误:', err);
      // 可以选择在此处更新数据库状态为 failed，增强健壮性
    }
  });

  // 3. 立即返回任务ID给小程序
  return {
    code: 0,
    data: {
      taskId: taskId,
      message: '任务已开始处理，请等待...'
    }
  }
}