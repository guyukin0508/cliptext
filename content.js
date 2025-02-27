/*!
 * ClipText v1.0.0
 * (c) 2024 Gu Yukin
 * Released under the MIT License.
 */

console.log('===== Content Script 开始加载 =====');
console.log('当前页面 URL:', window.location.href);

// 在文件开始处，确保全局函数定义在正确的作用域

// 优化内容限制移除策略
let restrictionsRemoved = false;

// 在文件开始处添加文本选择功能
function enableTextSelection() {
  try {
    // 不再需要动态注入基本样式，因为已经在 content.css 中定义
    
    // 保留事件监听器和属性修改
    document.addEventListener('selectstart', (e) => e.stopPropagation(), true);
    document.addEventListener('copy', (e) => e.stopPropagation(), true);
    document.addEventListener('mousedown', (e) => {
      // 只有在非工具栏元素上才阻止事件传播
      if (!e.target.closest('.cliptext-toolbar') && !e.target.closest('.save-dialog')) {
        e.stopPropagation();
      }
    }, true);
    document.addEventListener('contextmenu', (e) => e.stopPropagation(), true);

    // 移除元素的事件监听器
    document.querySelectorAll('*').forEach(el => {
      el.oncopy = null;
      el.onselect = null;
      el.onselectstart = null;
      el.oncontextmenu = null;
      
      // 移除只读和不可选择属性
      if (el.hasAttribute('unselectable')) {
        el.removeAttribute('unselectable');
      }
      if (el.hasAttribute('contenteditable') && el.getAttribute('contenteditable') === 'false') {
        el.setAttribute('contenteditable', 'true');
      }
    });

    // 标记为已移除限制
    restrictionsRemoved = true;
    console.log('已启用文本选择');
  } catch (error) {
    console.error('启用文本选择失败:', error);
  }
}

// 修改复制功能
function copyText(text) {
  return new Promise(async (resolve, reject) => {
    try {
      // 确保文本可以被选择
      enableTextSelection();
      
      // 尝试使用 Clipboard API
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        console.log('使用 Clipboard API 复制成功');
        resolve(true);
        return;
      }
      
      // 如果 Clipboard API 不可用，使用备用方案
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.left = '-9999px';
      textarea.style.top = '0';
      textarea.style.opacity = '0';
      
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      
      const success = document.execCommand('copy');
      document.body.removeChild(textarea);
      
      if (success) {
        console.log('使用 execCommand 复制成功');
        resolve(true);
      } else {
        throw new Error('execCommand 复制失败');
      }
    } catch (error) {
      console.error('复制失败:', error);
      reject(error);
    }
  });
}

// 在初始化时启用文本选择
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    enableTextSelection();
    setupObserver(); // 在 DOM 加载后设置观察器
  });
} else {
  enableTextSelection();
  setupObserver(); // 立即设置观察器
}

// 监听动态内容
const observer = new MutationObserver(() => {
  enableTextSelection();
});

// 修改观察逻辑，确保 document.body 存在
function setupObserver() {
  if (document.body) {
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['style', 'unselectable', 'onselectstart', 'contenteditable']
    });
    console.log('MutationObserver 已设置');
  } else {
    // 如果 body 尚不存在，等待 DOM 加载
    console.log('等待 document.body 加载...');
    window.addEventListener('DOMContentLoaded', () => {
      if (document.body) {
        observer.observe(document.body, {
          childList: true,
          subtree: true,
          attributes: true,
          attributeFilter: ['style', 'unselectable', 'onselectstart', 'contenteditable']
        });
        console.log('MutationObserver 已延迟设置');
      } else {
        console.error('无法找到 document.body');
      }
    });
  }
}

// 在文件顶部添加状态管理
const state = {
  language: null,
  toolbar: null,
  toolbarTimeout: null
};

// 确保脚本只运行一次
if (window.hasRunContentScript) {
  console.log('Content script 已经运行过');
} else {
  console.log('Content script 首次运行');
  window.hasRunContentScript = true;
  
  console.log('===== 初始化内容脚本 =====');
  
  // 页面卸载时清理
  window.addEventListener('unload', () => {
    console.log('Content script 清理');
    window.hasRunContentScript = false;
  });
  
  // 监听来自 background.js 的消息
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('===== 收到后台消息 =====');
    console.log('Content script 收到消息:', request);
    
    if (request.action === 'showSaveDialog') {
      console.log('准备创建保存对话框');
      console.log('选中的文本:', request.text?.substring(0, 100) + '...');
      createSaveDialog(request.text);
      sendResponse({ success: true });
    } else if (request.action === 'updateLanguage') {
      console.log('收到语言更新请求:', request.language);
      
      // 更新语言设置
      state.language = request.language;
      
      // 找到现有对话框并重新创建
      const existingDialog = document.querySelector('.save-dialog');
      if (existingDialog) {
        console.log('重新创建对话框，使用新语言:', state.language);
        const currentText = existingDialog.querySelector('.content-text').value;
        existingDialog.parentElement.remove();
        
        // 立即重新创建对话框
        createSaveDialog(currentText);
      }
      
      // 更新工具栏语言 - 如果工具栏存在，重新创建它
      if (state.toolbar && document.body.contains(state.toolbar)) {
        const oldToolbar = state.toolbar;
        const rect = oldToolbar.getBoundingClientRect();
        const x = rect.left + rect.width / 2;
        const y = rect.top;
        
        // 移除旧工具栏
        hideToolbar();
        
        // 延迟一下再创建新工具栏，确保旧工具栏已完全移除
        setTimeout(() => {
          // 获取当前选中的文本
          const selection = window.getSelection();
          const text = selection.toString().trim();
          
          if (text) {
            showToolbar(x, y, text);
          }
        }, 350);
      }
      
      sendResponse({ success: true });
    }
    
    return true; // 保持消息通道开放
  });
  
  // 添加浏览器类型检测
  const getBrowserType = () => {
    if (navigator.userAgent.includes("Edg/")) {
      return 'edge';
    }
    return 'chrome';
  };

  // 修改扩展状态检查函数
  function isExtensionValid() {
    try {
      const isExtensionContext = typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id;
      const hasI18nSupport = chrome.i18n && typeof chrome.i18n.getMessage === 'function';
      
      if (!isExtensionContext || !hasI18nSupport) {
        throw new Error('扩展上下文无效或缺少必要API');
      }
      return true;
    } catch (e) {
      console.error('扩展状态检查失败:', e);
      return false;
    }
  }

  // 1. 定义翻译映射
  const messages = {
    zh: {
      dialogTitle: '✨ 这段文字太棒了，让我们保存下来：',
      dragHandleTitle: '拖动移动位置',
      statsTitle: '📊 字数统计',
      charCount: '字符',
      chineseCount: '汉字',
      englishCount: '英文',
      addTagsTitle: '🏷️ 添加标签',
      pressEnterHint: '按一下回车键哦~',
      addTagPlaceholder: '输入标签名称...',
      copyButton: '复制内容',
      saveButton: '一键收集',
      appendButton: '一键追加',
      cancelButton: '哎呀，我再考虑考虑',
      collectionTime: '📝 收集时间',
      source: '🔗 来源',
      tags: '🏷️ 标签',
      copySuccess: '📋 内容已复制到剪贴板',
      copyFail: '复制失败',
      saveSuccess: '✨ 新灵感已收集,开启今天的快乐之旅',
      saveFail: '保存失败',
      appendSuccess: '✨ 灵感已追加到文件,快乐 +1',
      cancel: '🐟 哎呀，放生了一条小鱼~'
    },
    en: {
      dialogTitle: '✨ Great text! Let\'s save it:',
      dragHandleTitle: 'Drag to move',
      statsTitle: '📊 Statistics',
      charCount: 'Characters',
      chineseCount: 'Chinese',
      englishCount: 'English',
      addTagsTitle: '🏷️ Add Tags',
      pressEnterHint: 'Press Enter to add',
      addTagPlaceholder: 'Enter tag name...',
      copyButton: 'Copy',
      saveButton: 'Save',
      appendButton: 'Append',
      cancelButton: 'Cancel',
      collectionTime: '📝 Collection Time',
      source: '🔗 Source',
      tags: '🏷️ Tags',
      copySuccess: '📋 Content copied to clipboard',
      copyFail: 'Copy failed',
      saveSuccess: '✨ New inspiration collected',
      saveFail: 'Save failed',
      appendSuccess: '✨ Content appended to file',
      cancel: '🐟 Let this one go~'
    }
  };

  // 2. 修改 getMessage 函数
  function getMessage(key) {
    try {
      if (!isExtensionValid()) {
        console.warn('扩展上下文无效');
        return key;
      }
      
      // 确保 key 是字符串类型
      const messageName = String(key);
      
      // 根据当前语言获取翻译
      const currentMessages = messages[state.language] || messages.en;
      const message = currentMessages[messageName];
      
      if (!message) {
        console.warn(`未找到翻译 [${messageName}]，当前语言: ${state.language}`);
        return key;
      }
      
      return message;
    } catch (error) {
      console.error('获取翻译失败:', error);
      return key;
    }
  }

  // 获取用户语言设置
  async function getUserLanguage() {
    return new Promise((resolve) => {
      chrome.storage.sync.get(['language'], (result) => {
        // 1. 检查用户设置
        if (result.language && result.language !== 'auto') {
          resolve(result.language);
          return;
        }
        
        // 2. 检查浏览器语言
        const browserLang = chrome.i18n.getUILanguage().toLowerCase();
        if (browserLang.startsWith('zh')) {
          resolve('zh');
        } else {
          resolve('en');
        }
      });
    });
  }

  // 更新所有界面文本
  async function updateUILanguage(newLang) {
    // 清除翻译缓存
    if (getMessage.cache) {
      getMessage.cache.clear();
    }
    
    const dialog = document.querySelector('.save-dialog');
    if (dialog) {
      // 批量更新所有需要翻译的元素
      const elements = dialog.querySelectorAll('[data-i18n]');
      const translations = new Map();
      
      // 先收集所有需要的翻译
      elements.forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (!translations.has(key)) {
          translations.set(key, getMessage(key));
        }
      });
      
      // 然后一次性更新所有元素
      elements.forEach(el => {
        const key = el.getAttribute('data-i18n');
        el.textContent = translations.get(key);
      });
    }
  }

  // 3. 修改 getCurrentLanguage 函数，严格按照优先级规则
  async function getCurrentLanguage() {
    try {
      // 1. 首先获取用户设置的语言偏好
      const result = await chrome.storage.sync.get(['language']);
      console.log('用户语言设置:', result.language);
      
      // 2. 如果用户明确设置了语言（不是 'auto'），则使用用户设置
      if (result.language && result.language !== 'auto') {
        console.log('使用用户设置的语言:', result.language);
        return result.language;
      }
      
      // 3. 如果用户未设置或设置为 'auto'，则使用浏览器语言
      const browserLang = navigator.language.toLowerCase();
      const language = browserLang.startsWith('zh') ? 'zh' : 'en';
      console.log('使用浏览器语言:', language);
      return language;
    } catch (error) {
      console.error('获取语言设置失败:', error);
      return 'en'; // 出错时默认使用英文
    }
  }

  // 创建保存对话框
  async function createSaveDialog(text) {
    console.log('===== 创建对话框 =====');
    console.log('对话框参数:', {
      textLength: text?.length,
      pageTitle: document.title,
      url: window.location.href
    });
    
    if (!text || text.trim() === '') {
      console.warn('没有有效的文本内容');
      return;
    }
    
    try {
      // 获取当前语言设置
      state.language = await getCurrentLanguage();
      console.log('当前语言设置:', state.language);
      
      // 强制设置 chrome.i18n 的语言环境
      chrome.i18n.getAcceptLanguages(() => {
        // 这里不需要做任何事情，只是确保语言设置已加载
      });
      
      // 获取所有需要的翻译
      const translations = {
        dialogTitle: getMessage('dialogTitle'),
        dragHandleTitle: getMessage('dragHandleTitle'),
        statsTitle: getMessage('statsTitle'),
        charCount: getMessage('charCount'),
        chineseCount: getMessage('chineseCount'),
        englishCount: getMessage('englishCount'),
        addTagsTitle: getMessage('addTagsTitle'),
        pressEnterHint: getMessage('pressEnterHint'),
        addTagPlaceholder: getMessage('addTagPlaceholder'),
        copyButton: getMessage('copyButton'),
        saveButton: getMessage('saveButton'),
        appendButton: getMessage('appendButton'),
        cancelButton: getMessage('cancelButton'),
        collectionTime: getMessage('collectionTime'),
        source: getMessage('source'),
        tags: getMessage('tags')
      };

      console.log('获取到的翻译:', translations);

      const dialogContainer = document.createElement('div');
      dialogContainer.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.5);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 999999;
      `;
      
      // 获取当前时间和页面信息
      const now = new Date();
      const timestamp = now.toLocaleString(
        state.language === 'zh' ? 'zh-CN' : 'en-US',
        {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          hour12: state.language === 'en',
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
        }
      ).replace(/\//g, '-');

      const pageTitle = document.title;
      const pageUrl = window.location.href;
      
      // 创建一个更美观的分隔块
      const separator = '\n\n' + '='.repeat(50) + '\n';
      const contentHeader = `${translations.collectionTime}：${timestamp}\n${translations.source}：[${pageTitle}](${pageUrl})\n`;

      // 计算字数统计
      const charCount = text.length;
      const chineseCount = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
      const englishCount = (text.match(/[a-zA-Z]+/g) || []).length;

      // 获取选中文本的完整 HTML 内容
      function getSelectedHTML() {
        const selection = window.getSelection();
        if (selection.rangeCount > 0) {
          const range = selection.getRangeAt(0);
          const container = document.createElement('div');
          container.appendChild(range.cloneContents());
          return container.innerHTML;
        }
        return text;
      }

      // 转换 HTML 为 Markdown（保留基础样式）
      function convertToMarkdown(html) {
        const div = document.createElement('div');
        div.innerHTML = html;
        
        // 处理段落和换行
        const paragraphs = div.querySelectorAll('p, div, br');
        paragraphs.forEach(p => {
          if (p.tagName === 'BR') {
            p.outerHTML = '\n';
          } else {
            p.innerHTML = p.innerHTML + '\n\n';
          }
        });

        // 处理标题
        const headings = div.querySelectorAll('h1, h2, h3, h4, h5, h6');
        headings.forEach(h => {
          const level = h.tagName[1];
          h.innerHTML = '\n' + '#'.repeat(level) + ' ' + h.innerHTML + '\n';
        });

        // 处理列表
        const lists = div.querySelectorAll('ol, ul');
        lists.forEach(list => {
          const items = list.querySelectorAll('li');
          items.forEach((item, index) => {
            if (list.tagName === 'OL') {
              item.innerHTML = `${index + 1}. ${item.innerHTML}\n`;
            } else {
              item.innerHTML = `• ${item.innerHTML}\n`;
            }
          });
          list.innerHTML = '\n' + list.innerHTML + '\n';
        });

        // 处理链接
        const links = div.querySelectorAll('a');
        links.forEach(link => {
          const url = link.href;
          const text = link.textContent;
          link.outerHTML = `[${text}](${url})`;
        });

        // 处理样式
        const styled = div.querySelectorAll('strong, b, i, em, code, mark');
        styled.forEach(el => {
          switch(el.tagName.toLowerCase()) {
            case 'strong':
            case 'b':
              el.outerHTML = `**${el.innerHTML}**`;
              break;
            case 'i':
            case 'em':
              el.outerHTML = `*${el.innerHTML}*`;
              break;
            case 'code':
              el.outerHTML = '`' + el.innerHTML + '`';
              break;
            case 'mark':
              el.outerHTML = `<mark>${el.innerHTML}</mark>`;
              break;
          }
        });

        return div.innerText;
      }

      const htmlContent = getSelectedHTML();
      const formattedContent = convertToMarkdown(htmlContent);
      const category = categorizeContent(text) || '无';

      // 组合显示内容
      const displayContent = `${separator}${contentHeader}${formattedContent}`;

      dialogContainer.innerHTML = `
        <div class="save-dialog" role="dialog" aria-labelledby="dialog-title">
          <div class="dialog-header">
            <div class="header-title">
              <h3 id="dialog-title" data-i18n="dialogTitle">${translations.dialogTitle}</h3>
            </div>
            <div class="drag-handle" role="button" aria-label="Drag to move dialog" title="${translations.dragHandleTitle}">⋮</div>
          </div>
          <div class="dialog-content">
            <div class="content-preview">
              <textarea id="textContent" spellcheck="false">${displayContent}</textarea>
            </div>
            <div class="content-meta">
              <div class="meta-section">
                <div class="section-header">
                  <span class="section-title">${translations.statsTitle}</span>
                </div>
                <div class="stats-section">
                  <div class="stat-item">
                    <span class="stat-icon">📝</span>
                    <span class="stat-label">${translations.charCount}</span>
                    <span class="stat-value">${charCount}</span>
                  </div>
                  <div class="stat-item">
                    <span class="stat-icon">🈶</span>
                    <span class="stat-label">${translations.chineseCount}</span>
                    <span class="stat-value">${chineseCount}</span>
                  </div>
                  <div class="stat-item">
                    <span class="stat-icon">🔤</span>
                    <span class="stat-label">${translations.englishCount}</span>
                    <span class="stat-value">${englishCount}</span>
                  </div>
                </div>
              </div>
              <div class="meta-section">
                <div class="section-header">
                  <span class="section-title">${translations.addTagsTitle}</span>
                  <span class="section-desc">${translations.pressEnterHint}</span>
                </div>
                <input type="text" id="tagInput" placeholder="${translations.addTagPlaceholder}" />
                <div class="tag-list"></div>
              </div>
            </div>
          </div>
          <div class="dialog-footer">
            <button id="cancelBtn" class="btn-secondary" aria-label="${translations.cancelButton}">
              <span class="btn-text">${translations.cancelButton}</span>
              <span class="cancel-icon">🤔</span>
            </button>
            <div class="save-buttons">
              <button id="copyBtn" class="btn-primary copy" aria-label="${translations.copyButton}">
                <span class="btn-text">${translations.copyButton}</span>
                <span class="copy-icon">📋</span>
              </button>
              <button id="saveBtn" class="btn-primary" aria-label="${translations.saveButton}">
                <span class="btn-text">${translations.saveButton}</span>
                <span class="save-icon">📚</span>
              </button>
              <button id="appendBtn" class="btn-primary append" aria-label="${translations.appendButton}">
                <span class="btn-text" data-i18n="appendButton"></span>
                <span class="save-icon">✨</span>
              </button>
            </div>
          </div>
        </div>
      `;

      // 获取对话框元素
      const dialogElement = dialogContainer.querySelector('.save-dialog');
      
      // 创建完 DOM 后统一更新文本
      dialogElement.querySelectorAll('[data-i18n]').forEach(element => {
        const key = element.getAttribute('data-i18n');
        element.textContent = translations[key] || key;
      });

      // 添加样式
      const style = document.createElement('style');
      style.textContent = `
        .save-dialog {
          background: #ffffff;
          border-radius: 16px;
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12);
          width: 90%;
          max-width: 1000px;
          height: 85vh;
          max-height: 750px;
          display: flex;
          flex-direction: column;
        }

        @keyframes dialogFadeIn {
          from { opacity: 0; transform: scale(0.95); }
          to { opacity: 1; transform: scale(1); }
        }

        .dialog-header {
          padding: 20px 24px;
          border-bottom: 1px solid #f0f0f0;
          display: flex;
          justify-content: space-between;
          align-items: center;
          background: #fafafa;
        }

        .header-title {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .header-title h3 {
          margin: 0;
          font-size: 18px;
          color: #1a1a1a;
          font-weight: 600;
        }

        .subtitle {
          font-size: 13px;
          color: #666;
        }

        .dialog-content {
          flex: 1;
          display: flex;
          padding: 24px;
          height: calc(100% - 130px);
          min-height: 300px;
          gap: 20px;
        }

        .content-preview {
          flex: 2;
          display: flex;
          flex-direction: column;
          background: #f8f9fa;
          border-radius: 12px;
          overflow: hidden;
          padding: 4px;
          margin-right: 20px;
        }

        #textContent {
          flex: 1;
          width: 100%;
          box-sizing: border-box;
          padding: 24px 24px;
          border: none;
          resize: none;
          font-size: 14px;
          line-height: 1.6;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          background: #fff;
          color: #2c3e50;
          overflow-y: scroll;
          border-radius: 8px;
          box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.05);
        }

        #textContent:focus {
          outline: none;
        }

        .content-meta {
          flex: 1;
          max-width: 320px;
          display: flex;
          flex-direction: column;
          gap: 16px;
          padding-right: 4px;
        }

        .meta-section, .tag-section {
          background: #fff;
          border-radius: 12px;
          padding: 16px;
          border: 1px solid #eee;
        }

        .section-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 12px;
        }

        .section-title {
          font-weight: 600;
          color: #1a1a1a;
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .section-desc {
          font-size: 12px;
          color: #999;
        }

        .tag-input {
          width: 100%;
          box-sizing: border-box;
          padding: 8px 12px;
          border: 1px solid #e0e0e0;
          border-radius: 8px;
          font-size: 14px;
          background: #f8f9fa;
          margin-bottom: 8px;
        }

        .tag-input:focus {
          border-color: #2196F3;
          background: #fff;
          outline: none;
        }

        .tag-list {
          flex: 1;
          overflow-y: auto;
          padding: 8px 4px;
        }

        .tag {
          background: #e3f2fd;
          color: #1976D2;
          padding: 4px 12px;
          border-radius: 6px;
          font-size: 13px;
          display: flex;
          align-items: center;
          gap: 6px;
          transition: all 0.2s;
        }

        .tag:hover {
          background: #bbdefb;
        }

        .tag .remove {
          cursor: pointer;
          opacity: 0.6;
        }

        .tag .remove:hover {
          opacity: 1;
        }

        .stats-section {
          background: #fff;
          border-radius: 12px;
          padding: 16px;
          display: flex;
          flex-direction: column;
          gap: 12px;
          border: 1px solid #eee;
        }

        .stat-item {
          display: flex;
          align-items: center;
          gap: 8px;
          color: #666;
        }

        .stat-label {
          flex: 1;
          font-size: 14px;
        }

        .stat-value {
          font-weight: 500;
          color: #1a1a1a;
        }

        .dialog-footer {
          padding: 16px 24px;
          border-top: 1px solid #f0f0f0;
          display: flex;
          justify-content: flex-end;
          gap: 16px;
          background: #fafafa;
          border-radius: 0 0 16px 16px;
        }

        button {
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          white-space: nowrap;
        }

        .btn-primary {
          background: #2196F3;
          color: white;
          border: none;
          padding: 10px 24px;
          border-radius: 8px;
          transition: all 0.2s ease;
        }

        .btn-primary:hover {
          background: #1976D2;
          transform: translateY(-1px);
          box-shadow: 0 2px 4px rgba(33, 150, 243, 0.2);
        }

        .btn-primary:active {
          transform: translateY(1px);
        }

        .btn-secondary {
          background: #fff;
          color: #666;
          padding: 10px 24px;
          display: flex;
          align-items: center;
          gap: 8px;
          border-radius: 8px;
          transition: all 0.2s ease;
          border: 1px solid #ddd;
        }

        .btn-secondary:hover {
          background: #f5f5f5;
          color: #444;
          border-color: #ccc;
        }

        .btn-secondary:active {
          background: #e8e8e8;
          transform: translateY(1px);
        }

        .btn-secondary .btn-text {
          font-weight: normal;
          color: #666;
        }

        .cancel-icon {
          font-size: 18px;
          opacity: 0.7;
          transition: transform 0.3s ease;
        }

        .btn-secondary:hover .cancel-icon {
          opacity: 0.9;
          transform: scale(1.1);
        }

        .save-icon {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 24px;
          height: 24px;
          font-size: 16px;
          line-height: 1;
          transition: all 0.3s ease;
        }

        /* 自定义滚动条 */
        #textContent::-webkit-scrollbar {
          width: 14px;
          display: block !important;
          background: transparent;
        }

        #textContent::-webkit-scrollbar-track {
          background: #f0f0f0;
          border-radius: 8px;
          margin: 4px;
        }

        #textContent::-webkit-scrollbar-thumb {
          background: #ccc;
          border-radius: 8px;
          border: 3px solid #f0f0f0;
          min-height: 60px;
          transition: background 0.2s;
        }

        #textContent::-webkit-scrollbar-thumb:hover {
          background: #bbb;
        }


        /* 保存成功动画 */
        @keyframes saveSuccess {
          0% { transform: scale(1); }
          50% { transform: scale(0.95); }
          100% { transform: scale(1); }
        }

        .save-success {
          animation: saveSuccess 0.3s ease;
        }

        /* 优化右侧布局 */
        .content-meta {
          flex: 1;
          max-width: 320px;
          display: flex;
          flex-direction: column;
          gap: 16px;
          padding-right: 4px;
        }

        .save-buttons {
          display: flex;
          gap: 12px;
        }

        .btn-primary {
          position: relative;
          overflow: hidden;
        }

        .btn-primary.loading::after {
          content: '';
          position: absolute;
          top: 0;
          left: -100%;
          width: 200%;
          height: 100%;
          background: linear-gradient(
            90deg, 
            transparent, 
            rgba(255, 255, 255, 0.2), 
            transparent
          );
          animation: loading 1.5s infinite;
        }

        @keyframes loading {
          from {
            transform: translateX(0);
          }
          to {
            transform: translateX(50%);
          }
        }

        .btn-primary.append {
          background: #4CAF50;
        }

        .btn-primary.append:hover {
          background: #388E3C;
        }

        .tag-list {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin-top: 8px;
        }

        .tag {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 4px 8px;
          background: #e3f2fd;
          border-radius: 4px;
          font-size: 13px;
          color: #1565c0;
          transition: all 0.2s;
        }

        .tag:hover {
          background: #bbdefb;
        }

        .tag .remove {
          cursor: pointer;
          font-size: 14px;
          width: 16px;
          height: 16px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border-radius: 50%;
          margin-left: 4px;
          transition: all 0.2s;
        }

        .tag .remove:hover {
          background: rgba(0, 0, 0, 0.1);
        }

        #tagInput {
          width: 100%;
          padding: 8px 12px;
          border: 1px solid #e0e0e0;
          border-radius: 6px;
          font-size: 14px;
          transition: all 0.2s;
        }

        #tagInput:focus {
          border-color: #2196F3;
          box-shadow: 0 0 0 2px rgba(33, 150, 243, 0.1);
          outline: none;
        }

        .btn-primary.copy {
          background: #607D8B;
        }

        .btn-primary.copy:hover {
          background: #455A64;
        }

        .btn-primary.copy.success {
          background: #4CAF50;
        }

        .copy-success-animation {
          animation: copySuccess 0.5s ease;
        }

        @keyframes copySuccess {
          0% {
            transform: scale(1);
          }
          50% {
            transform: scale(1.1);
          }
          100% {
            transform: scale(1);
          }
        }
      `;

      document.head.appendChild(style);
      document.body.appendChild(dialogContainer);

      // 修改标签输入相关代码
      const tagInput = dialogContainer.querySelector('#tagInput');
      const tagList = dialogContainer.querySelector('.tag-list');
      const tags = new Set();

      // 添加标签的函数
      function addTag(value) {
        if (value && !tags.has(value)) {
          tags.add(value);
          
          // 更新文本框中的标签
          const textContent = document.querySelector('#textContent');
          const lines = textContent.value.split('\n');
          const sourceLineIndex = lines.findIndex(line => line.includes('🔗 来源：'));
          const tagLineIndex = lines.findIndex(line => line.includes('🏷️ 标签：'));
          
          if (tagLineIndex !== -1) {
            // 更新现有标签
            const currentTags = Array.from(tags).join(', ');
            lines[tagLineIndex] = `> 🏷️ 标签：${currentTags}`;
          } else if (sourceLineIndex !== -1) {
            // 在来源行后插入标签
            lines.splice(sourceLineIndex + 1, 0, `> 🏷️ 标签：${value}`);
          }
          
          textContent.value = lines.join('\n');
          
          // 添加标签元素
          const tagElement = document.createElement('span');
          tagElement.className = 'tag';
          tagElement.innerHTML = `
            ${value}
            <span class="remove">×</span>
          `;
          tagElement.querySelector('.remove').addEventListener('click', () => {
            tags.delete(value);
            tagElement.remove();
            updateTextContentTags();
          });
          tagList.appendChild(tagElement);
        }
        tagInput.value = '';
      }

      // 更新文本内容中的标签
      function updateTextContentTags() {
        const textContent = document.querySelector('#textContent');
        const lines = textContent.value.split('\n');
        const tagLineIndex = lines.findIndex(line => line.includes('🏷️ 标签：'));
        
        if (tags.size > 0) {
          const currentTags = Array.from(tags).join(', ');
          if (tagLineIndex !== -1) {
            lines[tagLineIndex] = `> 🏷️ 标签：${currentTags}`;
          } else {
            const sourceLineIndex = lines.findIndex(line => line.includes('🔗 来源：'));
            if (sourceLineIndex !== -1) {
              lines.splice(sourceLineIndex + 1, 0, `> 🏷️ 标签：${currentTags}`);
            }
          }
        }
        
        textContent.value = lines.join('\n');
      }

      // 确保元素存在后再添加事件监听
      if (tagInput && tagList) {
        // 监听回车键
        tagInput.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            const value = tagInput.value.trim();
            addTag(value);
          }
        });

        // 监听失去焦点事件
        tagInput.addEventListener('blur', () => {
          const value = tagInput.value.trim();
          if (value) {
            addTag(value);
          }
        });
      }

      // 处理 ESC 键
      function handleEscape(e) {
        if (e.key === 'Escape') {
          try {
            if (!isExtensionValid()) {
              // 如果扩展失效，只进行基本的清理
              const dialog = document.querySelector('.save-dialog')?.parentElement;
              if (dialog) {
                dialog.remove();
              }
              return;
            }
            
            if (document.body.contains(dialogContainer)) {
              document.body.removeChild(dialogContainer);
              document.removeEventListener('keydown', handleEscape);
              showNotification('cancel', 'info');
            }
          } catch (error) {
            console.error('处理 ESC 键时出错:', error);
            // 确保对话框被移除
            const dialog = document.querySelector('.save-dialog')?.parentElement;
            if (dialog) {
              dialog.remove();
            }
          }
        }
      }

      document.addEventListener('keydown', handleEscape);

      // 在对话框关闭时移除监听器
      const cleanup = () => {
        document.removeEventListener('keydown', handleEscape);
      };

      // 修改取消按钮事件
      const cancelBtn = dialogContainer.querySelector('#cancelBtn');
      cancelBtn.addEventListener('click', () => {
        if (document.body.contains(dialogContainer)) {
          document.body.removeChild(dialogContainer);
          cleanup();
          showNotification('cancel', 'info');
        }
      });

      // 修改背景点击事件
      dialogContainer.addEventListener('click', (e) => {
        if (e.target === dialogContainer) {
          document.body.removeChild(dialogContainer);
          cleanup();
        }
      });

      // 修改保存按钮事件
      const saveBtn = dialogContainer.querySelector('#saveBtn');
      const appendBtn = dialogContainer.querySelector('#appendBtn');

      // 一键收集：新建文件
      saveBtn.addEventListener('click', async () => {
        try {
          saveBtn.classList.add('loading');
          saveBtn.disabled = true;
          
          const contentToSave = await formatContentWithQuotes(
            timestamp,
            pageTitle,
            pageUrl,
            Array.from(tags),
            formattedContent
          );

          // 创建新文件
          let handle;
          try {
            handle = await window.showSaveFilePicker({
              suggestedName: `灵感收集_${timestamp}.md`,
              types: [{
                description: 'Markdown 文件',
                accept: {
                  'text/markdown': ['.md']
                }
              }]
            });
          } catch (error) {
            // 用户取消选择文件时,不显示错误
            if (error.name === 'AbortError') {
              saveBtn.classList.remove('loading');
              saveBtn.disabled = false;
              return;
            }
            throw error; // 其他错误则继续抛出
          }

          // 确保获得了文件句柄后再继续
          if (handle) {
            const writable = await handle.createWritable();
            await writable.write(contentToSave);
            await writable.close();

            // 保存成功后，移除弹窗
            if (document.body.contains(dialogContainer)) {
              document.body.removeChild(dialogContainer);
            }
            cleanup();
            showNotification('saveSuccess', 'success');
          }

        } catch (error) {
          console.error('保存失败:', error);
          showSaveError(saveBtn.querySelector('.btn-text'), saveBtn);
        } finally {
          saveBtn.classList.remove('loading');
          saveBtn.disabled = false;
        }
      });

      // 一键追加：选择现有文件并追加
      appendBtn.addEventListener('click', async () => {
        try {
          appendBtn.classList.add('loading');
          appendBtn.disabled = true;
          
          const contentToSave = await formatContentWithQuotes(
            timestamp,
            pageTitle,
            pageUrl,
            Array.from(tags),
            formattedContent
          );

          // 选择现有文件
          let handle;
          try {
            const handles = await window.showOpenFilePicker({
              multiple: false,
              types: [{
                description: 'Markdown 文件',
                accept: {
                  'text/markdown': ['.md']
                }
              }]
            });
            handle = handles[0];
          } catch (error) {
            // 用户取消选择文件时,不显示错误
            if (error.name === 'AbortError') {
              appendBtn.classList.remove('loading');
              appendBtn.disabled = false;
              return;
            }
            throw error; // 其他错误则继续抛出
          }

          // 确保获得了文件句柄后再继续
          if (handle) {
            const file = await handle.getFile();
            const existingContent = await file.text();
            
            // 创建可写流并追加内容
            const writable = await handle.createWritable();
            await writable.write(existingContent + contentToSave);
            await writable.close();

            // 保存成功后，移除弹窗
            if (document.body.contains(dialogContainer)) {
              document.body.removeChild(dialogContainer);
            }
            cleanup();
            showNotification('appendSuccess', 'success');
          }

        } catch (error) {
          console.error('追加失败:', error);
          showSaveError(appendBtn.querySelector('.btn-text'), appendBtn);
        } finally {
          appendBtn.classList.remove('loading');
          appendBtn.disabled = false;
        }
      });

      // 修改对话框中的复制按钮事件处理
      const dialogCopyBtn = dialogElement.querySelector('#copyBtn');
      dialogCopyBtn.addEventListener('click', async () => {
        try {
          dialogCopyBtn.disabled = true;
          const textContent = dialogElement.querySelector('#textContent');
          
          if (!textContent || !textContent.value) {
            throw new Error('没有可复制的内容');
          }
          
          // 使用新的复制功能
          await copyText(textContent.value);
          
          // 显示复制成功的动画效果
          dialogCopyBtn.classList.add('success');
          dialogCopyBtn.querySelector('.btn-text').textContent = translations.copySuccess;
          dialogCopyBtn.querySelector('.copy-icon').textContent = '✅';
          dialogCopyBtn.classList.add('copy-success-animation');
          
          // 短暂延迟后关闭对话框
          setTimeout(() => {
            if (document.body.contains(dialogContainer)) {
              document.body.removeChild(dialogContainer);
              cleanup();
              showNotification('copySuccess', 'success');
            }
          }, 800);
        } catch (error) {
          console.error('复制失败:', error);
          dialogCopyBtn.querySelector('.btn-text').textContent = translations.copyFail;
          dialogCopyBtn.style.background = '#f44336';
          
          setTimeout(() => {
            dialogCopyBtn.querySelector('.btn-text').textContent = translations.copyButton;
            dialogCopyBtn.style.background = '#607D8B';
            dialogCopyBtn.disabled = false;
          }, 2000);
        }
      });

    } catch (error) {
      console.error('创建对话框失败:', error);
      throw error;
    }
  }

  // 自动分类功能
  function categorizeContent(text) {
    const categories = {
      '技术': ['JavaScript', 'Python', 'API', '编程', '代码'],
      '新闻': ['新闻', '报道', '事件', '政策'],
      '生活': ['美食', '旅游', '健康', '生活'],
      '学习': ['教程', '学习', '知识', '课程']
    };

    for (const [category, keywords] of Object.entries(categories)) {
      if (keywords.some(keyword => text.toLowerCase().includes(keyword.toLowerCase()))) {
        return category;
      }
    }
    return '其他';
  }

  // 显示文件选择对话框
  function showFileDialog(mdFiles, callback) {
    const fileDialog = document.createElement('div');
    // ... 文件选择对话框的实现
  }

  // 显示通知
  function showNotification(messageKey, type = 'success') {
    try {
      // 添加参数检查
      if (!messageKey) {
        console.error('showNotification: messageKey 不能为空');
        return;
      }

      if (!isExtensionValid()) {
        console.warn('扩展上下文已失效，使用简单通知');
        const simpleNotification = document.createElement('div');
        simpleNotification.style.cssText = `
          position: fixed;
          top: 20px;
          right: 20px;
          padding: 10px 20px;
          background: ${type === 'success' ? '#4caf50' : '#f44336'};
          color: white;
          border-radius: 4px;
          z-index: 999999;
        `;
        
        const translatedMessage = getMessage(messageKey);
        simpleNotification.textContent = translatedMessage || messageKey;
        document.body.appendChild(simpleNotification);
        setTimeout(() => simpleNotification.remove(), 2000);
        return;
      }
      
      const notification = document.createElement('div');
      const translatedMessage = getMessage(messageKey);
      notification.innerHTML = `
        <div class="save-notification ${type}">
          ${translatedMessage || messageKey}
        </div>
      `;
      
      // 更新通知样式
      const style = document.createElement('style');
      style.textContent = `
        .save-notification {
          position: fixed;
          top: 50%;  /* 改为垂直居中 */
          left: 50%;
          transform: translate(-50%, -50%);  /* 修改变换以实现完全居中 */
          background: white;
          padding: 16px 32px;  /* 增加内边距 */
          border-radius: 12px;  /* 增加圆角 */
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);  /* 优化阴影 */
          z-index: 1000000;
          font-size: 15px;  /* 稍微增大字号 */
          opacity: 1;
          transition: all 0.5s cubic-bezier(0.4, 0, 0.2, 1);  /* 使用更平滑的过渡效果 */
          animation: notificationFadeIn 0.5s cubic-bezier(0.4, 0, 0.2, 1);
        }

        .save-notification.success {
          border-left: 4px solid #4caf50;
          color: #2e7d32;  /* 深绿色文字 */
        }

        .save-notification.info {
          border-left: 4px solid #2196F3;
          color: #1565c0;  /* 深蓝色文字 */
        }

        @keyframes notificationFadeIn {
          from {
            opacity: 0;
            transform: translate(-50%, calc(-50% - 20px));  /* 从上方滑入 */
            filter: blur(8px);  /* 添加模糊效果 */
          }
          to {
            opacity: 1;
            transform: translate(-50%, -50%);
            filter: blur(0);
          }
        }

        .save-notification.fade-out {
          opacity: 0;
          transform: translate(-50%, calc(-50% + 20px));  /* 向下淡出 */
          filter: blur(4px);
        }
      `;
      
      document.head.appendChild(style);
      document.body.appendChild(notification);
      
      // 使用 requestAnimationFrame 确保动画流畅
      requestAnimationFrame(() => {
        const notificationElement = notification.querySelector('.save-notification');
        
        // 设置淡出动画
        setTimeout(() => {
          notificationElement.classList.add('fade-out');
          
          // 等待动画完成后移除元素
          setTimeout(() => {
            if (document.body.contains(notification)) {
              notification.remove();
            }
          }, 500);  // 与过渡时间匹配
        }, 2000);  // 显示时间
      });
    } catch (error) {
      console.error('显示通知时出错:', error, {
        messageKey,
        type
      });
    }
  }

  // 显示保存错误
  async function showSaveError(btnTextSpan, saveBtn) {
    if (btnTextSpan) {
      btnTextSpan.textContent = await getMessage('saveFail');
    }
    saveBtn.style.background = '#f44336';
    
    setTimeout(async () => {
      if (btnTextSpan) {
        btnTextSpan.textContent = await getMessage('saveButton');
      }
      saveBtn.style.background = '#2196F3';
      saveBtn.disabled = false;
    }, 2000);
  }

  // 修改内容格式化函数
  async function formatContentWithQuotes(timestamp, pageTitle, pageUrl, tags, text) {
    const browserLang = navigator.language.toLowerCase().startsWith('zh') ? 'zh' : 'en';
    const translations = {
      zh: {
        collectionTime: '收集时间',
        source: '来源',
        tags: '标签'
      },
      en: {
        collectionTime: 'Collection Time',
        source: 'Source',
        tags: 'Tags'
      }
    };

    const separator = '\n\n' + '='.repeat(50) + '\n\n';
    const t = translations[browserLang];
    
    const contentHeader = 
      `> ${t.collectionTime}: ${timestamp}\n` +
      `> ${t.source}: [${pageTitle}](${pageUrl})\n` +
      (tags && tags.length > 0 ? `> ${t.tags}: ${tags.join(', ')}\n` : '') +
      '\n';
    
    return `${separator}${contentHeader}${text}`;
  }

  // 修改保存文件对话框函数
  async function showSaveFilePicker(options) {
    try {
      // 获取上次使用的路径
      const { lastSaveDirectory } = await chrome.storage.sync.get(['lastSaveDirectory']);

      const pickerOpts = {
        suggestedName: options.suggestedName,
        types: options.types
      };
      
      // 如果有上次使用的路径，尝试使用该目录
      if (lastSaveDirectory) {
        try {
          pickerOpts.startIn = lastSaveDirectory;
        } catch (error) {
          console.log('无法使用保存的目录，使用默认位置');
        }
      }

      const handle = await window.showSaveFilePicker(pickerOpts);
      
      // 保存最后使用的路径信息
      try {
        // 从文件句柄中提取目录路径
        const filePath = handle.name;
        const directoryPath = filePath.substring(0, filePath.lastIndexOf('/'));
        
        if (directoryPath) {
          await chrome.storage.sync.set({ 
            lastSaveDirectory: directoryPath 
          });
          console.log('已更新最后使用的目录:', directoryPath);
        }
      } catch (error) {
        console.log('保存路径信息失败:', error);
      }
      
      return handle;
    } catch (error) {
      if (error.name !== 'AbortError') {
        console.error('文件选择器错误:', error);
        throw error;
      }
    }
  }

  // 添加对话框更新函数
  async function updateDialogLanguage(dialog) {
    if (!dialog) return;
    
    try {
      const elements = dialog.querySelectorAll('[data-i18n]');
      for (const element of elements) {
        const key = element.getAttribute('data-i18n');
        const translation = await getMessage(key);
        element.textContent = translation;
      }
    } catch (error) {
      console.error('更新对话框语言失败:', error);
    }
  }

  // 修改工具栏相关函数，确保它们在全局作用域中定义

  // 创建工具栏
  function createToolbar() {
    // 移除现有工具栏
    const existingToolbar = document.querySelector('.cliptext-toolbar');
    if (existingToolbar) {
      existingToolbar.remove();
    }
    
    const toolbar = document.createElement('div');
    toolbar.className = 'cliptext-toolbar';
    
    // 使用扩展图标
    let iconUrl;
    try {
      iconUrl = chrome.runtime.getURL('icons/save_inspiration_32.png');
    } catch (error) {
      // 如果无法获取图标，使用默认图标
      iconUrl = '';
      console.warn('无法获取扩展图标:', error);
    }
    
    // 确保工具栏包含正确的按钮和文本
    toolbar.innerHTML = `
      <div class="toolbar-icon">
        <img src="${iconUrl}" alt="ClipText">
      </div>
      <div class="toolbar-divider"></div>
      <button class="toolbar-btn" id="cliptext-copy" title="${getMessage('copyButton')}">
        <span class="btn-icon">📋</span>
        <span class="btn-text" data-i18n="copyButton">${getMessage('copyButton')}</span>
      </button>
      <button class="toolbar-btn primary" id="cliptext-save" title="${getMessage('saveButton')}">
        <span class="btn-icon">✨</span>
        <span class="btn-text" data-i18n="saveButton">${getMessage('saveButton')}</span>
      </button>
    `;

    return toolbar;
  }

  // 设置工具栏按钮事件
  function setupToolbarButtons(toolbar) {
    if (!toolbar) return;
    
    const copyBtn = toolbar.querySelector('#cliptext-copy');
    const saveBtn = toolbar.querySelector('#cliptext-save');
    
    // 保存当前选中的文本，以便在点击按钮时使用
    const selection = window.getSelection();
    const selectedText = selection.toString().trim();
    
    // 如果没有选中文本，不设置事件
    if (!selectedText) {
      console.warn('设置工具栏按钮时没有选中文本');
      return;
    }
    
    if (copyBtn) {
      copyBtn.onclick = null; // 清除可能的旧事件
      copyBtn.addEventListener('click', async (e) => {
        try {
          // 阻止事件冒泡和默认行为，防止选择丢失
          e.stopPropagation();
          e.preventDefault();
          
          // 使用之前保存的文本，而不是重新获取
          if (!selectedText) {
            console.warn('没有选中文本');
            return;
          }
          
          // 使用优化后的复制功能
          await copyText(selectedText);
          
          hideToolbar();
          showNotification('copySuccess', 'success');
        } catch (error) {
          console.error('复制失败:', error);
          showNotification('copyFail', 'error');
        }
      });
    }
    
    if (saveBtn) {
      saveBtn.onclick = null; // 清除可能的旧事件
      saveBtn.addEventListener('click', (e) => {
        try {
          // 阻止事件冒泡和默认行为，防止选择丢失
          e.stopPropagation();
          e.preventDefault();
          
          // 使用之前保存的文本，而不是重新获取
          if (!selectedText) {
            console.warn('没有选中文本');
            return;
          }
          
          // 确保传递正确的参数
          createSaveDialog(selectedText);
          hideToolbar();
        } catch (error) {
          console.error('保存对话框创建失败:', error);
        }
      });
    }
    
    // 防止工具栏上的点击事件导致文本选择丢失
    toolbar.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
    });
  }

  // 显示工具栏
  function showToolbar(x, y, selectedText) {
    try {
      // 确保样式已添加
      if (!document.getElementById('cliptext-toolbar-style')) {
        const toolbarStyle = document.createElement('style');
        toolbarStyle.id = 'cliptext-toolbar-style';
        toolbarStyle.textContent = `
          .cliptext-toolbar {
            position: fixed;
            background: #242424;
            border-radius: 10px;
            box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2), 0 0 0 1px rgba(255, 255, 255, 0.05);
            padding: 6px 8px;
            display: flex;
            align-items: center;
            gap: 4px;
            z-index: 9999999; /* 增加z-index确保在最上层 */
            opacity: 0;
            visibility: hidden;
            transform: translateY(8px) scale(0.98);
            transition: all 0.2s cubic-bezier(0.3, 0, 0.2, 1);
            min-height: 40px;
            pointer-events: auto !important; /* 确保可点击 */
          }

          .cliptext-toolbar.show {
            opacity: 1 !important;
            visibility: visible !important;
            transform: translateY(0) scale(1);
          }

          .cliptext-toolbar .toolbar-icon {
            width: 20px;
            height: 20px;
            padding: 4px;
            border-radius: 6px;
            background: rgba(255, 255, 255, 0.1);
            display: flex;
            align-items: center;
            justify-content: center;
          }

          .cliptext-toolbar .toolbar-icon img {
            width: 16px;
            height: 16px;
            filter: brightness(0) invert(1);
          }

          .cliptext-toolbar .toolbar-divider {
            width: 1px;
            height: 24px;
            background: rgba(255, 255, 255, 0.1);
            margin: 0 4px;
          }

          .cliptext-toolbar .toolbar-btn {
            padding: 6px 12px;
            border: none;
            border-radius: 8px;
            font-size: 13px;
            font-weight: 500;
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 6px;
            color: rgba(255, 255, 255, 0.9);
            background: transparent;
            transition: all 0.2s;
            white-space: nowrap;
            height: 32px;
            min-width: 32px;
            user-select: none;
          }

          .cliptext-toolbar .toolbar-btn:hover {
            background: rgba(255, 255, 255, 0.1);
            color: #fff;
          }

          .cliptext-toolbar .toolbar-btn:active {
            transform: scale(0.96);
          }

          .cliptext-toolbar .toolbar-btn.primary {
            background: #2196F3;
            color: white;
          }

          .cliptext-toolbar .toolbar-btn.primary:hover {
            background: #1E88E5;
          }

          .cliptext-toolbar .btn-icon {
            font-size: 16px;
            opacity: 0.9;
            display: flex;
            align-items: center;
            justify-content: center;
          }

          @media (prefers-color-scheme: light) {
            .cliptext-toolbar {
              background: #ffffff;
              box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1), 0 0 0 1px rgba(0, 0, 0, 0.05);
            }

            .cliptext-toolbar .toolbar-icon {
              background: rgba(0, 0, 0, 0.05);
            }

            .cliptext-toolbar .toolbar-icon img {
              filter: none;
            }

            .cliptext-toolbar .toolbar-divider {
              background: rgba(0, 0, 0, 0.1);
            }

            .cliptext-toolbar .toolbar-btn {
              color: rgba(0, 0, 0, 0.8);
            }

            .cliptext-toolbar .toolbar-btn:hover {
              background: rgba(0, 0, 0, 0.05);
              color: rgba(0, 0, 0, 0.9);
            }
          }
        `;
        document.head.appendChild(toolbarStyle);
      }

      // 清除可能存在的隐藏定时器
      if (state.toolbarTimeout) {
        clearTimeout(state.toolbarTimeout);
        state.toolbarTimeout = null;
      }

      if (!state.toolbar) {
        state.toolbar = createToolbar();
      }

      const toolbar = state.toolbar;
      
      // 存储选中文本和位置信息
      toolbar.dataset.selectedText = selectedText || '';
      toolbar.dataset.originalY = y;
      toolbar.dataset.scrollY = window.scrollY;
      
      // 确保工具栏已添加到DOM
      if (!document.body.contains(toolbar)) {
        document.body.appendChild(toolbar);
      }
      
      // 重置任何可能的隐藏样式
      toolbar.style.display = 'flex';
      toolbar.style.opacity = '0';
      toolbar.style.visibility = 'hidden';
      toolbar.style.zIndex = '9999999';
      
      // 强制重新计算布局
      const rect = toolbar.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      
      // 计算位置，确保不超出视口
      let posX = Math.min(Math.max(10, x - rect.width / 2), viewportWidth - rect.width - 10);
      let posY = y + 10; // 默认在选区下方

      // 如果底部空间不足，显示在选区上方
      if (posY + rect.height + 10 > viewportHeight) {
        posY = Math.max(10, y - rect.height - 20);
      }

      // 设置位置
      toolbar.style.left = `${posX}px`;
      toolbar.style.top = `${posY}px`;
      
      // 确保工具栏可见
      requestAnimationFrame(() => {
        toolbar.classList.add('show');
        console.log('工具栏已显示', {x, y, posX, posY});
      });

      // 绑定按钮事件
      setupToolbarButtons(toolbar);
      
      // 添加滚动事件监听
      window.removeEventListener('scroll', handleToolbarScroll);
      window.addEventListener('scroll', handleToolbarScroll);
    } catch (error) {
      console.error('显示工具栏失败:', error);
    }
  }

  // 处理滚动事件，更新工具栏位置或隐藏工具栏
  function handleToolbarScroll() {
    if (!state.toolbar || !document.body.contains(state.toolbar)) {
      window.removeEventListener('scroll', handleToolbarScroll);
      return;
    }
    
    try {
      const toolbar = state.toolbar;
      const originalY = parseFloat(toolbar.dataset.originalY || 0);
      const initialScrollY = parseFloat(toolbar.dataset.scrollY || 0);
      
      // 计算选区在文档中的绝对位置
      const absoluteY = originalY + initialScrollY;
      
      // 计算选区当前在视口中的位置
      const currentY = absoluteY - window.scrollY;
      
      // 检查选区是否在视口内
      if (currentY < -100 || currentY > window.innerHeight + 100) {
        // 选区不在视口内，隐藏工具栏
        hideToolbar();
        return;
      }
      
      // 选区在视口内，更新工具栏位置
      const rect = toolbar.getBoundingClientRect();
      let posY = currentY + 10; // 默认在选区下方
      
      // 如果底部空间不足，显示在选区上方
      if (posY + rect.height + 10 > window.innerHeight) {
        posY = Math.max(10, currentY - rect.height - 20);
      }
      
      // 更新位置
      toolbar.style.top = `${posY}px`;
    } catch (error) {
      console.error('更新工具栏位置失败:', error);
    }
  }

  // 修改 hideToolbar 函数，移除滚动监听器
  function hideToolbar() {
    if (state.toolbar) {
      // 清除可能存在的隐藏定时器
      if (state.toolbarTimeout) {
        clearTimeout(state.toolbarTimeout);
      }
      
      // 移除滚动监听器
      window.removeEventListener('scroll', handleToolbarScroll);
      
      state.toolbar.classList.remove('show');
      
      // 延迟移除DOM，以便动画完成
      state.toolbarTimeout = setTimeout(() => {
        if (state.toolbar && document.body.contains(state.toolbar)) {
          document.body.removeChild(state.toolbar);
        }
        state.toolbar = null;
        state.toolbarTimeout = null;
      }, 300);
    }
  }

  // 处理鼠标按下事件
  function handleMouseDown(e) {
    // 如果点击的不是工具栏内部，则隐藏工具栏
    if (state.toolbar && !e.target.closest('.cliptext-toolbar') && !e.target.closest('.save-dialog')) {
      // 检查是否仍有文本被选中
      const selection = window.getSelection();
      const text = selection.toString().trim();
      
      // 只有当没有文本被选中时才隐藏工具栏
      if (!text || text.length === 0) {
        hideToolbar();
      }
    }
  }

  // 处理鼠标抬起事件
  function handleMouseUp(e) {
    // 如果点击的是工具栏或对话框内部，不处理
    if (e.target.closest('.cliptext-toolbar') || e.target.closest('.save-dialog')) {
      console.log('点击了工具栏或对话框，不处理');
      return;
    }
    
    // 清除可能存在的隐藏定时器，防止工具栏被意外隐藏
    if (state.toolbarTimeout) {
      clearTimeout(state.toolbarTimeout);
      state.toolbarTimeout = null;
    }
    
    // 延迟处理，确保选择已完成
    setTimeout(() => {
      try {
        const selection = window.getSelection();
        const text = selection.toString().trim();
        
        console.log('选中文本:', text ? (text.length > 50 ? text.substring(0, 50) + '...' : text) : '无');
        
        // 只有当有文本被选中时才显示工具栏
        if (text && text.length > 0) {
          const range = selection.getRangeAt(0);
          const rect = range.getBoundingClientRect();
          
          console.log('选区位置:', {
            left: rect.left,
            right: rect.right,
            top: rect.top,
            bottom: rect.bottom,
            width: rect.width,
            height: rect.height
          });
          
          // 确保有效的位置
          if (rect.width > 0 && rect.height > 0) {
            // 移除可能存在的旧工具栏
            if (state.toolbar) {
              hideToolbar();
            }
            
            // 显示新工具栏，并传递选中的文本
            showToolbar(
              rect.left + (rect.width / 2),
              rect.bottom,
              text
            );
          } else {
            console.warn('选区尺寸无效，无法显示工具栏');
          }
        } else {
          // 如果没有选中文本，隐藏工具栏
          if (state.toolbar) {
            hideToolbar();
          }
        }
      } catch (error) {
        console.error('处理选择文本失败:', error);
      }
    }, 50); // 增加延迟时间，确保选择完成
  }

  // 设置选择监听器
  function setupSelectionListener() {
    // 移除现有的监听器，避免重复
    document.removeEventListener('mouseup', handleMouseUp);
    document.removeEventListener('mousedown', handleMouseDown);
    
    // 添加新的监听器
    document.addEventListener('mouseup', handleMouseUp);
    document.addEventListener('mousedown', handleMouseDown);
    
    console.log('已设置文本选择监听器');
  }

  // 添加全局点击事件监听，处理工具栏的隐藏
  function setupGlobalClickListener() {
    document.addEventListener('click', (e) => {
      // 如果点击的不是工具栏、不是选中的文本区域，且工具栏存在，则隐藏工具栏
      if (state.toolbar && !e.target.closest('.cliptext-toolbar') && !e.target.closest('.save-dialog')) {
        const selection = window.getSelection();
        
        // 检查点击是否在选中区域内
        if (selection.rangeCount > 0) {
          const range = selection.getRangeAt(0);
          const rect = range.getBoundingClientRect();
          
          // 如果点击不在选中区域内，隐藏工具栏
          if (
            e.clientX < rect.left || 
            e.clientX > rect.right || 
            e.clientY < rect.top || 
            e.clientY > rect.bottom
          ) {
            hideToolbar();
          }
        } else {
          // 如果没有选中区域，隐藏工具栏
          hideToolbar();
        }
      }
    });
  }

  // 修改初始化函数，确保正确的初始化顺序
  function initializeContentScript() {
    console.log('===== 初始化内容脚本 =====');
    
    // 首先启用文本选择
    enableTextSelection();
    
    // 设置MutationObserver来处理动态内容
    const observer = new MutationObserver((mutations) => {
      let needsUpdate = false;
      
      for (const mutation of mutations) {
        if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
          // 检查是否添加了可能包含限制的元素
          for (const node of mutation.addedNodes) {
            if (node.nodeType === Node.ELEMENT_NODE) {
              const el = node;
              
              // 检查是否有复制限制
              if (
                el.style && (
                  el.style.userSelect === 'none' || 
                  el.hasAttribute('unselectable') ||
                  el.hasAttribute('onselectstart')
                )
              ) {
                needsUpdate = true;
                break;
              }
              
              // 检查子元素
              if (el.querySelector) {
                const restrictedChild = el.querySelector('[unselectable], [onselectstart], [style*="user-select: none"]');
                if (restrictedChild) {
                  needsUpdate = true;
                  break;
                }
              }
            }
          }
        }
      }
      
      // 只在需要时更新
      if (needsUpdate) {
        // 重置标记，以便重新应用限制移除
        restrictionsRemoved = false;
        enableTextSelection();
      }
    });
    
    // 安全地观察DOM变化
    function setupObserver() {
      if (document.body) {
        observer.observe(document.body, {
          childList: true,
          subtree: true,
          attributes: true,
          attributeFilter: ['style', 'unselectable', 'onselectstart', 'contenteditable']
        });
        console.log('MutationObserver 已设置');
      } else {
        // 如果 body 尚不存在，等待 DOM 加载
        console.log('等待 document.body 加载...');
        window.addEventListener('DOMContentLoaded', () => {
          if (document.body) {
            observer.observe(document.body, {
              childList: true,
              subtree: true,
              attributes: true,
              attributeFilter: ['style', 'unselectable', 'onselectstart', 'contenteditable']
            });
            console.log('MutationObserver 已延迟设置');
          } else {
            console.error('无法找到 document.body');
          }
        });
      }
    }
    
    // 设置选择监听器
    setupSelectionListener();
    
    // 添加全局点击事件监听
    setupGlobalClickListener();
    
    // 页面卸载时清理
    window.addEventListener('unload', () => {
      observer.disconnect();
      console.log('Content script 清理');
    });
  }
}

// 在页面加载完成后执行初始化
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeContentScript);
} else {
  initializeContentScript();
}