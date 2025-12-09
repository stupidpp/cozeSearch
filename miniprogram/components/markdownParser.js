/**
 * 将Markdown格式文本解析为小程序富文本节点数组
 * @param {string} markdownText - 原始的Markdown文本
 * @return {Array} 符合小程序rich-text nodes格式的数组
 */
function parseSimpleMarkdown(markdownText) {
    if (!markdownText) return [];
  
    // 1. 按行分割，进行预处理
    const lines = markdownText.split('\n');
    const nodes = [];
    let inList = false; // 标记是否在列表中
  
    for (let i = 0; i < lines.length; i++) {
      let line = lines[i].trimEnd(); // 保留行首空格用于缩进判断
  
      // 2. 处理空行（分段）
      if (line.trim() === '') {
        if (nodes.length > 0) { // 避免开头空行
          // 空行用带高度的view模拟段落间距
          nodes.push({
            name: 'view',
            attrs: { class: 'empty-line' },
            children: [{ type: 'text', text: '\u200B' }] // 零宽度空格，占位用
          });
        }
        continue;
      }
  
      // 3. 处理标题 (###, ##, #)
      const headerMatch = line.match(/^(#{1,3})\s+(.+)$/);
      if (headerMatch) {
        const [, hashes, content] = headerMatch;
        const level = hashes.length;
        nodes.push({
          name: `h${level}`,
          attrs: { class: `md-h${level}` },
          children: parseInlineMarkdown(content)
        });
        continue;
      }
  
      // 4. 处理无序列表项 (-, *, +)
      const listMatch = line.match(/^[\s]*[-*+]\s+(.+)$/);
      if (listMatch) {
        const [, content] = listMatch;
        if (!inList) {
          // 列表开始
          nodes.push({ name: 'view', attrs: { class: 'md-ul' }, children: [] });
          inList = true;
        }
        // 获取当前最后一个列表（ul）
        const lastList = nodes[nodes.length - 1];
        lastList.children.push({
          name: 'view',
          attrs: { class: 'md-li' },
          children: [
            { name: 'text', attrs: { class: 'md-list-bullet' }, children: [{ type: 'text', text: '• ' }] },
            ...parseInlineMarkdown(content)
          ]
        });
        continue;
      } else if (inList && line.match(/^[^-*+\s]/)) {
        // 当前行不是列表项，但之前是在列表中，则列表结束
        inList = false;
      }
  
      // 5. 处理水平分割线 (---, ***)
      if (line.match(/^[-*_]{3,}$/)) {
        nodes.push({
          name: 'view',
          attrs: { class: 'md-hr' },
          children: []
        });
        continue;
      }
  
      // 6. 默认处理为段落
      if (!inList) {
        nodes.push({
          name: 'view',
          attrs: { class: 'md-p' },
          children: parseInlineMarkdown(line)
        });
      }
    }
  
    return nodes;
  }
  
  /**
   * 解析行内Markdown格式（加粗、斜体、代码等）
   * @param {string} text - 单行文本
   * @return {Array} 行内节点数组
   */
  function parseInlineMarkdown(text) {
    const nodes = [];
    let remaining = text;
  
    // 处理模式：**加粗**、*斜体*、`代码`
    const patterns = [
      { regex: /\*\*(.+?)\*\*/, tag: 'strong', class: 'md-strong' },
      { regex: /\*(.+?)\*/, tag: 'em', class: 'md-em' },
      { regex: /`(.+?)`/, tag: 'code', class: 'md-code' }
    ];
  
    while (remaining.length > 0) {
      let matched = false;
  
      for (const pattern of patterns) {
        const match = remaining.match(pattern.regex);
        if (match && match.index === 0) {
          // 匹配到格式，添加格式节点
          nodes.push({
            name: pattern.tag,
            attrs: { class: pattern.class },
            children: [{ type: 'text', text: match[1] }]
          });
          remaining = remaining.substring(match[0].length);
          matched = true;
          break;
        }
      }
  
      if (!matched) {
        // 查找下一个格式标记的位置
        let nextIndex = remaining.length;
        for (const pattern of patterns) {
          const match = remaining.match(pattern.regex);
          if (match && match.index > 0) {
            nextIndex = Math.min(nextIndex, match.index);
          }
        }
  
        // 添加普通文本节点
        const plainText = remaining.substring(0, nextIndex);
        if (plainText) {
          nodes.push({ type: 'text', text: plainText });
        }
        remaining = remaining.substring(nextIndex);
      }
    }
  
    return nodes.length > 0 ? nodes : [{ type: 'text', text: text }];
  }
  
  
  
  
// 导出函数以便外部使用
module.exports = {
    parseSimpleMarkdown: parseSimpleMarkdown
  };