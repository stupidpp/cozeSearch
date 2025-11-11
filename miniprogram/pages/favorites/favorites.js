// pages/favorites/favorites.js
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

  loadFavorites: function() {
    try {
      const favorites = wx.getStorageSync('favorites') || [];
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
  removeFavorite: function(e) {
    const profId = e.currentTarget.dataset.id;
    if (!profId) return;

    wx.showModal({
      title: '确认取消收藏',
      content: '确定要取消收藏这位教授吗？',
      success: (res) => {
        if (res.confirm) {
          try {
            let favorites = wx.getStorageSync('favorites') || [];
            favorites = favorites.filter(prof => prof.profId !== profId);
            wx.setStorageSync('favorites', favorites);
            
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
