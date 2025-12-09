// feedback-card.js
Component({
    properties: {
      show: {
        type: Boolean,
        value: false
      },
      targetMsgId: {
        type: String,
        value: ''
      }
    },
    
    data: {
      innerRating: 0, // 当前选择的评分 (0-5)
      reason: '',     // 评价理由
      ratingText: {
        0: '请选择',
        1: '很差',
        2: '一般',
        3: '满意',
        4: '很好',
        5: '极佳'
      }
    },
    
    methods: {
      // 评分
      onRate(e) {
        const rating = e.currentTarget.dataset.rating;
        this.setData({ innerRating: rating });
      },
      
      // 输入理由
      onReasonInput(e) {
        this.setData({ reason: e.detail.value });
      },
      
      // 提交评价
      onSubmit() {
        if (this.data.innerRating === 0) {
          wx.showToast({
            title: '请先选择评分',
            icon: 'none'
          });
          return;
        }
        
        const feedback = {
          msgId: this.properties.targetMsgId,
          rating: this.data.innerRating,
          reason: this.data.reason.trim(),
          timestamp: Date.now()
        };
        
        console.log('提交评价:', feedback);
        
        // 触发事件，将评价数据传给父页面
        this.triggerEvent('submit', feedback);
        
        // 重置并隐藏
        this.resetAndHide();
        
        wx.showToast({
          title: '感谢您的评价！',
          icon: 'success'
        });
      },
      
      // 跳过
      onSkip() {
        this.triggerEvent('skip');
        this.resetAndHide();
      },
      
      // 重置并隐藏
      resetAndHide() {
        this.setData({
          innerRating: 0,
          reason: ''
        });
        this.triggerEvent('hide');
      }
    }
  });