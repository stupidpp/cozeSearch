const cloud = require('wx-server-sdk');
const axios = require('axios');

// 初始化云开发
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

// 清理和预处理文本
function cleanResponseText(text) {
  if (!text) return '';
  // 1. 移除所有类似 [1]、[2] prof_info、[ 3 ] 等标记，更彻底
  let cleanedText = text.replace(/\[\s*\d+\s*\]\s*(prof_info)?/g, '');
  // 2. 移除markdown的加粗星号
  cleanedText = cleanedText.replace(/\*\*/g, '');
  // 3. 移除开头的序号，如 "1. "
  cleanedText = cleanedText.replace(/^\d+\.\s*/, '');
  // 4. 将全角符号替换为半角，便于解析
  cleanedText = cleanedText.replace(/[：，；（）]/g, (match) => {
    const map = {
      '：': ':',
      '，': ',',
      '；': ';',
      '（': '(',
      '）': ')'
    };
    return map[match];
  });
  return cleanedText.trim();
}


/**
 * ----------------------------------------------------------------
 * 新增辅助函数 (New Helper Functions for Multi-step Prompting)
 * ----------------------------------------------------------------
 */

/**
 * 封装了完整的Coze API调用、轮询和消息获取流程
 * @param {string} input - 发送给AI的文本
 * @param {string} conversation_id - 当前对话ID
 * @param {object} config - 包含bot_id, user_id, headers等配置
 * @returns {Promise<string>} - 返回AI助手的最终回复文本
 */
async function callCozeAndGetAnswer(input, conversation_id, config, maxRetries = 2) {
  const { bot_id, user_id, headers } = config;
  console.log(`🚀 [callCozeAndGetAnswer] 发起新调用, input: "${input.substring(0, 50)}..."`);

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      if (attempt > 0) {
        console.log(`🔄 [callCozeAndGetAnswer] 第 ${attempt + 1} 次尝试...`);
        // 优化重试延迟：减少等待时间（1秒、2秒）
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
      }

      const body = {
        bot_id,
        user_id,
        stream: false,
        auto_save_history: true,
        additional_messages: [{
          content: input,
          content_type: "text",
          role: "user",
          type: "question"
        }]
      };
      if (conversation_id) {
        body.conversation_id = conversation_id;
      }

      // 1. 发起Chat请求 - 优化超时时间为30秒
      const resp = await axios.post('https://api.coze.cn/v3/chat', body, { headers, timeout: 30000 });
      if (resp.status !== 200 || !resp.data?.data?.id) {
        throw new Error(`发起Chat失败: ${resp.status} - ${resp.data?.error?.message || '未知错误'}`);
      }
 
      const chat_id = resp.data.data.id;
      const conv_id = resp.data.data.conversation_id;
      let chatStatus = resp.data.data.status;

      // 2. 轮询获取结果（优化轮询次数和间隔以避免超时）
      let retryCount = 0;
      const maxPollingRetries = 12; // 减少轮询次数避免超时
      while (chatStatus === 'in_progress' && retryCount < maxPollingRetries) {
        // 优化轮询间隔：前3次1秒，中间6次1.5秒，后续2秒
        const waitTime = retryCount < 3 ? 1000 : (retryCount < 9 ? 1500 : 2000);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        
        const queryResp = await axios.get(`https://api.coze.cn/v3/chat/retrieve?chat_id=${chat_id}&conversation_id=${conv_id}`, { headers, timeout: 10000 });
        if (queryResp.status === 200 && queryResp.data?.data) {
          chatStatus = queryResp.data.data.status;
          if (chatStatus === 'completed' || chatStatus === 'failed') break;
        }
        retryCount++;
      }
      console.log(`[callCozeAndGetAnswer] 轮询结束, 状态: ${chatStatus}, 轮询次数: ${retryCount}/${maxPollingRetries}`);

      // 3. 获取消息列表 - 优化超时时间
      const messagesResp = await axios.get(`https://api.coze.cn/v3/chat/message/list?chat_id=${chat_id}&conversation_id=${conv_id}`, { headers, timeout: 15000 });
      if (messagesResp.status === 200 && messagesResp.data?.data?.length > 0) {
        const answerMsg = messagesResp.data.data.find(m => m.role === 'assistant' && m.type === 'answer' && m.content);
        if (answerMsg) {
          console.log(`[callCozeAndGetAnswer] ✅ 成功获取回复, 长度: ${answerMsg.content.length}`);
          return answerMsg.content;
        }
      }
      
      // 如果没有获取到有效回复，但也不是错误，则抛出异常进行重试
      if (attempt < maxRetries) {
        throw new Error('未能获取有效回复，将重试');
      }
      
      console.log(`[callCozeAndGetAnswer] ⚠️ 未能获取有效回复`);
      return '';

    } catch (e) {
      console.error(`[callCozeAndGetAnswer] ❌ 第 ${attempt + 1} 次尝试失败:`, e.message);
      
      // 如果是最后一次尝试，返回空字符串
      if (attempt === maxRetries) {
        console.error(`[callCozeAndGetAnswer] ❌ 所有重试均失败，返回空结果`);
        return '';
      }
      
      // 否则继续重试
      continue;
    }
  }
  
  return '';
}

/**
 * 计算教授与用户需求的匹配度
 * @param {string} userQuery - 用户原始查询
 * @param {string} professorContent - 教授相关内容
 * @returns {number} - 匹配度百分比 (0-100)
 */
function calculateMatchScore(userQuery, professorContent) {
  if (!userQuery || !professorContent) return 0;
  
  // 提取用户查询中的关键词
  const userKeywords = userQuery.toLowerCase()
    .replace(/[^\u4e00-\u9fa5a-zA-Z0-9\s]/g, ' ') // 保留中英文和数字
    .split(/\s+/)
    .filter(word => word.length > 1)
    .filter(word => !['教授', '老师', '研究', '方向', '领域', '专业', '寻找', '推荐', '相关'].includes(word));
  
  if (userKeywords.length === 0) return 60; // 默认匹配度
  
  const content = professorContent.toLowerCase();
  let matchCount = 0;
  
  userKeywords.forEach(keyword => {
    if (content.includes(keyword)) {
      matchCount++;
    }
  });
  
  // 计算匹配度，至少保证30%，最高95%
  const baseScore = Math.min(95, Math.max(30, (matchCount / userKeywords.length) * 100));
  // 添加一些随机性，使分数更自然
  return Math.round(baseScore + (Math.random() * 10 - 5));
}

/**
 * 从研究内容中提取标签
 * @param {string} content - 研究内容
 * @returns {Array<string>} - 标签数组
 */
function extractResearchTags(content) {
  if (!content) return [];
  
  const commonTags = [
    '人工智能', 'AI', '机器学习', '深度学习', '神经网络',
    '计算机视觉', '自然语言处理', 'NLP', '大数据', '数据挖掘',
    '云计算', '物联网', '区块链', '网络安全', '信息安全',
    '软件工程', '数据库', '分布式系统', '算法设计',
    '生物信息学', '医学影像', '精准医疗', '基因组学',
    '材料科学', '纳米技术', '新能源', '电池技术',
    '机器人', '自动化', '控制系统', '传感器',
    '量子计算', '区块链', '边缘计算', '5G通信',
    '图像处理', '语音识别', '推荐系统', '知识图谱',
    '多模态', '强化学习', '联邦学习', '迁移学习'
  ];
  
  const foundTags = [];
  const contentLower = content.toLowerCase();
  
  commonTags.forEach(tag => {
    if (contentLower.includes(tag.toLowerCase()) && !foundTags.includes(tag)) {
      foundTags.push(tag);
    }
  });
  
  // 最多返回5个标签
  return foundTags.slice(0, 5);
}

/**
 * 从AI回答中提取教授的研究方向
 * @param {string} content - 教授相关内容
 * @returns {Array<string>} - 研究方向数组
 */
function extractResearchAreas(content) {
  if (!content) return [];
  
  const areas = [];
  const areaPatterns = [
    // 匹配"研究方向：xxx"、"主要研究方向：xxx"等
    /(?:主要)?研究方向[：:]([^。\n]+)/gi,
    /研究领域[：:]([^。\n]+)/gi,
    /专业领域[：:]([^。\n]+)/gi,
    // 匹配"专注于xxx研究"、"从事xxx研究"等
    /(?:专注于|从事|致力于)([^，。\n]*?研究)/gi,
    // 匹配"在xxx领域"、"在xxx方面"等
    /在([^，。\n]*?(?:领域|方面|技术|系统))/gi,
    // 匹配常见的研究描述模式
    /(?:研究|开发|设计)([^，。\n]*?(?:算法|系统|方法|技术|模型))/gi
  ];
  
  areaPatterns.forEach(pattern => {
    const matches = content.match(pattern);
    if (matches) {
      matches.forEach(match => {
        const extracted = match.replace(/(?:主要)?研究方向[：:]|研究领域[：:]|专业领域[：:]|专注于|从事|致力于|在|研究|开发|设计/gi, '').trim();
        if (extracted && extracted.length > 2 && extracted.length < 50) {
          areas.push(extracted);
        }
      });
    }
  });
  
  // 去重并返回前5个
  return [...new Set(areas)].slice(0, 5);
}

/**
 * 从AI回答中提取教授的研究成果/亮点
 * @param {string} content - 教授相关内容
 * @returns {Array<string>} - 研究成果数组
 */
function extractResearchHighlights(content) {
  if (!content) return [];
  
  const highlights = [];
  
  // 按段落和句子分割
  const sentences = content
    .split(/[\n。；]/)
    .map(s => s.replace(/^\d+\.\s*/, '').replace(/^[-•]\s*/, '').trim())
    .filter(s => s.length > 15); // 保留较长的句子
  
  sentences.forEach(sentence => {
    // 识别包含成果、贡献、发表等关键词的句子
    if (/(?:发表|出版|获得|承担|主持|参与|获奖|成果|贡献|创新|提出|开发|设计|实现|建立|构建|探索|研发)/.test(sentence)) {
      // 清理句子
      let cleanSentence = sentence
        .replace(/https?:\/\/[^\s,，。)]+/g, '') // 移除URL
        .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '') // 移除邮箱
        .replace(/[，。；]$/, '') // 移除末尾标点
        .trim();
      
      if (cleanSentence.length > 10 && cleanSentence.length < 200) {
        highlights.push(cleanSentence);
      }
    }
  });
  
  // 如果没有找到明确的成果描述，提取一般性描述
  if (highlights.length === 0) {
    sentences.forEach(sentence => {
      if (!/(?:联系方式|个人简介|基本信息|邮箱|电话|地址)/.test(sentence)) {
        let cleanSentence = sentence
          .replace(/https?:\/\/[^\s,，。)]+/g, '')
          .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '')
          .replace(/[，。；]$/, '')
          .trim();
        
        if (cleanSentence.length > 15 && cleanSentence.length < 200) {
          highlights.push(cleanSentence);
        }
      }
    });
  }
  
  return highlights.slice(0, 4); // 最多返回4条
}

/**
 * 从初次AI回复中提取教授信息
 * @param {string} text - 初次AI的回复文本
 * @param {string} userQuery - 用户原始查询
 * @returns {Array<{name: string, highlights: string[], areas: string[], matchScore: number, tags: string[]}>}
 */
function extractProfessorNamesAndHighlights(text, userQuery = '') {
  if (!text) return [];
  
  const professors = [];
  // 匹配 "1. **姓名**" 这样的格式
  const professorMatches = text.match(/(\d+\.\s*\*\*([^*]+)\*\*[^]*?)(?=\d+\.\s*\*\*|$)/g);

  if (!professorMatches) {
    console.log('初次解析: 未找到编号格式的教授列表');
    return [];
  }

  professorMatches.forEach((match, index) => {
    const nameMatch = match.match(/\*\*([^*]+)\*\*/);
    if (nameMatch && nameMatch[1]) {
      const name = nameMatch[1].trim();
      
      // 清理内容
      const cleanedMatch = cleanResponseText(match);
      
      // 🎯 从AI回答中提取研究方向、研究内容和研究成果
      const researchAreas = extractResearchAreas(cleanedMatch);
      const researchHighlights = extractResearchHighlights(cleanedMatch);
      
      // 计算匹配度
      const matchScore = calculateMatchScore(userQuery, cleanedMatch);
      
      // 提取一些通用标签作为补充
      const tags = extractResearchTags(cleanedMatch);
      
      console.log(`🎯 [${name}] 解析结果:`);
      console.log(`   - 匹配度: ${matchScore}%`);
      console.log(`   - 研究方向: [${researchAreas.join(', ')}]`);
      console.log(`   - 研究亮点: ${researchHighlights.length}条`);
      console.log(`   - 补充标签: [${tags.join(', ')}]`);
      
      professors.push({
        name: name,
        highlights: researchHighlights, 
        areas: researchAreas, // 从AI回答中提取的真实研究方向
        matchScore: matchScore,
        tags: tags // 辅助标签
      });
    }
  });
  
  // 🎯 保留前3个教授进行详细处理
  const limitedProfessors = professors.slice(0, 3);
  console.log(`初次解析: 提取到 ${professors.length} 位教授，保留前 ${limitedProfessors.length} 位进行详细处理`);
  return limitedProfessors;
}

/**
 * 从第2轮AI回复中解析联系信息
 * @param {string} text - AI对联系信息询问的回复
 * @returns {{school: string, office: string, email: string, phone: string, homepages: string[]}}
 */
function parseDetailedInfo(text) {
  if (!text) return {};

  console.log(`🔍 开始解析联系信息，原始文本长度: ${text.length}`);
  console.log(`📝 原始回复内容前200字符: ${text.substring(0, 200)}...`);

  const cleanedText = cleanResponseText(text);
  let school = '', office = '', email = '', phone = '';
  let homepages = [];

  // 🎯 增强学院提取 - 支持更多模式
  const schoolPatterns = [
    // 直接格式：学院：xxx
    /(?:学院|系|研究所|中心)[:：]\s*([^\n,，。]+)/i,
    // 描述格式：任职于xxx学院
    /(?:任职于|就职于|所在|来自|属于)\s*([^\n,，。]*?(学院|系|研究所|중심))/i,
    // 浙江大学xxx学院
    /浙江大学\s*([^\n,，。]*?(学院|系|研究所|中心))/i,
    // 独立的学院名称
    /([^\n,，。]*?(学院|系|研究所|中心))/i
  ];
  
  for (const pattern of schoolPatterns) {
    const match = cleanedText.match(pattern);
    if (match && match[1]) {
      school = match[1].replace(/^(浙江大学|浙大)/, '').trim();
      console.log(`✅ 找到学院: ${school}`);
      break;
    }
  }

  // 🎯 增强邮箱提取
  const emailPatterns = [
    // 邮箱：xxx@xxx
    /(?:邮箱|email|邮件|电子邮箱)[:：]\s*([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i,
    // 联系邮箱xxx@xxx
    /联系.*?([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i,
    // 直接的邮箱格式
    /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/
  ];
  
  for (const pattern of emailPatterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      email = match[1];
      console.log(`✅ 找到邮箱: ${email}`);
      break;
    }
  }

  // 🎯 增强办公地点提取
  const officePatterns = [
    /(?:办公地点|办公室|地址|位置)[:：]\s*([^\n,，。]{2,50})/i,
    /(?:办公|地点)\s*[:：]?\s*([^\n,，。]{2,50})/i,
    /(?:位于|地址在)\s*([^\n,，。]{2,50})/i
  ];
  
  for (const pattern of officePatterns) {
    const match = cleanedText.match(pattern);
    if (match && match[1]) {
      office = match[1].trim();
      console.log(`✅ 找到办公地点: ${office}`);
      break;
    }
  }

  // 🎯 增强电话提取
  const phonePatterns = [
    /(?:电话|手机|联系电话|联系方式)[:：]\s*([\d\s\-\+\(\)]{8,20})/i,
    /(?:tel|phone)[:：]?\s*([\d\s\-\+\(\)]{8,20})/i,
    /(1[3-9]\d{9})/g, // 手机号
    /(\d{3,4}[-\s]?\d{7,8})/g // 固定电话
  ];
  
  for (const pattern of phonePatterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      phone = match[1].trim();
      console.log(`✅ 找到电话: ${phone}`);
      break;
    }
  }

  // 🎯 增强主页提取
  const homepagePatterns = [
    // 个人主页：http://xxx
    /(?:个人主页|主页|网站|homepage|website)[:：]\s*(https?:\/\/[^\s\n,，）)]+)/gi,
    // 访问xxx网站
    /(?:访问|查看)\s*(https?:\/\/[^\s\n,，）)]+)/gi,
    // 直接的URL
    /(https?:\/\/[^\s\n,，）)]+)/gi
  ];
  
  const allUrls = [];
  homepagePatterns.forEach(pattern => {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const url = match[1] || match[0];
      if (url && !allUrls.includes(url)) {
        allUrls.push(url.trim());
      }
    }
  });
  
  // 过滤出可能的个人主页
  homepages = allUrls.filter(url => 
    url.includes('.edu') || 
    url.includes('zju.edu.cn') ||
    url.includes('faculty') ||
    url.includes('people') ||
    url.includes('personal') ||
    url.includes('~')
  ).slice(0, 3); // 最多3个主页
  
  if (homepages.length > 0) {
    console.log(`✅ 找到主页: ${homepages.join(', ')}`);
  }
  
  const detailedInfo = { school, office, email, phone, homepages };
  console.log(`🎯 最终解析结果:`, detailedInfo);
  return detailedInfo;
}


// 检查是否为无关提问的回答
function isIrrelevantResponse(text) {
  if (!text || typeof text !== 'string') {
    return false;
  }
  
  // 无关提问的关键词和模式
  const irrelevantPatterns = [
    /抱歉.*无法.*提供.*回答/i,
    /我们无法为您提供.*的回答/i,
    /不在.*服务范围/i,
    /专注于.*科研.*合作/i,
    /请问.*科研.*需求/i,
    /我是.*科研.*助手/i,
    /只能.*科研.*相关/i,
    /预约.*进校/i,
    /生活.*服务/i,
    /行政.*事务/i,
    /校园.*导航/i,
    /课程.*安排/i,
    /考试.*成绩/i,
    /宿舍.*食堂/i
  ];
  
  return irrelevantPatterns.some(pattern => pattern.test(text));
}

// 检查是否为详细询问某个特定教授
function isSpecificProfessorInquiry(userInput) {
  if (!userInput || typeof userInput !== 'string') {
    return false;
  }
  
  const specificPatterns = [
    /.*教授.*怎么样/i,
    /.*教授.*详细.*信息/i,
    /.*教授.*研究.*方向/i,
    /.*教授.*联系.*方式/i,
    /.*教授.*发表.*论文/i,
    /.*教授.*具体.*做什么/i,
    /详细.*介绍.*教授/i,
    /能否.*详细.*说明/i,
    /具体.*了解.*教授/i,
    /更多.*关于.*教授/i
  ];
  
  return specificPatterns.some(pattern => pattern.test(userInput));
}

// 从文本中解析教授信息并生成卡片数据
function parseProfesorInfoFromText(text) {
  try {
    if (!text || typeof text !== 'string') {
      return null;
    }

    // 🔥 首先检查是否为无关提问的回答 - 如果是，直接返回null
    if (isIrrelevantResponse(text)) {
      console.log('⚠️ 检测到无关提问回答，跳过教授信息解析');
      return null;
    }

    // 必须包含教授推荐的明确特征才进行解析
    const hasValidProfessorIndicators = [
      /教授.*推荐/i,
      /推荐.*教授/i,
      /以下.*教授/i,
      /为您推荐/i,
      /适合.*教授/i,
      /匹配.*教授/i,
      /科研.*合作.*教授/i,
      /\d+\.\s*\*\*[^*]+\*\*.*?(学院|研究所|系)/i  // 编号+教授姓名+学院格式
    ].some(pattern => pattern.test(text));

    if (!hasValidProfessorIndicators) {
      console.log('⚠️ 文本中未检测到教授推荐特征，跳过解析');
      return null;
    }

    // 寻找教授推荐的文本模式
    const professors = [];
    
    // 更严格的教授匹配：必须同时包含姓名格式和学院信息
    let professorMatches = text.match(/(\d+\.\s*\*\*([^*]+)\*\*[^]*?)(?=\d+\.\s*\*\*|$)/g);
    
    // 如果没有找到编号格式，尝试匹配包含学院信息的教授介绍
    if (!professorMatches || professorMatches.length === 0) {
      // 只有当文本同时包含**姓名**和学院信息时才认为是教授介绍
      const singleProfRegex = /\*\*([^*]+)\*\*[^]*?(学院|研究所|系)/i;
      const singleProfMatch = text.match(singleProfRegex);
      if (singleProfMatch) {
        professorMatches = [singleProfMatch[0]]; // 只使用匹配到的部分，不是整段文本
      }
    }
    
    if (professorMatches && professorMatches.length > 0) {
      professorMatches.forEach((match, index) => {
        try {
          // 提取教授姓名
          const nameMatch = match.match(/\*\*([^*]+)\*\*/);
          const name = nameMatch ? nameMatch[1].trim() : `教授${index + 1}`;
          
          // 提取学院信息 - 只保留学院名称
          let school = '';
          const schoolPatterns = [
            // 匹配：浙江大学xxx学院
            /浙江大学([^，。：:]*?)(学院|研究所|系)/,
            // 匹配：就职于xxx学院（排除教师姓名部分）
            /就职于[^，。：:]*?([^，。：:]*?)(学院|研究所|系)/,
            // 匹配：xxx学院（通用模式，但要避免匹配到教师姓名）
            /(?:^|[，。：:\s])([^，。：:*]*?)(学院|研究所|系)/,
            // 直接匹配常见学院名称
            /(软件学院|计算机学院|信息学院|工程师学院|医学院|管理学院|计算机科学与技术学院|控制科学与工程学院|生物医学工程与仪器科学学院|光电科学与工程学院|材料科学与工程学院|化学工程与生物工程学院|海洋学院|建筑工程学院|机械工程学院|能源工程学院|航空航天学院|电气工程学院|生命科学学院|药学院|基础医学院|公共卫生学院|口腔医学院|护理学院|心理与行为科学系|教育学院|人文学院|外国语言文化与国际交流学院|传媒与国际文化学院|经济学院|管理学院|公共管理学院|法学院|马克思主义学院|数学科学学院|物理学院|化学系|地球科学学院|心理与行为科学系|体育科学与技术学院)/
          ];
          
          for (const pattern of schoolPatterns) {
            const schoolMatch = match.match(pattern);
            if (schoolMatch) {
              if (pattern.source.includes('浙江大学')) {
                // 从浙江大学xx学院中提取学院名
                school = (schoolMatch[1] + schoolMatch[2]).trim();
              } else if (pattern.source.includes('就职于')) {
                // 从"就职于xxx学院"中提取学院名
                school = (schoolMatch[1] + schoolMatch[2]).trim();
              } else if (schoolMatch[2] && (schoolMatch[2] === '学院' || schoolMatch[2] === '研究所' || schoolMatch[2] === '系')) {
                // 通用模式：匹配学院名
                let schoolName = (schoolMatch[1] + schoolMatch[2]).trim();
                // 过滤掉可能的教师姓名（包含**或过短的文本）
                if (!schoolName.includes('*') && schoolName.length > 2) {
                  school = schoolName;
                }
              } else {
                // 直接使用完整匹配（常见学院名称）
                school = schoolMatch[0].trim();
              }
              
              // 如果成功匹配到学院名，跳出循环
              if (school && school.length > 2) {
                break;
              }
            }
          }
          
          // 清理学院名称，移除不必要的前缀和格式
          if (school) {
            // 移除可能的教师姓名和格式标记
            school = school.replace(/\*\*[^*]*\*\*[：:]*/, '').trim(); // 移除 **姓名**：
            school = school.replace(/^[^：:]*[：:]/, '').trim(); // 秮除 xxx：
            school = school.replace(/^(浙江大学|浙大)/, '').trim(); // 移除大学名
            school = school.replace(/^就职于/, '').trim(); // 秘除"就职于"
            school = school.replace(/^的/, '').trim(); // 秘除"的"
            
            // 确保包含学院/研究所/系后缀
            if (school && !school.includes('学院') && !school.includes('研究所') && !school.includes('系')) {
              school = school + '学院';
            }
            
            // 最终检查：如果学院名过短或包含特殊字符，设为默认值
            if (!school || school.length < 3 || school.includes('*') || school.includes('：') || school.includes(':')) {
              school = '未知学院';
            }
          }
          if (!school) school = '未知学院';
          
          // 提取邮箱 - 更严格的模式，必须包含 "邮箱" 或 "email" 关键词
          let email = '';
          const emailPatterns = [
            /(?:邮箱|email)\s*[：:]\s*([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i,
          ];
          
          for (const pattern of emailPatterns) {
            const emailMatch = match.match(pattern);
            if (emailMatch && emailMatch[1]) {
              email = emailMatch[1].trim();
              break;
            }
          }

          // 如果严格模式找不到，再尝试宽松匹配，但要避免误判
          if (!email) {
            const looseEmailMatches = match.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g);
            if (looseEmailMatches) {
              // 寻找最可能的一个，例如包含zju.edu.cn
              const zjuEmail = looseEmailMatches.find(e => e.includes('zju.edu.cn'));
              if (zjuEmail) {
                email = zjuEmail;
              }
              // 避免将其他文本误判为邮箱，这里不再使用第一个匹配项作为兜底
            }
          }

          // 提取办公地点 - 支持多种格式
          let office = '';
          const officePatterns = [
            /(?:办公地点|办公室|地址)[：:\s]*([^\n。；,，]+)/i,
            /(?:办公|地点)[：:\s]*([^\n。；,，]+)/i,
            /(?:位置|地址)[：:\s]*([^\n。；,，]+)/i
          ];
          
          for (const pattern of officePatterns) {
            const officeMatch = match.match(pattern);
            if (officeMatch && officeMatch[1] && officeMatch[1].length > 2) {
              office = officeMatch[1].trim();
              // 移除可能的多余信息
              office = office.replace(/[。；,，].*$/, '').trim();
              if (office.length > 2) {
                break;
              }
            }
          }

          // 提取联系电话 - 支持多种格式
          let phone = '';
          const phonePatterns = [
            /(?:联系)?(?:电话|手机|tel)[：:\s]*([\d\s\-\+\(\)]{8,20})/i,
            /(?:phone|tel)[：:\s]*([\d\s\-\+\(\)]{8,20})/i,
            /(1[3-9]\d{9})/g, // 手机号
            /(\d{3,4}[-\s]?\d{7,8})/g // 固定电话
          ];
          
          for (const pattern of phonePatterns) {
            const phoneMatch = match.match(pattern);
            if (phoneMatch && phoneMatch[1]) {
              phone = phoneMatch[1].trim();
              // 清理格式
              phone = phone.replace(/[^\d\-\+\(\)\s]/g, '').trim();
              if (phone.length >= 8) {
                break;
              }
            }
          }
          
          // 提取个人主页 - 更严格的模式
          const homepages = [];
          const homepagePatterns = [
            /(?:个人主页|主页|homepage|website)\s*[：:]\s*(https?:\/\/[^\s\n,，）)]+)/gi,
          ];
          
          for (const pattern of homepagePatterns) {
            let homepageMatch;
            // 使用 exec 而不是 match 来处理全局标志 /g
            while ((homepageMatch = pattern.exec(match)) !== null) {
              if (homepageMatch[1] && !homepages.includes(homepageMatch[1])) {
                homepages.push(homepageMatch[1].trim());
              }
            }
          }

          // 如果严格模式找不到，再尝试宽松匹配，并进行过滤
          if (homepages.length === 0) {
            const allUrls = match.match(/(https?:\/\/[^\s\n,，）)]+)/gi) || [];
            if (allUrls) {
              const plausibleHomepages = allUrls.filter(url => 
                  (url.includes('.edu') || url.includes('ac.cn')) && // 包含教育机构域名
                  (url.includes('faculty') || url.includes('people') || url.includes('~') || url.includes('person') || url.match(/\/[a-zA-Z\-]+\/?$/)) && // URL路径看起来像个人页面
                  !url.includes('paper') && !url.includes('news') && !url.includes('article') && !url.includes('doi.org') // 排除论文、新闻等链接
              );
              if (plausibleHomepages.length > 0) {
                  // 取第一个看起来最合理的
                  homepages.push(plausibleHomepages[0]);
              }
            }
          }
          
          // 🔍 如果基本提取失败，尝试更宽松的提取
          if (!email) {
            const looseEmailMatch = match.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
            if (looseEmailMatch) {
              email = looseEmailMatch[1].trim();
              console.log(`🔍 宽松匹配找到邮箱: ${email}`);
            }
          }
          
          if (!phone) {
            const loosePhoneMatch = match.match(/(1[3-9]\d{9}|\d{3,4}[-\s]?\d{7,8})/);
            if (loosePhoneMatch) {
              phone = loosePhoneMatch[1].trim();
              console.log(`🔍 宽松匹配找到电话: ${phone}`);
            }
          }
          
          if (homepages.length === 0) {
            const looseUrlMatches = match.match(/(https?:\/\/[^\s，。）\n,]+)/g);
            if (looseUrlMatches) {
              looseUrlMatches.forEach(url => {
                if (!homepages.includes(url)) {
                  homepages.push(url);
                }
              });
              console.log(`🔍 宽松匹配找到主页: ${homepages}`);
            }
          }
          
          // 🔍 增强主页提取：尝试更多的匹配模式
          if (homepages.length === 0) {
            console.log(`🔍 原始文本段落:`, match.substring(0, 500));
            
            // 尝试更多主页匹配模式
            const advancedHomepagePatterns = [
              /(?:https?:\/\/)?(?:www\.)?[a-zA-Z0-9-]+\.[a-zA-Z]{2,}(?:\/[^\s\n，。）]*)?/g,
              /(?:zju\.edu\.cn|edu\.cn)[^\s\n，。）]*/g,
              /(?:个人|主页|网站|homepage|website|profile).*?((?:https?:\/\/)?[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}[^\s\n，。）]*)/gi
            ];
            
            for (const pattern of advancedHomepagePatterns) {
              const matches = match.match(pattern);
              if (matches) {
                matches.forEach(url => {
                  // 确保URL格式正确
                  let cleanUrl = url.trim();
                  if (cleanUrl && !cleanUrl.startsWith('http')) {
                    cleanUrl = 'https://' + cleanUrl;
                  }
                  if (cleanUrl && cleanUrl.includes('.') && !homepages.includes(cleanUrl)) {
                    homepages.push(cleanUrl);
                    console.log(`✅ 增强匹配找到主页: ${cleanUrl}`);
                  }
                });
              }
            }
          }

          // 调试日志：显示提取到的联系信息（生产环境可注释掉）
          // console.log(`教授 ${name} 联系信息提取结果:`, {
          //   email: email || '未找到',
          //   office: office || '未找到', 
          //   phone: phone || '未找到',
          //   homepages: homepages.length > 0 ? homepages : ['未找到']
          // });
          
          // 提取标签/研究方向 - 只保留核心关键词
          const tags = [];
          const coreKeywords = [
            '计算机视觉', '机器视觉', 
            '人工智能', '机器学习', '深度学习', 
            '自然语言处理', 'NLP', '语言模型',
            '大模型', 'LLM', 
            '多模态', 
            '数据挖掘',
            '智能控制', '自动化', 
            '软件工程', '系统设计',
            '网络安全', '信息安全',
            '数据库', '云计算',
            '物联网', 'IoT',
            '区块链',
            '高分子流变学','多组分聚合物材料结构与性能',
            '高分子复合材料','文物数字化',
            '碳氢键精准催化转化','不对称合成',
            '天然产物及药物合成','机器学习',
            '大数据解析','工业大数据',
            '工业人工智能','智能制造','智慧能源',
            '智慧医疗','光通信 / 光互联', '光计算的硅基光子集成前沿及应用研究',
            'Multimode silicon photonics',
            'Silicon - plus photonics','Reconfigurable silicon photonics',
            'Silicon photonics for polarization - handling and wavelength - filtering',
            '计算机图形学','人机交互','虚拟现实',
            '信息与电子工程','天然产物全合成及导向天然产物的新反应方法学',
            '多媒体分析与检索','跨媒体计算',
            'T 细胞生物学','细胞信号传导','细胞免疫学',
            '免疫调节','自身免疫病','肿瘤免疫','网络优化与控制',
            '网络系统安全','工业大数据与物联网',
            '检测技术与自动化装置','电磁波理论及应用','新型人工电磁介质',
            '电磁波隐身','深度学习与智能电磁调控','光学检测','激光雷达',
            '生物制药技术','生物催化和转化','蛋白质工程','界面电化学',
            '电化学发光和谱学电化学联用',
            '高灵敏和快速免疫检测方法、技术、便携式装置以及生医工交叉',
            '脑神经电化学','化学脑机接口',
            '基于可穿戴传感器的健康连续监测和运动饮食辅助治疗','锂电池',
            '电化学催化转化','其他新型电池','医学人工智能','模式识别',
            '数据挖掘','超分辨光学成像','超分辨光刻',
            '计算机体系结构及微结构','集成电路设计','硬件安全',
            '电机与驱动控制','新能源技术','视觉媒体智能编码',
            '视频与点云智能应用','视觉感知与体验质量评价',
            '教育领导与政策研究','高等教育政策与治理','学术职业',
            '系统医学与合成生物学','生物医学信息学','肿瘤免疫治疗',
            '合成生物信息学','具有病理生理意义的标志物的发现',
            '合成生物系统的多组学时间序列建模','基于自然语言的知识表示和知识推理',
            '生物大分子 RNA 化学修饰及其生物学意义',
            'RNA 化学标记及 RNA 碱基化学修饰测序方法开发',
            '荧光生物探针和生物成像'

            
          ];
          
          coreKeywords.forEach(keyword => {
            if (match.toLowerCase().includes(keyword.toLowerCase())) {
              if (!tags.includes(keyword)) {
                tags.push(keyword);
              }
            }
          });
          
          // 限制标签数量
          const finalTags = tags.slice(0, 4);
          
          // 简化内容提取 - 只保留真正的研究成果
          let researchContent = match;
          
          // 移除所有联系信息（简单粗暴但有效）
          researchContent = researchContent.replace(/\*\*[^*]+\*\*/g, ''); // 移除姓名
          researchContent = researchContent.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, ''); // 移除邮箱
          researchContent = researchContent.replace(/https?:\/\/[^\s，。）\n,]+/g, ''); // 秮除URL
          researchContent = researchContent.replace(/[\d]{3,4}[\s\-]?[\d]{8,11}/g, ''); // 秮除电话
          researchContent = researchContent.replace(/(邮箱|电话|主页|网站|办公地点|地址|联系方式)[：:]?[^。\n]*[。\n]?/g, ''); // 秮除含关键词的句子
          
          // 简单分割成句子
          const achievements = researchContent
            .split(/[。；;\n]/)
            .map(s => s.replace(/^\d+\.\s*/, '').replace(/^[-•]\s*/, '').trim())
            .filter(s => s.length > 10 && !/(邮箱|电话|主页|网站|办公地点|地址|联系方式|http|@)/.test(s))
            .slice(0, 5);
          
          const finalHighlights = achievements.length > 0 ? achievements : [
            '在相关研究领域具有丰富经验',
            '承担多项重要科研项目'
          ];
          
          // 计算匹配度
          let score = 60; // 基础分
          if (email) score += 10;
          if (homepages.length > 0) score += 10;
          if (finalTags.length > 0) score += 10;
          if (achievements.length > 2) score += 5;
          if (office) score += 2;
          if (phone) score += 3;
          
          const professorData = {
            name: name,
            school: school, // 学院（只包含学院名称）
            areas: finalTags, // 标签（只包含研究方向关键词）
            highlights: finalHighlights, // 研究成果等无序列表（绝对不包含联系方式）
            score: Math.min(score, 100),
            displayScore: Math.min(score, 100),
            profId: `prof_${Date.now()}_${index}`,
            documentId: `doc_${Date.now()}_${index}`
          };
          
          // 只有在有值的情况下才添加
          if (email) {
            professorData.email = email;
          }
          if (office) {
            professorData.office = office;
          }
          if (phone) {
            professorData.phone = phone;
          }
          if (homepages.length > 0) {
            professorData.homepages = homepages;
          }
          
          professors.push(professorData);
          
        } catch (e) {
          console.log(`解析第${index + 1}位教授信息失败:`, e);
        }
      });
    }
    
    if (professors.length > 0) {
      console.log(`成功解析 ${professors.length} 位教授信息`);
      return {
        type: "professor_list",
        professors: professors
      };
    }
    
  } catch (e) {
    console.log('解析教授信息失败:', e);
  }
  
  return null;
}

// 从数据库直接查询教授信息
async function queryProfessorsFromDatabase(professorName, responseText) {
  try {
    console.log(`🔍 尝试从数据库查询教授信息: ${professorName}`);
    
    // 优先使用教授姓名进行精确查询
    let queryKeyword = professorName || '';
    
    // 如果没有教授姓名，从响应文本中提取关键词
    if (!queryKeyword && responseText) {
      const keywordPatterns = [
        /(?:计算机视觉|机器视觉|视觉)/i,
        /(?:人工智能|AI)/i,
        /(?:机器学习|深度学习)/i,
        /(?:自然语言处理|NLP)/i,
        /(?:大模型|语言模型)/i,
        /(?:多模态)/i,
        /(?:数据挖掘|大数据)/i,
        /(?:网络安全|信息安全)/i,
        /(?:软件工程)/i,
        /(?:数据库)/i,
        /(?:云计算)/i,
        /(?:物联网|IoT)/i,
        /(?:区块链)/i,
        /(?:医学影像)/i,
        /(?:生物医学)/i,
        /(?:新能源|电池)/i,
        /(?:材料科学)/i,
        /(?:化学工程)/i,
        /(?:机械工程)/i,
        /(?:电气工程)/i
      ];
      
      for (const pattern of keywordPatterns) {
        const match = responseText.match(pattern);
        if (match) {
          queryKeyword = match[0];
          break;
        }
      }
    }
    
    console.log('🔍 查询关键词:', queryKeyword);
    
    // 调用search_professors云函数
    const result = await cloud.callFunction({
      name: 'search_professors',
      data: {
        q: queryKeyword,
        page: 1,
        pageSize: 10, // 增加查询数量以便找到匹配的教授
        sortBy: 'time'
      }
    });
    
    if (result && result.result && result.result.code === 0 && result.result.data && result.result.data.list && result.result.data.list.length > 0) {
      let matchedProf = null;
      
      // 如果有教授姓名，优先寻找姓名匹配的教授
      if (professorName) {
        matchedProf = result.result.data.list.find(doc => 
          doc.name && doc.name.includes(professorName.trim())
        );
        console.log(`🎯 姓名匹配查找结果: ${matchedProf ? `找到 ${matchedProf.name}` : '未找到匹配'}`);
      }
      
      // 如果没有找到匹配的教授，使用第一个结果
      if (!matchedProf && result.result.data.list.length > 0) {
        matchedProf = result.result.data.list[0];
        console.log(`🔄 使用第一个搜索结果: ${matchedProf.name}`);
      }
      
      if (matchedProf) {
        // 提取个人主页
        const homepages = [];
        if (matchedProf.homepage && matchedProf.homepage.trim()) {
          homepages.push(matchedProf.homepage.trim());
        }
        
        const professor = {
          name: matchedProf.name || '未知',
          school: matchedProf.school || '未知学院',
          areas: Array.isArray(matchedProf.areas) ? matchedProf.areas : [],
          email: matchedProf.email || '',
          homepages: homepages,
          office: '', // search_professors不返回办公地点
          phone: '', // search_professors不返回电话
          highlights: Array.isArray(matchedProf.highlights) ? matchedProf.highlights.slice(0, 3) : [],
          score: 85 + Math.random() * 10, // 随机分数
          displayScore: 85 + Math.random() * 10,
          profId: matchedProf.profId || `prof_db_${Date.now()}`,
          documentId: `doc_db_${Date.now()}`
        };
        
        console.log('✅ 从数据库匹配到教授信息:', professor.name);
        return {
          type: "professor_list",
          professors: [professor]
        };
      }
    }
    
    console.log('ℹ️ 数据库查询无结果');
    return null;
    
  } catch (error) {
    console.error('❌ 数据库查询教授信息失败:', error);
    return null;
  }
}

// 清理回答文本，去掉引用标记但保留markdown语法
function cleanResponseText(text, cardData) {
  // 如果成功生成了教授卡片数据，则完全隐藏文字回复
  if (cardData && cardData.type === 'professor_list' && cardData.professors && cardData.professors.length > 0) {
    return '';
  }

  if (!text || typeof text !== 'string') {
    return '';
  }
  
  let cleanedText = text;
  
  // 增强清理逻辑：更彻底地移除引用标记
  cleanedText = cleanedText.replace(/\[\d+\]\s*prof_info/gi, ''); // [1] prof_info
  cleanedText = cleanedText.replace(/\[\s*\d+\s*\]/g, '');      // [ 1 ]
  cleanedText = cleanedText.replace(/【\s*\d+\s*】/g, '');      // 【 1 】
  cleanedText = cleanedText.replace(/\(\s*\d+\s*\)/g, '');      // ( 1 )
  
  return cleanedText.trim();
}

function processChatStream(stream) {
  const log = (message) => { console.log(`[processChatStream] ${message}`); };
  return new Promise((resolve, _) => {
    let fullResult = null;
    let eventBuffer = 

    stream.on('error', (err) => {
      log(`Stream error: ${err.message}`);
      resolve(null);
    });

    stream.on('end', () => {
      // 流被中断
      const result = fullResult;
      log('Stream ended.');
      if (result) {
        log(result.content); // 仅当 result 非 null/undefined 时执行
      } else {
        log('Stream has no data.'); // 无数据时的处理
      }
      resolve(result);
    });

    const takeEvent = () => {
      let boundary = eventBuffer.indexOf('\n\n');
      if (boundary === -1) return null;
      const eventBlock = eventBuffer.substring(0, boundary);
      eventBuffer = eventBuffer.substring(boundary + 2);

      // parse event block
      let eventName = null;
      let eventData = "";
      const lines = eventBlock.split('\n');
      for (const line of lines) {
        if (line.startsWith('event:')) {
          eventName = line.substring('event:'.length).trim();
        }
        if (line.startsWith('data:')) {
          eventData += line.substring('data:'.length);
        }
      }
      if (!eventName || !eventData) return null;
      return { eventName, eventData };
    };

    const processEvent = (eventName, eventData) => {
      switch (eventName) {
        // completed
        case 'conversation.message.completed':
          let data = JSON.parse(eventData);
          fullResult=data;
          log(`conversation.message.completed, data: ${JSON.stringify(data)}`);
          log(data.type);
          if (data.type != 'answer') break;
          
          
          // 使用 then() 链式调用，确保最终结果被处理
      Promise.resolve(data.content)
      .then(content => {
        // 在这里可以安全地访问 fullResult
        const conversationId = fullResult.conversation_id;
        console.log(`API返回的新conversation_id: ${conversationId}`);
        
        // 返回完整结果
        return { content, conversation_id: conversationId };
      })
      .then(finalResult => {
        resolve(finalResult);
      });
          
          break;
        // ignored
        case 'conversation.chat.completed': break;
        case 'done': break;
        case 'conversation.chat.created': break;
        case 'conversation.message.delta': 
        let data1 = JSON.parse(eventData);
        log(`conversation.message.delta, data1: ${JSON.stringify(data1)}`);
        break;

        case 'conversation.chat.in_progress': break;
        case 'ping':break;
        // unknown event
        default: 
          log(`unknown event: ${eventName}, data: ${eventData}`);
          resolve(null);
          break;
      }
    };

    stream.on('data', (chunk) => {
      const deltaString = chunk.toString();
      eventBuffer += deltaString;

      while (true) {
        const event = takeEvent();
        if (!event) break;
        const { eventName, eventData } = event;
        processEvent(eventName, eventData);
      }
    });
  });
}

exports.main = async (event) => {
  const log = (message) => { console.log(`[coze_workflow] ${message}`); };
  const COZE_TOKEN = process.env.COZE_TOKEN;
  const COZE_BOT_ID = process.env.COZE_BOT_ID;
  const COZE_USER_ID = process.env.COZE_USER_ID;

  if (!COZE_TOKEN || !COZE_BOT_ID || !COZE_USER_ID) {
    log('internal error: COZE_TOKEN, COZE_BOT_ID, or COZE_USER_ID is not set');
    return { code: 500, message: 'internal error' };
  }

  const input = event?.input || '';
  let conversation_id = event?.conversation_id || '';

  if (!input) {
    return { code: 400, message: 'input is required' };
  }

  const headers = {
    Authorization: `Bearer ${COZE_TOKEN}`,
    'Content-Type': 'application/json'
  };

  let url = "https://api.coze.cn/v3/chat";
  if (typeof conversation_id === 'string' && conversation_id.length > 0) {
    url += `?conversation_id=${conversation_id}`;
  }

  const body = {
    bot_id: COZE_BOT_ID,
    user_id: COZE_USER_ID,
    stream: true,
    additional_messages: [
      {
        role: "user",
        content: input,
        content_type: "text"
      }
    ]
  };

  const response = await axios.post(
    url, body, { 
      headers,
      responseType: 'stream'
    }
  );

  const stream = response.data;

  const fullResult= await processChatStream(stream);

// 声明变量
let finalResult = '';
let cardData = null;

// 处理 <search_result> 标签
if (!fullResult) {
  console.log('结果为空');
  finalResult = '';
} else if (typeof fullResult === 'string') {
  // 使用正则表达式方法，更健壮
  const parseSearchResult = (content) => {
    const result = {
      textContent: '',
      cardData: null
    };
    
    // 使用正则表达式匹配search_result标签
    const searchResultRegex = /<search_result>([\s\S]*?)<\/search_result>/;
    const match = content.match(searchResultRegex);
    
    if (match) {
      // 提取文本内容（search_result标签之前的部分）
      result.textContent = content.substring(0, match.index).trim();
      
      // 提取JSON数据
      const jsonContent = match[1].trim();
      
      try {
        const parsedData = JSON.parse(jsonContent);
        result.cardData = {
          type: 'professor_list',
          professors: parsedData.result?.professors || []
        };
      } catch (e) {
        console.error('解析JSON失败:', e);
        // 如果JSON解析失败，保留完整的文本内容
        result.textContent = content;
      }
    } else {
      // 如果没有search_result标签，使用完整内容
      result.textContent = content;
    }
    
    return result;
  };
  
  const parsedResult = parseSearchResult(fullResult);
  finalResult = parsedResult.textContent;
  cardData = parsedResult.cardData;
} else if (typeof fullResult === 'object' && fullResult.content) {
  // 如果返回的是对象，处理content中的<search_result>标签
  const parseSearchResult = (content) => {
    const result = {
      textContent: '',
      cardData: null
    };
    
    const searchResultRegex = /<search_result>([\s\S]*?)<\/search_result>/;
    const match = content.match(searchResultRegex);
    
    if (match) {
      result.textContent = content.substring(0, match.index).trim();
      const jsonContent = match[1].trim();
      
      try {
        const parsedData = JSON.parse(jsonContent);
        result.cardData = {
          type: 'professor_list',
          professors: parsedData.result?.professors || []
        };
      } catch (e) {
        console.error('解析JSON失败:', e);
        result.textContent = content;
      }
    } else {
      result.textContent = content;
    }
    
    return result;
  };
  
  const parsedResult = parseSearchResult(fullResult.content);
  finalResult = parsedResult.textContent;
  cardData = parsedResult.cardData;
}

// 确保 conversation_id 正确获取
const conversationId = fullResult && fullResult.conversation_id ? fullResult.conversation_id : '';
log(`conversationId: ${conversationId}`);

if (!fullResult) {
  return { code: 500, message: 'internal error' };
}

return { 
  code: 0, 
  data: {
    conversation_id: conversationId,
    content: finalResult,
    cardData: cardData
  } 
};
};