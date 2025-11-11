Page({
  onLoad() {
    wx.showToast({ title: '请用左上角侧边栏查看历史会话', icon: 'none', duration: 2000 });
    setTimeout(() => { wx.navigateBack({ fail: () => wx.switchTab && wx.switchTab({ url: '/pages/chatBot/chatBot' }) }); }, 1800);
  }
}); 