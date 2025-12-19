// pages/favorites/favorites.js
const userManager = require('../../utils/userManager');

Page({
  data: {
    favorites: [],
    list: [], // 筛选后的列表
    loading: true,
    keyword: '',
    activeTag: '全部',
    allTags: [],
    sortBy: 'time'
  },

  onLoad: function() {
    this.loadFavorites();
  },

  onShow: function() {
    this.loadFavorites();
  },

 /* loadFavorites: function() {
    try {
      const favoritesKey = userManager.getUserFavoritesKey();
      const favorites = wx.getStorageSync(favoritesKey) || [];
      
     // const favorites = wx.getStorageSync('favorites') || [];
      // 提取所有标签
      const tags = Array.from(new Set(favorites.flatMap(prof => prof.areas || [])));
      
      this.setData({
        favorites: favorites,
        allTags: tags,
        loading: false
      }, () => {
        this.applyFilter();
      });
    } catch (error) {
      console.error('加载收藏失败:', error);
      this.setData({ loading: false });
    }
  },*/
  loadFavorites: function() {
    try {
      const favoritesKey = userManager.getUserFavoritesKey(); // 使用专属key
      const allFavorites = wx.getStorageSync(favoritesKey) || [];
      
      // ✅ 核心去重逻辑：同一profId只保留一个（例如保留最新的）
      const favoriteMap = new Map();
      allFavorites.forEach(prof => {
        // 如果已存在，可以选择保留 updatedAt 更大的一个（即更新的）
        if (!favoriteMap.has(prof.profId) || prof.updatedAt > favoriteMap.get(prof.profId).updatedAt) {
          favoriteMap.set(prof.profId, prof);
        }
      });
      const uniqueFavorites = Array.from(favoriteMap.values());
      
      const tags = Array.from(new Set(uniqueFavorites.flatMap(prof => prof.areas || [])));
      this.setData({
        favorites: uniqueFavorites, // ✅ 存储去重后的
        allTags: ['全部'].concat(tags), // 保持“全部”标签
        loading: false
      }, () => this.applyFilter());
      
    } catch (error) {
      console.error('加载收藏失败:', error);
      this.setData({ loading: false });
    }
  },
  // 搜索输入
  onInput: function(e) {
    this.setData({ keyword: e.detail.value });
  },

  // 搜索
  onSearch: function() {
    this.applyFilter();
  },

  // 标签筛选
  onTagTap: function(e) {
    const tag = e.currentTarget.dataset.tag;
    this.setData({ activeTag: tag }, () => {
      this.applyFilter();
    });
  },

  // 排序
  onSort: function(e) {
    const sortBy = e.currentTarget.dataset.key;
    this.setData({ sortBy }, () => {
      this.applyFilter();
    });
  },

  // 应用筛选
  applyFilter: function() {
    const { favorites, keyword, activeTag, sortBy } = this.data;
    const kw = (keyword || '').trim();
    
    // 筛选
    const filtered = favorites.filter(item => {
      // 标签筛选
      const tagOk = activeTag === '全部' || (item.areas || []).includes(activeTag);
      if (!tagOk) return false;
      
      // 关键词搜索
      if (!kw) return true;
      const searchText = `${item.name} ${item.school} ${(item.areas || []).join(' ')}`;
      return searchText.toLowerCase().includes(kw.toLowerCase());
    });
    
    // 排序
    const sorted = filtered.sort((a, b) => {
      if (sortBy === 'name') {
        return a.name.localeCompare(b.name);
      }
      // 默认按时间排序（最新收藏的在前）
      return (b.updatedAt || 0) - (a.updatedAt || 0);
    });
    
    this.setData({ list: sorted });
  },

  // 取消收藏
  /*removeFavorite: function(e) {
    const profId = e.currentTarget.dataset.id;
    if (!profId) return;

    wx.showModal({
      title: '确认取消收藏',
      content: '确定要取消收藏这位教授吗？',
      success: (res) => {
        if (res.confirm) {
          try {
            const favoritesKey = userManager.getUserFavoritesKey();

            let favorites = wx.getStorageSync('favorites') || [];
            favorites = favorites.filter(prof => prof.profId !== profId);
            wx.setStorageSync('favorites', favorites);
            if (wx.$emit) {
              wx.$emit('favoriteChanged', {
                profId: profId,
                isFav: false // 明确传递新状态：已取消收藏
              });
              console.log(`已发送取消收藏事件，profId: ${profId}`);
            }
            // 重新提取标签
            const tags = Array.from(new Set(favorites.flatMap(prof => prof.areas || [])));
            
            this.setData({ 
              favorites,
              allTags: tags
            }, () => {
              this.applyFilter();
            });
            
            wx.showToast({ title: '已取消收藏', icon: 'success' });
            
            // 发送事件通知其他页面更新收藏状态
            wx.$emit && wx.$emit('favoriteChanged', { profId, isFav: false });
          } catch (error) {
            wx.showToast({ title: '操作失败', icon: 'none' });
          }
        }
      }
    });
  },*/
  removeFavorite: function(e) {
    const profId = e.currentTarget.dataset.id;
    const uniqueKey = e.currentTarget.dataset.uniqueKey;
    if (!profId) return;
    const that = this;
  
    wx.showModal({
      title: '确认取消收藏',
      content: '确定要取消收藏这位教授吗？',
      success: (res) => {
        if (res.confirm) {
          try {
            // ✅ 1. 统一使用用户专属Key
            const favoritesKey = userManager.getUserFavoritesKey();
            let favorites = wx.getStorageSync(favoritesKey) || [];
            
            // ✅ 2. 精准删除：只删除profId匹配的
            const beforeLength = favorites.length;
            favorites = favorites.filter(prof => prof.profId !== profId);
            
            if (favorites.length === beforeLength) {
              wx.showToast({ title: '未找到该收藏', icon: 'none' });
              return;
            }
            
            wx.setStorageSync(favoritesKey, favorites);
            
            // ✅ 3. 发送事件，通知列表组件更新UI（按钮变红）
            if (wx.$emit) {
              wx.$emit('favoriteChanged', { profId:profId, uniqueKey:uniqueKey,isFav: false });
            }
            
            // ✅ 4. 更新收藏页UI（应用去重逻辑）
            const uniqueFavorites = [];
            const seenIds = new Set();
            for (const prof of favorites) {
              if (!seenIds.has(prof.profId)) {
                seenIds.add(prof.profId);
                uniqueFavorites.push(prof);
              }
            }
            
            const tags = Array.from(new Set(uniqueFavorites.flatMap(prof => prof.areas || [])));
            that.setData({ 
              favorites: uniqueFavorites, // ✅ 使用去重后的列表
              allTags: tags
            }, () => {
              that.applyFilter();
              wx.showToast({ title: '已取消收藏', icon: 'success' });
            });
            
          } catch (error) {
            console.error('取消收藏失败:', error);
            wx.showToast({ title: '操作失败', icon: 'none' });
          }
        }
      }
    });
  },
  // 分享教授
  shareProfessor: function(e) {
    const prof = e.currentTarget.dataset.prof;
    if (!prof) return;

    const shareData = {
      type: 'professor',
      professor: prof,
      timestamp: Date.now()
    };

    wx.shareAppMessage({
      title: `推荐教授：${prof.name}`,
      path: `/pages/shared/shared?data=${encodeURIComponent(JSON.stringify(shareData))}`,
      success: () => {
        wx.showToast({ title: '分享成功', icon: 'success' });
      }
    });
  },

  // 复制联系方式
  copyContact: function(e) {
    const text = e.currentTarget.dataset.text;
    if (!text) return;

    wx.setClipboardData({
      data: text,
      success: () => {
        wx.showToast({ title: '已复制', icon: 'success' });
      }
    });
  }
});
