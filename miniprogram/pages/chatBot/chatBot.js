// pages/chatBot/chatBot.js
const userManager = require('../../utils/userManager');

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
  // 联系我们图片控制（优先本地，失败则回退远程）
  // 使用根路径 `/assets/icons/...` 指向 miniprogram/images 下的资源，避免被解析为 /pages/assets/icons/...
  contactImageSrc: '/assets/icons/contact-us.jpg',
    contactImageLoadState: 'idle', // idle | loading | loaded | error
    // 侧边栏折叠状态
    conversationsCollapsed: false,
    favoritesCollapsed: false,
    // 收藏数据
    favoritesList: []
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
      this.loadUserConversations();
      // 加载收藏列表
      this.loadFavoritesList();
    } catch (err) {
      console.error('页面加载失败:', err);
    }
    if (!this.data.fabX || !this.data.fabY) this.setData({ fabX: defaultX, fabY: defaultY });
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
      sidebarOpen: false  // 直接关闭侧边栏
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
      const favorites = wx.getStorageSync('favorites') || [];
      // 只显示前5个收藏，避免列表过长
      const displayFavorites = favorites.slice(0, 5).map(prof => ({
        profId: prof.profId,
        name: prof.name,
        school: prof.school
      }));
      this.setData({ favoritesList: displayFavorites });
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
    wx.navigateTo({ url: '/pages/favorites/favorites' });
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

  // 发送消息
  onSend: async function() {
    const log = (message) => { console.log(`[onSend] ${message}`); };
    const input = this.data.inputValue.trim();
    if (!input || this.data.sending) return;
    console.log(`当前sending状态: ${this.data.sending}`);
    this.hideAllDeleteOptions();
    this.setData({ sending: true, inputValue: '', inputFocus: false });

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

    try {
      let result = await this.callCozeWorkflow(input);
      log(`处理返回结果: ${JSON.stringify(result)}`);
      
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
} else {
  // 如果是字符串格式，按原来的方式处理
  const resultStr = String(result);
  log(`result类型: ${typeof resultStr}, 原始值: ${resultStr}`);
  
  // 尝试匹配 <search_result> 标签（向后兼容）
  const searchResult = resultStr.match(/<search_result>([\s\S]*?)<\/search_result>/);
  if (searchResult && searchResult[1]) {
    log(`找到搜索结果: ${searchResult[1]}`);
    content = resultStr.replace(searchResult[0], '');
    try {
      // 关键步骤：移除 Markdown 代码块标记和多余换行
      const cleanJsonStr = searchResult[1]
        .replace(/^```json\s*/i, '') // 移除开头的 ```json（忽略大小写）
        .replace(/\s*```$/i, '')    // 移除结尾的 ```（忽略大小写）
        .replace(/\n/g, '');        // 移除换行符（可选，视情况保留）
      
      const parsedResult = JSON.parse(cleanJsonStr);
      // 注意：你的 JSON 里是 "data" 字段，不是 "result"！
      cardData = {
        type: 'professor_list',
        professors: parsedResult.data || [], // 用 data 字段，不是 result
      };
      log(`解析成功，共${parsedResult.data?.length || 0}位教授`);
    } catch (parseError) {
      log(`解析搜索结果失败: ${parseError.message}`);
      cardData = null;
    }
  } else {
    content = resultStr;
    log(`未找到搜索结果`);
  }
}
// 保存返回的对话ID到页面数据中，供下一次调用使用
if (conversationId) {
  this.setData({ currentCid: conversationId });
  log(`已保存新的conversation_id: ${conversationId}`);
}
this.addMessage({
  type: 'assistant',
  content: content || '抱歉，暂时无法获取回复，请稍后重试。',
  cardData: cardData
});

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
    log(`当前id: ${conversation_id}`);
    // TODO: 多轮对话
    
// 获取对话历史上下文（最多保留最近10轮对话）
const conversationHistory = this.getConversationHistoryForAPI();
    

    const cozeWorkflow = new Promise((resolve, _) => {
      wx.cloud.callFunction({
        name: 'coze_workflow',
        data: {
          input: userInput,
          conversation_id: conversation_id,// 传递对话ID
          conversation_history: conversationHistory // 新增：传递对话历史
  } ,
          
        timeout: 300000
      }).then((res) => {
        resolve(res);
      });
    });

    return (async () => {
      let result = await cozeWorkflow;
      if (!result || !result.result || !result.result.data) {
        console.error('云函数返回结果异常:', result);
        throw new Error('云函数返回数据格式不正确');
      }
      const conversationId = result.result.data.conversation_id;
      console.log(`API返回的新conversation_id: ${conversationId}`);
      log(`callCozeWorkflow result: ${JSON.stringify(result)}`);
      
      if (result.errMsg != 'cloud.callFunction:ok') {
        throw new Error(result.errMsg);
      }

      result = result.result;
      if (result.code !== 0) {
        throw new Error(result.message );
      }

      return result.data;
    })();
  },
 // 获取对话历史用于API调用（保留最近10轮对话）
 getConversationHistoryForAPI: function() {
  const messages = this.data.messages || [];
  const validMessages = messages.filter(msg => 
    msg.type === 'user' || msg.type === 'assistant'
  );
  
  // 限制历史记录数量，保留最近12轮对话（6对问答）
  const maxHistory = 12;
  const recentMessages = validMessages.slice(-maxHistory);
  
  // 格式化历史消息为API需要的格式
  const history = recentMessages.map(msg => ({
    role: msg.type === 'user' ? 'user' : 'assistant',
    content: msg.content || ''
  }));
  
  console.log(`准备传递对话历史: ${history.length}条消息`);
  return history;
},
  // 添加消息
  addMessage: function(msg) {
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

  /**
   * 生命周期函数--监听页面初次渲染完成
   */
  onReady: function() {},

  /**
   * 生命周期函数--监听页面显示
   */
  onShow: function() {
    // 重新加载收藏列表，以防从收藏页面返回后数据有变化
    this.loadFavoritesList();
  },

  /**
   * 生命周期函数--监听页面隐藏
   */
  onHide: function() {},

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

  /**
   * 页面相关事件处理函数--监听用户下拉动作
   */
  onPullDownRefresh: function() {},

  /**
   * 页面上拉触底事件的处理函数
   */
  onReachBottom: function() {},

  /**
   * 用户点击右上角分享
   */
  onShareAppMessage: function() {
    return {
      title: '科研合作智能助手',
      path: '/pages/index/index'
    }
  },

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
      
      // 获取最后一条消息作为预览
      const lastMessage = messages[messages.length - 1];
      const lastMsg = lastMessage ? 
        (lastMessage.content || '教授推荐结果') : '新对话';
      
      // 生成或更新对话标题
      const title = this.data.currentTitle || this.generateConversationTitle(messages);
      
      const conversationData = {
        conversationId: currentCid,
        title: title,
        lastMsg: lastMsg.substring(0, 30) + (lastMsg.length > 30 ? '...' : ''),
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
    } catch (e) {
      console.error('保存对话到历史记录失败:', e);
    }
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
