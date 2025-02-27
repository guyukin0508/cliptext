document.addEventListener('DOMContentLoaded', async () => {
  // 工具函数
  const getMessage = (key) => {
    const browserLang = navigator.language.toLowerCase().startsWith('zh') ? 'zh' : 'en';
    return TRANSLATIONS[browserLang][key] || key;
  };

  // 状态管理
  const state = {
    lastSaveDirectory: null
  };

  // 语言映射表
  const TRANSLATIONS = {
    zh: {
      appName: 'ClipText',
      appDesc: '一键收集网页内容，让灵感永不溜走',
      supportDev: '支持开发者',
      viewDocs: '使用文档',
      reportIssue: '反馈问题',
      supportDevTitle: '支持开发者',
      supportDevAria: '打开支持开发者对话框'
    },
    en: {
      appName: 'ClipText',
      appDesc: 'Save web content with one click',
      supportDev: 'Support',
      viewDocs: 'Docs',
      reportIssue: 'Issues',
      supportDevTitle: 'Support developer',
      supportDevAria: 'Open support developer dialog'
    }
  };

  // UI更新函数
  const UI = {
    updateLanguage: (lang) => {
      const translations = TRANSLATIONS[lang] || TRANSLATIONS['en'];
      
      // 更新HTML语言
      document.documentElement.lang = lang;
      
      // 更新标题
      document.title = translations.appName;
      
      // 更新所有带data-i18n属性的元素
      document.querySelectorAll('[data-i18n]').forEach(element => {
        const key = element.getAttribute('data-i18n');
        element.textContent = translations[key] || key;
      });
      
      // 更新所有aria标签
      document.querySelectorAll('[data-i18n-aria]').forEach(element => {
        const key = element.getAttribute('data-i18n-aria');
        element.setAttribute('aria-label', translations[key] || key);
      });
      
      // 更新所有title属性
      document.querySelectorAll('[data-i18n-title]').forEach(element => {
        const key = element.getAttribute('data-i18n-title');
        element.title = translations[key] || key;
      });
    }
  };

  // 初始化
  const initialize = async () => {
    try {
      // 获取浏览器语言
      const browserLang = navigator.language.toLowerCase().startsWith('zh') ? 'zh' : 'en';
      
      // 更新界面语言
      UI.updateLanguage(browserLang);
      
      // 加载上次保存目录
      const { lastSaveDirectory } = await chrome.storage.sync.get(['lastSaveDirectory']);
      state.lastSaveDirectory = lastSaveDirectory;

    } catch (error) {
      console.error('初始化失败:', error);
    }
  };

  // 事件处理
  document.getElementById('donateBtn').addEventListener('click', () => {
    // 打开捐赠页面
    chrome.windows.create({
      url: chrome.runtime.getURL('donate.html'),
      type: 'popup',
      width: 680,  // 调整宽度以适应内容
      height: 520,  // 调整高度以适应内容
      left: Math.round((screen.width - 680) / 2),  // 居中显示
      top: Math.round((screen.height - 520) / 2),
      focused: true
    });
  });

  // 初始化应用
  await initialize();
}); 