// pages/shared/shared.js
Page({
  data: {
    sharedData: null,
    messages: [],
    formattedTimestamp: '',
    loading: true
  },

  onLoad: function(options) {
    try {
      if (options.data) {
        const sharedData = JSON.parse(decodeURIComponent(options.data));
        const formattedTimestamp = sharedData.timestamp ? new Date(sharedData.timestamp).toLocaleString() : '';
        this.setData({
          sharedData: sharedData,
          messages: sharedData.messages || [],
          formattedTimestamp: formattedTimestamp,
          loading: false
        });
        
        // 设置页面标题
        wx.setNavigationBarTitle({
          title: '分享的科研推荐'
        });
      } else {
        this.setData({ loading: false });
      }
    } catch (error) {
      console.error('解析分享数据失败:', error);
      this.setData({ loading: false });
      wx.showToast({
        title: '分享链接有误',
        icon: 'none'
      });
    }
  },

  onShareAppMessage: function() {
    return {
      title: '科研合作推荐结果',
      path: `/pages/shared/shared?data=${encodeURIComponent(JSON.stringify(this.data.sharedData))}`
    };
  },

  backToApp: function() {
    wx.switchTab({
      url: '/pages/index/index'
    });
  }
});
