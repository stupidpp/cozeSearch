const userManager = require('../../../utils/userManager');

Component({
  properties: {
    name: {
      type: String,
      value: "",
    },
    toolData: {
      type: Object,
      value: {},
    },
    toolParams: {
      type: Object,
      value: {},
    },
    // 新增：直接接收扣子工作流返回的 card_data
    cardData: {
      type: Object,
      value: null,
    },
    // 新增：只读模式，用于分享页面
    readOnly: {
      type: Boolean,
      value: false,
    },
    // 新增：多选模式
    multiSelectMode: {
      type: Boolean,
      value: false,
    },
    // 新增：消息是否被选中
    messageSelected: {
      type: Boolean,
      value: false,
    },
  },
  data: {
    candidates: [],
    favStatus: {}
  },
  lifetimes: {
    /*attached: function() {

      // 兼容两种来源：1) 旧版 toolData.content；2) 新版 cardData
      this.tryInitFromToolData(this.data.toolData);
      this.tryInitFromCardData(this.data.cardData);
      
      // 监听收藏状态变更事件
      const self = this;
      this._onFavoriteChanged = function(e) {
        self.refreshFavoriteStates();
      };
      wx.$on && wx.$on('favoriteChanged', this._onFavoriteChanged);
      
    },

    


    detached: function() {
      // 清理事件监听
      wx.$off && wx.$off('favoriteChanged', this._onFavoriteChanged);
    },*/
    attached: function() {
      this.tryInitFromToolData(this.data.toolData);
      this.tryInitFromCardData(this.data.cardData);
      
      const self = this;
      this._onFavoriteChanged = function(eventData) {
        const {profId, uniqueKey, isFav } = eventData || {};
        

        console.log('列表组件收到事件，更新:', {profId,uniqueKey}, '->', isFav);
        
        let targetProfId, targetUniqueKey;
  
  // 情况1：同时提供了 profId 和 uniqueKey
  if (profId && uniqueKey) {
    targetProfId = profId;
    targetUniqueKey = uniqueKey;
  } 
  // 情况2：只提供了 profId
  else if (profId) {
    const targetProf = self.data.candidates.find(prof => prof.profId === profId);
    if (targetProf) {
      targetProfId = profId;
      targetUniqueKey = targetProf.uniqueKey;
    }
  } 
  // 情况3：只提供了 uniqueKey
  else if (uniqueKey) {
    const targetProf = self.data.candidates.find(prof => prof.uniqueKey === uniqueKey);
    if (targetProf) {
      targetProfId = targetProf.profId;
      targetUniqueKey = uniqueKey;
    }
  }
  
  if (!targetProfId || !targetUniqueKey) return;
  
  // 同时更新 favStatus 中 profId 和 uniqueKey 对应的状态
  const newFavStatus = {
    ...self.data.favStatus,
    [targetProfId]: isFav,
    [targetUniqueKey]: isFav
  };
  
  // 更新 candidates 中的 isFav
  const newCandidates = self.data.candidates.map(prof => 
    (prof.profId === targetProfId || prof.uniqueKey === targetUniqueKey) 
      ? { ...prof, isFav: isFav } 
      : prof
  );
        self.setData({
          favStatus: newFavStatus,
          candidates: newCandidates
        });
        // ❌ 移除 self.refreshFavoriteStates() 调用
      };
      wx.$on && wx.$on('favoriteChanged', this._onFavoriteChanged);
    },
  },
  
  observers: {
    // 属性变更时也同步
    toolData: function(val) {
      this.tryInitFromToolData(val);
    },
    cardData: function(val) {
      this.tryInitFromCardData(val);
    },
  },
  methods: {
    normPercent: function(n) {
      if (n === undefined || n === null) return 0;
      const x = Number(n);
      if (Number.isNaN(x)) return 0;
      // 如果是 0-1 小数，转百分比；如果是 0-100 直接四舍五入
      if (x <= 1) return Math.round(Math.max(0, Math.min(1, x)) * 100);
      return Math.round(Math.max(0, Math.min(100, x)));
    },
    decorate: function(list) {
      const self = this;
      return (list || []).map(function(c, index) {
        const result = Object.assign({}, c, {
          displayScore: self.normPercent(c.displayScore !== undefined ? c.displayScore : c.score),
          isFav: !!c.isFav,
          uniqueKey: c.uniqueKey || 'prof_' + Date.now() + '_' + index
        });

        return result;
      });
    },
    tryInitFromToolData: function(toolData) {
      try {
        const content = (toolData || {}).content;
        if (Array.isArray(content) && content[0] && content[0].type === "text") {
          const payload = JSON.parse(content[0].text);
          const candidates = (payload || {}).candidates || [];
          const decorated = this.decorate(candidates);
          this.setData({ candidates: decorated });
        }
      } catch (e) {
        console.log("professor-list parse error (toolData)", e);
      }
    },
    tryInitFromCardData: function(cardData) {
      try {
        if (!cardData || typeof cardData !== 'object') return;
        const type = cardData.type;
        const professors = cardData.professors;
        if (type === 'professor_list' && Array.isArray(professors)) {
          // ✅ 1. 统一使用用户专属Key读取
          const userManager = require('../../../utils/userManager');
          const favoritesKey = userManager.getUserFavoritesKey();
          const favorites = wx.getStorageSync(favoritesKey) || [];
          const favSet = new Set(favorites.map(function(f) { return f.profId; }));
    
          const usedIds = new Set();
          const mapped = (professors || []).map(function(p, index) {
            // ✅ 2. 生成稳定的profId，避免随机后缀
            let profId = p.profId || p.documentId || '';
            if (!profId) {
              // 无ID时，用“姓名_学校”生成，尽量唯一且稳定
              profId = `prof_${(p.name || 'unknown').replace(/\s+/g, '_')}_${(p.school || 'unknown').replace(/\s+/g, '_')}`;
            }
            // 仅当本次列表内重复时才加后缀（不添加随机数！）
            if (usedIds.has(profId)) {
              profId = `${profId}_${index}`; // 使用索引作为后缀，稳定
            }
            usedIds.add(profId);
            const uniqueKey = p.uniqueKey || 'prof_' + Date.now() + '_' + index;
            console.log('p.uniqueKey是',p.uniqueKey);
            return {
              profId: profId, // ✅ 这是用于所有后续操作的唯一ID
              uniqueKey: uniqueKey, // UI渲染用，允许随机
              name: p.name || '',
              school: p.school || '',
              areas: Array.isArray(p.areas) ? p.areas : [],
              email: p.email || '',
              homepage: p.homepage || '',
              homepages: Array.isArray(p.homepages) ? p.homepages : [],
              office: p.office || '',
              phone: p.phone || '',
              highlights: Array.isArray(p.highlights) ? p.highlights : [],
              score: p.score,
              displayScore: p.displayScore !== undefined ? p.displayScore : p.score,
              matchScore: p.matchScore || 0,
              tags: Array.isArray(p.tags) ? p.tags : [],
              // ✅ 3. 使用稳定的profId进行收藏判断
              isFav: favSet.has(profId) || false,
            };
          });
          this.setData({ 
            candidates: this.decorate(mapped),
            favStatus: this.buildFavStatus(mapped)
          });
        }
      } catch (e) {
        console.log("professor-list parse error (cardData)", e);
      }
    },
    // 新增方法：构建 favStatus 对象
buildFavStatus: function(professors) {
  const favStatus = {};
  professors.forEach(prof => {
    favStatus[prof.uniqueKey] = prof.isFav || false;
    favStatus[prof.profId] = prof.isFav || false;

  });
  return favStatus;
},
onFavorite: function(e) {
  const dataset = e.currentTarget.dataset || {};
  const index = parseInt(dataset.index);
  const { id: profId } = e.currentTarget.dataset; // 获取当前卡片的profId
  
  if (!profId || isNaN(index) || index < 0 || index >= this.data.candidates.length) {
    console.error('Invalid profId or index:', { profId, index, length: this.data.candidates.length });
    return;
  }
  
  // 更新 candidates 数组
  const newCandidates = this.data.candidates.map((prof, i) => {
    if (i === index && prof.profId === profId) {
      return { ...prof, isFav: !prof.isFav };
    }
    return { ...prof };
  });
  
  const newFavState = newCandidates[index].isFav;
  const uniqueKey = newCandidates[index].uniqueKey;
  console.log('uniqueKey定义为：',uniqueKey);
  // 同时更新 favStatus 对象
  const newFavStatus = {
    ...this.data.favStatus, // 保留其他卡片的收藏状态
    [uniqueKey]: newFavState,   // 更新当前卡片的收藏状态
    [profId]: newFavState  // 更新 profId 对应的状态

  };
  console.log('profId是',profId);

  // 强制更新UI
  this.setData({ 
    candidates: newCandidates,
    favStatus: newFavStatus  //让WXML绑定的数据也更新

  });
  //使用用户专属的收藏key
  const userManager = require('../../../utils/userManager');
  const favoritesKey = userManager.getUserFavoritesKey();
  
  
  // 处理本地存储和云端同步
  try {
    //const existed = wx.getStorageSync('favorites') || [];
    //const favMap = new Map(existed.map(function(x) { return [x.uniqueKey, x]; }));
    const existed = wx.getStorageSync(favoritesKey) || [];
    const favMap = new Map(existed.map(function(x) { return [x.uniqueKey, x]; }));
    if (newFavState) {
      // 添加到收藏
      const profData = Object.assign({}, newCandidates[index], { updatedAt: Date.now() });
      favMap.set(uniqueKey, profData);
      
      // 云端添加
      wx.cloud.callFunction({ 
        name: 'favorites', 
        data: { 
          action: 'add', 
          prof: profData
        } 
      }).catch(err => console.error('Cloud add failed:', err));
    } else {
      // 从收藏移除
      favMap.delete(uniqueKey);
      
      // 云端移除
      wx.cloud.callFunction({ 
        name: 'favorites', 
        data: { 
          action: 'remove', 
          uniqueKey: uniqueKey 
        } 
      }).catch(err => console.error('Cloud remove failed:', err));
    }
    
    wx.setStorageSync(favoritesKey, Array.from(favMap.values()));
    
  } catch (err) {
    console.error('Storage error:', err);
  }
  
  wx.showToast({ 
    title: newFavState ? "已收藏" : "已取消", 
    icon: "success" 
  });
  
  // 发送全局事件通知其他组件更新  
  wx.$emit && wx.$emit('favoriteChanged', { uniqueKey: uniqueKey,profId:profId, isFav: newFavState });
},
    
    // 点击邮箱 - 发送邮件
    copyToClipboard: function(e) {
      const text = e.currentTarget.dataset.text;
      if (!text) return;
      
      
      // 判断是否是邮箱
      //const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text);
      
     /* if (isEmail) {
        // 如果是邮箱，打开邮件应用
        wx.navigateTo({
          url: '/pages/webview/webview?url=' + encodeURIComponent('mailto:' + text) + 
               '&title=' + encodeURIComponent('发送邮件')
        });
      } */
      //else {
        // 其他内容（如电话）复制到剪贴板
        wx.setClipboardData({
          data: text,
          success: function() {
            wx.showToast({
              title: '已复制到剪贴板',
              icon: 'success'
            });
          },
          fail: function() {
            wx.showToast({
              title: '复制失败',
              icon: 'none'
            });
          }
        });
     // }
    },
    
    // 打开个人主页 - 使用webview打开
    openHomepage: function(e) {
      const url = e.currentTarget.dataset.url;
      if (!url) return;
      
      // 使用webview页面打开链接
      wx.navigateTo({
        url: '/pages/webview/webview?url=' + encodeURIComponent(url) + 
             '&title=' + encodeURIComponent('教授主页')
      });
    },
    
    // 刷新收藏状态
    refreshFavoriteStates: function() {
      const favorites = wx.getStorageSync('favorites') || [];
      const favSet = new Set(favorites.map(function(f) { return f.profId; }));
      
      const candidates = this.data.candidates.map(function(prof) {
        return Object.assign({}, prof, {
          isFav: favSet.has(prof.profId)
        });
      });
      
      this.setData({ candidates: candidates });
    },


  // 改进的复制链接功能
copyProfLink: function(prof) {
  // 方案A：小程序路径（带完整参数）
  const pagePath = `/pages/chat/chat?action=showProf&profId=${prof.profId || ''}&name=${encodeURIComponent(prof.name || '')}&school=${encodeURIComponent(prof.school || '')}`;
  
  // 方案B：生成一个友好的提示链接
  const friendlyLink = `【浙大教授推荐】小程序路径：${pagePath}\n\n复制此路径后，在小程序内可快速访问${prof.name}教授资料卡`;
  
  // 或者方案C：生成一个带指引的文案
  const guideText = `【${prof.name}教授资料卡分享】\n` +
                    `🎓 ${prof.school || ''}\n` +
                    `⭐ 匹配度: ${prof.score || prof.displayScore || 0}%\n` +
                    `📚 研究方向: ${prof.areas ? prof.areas.join('、') : ''}\n` +
                    `---\n` +
                    `小程序内访问路径：${pagePath}\n` +
                    `（复制路径，打开小程序后会自动跳转）`;
  
  wx.setClipboardData({
    data: guideText,  // 或者用 friendlyLink
    success: () => {
      wx.showToast({ 
        title: '链接已复制', 
        icon: 'success',
        duration: 2000
      });
      
      // 可选：显示如何使用这个链接
      setTimeout(() => {
        wx.showModal({
          title: '如何使用复制的链接？',
          content: '请将链接粘贴到微信对话框，然后回到本小程序，我们会自动检测并跳转到教授页面。',
          showCancel: false,
          confirmText: '知道了'
        });
      }, 1500);
    }
  });
},
onProfessorShare: function(e) {
  const prof = e.currentTarget.dataset.prof;
  if (!prof) {
    console.error('分享时未获取到教授数据');
    wx.showToast({ title: '分享失败，数据异常', icon: 'none' });
    return;
  }

  console.log('开始分享教授数据:', prof);
  
  // 1. 保存教授数据到全局，让页面能获取到
  const app = getApp();
  app.globalData.shareProfessorData = prof;
  
  // 2. 显示分享菜单
  wx.showActionSheet({
    itemList: ['分享给好友', '复制分享文案'],
    success: (res) => {
      switch(res.tapIndex) {
        case 0: // 分享给好友
          // 触发页面分享
          this.triggerPageShare(prof);
          break;
          
        case 1: // 复制分享文案
          this.copyProfInfo(prof);
          break;
      }
    },
    fail: () => {
      wx.showToast({ title: '操作取消', icon: 'none' });
    }
  });
},

// 触发页面级分享
triggerPageShare: function(prof) {
  // 获取父页面（聊天页面）的实例
  const pages = getCurrentPages();
  const currentPage = pages[pages.length - 1]; // 当前页面（聊天页面）
  
  // 将教授数据设置到页面
  currentPage.setData({
    currentShareProf: prof
  });
  
  // 显示提示，让用户点击右上角分享
  wx.showModal({
    title: '分享给好友',
    content: `将${prof.name}教授的信息分享给好友\n\n请点击右上角"···"按钮，选择"发送给朋友"`,
    showCancel: false,
    confirmText: '我知道了'
  });
},

}})
