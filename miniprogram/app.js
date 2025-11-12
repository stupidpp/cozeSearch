// app.js

App({
  onLaunch: function () {
    if (!wx.cloud) {
      console.error("请使用 2.2.3 或以上的基础库以使用云能力");
    } else {
      wx.cloud.init({
        // env 参数说明：
        //   env 参数决定接下来小程序发起的云开发调用（wx.cloud.xxx）会默认请求到哪个云环境的资源
        //   此处请填入环境 ID, 环境 ID 可打开云控制台查看
        //   如不填则使用默认环境（第一个创建的环境）
        env: "cloud1-6gpui97oad126d42",
        traceUser: true,
      });
    }
    
    // 简单的全局事件系统
    const eventMap = new Map();
    wx.$on = function(event, callback) {
      if (!eventMap.has(event)) {
        eventMap.set(event, []);
      }
      eventMap.get(event).push(callback);
    };
    
    wx.$off = function(event, callback) {
      if (eventMap.has(event)) {
        const callbacks = eventMap.get(event);
        const index = callbacks.indexOf(callback);
        if (index > -1) {
          callbacks.splice(index, 1);
        }
      }
    };
    
    wx.$emit = function(event, data) {
      if (eventMap.has(event)) {
        eventMap.get(event).forEach(callback => {
          try {
            callback(data);
          } catch (e) {
            console.error('Event callback error:', e);
          }
        });
      }
    };
  },
});
