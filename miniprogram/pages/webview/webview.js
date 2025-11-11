// pages/webview/webview.js
Page({
  /**
   * 页面的初始数据
   */
  data: {
    url: ''
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad(options) {
    if (options.url) {
      this.setData({
        url: decodeURIComponent(options.url)
      });
    }
    
    // 根据传入的 title 参数设置导航栏标题
    if (options.title) {
      wx.setNavigationBarTitle({
        title: decodeURIComponent(options.title)
      });
    }
  }
})
