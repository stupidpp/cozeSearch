// pages/chatBot/chatBot.js
const app = getApp();
const userManager = require('../../utils/userManager');
const Towxml = require('../../components/towxml/index');
const { parseSimpleMarkdown } = require('../../components/markdownParser'); // 假设你将函数放在这里


Page({
  /**
   * 页面的初始数据
   */
  data: {
    fabX: 600,
    fabY: 900,
    // 聊天相关数据
    messages: [],
    inputValue: '',
    inputFocus: false,
    sending: false,
    scrollTop: 0,
    scrollToView: '',
    messageId: 0,
     // 会话相关
     sidebarOpen: false,
     conversations: [],
     currentCid: '',
     currentTitle: '',
     // 用户管理
     currentUserId: '',
     userList: [],
     showUserManager: false,
     currentUserDisplayName: '',
     // 多选和分享功能
     multiSelectMode: false,
     selectedMessagesCount: 0,
     showSharePanel: false,
     // 联系我们弹窗
    showContactUs: false,
    currentShareProf: null, // 确保有这个字段
  // 联系我们图片控制（优先本地，失败则回退远程）
  // 使用根路径 `/assets/icons/...` 指向 miniprogram/images 下的资源，避免被解析为 /pages/assets/icons/...
  contactImageSrc: '/assets/icons/contact-us.jpg',
    contactImageLoadState: 'idle', // idle | loading | loaded | error
    // 侧边栏折叠状态
    conversationsCollapsed: false,
    favoritesCollapsed: false,
    // 收藏数据
    favoritesList: [],
    richContent: null,
    favStatus: {},
    showFeedbackCard: false,
  feedbackTargetMsgId: '',
  feedbackCardPosition: 'below'
  },
  startFeedbackTimer: function() {
    // 先清除可能存在的旧计时器，防止堆积
    if (this.feedbackTimeoutId) {
      clearTimeout(this.feedbackTimeoutId);
      this.feedbackTimeoutId = null;
    }

    // 设置新的计时器，例如45秒（45000毫秒）
    // 这个时间可以根据你的对话节奏调整（建议30-60秒）
    const silenceDuration = 45000; // 单位：毫秒

    this.feedbackTimeoutId = setTimeout(() => {
      console.log('对话冷却时间到，准备弹出评价卡片');
      this.showFeedbackForLatestAssistantMsg();
    }, silenceDuration);
  },

  // 当有新消息时，取消即将触发的评价
  cancelFeedbackTimer: function() {
    if (this.feedbackTimeoutId) {
      clearTimeout(this.feedbackTimeoutId);
      this.feedbackTimeoutId = null;
      console.log('有新消息，取消即将弹出的评价');
    }
  },

  // 找到最近一条助手消息并为其显示评价卡片
  showFeedbackForLatestAssistantMsg: function() {
    const messages = this.data.messages;
    // 从后往前找第一条类型为 ‘assistant’ 的消息
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].type === 'assistant') {
        console.log(`将为消息 ${messages[i].id} 弹出评价卡片`);
        this.setData({
          showFeedbackCard: true,
          feedbackTargetMsgId: messages[i].id,
        });
        // 找到一条就跳出循环
        break;
      }
    }
  },
  // 输入框失去焦点时触发
  onInputBlur: function() {
    this.setData({
      inputFocus: false
    });
  },
  // 输入框获得焦点时触发
  onInputFocus: function() {
    this.setData({
      inputFocus: true
    });
  },

  onFabChange: function(e){
    const detail = e.detail || {};
    const x = detail.x;
    const y = detail.y;
    const source = detail.source;
    if (source) {
      this.setData({ fabX: x, fabY: y });
      try { wx.setStorageSync('favFabPos', { x: x, y: y }); } catch (err) {}
    }
  },
  goFavorites: function(){
    wx.navigateTo({ url: '/pages/favorites/favorites' });
  },
  /**
   * 生命周期函数--监听页面加载
   */
  onLoad: function(options) {
    if (options && (options.profId || options.profName)) {
      console.log('通过分享进入页面，参数:', options);
    }
     // 保存参数到页面数据
     this.setData({
      sharedProfParams: options,
      hasProcessedShare: false
    });
    console.log('已保存分享参数：',options);
    
   // 默认定位到输入区"+"号上方一点
   const { windowWidth, windowHeight } = wx.getWindowInfo();
   const defaultX = windowWidth - 120;
   const defaultY = windowHeight - 180;
   try {
     const saved = wx.getStorageSync('favFabPos');
     if (saved && typeof saved.x === 'number' && typeof saved.y === 'number') {
       this.setData({ fabX: saved.x, fabY: saved.y });
     }
     
     // 初始化用户管理
     const currentUserId = userManager.getCurrentUserId();
     const userList = userManager.getUserList();
     this.setData({ 
       currentUserId, 
       currentUserDisplayName: userManager.getUserDisplayName(currentUserId),
       userList: userList.map(id => ({
         id,
         displayName: userManager.getUserDisplayName(id),
         isCurrent: id === currentUserId
       }))
     });
     
     // 加载当前用户的会话列表
     this. loadUserConversations();
     // 加载收藏列表
     this.loadFavoritesList();
   } catch (err) {
     console.error('页面加载失败:', err);
   }
   if (!this.data.fabX || !this.data.fabY) this.setData({ fabX: defaultX, fabY: defaultY });
 },
 /**
   * 生命周期函数--监听页面卸载
   */
 onUnload: function() {
  // 清理所有进度定时器
  if (this.progressIntervals) {
    Object.values(this.progressIntervals).forEach(function(interval) {
      clearInterval(interval);
    });
    this.progressIntervals = {};
  }
},
 // 添加方法
hideFeedbackCard: function() {
  this.setData({
    showFeedbackCard: false,
    feedbackTargetMsgId: ''
  });
},

onFeedbackSubmit: function(e) {
  const feedback = e.detail; // 获取组件传来的评价数据
  console.log('收到评价数据:', feedback);
  
  // 1. 可以保存到本地缓存
  this.saveFeedbackToLocal(feedback);
  
  // 2. 也可以发送到你的后端（推荐）
  this.uploadFeedbackToServer(feedback);
  
  // 隐藏卡片
  this.hideFeedbackCard();
},

onFeedbackSkip: function() {
  console.log('用户跳过了评价');
  this.hideFeedbackCard();
},

// 保存到本地（可选）
saveFeedbackToLocal: function(feedback) {
  try {
    let allFeedback = wx.getStorageSync('chat_feedback') || [];
    allFeedback.push(feedback);
    wx.setStorageSync('chat_feedback', allFeedback);
    console.log('评价已保存到本地');
  } catch (err) {
    console.error('保存评价失败:', err);
  }
},

// 上传到服务器（推荐）
uploadFeedbackToServer: function(feedback) {
  // 如果你有云开发环境
  wx.cloud.callFunction({
    name: 'addFeedback',
    data: {
      feedback: feedback,
      conversationId: this.data.currentCid,
      userId: this.data.currentUserId
    },
    success: res => {
      console.log('评价上传成功:', res);
    },
    fail: err => {
      console.error('评价上传失败:', err);
      // 失败时可以降级到本地保存
      this.saveFeedbackToLocal(feedback);
    }
  });
  
  // 或者用 HTTP 请求到你的服务器
  // wx.request({ ... })
},
  // 微信分享回调（重要！）

onShareAppMessage: function() {
  console.log(' onShareAppMessage函数被调用！');
  
  const prof = this.data.currentShareProf;
  console.log('当前分享的教授数据:', prof);
  
  // 如果有教授数据，分享教授
  if (prof) {
    // 生成分享标题
    const title = `${prof.name}教授 | ${prof.school || ''} | 匹配度${prof.score || prof.displayScore || 0}%`;
    
    //  关键修改：使用正确的路径
    // 根据你的app.json，正确的路径是 /pages/chatBot/chatBot
    let path = '/pages/chatBot/chatBot';
    
    // 添加教授参数
    const params = [];
    if (prof.profId) {
      params.push(`profId=${prof.profId}`);
    }
    if (prof.name) {
      params.push(`profName=${encodeURIComponent(prof.name)}`);
    }
    
    if (params.length > 0) {
      path += '?' + params.join('&');
    }
    
    console.log(' 分享配置:', { title, path });
    
    return {
      title: title,
      path: path,
      success: (res) => {
        console.log(' 分享成功:', res);
        wx.showToast({ title: '分享成功', icon: 'success' });
        // 重置分享状态
        this.setData({ currentShareProf: null });
      },
      fail: (err) => {
        console.error(' 分享失败:', err);
        wx.showToast({ title: '分享失败', icon: 'none' });
      }
    };
  }
  
  // 默认分享（点击右上角三个点的分享）
  console.log('使用默认分享配置');
  return {
    title: '浙大教授信息推荐',
    path: '/pages/chatBot/chatBot'  // 聊天页面
  };
},
  
  
  // 用户管理相关方法
  loadUserConversations: function() {
    try {
      const conversationsKey = userManager.getUserConversationsKey();
      const currentCidKey = userManager.getUserCurrentCidKey();
      
      const conversations = wx.getStorageSync(conversationsKey) || [];
      const currentCid = wx.getStorageSync(currentCidKey) || (conversations[0] && conversations[0].conversationId) || '';
      
      this.setData({ conversations, currentCid });
      if (currentCid) {
        this.loadConversation(currentCid);
      }
    } catch (err) {
      console.error('加载用户会话失败:', err);
    }
  },

  toggleUserManager: function() {
    this.setData({ showUserManager: !this.data.showUserManager });
  },

  createNewUser: function() {
    try {
      const newUserId = userManager.createNewUser();
      const userList = userManager.getUserList();
      this.setData({ 
        currentUserId: newUserId,
        userList: userList.map(id => ({
          id,
          displayName: userManager.getUserDisplayName(id),
          isCurrent: id === newUserId
        })),
        showUserManager: false,
        conversations: [],
        currentCid: '',
        messages: [],
        currentTitle: '新对话'
      });
      
      wx.showToast({
        title: '已创建新用户',
        icon: 'success',
        duration: 1500
      });
    } catch (e) {
      console.error('创建用户失败:', e);
      wx.showToast({
        title: '创建失败',
        icon: 'error'
      });
    }
  },

  switchUser: function(e) {
    const userId = e.currentTarget.dataset.userId;
    if (!userId || userId === this.data.currentUserId) return;
    
    try {
      userManager.switchUser(userId);
      const userList = userManager.getUserList();
      this.setData({ 
        currentUserId: userId,
        currentUserDisplayName: userManager.getUserDisplayName(userId),
        userList: userList.map(id => ({
          id,
          displayName: userManager.getUserDisplayName(id),
          isCurrent: id === userId
        })),
        showUserManager: false
      });
      
      // 加载新用户的会话数据
      this.loadUserConversations();

      
      wx.showToast({
        title: '已切换用户',
        icon: 'success',
        duration: 1500
      });
    } catch (e) {
      console.error('切换用户失败:', e);
      wx.showToast({
        title: '切换失败',
        icon: 'error'
      });
    }
  },

  // 顶部&侧边栏交互
  toggleSidebar: function(){ 
    if (this.data.sidebarOpen) {
      this.hideAllDeleteOptions();
    }
    this.setData({ sidebarOpen: !this.data.sidebarOpen }); 
  },
  
  // 直接创建新会话，不弹窗
  createNewConversation: function(){
    this.hideAllDeleteOptions();
    const cid = '';
    const conv = { conversationId: cid, title: '新对话', lastMsg: '', updatedAt: Date.now() };
    const list = [conv].concat(this.data.conversations || []);
    
    // 使用用户专用的存储key
    const conversationsKey = userManager.getUserConversationsKey();
    const currentCidKey = userManager.getUserCurrentCidKey();
    
    this.setData({ 
      conversations: list, 
      currentCid: cid, 
      messages: [], 
      currentTitle: '新对话',
      messageId: 0,
      sidebarOpen: false , // 直接关闭侧边栏
      favStatus: {}  
    });
    
    wx.setStorageSync(conversationsKey, list);
    wx.setStorageSync(currentCidKey, cid);
  },
  openConversation: function(e){
    const cid = (e.currentTarget.dataset || {}).cid;
    if (!cid) return;
    // 如果当前有删除按钮显示，先隐藏所有删除按钮
    const hasDelete = this.data.conversations.some(c => c.showDelete);
    if (hasDelete) {
      this.hideAllDeleteOptions();
      return;
    }
    
    // 直接切换到选择的会话，关闭侧边栏
    const conversations = this.data.conversations || [];
    const selectedConv = conversations.find(c => c.conversationId === cid);
    
    if (selectedConv) {
      // 加载该会话的消息
      const conversationKey = userManager.getUserConversationKey(cid);
      const msgList = wx.getStorageSync(conversationKey) || [];
      
      this.setData({ 
        currentCid: cid, 
        messages: msgList, 
        currentTitle: selectedConv.title,
        sidebarOpen: false  // 自动关闭侧边栏
      });
      
      // 保存当前选中的会话ID
      const currentCidKey = userManager.getUserCurrentCidKey();
      wx.setStorageSync(currentCidKey, cid);
    }
  },
  showDeleteOption: function(e){
    const cid = (e.currentTarget.dataset || {}).cid;
    if (!cid) return;
    const list = this.data.conversations.map(function(c){
      return Object.assign({}, c, { showDelete: c.conversationId === cid });
    });
    this.setData({ conversations: list });
  },
  hideAllDeleteOptions: function(){
    const list = this.data.conversations.map(function(c){
      return Object.assign({}, c, { showDelete: false });
    });
    this.setData({ conversations: list });
  },
  deleteConversation: function(e){
    const cid = (e.currentTarget.dataset || {}).cid;
    if (!cid) return;
    // 直接删除（无需弹窗），更符合你的快速操作
    this.confirmDeleteConversation(cid);
  },
  confirmDeleteConversation: function(cid){
    try {
      // 从会话列表中移除
      const newList = (this.data.conversations || []).filter(c => c.conversationId !== cid);
      this.setData({ conversations: newList.slice() });
      
      // 使用用户专用的存储keys
      const conversationsKey = userManager.getUserConversationsKey();
      const conversationKey = userManager.getUserConversationKey(cid);
      
      wx.setStorageSync(conversationsKey, newList);
      
      // 删除会话消息数据
      wx.removeStorageSync(conversationKey);
      
      // 如果删除的是当前会话
      if (this.data.currentCid === cid) {
        if (newList.length > 0) {
          // 切换到第一个会话
          const firstCid = newList[0].conversationId;
          const currentCidKey = userManager.getUserCurrentCidKey();
          const firstConvKey = userManager.getUserConversationKey(firstCid);
          
          this.setData({ 
            currentCid: firstCid,
            currentTitle: newList[0].title,
            messages: wx.getStorageSync(firstConvKey) || []
          });
          wx.setStorageSync(currentCidKey, firstCid);
        } else {
          // 清空当前数据
          this.setData({ currentCid: '', messages: [], currentTitle: '新对话' });
          const currentCidKey = userManager.getUserCurrentCidKey();
          wx.removeStorageSync(currentCidKey);
        }
      }
      
      // 隐藏所有删除按钮
      this.hideAllDeleteOptions();
      
      wx.nextTick(() => {
        this.setData({ conversations: (this.data.conversations || []).slice() });
      });
    } catch (e) {
      console.error('删除失败', e);
    }
  },

  // 用户管理界面控制 
  hideUserManager: function() {
    this.setData({ showUserManager: false });
  },

  deleteCurrentUser: function() {
    if (this.data.userList.length <= 1) {
      wx.showToast({
        title: '至少需要保留一个用户',
        icon: 'none'
      });
      return;
    }

    const that = this;
    wx.showModal({
      title: '确认删除',
      content: '确定要删除当前用户吗？用户的所有数据将被清除。',
      success: function(res) {
        if (res.confirm) {
          try {
            const deletedUserId = that.data.currentUserId;
            userManager.deleteUser(deletedUserId);
            
            // 切换到第一个剩余用户
            const userList = userManager.getUserList();
            const newUserId = userList[0];
            userManager.switchUser(newUserId);
            
            that.setData({ 
              currentUserId: newUserId,
              currentUserDisplayName: userManager.getUserDisplayName(newUserId),
              userList: userList.map(id => ({
                id,
                displayName: userManager.getUserDisplayName(id),
                isCurrent: id === newUserId
              })),
              showUserManager: false
            });
            
            // 加载新用户的会话数据
            that.loadUserConversations();
            
            wx.showToast({
              title: '用户已删除',
              icon: 'success',
              duration: 1500
            });
          } catch (e) {
            console.error('删除用户失败:', e);
            wx.showToast({
              title: '删除失败',
              icon: 'error'
            });
          }
        }
      }
    });
  },

  // 阻止事件冒泡
  stopPropagation: function(e){
    // 阻止事件冒泡
  },

  // 联系我们弹窗控制
  showContactUs: function() {
    // 打开弹窗时优先使用本地图片，并进入 loading 状态
    this.setData({ 
      showContactUs: true,
      sidebarOpen: false, // 关闭侧边栏
      contactImageSrc: '/assets/icons/contact-us.jpg',
      contactImageLoadState: 'loading' // 确保状态更新
    });
    console.log('联系我们弹窗已打开，图片加载中...', '/assets/icons/contact-us.jpg');
  },

  hideContactUs: function() {
    this.setData({ showContactUs: false });
  },

  // 收藏相关方法
  loadFavoritesList: function() {
    try {
      const favoritesKey = userManager.getUserFavoritesKey();

      const favorites = wx.getStorageSync('favorites') || [];
      const favStatus = {};
      favorites.forEach(prof => {
        favStatus[prof.profId] = true; // 收藏的教授状态为true
      });
      // 只显示前5个收藏，避免列表过长
      const displayFavorites = favorites.slice(0, 5).map(prof => ({
        profId: prof.profId,
        name: prof.name,
        school: prof.school
      }));
      this.setData({ 
        favoritesList: displayFavorites , 
        favStatus: favStatus});
    } catch (error) {
      console.error('加载收藏列表失败:', error);
    }
  },

  // 切换折叠状态
  toggleConversationsCollapse: function() {
    this.setData({ conversationsCollapsed: !this.data.conversationsCollapsed });
  },

  toggleFavoritesCollapse: function() {
    this.setData({ favoritesCollapsed: !this.data.favoritesCollapsed });
  },

  // 跳转到收藏页面
  goToFavoritesPage: function() {
    this.setData({ sidebarOpen: false });
    wx.switchTab({
       url: '/pages/favorites/favorites' ,
      
        success: (res) => {
          console.log('✅ 跳转成功', res);
        },
        fail: (err) => {
          console.error('❌ 跳转失败:', err);
          console.log('错误详情:', err.errMsg);
          
          // 提供用户反馈
          wx.showToast({
            title: '跳转失败，请稍后重试',
            icon: 'none',
            duration: 2000
          });
        },
        complete: () => {
          console.log('跳转操作完成');
        }
      });
  },
  loadConversation: function(cid){
    try {
      const conversationKey = userManager.getUserConversationKey(cid);
      const rawMessages = wx.getStorageSync(conversationKey) || [];
      
      // 确保每条消息都有唯一的ID和完整的结构
      const messages = rawMessages.map((msg, index) => {
        if (!msg.id) {
          // 为没有ID的历史消息生成唯一ID
          msg.id = 'm_legacy_' + Date.now() + '_' + index + '_' + Math.random().toString(36).substring(2, 8);
        }
        // 确保消息有正确的类型
        if (!msg.type) {
          msg.type = msg.role === 'user' ? 'user' : 'assistant';
        }
        return msg;
      });
      
      const conv = (this.data.conversations.find(c=>c.conversationId===cid)||{});
      const title = conv.title || '对话';
      const list = (this.data.conversations || []).map(function(c){
        const t = new Date(c.updatedAt || Date.now());
        const pad = n=> (n<10?'0':'')+n;
        const ds = `${t.getMonth()+1}-${pad(t.getDate())} ${pad(t.getHours())}:${pad(t.getMinutes())}`;
        return Object.assign({}, c, { displayTime: ds });
      });
      
      this.setData({ 
        conversations: list, 
        messages, 
        currentTitle: title, 
        scrollToView: messages.length ? ('msg-'+messages[messages.length-1].id) : '' 
      });
      
      console.log('加载对话历史:', { cid, messageCount: messages.length });
    } catch (e) {
      console.error('加载对话失败:', e);
    }
  },

  // 输入框事件
  onInput: function(e) {
    this.setData({ inputValue: e.detail.value });
  },

  // 示例点击
  onExampleTap: function(e) {
    const text = e.currentTarget.dataset.text;
    this.setData({ inputValue: text });
    this.onSend();
  },

  // 重置对话（清除conversation_id）
  resetConversation: function() {
    this.setData({
      conversation_id: ''
    });
    console.log('🔄 对话已重置，将开启新的对话');
    wx.showToast({
      title: '对话已重置',
      icon: 'success'
    });
  },
  formatProfessorCard: function(rawContent) {
    // 1. 使用 towxml 解析
    const data = app.towxml(rawContent, 'markdown', {
      theme: 'light',
    });
    
    // 2. 【关键】调用 towxml 提供的 toJson 方法进行适配转换
    // 注意：不同版本方法名可能为 `toJson` 或 `toJSON`，请根据你的库文件确认
    let formattedContent = [];
    if (app.towxml.toJson) {
      // 版本1：方法名为 toJson
      formattedContent = app.towxml.toJson(data, 'markdown');
    } else if (app.towxml.toJSON) {
      // 版本2：方法名为 toJSON
      formattedContent = app.towxml.toJSON(data, 'markdown');
    } else if (data.nodes) {
      // 版本3：有些版本解析结果直接放在 `data.nodes` 里
      formattedContent = data.nodes;
    } else {
      // 保底：如果以上都没有，尝试原样返回 data 或其 children
      formattedContent = data.children || data || [];
    }
    
    console.log('【转换后】用于 rich-text 的 nodes 数据:', formattedContent);
    return formattedContent;
  },
  // 发送消息
  onSend: async function() {
    const log = (message) => { console.log(`[onSend] ${message}`); };
    const input = this.data.inputValue.trim();
    if (!input || this.data.sending) return;
    console.log(`当前sending状态: ${this.data.sending}`);
    this.hideAllDeleteOptions();
    this.setData({ sending: true, inputValue: '', inputFocus: false });
    this.cancelFeedbackTimer();//用户发新消息取消评价
    // 添加用户消息
    const userMsgId = this.addMessage({
      type: 'user',
      content: input,
      
    });
    console.log(`当前使用的conversation_id: ${this.data.currentCid}`);

    // 添加加载消息
    const loadingMsgId = this.addMessage({
      type: 'loading',
      content: '正在为您搜索匹配的教授...',
      progress: 0
    });

    // 启动进度动画
    this.startProgressAnimation(loadingMsgId);

    // ... existing code ...
    try {
      
      let result = await this.callCozeWorkflow(input);
      //log(`处理返回结果: ${JSON.stringify(result)}`);
      //log(`处理返回结果:`, result); // 先直接打印，看是否是undefined

      
      // 立即清理所有loading消息，并在清理完成后添加助手回复
      await this.clearAllLoadingMessages();

// 直接从返回结果中提取内容和卡片数据
let content = '';
let cardData = null;
let conversationId = '';

if (result && typeof result === 'object') {
  // 如果返回的是对象格式，直接使用其中的content和cardData
  content = result.content || '';
  cardData = result.cardData || null;
  conversationId = result.conversation_id || '';
  
  // 简化逻辑：如果对象格式中cardData为null，直接使用content作为回复内容
  if (!cardData && content) {
    log('对象格式中cardData为空，直接使用content作为回复内容');
    
  }
} else {
  // 如果是字符串格式，直接作为回复内容
  content = String(result);
  log(`result类型: ${typeof result}, 直接作为回复内容`);
}

// 保存返回的对话ID到页面数据中，供下一次调用使用
if (conversationId) {
  this.setData({ currentCid: conversationId });
  log(`已保存新的conversation_id: ${conversationId}`);
}

// 判断是否是教授信息（包含markdown格式）
const isProfessorInfo = content && (
  (content.includes('# ') && content.includes('匹配度')) || 
  content.includes('###') || 
  content.includes('- ')
);

if (isProfessorInfo) {
  // 调用美化函数
  const formattedContent = parseSimpleMarkdown(content);
  console.log(formattedContent); // 查看解析结果
  console.log('【1.解析后】类型:', typeof formattedContent, '是数组:', Array.isArray(formattedContent), '内容:', formattedContent);

  // 调用 addMessage 前，检查传入的数据
  console.log('【2.传入前】准备传入的 formattedContent:', formattedContent);
  // 添加美化后的消息
  this.addMessage({
    type: 'assistant',
    content: content, // 使用美化后的内容
    formattedContent: formattedContent,
    cardData: cardData,
   
  });
  
} 
else if (!cardData && content) {
  // 专门处理没有cardData但有content的情况
  this.addMessage({
    type: 'assistant',
    content: content || '处理结果为空。',
    cardData: null, // 明确设置为null
  });
}
else {
  // 普通回复，直接显示
  this.addMessage({
    type: 'assistant',
    content: content || '抱歉，暂时无法获取回复，请稍后重试。',
    cardData: cardData,

  });
  wx.nextTick(() => {
    this.startFeedbackTimer();
  });
}


// 保存对话到历史记录
this.saveConversationToHistory();

} catch (error) {
console.error('调用工作流失败:', error);

// 清理loading消息
await this.clearAllLoadingMessages();

// 添加错误提示消息
this.addMessage({
  type: 'assistant',
  content: '抱歉，服务暂时不可用，请稍后重试。',
});
} finally {
// 确保无论成功失败都重置发送状态
this.setData({ sending: false, inputFocus: true });
console.log('sending状态已重置为false');
}

      

     
  },

  // 调用扣子智能体
  callCozeWorkflow: function(userInput) {
    const log = (message) => { console.log(`[callCozeWorkflow] ${message}`); };
    const conversation_id = this.data.currentCid || '';
    const conversationHistory = this.getConversationHistoryForAPI();
    
    // 直接返回一个Promise
    return new Promise((resolve, reject) => {
        wx.cloud.callFunction({
            name: 'coze_workflow_trigger',
            data: {
                input: userInput,
                conversation_id: conversation_id,
                conversation_history: conversationHistory
            },
            success: async (res) => {
                console.log('触发器调用成功:', res);
                // 1. 检查云端调用是否成功
                if (res.errMsg !== 'cloud.callFunction:ok') {
                    reject(new Error(`云函数调用失败: ${res.errMsg}`));
                    return;
                }
                // 2. 检查业务逻辑是否成功 (code 0)
                if (!res.result || res.result.code !== 0) {
                    reject(new Error(res.result?.message || '触发器业务错误'));
                    return;
                }
                
                const taskId = res.result.data.taskId;
                log(`开始轮询任务结果，任务ID: ${taskId}`);
                
                try {
                    // 3. 开始轮询，等待最终结果
                    const finalResult = await this.pollTaskResult(taskId);
                    log('轮询成功，获取到最终结果');
                    console.log('finalResult结构:', finalResult); // 调试用
                    resolve(finalResult); // 关键：这里必须调用resolve
                } catch (pollError) {
                    console.error('轮询过程失败:', pollError);
                    // 4. 轮询失败，也返回一个结构化的错误结果，而不是reject，保证前端流程不崩溃
                    resolve({
                        content: `请求处理失败: ${pollError.message}`,
                        cardData: null,
                        conversation_id: conversation_id
                    });
                }
            },
            fail: (err) => {
                console.error('调用触发器云函数失败:', err);
                reject(err);
            }
        });
    });
},// 新增：轮询函数，用于查询后台任务状态
pollTaskResult: function(taskId, maxAttempts = 150) { // 最多尝试150次（约2.5分钟）
  const log = (message) => { console.log(`[pollTaskResult] ${message}`); };
  return new Promise((resolve, reject) => {
    let attempts = 0;
    const timer = setInterval(async () => {
      attempts++;
      const db = wx.cloud.database();
      
      try {
        log(`第${attempts}次查询，任务ID: ${taskId}`);
        const res = await db.collection('search_tasks').doc(taskId).get();
        const task = res.data;
        
        if (!task) {
          clearInterval(timer);
          reject(new Error('任务记录不存在'));
          return;
        }
        
        log(`当前任务状态: ${task.status}`);
        
        if (task.status === 'completed') {
          clearInterval(timer);
          log('任务完成，准备返回结果');
          
          // 增强健壮性：确保无论数据库里存的是什么，这里返回的都是一个对象
          const taskResult = task.result;
          if (taskResult && typeof taskResult === 'object') {
              // 如果是对象，确保它有必备字段
              resolve({
                  content: taskResult.content || '',
                  cardData: taskResult.cardData || null,
                  conversation_id: taskResult.conversation_id || ''
              });
              log('已经正确返回')
          } else {
              // 如果数据库里的result不是对象（比如是字符串、null等），构造一个安全对象
              console.warn('数据库result字段格式异常，进行安全转换:', taskResult);
              resolve({
                  content: String(taskResult || '查询完成'),
                  cardData: null,
                  conversation_id: ''
              });
              log('虽然异常，但也已经返回')
          }
      }
         else if (task.status === 'failed') {
          clearInterval(timer);
          log('任务处理失败');
          reject(new Error(task.result || '后台处理失败'));
          
        } else if (attempts >= maxAttempts) {
          clearInterval(timer);
          log('轮询超时');
          reject(new Error('查询超时，请稍后重试。'));
        }
        // 状态为 'processing'，继续轮询
      } catch (err) {
        clearInterval(timer);
        log('轮询查询异常: ' + err.message);
        reject(err);
      }
    }, 1000); // 每秒轮询一次
  });
},
 // 修改 getConversationHistoryForAPI 函数
getConversationHistoryForAPI: function() {
  const messages = this.data.messages || [];
  
  // 只保留最近6轮对话（避免token过长）
  const recentMessages = messages.slice(-12); // 3对问答
  
  // 正确格式化历史消息
  const history = recentMessages.map(msg => {
    let role = '';
    if (msg.type === 'user') {
      role = 'user';
    } else if (msg.type === 'assistant') {
      role = 'assistant'; // 确保是'assistant'不是'bot'
    } else {
      return null; // 跳过loading等非对话消息
    }
    
    const historyItem ={
      role: role,
      content: msg.content || '',
      content_type: 'text'
    };
    if (msg.cardData) {
      // 传递教授卡片数据的精简版
      historyItem.cardData = this.extractEssentialCardData(msg.cardData);
    }
    return historyItem;
  }).filter(msg => msg !== null); // 过滤掉null
  
  console.log('准备发送的历史消息:', history);
  return history;
},
//这个是用来提取卡片信息，防止传递大段数据的
extractEssentialCardData: function(cardData) {
  if (!cardData) return null;
  
  // 针对不同类型的卡片数据进行精简
  switch (cardData.type) {
    case 'professor_list':
      return {
        type: 'professor_list',
        professors: (cardData.professors || []).slice(0, 6).map(prof => ({
          name: prof.name || '',
          areas: prof.areas || [],
          school: prof.school || '',
          highlights: (prof.highlights || []).slice(0, 6) // 新增亮点摘要

          // 只保留必要字段，避免token过多
        })),
        count: cardData.professors?.length || 0
      };
      
    case 'professor_detail':
      return {
        type: 'professor_detail',
        name: cardData.name || '',
        areas: cardData.areas || [],
        school: cardData.school || '',
        highlights: (cardData.highlights || []).slice(0, 6)
      };
      
    default:
      // 其他类型只保留最小必要信息
      return {
        type: cardData.type || 'unknown',
        summary: JSON.stringify(cardData).substring(0, 200) + '...'
      };
  }
},
uploadFeedbackToServer: function(feedback) {
  // 调用刚部署的 addFeedback 云函数
  wx.cloud.callFunction({
    name: 'addFeedback', // 云函数名称，必须和目录名一致
    data: { // 传递给云函数的参数
      feedback: feedback,
      conversationId: this.data.currentCid,
      userId: this.data.currentUserId
    },
    success: res => {
      console.log('评价上传成功:', res);
      wx.showToast({ title: '感谢反馈！', icon: 'success' });
    },
    fail: err => {
      console.error('评价上传失败:', err);
      // 失败时降级到本地存储
      this.saveFeedbackToLocal(feedback);
      wx.showToast({ title: '评价已保存（本地）', icon: 'none' });
    }
  });
},
// 获取长期记忆
getLongTermMemory: function() {
  const keywords = userManager.getUserKeywords();
  const summaries = userManager.getUserSummaries();
  
  return {
    keywords: keywords.slice(-20), // 最近20个关键词
    recent_summaries: summaries.slice(-5) // 最近5个对话摘要
  };
},
  // 添加消息
  addMessage: function(msg) {
    console.log('【3.addMessage内部】收到的 msg.formattedContent 类型:', typeof msg.formattedContent, '值:', msg.formattedContent);
    const id = 'm_' + Date.now() + '_' + Math.random().toString(36).substring(2, 11);
    const message = Object.assign({ id: id }, msg);
    
    // 如果是助手消息，自动清理所有loading消息
    let messages;
    if (msg.type === 'assistant') {
      messages = this.data.messages.filter(function(m) {
        return m.type !== 'loading';
      }).concat([message]);
    } else {
      messages = this.data.messages.concat([message]);
    }
    
    this.setData({ 
      messages: messages,
      scrollToView: 'msg-' + id,
    }, () => {
      // !!! 这个回调函数很重要 !!!
      const lastMsg = this.data.messages[this.data.messages.length - 1];
      console.log('【5.setData后】存入 data 的最后一条消息: ', lastMsg);
      console.log('【5.1】其 formattedContent 类型:', typeof lastMsg.formattedContent, '是数组吗:', Array.isArray(lastMsg.formattedContent));
    });
    
    return id;
  },

  // 移除消息
  removeMessage: function(id) {
    const messages = this.data.messages.filter(function(msg) {
      return msg.id !== id;
    });
    this.setData({ messages: messages });
  },

  // 清理所有loading类型的消息
  clearAllLoadingMessages: function() {
    // 清理所有进度定时器
    if (this.progressIntervals) {
      Object.values(this.progressIntervals).forEach(function(interval) {
        clearInterval(interval);
      });
      this.progressIntervals = {};
    }

    return new Promise((resolve, _) => {
      const messages = this.data.messages.filter(function(msg) {
        return msg.type !== 'loading';
      });
      this.setData({ messages: messages }, resolve);
    });
  },

  // 更新消息
  updateMessage: function(id, updates) {
    const messages = this.data.messages.map(function(msg) {
      if (msg.id === id) {
        return Object.assign({}, msg, updates);
      }
      return msg;
    });
    this.setData({ messages: messages });
  },

  // 启动进度动画
  startProgressAnimation: function(messageId) {
    const self = this;
    let progress = 0;
    const maxProgress = 95; // 不到100%，等待真实结果
    
    const progressInterval = setInterval(function() {
      if (progress < maxProgress) {
        // 前期快速增长，后期缓慢
        const increment = (progress < 30 ? Math.random() * 4 + 2 : 
                         progress < 60 ? Math.random() * 2 + 1 : 
                         Math.random() + 0.5);
        
        progress = Math.min(progress + increment, maxProgress);
        
        // 更新进度
        self.updateMessage(messageId, { 
          progress: Math.floor(progress) 
        });
        
        // 更新加载文本
        if (progress > 80) {
          self.updateMessage(messageId, { 
            content: '正在生成推荐结果...',
            progress: Math.floor(progress) 
          });
        } else if (progress > 50) {
          self.updateMessage(messageId, { 
            content: '正在分析匹配度...',
            progress: Math.floor(progress) 
          });
        } else if (progress > 20) {
          self.updateMessage(messageId, { 
            content: '正在搜索教授数据库...',
            progress: Math.floor(progress) 
          });
        }
      } else {
        clearInterval(progressInterval);
      }
    }, 700); // 每100ms更新一次
    
    // 存储interval用于清理
    if (!this.progressIntervals) {
      this.progressIntervals = {};
    }
    this.progressIntervals[messageId] = progressInterval;
  },

  // 完成进度动画
  finishProgress: function(messageId) {
    const self = this;
    
    // 清理进度更新
    if (this.progressIntervals && this.progressIntervals[messageId]) {
      clearInterval(this.progressIntervals[messageId]);
      delete this.progressIntervals[messageId];
    }
    
    // 检查消息是否还存在
    const messageExists = this.data.messages.some(function(msg) {
      return msg.id === messageId;
    });
    
    if (!messageExists) {
      return; // 消息已经被移除了
    }
    
    // 快速完成到100%
    this.updateMessage(messageId, { 
      content: '分析完成！',
      progress: 100 
    });
    
    // 短暂显示100%后再移除
    setTimeout(function() {
      // 再次检查消息是否还存在
      const stillExists = self.data.messages.some(function(msg) {
        return msg.id === messageId;
      });
      
      if (stillExists) {
        self.removeMessage(messageId);
      }
    }, 800);
  },
 // 新增：解析纯文本格式的资料卡
 parseTextCardData: function(text) {
  const log = (message) => { console.log(`[parseTextCardData] ${message}`); };
  
  // 检查是否包含资料卡关键词
  const hasCardKeywords = text.includes('资料卡') || 
                        text.includes('教授列表') || 
                        text.includes('**单位**') || 
                        text.includes('**职称**') ||
                        text.includes('**研究方向**');
  
  if (!hasCardKeywords) {
    log('未找到资料卡关键词');
    return null;
  }
  
  try {
    // 解析教授信息
    const professors = [];
    
    // 使用正则表达式匹配每个教授的信息块
    const professorBlocks = text.match(/\d+\.\s*\*\*([^*]+)\*\*教授([\s\S]*?)(?=\d+\.\s*\*\*|$)/g);
    
    if (!professorBlocks || professorBlocks.length === 0) {
      log('未找到教授信息块');
      return null;
    }
    
    log(`找到${professorBlocks.length}个教授信息块`);
    
    for (const block of professorBlocks) {
      try {
        // 提取教授姓名
        const nameMatch = block.match(/\d+\.\s*\*\*([^*]+)\*\*教授/);
        if (!nameMatch) continue;
        
        const name = nameMatch[1].trim();
        
        // 提取各项信息
        const unitMatch = block.match(/\*\*单位\*\*:\s*([^\n]+)/);
        const titleMatch = block.match(/\*\*职称\*\*:\s*([^\n]+)/);
        const researchMatch = block.match(/\*\*研究方向\*\*:\s*([^\n]+)/);
        const emailMatch = block.match(/\*\*邮箱\*\*:\s*([^\n]+)/);
        const homepageMatch = block.match(/\*\*个人主页\*\*:\s*\[([^\]]+)\]\(([^)]+)\)/);
        const introMatch = block.match(/\*\*简介\*\*:\s*([^\n]+)/);
        
        const professor = {
          name: name,
          school: unitMatch ? unitMatch[1].trim() : '',
          title: titleMatch ? titleMatch[1].trim() : '',
          research_direction: researchMatch ? researchMatch[1].trim() : '',
          email: emailMatch ? emailMatch[1].trim() : '',
          homepage: homepageMatch ? homepageMatch[2].trim() : '',
          introduction: introMatch ? introMatch[1].trim() : ''
        };
        
        // 生成教授ID（使用姓名和邮箱的组合）
        professor.profId = `prof_${name}_${professor.email || Date.now()}`;
        
        professors.push(professor);
        log(`解析教授: ${name}`);
      } catch (error) {
        log(`解析单个教授信息失败: ${error.message}`);
      }
    }
    
    if (professors.length > 0) {
      return {
        type: 'professor_list',
        professors: professors
      };
    }
  } catch (error) {
    log(`解析纯文本资料卡失败: ${error.message}`);
  }
  
  return null;
},

  /**
   * 生命周期函数--监听页面初次渲染完成
   */
  onReady: function() {},

  /**
   * 生命周期函数--监听页面显示
   */
  onShow: function() {
    console.log('onshow已经被调用');
    // 重新加载收藏列表，以防从收藏页面返回后数据有变化
    this.loadFavoritesList();
     // 检查是否有通过分享链接进入的参数
     const app = getApp();
     if (app.globalData.shareProfParams) {
       const params = app.globalData.shareProfParams;
       console.log('从分享链接进入，参数:', params);
       
       // 显示对应的教授
       this.showSharedProfessor(params);
       
       // 清空参数，避免重复触发
       app.globalData.shareProfParams = null;
       
       // 给用户提示
       wx.showToast({
         title: `正在加载${params.name}教授信息`,
         icon: 'none'
       });
     }
  },
  showSharedProfessor: function(params) {
    // 根据参数查找并显示教授
    // 这里需要根据你的数据结构来实现
    if (params.profId) {
      // 通过ID查找
      this.loadProfessorById(params.profId);
    } else if (params.name) {
      // 通过姓名查找（可能不准确）
      this.searchProfessorByName(params.name);
    }
  },
  /**
   * 生命周期函数--监听页面隐藏
   */
  onHide: function() {},

  

  /**
   * 页面相关事件处理函数--监听用户下拉动作
   */
  onPullDownRefresh: function() {},

  /**
   * 页面上拉触底事件的处理函数
   */
  onReachBottom: function() {},

  

  // 多选和分享功能
  onMessageLongPress: function(e) {
    const msgId = e.currentTarget.dataset.msgId;
    if (!msgId) return;
    
    // 进入多选模式
    this.setData({ multiSelectMode: true });
    
    // 将长按的消息设为选中状态
    this.toggleMessageSelection({ currentTarget: { dataset: { msgId } } });
  },

  toggleMessageSelection: function(e) {
    const msgId = e.currentTarget.dataset.msgId;
    if (!msgId) return;
    
    const messages = this.data.messages.map(msg => {
      if (msg.id === msgId) {
        return { ...msg, selected: !msg.selected };
      }
      return msg;
    });
    
    const selectedCount = messages.filter(msg => msg.selected).length;
    
    this.setData({ 
      messages,
      selectedMessagesCount: selectedCount
    });
  },

  exitMultiSelectMode: function() {
    const messages = this.data.messages.map(msg => ({ ...msg, selected: false }));
    this.setData({
      multiSelectMode: false,
      selectedMessagesCount: 0,
      showSharePanel: false,
      messages
    });
  },

  showSharePanel: function() {
    this.setData({ showSharePanel: true });
  },

  hideSharePanel: function() {
    this.setData({ showSharePanel: false });
  },

  shareToWechat: function() {
    const selectedMessages = this.data.messages.filter(msg => msg.selected);
    if (selectedMessages.length === 0) {
      wx.showToast({ title: '请先选择要分享的内容', icon: 'none' });
      return;
    }

    // 生成分享链接
    const shareData = this.generateShareData(selectedMessages);
    
    wx.showShareMenu({
      withShareTicket: true,
      menus: ['shareAppMessage', 'shareTimeline']
    });

    // 触发微信分享
    wx.shareAppMessage({
      title: '科研合作推荐结果',
      path: `/pages/shared/shared?data=${encodeURIComponent(JSON.stringify(shareData))}`,
      success: () => {
        wx.showToast({ title: '分享成功', icon: 'success' });
        this.exitMultiSelectMode();
      }
    });
  },

  shareAsLongImage: function() {
    const selectedMessages = this.data.messages.filter(msg => msg.selected);
    if (selectedMessages.length === 0) {
      wx.showToast({ title: '请先选择要分享的内容', icon: 'none' });
      return;
    }

    wx.showLoading({ title: '准备生成长图...' });
    
    // 使用微信小程序的截图分享功能
    this.generateCanvasImage(selectedMessages);
  },

  generateCanvasImage: function(messages) {
    const that = this;
    
    // 创建离屏canvas
    const query = wx.createSelectorQuery();
    query.select('.chat-messages')
      .boundingClientRect(function(rect) {
        if (!rect) {
          wx.hideLoading();
          wx.showToast({ title: '无法获取内容区域', icon: 'none' });
          return;
        }
        
        // 使用第三方截图工具或系统截图
        that.triggerSystemShare(messages);
      })
      .exec();
  },

  triggerSystemShare: function(messages) {
    wx.hideLoading();
    
    // 提供多种分享方案
    wx.showActionSheet({
      itemList: ['手机截图分享', '复制文字内容', '生成分享链接', '保存到相册提醒'],
      success: (res) => {
        switch(res.tapIndex) {
          case 0: // 手机截图分享
            this.guideUserScreenshot();
            break;
          case 1: // 复制文字内容
            this.copyContentToClipboard(messages);
            break;
          case 2: // 生成分享链接
            this.copyShareLink();
            break;
          case 3: // 保存到相册提醒
            this.showSaveToAlbumGuide();
            break;
        }
      }
    });
  },

  guideUserScreenshot: function() {
    wx.showModal({
      title: '📱 截图分享指南',
      content: '推荐使用手机自带的截图功能：\n\n• iPhone：同时按住电源键+音量↑键\n• 安卓：同时按住电源键+音量↓键\n• 长截图：部分手机支持滑动截取长图\n\n截图后可直接分享给好友！',
      showCancel: true,
      cancelText: '取消',
      confirmText: '开始截图',
      success: (res) => {
        if (res.confirm) {
          // 延迟一秒让用户准备
          setTimeout(() => {
            wx.showToast({ 
              title: '请开始截图', 
              icon: 'none',
              duration: 3000
            });
          }, 1000);
        }
        this.exitMultiSelectMode();
      }
    });
  },

  showSaveToAlbumGuide: function() {
    wx.showModal({
      title: '💾 保存提醒',
      content: '您可以：\n\n1. 先使用截图功能\n2. 然后保存截图到手机相册\n3. 随时从相册分享给朋友\n\n这样可以保留最完整的格式和样式！',
      showCancel: false,
      confirmText: '我知道了',
      success: () => {
        this.exitMultiSelectMode();
      }
    });
  },

  copyContentToClipboard: function(messages) {
    let content = '📚 科研合作推荐结果\n';
    content += '━━━━━━━━━━━━━━━━━━━━\n\n';
    
    messages.forEach((msg, msgIndex) => {
      if (msg.type === 'user') {
        content += `🔍 问题：${msg.content}\n\n`;
      } else if (msg.type === 'assistant') {
        if (msg.content) {
          content += `💡 回答：${msg.content}\n\n`;
        }
        
        if (msg.cardData && msg.cardData.professors) {
          content += '👨‍🏫 推荐教授：\n';
          msg.cardData.professors.forEach((prof, idx) => {
            content += `\n${idx + 1}. ${prof.name}\n`;
            content += `   🏛️ ${prof.school}\n`;
            if (prof.areas && prof.areas.length > 0) {
              content += `   🔬 ${prof.areas.join(', ')}\n`;
            }
            if (prof.email) {
              content += `   📧 ${prof.email}\n`;
            }
            if (prof.office) {
              content += `   📍 ${prof.office}\n`;
            }
            content += `   📊 匹配度：${prof.displayScore}%\n`;
          });
          content += '\n';
        }
      }
      
      // 在消息之间添加分隔线
      if (msgIndex < messages.length - 1) {
        content += '────────────────────\n\n';
      }
    });
    
    content += '\n📱 来源：科研合作智能助手';
    
    wx.setClipboardData({
      data: content,
      success: () => {
        wx.showToast({ 
          title: '内容已复制到剪贴板', 
          icon: 'success',
          duration: 2000
        });
        this.exitMultiSelectMode();
      },
      fail: () => {
        wx.showToast({ title: '复制失败，请重试', icon: 'none' });
      }
    });
  },

  copyShareLink: function() {
    const selectedMessages = this.data.messages.filter(msg => msg.selected);
    if (selectedMessages.length === 0) {
      wx.showToast({ title: '请先选择要分享的内容', icon: 'none' });
      return;
    }

    const shareData = this.generateShareData(selectedMessages);
    const shareUrl = `https://your-domain.com/shared?data=${encodeURIComponent(JSON.stringify(shareData))}`;
    
    wx.setClipboardData({
      data: shareUrl,
      success: () => {
        wx.showToast({ title: '链接已复制', icon: 'success' });
        this.exitMultiSelectMode();
      }
    });
  },

  generateShareData: function(messages) {
    return {
      timestamp: Date.now(),
      conversationId: this.data.currentCid,
      userId: this.data.currentUserId,
      messages: messages.map(msg => ({
        type: msg.type,
        content: msg.content,
        cardData: msg.cardData,
        timestamp: msg.timestamp
      }))
    };
  },

  // 保存对话到历史记录
  saveConversationToHistory: function() {
    try {
      const conversationsKey = userManager.getUserConversationsKey();
      const conversations = wx.getStorageSync(conversationsKey) || [];
      
      // 确保有当前会话ID，如果没有则创建
      let currentCid = this.data.currentCid;
      //第一次为空，等待第二次会话返回
      if (!currentCid) {
        console.log('当前会话ID为空，等待智能体返回真正的conversation_id');
        return; // 直接返回，不保存到历史记录
      }
      
      const messages = this.data.messages;
      if (messages.length === 0) return;
      
      // 保存消息到会话
      const conversationKey = userManager.getUserConversationKey(currentCid);
      const validMessages = messages.filter(function(msg) {
        return msg.type === 'user' || msg.type === 'assistant';
      });
      wx.setStorageSync(conversationKey, validMessages);
      
      // 查找是否已存在该对话
      const existingIndex = conversations.findIndex(conv => conv.conversationId === currentCid);
      
      let previewContent = '新对话';
    
      // 方法1：找第一条有实际内容的助理消息
      const firstAssistantMessage = messages.find(msg => 
        msg.type === 'assistant' && 
        msg.content && 
        typeof msg.content === 'string'
      );
      
      if (firstAssistantMessage && firstAssistantMessage.content) {
        previewContent = firstAssistantMessage.content;
      } 
      // 方法2：如果找不到字符串内容，用固定的预览文本
      else if (messages.some(msg => msg.type === 'assistant')) {
        // 有助理消息但不是字符串（比如富文本）
        const assistantCount = messages.filter(msg => msg.type === 'assistant').length;
        previewContent = `进行了${assistantCount}次回复`;
      }
      const safePreview = String(previewContent || '新对话');
    const lastMsg = safePreview.length > 30 ? safePreview.substring(0, 30) + '...' : safePreview;
    
      // 生成或更新对话标题
      const title = this.data.currentTitle || this.generateConversationTitle(messages);
      
      const conversationData = {
        conversationId: currentCid,
        title: title,
        lastMsg: lastMsg,
        updatedAt: Date.now(),
        displayTime: this.formatTime(Date.now()),
        messageCount: messages.length
      };
      
      if (existingIndex >= 0) {
        // 更新已存在的对话
        conversations[existingIndex] = conversationData;
      } else {
        // 添加新对话到开头
        conversations.unshift(conversationData);
      }
      
      // 限制历史记录数量，保留最近50个对话
      if (conversations.length > 50) {
        conversations.splice(50);
      }
      
      // 保存到存储
      wx.setStorageSync(conversationsKey, conversations);
      
      // 更新当前显示的标题和会话列表
      this.setData({ 
        currentTitle: title,
        conversations: conversations 
      });
      // 提取对话关键词作为长期记忆
    this.extractConversationKeywords(currentCid, messages);
    
    } catch (e) {
      console.error('保存对话到历史记录失败:', e);
    }
  },
  // 提取对话关键词
extractConversationKeywords: function(conversationId, messages) {
  const keywords = new Set();
  
  // 分析消息内容提取关键词
  messages.forEach(msg => {
    if (msg.type === 'user' || msg.type === 'assistant') {
      const content = msg.content || '';
      
      // 提取中文关键词（专业术语、研究方向等）
      const chineseKeywords = this.extractChineseKeywords(content);
      chineseKeywords.forEach(keyword => keywords.add(keyword));
      
      // 提取英文关键词
      const englishKeywords = this.extractEnglishKeywords(content);
      englishKeywords.forEach(keyword => keywords.add(keyword));
    }
  });
   // 保存关键词到长期记忆
   if (keywords.size > 0) {
    const keywordsKey = userManager.getUserKeywordsKey();
    const existingKeywords = wx.getStorageSync(keywordsKey) || [];
    const newKeywords = Array.from(keywords);
    
    // 合并并去重
    const allKeywords = [...new Set([...existingKeywords, ...newKeywords])];
    
    // 限制关键词数量，保留最近100个
    if (allKeywords.length > 100) {
      allKeywords.splice(0, allKeywords.length - 100);
    }
    
    wx.setStorageSync(keywordsKey, allKeywords);
    console.log('提取关键词:', Array.from(keywords));
  }
},

// 提取中文关键词
extractChineseKeywords: function(text) {
  const keywords = [];
  
  // 匹配中文专业术语（2-6个字符）
  const chinesePattern = /[\u4e00-\u9fa5]{2,6}/g;
  const matches = text.match(chinesePattern) || [];
  
  // 过滤常见词，保留专业术语
  const commonWords = ['这个', '那个', '可以', '需要', '想要', '请问', '谢谢'];
  matches.forEach(word => {
    if (!commonWords.includes(word) && word.length >= 2) {
      keywords.push(word);
    }
  });
  
  return keywords;
},

// 提取英文关键词
extractEnglishKeywords: function(text) {
  const keywords = [];
  
  // 匹配英文单词（3个字母以上）
  const englishPattern = /\b[a-zA-Z]{3,}\b/g;
  const matches = text.match(englishPattern) || [];
  
  // 过滤常见词，保留专业术语
  const commonWords = ['the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'any'];
  matches.forEach(word => {
    const lowerWord = word.toLowerCase();
    if (!commonWords.includes(lowerWord) && lowerWord.length >= 3) {
      keywords.push(word);
    }
  });
  
  return keywords;
},
// 生成对话摘要
generateConversationSummary: function(conversationId, messages) {
  if (messages.length < 4) return null; // 对话太短不生成摘要
  
  const userMessages = messages.filter(msg => msg.type === 'user');
  const assistantMessages = messages.filter(msg => msg.type === 'assistant');
  
  if (userMessages.length === 0) return null;
  
  // 提取主要话题
  const topics = this.extractMainTopics(messages);
  
  // 生成简单摘要
  const summary = {
    conversationId: conversationId,
    userQueryCount: userMessages.length,
    mainTopics: topics.slice(0, 3), // 最多3个主要话题
    lastUpdated: Date.now(),
    messageCount: messages.length
  };
  
  // 保存摘要
  const summaryKey = userManager.getUserSummaryKey();
  const existingSummaries = wx.getStorageSync(summaryKey) || [];
  
  // 更新或添加摘要
  const existingIndex = existingSummaries.findIndex(s => s.conversationId === conversationId);
  if (existingIndex >= 0) {
    existingSummaries[existingIndex] = summary;
  } else {
    existingSummaries.push(summary);
  }
  
  // 限制摘要数量
  if (existingSummaries.length > 20) {
    existingSummaries.splice(0, existingSummaries.length - 20);
  }
  
  wx.setStorageSync(summaryKey, existingSummaries);
  return summary;
},

// 提取主要话题
extractMainTopics: function(messages) {
  const topicFrequency = {};
  
  messages.forEach(msg => {
    if (msg.content) {
      // 简单的关键词频率统计
      const words = msg.content.split(/[\s,，。！？；;]/);
      words.forEach(word => {
        if (word.length >= 2 && word.length <= 6) {
          topicFrequency[word] = (topicFrequency[word] || 0) + 1;
        }
      });
    }
  });
  
  // 按频率排序
  return Object.entries(topicFrequency)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([word]) => word);
},
  // AI生成对话标题
  generateConversationTitle: function(messages) {
    if (!messages || messages.length === 0) return '新对话';
    
    // 获取第一条用户消息
    const firstUserMessage = messages.find(msg => msg.type === 'user');
    if (!firstUserMessage) return '新对话';
    
    const content = firstUserMessage.content;
    
    // 根据关键词生成标题
    const keywords = [
      { patterns: [/机器学习|ML|深度学习|AI|人工智能/i], title: '机器学习合作咨询' },
      { patterns: [/计算机视觉|CV|图像|视觉/i], title: '计算机视觉研究' },
      { patterns: [/自然语言|NLP|语言模型/i], title: '自然语言处理' },
      { patterns: [/数据挖掘|大数据|数据分析/i], title: '数据科学研究' },
      { patterns: [/软件工程|系统设计|架构/i], title: '软件工程合作' },
      { patterns: [/网络安全|信息安全|密码学/i], title: '网络安全研究' },
      { patterns: [/生物信息|生物医学|医学/i], title: '生物医学工程' },
      { patterns: [/化学|材料|化工/i], title: '化学材料研究' },
      { patterns: [/物理|光学|量子/i], title: '物理学研究' },
      { patterns: [/数学|统计|算法/i], title: '数学统计研究' }
    ];
    
    // 尝试匹配关键词
    for (const keyword of keywords) {
      if (keyword.patterns.some(pattern => pattern.test(content))) {
        return keyword.title;
      }
    }
    
    // 如果没有匹配到关键词，使用前20个字符
    const shortContent = content.replace(/[^\u4e00-\u9fa5\w\s]/g, '').trim();
    if (shortContent.length > 20) {
      return shortContent.substring(0, 20) + '...';
    } else if (shortContent.length > 0) {
      return shortContent;
    }
    
    return '科研合作咨询';
  },

  // 格式化时间显示
  formatTime: function(timestamp) {
    const now = new Date();
    const date = new Date(timestamp);
    const diff = now - date;
    
    if (diff < 60000) { // 1分钟内
      return '刚刚';
    } else if (diff < 3600000) { // 1小时内
      return Math.floor(diff / 60000) + '分钟前';
    } else if (diff < 86400000) { // 24小时内
      return Math.floor(diff / 3600000) + '小时前';
    } else if (diff < 604800000) { // 7天内
      return Math.floor(diff / 86400000) + '天前';
    } else {
      return date.toLocaleDateString();
    }
  },

  // 联系我们图片加载成功
  onContactImageLoad: function(e) {
    // 标记为已加载并打印当前 src，部分环境下 load 事件的 e 为空或只包含小量信息
    this.setData({ contactImageLoadState: 'loaded' });
    const currentSrc = this.data.contactImageSrc || '';
    console.log('图片加载成功，当前图片路径:', currentSrc, 'event:', e && e.type ? e.type : e);
  },

  // 联系我们图片加载失败 -> 回退逻辑
  onContactImageError: function(e) {
    const current = this.data.contactImageSrc || '';
    console.log('图片加载失败，当前图片路径:', current);
    if (current && current.indexOf('images/contact-us.jpg') !== -1) {
      // 本地失败，回退到远程并加入时间戳以防止缓存问题
      const remote = 'https://r-z-zhang-ai.github.io/FINANCE/connect-us.jpg?t=' + Date.now();
      this.setData({ contactImageSrc: remote, contactImageLoadState: 'loading' });
      console.log('尝试加载远程图片（带cache-bust）:', remote);
    } else if (current && current.indexOf('r-z-zhang-ai.github.io') !== -1) {
      this.setData({ contactImageLoadState: 'error' });
      console.log('远程图片加载失败，显示占位内容。');
    } else {
      this.setData({ contactImageLoadState: 'error' });
      console.log('未知图片路径，显示占位内容。');
    }
  },

  stopPropagation: function() {
    // 阻止事件冒泡
  }
});
