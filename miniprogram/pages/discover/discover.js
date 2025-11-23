// pages/discover/discover.js
Page({
  /**
   * 页面的初始数据
   */
  data: {
    professors: [
      { name: '何晓飞', avatar: '/assets/教授头像/何晓飞.jpg' },
      { name: '余露山', avatar: '/assets/教授头像/余露山.jpg' },
      { name: '张克俊', avatar: '/assets/教授头像/张克俊.jpg' },
      { name: '杨宗银', avatar: '/assets/教授头像/杨宗银.jpg' },
      { name: '林贤丰', avatar: '/assets/教授头像/林贤丰.jpg' },
      { name: '柴春雷', avatar: '/assets/教授头像/柴春雷.jpg' },
      { name: '游剑', avatar: '/assets/教授头像/游剑.jpg' },
      { name: '郑小林', avatar: '/assets/教授头像/郑小林.png' },
      { name: '陈刚', avatar: '/assets/教授头像/陈刚.jpg' },
      { name: '陈纯', avatar: '/assets/教授头像/陈纯.jpg' },
      { name: '顾臻', avatar: '/assets/教授头像/顾臻.jpg' }
    ],
    inventions: [
      {
        title: '新疆荒漠游来东海"虾兵蟹将" 浙江科技援疆结硕果',
        image: '/assets/discover-news/news1.png',
        url: 'https://www.toutiao.com/article/7430725866823221775/'
      },
      {
        title: '浙江团队成功研发全球首款"骨胶水"！粉碎的骨头一粘就好，未来有望一针治愈骨折',
        image: '/assets/discover-news/news2.png',
        url: 'https://news.qq.com/rain/a/20250909A053Y100'
      },
      {
        title: '国内首例植入式脑机接口临床研究完成',
        image: '/assets/discover-news/news3.png',
        url: 'https://m.huanqiu.com/article/3weNhFnAgYt'
      },
      {
        title: '重大突破，浙大团队创造出新物质"弹性陶瓷塑料"！堪称五边形战士',
        image: '/assets/discover-news/news4.png',
        url: 'https://www.thepaper.cn/newsDetail_forward_23486436'
      }
    ]
  },

  /**
   * 点击教授头像
   */
  onProfessorTap(e) {
    const { name } = e.currentTarget.dataset;
    const professorUrls = {
      '何晓飞': 'https://person.zju.edu.cn/0007101',
      '余露山': 'https://person.zju.edu.cn/yuls',
      '张克俊': 'https://person.zju.edu.cn/zhangkejun',
      '杨宗银': 'https://person.zju.edu.cn/0020059',
      '林贤丰': 'https://person.zju.edu.cn/LXF',
      '柴春雷': 'https://person.zju.edu.cn/id',
      '游剑': 'https://person.zju.edu.cn/jyou',
      '郑小林': 'https://person.zju.edu.cn/xlzheng',
      '陈刚': 'https://person.zju.edu.cn/0098112',
      '陈纯': 'https://person.zju.edu.cn/chenc',
      '顾臻': 'https://person.zju.edu.cn/0020202'
    };

    const targetUrl = professorUrls[name];
    if (targetUrl) {
      wx.showModal({
        title: `查看${name}教授详情`,
        content: '是否在浏览器中打开教授主页？',
        confirmText: '立即打开',
        cancelText: '取消',
        success: (res) => {
          if (res.confirm) {
            wx.navigateToMiniProgram({
              appId: 'wxeb7b6f8b8b8b8b8b', // 需要申请小程序跳转
              path: `pages/web/index?url=${encodeURIComponent(targetUrl)}`
            }).catch(() => {
              // 如果小程序跳转失败，使用复制链接方式
              wx.setClipboardData({
                data: targetUrl,
                success: () => {
                  wx.showModal({
                    title: '提示',
                    content: '链接已复制到剪贴板，请在浏览器中粘贴打开',
                    showCancel: false
                  });
                }
              });
            });
          }
        }
      });
    }
  },

  /**
   * 点击新成果卡片
   */
  onInventionTap(e) {
    const index = e.currentTarget.dataset.index;
    const invention = this.data.inventions[index];
    
    if (invention.url) {
      wx.showModal({
        title: '查看新闻详情',
        content: '是否在浏览器中打开新闻页面？',
        confirmText: '立即打开',
        cancelText: '取消',
        success: (res) => {
          if (res.confirm) {
            wx.navigateToMiniProgram({
              appId: 'wxeb7b6f8b8b8b8b8b', // 需要申请小程序跳转
              path: `pages/web/index?url=${encodeURIComponent(invention.url)}`
            }).catch(() => {
              // 如果小程序跳转失败，使用复制链接方式
              wx.setClipboardData({
                data: invention.url,
                success: () => {
                  wx.showModal({
                    title: '提示',
                    content: '链接已复制到剪贴板，请在浏览器中粘贴打开',
                    showCancel: false
                  });
                }
              });
            });
          }
        }
      });
      }
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad(options) {

  },

  /**
   * 生命周期函数--监听页面初次渲染完成
   */
  onReady() {

  },

  /**
   * 生命周期函数--监听页面显示
   */
  onShow() {

  },

  /**
   * 生命周期函数--监听页面隐藏
   */
  onHide() {

  },

  /**
   * 生命周期函数--监听页面卸载
   */
  onUnload() {

  },

  /**
   * 页面相关事件处理函数--监听用户下拉动作
   */
  onPullDownRefresh() {

  },

  /**
   * 页面上拉触底事件的处理函数
   */
  onReachBottom() {

  },

  /**
   * 用户点击右上角分享
   */
  onShareAppMessage() {

  }
})