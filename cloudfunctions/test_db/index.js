const cloud = require('wx-server-sdk')
cloud.init({ env: process.env.ENV }) // 注意：云函数内固定这样写
const db = cloud.database()

exports.main = async (event) => {
    // 测试1：写入一条数据
    const addRes = await db.collection('search_tasks').add({
        data: {
            status: 'test',
            result: { msg: 'Hello from cloud function' }, // 注意：result直接是对象
            createdAt: db.serverDate()
        }
    })
    console.log('写入成功，ID:', addRes._id)

    // 测试2：读取这条数据
    const getRes = await db.collection('search_tasks').doc(addRes._id).get()
    console.log('读取成功，数据:', getRes.data)

    return {
        code: 0,
        data: getRes.data
    }
}