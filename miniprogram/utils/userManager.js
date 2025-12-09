// utils/userManager.js
/**
 * 用户管理工具类
 * 用于生成和管理用户ID，确保不同用户的聊天数据隔离
 */

class UserManager {
  constructor() {
    this.userKey = 'current_user_id';
    this.userListKey = 'user_list';
  }

  /**
   * 生成用户ID - 基于时间戳和随机字符串，确保隐私安全
   */
  generateUserId() {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substr(2, 8);
    return `user_${timestamp}_${random}`;
  }

  /**
   * 获取当前用户ID，如果不存在则创建新用户
   */
  getCurrentUserId() {
    try {
      let currentUserId = wx.getStorageSync(this.userKey);
      if (!currentUserId) {
        currentUserId = this.generateUserId();
        this.setCurrentUserId(currentUserId);
        this.addUserToList(currentUserId);
      }
      return currentUserId;
    } catch (e) {
      console.error('获取用户ID失败:', e);
      // 使用临时用户ID
      return 'temp_user_' + Date.now();
    }
  }

  /**
   * 设置当前用户ID
   */
  setCurrentUserId(userId) {
    try {
      wx.setStorageSync(this.userKey, userId);
      // 确保用户在用户列表中
      this.addUserToList(userId);
    } catch (e) {
      console.error('设置用户ID失败:', e);
    }
  }

  /**
   * 获取所有用户列表
   */
  getUserList() {
    try {
      return wx.getStorageSync(this.userListKey) || [];
    } catch (e) {
      console.error('获取用户列表失败:', e);
      return [];
    }
  }

  /**
   * 添加用户到列表
   */
  addUserToList(userId) {
    try {
      const userList = this.getUserList();
      if (!userList.includes(userId)) {
        userList.push(userId);
        wx.setStorageSync(this.userListKey, userList);
      }
    } catch (e) {
      console.error('添加用户到列表失败:', e);
    }
  }

  /**
   * 创建新用户并切换
   */
  createNewUser() {
    const newUserId = this.generateUserId();
    this.setCurrentUserId(newUserId);
    return newUserId;
  }

  /**
   * 切换用户
   */
  switchUser(userId) {
    this.setCurrentUserId(userId);
  }

  /**
   * 获取用户专用的存储key
   */
  getUserStorageKey(baseKey) {
    const userId = this.getCurrentUserId();
    return `${baseKey}_${userId}`;
  }

  /**
   * 获取用户的会话列表key
   */
  getUserConversationsKey() {
    return this.getUserStorageKey('conversations');
  }

  /**
   * 获取用户的当前会话key
   */
  getUserCurrentCidKey() {
    return this.getUserStorageKey('current_cid');
  }

  /**
   * 获取用户的会话消息key
   */
  getUserConversationKey(conversationId) {
    return this.getUserStorageKey(`conv_${conversationId}`);
  }
  /**
   * 获取用户专属的收藏存储key
   * @returns 用户收藏列表的key
   */
  getUserFavoritesKey() {
    return this.getUserStorageKey('favorites');
  }

  /**
   * 删除用户数据
   */
  deleteUser(userId) {
    try {
      // ... existing code ...
      
      //新增：删除用户的收藏数据
      const favoritesKey = `favorites_${userId}`;
      wx.removeStorageSync(favoritesKey);

    } catch (e) {
      console.error('删除用户数据失败:', e);
    }
  }

  /**
   * 删除用户数据
   */
  deleteUser(userId) {
    try {
      // 从用户列表中移除
      const userList = this.getUserList().filter(id => id !== userId);
      wx.setStorageSync(this.userListKey, userList);

      // 删除该用户的所有数据
      const conversationsKey = `conversations_${userId}`;
      const currentCidKey = `current_cid_${userId}`;
      
      // 获取用户的会话列表，删除所有会话数据
      const conversations = wx.getStorageSync(conversationsKey) || [];
      conversations.forEach(conv => {
        const convKey = `conv_${conv.conversationId}_${userId}`;
        wx.removeStorageSync(convKey);
      });

      // 删除会话列表和当前会话
      wx.removeStorageSync(conversationsKey);
      wx.removeStorageSync(currentCidKey);

    } catch (e) {
      console.error('删除用户数据失败:', e);
    }
  }

  /**
   * 获取用户显示名称（用于UI显示）
   */
  getUserDisplayName(userId) {
    if (!userId) return '未知用户';
    
    // 提取时间戳部分并转换为可读日期
    const parts = userId.split('_');
    if (parts.length >= 2 && parts[0] === 'user') {
      try {
        const timestamp = parseInt(parts[1], 36);
        const date = new Date(timestamp);
        const month = date.getMonth() + 1;
        const day = date.getDate();
        const hour = date.getHours();
        const minute = date.getMinutes();
        return `用户${month}${day}${hour}${minute}`;
      } catch (e) {
        // 如果解析失败，使用简化显示
      }
    }
    
    // 简化显示：只显示后8位
    return `用户${userId.slice(-8)}`;
  }
   /**
   * 获取用户的关键词存储key
   */
   getUserKeywordsKey() {
    return this.getUserStorageKey('keywords');
  }

  /**
   * 获取用户的摘要存储key
   */
  getUserSummaryKey() {
    return this.getUserStorageKey('summaries');
  }

  /**
   * 获取用户的关键词列表
   */
  getUserKeywords() {
    const keywordsKey = this.getUserKeywordsKey();
    return wx.getStorageSync(keywordsKey) || [];
  }

  /**
   * 获取用户的对话摘要
   */
  getUserSummaries() {
    const summaryKey = this.getUserSummaryKey();
    return wx.getStorageSync(summaryKey) || [];
  }
}

// 创建单例实例
const userManager = new UserManager();

module.exports = userManager;
